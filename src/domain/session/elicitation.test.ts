import { describe, expect, it } from 'vitest'

import {
  ELICITATION_MAX_PENDING,
  isElicitationAction,
  isElicitationContent,
  decodeElicitationPrompt,
  matchesElicitationSchema,
  SUPPORTED_DIALOG_KINDS,
  toElicitationPrompt,
  type ElicitationField
} from './elicitation'

const ID = '11111111-1111-4111-8111-111111111111'

function form(properties: Record<string, unknown>, required?: string[]): Record<string, unknown> {
  return {
    serverName: 'github',
    message: '入力してください',
    mode: 'form',
    requestedSchema: { type: 'object', properties, ...(required ? { required } : {}) }
  }
}

describe('toElicitationPrompt: 要求の写し (data-model §2)', () => {
  it('サーバー名・title・message・mode を写し、elicitationId を運ばない', () => {
    const prompt = toElicitationPrompt(
      {
        serverName: 'github',
        title: 'T',
        message: 'M',
        elicitationId: 'ELICIT-LEAK',
        requestedSchema: { type: 'object', properties: { a: { type: 'string' } } }
      },
      ID
    )
    expect(prompt).toMatchObject({ requestId: ID, serverName: 'github', title: 'T', message: 'M' })
    expect(prompt.mode).toBe('form')
    expect(JSON.stringify(prompt)).not.toContain('ELICIT-LEAK')
    expect(Object.keys(prompt).sort()).toEqual(
      ['fields', 'message', 'mode', 'requestId', 'serverName', 'title', 'url'].sort()
    )
  })

  it('サーバー名が形に外れると空、title は無ければ displayName', () => {
    expect(toElicitationPrompt({ serverName: 'a b', message: '' }, ID).serverName).toBe('')
    expect(toElicitationPrompt({ serverName: '__proto__ x', message: '' }, ID).serverName).toBe('')
    expect(toElicitationPrompt({ serverName: 's', displayName: 'D', message: '' }, ID).title).toBe(
      'D'
    )
  })

  it('message は伏せ字・2,000 コードポイント・description の代わり', () => {
    const secret = `token sk-ant-api03-${'a'.repeat(40)}`
    const redacted = toElicitationPrompt({ serverName: 's', message: secret }, ID).message
    expect(redacted).not.toContain('a'.repeat(40))
    expect(toElicitationPrompt({ serverName: 's', message: 'あ'.repeat(2500) }, ID).message).toBe(
      'あ'.repeat(2000)
    )
    expect(
      toElicitationPrompt({ serverName: 's', message: '', description: 'DESC' }, ID).message
    ).toBe('DESC')
  })

  it('mode は url 以外なら form', () => {
    expect(toElicitationPrompt({ serverName: 's', mode: 'x', message: '' }, ID).mode).toBe('form')
    expect(toElicitationPrompt({ serverName: 's', message: '' }, ID).mode).toBe('form')
  })

  it('URL: http / https だけ開ける。それ以外・長すぎ・解釈できないは openUrl が null', () => {
    const url = (u: unknown): ReturnType<typeof toElicitationPrompt>['url'] =>
      toElicitationPrompt({ serverName: 's', message: '', mode: 'url', url: u }, ID).url
    expect(url('https://example.com/auth?x=1')).toEqual({
      openUrl: 'https://example.com/auth?x=1',
      displayUrl: 'https://example.com/auth?x=1',
      host: 'example.com'
    })
    expect(url('http://example.com/')?.openUrl).toBe('http://example.com/')
    for (const bad of [
      'javascript:alert(1)',
      'file:///etc/passwd',
      `https://example.com/${'a'.repeat(2100)}`,
      'not a url',
      undefined
    ]) {
      expect(url(bad)?.openUrl).toBeNull()
      expect(url(bad)?.host).toBe('')
    }
  })

  it('URL: 表示は userinfo とクエリの秘密を伏せ、開く URL は伏せない', () => {
    const raw = 'https://user:PASSW0RD@example.com/cb?access_token=SECRETVALUE123456'
    const url = toElicitationPrompt({ serverName: 's', message: '', mode: 'url', url: raw }, ID).url
    expect(url?.openUrl).toBe(raw)
    expect(url?.displayUrl).not.toContain('PASSW0RD')
    expect(url?.displayUrl).not.toContain('SECRETVALUE123456')
  })

  it('url モードでは fields が null、form モードでは url が null', () => {
    const u = toElicitationPrompt({ serverName: 's', message: '', mode: 'url', url: 'https://a.b' }, ID)
    expect(u.fields).toBeNull()
    expect(toElicitationPrompt(form({ a: { type: 'string' } }), ID).url).toBeNull()
  })
})

