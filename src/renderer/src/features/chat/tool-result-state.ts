import type { ToolCallMessagePartStatus } from '@assistant-ui/react'

import type { SessionRunState } from '@domain/session/run-state'

/**
 * tool の結果の状態 (O-6 / 016 data-model §3)。**状態の正本は `toolResultState`** — 結果の無い tool-call の part に
 * assistant-ui が当てる状態 (`running` / `requires-action` / `incomplete`) は使わない。
 */

/** 状態の判定に使う thread の前提。 */
export interface ToolResultContext {
  /** 実行中のセッションか (過去ログは false)。 */
  readonly live: boolean
  /** 実行中のセッションの状態 (過去ログは null)。 */
  readonly runState: SessionRunState | null
  /** part が最新のターン (セッションの最後の利用者のメッセージより後) のメッセージにあるか。 */
  readonly latestTurn: boolean
  /** 同じ toolUseId の結果だけのメッセージ (`result:<toolUseId>`) があるか。 */
  readonly orphanResult: boolean
}

export type ToolResultState =
  /** 結果あり */
  | 'done'
  /** 結果あり (別のメッセージに表示) */
  | 'elsewhere'
  /** 結果待ち (応答中。動く印) */
  | 'running'
  /** 結果待ち (承認待ち。動かない印) */
  | 'awaiting'
  /** 結果不明 */
  | 'unknown'

/** 表の上から判定する (data-model §3)。 */
export function toolResultState(
  part: { readonly result?: unknown },
  ctx: ToolResultContext
): ToolResultState {
  if (part.result !== undefined) return 'done'
  if (ctx.orphanResult) return 'elsewhere'
  if (ctx.live && ctx.latestTurn) {
    if (ctx.runState === 'running') return 'running'
    if (ctx.runState === 'awaiting_permission') return 'awaiting'
  }
  return 'unknown'
}

/** 結果待ちか (O-4 の `ToolResultMarks` の `pending`。経過時間を出すか)。 */
export function isToolResultPending(state: ToolResultState): boolean {
  return state === 'running' || state === 'awaiting'
}

/**
 * 状態のアイコンの入力 (O-5 の `ToolFallbackStatusIcon` が受ける値)。`toolResultState` と part の `isError` から作る。
 * 結果あり → ✓ (`isError` なら ✗)、結果待ち (応答中) → spinner、結果待ち (承認待ち) → ⚠ (動かない)、結果不明 → ✗。
 */
export function toolStatusInput(
  state: ToolResultState,
  isError: boolean | undefined
): ToolCallMessagePartStatus {
  switch (state) {
    case 'done':
      return isError === true ? { type: 'incomplete', reason: 'error' } : { type: 'complete' }
    case 'elsewhere':
      return { type: 'complete' }
    case 'running':
      return { type: 'running' }
    case 'awaiting':
      return { type: 'requires-action', reason: 'tool-calls' }
    case 'unknown':
      return { type: 'incomplete', reason: 'other' }
  }
}
