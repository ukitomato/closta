import { describe, expect, it, vi } from 'vitest'

import type { ElicitationField, ElicitationPrompt } from '@domain/session/elicitation'

import {
  acceptsWhileClosing,
  createElicitationRegistry,
  createOnElicitation,
  decodeSessionControl,
  toElicitationResult
} from './session-core'

/** Elicitation の registry・`onElicitation`・制御の decode (O-10 / AD-053。SC-003 / SC-010)。 */

const ID = '11111111-1111-4111-8111-111111111111'
const fields: ElicitationField[] = [
  { key: 'a', label: 'a', description: '', required: false, type: 'string' }
]
const urlShape = { mode: 'url', openable: true } as const

describe('createElicitationRegistry / toElicitationResult', () => {
  it('未知の requestId は何もしない・応答済みは再度解決しない・size が減る', () => {
    const registry = createElicitationRegistry(() => ID)
    const resolve = vi.fn()
    registry.register(registry.issue(), resolve, urlShape)
    expect(registry.size()).toBe(1)
    expect(registry.settle({ requestId: 'other', action: 'accept' })).toBe(false)
    expect(registry.settle({ requestId: ID, action: 'accept' })).toBe(true)
    expect(registry.settle({ requestId: ID, action: 'accept' })).toBe(false)
    expect(resolve).toHaveBeenCalledTimes(1)
    expect(registry.size()).toBe(0)
  })

  it("C-5' の表: URL への accept は content を捨てて { action: accept }", () => {
    expect(toElicitationResult(urlShape, { requestId: ID, action: 'accept' })).toEqual({
      action: 'accept'
    })
    const withContent = toElicitationResult(urlShape, {
      requestId: ID,
      action: 'accept',
      content: { marker: 'O10-MARKER-xyz' }
    })
    expect(withContent).toEqual({ action: 'accept' })
    expect(JSON.stringify(withContent)).not.toContain('O10-MARKER-xyz')
  })

  it("C-5' の表: openUrl: null / fields: null への accept は decline", () => {
    expect(
      toElicitationResult({ mode: 'url', openable: false }, { requestId: ID, action: 'accept' })
    ).toEqual({ action: 'decline' })
    expect(
      toElicitationResult({ mode: 'form', fields: null }, { requestId: ID, action: 'accept' })
    ).toEqual({ action: 'decline' })
  })

  it("C-5' の表: form は content なし / {} を {} として照合して accept、外れれば decline", () => {
    const shape = { mode: 'form', fields } as const
    expect(toElicitationResult(shape, { requestId: ID, action: 'accept' })).toEqual({
      action: 'accept',
      content: {}
    })
    expect(toElicitationResult(shape, { requestId: ID, action: 'accept', content: {} })).toEqual({
      action: 'accept',
      content: {}
    })
    expect(
      toElicitationResult(shape, { requestId: ID, action: 'accept', content: { a: 'x' } })
    ).toEqual({ action: 'accept', content: { a: 'x' } })
    expect(
      toElicitationResult(shape, { requestId: ID, action: 'accept', content: { zzz: 'x' } })
    ).toEqual({ action: 'decline' })
    const required: ElicitationField[] = [
      { key: 'r', label: 'r', description: '', required: true, type: 'string' }
    ]
    expect(
      toElicitationResult({ mode: 'form', fields: required }, { requestId: ID, action: 'accept' })
    ).toEqual({ action: 'decline' })
  })

  it('decline / cancel はそのまま (content 無し)', () => {
    const shape = { mode: 'form', fields } as const
    expect(
      toElicitationResult(shape, { requestId: ID, action: 'decline', content: { a: 'x' } })
    ).toEqual({ action: 'decline' })
    expect(toElicitationResult(urlShape, { requestId: ID, action: 'cancel' })).toEqual({
      action: 'cancel'
    })
  })
})

