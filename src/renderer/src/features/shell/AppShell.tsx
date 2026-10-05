import { useRef } from 'react'

import { RunningSessionsProvider } from '@/features/session/RunningSessionsProvider'

import { CenterPane } from './CenterPane'
import { LaunchDialogHost } from './LaunchDialogHost'
import type { PanelTab } from './panel-tabs'
import { RightPanel } from './RightPanel'
import { SettingsDialog } from './SettingsDialog'
import { Sidebar } from './Sidebar'
import { useAutoCollapse } from './useAutoCollapse'
import { useShellFocus } from './useShellFocus'

/**
 * **アプリのシェル** (O-7 / AD-046)。上部のタブのナビゲーションを持たず、面を 3 つにする:
 * 左のサイドバー (`nav`)・中央 (`main`)・右のペイン (名前付きの `complementary`)。設定と起動はダイアログ。
 *
 * | 規則 | 根拠 |
 * |---|---|
 * | 面の配置と遷移だけを持ち、業務ロジック・IPC・永続化を持たない。各面の中身は今のコンポーネントをそのまま置く | FR-001 / U-2 |
 * | 稼働中の会話の runtime (`RunningSessionsProvider`) は面の切り替えで外さない | FR-004 / X-5 FR-008 |
 * | 中央の `focus` の書き手は `useShellFocus` の 1 か所 | data-model §1 |
 * | 幅は固定で畳む / 開くだけ。狭いときは右 → 左の順に 1 回だけ自動で畳む | data-model §2 |
 * | アプリの CSP と配信を変えない。取り込む部品は本番の CSP (`style-src 'self'`) の下で動くものに限る | FR-001 |
 *
 * テストはタブの表を差し替えられる (`panelTabs`)。
 */
export function AppShell({
  panelTabs
}: {
  readonly panelTabs?: readonly PanelTab[]
}): React.JSX.Element {
  return (
    <RunningSessionsProvider>
      <ShellLayout panelTabs={panelTabs} />
    </RunningSessionsProvider>
  )
}

function ShellLayout({
  panelTabs
}: {
  readonly panelTabs?: readonly PanelTab[]
}): React.JSX.Element {
  useShellFocus()
  const rootRef = useRef<HTMLDivElement>(null)
  useAutoCollapse(rootRef)
  return (
    <div ref={rootRef} className="flex h-full min-h-0 w-full" data-testid="app-shell">
      <Sidebar />
      <CenterPane />
      <RightPanel tabs={panelTabs} />
      <LaunchDialogHost />
      <SettingsDialog />
    </div>
  )
}
