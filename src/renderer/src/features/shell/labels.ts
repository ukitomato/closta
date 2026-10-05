import type { SettingsSection } from '@/stores/ui'

/**
 * シェルの文言 (O-7 / data-model §6 が正本)。UI の文言は日本語を第一言語とする (Principle XV)。
 */
export const SHELL_LABELS = {
  appName: 'Closta',
  /** サイドバーのランドマーク名。 */
  sidebar: 'サイドバー',
  newSession: '新規起動',
  pastHeading: '過去のセッション',
  settings: '設定',
  settingsTitle: '設定',
  settingsNav: '設定の項目',
  close: '閉じる',
  theme: 'テーマ',
  themeLight: 'ライト',
  themeDark: 'ダーク',
  centerEmpty: 'セッションを選ぶか、新しく起動してください。',
  centerEmptyNoFolders: '作業フォルダがまだ登録されていません。設定から登録してください。',
  /** 中央の空の状態のボタン。サイドバーの「新規起動」と文言を分ける (E2E の locator がぶつからない)。 */
  centerEmptyLaunch: '新しいセッションを起動',
  centerEmptyFolders: '設定 → 作業フォルダ',
  /** 中央の本体のランドマーク名。 */
  center: '会話',
  pastReadOnly: '読み取り専用',
  launchDialogTitle: '新しいセッション',
  panelLabel: 'セッションの詳細',
  panelTabs: 'セッションの詳細のタブ',
  overviewTab: '概要',
  overviewEmpty: 'セッションを選ぶと概要が出ます。',
  collapseSidebar: 'サイドバーを畳む',
  expandSidebar: 'サイドバーを開く',
  collapsePanel: '詳細を畳む',
  expandPanel: '詳細を開く'
} as const

/** 設定のダイアログの項目 (今の `SCREEN_LABELS` の文言を引き継ぐ)。 */
export const SETTINGS_SECTION_LABELS: Record<SettingsSection, string> = {
  runtimes: 'ランタイム',
  folders: '作業フォルダ',
  // X-3。Provider の検出・登録・編集・削除 (US-1)。到達可能性フィルタ UI は起動設定ダイアログ (X-4)。
  providers: 'プロバイダ',
  resolution: '組み合わせ'
}

/** 「概要」の項目の見出し (data-model §5)。 */
export const OVERVIEW_LABELS = {
  provider: 'Provider',
  providerDefault: '既定',
  providerRemoved: '登録が解除された Provider',
  model: 'モデル',
  modelDefault: '既定',
  effort: 'effort',
  permissionMode: '権限モード',
  folderLocation: '作業フォルダの所在',
  folder: 'フォルダ',
  location: '所在',
  branch: 'ブランチ',
  createdAt: '開始',
  lastModified: '更新',
  origin: '由来',
  worktree: 'worktree'
} as const