describe('createOnElicitation', () => {
  function setup(): {
    registry: ReturnType<typeof createElicitationRegistry>
    emitted: ElicitationPrompt[]
    onElicitation: ReturnType<typeof createOnElicitation>
  } {
    let n = 0
    const registry = createElicitationRegistry(
      () => `00000000-0000-4000-8000-${String((n += 1)).padStart(12, '0')}`
    )
    const emitted: ElicitationPrompt[] = []
    const onElicitation = createOnElicitation({
      registry,
      emitRequest: (prompt) => emitted.push(prompt)
    })
    return { registry, emitted, onElicitation }
  }
  const formRequest = {
    serverName: 'github',
    message: 'm',
    mode: 'form',
    requestedSchema: { type: 'object', properties: { a: { type: 'string' } } }
  }

  it('要求を renderer に送り、応答で解決する (form の accept は content つき)', async () => {
    const { registry, emitted, onElicitation } = setup()
    const pending = onElicitation(formRequest, { signal: new AbortController().signal })
    expect(emitted).toHaveLength(1)
    registry.settle({
      requestId: emitted[0]?.requestId ?? '',
      action: 'accept',
      content: { a: 'v' }
    })
    await expect(pending).resolves.toEqual({ action: 'accept', content: { a: 'v' } })
  })

  it('URL の要求への content なしの accept は { action: accept }', async () => {
    const { registry, emitted, onElicitation } = setup()
    const pending = onElicitation(
      { serverName: 's', message: '', mode: 'url', url: 'https://example.com/x' },
      { signal: new AbortController().signal }
    )
    expect(emitted[0]?.url?.openUrl).toBe('https://example.com/x')
    registry.settle({ requestId: emitted[0]?.requestId ?? '', action: 'accept' })
    await expect(pending).resolves.toEqual({ action: 'accept' })
  })

  it('開けない URL への accept は decline', async () => {
    const { registry, emitted, onElicitation } = setup()
    const pending = onElicitation(
      { serverName: 's', message: '', mode: 'url', url: 'javascript:alert(1)' },
      { signal: new AbortController().signal }
    )
    registry.settle({ requestId: emitted[0]?.requestId ?? '', action: 'accept' })
    await expect(pending).resolves.toEqual({ action: 'decline' })
  })

  it('5 つ目の要求は renderer に送らず decline', async () => {
    const { emitted, onElicitation } = setup()
    const signal = new AbortController().signal
    for (let i = 0; i < 4; i += 1) void onElicitation(formRequest, { signal })
    expect(emitted).toHaveLength(4)
    await expect(onElicitation(formRequest, { signal })).resolves.toEqual({ action: 'decline' })
    expect(emitted).toHaveLength(4)
  })

  it('abort で cancel になり、後から届いた応答は無視される (settle が false)', async () => {
    const { registry, emitted, onElicitation } = setup()
    const controller = new AbortController()
    const pending = onElicitation(formRequest, { signal: controller.signal })
    const requestId = emitted[0]?.requestId ?? ''
    controller.abort()
    await expect(pending).resolves.toEqual({ action: 'cancel' })
    expect(registry.size()).toBe(0)
    expect(registry.settle({ requestId, action: 'accept' })).toBe(false)
  })

  it('既に abort 済みなら送らず cancel', async () => {
    const { emitted, onElicitation } = setup()
    const controller = new AbortController()
    controller.abort()
    await expect(onElicitation(formRequest, { signal: controller.signal })).resolves.toEqual({
      action: 'cancel'
    })
    expect(emitted).toHaveLength(0)
  })

  it('cancelAll は残りを cancel で解決する', async () => {
    const { registry, onElicitation } = setup()
    const pending = onElicitation(formRequest, { signal: new AbortController().signal })
    registry.cancelAll()
    await expect(pending).resolves.toEqual({ action: 'cancel' })
    expect(registry.size()).toBe(0)
  })
})

describe('decodeSessionControl の respond-elicitation', () => {
  const decode = (response: unknown): ReturnType<typeof decodeSessionControl> =>
    decodeSessionControl({ kind: 'respond-elicitation', response })

  it('正例: content なしの accept・{} の accept・値つき', () => {
    expect(decode({ requestId: ID, action: 'accept' })).toEqual({
      kind: 'respond-elicitation',
      response: { requestId: ID, action: 'accept' }
    })
    expect(decode({ requestId: ID, action: 'accept', content: {} })).toEqual({
      kind: 'respond-elicitation',
      response: { requestId: ID, action: 'accept', content: {} }
    })
    expect(
      decode({ requestId: ID, action: 'accept', content: { a: 1, b: 'x', c: true } })
    ).not.toBeNull()
  })

  it('accept でない content は捨てる', () => {
    expect(decode({ requestId: ID, action: 'decline', content: { a: 'x' } })).toEqual({
      kind: 'respond-elicitation',
      response: { requestId: ID, action: 'decline' }
    })
  })

  it.each([
    ['列挙の外の action', { requestId: ID, action: 'ok' }],
    ['UUID でない id', { requestId: 'req-1', action: 'accept' }],
    ['id が無い', { action: 'accept' }],
    [
      '33 項目',
      {
        requestId: ID,
        action: 'accept',
        content: Object.fromEntries(Array.from({ length: 33 }, (_, i) => [`k${i}`, 1]))
      }
    ],
    ['値が object', { requestId: ID, action: 'accept', content: { a: {} } }],
    ['content が配列', { requestId: ID, action: 'accept', content: [] }],
    [
      '1,001 コードポイント',
      { requestId: ID, action: 'accept', content: { a: 'x'.repeat(1001) } }
    ],
    ['response が object でない', 'x']
  ])('%s は null で例外にならない', (_name, response) => {
    expect(decode(response)).toBeNull()
  })

  it('終了処理中は respond-elicitation を受け付けない', () => {
    expect(
      acceptsWhileClosing({
        kind: 'respond-elicitation',
        response: { requestId: ID, action: 'cancel' }
      })
    ).toBe(false)
  })
})
