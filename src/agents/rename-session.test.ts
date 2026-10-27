import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * 改名の短命の子 (023 BE-032 / contracts C-5)。SDK は偽物に差し替える。
 * `process.parentPort` が無いので、import しても `main()` は何もしない (入口の 2 通目は別に確かめる)。
 */

const sdk = vi.hoisted(() => ({ renameSession: vi.fn() }))
vi.mock('@anthropic-ai/claude-agent-sdk', () => sdk)

import { decodeRenameRequest, run } from './rename-session'

const CONV = '22222222-2222-4222-8222-222222222222'

beforeEach(() => {
  sdk.renameSession.mockReset()
  sdk.renameSession.mockResolvedValue(undefined)
})

describe('run', () => {
  it('正しい 1 通で renameSession を引数 2 つで 1 回呼び { ok: true }', async () => {
    expect(await run({ conversationId: CONV, name: '調査' })).toEqual({ ok: true })
    expect(sdk.renameSession).toHaveBeenCalledTimes(1)
    expect(sdk.renameSession.mock.calls[0]).toEqual([CONV, '調査'])
  })

  it('SDK の reject で { ok: false } (例外の文字列を返さない)', async () => {
    sdk.renameSession.mockRejectedValue(new Error('secret-detail /home/x'))
    const result = await run({ conversationId: CONV, name: '調査' })
    expect(result).toEqual({ ok: false })
    expect(JSON.stringify(result)).not.toContain('secret')
  })

  it('形の外では SDK を呼ばず { ok: false }', async () => {
    const bad: unknown[] = [
      null,
      'x',
      [],
      { conversationId: 'not-uuid', name: 'a' },
      { conversationId: CONV, name: '' },
      { conversationId: CONV, name: ' a ' },
      { conversationId: CONV, name: 'a\nb' },
      { conversationId: CONV, name: 'a'.repeat(101) },
      { conversationId: CONV, name: 1 },
      { conversationId: CONV },
      { name: 'a' },
      { conversationId: CONV, name: 'a', extra: 1 }
    ]
    for (const data of bad) expect(await run(data)).toEqual({ ok: false })
    expect(sdk.renameSession).not.toHaveBeenCalled()
  })
})

describe('decodeRenameRequest', () => {
  it('trim 済みで規則を満たす値だけ通す', () => {
    expect(decodeRenameRequest({ conversationId: CONV, name: 'a' })).toEqual({
      conversationId: CONV,
      name: 'a'
    })
    expect(decodeRenameRequest({ conversationId: CONV, name: 'a '})).toBeNull()
  })
})

describe('入口 (parentPort)', () => {
  afterEach(() => {
    delete (process as unknown as { parentPort?: unknown }).parentPort
    vi.resetModules()
  })

  it('最初の 1 通だけを処理し、結果を 1 通だけ返す', async () => {
    const listeners: Array<(m: { data: unknown }) => void> = []
    const postMessage = vi.fn()
    ;(process as unknown as { parentPort: unknown }).parentPort = {
      on: (_e: string, l: (m: { data: unknown }) => void) => listeners.push(l),
      once: (_e: string, l: (m: { data: unknown }) => void) => listeners.push(l),
      postMessage,
      start: vi.fn()
    }
    vi.resetModules()
    await import('./rename-session')
    expect(listeners).toHaveLength(1)
    listeners[0]({ data: { conversationId: CONV, name: 'a' } })
    await vi.waitFor(() => expect(postMessage).toHaveBeenCalledTimes(1))
    expect(postMessage).toHaveBeenCalledWith({ ok: true })
  })
})
