import type { StoreApi } from 'zustand/vanilla'

import type { RunningSessionStoreState, StatusSince } from './running-session-types'
import { deriveActivity, rowStatus, sameActivity, viewOf } from './session-view'

/**
 * **監視ビューの派生値の追跡と間引き** (O-1 / data-model §1 / research R-01・R-03。O-4 FR-018 (1) でストアから切り出した)。
 *
 * | 規則 | 根拠 |
 * |---|---|
 * | 行の状態に入った時刻 (`statusSince`) はストアの更新ごとに見直し、1 回の更新の中の変化を 1 回の `setState` にまとめる | O-1 data-model §1 |
 * | 直近の活動 (`activity`) は**購読の手前で**セッションごとに `ACTIVITY_THROTTLE_MS` に間引いて書く (行は文字列を選ぶだけ) | O-1 research R-03 |
 *
 * ストア (`running-session-store.ts`) は `track` を更新のたびに、`forget` を「閉じる」で呼ぶだけ。`statusSince` と
 * `activity` の枝を消すのは、閉じたときのストアの 1 回の `setState` (他の枝と一緒に消す)。
 */

/** 直近の活動を書き直す間隔 (1 行あたり毎秒 2 回まで。spec FR-006 [ASSUMED])。 */
export const ACTIVITY_THROTTLE_MS = 500

export interface RunningSessionMonitorDeps {
  readonly getState: StoreApi<RunningSessionStoreState>['getState']
  readonly setState: StoreApi<RunningSessionStoreState>['setState']
  readonly now: () => number
}

export interface RunningSessionMonitor {
  /** 渡したセッションの派生値を見直す (ストアに無い id は飛ばす)。 */
  track(sessionIds: readonly string[]): void
  /** 閉じたセッションの間引きの timer を外す。 */
  forget(sessionId: string): void
}

export function createRunningSessionMonitor({
  getState,
  setState,
  now
}: RunningSessionMonitorDeps): RunningSessionMonitor {
  /** sessionId → 直近の活動の間引き (間隔の中に更新があったら `dirty`)。 */
  const activityTimers = new Map<string, { timer: ReturnType<typeof setTimeout>; dirty: boolean }>()

  /** 直近の活動を導いて、変わっていれば書く (O-1 / data-model §1)。 */
  const writeActivity = (sessionId: string): void => {
    const state = getState()
    const session = state.sessions[sessionId]
    if (session === undefined) return
    const next = deriveActivity(session.messages, session.pending, viewOf(state, sessionId))
    if (sameActivity(state.activity[sessionId], next)) return
    setState((s) => ({ activity: { ...s.activity, [sessionId]: next } }))
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
    const state = getState()
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
      setState({ statusSince })
    }
    for (const id of sessionIds) if (state.sessions[id] !== undefined) scheduleActivity(id)
  }

  return {
    track: trackDerived,
    forget(sessionId) {
      const activityTimer = activityTimers.get(sessionId)
      if (activityTimer !== undefined) clearTimeout(activityTimer.timer)
      activityTimers.delete(sessionId)
    }
  }
}
