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
  // Hook の started は応答が来るまでの間ずっと出るので「開始」ではなく「実行中」(pr-gate R1 po L-003)。
  started: '実行中',
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
  /** 失敗した Hook の行の案内 (出力本文は出さない。見る場所を示す。spec Edge Cases / pr-gate R1 po L-003)。 */
  hookFailedGuidance:
    'Hook の設定 (.claude/settings.json などの hooks) と、claude --debug の出力を確かめてください。'
} as const

/**
 * Background task の種類 (SDK の `task_type`) → 文言 (pr-gate R1 po L-002)。値は SDK 0.3.270 の `sdk.d.ts` に
 * 現れるもの。知らない値は識別子のまま出す (`taskTypeLabel`)。
 */
const TASK_TYPE_LABELS: Readonly<Record<string, string>> = {
  local_bash: 'シェルのコマンド',
  local_agent: 'サブエージェント',
  local_workflow: 'ワークフロー',
  mcp_task: 'MCP のタスク'
}

/** task の種類の文言。表に無い値 (`toString` などの prototype のキーを含む) はそのまま返す。 */
export function taskTypeLabel(taskType: string): string {
  return Object.hasOwn(TASK_TYPE_LABELS, taskType)
    ? (TASK_TYPE_LABELS[taskType] ?? taskType)
    : taskType
}

/**
 * tool の結果の印 (O-2 / FR-007)。Terminal block・Code diff・ToolFallback・Subagent・Todo list・Agent plan で
 * 同じ文言を使う (pr-gate R1 po H-001)。
 */
export const TOOL_RESULT_LABELS = {
  /** 結果がエラー (失敗・拒否) だったとき。 */
  failed: '失敗',
  /** 完了したとき (Terminal block のアイコンの名前)。 */
  completed: '完了',
  /** args か結果が上限で切り詰められたとき。 */
  truncated: '（切り詰め）'
} as const

/**
 * transcript の情報密度の切り替え (FR-012)。**監視ビューの行の密度 (`MONITOR_LABELS.density`) と区別できる文言**
 * にする (US-3 AC5 / design-gate R1 po M-005)。group 名は見える見出しとしても出す (pr-gate R1 po M-001)。
 * ボタンの説明 (`title`) は `thread.aui.tsx` の描き分けに合わせる。
 */
export const TRANSCRIPT_DENSITY_LABELS = {
  group: 'transcript の表示',
  comfortable: '開いて表示',
  compact: '畳んで表示',
  comfortableHint: 'Tool group を既定で開いて表示します (Reasoning は応答中だけ開きます)。',
  compactHint: 'Tool group と Reasoning を既定で畳んで表示します。'
} as const
