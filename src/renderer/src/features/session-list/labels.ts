import type { CwdOriginKind, PendingReason, UnknownReason } from '@domain/session/keys'
import type { FailureReason, TargetStatus } from '@domain/session/target'
import type { Boundary } from '@domain/workspace/dto'

/**
 * 参照キーの訳出 (FR-046 / FR-047)。
 *
 * **内部識別子をそのまま提示しない。** DTO は閉じた参照キーを運び、
 * 日本語にするのは renderer である (R-1 の `runtime-list/labels.ts` と同じ形)。
 *
 * **`Record` で網羅する。** キーが増えたときに型エラーになり、訳し漏れが残らない。
 * FR-046 は「全値」を要求しており、部分的な `Partial<Record<...>>` は使わない。
 *
 * **解消手順まで書く。** 「権限がありません」だけでは利用者が次に何をすればよいか
 * 分からない。R-1 が `missingDependencies` に `docAnchor` を持たせたのと同じ考えである。
 */

/** 所在ごと・候補ごとの失敗 (data-model §6)。 */
export const FAILURE_REASON_LABELS: Record<FailureReason, string> = {
  'distro-not-running': '停止中のため未列挙',
  'wsl-unavailable': 'WSL を利用できません',
  'permission-denied': '読み取り権限がありません',
  'path-too-long': 'パスが長すぎて読めません',
  'stopped-midway': '列挙中に停止しました（途中までの結果です）',
  'enumeration-failed': '列挙に失敗しました'
}

/** 失敗に対して利用者が取れる行動。**空文字を許さない** (行動が無いなら理由に含める)。 */
export const FAILURE_REASON_HINTS: Record<FailureReason, string> = {
  'distro-not-running': 'ディストロを起動してから再取得してください。',
  'wsl-unavailable': 'WSL の導入状況を確認してください。',
  'permission-denied': 'そのユーザのホームは Windows 側から読めません。',
  'path-too-long': 'ホームディレクトリの位置を見直す必要があります。',
  'stopped-midway': '再取得すると残りを取得できます。',
  'enumeration-failed': '再取得してください。続く場合はログを確認してください。'
}

/** 所在の状態。**`no-history` は失敗ではない** (FR-012)。 */
export const TARGET_STATUS_LABELS: Record<TargetStatus, string> = {
  ok: '列挙済み',
  'no-history': 'セッションの履歴がありません',
  failed: '列挙できませんでした'
}

/**
 * 保留の理由 (R-1 の `BlockedReason` をそのまま使っている)。
 *
 * **「今は決められない」であり「対応が無い」ではない。**
 * 解消手順が示せるものを前に出す規則は `domain` の `PENDING_PRIORITY` が持つ。
 */
export const PENDING_REASON_LABELS: Record<PendingReason, string> = {
  'distro-not-running': '所在のディストロが停止中です',
  'probe-failed': '能力の判定に失敗しました',
  'capabilities-not-probed': '能力の判定が終わっていません'
}

/** 作業ディレクトリから所在が決まらなかった理由 (FR-028)。**3 つを潰さない。** */
export const UNKNOWN_REASON_LABELS: Record<UnknownReason, string> = {
  'cwd-absent': '作業ディレクトリが記録されていません',
  'location-unknown': '作業ディレクトリの所在が特定できません',
  'distro-undetected': '所在のディストロが検出されていません'
}

/**
 * 作業ディレクトリの出自 (data-model §2)。
 *
 * **`undetected-distro` と `unknown-location` を同じ文言にしない。**
 * 前者は「どのディストロかは分かるが、そのディストロが今ない」、
 * 後者は「どのディストロか分からない」であり、利用者に示すべきことが違う。
 */
export const CWD_ORIGIN_LABELS: Record<CwdOriginKind, string> = {
  host: 'Windows',
  'wsl-from-unc': 'WSL（パスの形から判定）',
  'wsl-inherited': 'WSL（由来の所在から判定）',
  'unknown-location': '所在不明',
  'undetected-distro': '未検出のディストロ',
  absent: '作業ディレクトリなし'
}

/** 越境の有無 (R-1 の 3 値)。**2 値に潰さない。** */
export const BOUNDARY_LABELS: Record<Boundary, string> = {
  native: '同じ所在',
  cross: '越境',
  unknown: '未判定'
}
