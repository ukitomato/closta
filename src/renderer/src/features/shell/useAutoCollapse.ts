import { useEffect, useRef, type RefObject } from 'react'

import { useUiStore } from '@/stores/ui'

/** 面の幅 (data-model §2 が正本)。 */
export const SHELL_WIDTHS = {
  sidebar: 280,
  sidebarCollapsed: 48,
  panel: 320,
  panelCollapsed: 40,
  centerMin: 480
} as const

/** 今の開閉の状態で、中央が最小の幅を保つのに要る幅。 */
export function shellThreshold(sidebarCollapsed: boolean, panelCollapsed: boolean): number {
  return (
    (sidebarCollapsed ? SHELL_WIDTHS.sidebarCollapsed : SHELL_WIDTHS.sidebar) +
    (panelCollapsed ? SHELL_WIDTHS.panelCollapsed : SHELL_WIDTHS.panel) +
    SHELL_WIDTHS.centerMin
  )
}

/**
 * ウィンドウが狭くなり、中央が最小の幅を割るとき、右のペイン → サイドバーの順に自動で畳む (data-model §2)。
 *
 * - 閾値は「開いている面の幅の合計 + 480px」(右を開いていれば 1080px、畳んでいれば 800px)
 * - 自動で畳むのは**閾値を割った瞬間に 1 回だけ**。利用者が開いたら開く (その間は中央の最小の幅を割ってよい)
 * - 自動で畳んだものは、幅が戻っても自動では開かない
 * - 両方を畳んでも足りない幅では中央の最小の幅を割ってよい (横にスクロールさせない)
 */
export function useAutoCollapse(rootRef: RefObject<HTMLElement | null>): void {
  const belowRef = useRef(false)

  useEffect(() => {
    const root = rootRef.current
    if (root === null || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width
      if (width === undefined) return
      const ui = useUiStore.getState()
      const below = width < shellThreshold(ui.sidebarCollapsed, ui.panel.collapsed)
      if (below && !belowRef.current) {
        let panelCollapsed = ui.panel.collapsed
        if (!panelCollapsed) {
          ui.setPanelCollapsed(true)
          panelCollapsed = true
        }
        if (!ui.sidebarCollapsed && width < shellThreshold(false, panelCollapsed)) {
          ui.setSidebarCollapsed(true)
        }
      }
      belowRef.current = below
    })
    observer.observe(root)
    return () => observer.disconnect()
  }, [rootRef])
}
