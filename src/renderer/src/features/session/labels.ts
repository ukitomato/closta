import type { LaunchFailureReason, SessionLaunchRejectReason } from '@domain/session/agent-session'
import type { SessionRunState } from '@domain/session/run-state'

/**
 * X-1 セッション起動 + ストリーミングの日本語ラベル (FE-030 / FR-020 / Principle XV)。
 *
 * **理由キーは `session`/`infra` が保持し、訳出は `ui`** (Principle XV。R-2 と同じ分担)。
 * `LaunchFailureReason` (9 種) + 調停由来 (`session-active` / `unknown-target`) を網羅する。
 */

const LAUNCH_REJECT_LABELS: Record<SessionLaunchRejectReason, string> = {
  'distro-not-running': '所在 (WSL ディストロ) が停止しています。起動してから再度お試しください。',
  'not-verified-running':
    '所在の実行中確認が取れませんでした。ランタイムを再検出してから起動してください。',
  'distro-mismatch':
    '作業フォルダの所在と選んだランタイムのディストロが一致しません。組み合わせを見直してください。',
  'claude-not-found':
    'ディストロ内に claude が見つかりませんでした。WSL 内に Claude Code を導入してください。',
  'launch-failed': '起動に失敗しました。もう一度お試しください。',
  'process-crashed': 'セッションのプロセスが異常終了しました。',
  'stream-protocol-error': '応答ストリームが壊れました。セッションを開き直してください。',
  'provider-error':
    'Provider の認証/接続でエラーが発生しました。ログイン状態やクレジットを確認してください。',
  'interrupt-unavailable': 'このセッションは中断に対応していないため強制終了に切り替えました。',
  // 稼働中に加え、reset 直後の kill 完了前 (競合窓) にも出る。「停止してから起動」だと直前に停止した利用者に
  // 矛盾して映るため、停止処理中も含めて「少し待って再試行」に寄せる (pr-gate po M-001)。
  'session-active':
    '別のセッションが稼働中、または停止処理中です。少し待ってから再度お試しください。',
  'unknown-target': '選んだ作業フォルダまたはランタイムが見つかりませんでした。'
}

export function launchRejectLabel(reason: SessionLaunchRejectReason): string {
  return LAUNCH_REJECT_LABELS[reason]
}

export function launchFailureLabel(reason: LaunchFailureReason): string {
  return LAUNCH_REJECT_LABELS[reason]
}

/** `provider-error` だけ「再ログイン」導線を出す (FR-030)。他は再起動導線。 */
export function isReloginFailure(reason: LaunchFailureReason | null): boolean {
  return reason === 'provider-error'
}

const RUN_STATE_LABELS: Record<SessionRunState, string> = {
  idle: '待機中',
  launching: '起動中…',
  running: '応答中…',
  awaiting_permission: '承認待ち',
  interrupted: '中断しました',
  error: 'エラー',
  done: '完了'
}

export function runStateLabel(state: SessionRunState): string {
  return RUN_STATE_LABELS[state]
}
