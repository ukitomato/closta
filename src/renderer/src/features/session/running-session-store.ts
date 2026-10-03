import { createMessageQueue, type ThreadMessageLike } from '@assistant-ui/react'
import { createStore, type StoreApi } from 'zustand/vanilla'

import { SESSION_PORT_MESSAGE, type ClostaCapability } from '@domain/capability'
import type { SessionEvent } from '@domain/session/agent-session'
import type { SessionLaunchConfig } from '@domain/session/launch-config'

import { toThreadMessage } from '@/features/chat/convert'

import { isBusyRunState, isSendableText } from './composer-queue'
import { createCappedAdapter } from './composer-queue-adapter'
import type {
  Density,
  LaunchState,
  LiveSessionState,
  RunningSessionStoreState,
  SessionQueue,
  StatusSince
} from './running-session-types'
import { decodeSessionEvent } from './session-event-decoder'
import { deriveActivity, nextAwaiting, rowStatus, sameActivity, viewOf } from './session-view'

export type {
  LaunchState,
  LiveSessionState,
  PendingPermission,
  RunningSessionStoreState,
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
 * | **監視ビューの派生値** (O-1): 行の状態に入った時刻 (`statusSince`) はストアの更新ごとに見直し、1 回の更新の中の変化を 1 回の `setState` にまとめる。直近の活動 (`activity`) は**購読の手前で**セッションごとに 500ms に間引いて書く (行は文字列を選ぶだけ) | O-1 data-model §1 / research R-01・R-03 |
 * | ストアを `window` などの global に出さない。実機計測は一覧の `data-*` の値だけを読む | O-1 FR-012 |
 *
 * 会話由来のテキスト (本文・下書き・キュー) は境界・ログ・永続層に出さない (Principle V / X-2 FR-008)。
 */

export interface SessionActions {
  /** `folderLabel` は起動の受付時に引けている作業フォルダの表示名 (App の寿命の読み上げに使う。O-1)。 */
  launch(config: SessionLaunchConfig, folderLabel?: string | null): Promise<void>
  select(sessionId: string | null): void
  /** 監視ビューの情報密度 (O-1 / FR-008。永続化しない)。 */
  setDensity(density: Density): void
  /** 表示中を除く承認待ちのうち、承認待ちになったのが最も早いものへ切り替える (O-1 / FR-002)。無ければ何もしない。 */
  selectNextAwaiting(): void
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

/** 直近の活動を書き直す間隔 (1 行あたり毎秒 2 回まで。spec FR-006 [ASSUMED])。 */
export const ACTIVITY_THROTTLE_MS = 500

const INITIAL_LAUNCH: LaunchState = {
  phase: 'entry',
  rejectReason: null,
  lastConfig: null,
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
    launch: INITIAL_LAUNCH,
    statusSince: {},
    activity: {},
    receivedMessages: 0,
    density: 'comfortable'
  }))

  /** sessionId → 繋いだ port。 */
  const ports = new Map<string, MessagePort>()
  /** handshake より先に届いた port (起動要求が在る間だけ待避する)。 */
  const buffered = new Map<string, MessagePort>()
  /** 閉じた sessionId (後から届いた port を捨てる)。 */
  const closed = new Set<string>()
  const queues = new Map<string, SessionQueue & { prevBusy: boolean }>()
  /** sessionId → 下書き (再描画を起こさない保持。`setDraft` の注記)。 */
  const drafts = new Map<string, string>()
  /** sessionId → 直近の活動の間引き (間隔の中に更新があったら `dirty`)。 */
  const activityTimers = new Map<string, { timer: ReturnType<typeof setTimeout>; dirty: boolean }>()
  let inFlight = 0
  let userSeq = 0

  const patch = (sessionId: string, update: Partial<LiveSessionState>): void => {
    store.setState((s) => {
      const current = s.sessions[sessionId]
      if (current === undefined) return s
      return { sessions: { ...s.sessions, [sessionId]: { ...current, ...update } } }
    })
    syncQueue(sessionId)
    trackDerived([sessionId])
  }

  /** 直近の活動を導いて、変わっていれば書く (O-1 / data-model §1)。 */
  const writeActivity = (sessionId: string): void => {
    const state = store.getState()
    const session = state.sessions[sessionId]
    if (session === undefined) return
    const next = deriveActivity(session.messages, session.pending, viewOf(state, sessionId))
    if (sameActivity(state.activity[sessionId], next)) return
    store.setState((s) => ({ activity: { ...s.activity, [sessionId]: next } }))
  }

  const armActivity = (sessionId: string): void => {
    const timer = setTimeout(() => {
      const slot = activityTimers.get(sessionId)
      if (slot === undefined) return
      if (!slot.dirty) {
        activityTimers.delete(sessionId)
        return
      }
      slot.dirty = false
      writeActivity(sessionId)
      armActivity(sessionId)
    }, ACTIVITY_THROTTLE_MS)
    const slot = activityTimers.get(sessionId)
    if (slot === undefined) activityTimers.set(sessionId, { timer, dirty: false })
    else slot.timer = timer
  }

  /**
   * **購読の手前で間引く** (O-1 / research R-03)。先頭は即時に書き、間隔の中の更新は最後の 1 回だけを間隔の終わりに書く。
   * 行の中で表示値を遅らせても行の再描画は減らないため、ストアが書く回数そのものを抑える。
   */
  const scheduleActivity = (sessionId: string): void => {
    const slot = activityTimers.get(sessionId)
    if (slot !== undefined) {
      slot.dirty = true
      return
    }
    writeActivity(sessionId)
    armActivity(sessionId)
  }

  /**
   * 監視ビューの派生値を見直す (O-1)。行の状態が変わったセッションの `statusSince` を **1 回の `setState`** で書き
   * (同じ更新の複数の遷移を 1 つの文で読ませるため)、直近の活動の書き込みを予約する。
   */
  const trackDerived = (sessionIds: readonly string[]): void => {
    const state = store.getState()
    let changed: Record<string, StatusSince> | null = null
    for (const id of sessionIds) {
      if (state.sessions[id] === undefined) continue
      const status = rowStatus(viewOf(state, id))
      if (state.statusSince[id]?.status === status) continue
      changed ??= { ...state.statusSince }
      changed[id] = { status, at: now() }
    }
    if (changed !== null) {
      const statusSince = changed
      store.setState({ statusSince })
    }
    for (const id of sessionIds) if (state.sessions[id] !== undefined) scheduleActivity(id)
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
        store.setState((s) => {
          const current = s.sessions[sessionId]
          if (current === undefined) return s
          return {
            sessions: {
              ...s.sessions,
              [sessionId]: {
                ...current,
                messages: upsertMessage(current.messages, toThreadMessage(event.message))
              }
            },
            receivedMessages: s.receivedMessages + 1
          }
        })
        syncQueue(sessionId)
        trackDerived([sessionId])
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
    async launch(config, folderLabel = null) {
      inFlight += 1
      store.setState({
        launch: {
          phase: 'launching',
          rejectReason: null,
          lastConfig: config,
          previousFailure: null
        }
      })
      let handshake: Awaited<ReturnType<ClostaCapability['launchSession']>>
      try {
        handshake = await capability().launchSession(config)
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
        folderLabel
      }
      createQueue(sessionId)
      store.setState((s) => ({
        order: [...s.order, sessionId],
        sessions: { ...s.sessions, [sessionId]: session },
        selectedId: sessionId,
        launch: { ...s.launch, phase: 'entry', rejectReason: null }
      }))
      // 固定値ではなく、その時点の行の状態を入れる (handshake より先に状態通知が届いていても行と食い違わない)。
      trackDerived([sessionId])
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

    setDensity(density) {
      if (store.getState().density !== density) store.setState({ density })
    },

    selectNextAwaiting() {
      const target = nextAwaiting(store.getState())
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
      const activityTimer = activityTimers.get(sessionId)
      if (activityTimer !== undefined) clearTimeout(activityTimer.timer)
      activityTimers.delete(sessionId)
      const failure = view.failureReason
      // 失敗したセッションを閉じたら、メッセージの有無を問わず**そのセッションの**設定と理由を起動ダイアログへ戻す
      // (「閉じて再起動」が別のセッションの設定を出さない。pr-gate R1 po M-005 / X-4 US-1 AC7)。
      const failed = failure !== null
      store.setState((s) => {
        const sessions = { ...s.sessions }
        const statuses = { ...s.statuses }
        const statusSince = { ...s.statusSince }
        const activity = { ...s.activity }
        delete sessions[sessionId]
        delete statuses[sessionId]
        delete statusSince[sessionId]
        delete activity[sessionId]
        return {
          order: s.order.filter((id) => id !== sessionId),
          sessions,
          statuses,
          statusSince,
          activity,
          selectedId: s.selectedId === sessionId ? null : s.selectedId,
          // 失敗したセッションを閉じたら、起動ダイアログでそのセッションの理由と設定を示す (X-4 US-1 AC7 / pr-gate R1 po M-005)。
          launch: failed
            ? {
                ...s.launch,
                lastConfig: state.sessions[sessionId]?.config ?? s.launch.lastConfig,
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
        trackDerived(touched)
      })

      return () => {
        target.removeEventListener('message', onWindowMessage)
        unsubscribe()
      }
    }
  }

  return Object.assign(store, actions)
}
