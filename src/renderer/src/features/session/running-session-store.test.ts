import { afterEach, describe, expect, it, vi } from 'vitest'

import type { AppendMessage } from '@assistant-ui/react'

import { SESSION_PORT_MESSAGE, type ClostaCapability } from '@domain/capability'
import type { SessionEvent } from '@domain/session/agent-session'
import type { SessionLaunchConfig } from '@domain/session/launch-config'
import type { SessionStatusUpdate } from '@domain/session/status-update'

import { stubCapability } from '@/test-support/capability'

import { createRunningSessionStore, type RunningSessionStore } from './running-session-store'
import { availableActions, rowStatus, viewOf } from './session-view'

/**
 * X-5 FE-001 / FE-010 / FE-013 — セッションストアの規則 (SC-006)。
 *
 * port は jsdom の MessageChannel に依存しない fake で、preload の橋渡し (自 origin・自 window の `message`) を模す。
 */

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'

function cfg(folderId = 'f1'): SessionLaunchConfig {
  return {
    folderId,
    runtimeId: 'wsl:Ubuntu',
    providerId: null,
    modelId: null,
    effort: null,
    permissionMode: 'default'
  }
}

interface FakePort {
  onmessage: ((event: { data: unknown }) => void) | null
  start: ReturnType<typeof vi.fn>
  close: ReturnType<typeof vi.fn>
}

function fakePort(): FakePort {
  return { onmessage: null, start: vi.fn(), close: vi.fn() }
}

function deliverPort(
  sessionId: string,
  port: FakePort,
  origin = window.location.origin,
  source: unknown = window,
  marker: unknown = SESSION_PORT_MESSAGE
): void {
  const event = new Event('message') as Event & { data: unknown; ports: unknown[] }
  event.data = { marker, sessionId }
  event.ports = [port]
  Object.defineProperty(event, 'origin', { value: origin })
  Object.defineProperty(event, 'source', { value: source })
  window.dispatchEvent(event)
}

function emit(port: FakePort, event: SessionEvent): void {
  port.onmessage?.({ data: JSON.stringify(event) })
}

function status(sessionId: string, over: Partial<SessionStatusUpdate> = {}): SessionStatusUpdate {
  return { sessionId, state: 'running', reasonKey: null, claudeAlive: true, ...over }
}

interface Harness {
  readonly store: RunningSessionStore
  readonly cap: ClostaCapability
  readonly pushStatus: (updates: readonly SessionStatusUpdate[]) => void
}

let detach: (() => void) | null = null

afterEach(() => {
  detach?.()
  detach = null
})

function harness(over: Partial<ClostaCapability> = {}): Harness {
  let listener: ((u: readonly SessionStatusUpdate[]) => void) | null = null
  const cap = stubCapability({
    launchSession: vi.fn(async () => ({ status: 'launching' as const, sessionId: A })),
    sendPrompt: vi.fn(async () => {}),
    interruptSession: vi.fn(async () => {}),
    respondPermission: vi.fn(async () => {}),
    killSession: vi.fn(async () => {}),
    endSession: vi.fn(async () => {}),
    onSessionStatus: (l) => {
      listener = l
      return () => {
        listener = null
      }
    },
    ...over
  })
  const store = createRunningSessionStore(
    () => cap,
    () => 1_700_000_000_000
  )
  detach = store.attach(window)
  return { store, cap, pushStatus: (u) => listener?.(u) }
}

/** 1 本起動して port を繋いだ状態を作る。 */
async function launched(h: Harness, sessionId = A): Promise<FakePort> {
  vi.mocked(h.cap.launchSession).mockResolvedValueOnce({ status: 'launching', sessionId })
  await h.store.launch(cfg())
  const port = fakePort()
  deliverPort(sessionId, port)
  return port
}

function appendMessage(text: string): AppendMessage {
  return { role: 'user', content: [{ type: 'text', text }] } as unknown as AppendMessage
}

