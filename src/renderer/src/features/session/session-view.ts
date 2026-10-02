import type { ThreadMessageLike } from '@assistant-ui/react'

import type { LaunchFailureReason } from '@domain/session/agent-session'
import { countOccupying, MAX_CONCURRENT_SESSIONS } from '@domain/session/concurrency'
import { canEnd, type SessionRunState } from '@domain/session/run-state'
import { sanitizeBody } from '@domain/session/sanitize-body'
import type { SessionStatusUpdate } from '@domain/session/status-update'

import { attentionAnnouncement, type Elapsed, type SessionRowStatus } from './labels'
import type {
  Activity,
  LiveSessionState,
  PendingPermission,
  RunningSessionStoreState,
  StatusSince
} from './running-session-types'

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

/* ── 監視ビューの導出 (O-1 / data-model §2。純関数のみ) ─────────────────── */

/** 直近の活動の長さ (コードポイント。spec FR-006 [ASSUMED])。 */
export const ACTIVITY_MAX_CODE_POINTS = 80
/** 直近の活動を探して走査する上界 (コードユニット。part をまたいで合計で数える。data-model §2)。 */
const ACTIVITY_SCAN_BUDGET = 4_096
/** 1 行のうち正規化に回す先頭の長さ (コードユニット)。 */
const ACTIVITY_LINE_HEAD = 1_024

/** 走査の残量。`reply` では part をまたいで共有する。 */
export interface ScanBudget {
  remaining: number
}

function isLineBreak(code: number): boolean {
  return code === 0x0a || code === 0x0d || code === 0x2028 || code === 0x2029
}

/** 1 行を表示用に正規化する (制御文字・双方向制御文字の除去は domain の `sanitizeBody` を再利用する)。 */
function normalizeLine(line: string): string {
  // 切り出しで高位サロゲートだけが末尾に残ったら落とす (サロゲートペアを割らない)。
  const last = line.charCodeAt(line.length - 1)
  const whole = last >= 0xd800 && last <= 0xdbff ? line.slice(0, -1) : line
  return sanitizeBody(whole, ACTIVITY_LINE_HEAD * 4)
    .value.replace(/\s+/g, ' ')
    .trim()
}

function truncateCodePoints(text: string): string {
  const points = Array.from(text)
  return points.length > ACTIVITY_MAX_CODE_POINTS
    ? `${points.slice(0, ACTIVITY_MAX_CODE_POINTS).join('')}…`
    : text
}

/**
 * 会話由来の値を 1 行の plain text にする (spec FR-006 / data-model §2)。
 *
 * - 文字列でなければ `''` (renderer の decoder は message の part のフィールドの型を検証しないため。例外を投げない)
 * - 先頭から行を取り出し、最初に空でなくなった行を採る。走査は `budget` の範囲に限る (全体を分割しない)
 * - HTML・マークダウンとして解釈しない (呼び出し側は React のテキストノードでだけ描く)
 */
export function toActivityLine(
  raw: unknown,
  budget: ScanBudget = { remaining: ACTIVITY_SCAN_BUDGET }
): string {
  if (typeof raw !== 'string') return ''
  let start = 0
  while (start < raw.length && budget.remaining > 0) {
    const limit = Math.min(raw.length, start + budget.remaining)
    let end = start
    while (end < limit && !isLineBreak(raw.charCodeAt(end))) end += 1
    budget.remaining -= end - start + 1
    const line = normalizeLine(raw.slice(start, Math.min(end, start + ACTIVITY_LINE_HEAD)))
    if (line !== '') return truncateCodePoints(line)
    start = end + 1
  }
  return ''
}

type ContentPart = Exclude<ThreadMessageLike['content'], string>[number]

function partsOf(message: ThreadMessageLike): readonly ContentPart[] {
  return typeof message.content === 'string'
    ? [{ type: 'text', text: message.content }]
    : message.content
}

/** text の part を順に見て、最初に得た空でない行 (連結しない。`text` が文字列でない part は飛ばす)。 */
function firstTextLine(message: ThreadMessageLike): string {
  const budget: ScanBudget = { remaining: ACTIVITY_SCAN_BUDGET }
  for (const part of partsOf(message)) {
    if (budget.remaining <= 0) break
    if (part.type !== 'text') continue
    const line = toActivityLine((part as { readonly text?: unknown }).text, budget)
    if (line !== '') return line
  }
  return ''
}

/**
 * 直近の活動 (spec FR-006 / data-model §2)。見るのは末尾 1 件と承認要求だけ (件数に依存しない)。
 * 優先順: 承認待ち → 応答中で末尾が tool の呼び出し → 送信直後 → 最後の応答。
 */
