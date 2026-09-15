import { isSameDistro, type NamespaceId, type WslNamespaceId } from './namespace'

/**
 * 実行中であることを確認済みのディストロを表す型 (data-model §5)。
 *
 * `probe` と WSL 側ファイルアクセスは、**この値しか受け取らない** (FR-007 / FR-015)。
 * 「呼ばない」という約束ではなく、**確認を経た値しか受け取れない型**で表す。
 *
 * この型は `createVerifiedRunning()` の戻り値としてのみ生成され、
 * **本モジュールの外から組み立てられない** (brand を付ける手段が外に無い)。
 * 生成できるのは実行状態を確認する `verifyRunning` の実装だけである。
 */

declare const verifiedRunningBrand: unique symbol

export interface VerifiedRunning {
  readonly [verifiedRunningBrand]: true
  /** **どのディストロについての確認か。** これが無いと正規の値を別ディストロに流用できる。 */
  readonly namespace: WslNamespaceId
  /** 確認した時刻。有効期間の起点。 */
  readonly verifiedAt: number
}

/** ブラウズセッションの有効期間の上限 (data-model §5)。 */
export const BROWSE_SESSION_TTL_MS = 30_000

/**
 * 確認済みの値を生成する。
 *
 * **`verifyRunning` の実装からのみ呼ぶ。** ここを他から呼ぶと型の制約が意味を失う。
 * 呼び出し箇所は dependency-cruiser のルールで `infra/runtime` に限定する (SH-013)。
 */
export function createVerifiedRunning(
  namespace: WslNamespaceId,
  verifiedAt: number
): VerifiedRunning {
  return { namespace, verifiedAt } as VerifiedRunning
}

export type VerificationErrorReason = 'expired' | 'distro-mismatch'

export type VerificationCheck =
  { readonly ok: true } | { readonly ok: false; readonly reason: VerificationErrorReason }

/**
 * 確認済みの値が有効期間内かを検査する。
 *
 * **ファイルアクセスの前に呼ぶ。** 失敗を検知してから再確認する形にすると、
 * UNC アクセスが停止中ディストロを**起動して成功した**場合に検知が発火しない。
 *
 * なお有効期間内に実体が停止する窓は残る (§5)。確認から次の操作までのあいだに
 * アイドル自動停止が起これば期限内でも値は実体と乖離する。窓を消すには操作ごとに
 * 確認を発行するほかなく、SC-004 の 300 ms 予算とも FR-010 とも両立しない。
 * **残余として受け入れ、SC-005 はアプリ側の発行行為で測る。**
 */
export function checkNotExpired(
  verified: VerifiedRunning,
  now: number,
  ttlMs: number = BROWSE_SESSION_TTL_MS
): VerificationCheck {
  if (now - verified.verifiedAt > ttlMs) return { ok: false, reason: 'expired' }
  return { ok: true }
}

/**
 * 確認済みの値と操作対象が**同じディストロ**を指すかを検査する。
 *
 * 種別 (`wsl:` / `unc:`) が構造的に異なる 2 つを比較する唯一の経路であり、
 * `isSameDistro` を使う (境界を渡る値どうしの「種別まで完全一致」は適用できない)。
 *
 * 偽造だけでなく**正規の値の別ディストロへの流用**も止める。
 */
export function checkSameTarget(verified: VerifiedRunning, target: NamespaceId): VerificationCheck {
  if (!isSameDistro(verified.namespace, target)) return { ok: false, reason: 'distro-mismatch' }
  return { ok: true }
}

/** 期限と対象の両方を検査する。`infra` の入口はこれを通す。 */
export function checkVerified(
  verified: VerifiedRunning,
  target: NamespaceId,
  now: number,
  ttlMs: number = BROWSE_SESSION_TTL_MS
): VerificationCheck {
  const target_ = checkSameTarget(verified, target)
  if (!target_.ok) return target_
  return checkNotExpired(verified, now, ttlMs)
}
