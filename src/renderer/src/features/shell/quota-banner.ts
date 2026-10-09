import type { RateLimitMeter } from '@/features/session/useSessionMeters'

import { formatQuotaResetTime, QUOTA_BANNER_LABELS, rateLimitTypeLabel } from './labels'

/**
 * Quota banner の表示の判定と文の組み立て (O-4 / 014 spec FR-006 / US-2。
 * [data-model](../../../../../specs/014-ui-metering-and-limits/data-model.md) §4「Quota banner」の 2 つの表が正本)。
 * **純粋関数**。部品 (`CenterBanners.tsx`) は結果を描くだけにする。
 *
 * | 規則 | 根拠 |
 * |---|---|
 * | `rateLimit` が無い・`allowed`・解除の時刻を過ぎたら出さない (ストアの値は書き換えない) | data-model §4「出すか」 |
 * | 文は状態 → 超過分 → 時刻 (か待つ案内) の順に 1 つの段落に並べる | data-model §4「見た目と文」 |
 * | 待つ案内 (「送ってください」) は、まだ送れるセッション (`terminal` が false) の `rejected` にだけ出す | US-2 AC2 / data-model §4 |
 * | 送れない終端の `rejected` は警告の見た目のまま `role="status"` に下げ、時刻だけを出す (失敗の表示と逆の操作を案内しない) | data-model §4 |
 */

/** 帯の見た目と文。 */
export interface QuotaBannerView {
  /** `notice` = 注意 (`allowed_warning`)、`warning` = 警告 (`rejected`)。 */
  readonly tone: 'notice' | 'warning'
  readonly role: 'status' | 'alert'
  /** 1 つの段落に並べる文 (左から順)。 */
  readonly sentences: readonly string[]
}

export interface QuotaBannerContext {
  /** 表示中のセッションが送信できない終端か (`LiveSession.terminal`。失敗・終了済み・強制終了・終了処理中)。 */
  readonly terminal: boolean
  /** 判定の時刻 (epoch ms)。解除の時刻を過ぎたかと、時刻の書式の「今日」を決める。 */
  readonly nowMs: number
}

/** `setTimeout` に渡せる遅延の上限。これを超える値を渡すとすぐに発火する (014 data-model §4)。 */
export const MAX_TIMER_DELAY_MS = 2 ** 31 - 1

export function quotaBannerView(
  rateLimit: RateLimitMeter | null,
  { terminal, nowMs }: QuotaBannerContext
): QuotaBannerView | null {
  if (rateLimit === null || rateLimit.status === 'allowed') return null
  const resetsAtMs = rateLimit.resetsAtSec === null ? null : rateLimit.resetsAtSec * 1000
  if (resetsAtMs !== null && nowMs >= resetsAtMs) return null

  const labels = QUOTA_BANNER_LABELS
  const kind = rateLimitTypeLabel(rateLimit.limitType)
  // 書式にできない時刻 (Invalid Date) は「時刻なし」と同じに扱う。
  const time = resetsAtMs === null ? null : formatQuotaResetTime(resetsAtMs, nowMs)
  const overage = rateLimit.usingOverage ? [labels.quotaOverage] : []

  if (rateLimit.status === 'allowed_warning') {
    // 割合は切り捨てる (上限の前に「100%」と出さない)。
    const state =
      rateLimit.utilizationPct === null
        ? labels.quotaWarningNoPct(kind)
        : labels.quotaWarning(kind, Math.floor(rateLimit.utilizationPct))
    return {
      tone: 'notice',
      role: 'status',
      sentences: [state, ...overage, ...(time === null ? [] : [labels.quotaReset(time)])]
    }
  }

  const tail = terminal
    ? time === null
      ? []
      : [labels.quotaReset(time)]
    : [time === null ? labels.quotaWait : labels.quotaWaitUntil(time)]
  return {
    tone: 'warning',
    role: terminal ? 'status' : 'alert',
    sentences: [labels.quotaRejected(kind), ...overage, ...tail]
  }
}