export function deriveActivity(
  messages: readonly ThreadMessageLike[],
  pending: PendingPermission | null,
  view: SessionView
): Activity | null {
  if (pending !== null) {
    const tool = toActivityLine(pending.toolName)
    const detail = toActivityLine(pending.input)
    return tool === '' && detail === '' ? null : { kind: 'approval', tool, detail }
  }
  const last = messages[messages.length - 1]
  if (last === undefined) return null
  if (last.role === 'assistant') {
    const parts = partsOf(last)
    const tail = parts[parts.length - 1]
    if (rowStatus(view) === 'running' && tail?.type === 'tool-call') {
      const call = tail as { readonly toolName?: unknown; readonly argsText?: unknown }
      const tool = toActivityLine(call.toolName)
      if (tool !== '') return { kind: 'tool', tool, detail: toActivityLine(call.argsText) }
    }
    const detail = firstTextLine(last)
    return detail === '' ? null : { kind: 'reply', tool: null, detail }
  }
  if (last.role === 'user') {
    const detail = firstTextLine(last)
    return detail === '' ? null : { kind: 'prompt', tool: null, detail }
  }
  return null
}

/** 2 つの直近の活動が同じか (同じなら書き込まない。data-model §1)。 */
export function sameActivity(a: Activity | null | undefined, b: Activity | null): boolean {
  if (a === undefined) return false
  if (a === null || b === null) return a === b
  return a.kind === b.kind && a.tool === b.tool && a.detail === b.detail
}

/** 経過時間の表記の区分を導く (型と訳出は `labels.ts`。spec FR-005 [ASSUMED])。 */
export function formatElapsed(ms: number): Elapsed {
  const sec = Math.floor(Math.max(0, ms) / 1000)
  if (sec < 60) return { unit: 'sec', sec }
  const min = Math.floor(sec / 60)
  if (min < 60) return { unit: 'min', min }
  return { unit: 'hourMin', hour: Math.floor(min / 60), min: min % 60 }
}

/**
 * 枠の使用数 (spec FR-007)。数え方は main の上限判定と同じ domain の `countOccupying` (生存フラグで数える)。
 * 起動要求の応答を待っている 1 件を足す (main の予約に当たる)。**前提**: 起動要求は UI で直列化されている
 * (`SessionScreen` は `launching` の間ダイアログを出さない)。並行起動を許すなら起動要求の件数を state に出して足す。
 */
export function slotUsage(state: RunningSessionStoreState): {
  readonly used: number
  readonly limit: number
} {
  const occupying = countOccupying(
    state.order.map((id) => ({ claudeAlive: state.statuses[id]?.claudeAlive !== false }))
  )
  return {
    used: occupying + (state.launch.phase === 'launching' ? 1 : 0),
    limit: MAX_CONCURRENT_SESSIONS
  }
}

/** 承認待ちと失敗の本数 (一覧の見出しとナビ。spec FR-002 / FR-003)。 */
export function attentionCounts(state: RunningSessionStoreState): {
  readonly awaiting: number
  readonly failed: number
} {
  let awaiting = 0
  let failed = 0
  for (const id of state.order) {
    const status = rowStatus(viewOf(state, id))
    if (status === 'awaiting') awaiting += 1
    else if (status === 'failed') failed += 1
  }
  return { awaiting, failed }
}

/**
 * 承認待ちの件数を押したときの移動先 (spec FR-002 / research R-04)。表示中を除く承認待ちのうち、承認待ちに入った
 * 時刻が最も早いもの。同時刻なら `order` の順。無ければ `null` (ボタンは押せない)。
 */
export function nextAwaiting(state: RunningSessionStoreState): string | null {
  let best: { readonly id: string; readonly at: number } | null = null
  for (const id of state.order) {
    if (id === state.selectedId) continue
    if (rowStatus(viewOf(state, id)) !== 'awaiting') continue
    const at = state.statusSince[id]?.at ?? Number.POSITIVE_INFINITY
    if (best === null || at < best.at) best = { id, at }
  }
  return best?.id ?? null
}

/**
 * 支援技術に読ませる文 (spec FR-004 / data-model §2)。`watchedId` (見ているセッション。セッション画面が表示されて
 * いるときだけ選ばれているもの) 以外のうち、承認待ち・失敗に**入った**ものを 1 つの文にまとめる。
 * **会話由来の値を引数に取らない** — 文は作業フォルダの表示名と固定の文言だけで組む。
 */
export function announcements(
  prev: Readonly<Record<string, StatusSince>>,
  next: Readonly<Record<string, StatusSince>>,
  watchedId: string | null,
  folderLabel: (sessionId: string) => string | null
): string | null {
  const awaiting: (string | null)[] = []
  const failed: (string | null)[] = []
  for (const [id, entry] of Object.entries(next)) {
    if (id === watchedId) continue
    if (prev[id]?.status === entry.status) continue
    if (entry.status === 'awaiting') awaiting.push(folderLabel(id))
    else if (entry.status === 'failed') failed.push(folderLabel(id))
  }
  return awaiting.length === 0 && failed.length === 0
    ? null
    : attentionAnnouncement(awaiting, failed)
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
