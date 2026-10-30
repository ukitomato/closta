import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { SESSION_PORT_MESSAGE, type ClostaCapability } from '@domain/capability'
import type { SessionEvent } from '@domain/session/agent-session'
import type { SessionLaunchConfig } from '@domain/session/launch-config'
import type { SessionStatusUpdate } from '@domain/session/status-update'

import { stubCapability } from '@/test-support/capability'

import {
  ACTIVITY_THROTTLE_MS,
  createRunningSessionStore,
  type RunningSessionStore
} from './running-session-store'
import { DEFAULT_EXTRA_AXES } from '@domain/session/launch-config'

/**
 * O-1 SH-004 — 監視ビューの派生値 (状態に入った時刻・直近の活動の間引き・受信件数・密度・承認待ちへの移動)。
 * data-model §1 / research R-01・R-03 / SC-001・SC-006。
 */

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'

const cfg: SessionLaunchConfig = {
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

function deliverPort(sessionId: string, port: FakePort): void {
  const event = new Event('message') as Event & { data: unknown; ports: unknown[] }
  event.data = { marker: SESSION_PORT_MESSAGE, sessionId }
  event.ports = [port]
  Object.defineProperty(event, 'origin', { value: window.location.origin })
  Object.defineProperty(event, 'source', { value: window })
  window.dispatchEvent(event)
}

function emit(port: FakePort, event: SessionEvent): void {
  port.onmessage?.({ data: JSON.stringify(event) })
}

const text = (id: string, body: string): SessionEvent => ({
  kind: 'message',
  message: { id, role: 'assistant', parts: [{ type: 'text', text: body }], createdAt: null }
})

const status = (id: string, over: Partial<SessionStatusUpdate> = {}): SessionStatusUpdate => ({
  sessionId: id,
  state: 'running',
  reasonKey: null,
  claudeAlive: true,
  ...over
})

let clock = 1_000
let detach: (() => void) | null = null
let push: (u: readonly SessionStatusUpdate[]) => void = () => {}
let cap: ClostaCapability

beforeEach(() => {
  vi.useFakeTimers()
  clock = 1_000
})

afterEach(() => {
  detach?.()
  detach = null
  vi.useRealTimers()
})

function harness(): RunningSessionStore {
  let listener: ((u: readonly SessionStatusUpdate[]) => void) | null = null
  cap = stubCapability({
    launchSession: vi.fn(async () => ({ status: 'launching' as const, sessionId: A })),
    sendPrompt: vi.fn(async () => {}),
    respondPermission: vi.fn(async () => {}),
    killSession: vi.fn(async () => {}),
    endSession: vi.fn(async () => {}),
    onSessionStatus: (l) => {
      listener = l
      return () => {
        listener = null
      }
    }
  })
  const store = createRunningSessionStore(
    () => cap,
    () => clock
  )
  detach = store.attach(window)
  push = (u) => listener?.(u)
  return store
}

async function launched(
  store: RunningSessionStore,
  id: string,
  label: string | null = null
): Promise<FakePort> {
  vi.mocked(cap.launchSession).mockResolvedValueOnce({ status: 'launching', sessionId: id })
  await store.launch(cfg, label)
  const port: FakePort = { onmessage: null, start: vi.fn(), close: vi.fn() }
  deliverPort(id, port)
  return port
}

describe('状態に入った時刻 (statusSince。FR-005 / research R-01)', () => {
  it('起動の受付でその時点の行の状態と表示名が入る', async () => {
    const store = harness()
    await launched(store, A, '案件A')
    expect(store.getState().statusSince[A]).toEqual({ status: 'launching', at: 1_000 })
    expect(store.getState().sessions[A]?.folderLabel).toBe('案件A')
  })

  it('handshake より先に状態通知が届いていたら launching で上書きしない', async () => {
    const store = harness()
    let resolve!: (v: { status: 'launching'; sessionId: string }) => void
    vi.mocked(cap.launchSession).mockImplementationOnce(() => new Promise((r) => (resolve = r)))
    const pending = store.launch(cfg)
    push([status(A, { state: 'launching' })])
    resolve({ status: 'launching', sessionId: A })
    await pending
    expect(store.getState().statusSince[A]?.status).toBe('ready')
  })

  it('port の state・状態通知・利用者の操作のいずれで変わっても更新され、変わらなければ参照も変わらない', async () => {
    const store = harness()
    const port = await launched(store, A)
    clock = 2_000
    emit(port, { kind: 'state', state: 'running' })
    expect(store.getState().statusSince[A]).toEqual({ status: 'running', at: 2_000 })

    const before = store.getState().statusSince
    clock = 2_500
    emit(port, text('m1', 'x'))
    expect(store.getState().statusSince).toBe(before)

    clock = 3_000
    push([status(A, { state: 'awaiting_permission' })])
    emit(port, { kind: 'state', state: 'awaiting_permission' })
    expect(store.getState().statusSince[A]).toEqual({ status: 'awaiting', at: 3_000 })

    clock = 4_000
    store.kill(A)
    push([status(A, { state: 'done', claudeAlive: false })])
    expect(store.getState().statusSince[A]?.status).toBe('ended')
  })

  it('done の応答待ち → 生存フラグ false で時刻が更新される', async () => {
    const store = harness()
    const port = await launched(store, A)
    emit(port, { kind: 'state', state: 'done' })
    push([status(A, { state: 'done' })])
    expect(store.getState().statusSince[A]?.status).toBe('waiting')
    clock = 9_000
    push([status(A, { state: 'done', claudeAlive: false })])
    expect(store.getState().statusSince[A]).toEqual({ status: 'ended', at: 9_000 })
  })

  it('状態通知のバッチで 2 本が変わっても statusSince の参照の変化は 1 回', async () => {
    const store = harness()
    await launched(store, A)
    await launched(store, B)
    push([status(A), status(B)])
    let changes = 0
    let last = store.getState().statusSince
    const unsubscribe = store.subscribe((s) => {
      if (s.statusSince !== last) {
        changes += 1
        last = s.statusSince
      }
    })
    push([status(A, { state: 'error' }), status(B, { state: 'error' })])
    unsubscribe()
    expect(changes).toBe(1)
    expect(store.getState().statusSince[A]?.status).toBe('failed')
    expect(store.getState().statusSince[B]?.status).toBe('failed')
  })
})

describe('直近の活動の間引き (activity。FR-006 / research R-03)', () => {
  it('500ms の間に message を 20 回流しても書き込みは先頭 1 回 + trailing 1 回で、最後の値が残る', async () => {
    const store = harness()
    const port = await launched(store, A)
    emit(port, { kind: 'state', state: 'done' })
    vi.advanceTimersByTime(ACTIVITY_THROTTLE_MS * 2)
    let writes = 0
    let last = store.getState().activity
    const unsubscribe = store.subscribe((s) => {
      if (s.activity !== last) {
        writes += 1
        last = s.activity
      }
    })
    for (let i = 0; i < 20; i += 1) emit(port, text(`m${i}`, `応答 ${i}`))
    vi.advanceTimersByTime(ACTIVITY_THROTTLE_MS)
    unsubscribe()
    expect(writes).toBe(2)
    expect(store.getState().activity[A]).toEqual({ kind: 'reply', tool: null, detail: '応答 19' })
  })

  it('承認に応じた・強制終了した・failure が届いた後、間隔の内に承認の表示が消える', async () => {
    for (const end of ['respond', 'kill', 'failure'] as const) {
      const store = harness()
      const port = await launched(store, A)
      emit(port, { kind: 'state', state: 'awaiting_permission' })
      emit(port, {
        kind: 'permission-request',
        request: { requestId: 'r1', toolName: 'Bash', input: 'ls', scope: 'once' }
      })
      vi.advanceTimersByTime(ACTIVITY_THROTTLE_MS)
      expect(store.getState().activity[A]?.kind).toBe('approval')
      if (end === 'respond') store.respond(A, 'r1', 'allow')
      else if (end === 'kill') store.kill(A)
      else emit(port, { kind: 'failure', reasonKey: 'provider-error' })
      vi.advanceTimersByTime(ACTIVITY_THROTTLE_MS)
      expect(store.getState().activity[A]?.kind).not.toBe('approval')
      detach?.()
      detach = null
    }
  })

  it('送信するとプロンプトの先頭行になる', async () => {
    const store = harness()
    await launched(store, A)
    vi.advanceTimersByTime(ACTIVITY_THROTTLE_MS)
    store.appendUser(A, '直してください\n詳細')
    vi.advanceTimersByTime(ACTIVITY_THROTTLE_MS)
    expect(store.getState().activity[A]).toEqual({
      kind: 'prompt',
      tool: null,
      detail: '直してください'
    })
  })
})

describe('受信件数・閉じる・密度・承認待ちへの移動', () => {
  it('receivedMessages は message ごとに 1 増え、他の更新では変わらない', async () => {
    const store = harness()
    const port = await launched(store, A)
    emit(port, text('m1', 'a'))
    emit(port, text('m1', 'a b'))
    emit(port, { kind: 'state', state: 'running' })
    push([status(A)])
    expect(store.getState().receivedMessages).toBe(2)
  })

  it('閉じると statusSince / activity が消え、間引きのタイマが止まる', async () => {
    const store = harness()
    const port = await launched(store, A)
    emit(port, text('m1', 'a'))
    emit(port, text('m2', 'b'))
    push([status(A, { state: 'done', claudeAlive: false })])
    store.close(A)
    expect(store.getState().statusSince[A]).toBeUndefined()
    expect(store.getState().activity[A]).toBeUndefined()
    vi.advanceTimersByTime(ACTIVITY_THROTTLE_MS * 4)
    expect(store.getState().activity[A]).toBeUndefined()
  })

  it('密度は切り替え・起動・閉じるを通して保たれる', async () => {
    const store = harness()
    store.setDensity('compact')
    await launched(store, A)
    push([status(A, { state: 'done', claudeAlive: false })])
    store.close(A)
    expect(store.getState().density).toBe('compact')
  })

  it('selectNextAwaiting は表示中を除く最古へ移り、無ければ何もしない', async () => {
    const store = harness()
    const pa = await launched(store, A)
    const pb = await launched(store, B)
    clock = 5_000
    emit(pb, { kind: 'state', state: 'awaiting_permission' })
    clock = 6_000
    emit(pa, { kind: 'state', state: 'awaiting_permission' })
    store.select(null)
    store.selectNextAwaiting()
    expect(store.getState().selectedId).toBe(B)
    store.selectNextAwaiting()
    expect(store.getState().selectedId).toBe(A)
    emit(pb, { kind: 'state', state: 'running' })
    store.selectNextAwaiting()
    expect(store.getState().selectedId).toBe(A)
  })
})
