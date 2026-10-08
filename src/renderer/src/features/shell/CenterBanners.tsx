import { useEffect, useState } from 'react'

import type { AutoModeStatus } from '@domain/runtime/capabilities'
import { isSafePermissionMode } from '@domain/session/launch-config'
import type { PermissionModeKey } from '@domain/session/meter'

import { PERMISSION_MODE_NAMES } from '@/features/chat/labels'
import { useRunningSessionsView } from '@/features/session/running-sessions-view'
import { useSessionMeters, type RateLimitMeter } from '@/features/session/useSessionMeters'
import { cn } from '@/lib/utils'

import { UNSAFE_MODE_BANNER_LABELS } from './labels'
import { MAX_TIMER_DELAY_MS, quotaBannerView } from './quota-banner'

/** 中央のヘッダの下の帯が読む、稼働中のセッションの値 (`CenterHeader` の `live` から渡す)。 */
export interface CenterBannersProps {
  readonly sessionId: string
  /** 起動の設定のランタイム (権限モードの警告の帯の隔離の文言が `autoModeStatus` を引く)。 */
  readonly runtimeId: string
  /** 送信できない終端か (`LiveSession.terminal`)。 */
  readonly terminal: boolean
}

/**
 * **中央のヘッダの下の帯** (O-4 / 014 data-model §4)。中央のヘッダの行と会話内検索のバーの間に置く。稼働中のセッション
 * だけで描く (`CenterHeader` が `live` のあるときだけ置く。過去の会話には出さない)。
 *
 * | 規則 | 根拠 |
 * |---|---|
 * | 並びは 権限モードの警告の帯 → Quota banner (どちらも兄弟として並べ、包む要素を置かない) | 014 data-model §4 |
 * | 帯はセッションごと。表示中のセッションの計量だけを読む | 014 spec US-2 AC5 |
 * | 判定と文の組み立ては `quotaBannerView` (純関数)。ここは描くだけ | 014 data-model §4 |
 * | 文はテキストとして描く (計量は数と列挙だけで、会話由来の文字列を含まない) | 014 spec FR-003 |
 */
export function CenterBanners({
  sessionId,
  runtimeId,
  terminal
}: CenterBannersProps): React.JSX.Element {
  return (
    <>
      <UnsafeModeBanner sessionId={sessionId} runtimeId={runtimeId} />
      <QuotaBanner sessionId={sessionId} terminal={terminal} />
    </>
  )
}

/**
 * **権限モードの警告の帯** (O-4 / 014 spec US-4 AC1a / FR-010。data-model §4「権限モード」。U-6 / Principle III)。
 *
 * | 規則 | 根拠 |
 * |---|---|
 * | 表示中のセッションの今の権限モード (`meters.permissionMode`) が null でなく、安全 3 値の外 (`unknown` を含む) のときだけ出す。判定は domain の `isSafePermissionMode` | 014 data-model §4 |
 * | `role="alert"` で知らせる。原因を断定しない | U-6 |
 * | 隔離の文言はランタイムの表示用の `autoModeStatus` から: `unavailable` → 隔離なし、`allowed` / `undetermined` → このセッションの隔離をアプリは確かめていない。`allowed` でも隔離されていると読める文言にしない。`autoModeAllowed` を使わない | 014 data-model §4 / isolation charter / DTO の不変条件 |
 * | 強制 (中断・失敗にする) はしない。起動の設定とプリセットの権限モードに書き戻さない | U-6 (持ち主は I-3) / 014 spec FR-005 |
 * | 文字色は light で `text-red-700`、dark で `text-destructive` (light の `text-destructive` は `bg-destructive/10` の上で 3.99:1 になり 4.5:1 に届かない。Quota banner の `warning` も同じ) | WCAG 1.4.3 / 014 pr-gate R1 H-002 |
 */
function UnsafeModeBanner({
  sessionId,
  runtimeId
}: {
  readonly sessionId: string
  readonly runtimeId: string
}): React.JSX.Element | null {
  const mode = useSessionMeters(sessionId, (meters) => meters.permissionMode)
  if (mode === null || isSafePermissionMode(mode)) return null
  return <UnsafeModeBannerOf mode={mode} runtimeId={runtimeId} />
}

