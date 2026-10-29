import type { SessionRunState } from './run-state'

/**
 * 実行中のセッションの設定の変更 (023 / X-6 の最初の分割 / AD-062)。
 *
 * 権限モード (安全 3 値の中の遷移)・モデル (カタログの中)・名前 (transcript の custom-title) の 3 種類。
 * 受け付けの判定と名前の規則を **I/O なしの純関数**として持つ。main (判定の正本) と renderer (押せる形と理由)
 * が同じ関数を使う (data-model §5.1 / §5.3)。
 */

export type LiveSettingKind = 'permission-mode' | 'model' | 'name'

/** 受け付けない理由 (data-model §5.1 の blocker)。 */
export type LiveSettingBlocker =
  'not-running' | 'not-ready' | 'busy' | 'no-conversation' | 'turn-running'

/** `liveSettingBlocker` の入力 (行の状態)。`changing` は真偽 (結果を待っている変更があるか)。 */
export interface LiveSettingRow {
  readonly state: SessionRunState
  readonly claudeAlive: boolean
  readonly hasConversation: boolean
  readonly changing: boolean
}

/**
 * 受け付けの判定 (data-model §5.1)。上から順に見る。受け付けるなら null。
 *
 * - `!claudeAlive` か `idle` / `error` は `not-running`、`launching` は `not-ready`、変更中は `busy`
 * - 名前だけ: 会話の id なしは `no-conversation`、`running` / `awaiting_permission` は `turn-running`
 * - 権限モード・モデルは `running` / `awaiting_permission` / `interrupted` / `done` で受ける
 */
export function liveSettingBlocker(
  kind: LiveSettingKind,
  row: LiveSettingRow
): LiveSettingBlocker | null {
  if (!row.claudeAlive || row.state === 'idle' || row.state === 'error') return 'not-running'
  if (row.state === 'launching') return 'not-ready'
  if (row.changing) return 'busy'
  if (kind === 'name') {
    if (!row.hasConversation) return 'no-conversation'
    if (row.state === 'running' || row.state === 'awaiting_permission') return 'turn-running'
  }
  return null
}

/**
 * 失敗の理由の固定の表 (contracts の共通の戻り値)。**集合を変えるには ADR が要る (AD-062)。**
 * 並びは `live-settings.test.ts` が pin する。
 */
export const LIVE_SETTING_FAILURES = [
  'unknown-session',
  'invalid-value',
  'not-running',
  'not-ready',
  'busy',
  'no-conversation',
  'turn-running',
  'rejected',
  'session-ended',
  'timeout',
  'write-failed'
] as const

export type LiveSettingFailure = (typeof LIVE_SETTING_FAILURES)[number]

export type LiveSettingResult =
  { readonly ok: true } | { readonly ok: false; readonly reason: LiveSettingFailure }

export type RenameResult =
  | { readonly ok: true; readonly name: string }
  | { readonly ok: false; readonly reason: LiveSettingFailure }

/** 既定の Provider のモデルの一覧の 1 項目 (025 / contracts C-7)。 */
export interface LiveModelOption {
  readonly id: string
  readonly displayName: string
}

/**
 * `listSessionModels` の戻り値 (025 / AD-065)。`models` は起動の effort で絞った後の値。空の配列は `ok: true`。
 * `reportedCount` は effort で絞る前の件数で、`models` が空の理由を分ける (data-model §3.2)。
 */
export type LiveModelsResult =
  | {
      readonly ok: true
      readonly models: readonly LiveModelOption[]
      readonly reportedCount: number
    }
  | { readonly ok: false; readonly reason: LiveSettingFailure }

/** 名前の長さの上限 (UTF-16 のコード単位ではなくコードポイント数)。[ASSUMED: 数値デフォルト値] */
export const SESSION_NAME_MAX_LENGTH = 100

/** 制御文字 (`\p{Cc}`。改行を含む)・行の区切り (U+2028)・段落の区切り (U+2029)。 */
const FORBIDDEN_NAME_CHARS = /[\p{Cc}\u2028\u2029]/u

/**
 * 名前の規則 (data-model §5.3)。通れば trim した値、外れれば null。
 * 前後の空白を除いて 1〜100 文字 (`Array.from` の数)。制御文字・改行・行と段落の区切りを含めば null。
 */
export function normalizeSessionName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  if (trimmed.length === 0) return null
  if (Array.from(trimmed).length > SESSION_NAME_MAX_LENGTH) return null
  if (FORBIDDEN_NAME_CHARS.test(trimmed)) return null
  return trimmed
}