describe('running-session-store — 起動と port の受け渡し (FE-001)', () => {
  it('起動に成功すると行を足して選択する。拒否なら行を足さず理由を持つ', async () => {
    const h = harness()
    await h.store.launch(cfg())
    expect(h.store.getState().order).toEqual([A])
    expect(h.store.getState().selectedId).toBe(A)
    expect(h.store.getState().launch.phase).toBe('entry')

    vi.mocked(h.cap.launchSession).mockResolvedValueOnce({
      status: 'rejected',
      reasonKey: 'session-limit'
    })
    await h.store.launch(cfg('f2'))
    expect(h.store.getState().order).toEqual([A])
    expect(h.store.getState().launch).toMatchObject({
      phase: 'rejected',
      rejectReason: 'session-limit',
      lastConfig: cfg('f2')
    })
  })

  it('2 本の並行起動で port が handshake より先に逆順で届いても、各 port は自分のセッションにだけ繋がる (SC-006)', async () => {
    let resolveA!: (v: { status: 'launching'; sessionId: string }) => void
    let resolveB!: (v: { status: 'launching'; sessionId: string }) => void
    const h = harness({
      launchSession: vi
        .fn()
        .mockImplementationOnce(() => new Promise((r) => (resolveA = r)))
        .mockImplementationOnce(() => new Promise((r) => (resolveB = r)))
    })
    const pa = fakePort()
    const pb = fakePort()
    const la = h.store.launch(cfg('f1'))
    const lb = h.store.launch(cfg('f2'))
    // port は B → A の順に、どちらの handshake よりも先に届く。
    deliverPort(B, pb)
    deliverPort(A, pa)
    resolveB({ status: 'launching', sessionId: B })
    await lb
    resolveA({ status: 'launching', sessionId: A })
    await la

    emit(pa, { kind: 'state', state: 'running' })
    emit(pb, { kind: 'state', state: 'done' })
    const s = h.store.getState()
    expect(s.sessions[A]?.runState).toBe('running')
    expect(s.sessions[B]?.runState).toBe('done')
    expect(s.sessions[A]?.config.folderId).toBe('f1')
    expect(s.sessions[B]?.config.folderId).toBe('f2')
    expect(pa.close).not.toHaveBeenCalled()
    expect(pb.close).not.toHaveBeenCalled()
  })

  it('起動要求の無い sessionId と閉じた sessionId の port は close して捨てる', async () => {
    const h = harness()
    const stray = fakePort()
    deliverPort(B, stray)
    expect(stray.close).toHaveBeenCalled()

    const port = await launched(h)
    h.pushStatus([status(A, { state: 'done', claudeAlive: false })])
    h.store.close(A)
    expect(port.close).toHaveBeenCalled()
    const late = fakePort()
    deliverPort(A, late)
    expect(late.close).toHaveBeenCalled()
  })

  it('他 origin の port は受け取らない', async () => {
    const h = harness()
    await h.store.launch(cfg())
    const foreign = fakePort()
    deliverPort(A, foreign, 'https://evil.example')
    expect(foreign.start).not.toHaveBeenCalled()
    // 受け取らない port は close して捨てる (pr-gate R1 security L-001)。
    expect(foreign.close).toHaveBeenCalled()
  })

  it('別の window (source 不一致) と標識の違う message の port も受け取らず close する (pr-gate R1 security L-002)', async () => {
    const h = harness()
    await h.store.launch(cfg())
    const otherSource = fakePort()
    deliverPort(A, otherSource, window.location.origin, null)
    expect(otherSource.start).not.toHaveBeenCalled()
    expect(otherSource.close).toHaveBeenCalled()
    const wrongMarker = fakePort()
    deliverPort(A, wrongMarker, window.location.origin, window, 'not-a-session-port')
    expect(wrongMarker.start).not.toHaveBeenCalled()
    expect(wrongMarker.close).toHaveBeenCalled()
  })

  it('壊れた本文は破棄し、他のセッションに影響させない (FR-012)', async () => {
    const h = harness()
    const pa = await launched(h, A)
    const pb = await launched(h, B)
    pa.onmessage?.({ data: '{not json' })
    pa.onmessage?.({ data: JSON.stringify({ kind: 'state', state: 'bogus' }) })
    pa.onmessage?.({ data: { kind: 'state', state: 'running' } }) // 文字列でない本文
    emit(pb, { kind: 'state', state: 'running' })
    expect(h.store.getState().sessions[A]?.runState).toBe('launching')
    expect(h.store.getState().sessions[B]?.runState).toBe('running')
  })
})

