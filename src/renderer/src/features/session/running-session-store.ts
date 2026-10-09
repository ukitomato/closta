import { createMessageQueue, type ThreadMessageLike } from '@assistant-ui/react'
import { createStore, type StoreApi } from 'zustand/vanilla'

import { SESSION_PORT_MESSAGE, type ClostaCapability } from '@domain/capability'
import type { SessionEvent } from '@domain/session/agent-session'
import type { SessionLaunchConfig } from '@domain/session/launch-config'
import type { LaunchOrigin } from '@domain/session/launch-usage'
import type { MeterUpdate } from '@domain/session/meter'
import { mergeSystemEvent, systemEventPartOf } from '@domain/session/system-event'
import type { TranscriptMessageDTO } from '@domain/session/transcript-dto'

import { fromSystemEventData, toThreadMessage } from '@/features/chat/convert'

import { isBusyRunState, isSendableText } from './composer-queue'
import { createCappedAdapter } from './composer-queue-adapter'
import { createRunningSessionMonitor } from './running-session-monitor'
import {
  EMPTY_SESSION_METERS,
  MAX_TOOL_ELAPSED_ENTRIES,
  type Density,
  type LaunchState,
  type LiveSessionState,
  type RunningSessionStoreState,
  type SessionMeters,
  type SessionQueue
} from './running-session-types'
import { decodeSessionEvent } from './session-event-decoder'
import { nextAwaiting, viewOf } from './session-view'

export { ACTIVITY_THROTTLE_MS } from './running-session-monitor'
export type {
  LaunchState,
  LiveSessionState,
  PendingPermission,
  RunningSessionStoreState,
  SessionMeters,
  SessionQueue
} from './running-session-types'

/**
 * **稼働中セッションのストア** (X-5 / FE-001 / FE-010 / plan renderer 節)。
 *
 * | 規則 | 根拠 |
 * |---|---|
 * | セッションの寿命は**画面の表示と切り離す**。ストアは App の寿命で 1 つ。画面の切り替え・遷移で kill しない | spec FR-008 |
 * | 本文 (`SessionEvent`) は `MessageChannelMain` の port で supervisor↔renderer 直通に届く。制御は必ず preload capability を通す | AD-036 §2 / AD-034 §1 |
 * | port は `window` メッセージで届く。**origin / source を検証**し、handshake 前に届いた port は `Map<sessionId, port>` に待避する。起動要求を出していない・閉じた sessionId の port は `close()` して捨てる | plan renderer 節 / SC-006 |
 * | 本文は `decodeSessionEvent` を通し、失敗は破棄する (他のセッションに影響させない) | FR-012 |
 * | `ended = statuses[id].claudeAlive === false`。一覧のラベル・composer の無効化・キューの取り消し・操作の出し分けはこの値で行う | FR-009 / FR-010 |
 * | port が閉じても transcript は消さない。消すのは「閉じる」だけ | FR-008 / FR-011 |
 * | 下書きと送信待ちキュー (X-2) はセッションごとに持ち、キューの dispatch は**表示していなくても**状態の変化で進む | FR-010 |
 * | **監視ビューの派生値** (O-1): 行の状態に入った時刻 (`statusSince`) はストアの更新ごとに見直し、1 回の更新の中の変化を 1 回の `setState` にまとめる。直近の活動 (`activity`) は**購読の手前で**セッションごとに 500ms に間引いて書く (行は文字列を選ぶだけ)。追跡と間引きは `running-session-monitor.ts` が持ち、ストアは更新のたびに `track` を呼ぶ | O-1 data-model §1 / research R-01・R-03 / O-4 FR-018 (1) |
 * | ストアを `window` などの global に出さない。実機計測は一覧の `data-*` の値だけを読む | O-1 FR-012 |
 * | **計量** (`meter`) はセッションごとの最新の値を `meters` の枝に持つ。`patch()` を通さない (キューの同期と派生値の見直しを起こさない)・`sessions` の参照を変えない・`receivedMessages` に数えない・閉じた id の値は捨てる・`close()` で消す。起動の設定・`lastConfig`・プリセットに書き戻さない | O-4 / 014 data-model §2「renderer の保持」 |
 *
 * 会話由来のテキスト (本文・下書き・キュー) は境界・ログ・永続層に出さない (Principle V / X-2 FR-008)。
 */

