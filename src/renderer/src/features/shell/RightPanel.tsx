import { PanelRightCloseIcon, PanelRightOpenIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useUiStore } from '@/stores/ui'

import { SHELL_LABELS } from './labels'
import { activeTab, PANEL_TABS, visibleTabs, type PanelTab } from './panel-tabs'
import { SHELL_WIDTHS } from './shell-layout'

/**
 * **右のペイン** (O-7 / FR-014 / data-model §2・§4)。表示中のセッションに付く情報をタブで切り替える面。
 *
 * - 名前付きの `complementary` のランドマーク (`aside`)。既定で畳み、40px の帯 (タブのアイコンだけ) になる
 * - 表示できるタブが 1 つでもタブの見出しを出す (後続で増える前提の形を先に固める)
 * - 選んでいたタブが出せなくなったら最初のタブに戻る (`activeTab`)
 *
 * テストはタブの表を差し替えられる (`tabs`)。
 */
export function RightPanel({
  tabs = PANEL_TABS
}: {
  readonly tabs?: readonly PanelTab[]
}): React.JSX.Element {
  const collapsed = useUiStore((s) => s.panel.collapsed)
  const selected = useUiStore((s) => s.panel.tab)
  const focus = useUiStore((s) => s.focus)
  const setCollapsed = useUiStore((s) => s.setPanelCollapsed)
  const setTab = useUiStore((s) => s.setPanelTab)

  const visible = visibleTabs(tabs, focus)
  const current = activeTab(tabs, focus, selected)

  return (
    <aside
      aria-label={SHELL_LABELS.panelLabel}
      className={cn(
        'border-border flex min-h-0 shrink-0 flex-col border-l',
        collapsed
          ? [SHELL_WIDTHS.panelCollapsed.className, 'items-center gap-1 py-2']
          : SHELL_WIDTHS.panel.className
      )}
      data-testid="right-panel"
      data-collapsed={collapsed}
    >
      {collapsed ? (
        <>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label={SHELL_LABELS.expandPanel}
            title={SHELL_LABELS.expandPanel}
            aria-expanded={false}
            onClick={() => setCollapsed(false)}
          >
            <PanelRightOpenIcon aria-hidden />
          </Button>
          {visible.map((tab) => (
            <Button
              key={tab.id}
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label={tab.label}
              title={tab.label}
              onClick={() => {
                setTab(tab.id)
                setCollapsed(false)
              }}
            >
              <tab.icon aria-hidden />
            </Button>
          ))}
        </>
      ) : (
        <>
          <div className="border-border flex shrink-0 items-center gap-1 border-b px-2 py-1.5">
            <div role="tablist" aria-label={SHELL_LABELS.panelTabs} className="flex flex-1 gap-1">
              {visible.map((tab) => {
                const isCurrent = current?.id === tab.id
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    id={`panel-tab-${tab.id}`}
                    aria-selected={isCurrent}
                    aria-controls={`panel-tabpanel-${tab.id}`}
                    className={cn(
                      'rounded-md px-2 py-1 text-xs',
                      isCurrent
                        ? 'bg-accent text-accent-foreground font-semibold'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                    onClick={() => setTab(tab.id)}
                  >
                    {tab.label}
                  </button>
                )
              })}
            </div>
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label={SHELL_LABELS.collapsePanel}
              title={SHELL_LABELS.collapsePanel}
              aria-expanded
              onClick={() => setCollapsed(true)}
            >
              <PanelRightCloseIcon aria-hidden />
            </Button>
          </div>
          {current !== null && (
            <div
              role="tabpanel"
              id={`panel-tabpanel-${current.id}`}
              aria-labelledby={`panel-tab-${current.id}`}
              className="min-h-0 flex-1 overflow-auto"
            >
              <current.Content />
            </div>
          )}
        </>
      )}
    </aside>
  )
}
