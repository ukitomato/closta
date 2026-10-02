import { create } from 'zustand'

import type { PathDTO } from '@domain/runtime/dto'
import type { LocationDTO } from '@domain/workspace/dto'

/**
 * 画面遷移とテーマだけを持つ UI ストア。
 *
 * FE-001 (アプリシェル) の範囲。業務データは持たない —
 * ランタイム・登録フォルダ・解決結果は preload の capability 越しに取得し、
 * それぞれの feature が自分のストアを持つ (FE-010 / FE-020 / FE-030)。
 */

export const SCREENS = [
  'runtimes',
  'folders',
  'providers',
  'sessions',
  'resolution',
  'launch',
  'chat'
] as const

export type ScreenId = (typeof SCREENS)[number]

export const SCREEN_LABELS: Record<ScreenId, string> = {
  runtimes: 'ランタイム',
  folders: '作業フォルダ',
  // X-3。Provider の検出・登録・編集・削除 (US-1)。到達可能性フィルタ UI は起動設定ダイアログ (X-4)。
  providers: 'プロバイダ',
  // R-2。**読み取り専用**であることは画面側の文言で示す (FR-002 / FR-003)。
  sessions: 'セッション',
  resolution: '組み合わせ',
  // X-1 / X-5。セッションを並行に起動し、稼働中セッションの一覧から切り替えてストリーミング表示する。
  launch: 'セッション起動',
  // **内部 feature ID ("R-3") を出さない** (FR-047)。利用者に意味を持たない記号である。
  chat: '会話 (準備中)'
}

/**
 * 登録操作へ渡す初期値 (FE-051)。
 *
 * **アプリが自動で登録しない** (FR-026)。所在とパスを**初期値として運ぶだけ**で、
 * 確定は利用者が登録画面で行う。**実在確認も行わない** (FR-027) —
 * 任意パスの存在を問い合わせる経路を作らないためである。
 *
 * ここに置くのは、画面をまたぐ受け渡しであるため。
 * 各 feature のストアに置くと、渡す側と受ける側のどちらが持ち主か決まらない。
 */
export interface FolderDraftSeed {
  readonly location: LocationDTO
  /** **main が返した完成した値をそのまま運ぶ。** renderer で組み立てない (FR-025)。 */
  readonly path: PathDTO
  readonly suggestedDisplayName: string
}

interface UiState {
  screen: ScreenId
  dark: boolean
  /** 登録画面が受け取る初期値。受け取ったら消す (使い切り)。 */
  folderDraftSeed: FolderDraftSeed | null
  setScreen: (screen: ScreenId) => void
  toggleTheme: () => void
  /** 初期値を積んで登録画面へ移る。 */
  seedFolderDraft: (seed: FolderDraftSeed) => void
  clearFolderDraftSeed: () => void
}

export const useUiStore = create<UiState>((set) => ({
  screen: 'runtimes',
  dark: false,
  folderDraftSeed: null,
  setScreen: (screen) => set({ screen }),
  seedFolderDraft: (folderDraftSeed) => set({ folderDraftSeed, screen: 'folders' }),
  clearFolderDraftSeed: () => set({ folderDraftSeed: null }),
  toggleTheme: () =>
    set((state) => {
      const dark = !state.dark
      document.documentElement.classList.toggle('dark', dark)
      return { dark }
    })
}))
