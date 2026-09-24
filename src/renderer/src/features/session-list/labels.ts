import type { SessionIndexDTO } from '@domain/session/dto'
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
  'enumeration-failed': '列挙に失敗しました',
  // transcript 取得の失敗。**session-list では発生しない** (transcript 経路専用) が Record 網羅のため置く。
  // transcript 画面の文言は `features/chat/ChatScreen.tsx` の `transcriptFailureDetail` が持つ。
  'transcript-read-failed': '履歴を読み込めませんでした'
}

/** 失敗に対して利用者が取れる行動。**空文字を許さない** (行動が無いなら理由に含める)。 */
export const FAILURE_REASON_HINTS: Record<FailureReason, string> = {
  'distro-not-running': 'ディストロを起動してから再取得してください。',
  'wsl-unavailable': 'WSL の導入状況を確認してください。',
  'permission-denied': 'そのユーザのホームは Windows 側から読めません。',
  'path-too-long': 'ホームディレクトリの位置を見直す必要があります。',
  'stopped-midway': '再取得すると残りを取得できます。',
  'enumeration-failed': '再取得してください。続く場合はログを確認してください。',
  'transcript-read-failed': '再取得してください。'
}

/**
 * 索引をどこまで信じてよいか (pr-gate Round 4 / 不変条件 5 / FR-037 / FR-012)。
 *
 * ## なぜ 1 つに畳むか
 *
 * 根は `session-service.ts` の 1 行にある。
 *
 * ```
 * complete = done && scope.kind === 'all'
 * ```
 *
 * これは「**全所在を試した**」であって「**全所在を読めた**」ではない。失敗があっても真になる。
 * そこから派生した「断言してよいか」の判定が画面に 5 通り散っていた —
 * `complete` の prop、`hasFailure`、区画の `outcomes.some(truncated)`、
 * 所在行の `outcome.truncated`、`outcomesForSection`。
 * **同じ問いに 5 通りの答え方があり、ずれたところが欠陥になっていた**
 * (pr-gate Round 3 / UX3-003 〜 UX3-006)。
 *
 * ## 打ち切りも同じ軸である
 *
 * 「上限で切った」も「断言できない」の一種なので、別の引数にせずここへ畳む。
 * 表示は元から 3 通り (`取得中` / `以上` / 確定) あり、**判定だけが散っていた**。
 */
export type Coverage =
  /** まだ出そろっていない。 */
  | 'pending'
  /** 出そろったが、読めなかった所在か打ち切った所在がある。**断言しない。** */
  | 'partial'
  /** 全部読めた。**ここでだけ件数と空状態を断言してよい。** */
  | 'complete'

export function coverageOf(index: SessionIndexDTO | null): Coverage {
  if (index === null || !index.complete) return 'pending'
  const shaky = index.outcomes.some((outcome) => outcome.status === 'failed' || outcome.truncated)
  return shaky ? 'partial' : 'complete'
}

/**
 * 件数の文 (FR-037 / FR-038)。
 *
 * **確定と言えるのは `complete` のときだけである。**
 */
export function countText(count: number, coverage: Coverage): string {
  if (coverage === 'pending') return `${count} 件以上 (取得中)`
  return coverage === 'partial' ? `${count} 件以上` : `${count} 件`
}

/**
 * その失敗に対して**どの操作が意味を持つか** (pr-gate Round 4 / 不変条件 2)。
 *
 * ## なぜ表にするか
 *
 * 画面に**判定基準が 2 つ同居していた**。`Outcomes` は
 * `reasonKey === 'distro-not-running'` を見て再検出ボタンを出し分けるのに、
 * 索引レベルのバナーは**理由に関わらず**「ランタイムを再検出して取り直す」を出していた
 * (pr-gate Round 3 / UX3-007 / A11Y3-009)。
 *
 * その結果、`permission-denied` (「そのユーザのホームは Windows 側から読めません」) の
 * 隣に、**それでは直らない操作が唯一の操作として**置かれていた。
 * 誤った復旧導線は、導線が無いより悪い — 利用者は操作して、変わらない理由を得られない。
 *
 * ## なぜ DTO ではなくここか
 *
 * これは `reasonKey` の**純粋関数**であって独立した状態ではない。
 * DTO に載せると境界を渡る状態が 1 つ増え、contract と SC-011 の許可リストにも波及する。
 * 訳出と同じ層に、訳出と同じ鍵の表として置けば足りる。
 */
export type FailureRemedy =
  /** 再取得で直りうる (一時的な失敗)。 */
  | 'retry'
  /** ランタイムを検出し直せば直りうる。 */
  | 'rediscover'
  /** **再取得では直らない。** 環境側の操作が要る。 */
  | 'fix-environment'

export const FAILURE_REASON_REMEDY: Record<FailureReason, FailureRemedy> = {
  'distro-not-running': 'rediscover',
  'wsl-unavailable': 'fix-environment',
  'permission-denied': 'fix-environment',
  'path-too-long': 'fix-environment',
  'stopped-midway': 'retry',
  'enumeration-failed': 'retry',
  'transcript-read-failed': 'retry'
}

/**
 * 理由の集合に対して出すべき操作を 1 つ決める。
 *
 * **強い順に選ぶ** — 1 つでも再検出で直るものがあれば再検出を出す。
 * どれも環境側の問題なら、再取得を勧めない。
 */
export function remedyFor(reasons: readonly FailureReason[]): FailureRemedy | null {
  if (reasons.length === 0) return null
  const remedies = reasons.map((r) => FAILURE_REASON_REMEDY[r])
  if (remedies.includes('rediscover')) return 'rediscover'
  if (remedies.includes('retry')) return 'retry'
  return 'fix-environment'
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