export interface SessionActions {
  /**
   * `folderLabel` は起動の受付時に引けている作業フォルダの表示名 (App の寿命の読み上げに使う。O-1)。
   * `origin` は起動元 (O-3 / 012 data-model §4)。`lastConfig` と一緒に `lastOrigin` へ入れ、capability の `launchSession` に渡す。
   * 省略は `manual` (起動ダイアログを通らない呼び出し。本番の経路は `RunningSessionsView.launch` が必ず渡す)。
   */
  launch(
    config: SessionLaunchConfig,
    folderLabel?: string | null,
    origin?: LaunchOrigin
  ): Promise<void>
  select(sessionId: string | null): void
  /**
   * 起動の拒否と前回の失敗の告知を消す (O-7。起動ダイアログを起動せずに閉じたとき・失敗したセッションを中央に出さずに
   * 閉じたとき)。`lastConfig` と `lastOrigin` は残す (次に開いたときの初期値)。起動中は何もしない。
   */
  dismissLaunchNotice(): void
  /** 監視ビューの情報密度 (O-1 / FR-008。永続化しない)。 */
  setDensity(density: Density): void
  /**
   * 見ているセッション (`watchedId`。省略時は選択中) を除く承認待ちのうち、承認待ちになったのが最も早いものへ切り替える
   * (O-1 / FR-002・O-7 / FR-006)。無ければ何もしない。
   */
  selectNextAwaiting(watchedId?: string | null): void
  /**
   * composer の下書き (メモリ内限定。X-2 FR-007)。**再描画を起こさない保持**に置く — 下書きは切り替えで Thread を
   * 作り直したときの復元にだけ読む。state に置くと打鍵のたびに表示中のペイン全体が再描画され、表示中の本文の更新と
   * 重なって long task になる (SC-003 の実測)。
   */
  setDraft(sessionId: string, text: string): void
  getDraft(sessionId: string): string
  /** 送信と同時にユーザ発話を楽観表示する (agents の user echo は取らない。X-1 FE-002)。 */
  appendUser(sessionId: string, text: string): void
  send(sessionId: string, text: string): void
  interrupt(sessionId: string): void
  respond(sessionId: string, requestId: string, outcome: 'allow' | 'deny'): void
  end(sessionId: string): void
  kill(sessionId: string): void
  /** 行と保持を消す。表示中なら選択を外す (FR-011)。 */
  close(sessionId: string): void
  clearQueueRejection(sessionId: string): void
  queueOf(sessionId: string): SessionQueue | null
  /** `window` の port 受け渡しと状態通知の購読を張る。解除関数を返す。 */
  attach(target: Window): () => void
}

export type RunningSessionStore = StoreApi<RunningSessionStoreState> & SessionActions

const INITIAL_LAUNCH: LaunchState = {
  phase: 'entry',
  rejectReason: null,
  lastConfig: null,
  lastOrigin: null,
  previousFailure: null
}

/** 同 id は差し替え、新規は末尾へ (逐次生成のメッセージ単位更新。AD-020 / H-06)。 */
function upsertMessage(
  prev: readonly ThreadMessageLike[],
  next: ThreadMessageLike
): ThreadMessageLike[] {
  const index = prev.findIndex((m) => m.id !== undefined && m.id === next.id)
  if (index === -1) return [...prev, next]
  const copy = [...prev]
  copy[index] = next
  return copy
}

/**
 * port の `message` を本文に取り込む。tool の結果を埋めた送り直しは同じ id の差し替え (O-2 / FR-007)。
 * **システムイベントの行は domain の `mergeSystemEvent` で合成する** (規則の正本は domain の 1 か所。data-model §2):
 * 前の行の data part から DTO を復元し、DTO どうしで合成してから変換する。行を作れない更新 (`null`) は捨てる
 * (戻り値 `null` = 本文を変えない)。
 */
