import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { TRANSCRIPT_PORT_MESSAGE } from '@domain/capability'
import type { TranscriptFrameDTO, TranscriptMessageDTO } from '@domain/session/transcript-dto'

import { installCapability } from '@/test-support/capability'

/**
 * FE-031 / FE-034 — `useTranscript` の取得配線の検証 (US-1 AC-4/AC-5 / SC-001 / data-model §8)。
 *
 * **stale 破棄 (AC-5) がここの主眼**。選択切替後に届いた旧 token の frame が現在表示を
 * 上書きしないことを、実 hook + port の onmessage 経路で確かめる。jsdom の `MessageChannel`
 * 非同期配送に依存せず、fake port + 属性付き `Event` で決定的に配線する。
 */

// vi.mock の factory から参照するため hoisted に置く。
const { sel, ROWS } = vi.hoisted(() => ({
  sel: { index: { marker: 'index' } as unknown, selectedRowKey: null as string | null },
  ROWS: {
    'host#0::s1': { sessionId: 'uuid-0000-1', targetKey: 'host#0' },
    'host#0::s2': { sessionId: 'uuid-0000-2', targetKey: 'host#0' }
  } as Record<string, { sessionId: string; targetKey: string }>
}))

vi.mock('@/stores/sessions', () => ({
  useSessionsStore: (selector: (s: typeof sel) => unknown) => selector(sel)
}))
vi.mock('@/features/session-list/rows', () => ({
  buildSessionRows: () => ({
    rows: Object.entries(ROWS).map(([rowKey, session]) => ({ rowKey, session })),
    sections: []
  })
}))

import { useTranscript } from './useTranscript'

/** hook が使う分だけ持つ fake MessagePort。frame は `deliver` で同期的に流す。 */
interface FakePort {
  onmessage: ((event: { data: unknown }) => void) | null
  start: () => void
  close: () => void
  deliver: (data: unknown) => void
}
function fakePort(): FakePort {
  const port: FakePort = {
    onmessage: null,
    start: vi.fn(),
    close: vi.fn(),
    deliver: (data) => port.onmessage?.({ data })
  }
  return port
}

/** window メッセージで port を hook に渡す (preload の橋渡しを模す。自 origin・自 window から送る)。 */
function deliverPort(requestToken: string, port: FakePort): void {
  const event = new Event('message') as Event & {
    data: unknown
    ports: unknown[]
    origin: string
    source: unknown
  }
  event.data = { marker: TRANSCRIPT_PORT_MESSAGE, requestToken }
  event.ports = [port]
  // hook は origin/source を検証する (security S-L-001)。preload と同じく自 origin・自 window にする。
  Object.defineProperty(event, 'origin', { value: window.location.origin })
  Object.defineProperty(event, 'source', { value: window })
  window.dispatchEvent(event)
}

function textMessage(id: string, text: string): TranscriptMessageDTO {
  return { id, role: 'assistant', parts: [{ type: 'text', text }], createdAt: null }
}

afterEach(() => {
  sel.selectedRowKey = null
})

