import type { SystemEventCategory, SystemEventStatus } from '@domain/session/transcript-dto'

/**
 * transcript (過去ログと実行中で共有する element) の文言 (O-2 / FR-009・FR-012)。
 *
 * transcript の element (`thread.aui.tsx`) は過去ログと実行中で共有し、elements が import する features は
 * `features/chat` だけなので、session の `labels.ts` には置かない (research R-06 / design-gate R1 architecture M-006)。
 * 状態の理由キーは domain の `SYSTEM_EVENT_STATUSES` (data-model §2)。
 */

/** システムイベントの行の種類 (行の先頭に出す)。 */
export const SYSTEM_EVENT_CATEGORY_LABELS: Readonly<Record<SystemEventCategory, string>> = {
  hook: 'Hook',
  task: 'Background task'
}

/** 状態の理由キー → 文言。 */
export const SYSTEM_EVENT_STATUS_LABELS: Readonly<Record<SystemEventStatus, string>> = {
  started: '開始',
  succeeded: '成功',
  failed: '失敗',
  cancelled: '取り消し',
  pending: '待機中',
  running: '実行中',
  completed: '完了',
  killed: '強制停止',
  paused: '一時停止',
  stopped: '停止',
  unknown: '不明な状態'
}

export const SYSTEM_EVENT_LABELS = {
  /** 終わりの来ない行 (セッションの終了・失敗の後と過去ログ。FR-009 / US-2 AC6)。 */
  outcomeUnknown: '結果不明 (記録に終わりが無い)',
  /** 失敗した Hook の行の案内 (出力本文は出さない。spec Edge Cases)。 */
  hookFailedGuidance: 'Hook の設定と Claude Code のログを確かめてください。'
} as const

/**
 * transcript の情報密度の切り替え (FR-012)。**監視ビューの行の密度 (`MONITOR_LABELS.density`) と区別できる文言**
 * にする (US-3 AC5 / design-gate R1 po M-005)。
 */
export const TRANSCRIPT_DENSITY_LABELS = {
  group: 'transcript の表示',
  comfortable: '開いて表示',
  compact: '畳んで表示'
} as const
