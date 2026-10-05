/**
 * **面の幅** (O-7 / data-model §2 が正本)。幅の数値と、その幅を当てる class をここで対にして持つ (code-gate convention M-005)。
 *
 * | 規則 | 根拠 |
 * |---|---|
 * | 部品 (`Sidebar` / `RightPanel`) は class を、自動の畳み (`useAutoCollapse`) は数値を、どちらもここから取る。片方だけ直して閾値と実際の幅がずれることを防ぐ | data-model §2 |
 * | 幅は class で当てる。inline の `style` を使わない (本番の CSP は `style-src 'self'`) | research R-04 / AD-046 |
 * | class は完全な literal で書く (Tailwind はソースの literal を走査して生成する) | Tailwind 4 |
 */
export const SHELL_WIDTHS = {
  sidebar: { px: 280, className: 'w-[280px]' },
  sidebarCollapsed: { px: 48, className: 'w-12' },
  panel: { px: 320, className: 'w-80' },
  panelCollapsed: { px: 40, className: 'w-10' },
  /** 中央の最小の幅。class は当てない (中央は残りの幅を取る)。 */
  centerMin: { px: 480 }
} as const

/** 中央 (`main`) の id。スキップリンクの行き先 (pr-gate R1 a11y M-005)。 */
export const CENTER_ID = 'shell-center'

/** 今の開閉の状態で、中央が最小の幅を保つのに要る幅。 */
export function shellThreshold(sidebarCollapsed: boolean, panelCollapsed: boolean): number {
  return (
    (sidebarCollapsed ? SHELL_WIDTHS.sidebarCollapsed : SHELL_WIDTHS.sidebar).px +
    (panelCollapsed ? SHELL_WIDTHS.panelCollapsed : SHELL_WIDTHS.panel).px +
    SHELL_WIDTHS.centerMin.px
  )
}