describe('useTranscript', () => {
  it('選択が無ければ idle で hasSelection=false', () => {
    const { result } = renderHook(() => useTranscript())

    expect(result.current.status).toBe('idle')
    expect(result.current.hasSelection).toBe(false)
    expect(result.current.messages).toHaveLength(0)
  })

  it('選択すると loading になり getTranscript を分離した引数で呼ぶ', async () => {
    const getTranscript = vi.fn(async (_s: string, _t: string, token: string) => ({
      status: 'streaming' as const,
      requestToken: token
    }))
    installCapability({ getTranscript })
    sel.selectedRowKey = 'host#0::s1'

    const { result } = renderHook(() => useTranscript())

    expect(result.current.status).toBe('loading')
    await waitFor(() => expect(getTranscript).toHaveBeenCalledTimes(1))
    expect(getTranscript.mock.calls[0][0]).toBe('uuid-0000-1')
    expect(getTranscript.mock.calls[0][1]).toBe('host#0')
    expect(getTranscript.mock.calls[0][2]).toEqual(expect.any(String))
  })

  it('port の messages frame で ready になり変換済みメッセージを出す', async () => {
    let token = ''
    installCapability({
      getTranscript: vi.fn(async (_s: string, _t: string, t: string) => {
        token = t
        return { status: 'streaming' as const, requestToken: t }
      })
    })
    sel.selectedRowKey = 'host#0::s1'

    const { result } = renderHook(() => useTranscript())
    await waitFor(() => expect(token).not.toBe(''))

    const port = fakePort()
    act(() => deliverPort(token, port))
    const frame: TranscriptFrameDTO = {
      kind: 'messages',
      requestToken: token,
      messages: [textMessage('m1', 'こんにちは')]
    }
    act(() => port.deliver(frame))

    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.messages).toHaveLength(1)
    expect(port.close).toHaveBeenCalled()
  })

  it('frame の本文を検証する: prototype のキーの status の行と、result が文字列でない tool-call の part を落とす (O-2)', async () => {
    let token = ''
    installCapability({
      getTranscript: vi.fn(async (_s: string, _t: string, t: string) => {
        token = t
        return { status: 'streaming' as const, requestToken: t }
      })
    })
    sel.selectedRowKey = 'host#0::s1'

    const { result } = renderHook(() => useTranscript())
    await waitFor(() => expect(token).not.toBe(''))

    const event = {
      type: 'system-event',
      category: 'hook',
      opens: true,
      name: 'setup',
      detail: 'SessionStart',
      status: 'succeeded'
    }
    const port = fakePort()
    act(() => deliverPort(token, port))
    act(() =>
      port.deliver({
        kind: 'messages',
        requestToken: token,
        messages: [
          { id: 'hook:ok', role: 'system', parts: [event], createdAt: null },
          {
            id: 'hook:bad',
            role: 'system',
            parts: [{ ...event, status: 'constructor' }],
            createdAt: null
          },
          {
            id: 'a1',
            role: 'assistant',
            createdAt: null,
            parts: [
              { type: 'text', text: '本文' },
              {
                type: 'tool-call',
                toolCallId: 'c1',
                toolName: 'Bash',
                argsText: '{}',
                result: { not: 'string' },
                isError: false,
                truncated: false,
                children: []
              }
            ]
          }
        ]
      })
    )

    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.messages.map((m) => m.id)).toEqual(['hook:ok', 'a1'])
    const a1 = result.current.messages[1]
    expect(typeof a1?.content !== 'string' && a1?.content.map((p) => p.type)).toEqual(['text'])
  })

  it('messages が空の frame は empty になる', async () => {
    let token = ''
    installCapability({
      getTranscript: vi.fn(async (_s: string, _t: string, t: string) => {
        token = t
        return { status: 'streaming' as const, requestToken: t }
      })
    })
    sel.selectedRowKey = 'host#0::s1'

    const { result } = renderHook(() => useTranscript())
    await waitFor(() => expect(token).not.toBe(''))

    const port = fakePort()
    act(() => deliverPort(token, port))
    act(() => port.deliver({ kind: 'messages', requestToken: token, messages: [] }))

    await waitFor(() => expect(result.current.status).toBe('empty'))
  })

  it('error frame で failed になる', async () => {
    let token = ''
    installCapability({
      getTranscript: vi.fn(async (_s: string, _t: string, t: string) => {
        token = t
        return { status: 'streaming' as const, requestToken: t }
      })
    })
    sel.selectedRowKey = 'host#0::s1'

    const { result } = renderHook(() => useTranscript())
    await waitFor(() => expect(token).not.toBe(''))

    const port = fakePort()
    act(() => deliverPort(token, port))
    act(() =>
      port.deliver({ kind: 'error', requestToken: token, reasonKey: 'transcript-read-failed' })
    )

    await waitFor(() => expect(result.current.status).toBe('failed'))
    // reasonKey が表示層まで届く (AC-4。dead data にしない)。
    expect(result.current.reasonKey).toBe('transcript-read-failed')
  })

  it('handshake が failed なら port を待たず failed', async () => {
    installCapability({
      getTranscript: vi.fn(async (_s: string, _t: string, t: string) => ({
        status: 'failed' as const,
        requestToken: t,
        reasonKey: 'transcript-read-failed' as const
      }))
    })
    sel.selectedRowKey = 'host#0::s1'

    const { result } = renderHook(() => useTranscript())

    await waitFor(() => expect(result.current.status).toBe('failed'))
    expect(result.current.reasonKey).toBe('transcript-read-failed')
  })

  it('getTranscript が reject でも failed に落ちる (throw を漏らさない)', async () => {
    installCapability({
      getTranscript: vi.fn(async () => {
        throw new Error('boom')
      })
    })
    sel.selectedRowKey = 'host#0::s1'

    const { result } = renderHook(() => useTranscript())

    await waitFor(() => expect(result.current.status).toBe('failed'))
  })

  it('retry で同一 session を取り直す (AC-4)', async () => {
    const getTranscript = vi.fn(async (_s: string, _t: string, t: string) => ({
      status: 'failed' as const,
      requestToken: t,
      reasonKey: 'transcript-read-failed' as const
    }))
    installCapability({ getTranscript })
    sel.selectedRowKey = 'host#0::s1'

    const { result } = renderHook(() => useTranscript())
    await waitFor(() => expect(result.current.status).toBe('failed'))

    act(() => result.current.retry())

    await waitFor(() => expect(getTranscript).toHaveBeenCalledTimes(2))
    expect(getTranscript.mock.calls[1][0]).toBe('uuid-0000-1')
  })

  it('選択切替後に届いた旧 token の frame は現在表示を上書きしない (AC-5)', async () => {
    const tokens: string[] = []
    installCapability({
      getTranscript: vi.fn(async (_s: string, _t: string, t: string) => {
        tokens.push(t)
        return { status: 'streaming' as const, requestToken: t }
      })
    })
    sel.selectedRowKey = 'host#0::s1'

    const { result, rerender } = renderHook(() => useTranscript())
    await waitFor(() => expect(tokens).toHaveLength(1))
    const tokenOld = tokens[0]

    // s1 の port を先に受け取る (frame はまだ来ない)。
    const portOld = fakePort()
    act(() => deliverPort(tokenOld, portOld))

    // s2 に切り替える → 新しい token で取り直す。
    sel.selectedRowKey = 'host#0::s2'
    rerender()
    await waitFor(() => expect(tokens).toHaveLength(2))
    const tokenNew = tokens[1]

    // ここで s1 の遅れた frame が届く → 破棄されること。
    act(() =>
      portOld.deliver({
        kind: 'messages',
        requestToken: tokenOld,
        messages: [textMessage('stale', '古い応答')]
      })
    )
    expect(result.current.status).not.toBe('ready')
    expect(portOld.close).toHaveBeenCalled()

    // s2 の port + frame が届く → こちらが表示される。
    const portNew = fakePort()
    act(() => deliverPort(tokenNew, portNew))
    act(() =>
      portNew.deliver({
        kind: 'messages',
        requestToken: tokenNew,
        messages: [textMessage('fresh', '新しい応答')]
      })
    )

    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.messages).toHaveLength(1)
    expect(result.current.messages[0].id).toBe('fresh')
  })
})
