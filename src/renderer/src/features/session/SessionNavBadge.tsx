import { useShallow } from 'zustand/react/shallow'

import { CircleAlertIcon, ShieldAlertIcon } from 'lucide-react'

import { Badge } from '@/components/ui/badge'

import { attentionSummaryLabel, awaitingCountLabel, failedCountLabel } from './labels'
import { useRunningSessionStore } from './running-session-context'
import { attentionCounts } from './session-view'

/**
 * サイドバーの稼働中の区画の見出しと、畳んだサイドバーの帯に置く件数 (O-1 / FR-002 / FR-003 / research R-09。
 * O-7 で置き場所を上部のタブの「セッション起動」から移した。data-model §3)。
 *
 * | 規則 | 根拠 |
 * |---|---|
 * | 過去の会話や設定を開いている間も、承認待ちと失敗を**別々に**見せる。0 件のものは出さない | USER 決定 2026-10-02 design-gate H-04 / R2 M-05 |
 * | 色だけに頼らない (アイコンと件数の文言)。件数は表示だけで、押したときの移動は持たない (移動は区画の見出しの承認待ちの件数のボタン) | FR-001 / FR-002 |
 * | 何の件数かを見て分かるようにする。見える中身はアイコンと数字だけなので `title` に件数の文を出し、見出しの外に置く所 (設定のダイアログ) では見える語 (`context`) を添える | O-7 pr-gate R2 ux M-101 |
 * | シェルは差し込むだけ (シェルは面の配置と遷移だけを持つ) | design-gate R2 architecture L-102 / O-7 U-2 |
 */
export function SessionNavBadge({
  orientation = 'row',
  context
}: {
  /** `column` は畳んだサイドバーの帯 (48px) 用。横に並べると 2 つで帯の幅を超える (pr-gate R1 ux M-010)。 */
  readonly orientation?: 'row' | 'column'
  /** 印の前に見せる語 (「稼働中」の見出しの外に置くとき)。 */
  readonly context?: string
} = {}): React.JSX.Element | null {
  const counts = useRunningSessionStore(useShallow((s) => attentionCounts(s)))
  if (counts.awaiting === 0 && counts.failed === 0) return null
  return (
    <span
      className={
        orientation === 'column'
          ? 'inline-flex flex-col items-center gap-1'
          : 'ms-1.5 inline-flex items-center gap-1'
      }
      title={attentionSummaryLabel(counts.awaiting, counts.failed)}
      data-testid="session-nav-badge"
    >
      {context !== undefined && <span className="text-muted-foreground text-xs">{context}</span>}
      {counts.awaiting > 0 && (
        <Badge className="px-1.5 py-0" data-testid="session-nav-awaiting">
          <ShieldAlertIcon aria-hidden />
          <span aria-hidden>{counts.awaiting}</span>
          <span className="sr-only">{awaitingCountLabel(counts.awaiting)}</span>
        </Badge>
      )}
      {counts.failed > 0 && (
        <Badge variant="destructive" className="px-1.5 py-0" data-testid="session-nav-failed">
          <CircleAlertIcon aria-hidden />
          <span aria-hidden>{counts.failed}</span>
          <span className="sr-only">{failedCountLabel(counts.failed)}</span>
        </Badge>
      )}
    </span>
  )
}
