import { useRef } from 'react'

import { PanelLeftCloseIcon, PanelLeftOpenIcon, PlusIcon, SettingsIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { SessionListScreen } from '@/features/session-list/SessionListScreen'
import { RunningSessionList } from '@/features/session/RunningSessionList'
import { useRunningSessionsView } from '@/features/session/running-sessions-view'
import { SessionNavBadge } from '@/features/session/SessionNavBadge'
import { cn } from '@/lib/utils'
import { useUiStore } from '@/stores/ui'

import { SHELL_LABELS } from './labels'
import { SHELL_WIDTHS } from './shell-layout'
import { shellAnchorProps } from './useDialogReturnFocus'
import { useFocusRescue } from './useFocusRescue'

/**
 * **左のサイドバー** (O-7 / FR-002 / data-model §3)。トップレベルの `nav` のランドマークはここの 1 つだけ。
 *
 * | 順 | 区画 | 持ち主 |
 * |---|---|---|
 * | 1 | 新規起動 (起動ダイアログを開く) | ui (シェル) |
 * | 2 | 稼働中 (`RunningSessionList`。高さの上限は過去の区画の 6rem を残した値) | session |
 * | 3 | 過去のセッション (`SessionListScreen` の一覧の部分) | session |
 * | 4 | 設定 (設定のダイアログを開く) | ui (シェル) |
 *
 * 2 つの区画はそれぞれ独立にスクロールする。中央に出している側の一覧だけ選択中の行を強調する。
 * 畳むと 48px の帯 (新規起動・稼働中の件数の印・設定のアイコン) になる。開いたときの中身は畳んでもマウントしたまま
 * `hidden` で隠す — 過去の区画の絞り込み・開いたグループ・スクロールの位置を畳む / 開く (自動の畳みも) で失わず、
 * 開くたびに取り直さない (pr-gate R2 ux M-103 / po L-101)。
 *
 * **開閉のボタンは両方の状態で同じ要素** (先頭の行の同じ位置に描き続ける)。押してもフォーカスが残り、`aria-expanded` の
 * 変化が支援技術に伝わる。面の中の別の要素がフォーカスを持ったまま消えたら開閉のボタンへ移す (pr-gate R1 a11y H-002)。
 */
export function Sidebar(): React.JSX.Element {
  const collapsed = useUiStore((s) => s.sidebarCollapsed)
  const setCollapsed = useUiStore((s) => s.setSidebarCollapsed)
  const openSettings = useUiStore((s) => s.openSettings)
  const setLaunchOpen = useUiStore((s) => s.setLaunchOpen)
  const focus = useUiStore((s) => s.focus)
  const view = useRunningSessionsView()

  const navRef = useRef<HTMLElement>(null)
  const toggleRef = useRef<HTMLButtonElement>(null)
  useFocusRescue(navRef, collapsed, () => toggleRef.current)

  return (
    <nav
      ref={navRef}
      aria-label={SHELL_LABELS.sidebar}
      className={cn(
        'border-border flex shrink-0 flex-col border-r',
        collapsed
          ? [SHELL_WIDTHS.sidebarCollapsed.className, 'items-center gap-1 py-2']
          : SHELL_WIDTHS.sidebar.className
      )}
      data-testid="sidebar"
      data-collapsed={collapsed}
    >
      <div
        className={cn(
          'flex shrink-0 items-center',
          collapsed ? 'justify-center' : 'gap-2 px-3 py-2'
        )}
      >
        {collapsed ? null : (
          <span className="flex-1 text-sm font-semibold tracking-tight">
            {SHELL_LABELS.appName}
          </span>
        )}
        <Button
          ref={toggleRef}
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label={collapsed ? SHELL_LABELS.expandSidebar : SHELL_LABELS.collapseSidebar}
          title={collapsed ? SHELL_LABELS.expandSidebar : SHELL_LABELS.collapseSidebar}
          aria-expanded={!collapsed}
          onClick={() => setCollapsed(!collapsed)}
        >
          {collapsed ? <PanelLeftOpenIcon aria-hidden /> : <PanelLeftCloseIcon aria-hidden />}
        </Button>
      </div>
      {/* 帯は開いたときの中身より前に置く (戻り先の印 `data-shell-anchor` を引くと、帯の側が先に当たる)。 */}
      {collapsed && (
        <>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label={SHELL_LABELS.newSession}
            title={SHELL_LABELS.newSession}
            onClick={() => setLaunchOpen(true)}
            {...shellAnchorProps('new-session')}
          >
            <PlusIcon aria-hidden />
          </Button>
          <SessionNavBadge orientation="column" />
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            className="mt-auto"
            aria-label={SHELL_LABELS.settings}
            title={SHELL_LABELS.settings}
            onClick={() => openSettings()}
            {...shellAnchorProps('settings')}
          >
            <SettingsIcon aria-hidden />
          </Button>
        </>
      )}
      <div hidden={collapsed} className="flex min-h-0 flex-1 flex-col" data-testid="sidebar-body">
        <div className="shrink-0 px-3 pb-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full justify-start"
            onClick={() => setLaunchOpen(true)}
            {...shellAnchorProps('new-session')}
          >
            <PlusIcon aria-hidden />
            {SHELL_LABELS.newSession}
          </Button>
        </div>
        <div className="border-border flex min-h-0 flex-1 flex-col border-t">
          {/*
           * 稼働中の区画は高さの上限を持つ (過去の区画が見えなくならない。spec Edge Cases)。上限は過去の区画の
           * 最小の高さ (6rem) を残した値 (data-model §3)。50% では既定のウィンドウ (760px) で compact の 10 行が
           * 収まらず、O-1 SC-003 (スクロールなしで収まる) を壊す。8rem でも画面が 768px の環境 (CI のランナー・小さい
           * ノート PC) ではウィンドウが縮んで 10〜20px 足りなかった (PR #13 の CI。利用者の判断で 6rem)。
           */}
          <div className="flex max-h-[calc(100%-6rem)] min-h-0 shrink-0 flex-col overflow-hidden">
            <RunningSessionList
              runtimeName={view.runtimeName}
              highlightSelected={focus === 'running'}
            />
          </div>
          <section
            aria-labelledby="sidebar-past-heading"
            className="border-border flex min-h-0 flex-1 flex-col border-t"
            data-testid="past-sessions"
          >
            <h2 id="sidebar-past-heading" className="shrink-0 px-3 pt-2 text-sm font-semibold">
              {SHELL_LABELS.pastHeading}
            </h2>
            {/*
             * 包みは高さを渡すだけ (スクロールも余白も持たない)。区画の中の固定 (検索欄) とスクロールする領域
             * (取得時刻・列挙の結果・絞り込み・グループ) の分け方は `SessionListScreen` が持つ (O-3 / 012 data-model §6)。
             */}
            <div className="min-h-0 flex-1">
              <SessionListScreen highlightSelected={focus === 'past'} />
            </div>
          </section>
        </div>
        <div className="border-border shrink-0 border-t px-3 py-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-full justify-start"
            onClick={() => openSettings()}
            {...shellAnchorProps('settings')}
          >
            <SettingsIcon aria-hidden />
            {SHELL_LABELS.settings}
          </Button>
        </div>
      </div>
    </nav>
  )
}
