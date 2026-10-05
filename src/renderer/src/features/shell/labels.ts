import { LAUNCH_AXIS_LABELS } from '@/features/session/labels'
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
  /** フォルダが 0 件のときの中央の見出し (起動できないので「選ぶか起動」とは言わない。pr-gate R1 ux M-001)。 */
  centerEmptyNoFolders: '作業フォルダがまだ登録されていません。登録すると起動できます。',
  /** 中央の空の状態の CTA。次の一手を説明的に書く (サイドバーの短い「新規起動」と同じ操作。pr-gate R1 ux L-001)。 */
  centerEmptyLaunch: '新しいセッションを起動',
  /** 作業フォルダの登録へ向かうボタン。一覧の空の状態のボタンと同じ文言 (pr-gate R1 ux M-002)。 */
  centerEmptyFolders: '作業フォルダを登録する',
  /** フォーカスしたときだけ見える、中央の会話へのスキップリンク (pr-gate R1 a11y M-005)。 */
  skipToCenter: '会話へ移動',
  /** 中央の本体のランドマーク名。 */
  center: '会話',
  pastReadOnly: '読み取り専用',
  /** 起動ダイアログの名前。中身の見える見出しと同じ文言 (pr-gate R1 a11y L-002)。 */
  launchDialogTitle: 'セッションを起動',
  panelLabel: 'セッションの詳細',
  panelTabs: 'セッションの詳細のタブ',
  overviewTab: '概要',
  overviewEmpty: 'セッションを選ぶと概要が出ます。',
  collapseSidebar: 'サイドバーを畳む',
  expandSidebar: 'サイドバーを開く',
  collapsePanel: '詳細を畳む',
  expandPanel: '詳細を開く'
} as const

/** 設定のダイアログの項目 (O-7 で消した上部のタブの文言 `SCREEN_LABELS` を引き継ぐ)。 */
export const SETTINGS_SECTION_LABELS: Record<SettingsSection, string> = {
  runtimes: 'ランタイム',
  folders: '作業フォルダ',
  // X-3。Provider の検出・登録・編集・削除 (US-1)。到達可能性フィルタ UI は起動設定ダイアログ (X-4)。
  providers: 'プロバイダ',
  resolution: '組み合わせ'
}

/**
 * 「概要」の項目の見出し (data-model §5)。起動の軸の名前は起動ダイアログの見出し (`LAUNCH_AXIS_LABELS`) と同じ文字列を使う
 * (軸の名前を変えたときに概要だけが古く残らない。code-gate convention L-004)。モデルと権限モードは実行中に変わりうる
 * (SDK の `status` / `init`。O-4 / O-5 が対応表の行で扱う) ので、起動時の値であることを見出しで示す (pr-gate R1 ui-coverage M-004)。
 */
export const OVERVIEW_LABELS = {
  provider: LAUNCH_AXIS_LABELS.provider,
  providerDefault: '既定',
  providerRemoved: '登録が解除された Provider',
  model: `起動時の${LAUNCH_AXIS_LABELS.model}`,
  modelDefault: '既定',
  effort: LAUNCH_AXIS_LABELS.effort,
  permissionMode: `起動時の${LAUNCH_AXIS_LABELS.permissionMode}`,
  folderLocation: '作業フォルダの所在',
  folder: 'フォルダ',
  location: '所在',
  branch: 'ブランチ',
  createdAt: '開始',
  lastModified: '更新',
  origin: '由来',
  worktree: 'worktree'
} as const
