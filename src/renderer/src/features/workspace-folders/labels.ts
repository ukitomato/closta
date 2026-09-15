import type {
  BlockedReason,
  CrossBoundaryStep,
  Reachability,
  ResolutionStep,
  UnreachableReason
} from '@domain/workspace/folder'
import type {
  Boundary,
  BrowseError,
  RegisterFolderReason,
  RestoreIssueReason
} from '@domain/workspace/dto'

/**
 * 参照キーの訳出 (FR-047)。**内部識別子をそのまま提示しない。**
 *
 * `Record` で網羅するので、キーが増えたときに型エラーになり訳し漏れが残らない。
 * 文面は data-model §8「利用者向けメッセージの意図」に従う。
 */

export const REACHABILITY_LABELS: Record<Reachability, string> = {
  reachable: '使える',
  blocked: '今は使えない',
  unreachable: '使えない'
}

export const UNREACHABLE_LABELS: Record<UnreachableReason, string> = {
  'foreign-distro': '別のディストロの中にあるため、このランタイムからは開けません',
  'unc-cwd-unsupported': 'WSL の中にあるため、Windows のランタイムからは開けない扱いにしています',
  'folder-missing': 'フォルダが見つかりません。移動または削除された可能性があります',
  'distro-absent': '登録時のディストロが見つかりません。名前が変わった可能性があります',
  'path-not-mapped': 'このドライブは選んだランタイムから見えません'
}

export const BLOCKED_LABELS: Record<BlockedReason, string> = {
  'distro-not-running':
    'ディストロが停止しています。起動して再検出すると、この組み合わせを使えるかどうかが分かります',
  'capabilities-not-probed':
    'ランタイムを調べている最中です。完了すると、この組み合わせを使えるかどうかが分かります',
  'probe-failed': 'ランタイムを調べられませんでした。再検出すると試し直します'
}

export const RESOLUTION_STEP_LABELS: Record<ResolutionStep, string> = {
  'start-distro': 'ディストロを起動する',
  'rescan-runtimes': 'ランタイムを再検出する',
  'wait-for-probe': '判定の完了を待つ'
}

export const CROSS_STEP_LABELS: Record<CrossBoundaryStep, string> = {
  'clone-to-suggested-location': '推奨の場所に複製する',
  'register-new-folder': '複製先を新しく登録する',
  'unregister-old-folder': '元の登録を解除する'
}

export const BOUNDARY_LABELS: Record<Boundary, string> = {
  native: '同じファイルシステム',
  cross: 'ファイルシステムをまたぐ',
  unknown: '未判定'
}

export const RESTORE_ISSUE_LABELS: Record<RestoreIssueReason, string> = {
  'parse-failed': '保存ファイルを読み取れませんでした',
  'schema-version-unknown': '保存ファイルの形式が新しく、この版では読めませんでした',
  'namespace-mismatch': '所在とパスの対応が合っていないレコードがありました',
  'invalid-path': 'パスの形式が正しくないレコードがありました',
  'invalid-record': '内容が正しくないレコードがありました'
}

export const BROWSE_ERROR_LABELS: Record<BrowseError, string> = {
  'distro-not-running': 'ディストロが停止しています。起動してから開き直してください',
  'distro-unreachable': 'ディストロに接続できません',
  'permission-denied': 'このフォルダを読む権限がありません',
  'not-found': 'そのフォルダは見つかりません',
  'path-too-long': 'パスが長すぎます',
  'browse-session-expired': '選択の有効期間が切れました。もう一度開いてください',
  'unsupported-location': 'この所在はフォルダブラウザで辿れません',
  'too-many-entries': '項目が多すぎて一覧にできません'
}

export const REGISTER_ERROR_LABELS: Record<RegisterFolderReason, string> = {
  duplicate: '同じ所在・同じパスのフォルダが既に登録されています',
  'namespace-mismatch': '所在とパスの対応が合っていません',
  'invalid-path': 'パスの形式が正しくありません',
  'invalid-display-name': '表示名が長すぎるか、使えない文字を含んでいます',
  'unknown-location': 'その所在は検出されていません'
}

/** 所在の表示名。 */
export function locationLabel(location: { kind: 'windows' | 'wsl'; distroName?: string }): string {
  return location.kind === 'windows' ? 'Windows (ホスト)' : `WSL: ${location.distroName ?? ''}`
}