describe('toElicitationPrompt: スキーマの部分集合', () => {
  const fieldsOf = (
    properties: Record<string, unknown>,
    required?: string[]
  ): ReturnType<typeof toElicitationPrompt>['fields'] =>
    toElicitationPrompt(form(properties, required), ID).fields

  it('4 種類の正例を写す', () => {
    const fields = fieldsOf(
      {
        name: {
          type: 'string',
          title: '名前',
          description: '説明',
          minLength: 1,
          maxLength: 5000,
          format: 'email',
          default: 'x'
        },
        n: { type: 'number', minimum: 0, maximum: 10, default: 3 },
        i: { type: 'integer' },
        ok: { type: 'boolean', default: true },
        color: { type: 'string', enum: ['r', 'g'], enumNames: ['赤', '緑'], default: 'g' },
        size: { type: 'string', oneOf: [{ const: 's', title: '小' }, { const: 'l' }] }
      },
      ['name']
    )
    expect(fields).toEqual([
      {
        key: 'name',
        label: '名前',
        description: '説明',
        required: true,
        type: 'string',
        minLength: 1,
        maxLength: 1000,
        format: 'email',
        default: 'x'
      },
      { key: 'n', label: 'n', description: '', required: false, type: 'number', minimum: 0, maximum: 10, default: 3 },
      { key: 'i', label: 'i', description: '', required: false, type: 'integer' },
      { key: 'ok', label: 'ok', description: '', required: false, type: 'boolean', default: true },
      {
        key: 'color',
        label: 'color',
        description: '',
        required: false,
        type: 'enum',
        options: [
          { value: 'r', label: '赤' },
          { value: 'g', label: '緑' }
        ],
        default: 'g'
      },
      {
        key: 'size',
        label: 'size',
        description: '',
        required: false,
        type: 'enum',
        options: [
          { value: 's', label: '小' },
          { value: 'l', label: 'l' }
        ]
      }
    ])
  })

  it('部分集合の外は fields が null', () => {
    const cases: Record<string, unknown>[] = [
      { a: { type: 'object', properties: {} } },
      { a: { type: 'array', items: { type: 'string' } } },
      { a: { type: 'string', enum: [] } },
      { a: { type: 'string', enum: Array.from({ length: 51 }, (_, i) => `v${i}`) } },
      { 'bad key!': { type: 'string' } },
      { [`k${'x'.repeat(70)}`]: { type: 'string' } },
      {}
    ]
    for (const properties of cases) expect(fieldsOf(properties)).toBeNull()
    const many = Object.fromEntries(Array.from({ length: 33 }, (_, i) => [`k${i}`, { type: 'string' }]))
    expect(fieldsOf(many)).toBeNull()
    expect(
      toElicitationPrompt({ serverName: 's', message: '', requestedSchema: { type: 'array' } }, ID).fields
    ).toBeNull()
  })

  it('__proto__ / constructor の項目名は部分集合の外', () => {
    const proto = JSON.parse('{"__proto__": {"type": "string"}}') as Record<string, unknown>
    expect(fieldsOf(proto)).toBeNull()
    expect(fieldsOf({ constructor: { type: 'string' } })).toBeNull()
  })

  it('minLength の丸めと不正な値の無視', () => {
    const [f] = fieldsOf({ a: { type: 'string', minLength: 99999, maxLength: -1 } }) ?? []
    expect(f).toMatchObject({ minLength: 1000 })
    expect(f).not.toHaveProperty('maxLength')
  })
})

