import { useRef } from 'react'

import { RunningSessionsProvider } from '@/features/session/RunningSessionsProvider'

import { CenterPane } from './CenterPane'
import { SHELL_LABELS } from './labels'
import { LaunchDialogHost } from './LaunchDialogHost'
import type { PanelTab } from './panel-tabs'
import { RightPanel } from './RightPanel'
import { SettingsDialog } from './SettingsDialog'
import { CENTER_ID } from './shell-layout'
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
 * | アプリの CSP と配信を変えない。新しく取り込む部品は本番の CSP (`style-src 'self'`) の下で動くものに限る。既存の Dialog (Radix) は開くたびに scroll-lock の inline の `<style>` を差し込み、本番の CSP がそれを弾く (失う CSS は research R-04)。**CSP を緩めて通さない** | FR-001 / AD-025 §7 / pr-gate R1 security M-001・R2 L-101 |
 * | 先頭にフォーカスしたときだけ見える「会話へ移動」のスキップリンクを置く。サイドバーの過去の行は数百件になりうるので、Tab で中央に届くまでの回数を行の数に比例させない。`main` には移す間だけ `tabindex` を付ける (`focusCenter`) | WCAG 2.4.1 / pr-gate R1 a11y M-005・R2 M-103 |
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
      <a
        href={`#${CENTER_ID}`}
        // `not-sr-only` は padding を 0 にするので、フォーカスの間の余白は `focus:` で付け直す (pr-gate R2 a11y L-103)。
        className="bg-background text-foreground ring-ring sr-only z-50 rounded-md text-sm focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:px-3 focus:py-2 focus:ring-2"
        onClick={(event) => {
          // ハッシュの遷移はしない (アプリの URL を変えない)。中央へフォーカスを移すだけ。
          event.preventDefault()
          focusCenter()
        }}
      >
        {SHELL_LABELS.skipToCenter}
      </a>
      <Sidebar />
      <CenterPane />
      <RightPanel tabs={panelTabs} />
      <LaunchDialogHost />
      <SettingsDialog />
    </div>
  )
}

/**
 * スキップリンクの行き先 (`main`) へフォーカスを移す。`main` に常には `tabindex` を付けない — 付けると本文のクリックで
 * `main` がフォーカスを取り、矢印 / PageDown で transcript がスクロールしなくなる。移す間だけ付け、フォーカスが外れたとき
 * と、`main` の中を押したとき (押した先が `main` 自身なら blur が起きない) に消す (pr-gate R2 a11y M-103 / R3 L-201)。
 */
function focusCenter(): void {
  const center = document.getElementById(CENTER_ID)
  if (center === null) return
  const release = (): void => {
    center.removeAttribute('tabindex')
    center.removeEventListener('blur', release)
    center.removeEventListener('pointerdown', release, true)
  }
  center.setAttribute('tabindex', '-1')
  center.addEventListener('blur', release)
  center.addEventListener('pointerdown', release, true)
  center.focus()
}
