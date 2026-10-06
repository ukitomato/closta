import { create } from 'zustand'

import type { PathDTO } from '@domain/runtime/dto'
import type { LocationDTO } from '@domain/workspace/dto'

/**
 * シェルの面の状態とテーマ (と画面をまたぐ表示の設定) だけを持つ UI ストア (O-7 / AD-046 / data-model §1)。
 *
 * 業務データは持たない — ランタイム・登録フォルダ・解決結果は preload の capability 越しに取得し、
 * それぞれの feature が自分のストアを持つ。**選んだ行の id もここに持たない** — 稼働中は `running-session-store` の
 * `selectedId`、過去は `stores/sessions.ts` の `selectedRowKey` が持つ。ここは中央にどちらを出すか (`focus`) だけを持つ。
 *
 * **面の状態を書くのはシェル** (`features/shell/`)。`focus` の書き手は `features/shell/useShellFocus.ts` の 1 か所。
 * ほかの domain が書いてよい操作 (例外) の正本は ui charter の「面の状態」。**永続化しない** — 再起動で既定に戻る。
 */

/** 中央に何を出すか。 */
export type CenterFocus = 'none' | 'running' | 'past'

/** 設定のダイアログの項目 (今の 4 画面)。並びは左の項目の並び。 */
export const SETTINGS_SECTIONS = ['runtimes', 'folders', 'providers', 'resolution'] as const

export type SettingsSection = (typeof SETTINGS_SECTIONS)[number]

/** 右のペインのタブの id。後続 feature (O-4〜O-6・OPT-panel) が足す (`features/shell/panel-tabs.ts`)。 */
export type PanelTabId = 'overview'

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

/**
 * transcript の情報密度 (O-2 / FR-012・FR-013 / data-model §5)。**監視ビューの行の密度** (`running-session-store` の
 * `density`) とは別の値。過去ログと実行中で共有するためここに置く (セッションの切り替え・過去ログとの行き来で保つ)。
 * **永続化しない** — アプリの再起動で既定 (`comfortable`) に戻る。
 */
export type TranscriptDensity = 'comfortable' | 'compact'

export interface UiState {
  /** 中央に出すもの。 */
  focus: CenterFocus
  /** 設定のダイアログ。閉じても項目の id だけを覚える (中の画面は unmount する。FR-008)。 */
  settings: { readonly open: boolean; readonly section: SettingsSection }
  sidebarCollapsed: boolean
  /** 右のペイン。**既定で畳む** (data-model §2)。 */
  panel: { readonly collapsed: boolean; readonly tab: PanelTabId }
  /** 起動ダイアログ (X-4 の `LaunchDialog`) を開いているか。 */
  launchOpen: boolean
  dark: boolean
  /** 登録画面が受け取る初期値。受け取ったら消す (使い切り)。 */
  folderDraftSeed: FolderDraftSeed | null
  transcriptDensity: TranscriptDensity
  setFocus: (focus: CenterFocus) => void
  openSettings: (section?: SettingsSection) => void
  setSettingsSection: (section: SettingsSection) => void
  closeSettings: () => void
  setSidebarCollapsed: (collapsed: boolean) => void
  setPanelCollapsed: (collapsed: boolean) => void
  setPanelTab: (tab: PanelTabId) => void
  setLaunchOpen: (open: boolean) => void
  setTranscriptDensity: (density: TranscriptDensity) => void
  toggleTheme: () => void
  /** 初期値を積んで、設定のダイアログを「作業フォルダ」で開く。 */
  seedFolderDraft: (seed: FolderDraftSeed) => void
  clearFolderDraftSeed: () => void
}

export const useUiStore = create<UiState>((set) => ({
  focus: 'none',
  settings: { open: false, section: 'runtimes' },
  sidebarCollapsed: false,
  panel: { collapsed: true, tab: 'overview' },
  launchOpen: false,
  dark: false,
  folderDraftSeed: null,
  transcriptDensity: 'comfortable',
  setFocus: (focus) => set({ focus }),
  openSettings: (section) =>
    set((s) => ({ settings: { open: true, section: section ?? s.settings.section } })),
  setSettingsSection: (section) => set((s) => ({ settings: { ...s.settings, section } })),
  closeSettings: () => set((s) => ({ settings: { ...s.settings, open: false } })),
  setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
  setPanelCollapsed: (collapsed) => set((s) => ({ panel: { ...s.panel, collapsed } })),
  setPanelTab: (tab) => set((s) => ({ panel: { ...s.panel, tab } })),
  setLaunchOpen: (launchOpen) => set({ launchOpen }),
  setTranscriptDensity: (transcriptDensity) => set({ transcriptDensity }),
  seedFolderDraft: (folderDraftSeed) =>
    set({ folderDraftSeed, settings: { open: true, section: 'folders' } }),
  clearFolderDraftSeed: () => set({ folderDraftSeed: null }),
  toggleTheme: () =>
    set((state) => {
      const dark = !state.dark
      document.documentElement.classList.toggle('dark', dark)
      return { dark }
    })
}))

/**
 * 見ているセッション (data-model §1)。読み上げ (`SessionAttentionAnnouncer`) と承認待ちの件数のボタン (`nextAwaiting`) が
 * 「表示中」として使う。中央に稼働中の会話を出していて、設定のダイアログも起動ダイアログも開いていないときだけ選択中のもの。
 * 起動ダイアログはモーダルで中央の会話と承認カードを覆い、外側は支援技術から隠れるので、開いている間は見ていない扱い
 * (pr-gate R1 po M-003 / a11y M-002)。
 */
export function watchedIdOf(
  ui: {
    readonly focus: CenterFocus
    readonly settings: { readonly open: boolean }
    readonly launchOpen: boolean
  },
  selectedId: string | null
): string | null {
  return ui.focus === 'running' && !ui.settings.open && !ui.launchOpen ? selectedId : null
}
