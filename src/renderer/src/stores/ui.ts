import { create } from 'zustand'

/**
 * 画面遷移とテーマだけを持つ UI ストア。
 *
 * FE-001 (アプリシェル) の範囲。業務データは持たない —
 * ランタイム・登録フォルダ・解決結果は preload の capability 越しに取得し、
 * それぞれの feature が自分のストアを持つ (FE-010 / FE-020 / FE-030)。
 */

export const SCREENS = ['runtimes', 'folders', 'sessions', 'resolution', 'chat'] as const

export type ScreenId = (typeof SCREENS)[number]

export const SCREEN_LABELS: Record<ScreenId, string> = {
  runtimes: 'ランタイム',
  folders: '作業フォルダ',
  // R-2。**読み取り専用**であることは画面側の文言で示す (FR-002 / FR-003)。
  sessions: 'セッション',
  resolution: '組み合わせ',
  // **内部 feature ID ("R-3") を出さない** (FR-047)。利用者に意味を持たない記号である。
  chat: '会話 (準備中)'
}

interface UiState {
  screen: ScreenId
  dark: boolean
  setScreen: (screen: ScreenId) => void
  toggleTheme: () => void
}

export const useUiStore = create<UiState>((set) => ({
  screen: 'runtimes',
  dark: false,
  setScreen: (screen) => set({ screen }),
  toggleTheme: () =>
    set((state) => {
      const dark = !state.dark
      document.documentElement.classList.toggle('dark', dark)
      return { dark }
    })
}))
