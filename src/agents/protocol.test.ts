import { describe, expect, it } from 'vitest'

import { MAX_SESSION_OFFSET, MAX_SESSIONS_PER_TARGET } from '@domain/validation'

import {
  PROTOCOL_VERSION,
  createLineAssembler,
  decodeRequest,
  decodeResponse,
  encodeRequest,
  encodeResponse,
  errorResponse,
  okResponse
} from './protocol'

/** BE-024 — 親子間のプロトコル (AD-030 / contracts C-1 / C-2 / C-3)。 */

const record = {
  sessionId: 'a-b-c',
  summary: 'まとめ',
  firstPrompt: null,
  customTitle: null,
  lastModified: 1,
  createdAt: null,
  fileSize: null,
  gitBranch: null,
  tag: null,
  cwd: '/home/y/project',
  programmatic: false
}

function request(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    kind: 'enumerate',
    version: PROTOCOL_VERSION,
    id: 1,
    targetKey: 'host#0',
    configDir: 'C:\\Users\\y\\.claude',
    scope: { kind: 'all' },
    ...overrides
  })
}

describe('decodeRequest', () => {
  it('全件の要求を読む', () => {
    expect(decodeRequest(request())).toEqual({
      kind: 'enumerate',
      version: PROTOCOL_VERSION,
      id: 1,
      targetKey: 'host#0',
      configDir: 'C:\\Users\\y\\.claude',
      scope: { kind: 'all' }
    })
  })

  it('先頭ページの要求を読む', () => {
    const decoded = decodeRequest(request({ scope: { kind: 'page', limit: 50, offset: 100 } }))

    expect(decoded?.scope).toEqual({ kind: 'page', limit: 50, offset: 100 })
  })

  it('要求を往復できる', () => {
    const line = encodeRequest({
      kind: 'enumerate',
      version: PROTOCOL_VERSION,
      id: 7,
      targetKey: 'wsl:Ubuntu#0',
      configDir: '\\\\wsl.localhost\\Ubuntu\\home\\y\\.claude',
      scope: { kind: 'page', limit: 10, offset: 0 }
    })

    expect(decodeRequest(line)?.configDir).toBe('\\\\wsl.localhost\\Ubuntu\\home\\y\\.claude')
  })

  it('版が違う要求を拒否する (古いバンドルの取り違え)', () => {
    expect(decodeRequest(request({ version: PROTOCOL_VERSION + 1 }))).toBeNull()
  })

  it.each([
    ['kind が違う', { kind: 'something' }],
    ['id が無い', { id: undefined }],
    ['id が負数', { id: -1 }],
    ['id が小数', { id: 1.5 }],
    ['targetKey が空', { targetKey: '' }],
    ['configDir が空', { configDir: '' }],
    ['configDir が文字列でない', { configDir: 123 }],
    ['scope が無い', { scope: undefined }],
    ['scope の kind が未知', { scope: { kind: 'everything' } }],
    ['limit が 0', { scope: { kind: 'page', limit: 0, offset: 0 } }],
    [
      'limit が上限超過',
      { scope: { kind: 'page', limit: MAX_SESSIONS_PER_TARGET + 1, offset: 0 } }
    ],
    ['offset が負数', { scope: { kind: 'page', limit: 10, offset: -1 } }],
    ['offset が上限超過', { scope: { kind: 'page', limit: 10, offset: MAX_SESSION_OFFSET + 1 } }]
  ])('形の合わない要求を拒否する (%s)', (_label, overrides) => {
    expect(decodeRequest(request(overrides))).toBeNull()
  })

  it.each([
    ['JSON でない', 'not json'],
    ['配列', '[]'],
    ['null', 'null']
  ])('解釈できない行を拒否する (%s)', (_label, line) => {
    expect(decodeRequest(line)).toBeNull()
  })
})

describe('encodeResponse / decodeResponse', () => {
  it('成功応答を往復できる', () => {
    const response = okResponse(3, 'host#0', [record], false)

    expect(decodeResponse(encodeResponse(response))).toEqual(response)
  })

  it('失敗応答を往復できる', () => {
    const response = errorResponse(4, 'wsl:Ubuntu#0', 'permission-denied')

    expect(decodeResponse(encodeResponse(response))).toEqual(response)
  })

  it('1 行に収まる (要約に改行があっても行が割れない)', () => {
    const line = encodeResponse(okResponse(1, 'host#0', [{ ...record, summary: 'a\nb' }], false))

    expect(line).not.toContain('\n')
  })

  it('識別子を運ぶ (同じ対象への 2 要求を区別するため)', () => {
    const decoded = decodeResponse(encodeResponse(okResponse(42, 'host#0', [], false)))

    expect(decoded?.id).toBe(42)
  })

  it('版が違う応答を拒否する', () => {
    const line = JSON.stringify({
      kind: 'ok',
      version: PROTOCOL_VERSION + 1,
      id: 1,
      targetKey: 'host#0',
      sessions: [],
      truncated: false
    })

    expect(decodeResponse(line)).toBeNull()
  })

  it('既知でない理由キーを拒否する', () => {
    const line = JSON.stringify({
      kind: 'error',
      version: PROTOCOL_VERSION,
      id: 1,
      targetKey: 'host#0',
      reasonKey: 'something-else'
    })

    expect(decodeResponse(line)).toBeNull()
  })

  it.each([
    ['JSON でない', 'not json'],
    ['配列', '[]'],
    ['kind が無い', '{"version":2,"id":1,"targetKey":"host#0"}'],
    ['id が無い', '{"kind":"ok","version":2,"targetKey":"h","sessions":[],"truncated":false}'],
    [
      'targetKey が空',
      '{"kind":"ok","version":2,"id":1,"targetKey":"","sessions":[],"truncated":false}'
    ],
    [
      'sessions が配列でない',
      '{"kind":"ok","version":2,"id":1,"targetKey":"h","sessions":{},"truncated":false}'
    ],
    [
      'truncated が真偽でない',
      '{"kind":"ok","version":2,"id":1,"targetKey":"h","sessions":[],"truncated":"no"}'
    ]
  ])('形が合わない応答を拒否する (%s)', (_label, line) => {
    expect(decodeResponse(line)).toBeNull()
  })

  it('打ち切りの真偽をそのまま運ぶ (FR-038)', () => {
    const decoded = decodeResponse(encodeResponse(okResponse(1, 'host#0', [], true)))

    expect(decoded).toMatchObject({ kind: 'ok', truncated: true })
  })
})

describe('createLineAssembler', () => {
  it('チャンクを跨いだ 1 行を組み立てる', () => {
    const lines: string[] = []
    const assemble = createLineAssembler((line) => lines.push(line))

    assemble('{"a"')
    assemble(':1}\n')

    expect(lines).toEqual(['{"a":1}'])
  })

  it('改行が来るまで渡さない', () => {
    const lines: string[] = []
    const assemble = createLineAssembler((line) => lines.push(line))

    assemble('incomplete')

    expect(lines).toEqual([])
  })

  it('1 チャンクに複数行あれば全部渡す', () => {
    const lines: string[] = []
    const assemble = createLineAssembler((line) => lines.push(line))

    assemble('a\nb\n\nc\n')

    expect(lines).toEqual(['a', 'b', 'c'])
  })
})
