import { useEffect, type RefObject } from 'react'

import { useUiStore } from '@/stores/ui'

import { shellThreshold } from './shell-layout'

/**
 * ウィンドウが狭くなり、中央が最小の幅を割るとき、右のペイン → サイドバーの順に自動で畳む (data-model §2)。
 *
 * - 閾値は「開いている面の幅の合計 + 480px」(右を開いていれば 1080px、畳んでいれば 800px)
 * - 自動で畳むのは**閾値を割った瞬間に 1 回だけ**。利用者が開いたら開く (その間は中央の最小の幅を割ってよい)
 * - 自動で畳んだものは、幅が戻っても自動では開かない
 * - 両方を畳んでも足りない幅では中央の最小の幅を割ってよい (横にスクロールさせない)
 *
 * 「割っているか」は**畳んだ後・利用者が開閉した後の状態**で計算し直す (pr-gate R1 ux M-009 / po L-002)。
 * 畳む前の閾値のまま覚えると、右を畳んだ直後に幅が一気に下がったときサイドバーを畳まず、利用者が狭い幅で手で開いた面を
 * 次のリサイズで畳んでしまう。
 */
export function useAutoCollapse(rootRef: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const root = rootRef.current
    if (root === null || typeof ResizeObserver === 'undefined') return
    let width: number | null = null
    let below = false
    const isBelow = (w: number): boolean => {
      const ui = useUiStore.getState()
      return w < shellThreshold(ui.sidebarCollapsed, ui.panel.collapsed)
    }

    const observer = new ResizeObserver((entries) => {
      const next = entries[0]?.contentRect.width
      if (next === undefined) return
      width = next
      if (isBelow(next) && !below) {
        const ui = useUiStore.getState()
        let panelCollapsed = ui.panel.collapsed
        if (!panelCollapsed) {
          ui.setPanelCollapsed(true)
          panelCollapsed = true
        }
        if (!ui.sidebarCollapsed && next < shellThreshold(false, panelCollapsed)) {
          ui.setSidebarCollapsed(true)
        }
      }
      below = isBelow(next)
    })
    // 利用者が開閉したら、その状態で計算し直す (手で開いた面を「割った瞬間」と取り違えて畳まない)。
    const unsubscribe = useUiStore.subscribe((nextUi, prevUi) => {
      if (
        width !== null &&
        (nextUi.sidebarCollapsed !== prevUi.sidebarCollapsed ||
          nextUi.panel.collapsed !== prevUi.panel.collapsed)
      ) {
        below = isBelow(width)
      }
    })
    observer.observe(root)
    return () => {
      observer.disconnect()
      unsubscribe()
    }
  }, [rootRef])
}