describe('running-session-store — 状態の導出 (FR-009 / FR-010)', () => {
  it('done の行は生存フラグで「応答待ち」と「終了済み」に分かれ、終了済みは送信できない終端になる', async () => {
    const h = harness()
    const port = await launched(h)
    emit(port, { kind: 'state', state: 'done' })
    h.pushStatus([status(A, { state: 'done' })])
    expect(rowStatus(viewOf(h.store.getState(), A))).toBe('waiting')
    expect(viewOf(h.store.getState(), A).terminal).toBe(false)

    h.pushStatus([status(A, { state: 'done', claudeAlive: false })])
    expect(rowStatus(viewOf(h.store.getState(), A))).toBe('ended')
    expect(viewOf(h.store.getState(), A).terminal).toBe(true)
  })

  it('状態通知の error (異常終了の合成) は port より優先し、理由キーを表示に使う', async () => {
    const h = harness()
    const port = await launched(h)
    emit(port, { kind: 'state', state: 'running' })
    h.pushStatus([
      status(A, { state: 'error', reasonKey: 'supervisor-exited', claudeAlive: false })
    ])
    const view = viewOf(h.store.getState(), A)
    expect(view.runState).toBe('error')
    expect(view.failureReason).toBe('supervisor-exited')
    expect(rowStatus(view)).toBe('failed')
  })

  it('port が閉じても (終了済みになっても) transcript は残る', async () => {
    const h = harness()
    const port = await launched(h)
    emit(port, {
      kind: 'message',
      message: {
        id: 'm1',
        role: 'assistant',
        parts: [{ type: 'text', text: 'こんにちは' }],
        createdAt: 1
      }
    })
    h.pushStatus([status(A, { state: 'done', claudeAlive: false })])
    expect(h.store.getState().sessions[A]?.messages).toHaveLength(1)
  })

  it('操作は状態に応じてだけ出る (起動中は強制終了だけ / 応答中は中断と強制終了 / 応答待ちは終了 / 終了済みは閉じる)', async () => {
    const h = harness()
    const port = await launched(h)
    const actions = (): ReturnType<typeof availableActions> =>
      availableActions(viewOf(h.store.getState(), A), h.store.getState().sessions[A])

    expect(actions()).toMatchObject({ end: false, interrupt: false, kill: true, close: false })
    emit(port, { kind: 'state', state: 'running' })
    expect(actions()).toMatchObject({ end: false, interrupt: true, kill: true, close: false })
    emit(port, { kind: 'state', state: 'done' })
    expect(actions()).toMatchObject({ end: true, endPending: false, interrupt: false, kill: false })
    h.store.end(A)
    // 終了の処理中も強制終了は出す (期限内に終わらないときに止める手段を失わない。pr-gate R2 po M-104)。
    expect(actions()).toMatchObject({ end: true, endPending: true, interrupt: false, kill: true })
    expect(rowStatus(viewOf(h.store.getState(), A))).toBe('ending')
    h.pushStatus([status(A, { state: 'done', claudeAlive: false })])
    expect(actions()).toMatchObject({ end: false, interrupt: false, kill: false, close: true })
  })

  it('終了を押した直後に応答中へ移った (スレッドが終了を受けなかった) ら「終了中」を外し、応答待ちに戻れば終了を押し直せる (pr-gate R2 po M-104 / R3 po L-201)', async () => {
    const h = harness()
    const port = await launched(h)
    const actions = (): ReturnType<typeof availableActions> =>
      availableActions(viewOf(h.store.getState(), A), h.store.getState().sessions[A])
    emit(port, { kind: 'state', state: 'done' })
    h.store.end(A)
    // キューの dispatch が先にスレッドへ届き、スレッドは running で終了を捨てた。
    emit(port, { kind: 'state', state: 'running' })
    expect(rowStatus(viewOf(h.store.getState(), A))).toBe('running')
    expect(actions()).toMatchObject({ endPending: false, interrupt: true, kill: true })
    emit(port, { kind: 'state', state: 'done' })
    expect(actions()).toMatchObject({ end: true, endPending: false })
  })
})

