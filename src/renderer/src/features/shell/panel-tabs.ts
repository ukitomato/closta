import { GaugeIcon, InfoIcon, ServerIcon, type LucideIcon } from 'lucide-react'

import type { SessionMeters } from '@/features/session/useSessionMeters'
import type { CenterFocus, PanelTabId } from '@/stores/ui'

import { initReportNeedsAttention } from './init-report-attention'
import { InitReportTab } from './InitReportTab'
import { SHELL_LABELS } from './labels'
import { OverviewTab } from './OverviewTab'
import { UsageTab } from './UsageTab'

/**
 * **右のペインのタブの表** (O-7 / FR-014 / data-model §4。1 か所の表)。O-4 は「使用量」(Cost meter の置き場。Context display
 * は中央のヘッダの目盛り。014 data-model §4) を、O-5 は「構成」(roadmap の O-5 の行の Server panel の置き場。015 data-model
 * §3) と注意の印 (`attention`) を足した。後続 feature (O-11 の TodoList / Background task の要否の判断・OPT-panel) はこの表に行を足す。
 *
 * **`Content` は renderer の DOM の中に描くものに限る。** 外部コンテンツ (Browser / PR の Webview) のタブはこの形で
 * 表さない (AD-046 Decision 4。OPT-panel で種別を足し、main が管理する `WebContentsView` の境界に従う)。
 */
export interface PanelTab {
  readonly id: PanelTabId
  readonly label: string
  readonly icon: LucideIcon
  /** このタブを出せる中央の状態。 */
  readonly availableFor: readonly CenterFocus[]
  readonly Content: () => React.JSX.Element
  /**
   * 畳んだ帯のアイコンに注意の印を出すか (O-5 / 015 data-model §3)。右のペインが表示中の稼働中のセッションの計量を渡す
   * (過去・未選択では呼ばない)。純関数で、保持している値だけを読む。無ければ印を出さない。
   */
  readonly attention?: (meters: SessionMeters) => boolean
}

export const PANEL_TABS: readonly PanelTab[] = [
  {
    id: 'overview',
    label: SHELL_LABELS.overviewTab,
    icon: InfoIcon,
    availableFor: ['none', 'running', 'past'],
    Content: OverviewTab
  },
  {
    id: 'usage',
    label: SHELL_LABELS.usageTab,
    icon: GaugeIcon,
    // 値は稼働中だけで出す。過去と未選択はタブを出して空の状態を言う (014 spec US-3 AC5 / FR-008)。
    availableFor: ['none', 'running', 'past'],
    Content: UsageTab
  },
  {
    id: 'init-report',
    label: SHELL_LABELS.initReportTab,
    icon: ServerIcon,
    // 値は稼働中だけで出す。過去と未選択はタブを出して空の状態を言う (015 spec US-2 AC7)。
    availableFor: ['none', 'running', 'past'],
    Content: InitReportTab,
    // MCP サーバーのどれかが `failed` / `needs-auth` (015 spec US-2 AC5)。
    attention: initReportNeedsAttention
  }
]

/** 今の中央の状態で出せるタブ (表の並び)。 */
export function visibleTabs(tabs: readonly PanelTab[], focus: CenterFocus): readonly PanelTab[] {
  return tabs.filter((tab) => tab.availableFor.includes(focus))
}

/** 選んでいたタブが出せなければ最初のタブに戻す。出せるタブが無ければ `null`。 */
export function activeTab(
  tabs: readonly PanelTab[],
  focus: CenterFocus,
  selected: PanelTabId
): PanelTab | null {
  const visible = visibleTabs(tabs, focus)
  return visible.find((tab) => tab.id === selected) ?? visible[0] ?? null
}

/**
 * 計量 `meters` で注意の印を出すタブの id (表の並び)。`attention` の無いタブは含めない。例外を出さない前提の純関数だけを
 * 呼ぶ。
 */
export function attentionTabIds(
  tabs: readonly PanelTab[],
  meters: SessionMeters
): readonly PanelTabId[] {
  return tabs.filter((tab) => tab.attention?.(meters) === true).map((tab) => tab.id)
}
