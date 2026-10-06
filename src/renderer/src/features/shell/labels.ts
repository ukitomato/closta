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
  /** 起動ダイアログの live region が起動中に読む文 (見える「起動中」の表示と同じ文言)。 */
  launching: 'セッションを起動中…',
  panelLabel: 'セッションの詳細',
  panelTabs: 'セッションの詳細のタブ',
  overviewTab: '概要',
  overviewEmpty: 'セッションを選ぶと概要が出ます。',
  collapseSidebar: 'サイドバーを畳む',
  expandSidebar: 'サイドバーを開く',
  collapsePanel: '詳細を畳む',
  expandPanel: '詳細を開く'
} as const

/**
 * Command palette の文言 (O-3 / 012 data-model §5 が正本)。サイドバーと詳細の畳み / 開くの操作の名前は `SHELL_LABELS` の
 * 既存のキー (`collapseSidebar` など) を使う。
 */
export const PALETTE_LABELS = {
  /** palette のダイアログと候補の一覧の名前。 */
  paletteTitle: 'コマンド',
  /** 入力欄の名前と placeholder。 */
  paletteInput: '操作やセッションを探す',
  paletteNone: '一致する操作はありません。',
  paletteNoneHint: '語を変えるか、Esc で閉じてください。',
  paletteGroupActions: '操作',
  paletteGroupSessions: 'セッション',
  paletteKindRunning: '稼働中',
  paletteKindPast: '過去',
  paletteLaunch: '新しいセッションを起動',
  paletteSettings: (label: string): string => `設定: ${label}`,
  paletteChatSearch: '会話内を検索',
  /** `label` は `TRANSCRIPT_DENSITY_LABELS` の次の値の文言。 */
  paletteDensity: (label: string): string => `transcript を「${label}」にする`
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
 * (SDK の `status` / `init` と `set_permission_mode` / `set_model`。O-4・O-5・X-6 が対応表の行で扱う) ので、起動時の値で
 * あることを見出しで示す (pr-gate R1 ui-coverage M-004・R2 L-102)。付けるのは対応表に実行中の変化の行がある 2 軸だけ。
 */
export const OVERVIEW_LABELS = {
  provider: LAUNCH_AXIS_LABELS.provider,
  providerDefault: '既定',
  providerRemoved: '登録が解除された Provider',
  /** Provider の一覧の取得に失敗したとき (行を黙って消さない。pr-gate R3 ux L-201)。 */
  providerUnavailable: '取得できませんでした',
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
