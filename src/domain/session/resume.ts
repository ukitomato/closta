import type { SessionLaunchConfig } from './launch-config'

/**
 * セッションの再開 (X-9 / AD-059 / data-model §2 / §3)。
 *
 * 再開の要求は `SessionLaunchConfig` を変えずに別の型で包む。会話の id は Closta の `sessionId` とは別の値で、
 * 本モジュールは値を検査しない (検査は境界の `isValidSessionId`)。I/O を持たない。
 */

export type ResumeSource =
  | { readonly kind: 'live'; readonly sessionId: string }
  | { readonly kind: 'past'; readonly targetKey: string; readonly conversationId: string }

export interface SessionResumeRequest {
  readonly source: ResumeSource
  /** 起動設定。引き継ぐ 3 軸は source から解いた値と一致しなければならない (data-model §4)。選び直せる軸は 6 つ (024)。`sessionName` は `null`。 */
  readonly config: SessionLaunchConfig
}

/**
 * 再開できない理由 (data-model §3)。訳出は `ui`。
 * 値の集合を変えるには ADR が要る (AD-059)。
 */
export type ResumeUnavailableReason =
  | 'source-unknown'
  | 'runtime-missing'
  | 'location-mismatch'
  | 'folder-unregistered'
  | 'cwd-mismatch'
  | 'folder-pending'
  | 'location-unknown'
  | 'provider-missing'
  | 'provider-ambiguous'

export const RESUME_UNAVAILABLE_REASONS = [
  'source-unknown',
  'runtime-missing',
  'location-mismatch',
  'folder-unregistered',
  'cwd-mismatch',
  'folder-pending',
  'location-unknown',
  'provider-missing',
  'provider-ambiguous'
] as const satisfies readonly ResumeUnavailableReason[]