describe('matchesElicitationSchema', () => {
  const fields: ElicitationField[] = [
    { key: 's', label: 's', description: '', required: true, type: 'string', minLength: 2, maxLength: 4 },
    { key: 'i', label: 'i', description: '', required: false, type: 'integer', minimum: 1, maximum: 9 },
    { key: 'b', label: 'b', description: '', required: false, type: 'boolean' },
    {
      key: 'e',
      label: 'e',
      description: '',
      required: false,
      type: 'enum',
      options: [{ value: 'x', label: 'X' }]
    }
  ]

  it('正例', () => {
    expect(matchesElicitationSchema(fields, { s: 'abc' })).toBe(true)
    expect(matchesElicitationSchema(fields, { s: 'ab', i: 3, b: false, e: 'x' })).toBe(true)
  })

  it('全部が任意の項目には {} と content なしが通る', () => {
    const optional: ElicitationField[] = [
      { key: 'o', label: 'o', description: '', required: false, type: 'string' }
    ]
    expect(matchesElicitationSchema(optional, {})).toBe(true)
    expect(matchesElicitationSchema(optional, undefined)).toBe(true)
    expect(matchesElicitationSchema(optional, { o: 'x' })).toBe(true)
  })

  it('負例', () => {
    expect(matchesElicitationSchema(null, {})).toBe(false)
    expect(matchesElicitationSchema(fields, {})).toBe(false) // 必須の欠け
    expect(matchesElicitationSchema(fields, undefined)).toBe(false)
    expect(matchesElicitationSchema(fields, { s: 'ab', extra: 1 })).toBe(false)
    expect(matchesElicitationSchema(fields, { s: 'a' })).toBe(false) // minLength
    expect(matchesElicitationSchema(fields, { s: 'abcde' })).toBe(false) // maxLength
    expect(matchesElicitationSchema(fields, { s: 'ab', i: 1.5 })).toBe(false)
    expect(matchesElicitationSchema(fields, { s: 'ab', i: 10 })).toBe(false)
    expect(matchesElicitationSchema(fields, { s: 'ab', i: 0 })).toBe(false)
    expect(matchesElicitationSchema(fields, { s: 'ab', e: 'y' })).toBe(false)
    expect(matchesElicitationSchema(fields, { s: 'ab', b: 'true' as unknown as boolean })).toBe(false)
    const required: ElicitationField[] = [
      { key: 'r', label: 'r', description: '', required: true, type: 'string' }
    ]
    expect(matchesElicitationSchema(required, { r: '   ' })).toBe(false)
  })
})

describe('isElicitationAction / isElicitationContent', () => {
  it('action の正例と負例', () => {
    for (const a of ['accept', 'decline', 'cancel']) expect(isElicitationAction(a)).toBe(true)
    for (const a of ['Accept', '', 1, null, undefined]) expect(isElicitationAction(a)).toBe(false)
  })

  it('content の正例', () => {
    expect(isElicitationContent({})).toBe(true)
    expect(isElicitationContent({ a: 'x', b: 1, c: false, d: '' })).toBe(true)
    const keys32 = Object.fromEntries(Array.from({ length: 32 }, (_, i) => [`k${i}`, i]))
    expect(isElicitationContent(keys32)).toBe(true)
    expect(isElicitationContent(Object.assign(Object.create(null) as object, { a: 1 }))).toBe(true)
  })

  it('content の負例', () => {
    const keys33 = Object.fromEntries(Array.from({ length: 33 }, (_, i) => [`k${i}`, i]))
    class Foo {
      a = 1
    }
    const bad: unknown[] = [
      keys33,
      JSON.parse('{"__proto__": 1}'),
      { constructor: 1 },
      { prototype: 'x' },
      new Foo(),
      [],
      null,
      'str',
      { a: {} },
      { a: [1] },
      { a: Number.NaN },
      { a: Number.POSITIVE_INFINITY },
      { a: null },
      { a: 'x'.repeat(1001) },
      { 'bad key': 1 },
      { '': 1 }
    ]
    for (const v of bad) expect(isElicitationContent(v)).toBe(false)
    expect(isElicitationContent({ a: 'あ'.repeat(1000) })).toBe(true)
  })
})

describe('pin', () => {
  it('待ちの上限は 4、宣言する dialog の種類は空', () => {
    expect(ELICITATION_MAX_PENDING).toBe(4)
    expect(SUPPORTED_DIALOG_KINDS).toHaveLength(0)
  })
})

describe('decodeElicitationPrompt', () => {
  const REQ = '11111111-1111-4111-8111-111111111111'
  const base = {
    requestId: REQ,
    serverName: 'github',
    title: 't',
    message: 'm',
    mode: 'form',
    url: null,
    fields: null
  }

  it('正例は検証を通した値で組み直す (余分なキーを運ばない)', () => {
    expect(decodeElicitationPrompt({ ...base, extra: 'x' })).toEqual(base)
  })

  it.each([
    ['null', null],
    ['UUID でない requestId', { ...base, requestId: 'x' }],
    ['形の外のサーバー名', { ...base, serverName: 'a b' }],
    ['長すぎる message', { ...base, message: 'x'.repeat(2001) }],
    ['未知の mode', { ...base, mode: 'x' }],
    ['form に url', { ...base, url: { openUrl: null, displayUrl: '', host: '' } }],
    ['fields が配列でない', { ...base, fields: {} }],
    ['fields が空', { ...base, fields: [] }],
    ['url なのに url が無い', { ...base, mode: 'url' }],
    [
      'http でない openUrl',
      { ...base, mode: 'url', url: { openUrl: 'file:///x', displayUrl: '', host: '' } }
    ],
    ['未知の項目の種類', { ...base, fields: [{ key: 'a', label: 'a', description: '', required: false, type: 'x' }] }]
  ])('%s は null', (_name, value) => {
    expect(decodeElicitationPrompt(value)).toBeNull()
  })
})