function applyMessage(
  prev: readonly ThreadMessageLike[],
  dto: TranscriptMessageDTO
): ThreadMessageLike[] | null {
  if (systemEventPartOf(dto) === null) return upsertMessage(prev, toThreadMessage(dto))
  const existing = prev.find((m) => m.id !== undefined && m.id === dto.id)
  const merged = mergeSystemEvent(
    existing === undefined ? undefined : fromSystemEventData(existing),
    dto
  )
  return merged === null ? null : upsertMessage(prev, toThreadMessage(merged))
}

/** tool の経過時間を書く。その id を末尾へ移し、上限を超えたら先頭 (更新の古いもの) から落とす (014 data-model §2)。 */
function withToolElapsed(
  prev: ReadonlyMap<string, number>,
  toolUseId: string,
  seconds: number
): ReadonlyMap<string, number> {
  const next = new Map(prev)
  next.delete(toolUseId)
  next.set(toolUseId, seconds)
  for (const oldest of next.keys()) {
    if (next.size <= MAX_TOOL_ELAPSED_ENTRIES) break
    next.delete(oldest)
  }
  return next
}

/** 計量の 1 件を 1 セッションの値に反映する (純関数。014 data-model §2「renderer の保持」の表)。 */
function applyMeter(prev: SessionMeters, update: MeterUpdate): SessionMeters {
  switch (update.type) {
    case 'turn':
      // ターンの終わりで思考の印と tool の経過時間を消す。
      return {
        ...prev,
        lastTurn: update,
        thinkingTokens: null,
        toolElapsed: prev.toolElapsed.size === 0 ? prev.toolElapsed : new Map()
      }
    case 'context':
      return { ...prev, contextUsed: update.usedTokens }
    case 'rate-limit':
      return { ...prev, rateLimit: update }
    case 'permission-mode':
      return { ...prev, permissionMode: update.mode }
    case 'thinking':
      return { ...prev, thinkingTokens: update.estimatedTokens }
    case 'tool-elapsed':
      return {
        ...prev,
        toolElapsed: withToolElapsed(prev.toolElapsed, update.toolUseId, update.elapsedSeconds)
      }
  }
}

/**
 * 主ループの assistant のメッセージ (role が assistant でシステムイベントでない) が届いたら、そのセッションの思考の印を
 * 消す (014 data-model §2)。変えないときは同じ参照を返す。
 */
function clearThinkingOnAssistant(
  meters: Readonly<Record<string, SessionMeters>>,
  sessionId: string,
  dto: TranscriptMessageDTO
): Readonly<Record<string, SessionMeters>> {
  const current = meters[sessionId]
  if (current === undefined || current.thinkingTokens === null) return meters
  if (dto.role !== 'assistant' || systemEventPartOf(dto) !== null) return meters
  return { ...meters, [sessionId]: { ...current, thinkingTokens: null } }
}

interface PortData {
  readonly marker?: unknown
  readonly sessionId?: unknown
}

