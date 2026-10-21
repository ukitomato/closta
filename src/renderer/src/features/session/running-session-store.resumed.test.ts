import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  SESSION_PORT_MESSAGE,
  TRANSCRIPT_PORT_MESSAGE,
  type ClostaCapability
} from '@domain/capability'
import type { SessionEvent } from '@domain/session/agent-session'
import type { SessionLaunchConfig } from '@domain/session/launch-config'
import type { SessionResumeRequest } from '@domain/session/resume'
import type { TranscriptHandshakeDTO, TranscriptMessageDTO } from '@domain/session/transcript-dto'

import { stubCapability } from '@/test-support/capability'

import { createRunningSessionStore, type RunningSessionStore } from './running-session-store'

/**
 * X-9 FE-040 — それまでの会話の読み取りと表示 (data-model §8.2 / research R-09)。
 * 既存のストアのテストは書き換えない。port は jsdom の MessageChannel に依らない fake。
 */

const B = '22222222-2222-4222-8222-222222222222'
const C = '33333333-3333-4333-8333-333333333333'

const CFG: SessionLaunchConfig = {
  folderId: 'f1',
  runtimeId: 'wsl:Ubuntu',
  providerId: null,
  modelId: null,
  effort: null,
  permissionMode: 'default'
}

const REQUEST: SessionResumeRequest = {
  source: { kind: 'past', targetKey: 'target-1', conversationId: C },
  config: CFG
}

interface FakePort {
  onmessage: ((event: { data: unknown }) => void) | null
  start: ReturnType<typeof vi.fn>
  close: ReturnType<typeof vi.fn>
}

function fakePort(): FakePort {
  return { onmessage: null, start: vi.fn(), close: vi.fn() }
}

function deliver(data: unknown, port: FakePort): void {
  const event = new Event('message') as Event & { data: unknown; ports: unknown[] }
  event.data = data
  event.ports = [port]
  Object.defineProperty(event, 'origin', { value: window.location.origin })
  Object.defineProperty(event, 'source', { value: window })
  window.dispatchEvent(event)
}

function dto(id: string, text: string, role: 'user' | 'assistant' = 'user'): TranscriptMessageDTO {
  return { id, role, parts: [{ type: 'text', text }], createdAt: null }
}

let detach: (() => void) | null = null
afterEach(() => {
  detach?.()
  detach = null
})

function harness(handshake: (token: string) => Promise<TranscriptHandshakeDTO>): {
  store: RunningSessionStore
  cap: ClostaCapability
  tokenOf: () => string
} {
  const cap = stubCapability({
    resumeSession: vi.fn(async () => ({ status: 'launching' as const, sessionId: B })),
    getResumedTranscript: vi.fn((_id: string, token: string) => handshake(token)),
    onSessionStatus: () => () => {},
    onSessionResumable: () => () => {}
  })
  const store = createRunningSessionStore(
    () => cap,
    () => 1_700_000_000_000
  )
  detach = store.attach(window)
  return {
    store,
    cap,
    tokenOf: () => String(vi.mocked(cap.getResumedTranscript).mock.calls[0]?.[1])
  }
}

function textsOf(store: RunningSessionStore): string[] {
  const messages = store.getState().sessions[B]?.messages ?? []
  return messages.map((m) => `${m.id ?? ''}`)
}