describe('running-session-store — 制御の宛先と終わらせ方 (FR-010 / FR-011)', () => {
  it('送信・中断・承認は引数のセッションにだけ届く', async () => {
    const h = harness()
    await launched(h, A)
    await launched(h, B)
    h.store.send(B, 'B へ')
    h.store.interrupt(A)
    h.store.respond(B, 'perm-1', 'allow')
    expect(h.cap.sendPrompt).toHaveBeenCalledWith(B, 'B へ')
    expect(h.cap.sendPrompt).toHaveBeenCalledTimes(1)
    expect(h.cap.interruptSession).toHaveBeenCalledWith(A)
    expect(h.cap.respondPermission).toHaveBeenCalledWith(B, 'perm-1', 'allow', 'once')
  })

  it('下書きはセッションごとに保たれ、書き込みは state を変えない (打鍵で再描画させない。SC-003)', async () => {
    const h = harness()
    await launched(h, A)
    await launched(h, B)
    h.store.setDraft(A, 'A の下書き')
    h.store.select(B)
    h.store.setDraft(B, 'B の下書き')
    const before = h.store.getState()
    h.store.setDraft(A, 'A の下書き')
    expect(h.store.getState()).toBe(before)
    h.store.select(A)
    expect(h.store.getDraft(A)).toBe('A の下書き')
    expect(h.store.getDraft(B)).toBe('B の下書き')
  })

  it('選択の切り替えでは kill を送らない (FR-008)', async () => {
    const h = harness()
    await launched(h, A)
    await launched(h, B)
    h.store.select(A)
    h.store.select(null)
    h.store.select(B)
    expect(h.cap.killSession).not.toHaveBeenCalled()
  })

  it('終了は 1 回だけ送り、終了の処理中・強制終了の後は送信できない (R3-H-04)', async () => {
    const h = harness()
    const port = await launched(h, A)
    emit(port, { kind: 'state', state: 'done' })
    h.store.end(A)
    h.store.end(A)
    expect(h.cap.endSession).toHaveBeenCalledTimes(1)
    h.store.send(A, '終了中の送信')
    expect(h.cap.sendPrompt).not.toHaveBeenCalled()

    const portB = await launched(h, B)
    emit(portB, { kind: 'state', state: 'running' })
    h.store.kill(B)
    expect(h.cap.killSession).toHaveBeenCalledWith(B)
    expect(portB.close).not.toHaveBeenCalled() // 終わりまでの本文と終了の通知を受け取る
    h.store.send(B, '強制終了後の送信')
    expect(h.cap.sendPrompt).not.toHaveBeenCalled()
  })

  it('end-forced を受けると強制終了に落ちたことを持つ', async () => {
    const h = harness()
    const port = await launched(h)
    emit(port, { kind: 'end-forced' })
    expect(h.store.getState().sessions[A]?.endForced).toBe(true)
  })

  it('閉じると行と保持を消し、表示中なら選択を外す。表示していない行を閉じても選択は動かない', async () => {
    const h = harness()
    await launched(h, A)
    await launched(h, B)
    h.pushStatus([
      status(A, { state: 'done', claudeAlive: false }),
      status(B, { state: 'done', claudeAlive: false })
    ])
    h.store.select(B)
    h.store.close(A)
    expect(h.store.getState().order).toEqual([B])
    expect(h.store.getState().selectedId).toBe(B)
    h.store.close(B)
    expect(h.store.getState().order).toEqual([])
    expect(h.store.getState().selectedId).toBeNull()
    expect(h.store.getState().statuses).toEqual({})
    // 終了済みを閉じるだけなので kill は送らない。
    expect(h.cap.killSession).not.toHaveBeenCalled()
  })

  it('失敗したセッションを閉じると、起動ダイアログに前回の設定と理由を戻す (X-4 US-1 AC7)', async () => {
    const h = harness()
    const port = await launched(h)
    emit(port, { kind: 'failure', reasonKey: 'provider-error' })
    h.pushStatus([status(A, { state: 'error', reasonKey: 'provider-error', claudeAlive: false })])
    h.store.close(A)
    expect(h.store.getState().launch).toMatchObject({
      previousFailure: 'provider-error',
      lastConfig: cfg()
    })
  })

  it('使用中に失敗したセッションを閉じても、戻る設定は最後に起動した別のセッションでなくそのセッションのもの (pr-gate R1 po M-005)', async () => {
    const h = harness()
    const portA = await launched(h, A) // folder f1
    emit(portA, {
      kind: 'message',
      message: { id: 'm1', role: 'assistant', parts: [{ type: 'text', text: 'hi' }], createdAt: 1 }
    })
    vi.mocked(h.cap.launchSession).mockResolvedValueOnce({ status: 'launching', sessionId: B })
    await h.store.launch(cfg('f2')) // 最後に起動したのは B (f2)
    h.pushStatus([
      status(A, { state: 'error', reasonKey: 'supervisor-exited', claudeAlive: false })
    ])
    h.store.close(A)
    expect(h.store.getState().launch).toMatchObject({
      previousFailure: 'supervisor-exited',
      lastConfig: cfg('f1')
    })
  })

  it('最初のプロンプトを送ると promptSent が立つ (プロンプト待ちの判定。pr-gate R1 po H-001)', async () => {
    const h = harness()
    await launched(h, A)
    expect(h.store.getState().sessions[A]?.promptSent).toBe(false)
    h.store.send(A, 'hi')
    expect(h.store.getState().sessions[A]?.promptSent).toBe(true)
  })
})

describe('running-session-store — 送信待ちキュー (X-2 をセッションごとに。FR-010)', () => {
  it('応答中に積んだ入力は、表示していなくても応答の完了で積んだセッションへ送られる', async () => {
    const h = harness()
    const port = await launched(h, A)
    await launched(h, B) // B を表示中にする
    emit(port, { kind: 'state', state: 'running' })
    h.store.queueOf(A)?.adapter.steer(appendMessage('次の指示'))
    expect(h.cap.sendPrompt).not.toHaveBeenCalled()
    emit(port, { kind: 'state', state: 'done' })
    expect(h.cap.sendPrompt).toHaveBeenCalledWith(A, '次の指示')
  })

  it('応答中に claude が終わると、積んだ入力は送らず取り消しにする', async () => {
    const h = harness()
    const port = await launched(h, A)
    emit(port, { kind: 'state', state: 'running' })
    h.store.queueOf(A)?.adapter.steer(appendMessage('届かない指示'))
    h.pushStatus([status(A, { state: 'running', claudeAlive: false })])
    emit(port, { kind: 'state', state: 'done' })
    expect(h.cap.sendPrompt).not.toHaveBeenCalled()
  })
})
