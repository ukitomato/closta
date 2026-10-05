import { InfoIcon, type LucideIcon } from 'lucide-react'

import type { CenterFocus, PanelTabId } from '@/stores/ui'

import { SHELL_LABELS } from './labels'
import { OverviewTab } from './OverviewTab'

/**
 * **右のペインのタブの表** (O-7 / FR-014 / data-model §4。1 か所の表)。後続 feature (O-4 の Context / Cost・O-5 の
 * Server panel・O-6 の TodoList / Background task・OPT-panel) はこの表に行を足す。
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
}

export const PANEL_TABS: readonly PanelTab[] = [
  {
    id: 'overview',
    label: SHELL_LABELS.overviewTab,
    icon: InfoIcon,
    availableFor: ['none', 'running', 'past'],
    Content: OverviewTab
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