describe('running-session-store — それまでの会話 (FE-040)', () => {
  it('受け付けの後に 1 回だけ読み、port の本文が先頭に入り、後ろに区切りの行が 1 つ付く', async () => {
    const h = harness((token) => Promise.resolve({ status: 'streaming', requestToken: token }))
    await h.store.resume(REQUEST, null, 'manual')
    expect(h.cap.getResumedTranscript).toHaveBeenCalledTimes(1)
    expect(h.cap.getResumedTranscript).toHaveBeenCalledWith(B, expect.any(String))
    expect(h.store.getState().sessions[B]?.resumed).toEqual({ phase: 'loading' })

    const port = fakePort()
    deliver({ marker: TRANSCRIPT_PORT_MESSAGE, requestToken: h.tokenOf() }, port)
    port.onmessage?.({
      data: {
        kind: 'messages',
        requestToken: h.tokenOf(),
        messages: [dto('m1', 'こんにちは'), dto('m2', 'はい', 'assistant')]
      }
    })
    expect(textsOf(h.store)).toEqual(['resumed:m1', 'resumed:m2', 'resumed:divider'])
    expect(h.store.getState().sessions[B]?.resumed).toEqual({ phase: 'loaded' })
    expect(port.close).toHaveBeenCalled()
  })

  it('新しいメッセージが先に届いていても、それまでの会話は先頭に入る', async () => {
    const h = harness((token) => Promise.resolve({ status: 'streaming', requestToken: token }))
    await h.store.resume(REQUEST, null, 'manual')
    const live = fakePort()
    deliver({ marker: SESSION_PORT_MESSAGE, sessionId: B }, live)
    const event: SessionEvent = { kind: 'message', message: dto('new-1', '新しい', 'assistant') }
    live.onmessage?.({ data: JSON.stringify(event) })
    expect(textsOf(h.store)).toEqual(['new-1'])

    const port = fakePort()
    deliver({ marker: TRANSCRIPT_PORT_MESSAGE, requestToken: h.tokenOf() }, port)
    port.onmessage?.({
      data: { kind: 'messages', requestToken: h.tokenOf(), messages: [dto('new-1', '前の')] }
    })
    // 同じ元の id でも接頭辞で衝突しない。
    expect(textsOf(h.store)).toEqual(['resumed:new-1', 'resumed:divider', 'new-1'])
  })

  it('0 件 (handshake empty) は区切りの行だけ', async () => {
    const h = harness((token) => Promise.resolve({ status: 'empty', requestToken: token }))
    await h.store.resume(REQUEST, null, 'manual')
    await vi.waitFor(() =>
      expect(h.store.getState().sessions[B]?.resumed).toEqual({ phase: 'loaded' })
    )
    expect(textsOf(h.store)).toEqual(['resumed:divider'])
  })

  it('読み取りの失敗 (handshake failed・reject・port の error) で失敗の 1 行が先頭に入り、再開は止まらない', async () => {
    const failed = harness((token) =>
      Promise.resolve({
        status: 'failed',
        requestToken: token,
        reasonKey: 'transcript-read-failed'
      })
    )
    await failed.store.resume(REQUEST, null, 'manual')
    await vi.waitFor(() =>
      expect(failed.store.getState().sessions[B]?.resumed).toEqual({ phase: 'failed' })
    )
    expect(textsOf(failed.store)).toEqual(['resumed:load-failed'])
    expect(failed.store.getState().sessions[B]?.runState).toBe('launching')
    detach?.()

    const rejected = harness(() => Promise.reject(new Error('x')))
    await rejected.store.resume(REQUEST, null, 'manual')
    await vi.waitFor(() =>
      expect(rejected.store.getState().sessions[B]?.resumed).toEqual({ phase: 'failed' })
    )
    detach?.()

    const streaming = harness((token) =>
      Promise.resolve({ status: 'streaming', requestToken: token })
    )
    await streaming.store.resume(REQUEST, null, 'manual')
    const port = fakePort()
    deliver({ marker: TRANSCRIPT_PORT_MESSAGE, requestToken: streaming.tokenOf() }, port)
    port.onmessage?.({
      data: {
        kind: 'error',
        requestToken: streaming.tokenOf(),
        reasonKey: 'transcript-read-failed'
      }
    })
    expect(streaming.store.getState().sessions[B]?.resumed).toEqual({ phase: 'failed' })
  })

  it('古い (知らない) requestToken の port は捨てて何も入れない', async () => {
    const h = harness((token) => Promise.resolve({ status: 'streaming', requestToken: token }))
    await h.store.resume(REQUEST, null, 'manual')
    const stale = fakePort()
    deliver({ marker: TRANSCRIPT_PORT_MESSAGE, requestToken: 'old-token' }, stale)
    expect(stale.close).toHaveBeenCalled()
    expect(h.store.getState().sessions[B]?.messages).toEqual([])

    // token は合う port でも、frame の token が違えば入れない。
    const port = fakePort()
    deliver({ marker: TRANSCRIPT_PORT_MESSAGE, requestToken: h.tokenOf() }, port)
    port.onmessage?.({
      data: { kind: 'messages', requestToken: 'other', messages: [dto('m1', 'x')] }
    })
    expect(h.store.getState().sessions[B]?.messages).toEqual([])
    expect(h.store.getState().sessions[B]?.resumed).toEqual({ phase: 'loading' })
  })
})
