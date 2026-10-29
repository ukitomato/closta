import { useLayoutEffect, useRef } from 'react'

import { PanelRightCloseIcon, PanelRightOpenIcon, TriangleAlertIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { useRunningSessionsView } from '@/features/session/running-sessions-view'
import { useSessionMeters } from '@/features/session/useSessionMeters'
import { cn } from '@/lib/utils'
import { useUiStore, type PanelTabId } from '@/stores/ui'

import { SHELL_LABELS } from './labels'
import { activeTab, attentionTabIds, PANEL_TABS, visibleTabs, type PanelTab } from './panel-tabs'
import { SHELL_WIDTHS } from './shell-layout'
import { useFocusRescue } from './useFocusRescue'

/**
 * **右のペイン** (O-7 / FR-014 / data-model §2・§4)。表示中のセッションに付く情報をタブで切り替える面。
 *
 * - 名前付きの `complementary` のランドマーク (`aside`)。既定で畳み、40px の帯 (タブのアイコンだけ) になる
 * - 表示できるタブが 1 つでもタブの見出しを出す (後続で増える前提の形を先に固める)。0 件なら tablist を描かない
 * - 選んでいたタブが出せなくなったら最初のタブに戻る (`activeTab`)
 * - **開閉のボタンは両方の状態で同じ要素** (先頭に描き続け、開いた状態では CSS で右端に置く)。帯のタブのアイコンから
 *   開いたら、そのタブへフォーカスを移す (pr-gate R1 a11y H-002)
 * - tablist は WAI-ARIA APG の Tabs pattern の自動の選択 (O-4 が 2 つ目のタブ「使用量」と一緒に入れた。O-7 pr-gate R1
 *   a11y M-004 / 014 spec FR-017 / data-model §6): ← / → で隣のタブ (端で反対の端へ)、Home / End で端のタブへ移り、
 *   移った先を選んでその button にフォーカスを移す。選ばれたタブだけが Tab 順に入る (roving tabindex)。並びは今の中央の
 *   状態で出せるタブ (`visibleTabs`) だけ
 * - 畳んだ帯のタブのアイコンに注意の印 (O-5 / 015 data-model §3): タブの表の `attention` が、表示中の稼働中のセッション
 *   の計量で true のタブだけ。印は `data-attention="true"`・警告のアイコン・名前に「注意」。過去・未選択では出さない。
 *   開いた tablist のタブにも同じ印を出す (開いて別のタブを見ている間にも気付けるように。015 pr-gate R1 MD-02)
 *   1 セッションの計量だけを selector で読み、印の付くタブの id を文字列で返す (他のセッションの更新で描き直さない)
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
  // 表示中の稼働中のセッションだけ (過去・未選択では印を出さない。015 spec US-2 AC5)。
  const liveId = useRunningSessionsView().live?.sessionId ?? null
  const attentionKey = useSessionMeters(focus === 'running' ? liveId : null, (meters) =>
    attentionTabIds(visible, meters).join(' ')
  )
  const attentionIds = new Set(attentionKey === '' ? [] : attentionKey.split(' '))

  const asideRef = useRef<HTMLElement>(null)
  const toggleRef = useRef<HTMLButtonElement>(null)
  // 帯のタブのアイコンから開いたときの行き先。
  const openedTabRef = useRef<PanelTabId | null>(null)
  useFocusRescue(asideRef, collapsed, () => {
    const tab = openedTabRef.current
    openedTabRef.current = null
    if (tab !== null) return document.getElementById(`panel-tab-${tab}`) ?? toggleRef.current
    return toggleRef.current
  })

  // 選んだタブの描き直し (太字で幅が少し広がる) の後にも見える範囲へ入れる。選ぶ前の幅で 1 度だけ寄せると、
  // 端のタブが 1〜2px はみ出す (025 SC-005)。
  const currentId = current?.id ?? null
  const scrolledId = useRef(currentId)
  useLayoutEffect(() => {
    if (scrolledId.current === currentId) return
    scrolledId.current = currentId
    if (collapsed || currentId === null) return
    document
      .getElementById(`panel-tab-${currentId}`)
      ?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
  }, [collapsed, currentId])

  /** tablist のキー操作 (014 data-model §6)。移った先を選び、そのタブの button にフォーカスを移す。 */
  const onTabListKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    const index = visible.findIndex((tab) => tab.id === current?.id)
    const target = tabListTarget(event.key, index, visible.length)
    if (target === null) return
    const tab = visible[target]
    if (tab === undefined) return
    event.preventDefault()
    setTab(tab.id)
    document.getElementById(`panel-tab-${tab.id}`)?.focus()
  }

  return (
    <aside
      ref={asideRef}
      aria-label={SHELL_LABELS.panelLabel}
      className={cn(
        'border-border flex min-h-0 shrink-0 flex-col border-l',
        collapsed ? SHELL_WIDTHS.panelCollapsed.className : SHELL_WIDTHS.panel.className
      )}
      data-testid="right-panel"
      data-collapsed={collapsed}
    >
      <div
        className={cn(
          'flex shrink-0',
          collapsed
            ? 'flex-col items-center gap-1 py-2'
            : 'border-border items-center gap-1 border-b px-2 py-1.5'
        )}
      >
        <Button
          ref={toggleRef}
          type="button"
          size="icon-sm"
          variant="ghost"
          className={collapsed ? undefined : 'order-last'}
          aria-label={collapsed ? SHELL_LABELS.expandPanel : SHELL_LABELS.collapsePanel}
          title={collapsed ? SHELL_LABELS.expandPanel : SHELL_LABELS.collapsePanel}
          aria-expanded={!collapsed}
          onClick={() => setCollapsed(!collapsed)}
        >
          {collapsed ? <PanelRightOpenIcon aria-hidden /> : <PanelRightCloseIcon aria-hidden />}
        </Button>
        {collapsed ? (
          visible.map((tab) => {
            const attention = attentionIds.has(tab.id)
            const name = attention ? `${tab.label} (${SHELL_LABELS.attention})` : tab.label
            return (
              <Button
                key={tab.id}
                type="button"
                size="icon-sm"
                variant="ghost"
                className={attention ? 'relative' : undefined}
                aria-label={name}
                title={name}
                data-attention={attention ? 'true' : undefined}
                onClick={() => {
                  openedTabRef.current = tab.id
                  setTab(tab.id)
                  setCollapsed(false)
                }}
              >
                <tab.icon aria-hidden />
                {attention && (
                  <TriangleAlertIcon
                    aria-hidden
                    className="text-destructive absolute -top-0.5 -right-0.5 size-3"
                    data-testid="panel-tab-attention"
                  />
                )}
              </Button>
            )
          })
        ) : visible.length > 0 ? (
          <div
            role="tablist"
            aria-label={SHELL_LABELS.panelTabs}
            className="flex min-w-0 flex-1 gap-1 overflow-x-auto [scrollbar-width:thin]"
            onKeyDown={onTabListKeyDown}
          >
            {visible.map((tab) => {
              const isCurrent = current?.id === tab.id
              const attention = attentionIds.has(tab.id)
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  id={`panel-tab-${tab.id}`}
                  aria-label={attention ? `${tab.label} (${SHELL_LABELS.attention})` : undefined}
                  aria-selected={isCurrent}
                  aria-controls={`panel-tabpanel-${tab.id}`}
                  tabIndex={isCurrent ? 0 : -1}
                  data-attention={attention ? 'true' : undefined}
                  className={cn(
                    'shrink-0 rounded-md px-2 py-1 text-xs whitespace-nowrap',
                    attention && 'inline-flex items-center gap-1',
                    isCurrent
                      ? 'bg-accent text-accent-foreground font-semibold'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                  onClick={() => setTab(tab.id)}
                >
                  {tab.label}
                  {attention && (
                    <TriangleAlertIcon
                      aria-hidden
                      className="text-destructive size-3"
                      data-testid="panel-tab-attention"
                    />
                  )}
                </button>
              )
            })}
          </div>
        ) : (
          <div className="flex-1" />
        )}
      </div>
      {!collapsed && current !== null && (
        <div
          role="tabpanel"
          id={`panel-tabpanel-${current.id}`}
          aria-labelledby={`panel-tab-${current.id}`}
          className="min-h-0 flex-1 overflow-auto"
        >
          <current.Content />
        </div>
      )}
    </aside>
  )
}

/**
 * tablist のキーで移る先の位置 (014 data-model §6)。← / → は隣 (端で反対の端へ回る)、Home / End は端。
 * 他のキー・タブが 0 件なら null (既定の動きを妨げない)。今の位置が見つからない (-1) ときは、→ と Home で先頭、
 * ← と End で末尾。
 */
function tabListTarget(key: string, index: number, count: number): number | null {
  if (count === 0) return null
  switch (key) {
    case 'ArrowRight':
      return index < 0 ? 0 : (index + 1) % count
    case 'ArrowLeft':
      return index < 0 ? count - 1 : (index - 1 + count) % count
    case 'Home':
      return 0
    case 'End':
      return count - 1
    default:
      return null
  }
}