/** 隔離の文言 (014 data-model §4。`unavailable` だけを「隔離なし」にする)。 */
function isolationSentence(status: AutoModeStatus): string {
  return status === 'unavailable'
    ? UNSAFE_MODE_BANNER_LABELS.unsafeModeNoIsolation
    : UNSAFE_MODE_BANNER_LABELS.unsafeModeIsolationUnverified
}

/** 出すと決まった警告の帯 (ランタイムの一覧は出すときだけ読む)。 */
function UnsafeModeBannerOf({
  mode,
  runtimeId
}: {
  readonly mode: PermissionModeKey
  readonly runtimeId: string
}): React.JSX.Element {
  const autoMode = useRunningSessionsView().runtimeAutoMode(runtimeId)
  return (
    <div
      role="alert"
      data-testid="unsafe-mode-banner"
      className="border-destructive/40 bg-destructive/10 text-red-700 dark:text-destructive flex shrink-0 items-center gap-3 border-b px-4 py-2 text-sm"
    >
      <p className="min-w-0 flex-1">
        {UNSAFE_MODE_BANNER_LABELS.unsafeModeBanner(PERMISSION_MODE_NAMES[mode])}
        {isolationSentence(autoMode)}
      </p>
    </div>
  )
}

/** 帯の作り直しの鍵。値の違う `rate_limit_event` が届いたら作り直し、判定の時刻を描画した時点に取り直す。 */
function rateLimitKey(rateLimit: RateLimitMeter): string {
  return [
    rateLimit.status,
    rateLimit.limitType ?? '',
    rateLimit.utilizationPct ?? '',
    rateLimit.resetsAtSec ?? '',
    rateLimit.usingOverage
  ].join('|')
}

function QuotaBanner({
  sessionId,
  terminal
}: {
  readonly sessionId: string
  readonly terminal: boolean
}): React.JSX.Element | null {
  const rateLimit = useSessionMeters(sessionId, (meters) => meters.rateLimit)
  if (rateLimit === null) return null
  return <QuotaBannerOf key={rateLimitKey(rateLimit)} rateLimit={rateLimit} terminal={terminal} />
}

/**
 * Quota banner 1 つ (014 data-model §4)。解除の時刻を過ぎたら、次の event を待たずに消す。
 * 再判定の timer は 1 つだけで、遅延は `MAX_TIMER_DELAY_MS` で頭打ちにする (発火した時点で時刻の前なら掛け直す)。
 * `rateLimit` か `terminal` が変わったとき・外れたときに timer を解く。
 */
function QuotaBannerOf({
  rateLimit,
  terminal
}: {
  readonly rateLimit: RateLimitMeter
  readonly terminal: boolean
}): React.JSX.Element | null {
  // 判定の時刻。描画した時点で決め、timer が発火したときだけ取り直す。
  const [nowMs, setNowMs] = useState(() => Date.now())
  const view = quotaBannerView(rateLimit, { terminal, nowMs })
  const resetsAtMs =
    view === null || rateLimit.resetsAtSec === null ? null : rateLimit.resetsAtSec * 1000

  useEffect(() => {
    if (resetsAtMs === null) return
    const delay = Math.min(Math.max(resetsAtMs - Date.now(), 0), MAX_TIMER_DELAY_MS)
    const timer = setTimeout(() => setNowMs(Date.now()), delay)
    return () => clearTimeout(timer)
  }, [resetsAtMs, nowMs, terminal])

  if (view === null) return null
  return (
    <div
      role={view.role}
      data-testid="quota-banner"
      data-tone={view.tone}
      className={cn(
        'flex shrink-0 items-center gap-3 border-b px-4 py-2 text-sm',
        view.tone === 'warning'
          ? 'border-destructive/40 bg-destructive/10 text-red-700 dark:text-destructive'
          : 'border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300'
      )}
    >
      <p className="min-w-0 flex-1">{view.sentences.join('')}</p>
    </div>
  )
}
