import type { LaunchFailureReason } from '@domain/session/agent-session'
import { canEnd, type SessionRunState } from '@domain/session/run-state'
import type { SessionStatusUpdate } from '@domain/session/status-update'

import type { SessionRowStatus } from './labels'
import type { LiveSessionState, RunningSessionStoreState } from './running-session-types'

/**
 * 稼働中セッションの表示用の導出 (X-5 / FE-001 / FE-011。純関数のみ)。一覧の行・表示中セッション・ストアの
 * キュー制御が同じ判定を使う (判定を分けない)。ストア本体は `running-session-store.ts`。
 */

/**
 * 表示用の導出 (一覧と表示中セッションで判定を分けない単一の locus)。
 *
 * - `runState`: 状態通知の `error` (スレッド / supervisor の異常終了の合成) を優先する
 * - `failureReason`: port の `failure` が無ければ状態通知の理由キー (port が先に閉じた場合)
 * - `ended`: `claude` が終わったか (生存フラグが false)
 * - `terminal`: 送信できない終端か (失敗 / 終了済み / 強制終了 / 終了処理中。R3-H-04)
 * - `awaitingFirstPrompt`: 起動済み (状態通知が届いた) で、最初のプロンプトをまだ送っていない `launching`。
 *   claude は最初のプロンプトまで何もしないので、この状態は利用者の入力をいつまでも待つ (pr-gate R1 po H-001)
 * - `firstTurnInFlight`: 最初のプロンプトを送ったが最初の応答がまだの `launching` (応答中と同じに扱う)
 * - `ending`: 終了を要求して、`claude` の終わりをまだ受けていない (pr-gate R2 po L-103)
 */
export interface SessionView {
  readonly runState: SessionRunState
  readonly failureReason: LaunchFailureReason | null
  readonly ended: boolean
  readonly terminal: boolean
  readonly ending: boolean
  readonly awaitingFirstPrompt: boolean
  readonly firstTurnInFlight: boolean
}

/** 導出に要るフィールドだけ (一覧の行は本文を選ばずに導出する。SC-003)。 */
export type SessionViewSource = Pick<
  LiveSessionState,
  'runState' | 'failureReason' | 'killed' | 'ending' | 'promptSent'
>

export function deriveSessionView(
  session: SessionViewSource | undefined,
  status: SessionStatusUpdate | undefined
): SessionView {
  const runState: SessionRunState =
    status?.state === 'error' ? 'error' : (session?.runState ?? status?.state ?? 'launching')
  const ended = status?.claudeAlive === false
  const terminal =
    runState === 'error' || ended || session?.killed === true || session?.ending === true
  const launching = !terminal && (runState === 'launching' || runState === 'idle')
  const promptSent = session?.promptSent === true
  return {
    runState,
    failureReason: session?.failureReason ?? status?.reasonKey ?? null,
    ended,
    terminal,
    ending: !ended && runState !== 'error' && session?.ending === true,
    awaitingFirstPrompt: launching && status !== undefined && !promptSent,
    firstTurnInFlight: launching && promptSent
  }
}

/**
 * 一覧の行の状態 (FR-009)。優先順: 失敗 → 終了済み (生存フラグ false) → 終了中 → run-state。
 * `done` は生存中なら「応答待ち」— `claude` は次のプロンプトを待っている。
 * `launching` は、最初のプロンプト待ちなら「プロンプト待ち」、最初のプロンプトを送った後なら「応答中」、
 * 状態通知がまだ届いていなければ「起動中」(pr-gate R1 po H-001)。
 * 終了を押した後は、`claude` の終わりを受けるまで「終了中」(「起動中」に戻して見せない。pr-gate R2 po L-103)。
 */
export function rowStatus(view: SessionView): SessionRowStatus {
  if (view.runState === 'error') return 'failed'
  if (view.ended) return 'ended'
  if (view.ending) return 'ending'
  switch (view.runState) {
    case 'running':
      return 'running'
    case 'awaiting_permission':
      return 'awaiting'
    case 'interrupted':
      return 'interrupted'
    case 'done':
      return 'waiting'
    case 'idle':
    case 'launching':
      if (view.awaitingFirstPrompt) return 'ready'
      if (view.firstTurnInFlight) return 'running'
      return 'launching'
  }
}

/**
 * 状態に応じて出せる操作 (FR-011)。
 * - 終了: `canEnd` (domain) を満たし、`launching` なら状態通知が届いている (最初のプロンプト待ち) とき。
 *   終了の処理中は押せない (`endPending`)
 * - 停止: `launching` は強制終了 / `running`・`awaiting_permission` は強制終了、中断は `running` だけ
 *   (承認待ちは承認カードの「拒否」でツールを止める — X-1 の中断の規則を継承。plan renderer 節)
 * - **終了の処理中も強制終了は出す** — セッションスレッドが終了を受け付けなかった (押した直後に応答中へ移った) 場合も、
 *   期限内に終わらない場合も、利用者が止める手段を失わない (pr-gate R2 po M-104。スレッドは終了処理中も kill を受ける)
 * - 閉じる: `ended`
 */
export interface SessionActionsAvailable {
  readonly end: boolean
  readonly endPending: boolean
  readonly interrupt: boolean
  readonly kill: boolean
  readonly close: boolean
}

export function availableActions(
  view: SessionView,
  session: Pick<LiveSessionState, 'ending' | 'killed' | 'promptSent'> | undefined
): SessionActionsAvailable {
  const ending = session?.ending === true
  const killed = session?.killed === true
  const alive = !view.ended && view.runState !== 'error' && !killed
  const settled =
    canEnd(view.runState, session?.promptSent === true) &&
    (view.runState !== 'launching' || view.awaitingFirstPrompt)
  const stoppable =
    view.runState === 'launching' ||
    view.runState === 'idle' ||
    view.runState === 'running' ||
    view.runState === 'awaiting_permission'
  return {
    end: alive && settled,
    endPending: ending,
    interrupt: alive && !ending && view.runState === 'running',
    kill: alive && (ending || stoppable),
    close: view.ended
  }
}

export function viewOf(state: RunningSessionStoreState, sessionId: string): SessionView {
  return deriveSessionView(state.sessions[sessionId], state.statuses[sessionId])
}

/** assistant-ui に渡す末尾の窓 (件数)。「さらに表示」でこの件数ずつ広げる (X-5 / SC-003)。 */
export const MESSAGE_WINDOW = 100

/**
 * 表示中セッションの本文の窓 (X-5 / SC-003)。末尾 `windowSize` 件だけを返し、省略した件数を添える。
 * 省略が無いときは**同じ配列を返す** (assistant-ui のメッセージの再構築を起こさない)。
 */
export function windowMessages<T>(
  messages: readonly T[],
  windowSize: number
): { readonly windowed: readonly T[]; readonly hiddenCount: number } {
  const hiddenCount = Math.max(0, messages.length - windowSize)
  return { windowed: hiddenCount === 0 ? messages : messages.slice(hiddenCount), hiddenCount }
}
