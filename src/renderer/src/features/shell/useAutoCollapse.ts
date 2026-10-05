import { useEffect, useRef, type RefObject } from 'react'

import { useUiStore } from '@/stores/ui'

import { shellThreshold } from './shell-layout'

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
