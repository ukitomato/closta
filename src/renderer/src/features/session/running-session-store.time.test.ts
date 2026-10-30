import { afterEach, describe, expect, it, vi } from 'vitest'

import type { AppendMessage } from '@assistant-ui/react'

import { SESSION_PORT_MESSAGE } from '@domain/capability'
import type { SessionEvent } from '@domain/session/agent-session'
import type { SessionLaunchConfig } from '@domain/session/launch-config'
import type { SessionStatusUpdate } from '@domain/session/status-update'

import { readMessageTime, readReceivedAt } from '@/features/chat/message-time'
import { stubCapability } from '@/test-support/capability'

import { createRunningSessionStore } from './running-session-store'
import { DEFAULT_EXTRA_AXES } from '@domain/session/launch-config'

/**
 * O-9 FE-010 — 稼働中のストアのメッセージの時刻 (SC-001)。利用者の入力はストアの時計、応答は DTO の値、
 * 受信時刻 (所要時間の時計) は取り込みの時点の時計。
 */

const A = '11111111-1111-4111-8111-111111111111'
const CONFIG: SessionLaunchConfig = {
  folderId: 'f1',
  runtimeId: 'wsl:Ubuntu',
  providerId: null,
  modelId: null,
  effort: null,
  permissionMode: 'default',
  ...DEFAULT_EXTRA_AXES,
  sessionName: null
}

interface FakePort {
  onmessage: ((event: { data: unknown }) => void) | null
  start: ReturnType<typeof vi.fn>
  close: ReturnType<typeof vi.fn>
}

let detach: (() => void) | null = null
afterEach(() => {
  detach?.()
  detach = null
})

async function setup(): Promise<{
  store: ReturnType<typeof createRunningSessionStore>
  port: FakePort
  clock: { t: number }
}> {
  const clock = { t: 1_000 }
  let listener: ((u: readonly SessionStatusUpdate[]) => void) | null = null
  const cap = stubCapability({
    launchSession: vi.fn(async () => ({ status: 'launching' as const, sessionId: A })),
    sendPrompt: vi.fn(async () => {}),
    onSessionStatus: (l) => {
      listener = l
      return () => {
        listener = null
      }
    }
  })
  void listener
  const store = createRunningSessionStore(
    () => cap,
    () => clock.t
  )
  detach = store.attach(window)
  await store.launch(CONFIG)
  const port: FakePort = { onmessage: null, start: vi.fn(), close: vi.fn() }
  const event = new Event('message') as Event & { data: unknown; ports: unknown[] }
  event.data = { marker: SESSION_PORT_MESSAGE, sessionId: A }
  event.ports = [port]
  Object.defineProperty(event, 'origin', { value: window.location.origin })
  Object.defineProperty(event, 'source', { value: window })
  window.dispatchEvent(event)
  return { store, port, clock }
}

function emit(port: FakePort, event: SessionEvent): void {
  port.onmessage?.({ data: JSON.stringify(event) })
}

describe('running-session-store — メッセージの時刻 (O-9 FE-010)', () => {
  it('appendUser は偽の時計の値を createdAt と receivedAt に入れる', async () => {
    const { store, clock } = await setup()
    clock.t = 5_000
    store.queueOf(A)?.adapter.steer({
      role: 'user',
      content: [{ type: 'text', text: 'hi' }]
    } as unknown as AppendMessage)
    const m = store.getState().sessions[A]?.messages[0]
    expect(m).toBeDefined()
    expect(readMessageTime(m!)).toBe(5_000)
    expect(readReceivedAt(m!)).toBe(5_000)
  })

  it('積んだ入力の時刻は積んだ時刻ではなく送った時刻', async () => {
    const { store, port, clock } = await setup()
    emit(port, { kind: 'state', state: 'running' })
    clock.t = 2_000
    store.queueOf(A)?.adapter.steer({
      role: 'user',
      content: [{ type: 'text', text: '次' }]
    } as unknown as AppendMessage)
    clock.t = 9_000
    emit(port, { kind: 'state', state: 'done' })
    const user = store.getState().sessions[A]?.messages.find((m) => m.role === 'user')
    expect(readMessageTime(user!)).toBe(9_000)
  })

  it('応答の createdAt は DTO の値、receivedAt は取り込みの時計。送り直しで createdAt は進まず receivedAt は進む', async () => {
    const { store, port, clock } = await setup()
    clock.t = 3_000
    emit(port, {
      kind: 'message',
      message: { id: 'a1', role: 'assistant', parts: [{ type: 'text', text: 'x' }], createdAt: 777 }
    })
    clock.t = 8_000
    emit(port, {
      kind: 'message',
      message: { id: 'a1', role: 'assistant', parts: [{ type: 'text', text: 'y' }], createdAt: 777 }
    })
    const a = store.getState().sessions[A]?.messages.find((m) => m.id === 'a1')
    expect(readMessageTime(a!)).toBe(777)
    expect(readReceivedAt(a!)).toBe(8_000)
  })

  it('時刻の無い送り直しは前の createdAt を残す', async () => {
    const { store, port } = await setup()
    emit(port, {
      kind: 'message',
      message: { id: 'a1', role: 'assistant', parts: [{ type: 'text', text: 'x' }], createdAt: 777 }
    })
    emit(port, {
      kind: 'message',
      message: {
        id: 'a1',
        role: 'assistant',
        parts: [{ type: 'text', text: 'y' }],
        createdAt: null
      }
    })
    const a = store.getState().sessions[A]?.messages.find((m) => m.id === 'a1')
    expect(readMessageTime(a!)).toBe(777)
  })
})
