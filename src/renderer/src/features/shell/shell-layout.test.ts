import { describe, expect, it } from 'vitest'

import { SHELL_WIDTHS, shellThreshold } from './shell-layout'

/** O-7 — 自動で畳む閾値は「開いている面の幅の合計 + 中央の最小の幅」(data-model §2)。 */

describe('shellThreshold', () => {
  it('右を開いていれば 1080px、畳んでいれば 800px (サイドバーは開いている)', () => {
    expect(shellThreshold(false, false)).toBe(1080)
    expect(shellThreshold(false, true)).toBe(800)
  })

  it('サイドバーを畳むと帯の幅で数える', () => {
    expect(shellThreshold(true, true)).toBe(48 + 40 + 480)
    expect(shellThreshold(true, false)).toBe(48 + 320 + 480)
  })

  it('幅の数値と class が対になっている (片方だけ直さない)', () => {
    expect(SHELL_WIDTHS.sidebar.className).toBe(`w-[${SHELL_WIDTHS.sidebar.px}px]`)
    // Tailwind の既定の spacing は 1 単位 4px。
    expect(SHELL_WIDTHS.sidebarCollapsed.className).toBe(
      `w-${SHELL_WIDTHS.sidebarCollapsed.px / 4}`
    )
    expect(SHELL_WIDTHS.panel.className).toBe(`w-${SHELL_WIDTHS.panel.px / 4}`)
    expect(SHELL_WIDTHS.panelCollapsed.className).toBe(`w-${SHELL_WIDTHS.panelCollapsed.px / 4}`)
  })
})
