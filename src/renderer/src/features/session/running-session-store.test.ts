import { afterEach, describe, expect, it, vi } from 'vitest'

import type { AppendMessage, ThreadMessageLike } from '@assistant-ui/react'

import { SESSION_PORT_MESSAGE, type ClostaCapability } from '@domain/capability'
import type { SessionEvent } from '@domain/session/agent-session'
import type { ElicitationPrompt } from '@domain/session/elicitation'
import type { TranscriptPartDTO } from '@domain/session/transcript-dto'
import type { SessionLaunchConfig } from '@domain/session/launch-config'
import type { LiveSettingResult, RenameResult } from '@domain/session/live-settings'
import type { MeterUpdate } from '@domain/session/meter'
import type { InitReportMeter } from '@domain/session/session-init-report'
import type { SessionStatusUpdate } from '@domain/session/status-update'

import { stubCapability } from '@/test-support/capability'

import {
  createRunningSessionStore,
  slashCommandEntries,
  type RunningSessionStore,
  type SessionMeters,
  type SlashCommandEntry
} from './running-session-store'
import { EMPTY_SESSION_METERS } from './running-session-types'
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
    respondElicitation: vi.fn(async () => {}),
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

describe('running-session-store — 起動元 (O-3 FE-040 / 012 data-model §4「renderer の起動元」)', () => {
  it('起動元を capability の launchSession に渡し、lastConfig と組で lastOrigin とセッションの launchOrigin に入れる', async () => {
    const h = harness()
    await h.store.launch(cfg(), null, 'preset')
    expect(h.cap.launchSession).toHaveBeenCalledWith(cfg(), 'preset')
    expect(h.store.getState().launch).toMatchObject({
      phase: 'entry',
      lastConfig: cfg(),
      lastOrigin: 'preset'
    })
    expect(h.store.getState().sessions[A]?.launchOrigin).toBe('preset')
  })

  it('起動元の省略は manual (起動ダイアログを通らない呼び出し)', async () => {
    const h = harness()
    await h.store.launch(cfg())
    expect(h.cap.launchSession).toHaveBeenCalledWith(cfg(), 'manual')
    expect(h.store.getState().launch.lastOrigin).toBe('manual')
  })

  it('拒否されても受け付けられても lastOrigin は残る (前回の設定と同じ規則)', async () => {
    const h = harness()
    vi.mocked(h.cap.launchSession).mockResolvedValueOnce({
      status: 'rejected',
      reasonKey: 'session-limit'
    })
    await h.store.launch(cfg('f2'), null, 'preset')
    expect(h.store.getState().launch).toMatchObject({
      phase: 'rejected',
      lastConfig: cfg('f2'),
      lastOrigin: 'preset'
    })
    vi.mocked(h.cap.launchSession).mockRejectedValueOnce(new Error('ipc failed'))
    await h.store.launch(cfg('f3'), null, 'manual')
    expect(h.store.getState().launch).toMatchObject({
      phase: 'rejected',
      rejectReason: 'launch-failed',
      lastOrigin: 'manual'
    })
    await h.store.launch(cfg('f1'), null, 'preset')
    expect(h.store.getState().launch).toMatchObject({ phase: 'entry', lastOrigin: 'preset' })
  })

  it('告知を消しても (dismissLaunchNotice) lastOrigin が残る', async () => {
    const h = harness()
    vi.mocked(h.cap.launchSession).mockResolvedValueOnce({
      status: 'rejected',
      reasonKey: 'session-limit'
    })
    await h.store.launch(cfg(), null, 'preset')
    h.store.dismissLaunchNotice()
    expect(h.store.getState().launch).toMatchObject({
      phase: 'entry',
      rejectReason: null,
      lastConfig: cfg(),
      lastOrigin: 'preset'
    })
  })

  it('起動元で SessionLaunchConfig は変わらない (capability に渡る設定とセッションの config が同じ)', async () => {
    const h = harness()
    vi.mocked(h.cap.launchSession).mockResolvedValueOnce({ status: 'launching', sessionId: A })
    await h.store.launch(cfg(), null, 'preset')
    vi.mocked(h.cap.launchSession).mockResolvedValueOnce({ status: 'launching', sessionId: B })
    await h.store.launch(cfg(), null, 'manual')
    const [first, second] = vi.mocked(h.cap.launchSession).mock.calls
    expect(first?.[0]).toEqual(second?.[0])
    expect(h.store.getState().sessions[A]?.config).toEqual(cfg())
    expect(h.store.getState().sessions[B]?.config).toEqual(cfg())
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

  it('respond は answers を第 5 引数で渡し、ストアのどこにも回答の値が残らない (O-10)', async () => {
    const h = harness()
    await launched(h, A)
    h.store.respond(A, 'perm-1', 'allow', ['O10-MARKER-xyz'])
    expect(h.cap.respondPermission).toHaveBeenCalledWith(A, 'perm-1', 'allow', 'once', [
      'O10-MARKER-xyz'
    ])
    expect(JSON.stringify(h.store.getState())).not.toContain('O10-MARKER-xyz')
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

  it('失敗したセッションを閉じると、起動元も最後に起動した別のセッションのものでなくそのセッションのものに戻す (O-3 FE-040)', async () => {
    const h = harness()
    vi.mocked(h.cap.launchSession).mockResolvedValueOnce({ status: 'launching', sessionId: A })
    await h.store.launch(cfg('f1'), null, 'preset')
    const portA = fakePort()
    deliverPort(A, portA)
    vi.mocked(h.cap.launchSession).mockResolvedValueOnce({ status: 'launching', sessionId: B })
    await h.store.launch(cfg('f2'), null, 'manual') // 最後に起動したのは B (manual)
    expect(h.store.getState().launch.lastOrigin).toBe('manual')

    emit(portA, { kind: 'failure', reasonKey: 'provider-error' })
    h.pushStatus([status(A, { state: 'error', reasonKey: 'provider-error', claudeAlive: false })])
    h.store.close(A)
    expect(h.store.getState().launch).toMatchObject({
      previousFailure: 'provider-error',
      lastConfig: cfg('f1'),
      lastOrigin: 'preset'
    })
  })

  it('失敗していないセッションを閉じても起動元は変わらない (O-3 FE-040)', async () => {
    const h = harness()
    vi.mocked(h.cap.launchSession).mockResolvedValueOnce({ status: 'launching', sessionId: A })
    await h.store.launch(cfg('f1'), null, 'manual')
    vi.mocked(h.cap.launchSession).mockResolvedValueOnce({ status: 'launching', sessionId: B })
    await h.store.launch(cfg('f2'), null, 'preset')
    h.pushStatus([status(A, { state: 'done', claudeAlive: false })])
    h.store.close(A)
    expect(h.store.getState().launch).toMatchObject({ lastConfig: cfg('f2'), lastOrigin: 'preset' })
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

describe('running-session-store — tool の結果とシステムイベントの行 (O-2 FE-010)', () => {
  type EventPart = Extract<TranscriptPartDTO, { type: 'system-event' }>
  const event = (id: string, part: Partial<EventPart>): SessionEvent => ({
    kind: 'message',
    message: {
      id,
      role: 'system',
      parts: [
        {
          type: 'system-event',
          category: 'task',
          opens: false,
          name: '',
          detail: '',
          status: null,
          ...part
        }
      ],
      createdAt: 1
    }
  })
  const rows = (h: Harness): readonly ThreadMessageLike[] =>
    h.store.getState().sessions[A]!.messages
  const dataOf = (m: ThreadMessageLike | undefined): unknown =>
    m !== undefined && typeof m.content !== 'string' && m.content[0]?.type === 'data'
      ? m.content[0].data
      : undefined

  it('同じ id の更新は行を増やさず合成する。名前・状態の無い更新は前の値を保つ', async () => {
    const h = harness()
    const port = await launched(h, A)
    emit(
      port,
      event('task:t1', {
        opens: true,
        name: 'npm run build',
        detail: 'local_bash',
        status: 'running'
      })
    )
    emit(port, event('task:t1', { status: null })) // 状態の無い task_updated
    expect(rows(h)).toHaveLength(1)
    expect(dataOf(rows(h)[0])).toMatchObject({ name: 'npm run build', status: 'running' })
    emit(port, event('task:t1', { status: 'completed' }))
    expect(rows(h)).toHaveLength(1)
    expect(dataOf(rows(h)[0])).toEqual({
      category: 'task',
      opens: true,
      name: 'npm run build',
      detail: 'local_bash',
      status: 'completed'
    })
  })

  it('行の無い id への opens が false の更新は捨てる (隠した・前景の task)', async () => {
    const h = harness()
    const port = await launched(h, A)
    emit(port, event('task:hidden', { status: 'completed' }))
    expect(rows(h)).toHaveLength(0)
    // 受信の累計 (O-1 の観測点) は数える。
    expect(h.store.getState().receivedMessages).toBe(1)
  })

  it('tool の結果を埋めた同じ id の送り直しは差し替える', async () => {
    const h = harness()
    const port = await launched(h, A)
    const call = (result: string | null): SessionEvent => ({
      kind: 'message',
      message: {
        id: 'a1',
        role: 'assistant',
        parts: [
          {
            type: 'tool-call',
            toolCallId: 'c1',
            toolName: 'Bash',
            argsText: '{"command":"ls"}',
            result,
            isError: false,
            truncated: false,
            children: []
          }
        ],
        createdAt: 1
      }
    })
    emit(port, call(null))
    emit(port, call('out.txt'))
    expect(rows(h)).toHaveLength(1)
    const content = rows(h)[0]!.content
    expect(
      typeof content !== 'string' && content[0]?.type === 'tool-call' && content[0].result
    ).toBe('out.txt')
  })
})

describe('running-session-store — 計量の受け口 (O-4 FE-004 / 014 data-model §2「renderer の保持」)', () => {
  const meter = (m: MeterUpdate): SessionEvent => ({ kind: 'meter', meter: m })
  const turn = (costUsd: number): MeterUpdate => ({
    type: 'turn',
    costUsd,
    turns: 1,
    models: [],
    permissionDenials: 0
  })
  const tool = (toolUseId: string, elapsedSeconds: number): SessionEvent =>
    meter({ type: 'tool-elapsed', toolUseId, elapsedSeconds })
  const metersOf = (h: Harness, id = A): SessionMeters | undefined => h.store.getState().meters[id]
  const assistant = (id: string): SessionEvent => ({
    kind: 'message',
    message: { id, role: 'assistant', parts: [{ type: 'text', text: 'hi' }], createdAt: 1 }
  })
  const systemRow: SessionEvent = {
    kind: 'message',
    message: {
      id: 'task:t1',
      role: 'system',
      parts: [
        {
          type: 'system-event',
          category: 'task',
          opens: true,
          name: '',
          detail: 'local_agent',
          status: 'running'
        }
      ],
      createdAt: 1
    }
  }

  it('各 type の最新の値を持ち、sessions の参照を変えず、receivedMessages に数えない', async () => {
    const h = harness()
    const port = await launched(h)
    const sessions = h.store.getState().sessions
    emit(port, meter(turn(0.25)))
    emit(port, meter({ type: 'context', usedTokens: 1_000 }))
    emit(port, meter({ type: 'context', usedTokens: 2_000 }))
    emit(port, meter({ type: 'permission-mode', mode: 'plan' }))
    emit(port, meter({ type: 'thinking', estimatedTokens: 300 }))
    emit(port, tool('t1', 4))
    const rateLimit: MeterUpdate = {
      type: 'rate-limit',
      status: 'allowed_warning',
      limitType: 'five_hour',
      utilizationPct: 85,
      resetsAtSec: 1_760_000_000,
      usingOverage: false
    }
    emit(port, meter(rateLimit))
    const m = metersOf(h)
    expect(m?.lastTurn).toEqual(turn(0.25))
    expect(m?.contextUsed).toBe(2_000)
    expect(m?.permissionMode).toBe('plan')
    expect(m?.thinkingTokens).toBe(300)
    expect(m?.rateLimit).toEqual(rateLimit)
    expect([...(m?.toolElapsed ?? [])]).toEqual([['t1', 4]])
    expect(h.store.getState().sessions).toBe(sessions)
    expect(h.store.getState().receivedMessages).toBe(0)
  })

  it('権限モードを起動の設定・lastConfig に書き戻さない', async () => {
    const h = harness()
    const port = await launched(h)
    emit(port, meter({ type: 'permission-mode', mode: 'unknown' }))
    expect(h.store.getState().sessions[A]?.config.permissionMode).toBe('default')
    expect(h.store.getState().launch.lastConfig).toEqual(cfg())
  })

  it('思考のトークンは主ループの assistant のメッセージと turn で null に戻り、システムイベントの行では残る', async () => {
    const h = harness()
    const port = await launched(h)
    emit(port, meter({ type: 'thinking', estimatedTokens: 100 }))
    emit(port, systemRow)
    expect(metersOf(h)?.thinkingTokens).toBe(100)
    emit(port, assistant('a1'))
    expect(metersOf(h)?.thinkingTokens).toBeNull()
    emit(port, meter({ type: 'thinking', estimatedTokens: 200 }))
    emit(port, meter(turn(0.1)))
    expect(metersOf(h)?.thinkingTokens).toBeNull()
  })

  it('tool の経過時間は turn で空になる', async () => {
    const h = harness()
    const port = await launched(h)
    emit(port, tool('t1', 1))
    emit(port, tool('t2', 2))
    emit(port, meter(turn(0)))
    expect(metersOf(h)?.toolElapsed.size).toBe(0)
  })

  it('65 個目の tool で更新の最も古い id が落ち、更新の続く id は残る', async () => {
    const h = harness()
    const port = await launched(h)
    for (let i = 0; i < 64; i++) emit(port, tool(`t${i}`, 1))
    // t0 は更新が続く (末尾へ移る)。更新の最も古いのは t1 になる。
    emit(port, tool('t0', 2))
    emit(port, tool('t64', 1))
    const elapsed = metersOf(h)!.toolElapsed
    expect(elapsed.size).toBe(64)
    expect(elapsed.has('t1')).toBe(false)
    expect(elapsed.get('t0')).toBe(2)
    expect(elapsed.get('t64')).toBe(1)
  })

  it('2 つのセッションの値が混ざらない', async () => {
    const h = harness()
    const portA = await launched(h, A)
    const portB = await launched(h, B)
    emit(portA, meter({ type: 'context', usedTokens: 111 }))
    emit(portB, meter({ type: 'context', usedTokens: 222 }))
    emit(portB, tool('tb', 3))
    expect(metersOf(h, A)?.contextUsed).toBe(111)
    expect(metersOf(h, B)?.contextUsed).toBe(222)
    expect(metersOf(h, A)?.toolElapsed.size).toBe(0)
  })

  it('background-tasks は最新の値で置き換わり (0 件は空の配列)、起動直後は空、receivedMessages を増やさない (O-11 FE-020)', async () => {
    const h = harness()
    const port = await launched(h)
    expect(metersOf(h)?.backgroundTasks ?? []).toEqual([])
    const sessions = h.store.getState().sessions
    emit(
      port,
      meter({ type: 'background-tasks', tasks: [{ taskId: 'a', taskType: 'local_bash' }] })
    )
    expect(metersOf(h)?.backgroundTasks).toEqual([{ taskId: 'a', taskType: 'local_bash' }])
    emit(
      port,
      meter({ type: 'background-tasks', tasks: [{ taskId: 'b', taskType: 'local_agent' }] })
    )
    expect(metersOf(h)?.backgroundTasks).toEqual([{ taskId: 'b', taskType: 'local_agent' }])
    emit(port, meter({ type: 'background-tasks', tasks: [] }))
    expect(metersOf(h)?.backgroundTasks).toEqual([])
    emit(port, meter({ type: 'context', usedTokens: 5 }))
    expect(metersOf(h)?.backgroundTasks).toEqual([])
    expect(h.store.getState().sessions).toBe(sessions)
    expect(h.store.getState().receivedMessages).toBe(0)
  })

  it('background-tasks は閉じたセッションに書かない', async () => {
    const h = harness()
    const port = await launched(h)
    emit(port, meter({ type: 'background-tasks', tasks: [] }))
    h.store.close(A)
    emit(
      port,
      meter({ type: 'background-tasks', tasks: [{ taskId: 'a', taskType: 'local_bash' }] })
    )
    expect(h.store.getState().meters).toEqual({})
  })

  it('失敗の後も close までは最後の値が残り、閉じた後は meters[id] が undefined で、届いた meter は捨てる', async () => {
    const h = harness()
    const port = await launched(h)
    emit(port, meter(turn(0.5)))
    emit(port, { kind: 'failure', reasonKey: 'provider-error' })
    h.pushStatus([status(A, { state: 'error', reasonKey: 'provider-error', claudeAlive: false })])
    expect(metersOf(h)?.lastTurn?.costUsd).toBe(0.5)
    h.store.close(A)
    expect(metersOf(h)).toBeUndefined()
    emit(port, meter({ type: 'context', usedTokens: 1 }))
    expect(metersOf(h)).toBeUndefined()
    expect(h.store.getState().meters).toEqual({})
  })
})

describe('running-session-store — 構成の受け口 (O-5 FE-001 / 015 data-model §2「renderer の保持」)', () => {
  const meter = (m: MeterUpdate): SessionEvent => ({ kind: 'meter', meter: m })
  const metersOf = (h: Harness, id = A): SessionMeters | undefined => h.store.getState().meters[id]
  const init = (
    slashCommands: readonly string[],
    over: Partial<InitReportMeter> = {}
  ): MeterUpdate => ({
    type: 'init-report',
    model: 'claude-sonnet-4-5',
    mcpServers: [{ name: 'github', status: 'connected' }],
    tools: ['Bash'],
    skills: [],
    plugins: [],
    slashCommands,
    omitted: 0,
    ...over
  })
  const commands = (
    list: readonly { name: string; description?: string; argumentHint?: string }[]
  ): MeterUpdate => ({
    type: 'commands',
    commands: list.map((c) => ({
      name: c.name,
      description: c.description ?? '',
      argumentHint: c.argumentHint ?? ''
    })),
    omitted: 0
  })
  const entries = (h: Harness, id = A): readonly SlashCommandEntry[] =>
    slashCommandEntries(metersOf(h, id)!)
  /** `a` (説明と hint つき) と `b`。 */
  const abCommands = commands([
    { name: 'a', description: 'da', argumentHint: '<x>' },
    { name: 'b' }
  ])

  it('init-report の後の commands で一覧が置き換わり、説明と argumentHint が付く', async () => {
    const h = harness()
    const port = await launched(h)
    emit(port, meter(init(['a'])))
    expect(entries(h)).toEqual([{ name: 'a', description: null, argumentHint: null }])
    emit(port, meter(abCommands))
    expect(entries(h)).toEqual([
      { name: 'a', description: 'da', argumentHint: '<x>' },
      { name: 'b', description: '', argumentHint: '' }
    ])
    expect(metersOf(h)?.slashCommandSource).toBe('commands')
  })

  it('commands の後に MCP の状態だけが違う init-report が来ても、一覧と説明・argumentHint が変わらない', async () => {
    const h = harness()
    const port = await launched(h)
    emit(port, meter(init(['a'])))
    emit(port, meter(abCommands))
    const before = entries(h)
    emit(port, meter(init(['a'], { mcpServers: [{ name: 'github', status: 'failed' }] })))
    expect(entries(h)).toEqual(before)
    expect(metersOf(h)?.slashCommandSource).toBe('commands')
    expect(metersOf(h)?.initReport?.mcpServers).toEqual([{ name: 'github', status: 'failed' }])
  })

  it('commands の後に slashCommands が変わった init-report で名前の集合が置き換わり、commands にある名前は説明を保つ', async () => {
    const h = harness()
    const port = await launched(h)
    emit(port, meter(init(['a'])))
    emit(port, meter(abCommands))
    emit(port, meter(init(['a', 'c'])))
    expect(entries(h)).toEqual([
      { name: 'a', description: 'da', argumentHint: '<x>' },
      { name: 'c', description: null, argumentHint: null }
    ])
    expect(metersOf(h)?.slashCommandSource).toBe('init-report')
  })

  it('commands が無いまま init-report だけなら名前だけ', async () => {
    const h = harness()
    const port = await launched(h)
    emit(port, meter(init(['x', 'y'])))
    expect(entries(h)).toEqual([
      { name: 'x', description: null, argumentHint: null },
      { name: 'y', description: null, argumentHint: null }
    ])
  })

  it('init-report の /a と commands の a は同じ名前として説明と hint を引く (書式の違い)', async () => {
    const h = harness()
    const port = await launched(h)
    emit(port, meter(commands([{ name: 'a', description: 'da', argumentHint: '<x>' }])))
    // decoder を通らない値で `/` 付きが残っても引き当てが外れないことを、ストアに直に入れて確かめる。
    h.store.setState((s) => ({
      meters: {
        ...s.meters,
        [A]: {
          ...s.meters[A]!,
          initReport: init(['/a']) as InitReportMeter,
          slashCommandSource: 'init-report'
        }
      }
    }))
    expect(entries(h)).toEqual([{ name: 'a', description: 'da', argumentHint: '<x>' }])
  })

  it('commands の名前 __proto__ / constructor で例外が出ない', async () => {
    const h = harness()
    const port = await launched(h)
    expect(() => {
      const protoNames = [{ name: '__proto__', description: 'p' }, { name: 'constructor' }]
      emit(port, meter(commands(protoNames)))
      emit(port, meter(init(['__proto__', 'constructor', 'toString'])))
    }).not.toThrow()
    expect(entries(h)).toEqual([
      { name: '__proto__', description: 'p', argumentHint: '' },
      { name: 'constructor', description: '', argumentHint: '' },
      { name: 'toString', description: null, argumentHint: null }
    ])
  })

  it('initReport の更新で sessions の参照が変わらず、receivedMessages を増やさない', async () => {
    const h = harness()
    const port = await launched(h)
    const sessions = h.store.getState().sessions
    emit(port, meter(init(['a'])))
    emit(port, meter(commands([{ name: 'a' }])))
    expect(h.store.getState().sessions).toBe(sessions)
    expect(h.store.getState().receivedMessages).toBe(0)
    expect(metersOf(h)?.initReport?.model).toBe('claude-sonnet-4-5')
  })

  it('2 つのセッションの値が混ざらない', async () => {
    const h = harness()
    const portA = await launched(h, A)
    const portB = await launched(h, B)
    emit(portA, meter(init(['a'], { model: 'claude-opus-4-1' })))
    emit(portB, meter(commands([{ name: 'b', description: 'db' }])))
    expect(metersOf(h, A)?.initReport?.model).toBe('claude-opus-4-1')
    expect(metersOf(h, A)?.commands).toBeNull()
    expect(metersOf(h, B)?.initReport).toBeNull()
    expect(entries(h, A).map((e) => e.name)).toEqual(['a'])
    expect(entries(h, B)).toEqual([{ name: 'b', description: 'db', argumentHint: '' }])
  })

  it('閉じた後の meters[id] は undefined で、届いた構成は捨てる', async () => {
    const h = harness()
    const port = await launched(h)
    emit(port, meter(init(['a'])))
    h.pushStatus([status(A, { state: 'done', claudeAlive: false })])
    h.store.close(A)
    expect(metersOf(h)).toBeUndefined()
    emit(port, meter(init(['b'])))
    emit(port, meter(commands([{ name: 'c' }])))
    expect(metersOf(h)).toBeUndefined()
  })

  it('一覧は出所が無ければ空', () => {
    expect(slashCommandEntries(EMPTY_SESSION_METERS)).toEqual([])
  })
})

describe('running-session-store — 取り消し (O-6 FE-010 / 016 data-model §1「戻らない仕組み」)', () => {
  const meter = (m: MeterUpdate): SessionEvent => ({ kind: 'meter', meter: m })
  const retraction = (...messageIds: string[]): SessionEvent =>
    meter({ type: 'retraction', messageIds })
  const metersOf = (h: Harness, id = A): SessionMeters | undefined => h.store.getState().meters[id]
  const idsOf = (h: Harness, id = A): (string | undefined)[] =>
    h.store.getState().sessions[id]?.messages.map((m) => m.id) ?? []
  const toolMessage = (id: string, toolCallId: string): SessionEvent => ({
    kind: 'message',
    message: {
      id,
      role: 'assistant',
      parts: [
        {
          type: 'tool-call',
          toolCallId,
          toolName: 'Bash',
          argsText: '{}',
          result: null,
          isError: false,
          truncated: false,
          children: []
        }
      ],
      createdAt: 1
    }
  })
  const textMessage = (id: string): SessionEvent => ({
    kind: 'message',
    message: { id, role: 'assistant', parts: [{ type: 'text', text: 'hi' }], createdAt: 1 }
  })

  it('同じセッションの messages から外す (冪等・知らない id・別のセッションの id に触れない)', async () => {
    const h = harness()
    const portA = await launched(h, A)
    const portB = await launched(h, B)
    emit(portA, textMessage('m1'))
    emit(portA, textMessage('m2'))
    emit(portB, textMessage('m1'))
    emit(portA, retraction('m1', 'unknown'))
    expect(idsOf(h, A)).toEqual(['m2'])
    expect(idsOf(h, B)).toEqual(['m1'])
    emit(portA, retraction('m1'))
    expect(idsOf(h, A)).toEqual(['m2'])
  })

  it('外した id の後の message を足さない。別のセッションには効かない', async () => {
    const h = harness()
    const portA = await launched(h, A)
    const portB = await launched(h, B)
    emit(portA, textMessage('m1'))
    emit(portA, retraction('m1'))
    emit(portA, textMessage('m1'))
    emit(portB, textMessage('m1'))
    expect(idsOf(h, A)).toEqual([])
    expect(idsOf(h, B)).toEqual(['m1'])
  })

  it('tool-elapsed から取り消したメッセージの tool の id を外し、承認の要求は消さない', async () => {
    const h = harness()
    const port = await launched(h)
    emit(port, toolMessage('m1', 't1'))
    emit(port, toolMessage('m2', 't2'))
    emit(port, meter({ type: 'tool-elapsed', toolUseId: 't1', elapsedSeconds: 3 }))
    emit(port, meter({ type: 'tool-elapsed', toolUseId: 't2', elapsedSeconds: 4 }))
    emit(port, {
      kind: 'permission-request',
      request: { requestId: 'r1', toolName: 'Bash', input: '{}', scope: 'once' }
    })
    emit(port, retraction('m1'))
    expect([...(metersOf(h)?.toolElapsed.keys() ?? [])]).toEqual(['t2'])
    expect(h.store.getState().sessions[A]?.pending?.requestId).toBe('r1')
  })

  it('receivedMessages を増やさず、他の種類の meter は sessions の参照を変えない', async () => {
    const h = harness()
    const port = await launched(h)
    emit(port, textMessage('m1'))
    const received = h.store.getState().receivedMessages
    emit(port, retraction('m1'))
    expect(h.store.getState().receivedMessages).toBe(received)
    const sessions = h.store.getState().sessions
    emit(port, meter({ type: 'context', usedTokens: 5 }))
    expect(h.store.getState().sessions).toBe(sessions)
  })

  it('閉じたセッションには書かない。close() で外した id の記憶を消す', async () => {
    const h = harness()
    const port = await launched(h, A)
    emit(port, textMessage('m1'))
    emit(port, retraction('m1'))
    h.store.close(A)
    emit(port, retraction('m1'))
    emit(port, textMessage('m1'))
    expect(h.store.getState().sessions[A]).toBeUndefined()
    // 別のセッションに同じ id の message が届けば足される (記憶はセッションごと。close で消えている)。
    const portB = await launched(h, B)
    emit(portB, textMessage('m1'))
    expect(idsOf(h, B)).toEqual(['m1'])
  })

  it('メッセージの数が減り、隠れた古いメッセージの件数が直る', async () => {
    const h = harness()
    const port = await launched(h)
    for (let i = 0; i < 3; i++) emit(port, textMessage(`m${i}`))
    emit(port, retraction('m0', 'm1'))
    expect(idsOf(h)).toEqual(['m2'])
  })
})

describe('running-session-store — MCP サーバーの問い (O-10 FE-020 / 018 data-model §4)', () => {
  const E1 = '33333333-3333-4333-8333-333333333333'
  const E2 = '44444444-4444-4444-8444-444444444444'
  const prompt = (requestId: string): ElicitationPrompt => ({
    requestId,
    serverName: 's',
    title: '',
    message: 'm',
    mode: 'form',
    url: null,
    fields: [{ key: 'a', label: 'a', description: '', required: false, type: 'string' }]
  })
  const idsOfCards = (h: Harness, id = A): string[] =>
    (h.store.getState().sessions[id]?.elicitations ?? []).map((e) => e.requestId)

  it('届いた順に足し、同じ requestId は足さず、receivedMessages に数えない', async () => {
    const h = harness()
    const port = await launched(h)
    emit(port, { kind: 'elicitation-request', request: prompt(E1) })
    emit(port, { kind: 'elicitation-request', request: prompt(E2) })
    emit(port, { kind: 'elicitation-request', request: prompt(E1) })
    expect(idsOfCards(h)).toEqual([E1, E2])
    expect(h.store.getState().receivedMessages).toBe(0)
  })

  it('respondElicitation はカードを外してから capability に届け、値をストアに残さない', async () => {
    const h = harness()
    const port = await launched(h)
    emit(port, { kind: 'elicitation-request', request: prompt(E1) })
    h.store.respondElicitation(A, E1, 'accept', { a: 'O10-MARKER-xyz' })
    expect(idsOfCards(h)).toEqual([])
    expect(h.cap.respondElicitation).toHaveBeenCalledWith(A, E1, 'accept', {
      a: 'O10-MARKER-xyz'
    })
    expect(JSON.stringify(h.store.getState())).not.toContain('O10-MARKER-xyz')
  })

  it('failure・kill・close・interrupted / error / done で外れ、running / awaiting_permission では残る', async () => {
    const h = harness()
    const port = await launched(h)
    emit(port, { kind: 'elicitation-request', request: prompt(E1) })
    emit(port, { kind: 'state', state: 'running' })
    emit(port, { kind: 'state', state: 'awaiting_permission' })
    expect(idsOfCards(h)).toEqual([E1])
    for (const state of ['interrupted', 'error', 'done'] as const) {
      emit(port, { kind: 'elicitation-request', request: prompt(E1) })
      emit(port, { kind: 'state', state })
      expect(idsOfCards(h)).toEqual([])
    }
    emit(port, { kind: 'elicitation-request', request: prompt(E1) })
    emit(port, { kind: 'failure', reasonKey: 'supervisor-exited' })
    expect(idsOfCards(h)).toEqual([])
    h.store.close(A)
    expect(h.store.getState().sessions[A]).toBeUndefined()
  })

  it('kill で外れる', async () => {
    const h = harness()
    const port = await launched(h)
    emit(port, { kind: 'elicitation-request', request: prompt(E1) })
    h.store.kill(A)
    expect(idsOfCards(h)).toEqual([])
  })
})

describe('running-session-store — 実行中の設定の変更 (023 FE-001 / data-model §8.1)', () => {
  it('4 つのフィールドの初期値は null', async () => {
    const h = harness()
    await launched(h, A)
    const s = h.store.getState().sessions[A]
    expect(s).toMatchObject({
      currentModelId: null,
      name: null,
      changing: null,
      settingError: null
    })
  })

  it('beginSetting / endSetting の遷移。失敗で settingError が立ち、次の beginSetting で消える', async () => {
    const h = harness()
    await launched(h, A)
    h.store.beginSetting(A, 'permission-mode')
    expect(h.store.getState().sessions[A]?.changing).toBe('permission-mode')
    h.store.endSetting(A, 'permission-mode', false)
    expect(h.store.getState().sessions[A]).toMatchObject({
      changing: null,
      settingError: 'permission-mode'
    })
    h.store.beginSetting(A, 'model')
    expect(h.store.getState().sessions[A]).toMatchObject({ changing: 'model', settingError: null })
    h.store.endSetting(A, 'model', true)
    expect(h.store.getState().sessions[A]).toMatchObject({ changing: null, settingError: null })
  })

  it('知らない行・終わった行への endSetting を無視する', async () => {
    const h = harness()
    await launched(h, A)
    h.store.beginSetting(A, 'name')
    h.pushStatus([status(A, { state: 'done', claudeAlive: false })])
    const before = h.store.getState()
    h.store.endSetting(A, 'name', false)
    h.store.endSetting(B, 'name', false)
    h.store.beginSetting(B, 'name')
    expect(h.store.getState()).toBe(before)
  })

  it('どの操作でも config が同じ参照のまま', async () => {
    const h = harness()
    await launched(h, A)
    const config = h.store.getState().sessions[A]?.config
    h.store.beginSetting(A, 'model')
    h.store.endSetting(A, 'model', false)
    h.store.beginSetting(A, 'permission-mode')
    h.store.endSetting(A, 'permission-mode', true)
    expect(h.store.getState().sessions[A]?.config).toBe(config)
  })

  it('setPermissionMode は capability を 1 回呼び、結果までは changing で、成功で戻る。config は同じ参照', async () => {
    let resolve: (r: LiveSettingResult) => void = () => undefined
    const setSessionPermissionMode = vi.fn(
      () => new Promise<LiveSettingResult>((r) => (resolve = r))
    )
    const h = harness({ setSessionPermissionMode })
    await launched(h, A)
    const config = h.store.getState().sessions[A]?.config
    h.store.setPermissionMode(A, 'plan')
    expect(setSessionPermissionMode).toHaveBeenCalledExactlyOnceWith(A, 'plan')
    expect(h.store.getState().sessions[A]?.changing).toBe('permission-mode')
    resolve({ ok: true })
    await vi.waitFor(() => expect(h.store.getState().sessions[A]?.changing).toBeNull())
    expect(h.store.getState().sessions[A]).toMatchObject({ settingError: null })
    expect(h.store.getState().sessions[A]?.config).toBe(config)
  })

  it('setPermissionMode の失敗 (ok: false / reject) で settingError が立つ', async () => {
    const setSessionPermissionMode = vi
      .fn<ClostaCapability['setSessionPermissionMode']>()
      .mockResolvedValueOnce({ ok: false, reason: 'rejected' })
      .mockRejectedValueOnce(new Error('ipc'))
    const h = harness({ setSessionPermissionMode })
    await launched(h, A)
    h.store.setPermissionMode(A, 'plan')
    await vi.waitFor(() =>
      expect(h.store.getState().sessions[A]).toMatchObject({
        changing: null,
        settingError: 'permission-mode'
      })
    )
    h.store.setPermissionMode(A, 'default')
    expect(h.store.getState().sessions[A]).toMatchObject({
      changing: 'permission-mode',
      settingError: null
    })
    await vi.waitFor(() => expect(h.store.getState().sessions[A]?.changing).toBeNull())
    expect(h.store.getState().sessions[A]?.settingError).toBe('permission-mode')
  })

  it('知らない行への setPermissionMode は capability を呼ばない', () => {
    const setSessionPermissionMode = vi.fn(async () => ({ ok: true as const }))
    const h = harness({ setSessionPermissionMode })
    h.store.setPermissionMode(B, 'plan')
    expect(setSessionPermissionMode).not.toHaveBeenCalled()
  })

  it('setModel は結果までは changing で、成功で currentModelId になる。config は同じ参照', async () => {
    let resolve: (r: LiveSettingResult) => void = () => undefined
    const setSessionModel = vi.fn(() => new Promise<LiveSettingResult>((r) => (resolve = r)))
    const h = harness({ setSessionModel })
    await launched(h, A)
    const config = h.store.getState().sessions[A]?.config
    h.store.setModel(A, 'm2')
    expect(setSessionModel).toHaveBeenCalledExactlyOnceWith(A, 'm2')
    expect(h.store.getState().sessions[A]).toMatchObject({
      changing: 'model',
      currentModelId: null
    })
    resolve({ ok: true })
    await vi.waitFor(() => expect(h.store.getState().sessions[A]?.changing).toBeNull())
    expect(h.store.getState().sessions[A]).toMatchObject({
      currentModelId: 'm2',
      settingError: null
    })
    expect(h.store.getState().sessions[A]?.config).toBe(config)
  })

  it('setModel の失敗 (ok: false / reject) で settingError が立ち、currentModelId は元のまま', async () => {
    const setSessionModel = vi
      .fn<ClostaCapability['setSessionModel']>()
      .mockResolvedValueOnce({ ok: false, reason: 'rejected' })
      .mockRejectedValueOnce(new Error('ipc'))
    const h = harness({ setSessionModel })
    await launched(h, A)
    h.store.setModel(A, 'm2')
    await vi.waitFor(() =>
      expect(h.store.getState().sessions[A]).toMatchObject({
        changing: null,
        settingError: 'model'
      })
    )
    h.store.setModel(A, 'm3')
    await vi.waitFor(() => expect(h.store.getState().sessions[A]?.changing).toBeNull())
    expect(h.store.getState().sessions[A]).toMatchObject({
      settingError: 'model',
      currentModelId: null
    })
  })

  it('知らない行への setModel は capability を呼ばない', () => {
    const setSessionModel = vi.fn(async () => ({ ok: true as const }))
    const h = harness({ setSessionModel })
    h.store.setModel(B, 'm2')
    expect(setSessionModel).not.toHaveBeenCalled()
  })

  it('rename は結果までは changing で、成功で main が返した名前が name になる。config は同じ参照', async () => {
    let resolve: (r: RenameResult) => void = () => undefined
    const renameSession = vi.fn(() => new Promise<RenameResult>((r) => (resolve = r)))
    const h = harness({ renameSession })
    await launched(h, A)
    const config = h.store.getState().sessions[A]?.config
    const done = h.store.rename(A, ' 調査 ')
    expect(renameSession).toHaveBeenCalledExactlyOnceWith(A, ' 調査 ')
    expect(h.store.getState().sessions[A]).toMatchObject({ changing: 'name', name: null })
    resolve({ ok: true, name: '調査' })
    await expect(done).resolves.toBe(true)
    expect(h.store.getState().sessions[A]).toMatchObject({
      changing: null,
      name: '調査',
      settingError: null
    })
    expect(h.store.getState().sessions[A]?.config).toBe(config)
  })

  it('rename の失敗 (ok: false / reject) で settingError が立ち、name は元のまま', async () => {
    const renameSession = vi
      .fn<ClostaCapability['renameSession']>()
      .mockResolvedValueOnce({ ok: false, reason: 'write-failed' })
      .mockRejectedValueOnce(new Error('ipc'))
    const h = harness({ renameSession })
    await launched(h, A)
    await expect(h.store.rename(A, 'x')).resolves.toBe(false)
    expect(h.store.getState().sessions[A]).toMatchObject({
      changing: null,
      settingError: 'name',
      name: null
    })
    await expect(h.store.rename(A, 'y')).resolves.toBe(false)
    expect(h.store.getState().sessions[A]).toMatchObject({ settingError: 'name', name: null })
  })

  it('知らない行への rename は capability を呼ばず false', async () => {
    const renameSession = vi.fn(async () => ({ ok: true as const, name: 'x' }))
    const h = harness({ renameSession })
    await expect(h.store.rename(B, 'x')).resolves.toBe(false)
    expect(renameSession).not.toHaveBeenCalled()
  })
})