export function createRunningSessionStore(
  capability: () => ClostaCapability,
  now: () => number = Date.now
): RunningSessionStore {
  const store = createStore<RunningSessionStoreState>(() => ({
    order: [],
    sessions: {},
    statuses: {},
    selectedId: null,
    selectionSeq: 0,
    launch: INITIAL_LAUNCH,
    statusSince: {},
    activity: {},
    receivedMessages: 0,
    density: 'comfortable',
    meters: {}
  }))
  /** 監視ビューの派生値の追跡と間引き (O-1。FR-018 (1) で切り出した)。 */
  const monitor = createRunningSessionMonitor({
    getState: store.getState,
    setState: store.setState,
    now
  })

  /** sessionId → 繋いだ port。 */
  const ports = new Map<string, MessagePort>()
  /** handshake より先に届いた port (起動要求が在る間だけ待避する)。 */
  const buffered = new Map<string, MessagePort>()
  /** 閉じた sessionId (後から届いた port を捨てる)。 */
  const closed = new Set<string>()
  const queues = new Map<string, SessionQueue & { prevBusy: boolean }>()
  /** sessionId → 下書き (再描画を起こさない保持。`setDraft` の注記)。 */
  const drafts = new Map<string, string>()
  let inFlight = 0
  let userSeq = 0

  const patch = (sessionId: string, update: Partial<LiveSessionState>): void => {
    store.setState((s) => {
      const current = s.sessions[sessionId]
      if (current === undefined) return s
      return { sessions: { ...s.sessions, [sessionId]: { ...current, ...update } } }
    })
    syncQueue(sessionId)
    monitor.track([sessionId])
  }

  /**
   * **キューの完了 trigger をストアで駆動する** (X-2 FR-005 / FR-006 を表示と切り離す)。busy の立上りで notifyBusy、
   * 立下りで、終端なら notifyCancelled (dispatch せず取り消し)、通常完了なら notifyIdle (次ターンへ dispatch)。
   * 終端に入ったら busy は false とみなす — 応答中に `claude` が終わっても、積んだ入力を取り消しにする (FR-010)。
   */
  const syncQueue = (sessionId: string): void => {
    const queue = queues.get(sessionId)
    if (queue === undefined) return
    const state = store.getState()
    const { terminal, runState } = viewOf(state, sessionId)
    const busy = !terminal && isBusyRunState(runState)
    if (busy && !queue.prevBusy) queue.controller.notifyBusy()
    else if (!busy && queue.prevBusy) {
      if (terminal) queue.controller.notifyCancelled()
      else queue.controller.notifyIdle()
    }
    queue.prevBusy = busy
  }

  const applyEvent = (sessionId: string, event: SessionEvent): void => {
    const session = store.getState().sessions[sessionId]
    if (session === undefined) return
    switch (event.kind) {
      case 'state':
        /*
         * 終了の処理中に応答中・承認待ちへ移ったら、セッションスレッドは終了を受け付けなかった (押した直後にキューの
         * dispatch が先に届いた)。「終了中」を外して実際の状態に戻し、応答待ちに戻ったら終了を押し直せるようにする
         * (pr-gate R3 po L-201)。受け付けた終了は `done` に移るだけで、この 2 状態を通らない。
         */
        patch(sessionId, {
          runState: event.state,
          ...(session.ending && (event.state === 'running' || event.state === 'awaiting_permission')
            ? { ending: false }
            : {})
        })
        break
      case 'message':
        // 受信の累計 (実機計測の観測点。O-1 / FR-012) を同じ `setState` で数える。
        // 行を作れないシステムイベント (合成の結果が null) は本文を変えず、受信の累計だけを数える。
        store.setState((s) => {
          const current = s.sessions[sessionId]
          if (current === undefined) return s
          const messages = applyMessage(current.messages, event.message)
          // 主ループの assistant の応答で思考の印を消す (同じ `setState` で。O-4 / 014 data-model §2)。
          const meters = clearThinkingOnAssistant(s.meters, sessionId, event.message)
          return {
            ...(messages === null
              ? {}
              : { sessions: { ...s.sessions, [sessionId]: { ...current, messages } } }),
            ...(meters === s.meters ? {} : { meters }),
            receivedMessages: s.receivedMessages + 1
          }
        })
        syncQueue(sessionId)
        monitor.track([sessionId])
        break
      case 'permission-request':
        patch(sessionId, {
          pending: {
            requestId: event.request.requestId,
            toolName: event.request.toolName,
            input: event.request.input,
            scope: event.request.scope
          }
        })
        break
      case 'permission-denied':
        patch(sessionId, { denied: [...session.denied, event.denied] })
        break
      case 'failure':
        // 承認待ちを畳む (X-1 pr-gate po M-401。FailureBanner と ApprovalCard を競合表示しない)。
        patch(sessionId, { failureReason: event.reasonKey, pending: null })
        break
      case 'end-forced':
        patch(sessionId, { endForced: true })
        break
      case 'interrupt-receipt':
        // 途中出力は保持され、承認待ち / キュー済みは state で反映される (X-1 FR-015)。表示は最小。
        break
      case 'meter':
        /*
         * 計量は `meters` の枝だけを書く (O-4 / 014 data-model §2)。`patch()` を通さない — キューの同期と監視ビューの
         * 派生値の見直しを起こさず、`sessions` の参照を変えない。`receivedMessages` に数えない。
         */
        store.setState((s) => {
          if (s.sessions[sessionId] === undefined) return s
          const current = s.meters[sessionId] ?? EMPTY_SESSION_METERS
          return { meters: { ...s.meters, [sessionId]: applyMeter(current, event.meter) } }
        })
        break
    }
  }

  const wirePort = (sessionId: string, port: MessagePort): void => {
    ports.get(sessionId)?.close()
    ports.set(sessionId, port)
    port.onmessage = (ev: MessageEvent): void => {
      const event = decodeSessionEvent(ev.data)
      if (event !== null) applyEvent(sessionId, event)
    }
    port.start()
  }

  /** 起動要求が 1 つも無くなったら、持ち主の現れなかった port を捨てる。 */
  const dropOrphanPorts = (): void => {
    if (inFlight > 0) return
    for (const port of buffered.values()) port.close()
    buffered.clear()
  }

  const createQueue = (sessionId: string): void => {
    const controller = createMessageQueue({
      run: (message) => {
        const text = message.content
          .map((part) => (part.type === 'text' ? part.text : ''))
          .join('')
          .trim()
        if (!isSendableText(text)) return // 空 / 空白・バイト長超過は送らない (X-2 FR-003)
        // **積んだセッションへ送る** (積んだ時点で表示していたセッション。FR-010)。
        actions.appendUser(sessionId, text)
        actions.send(sessionId, text)
      }
    })
    const adapter = createCappedAdapter(controller.adapter, (verdict) =>
      patch(sessionId, { queueRejection: verdict === 'ok' ? null : verdict })
    )
    queues.set(sessionId, { controller, adapter, prevBusy: false })
  }

  const actions: SessionActions = {
    async launch(config, folderLabel = null, origin = 'manual') {
      inFlight += 1
      store.setState({
        launch: {
          phase: 'launching',
          rejectReason: null,
          lastConfig: config,
          // 起動元は前回の設定と組で残す (拒否・受け付け・告知を消した後も。012 data-model §4「renderer の起動元」)。
          lastOrigin: origin,
          previousFailure: null
        }
      })
      let handshake: Awaited<ReturnType<ClostaCapability['launchSession']>>
      try {
        handshake = await capability().launchSession(config, origin)
      } catch {
        inFlight -= 1
        dropOrphanPorts()
        store.setState((s) => ({
          launch: { ...s.launch, phase: 'rejected', rejectReason: 'launch-failed' }
        }))
        return
      }
      inFlight -= 1
      if (handshake.status === 'rejected') {
        dropOrphanPorts()
        store.setState((s) => ({
          launch: { ...s.launch, phase: 'rejected', rejectReason: handshake.reasonKey }
        }))
        return
      }
      const sessionId = handshake.sessionId
      const session: LiveSessionState = {
        sessionId,
        config,
        startedAt: now(),
        runState: 'launching',
        messages: [],
        pending: null,
        denied: [],
        failureReason: null,
        killed: false,
        ending: false,
        endForced: false,
        promptSent: false,
        queueRejection: null,
        folderLabel,
        launchOrigin: origin
      }
      createQueue(sessionId)
      store.setState((s) => ({
        order: [...s.order, sessionId],
        sessions: { ...s.sessions, [sessionId]: session },
        selectedId: sessionId,
        selectionSeq: s.selectionSeq + 1,
        launch: { ...s.launch, phase: 'entry', rejectReason: null }
      }))
      // 固定値ではなく、その時点の行の状態を入れる (handshake より先に状態通知が届いていても行と食い違わない)。
      monitor.track([sessionId])
      const port = buffered.get(sessionId)
      if (port !== undefined) {
        buffered.delete(sessionId)
        wirePort(sessionId, port)
      }
      dropOrphanPorts()
    },

    select(sessionId) {
      store.setState((s) => ({
        selectedId: sessionId,
        selectionSeq: sessionId === null ? s.selectionSeq : s.selectionSeq + 1,
        // 新規起動に戻るときは直前の拒否表示を残さない。
        launch:
          sessionId === null
            ? {
                ...s.launch,
                phase: s.launch.phase === 'launching' ? 'launching' : 'entry',
                rejectReason: null
              }
            : s.launch
      }))
    },

    dismissLaunchNotice() {
      const { launch } = store.getState()
      if (launch.phase === 'launching') return
      if (
        launch.phase === 'entry' &&
        launch.rejectReason === null &&
        launch.previousFailure === null
      )
        return
      store.setState({
        launch: { ...launch, phase: 'entry', rejectReason: null, previousFailure: null }
      })
    },

    setDensity(density) {
      if (store.getState().density !== density) store.setState({ density })
    },

    selectNextAwaiting(watchedId) {
      const state = store.getState()
      const target = nextAwaiting(state, watchedId === undefined ? state.selectedId : watchedId)
      if (target !== null) actions.select(target)
    },

    setDraft(sessionId, text) {
      if (store.getState().sessions[sessionId] === undefined) return
      drafts.set(sessionId, text)
    },

    getDraft(sessionId) {
      return drafts.get(sessionId) ?? ''
    },

    appendUser(sessionId, text) {
      const session = store.getState().sessions[sessionId]
      if (session === undefined) return
      userSeq += 1
      const message: ThreadMessageLike = {
        role: 'user',
        content: [{ type: 'text', text }],
        id: `user-${userSeq}`
      }
      patch(sessionId, { messages: upsertMessage(session.messages, message) })
    },

    send(sessionId, text) {
      if (viewOf(store.getState(), sessionId).terminal) return
      if (store.getState().sessions[sessionId]?.promptSent === false)
        patch(sessionId, { promptSent: true })
      void capability().sendPrompt(sessionId, text)
    },

    interrupt(sessionId) {
      // 中断で積んだ入力を dispatch しない (still_queued として残す。X-2 FR-006 / po-N-001)。
      queues.get(sessionId)?.controller.notifyCancelled()
      void capability().interruptSession(sessionId)
    },

    respond(sessionId, requestId, outcome) {
      // 要求 scope は常に `once` (capability 付与は I-3。AD-041 (c))。
      void capability().respondPermission(sessionId, requestId, outcome, 'once')
      patch(sessionId, { pending: null })
    },

    end(sessionId) {
      const session = store.getState().sessions[sessionId]
      if (session === undefined || session.ending) return
      patch(sessionId, { ending: true })
      void capability().endSession(sessionId)
    },

    kill(sessionId) {
      const session = store.getState().sessions[sessionId]
      if (session === undefined) return
      void capability().killSession(sessionId)
      // port は閉じない — 終了の通知 (`claudeAlive: false`) と終わりまでの本文を受け取るため (FR-008)。
      patch(sessionId, { killed: true, pending: null })
    },

    close(sessionId) {
      const state = store.getState()
      if (state.sessions[sessionId] === undefined) return
      // 一覧は終了済みにだけ「閉じる」を出す。それ以外から呼ばれても枠を占めたまま消さない (孤児を作らない)。
      const view = viewOf(state, sessionId)
      if (!view.ended) void capability().killSession(sessionId)
      ports.get(sessionId)?.close()
      ports.delete(sessionId)
      queues.delete(sessionId)
      drafts.delete(sessionId)
      closed.add(sessionId)
      monitor.forget(sessionId)
      const failure = view.failureReason
      // 失敗したセッションを閉じたら、メッセージの有無を問わず**そのセッションの**設定と理由を起動ダイアログへ戻す
      // (「閉じて再起動」が別のセッションの設定を出さない。pr-gate R1 po M-005 / X-4 US-1 AC7)。
      // **ui のシェル (`useShellFocus`) は「`launch` が変わり・`previousFailure` が立ち・`order` が減る」組み合わせを
      // 失敗した close として読む** (起動ダイアログを開くか、告知を消すかを決める)。ほかの操作でこの組み合わせを作らない
      // (O-7 pr-gate R3 architecture L-202。session charter の O-7 の項)。
      const failed = failure !== null
      store.setState((s) => {
        const sessions = { ...s.sessions }
        const statuses = { ...s.statuses }
        const statusSince = { ...s.statusSince }
        const activity = { ...s.activity }
        const meters = { ...s.meters }
        delete sessions[sessionId]
        delete statuses[sessionId]
        delete statusSince[sessionId]
        delete activity[sessionId]
        delete meters[sessionId]
        return {
          order: s.order.filter((id) => id !== sessionId),
          sessions,
          statuses,
          statusSince,
          activity,
          meters,
          selectedId: s.selectedId === sessionId ? null : s.selectedId,
          // 失敗したセッションを閉じたら、起動ダイアログでそのセッションの理由と設定を示す (X-4 US-1 AC7 / pr-gate R1 po M-005)。
          // 起動元も設定と組でそのセッションのものに戻す (O-3 / 012 data-model §4「renderer の起動元」)。
          launch: failed
            ? {
                ...s.launch,
                lastConfig: state.sessions[sessionId]?.config ?? s.launch.lastConfig,
                lastOrigin: state.sessions[sessionId]?.launchOrigin ?? s.launch.lastOrigin,
                previousFailure: failure
              }
            : s.launch
        }
      })
    },

    clearQueueRejection(sessionId) {
      patch(sessionId, { queueRejection: null })
    },

    queueOf(sessionId) {
      return queues.get(sessionId) ?? null
    },

    attach(target) {
      const onWindowMessage = (event: MessageEvent): void => {
        // 自 origin・自 window 由来のみ (preload は自 origin へ transfer。X-1 pr-gate S-L-001)。
        // **受け取らない port はすべて close して捨てる** — 不採用の分岐で放置するとエンタングルされたまま残る
        // (pr-gate R1 security L-001 / CWE-772)。
        const rejectAll = (): void => {
          for (const p of event.ports) p.close()
        }
        if (event.origin !== target.location.origin || event.source !== target) {
          rejectAll()
          return
        }
        const data = event.data as PortData | null
        if (data?.marker !== SESSION_PORT_MESSAGE || typeof data.sessionId !== 'string') {
          rejectAll()
          return
        }
        const port = event.ports[0]
        if (port === undefined) return
        for (const extra of event.ports.slice(1)) extra.close()
        const sessionId = data.sessionId
        if (closed.has(sessionId)) {
          port.close()
          return
        }
        if (store.getState().sessions[sessionId] !== undefined) {
          wirePort(sessionId, port)
          return
        }
        // handshake がまだ返っていない。起動要求が在る間だけ待避する。
        if (inFlight > 0) {
          buffered.get(sessionId)?.close()
          buffered.set(sessionId, port)
        } else port.close()
      }
      target.addEventListener('message', onWindowMessage)

      const unsubscribe = capability().onSessionStatus((updates) => {
        const touched: string[] = []
        store.setState((s) => {
          const statuses = { ...s.statuses }
          for (const update of updates) {
            // 知らないセッションの通知は、起動要求が在る間だけ受ける (handshake より先に届くため)。
            if (closed.has(update.sessionId)) continue
            if (s.sessions[update.sessionId] === undefined && inFlight === 0) continue
            statuses[update.sessionId] = update
            touched.push(update.sessionId)
          }
          return { statuses }
        })
        for (const id of touched) syncQueue(id)
        // バッチ 1 回に含まれる全セッションをまとめて見直す (同じ更新の複数の遷移を 1 回の `setState` にする。O-1)。
        monitor.track(touched)
      })

      return () => {
        target.removeEventListener('message', onWindowMessage)
        unsubscribe()
      }
    }
  }

  return Object.assign(store, actions)
}
