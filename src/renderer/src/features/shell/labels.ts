import type { RateLimitType } from '@domain/session/meter'

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
  /** 右のペインの「使用量」のタブ (O-4 / 014 data-model §5)。 */
  usageTab: '使用量',
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
  // 表記は glossary の `Provider` (英字のまま。カタカナで書かない。O-4 FR-016 / 014 research R-13)。
  providers: 'Provider',
  resolution: '組み合わせ'
}

/**
 * 「概要」の項目の見出し (data-model §5)。起動の軸の名前は起動ダイアログの見出し (`LAUNCH_AXIS_LABELS`) と同じ文字列を使う
 * (軸の名前を変えたときに概要だけが古く残らない。code-gate convention L-004)。モデルと権限モードは実行中に変わりうる
 * (SDK の `status` / `init` と `set_permission_mode` / `set_model`。O-4・O-5・X-6 が対応表の行で扱う) ので、起動時の値で
 * あることを見出しで示す (pr-gate R1 ui-coverage M-004・R2 L-102)。付けるのは対応表に実行中の変化の行がある 2 軸だけ。
 * 権限モードの実行中の変化は O-4 が「現在の権限モード」の行で出す (起動時と違うときだけ。014 spec FR-010 / data-model §4)。
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
  /** 実行中に観測した今の権限モード (O-4 / 014 data-model §5)。起動時と違うときだけ、起動時の行の下に出す。 */
  currentPermissionMode: `現在の${LAUNCH_AXIS_LABELS.permissionMode}`,
  folderLocation: '作業フォルダの所在',
  folder: 'フォルダ',
  location: '所在',
  branch: 'ブランチ',
  createdAt: '開始',
  lastModified: '更新',
  origin: '由来',
  worktree: 'worktree'
} as const

/**
 * レート制限の種類 (SDK の `rateLimitType`。O-4 / 014 data-model §5 の `RATE_LIMIT_TYPE_LABELS`)。
 * null・表に無い値は `rateLimitTypeLabel` が「利用枠」にする。
 */
export const RATE_LIMIT_TYPE_LABELS: Readonly<Record<RateLimitType, string>> = {
  five_hour: '5 時間',
  seven_day: '7 日',
  seven_day_opus: '7 日 (Opus)',
  seven_day_sonnet: '7 日 (Sonnet)',
  seven_day_overage_included: '7 日 (超過分を含む)',
  overage: '超過分'
}

/** レート制限の種類の文言。null・表に無い値 (`toString` などの prototype のキーを含む) は「利用枠」。 */
export function rateLimitTypeLabel(type: string | null): string {
  return type !== null && Object.hasOwn(RATE_LIMIT_TYPE_LABELS, type)
    ? RATE_LIMIT_TYPE_LABELS[type as RateLimitType]
    : '利用枠'
}

/**
 * Quota banner の文 (O-4 / 014 data-model §5。並べ方の正本は data-model §4「Quota banner」の表で、組み立ては
 * `quota-banner.ts` の `quotaBannerView`)。`kind` は `rateLimitTypeLabel`、`time` は `formatQuotaResetTime` の値。
 */
export const QUOTA_BANNER_LABELS = {
  quotaWarning: (kind: string, pct: number): string => `${kind}の利用が ${pct}% に達しました。`,
  quotaWarningNoPct: (kind: string): string => `${kind}の上限に近づいています。`,
  quotaRejected: (kind: string): string => `${kind}の上限に達しました。`,
  quotaReset: (time: string): string => `${time} にリセットされます。`,
  quotaWaitUntil: (time: string): string => `${time} のリセットまで待ってから送ってください。`,
  quotaWait: 'しばらく待ってから送ってください。',
  quotaOverage: '超過分を使っています。'
} as const

/**
 * 権限モードの警告の帯 (O-4 / 014 data-model §4「権限モード」/ §5。U-6)。`name` は権限モードの名前の表
 * (`features/chat/labels.ts` の `PERMISSION_MODE_NAMES`) の値。原因を断定しない。隔離の文言はランタイムの
 * `autoModeStatus` から選び、`unavailable` だけを「隔離がありません」とする。`allowed` / `undetermined` は
 * 「このセッションの隔離をアプリは確かめていない」— セッションの隔離状態ではない暫定の文言で、I-2 の隔離バッジが置き換える。
 */
export const UNSAFE_MODE_BANNER_LABELS = {
  unsafeModeBanner: (name: string): string =>
    `アプリが選んでいない権限モード (「${name}」) で動いています。承認なしで操作が走ることがあります。`,
  unsafeModeNoIsolation: 'このランタイムには隔離がありません。',
  unsafeModeIsolationUnverified: 'このセッションの隔離をアプリは確かめていません。'
} as const

/**
 * 費用 (USD) の表記 (O-4 / 014 data-model §4。中央のヘッダの目盛りと使用量のタブで共有)。`ja-JP` の書式で小数 2〜4 桁。
 * 値は `meter` の検証 (`toCostUsd`) を通った有限の数。
 */
const COST_USD_FORMAT = new Intl.NumberFormat('ja-JP', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 4
})

export function formatCostUsd(usd: number): string {
  return COST_USD_FORMAT.format(usd)
}

/** トークン・ターン・件数の表記 (`ja-JP` の桁区切り)。 */
const COUNT_FORMAT = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 0 })

export function formatCount(n: number): string {
  return COUNT_FORMAT.format(n)
}

/**
 * 右のペインの「使用量」のタブ (O-4 / 014 data-model §4「使用量のタブ」/ §5)。トークンの 4 つの区分の名前は data-model §4 の
 * 「トークンの累計」の導出の語。
 */
export const USAGE_LABELS = {
  usageCost: '費用の累計 (推定)',
  usageTokens: 'トークンの累計',
  usageTurns: 'ターン数',
  usageModels: 'モデルごとの内訳',
  usageDeniedAuto: '聞かれずに拒否された操作',
  usageDeniedTotal: '拒否された操作の合計 (SDK の記録)',
  usageEstimateNote: '推定です。請求額ではありません。再開と /clear で 0 から数え直します。',
  usageLiveOnly: '実行中のセッションだけ出ます。',
  usageAwaitFirst: '最初の応答の後に出ます。',
  usageEmpty: 'セッションを選ぶと使用量が出ます。',
  tokenInput: '入力',
  tokenOutput: '出力',
  tokenCacheRead: 'キャッシュの読み込み',
  tokenCacheCreation: 'キャッシュの作成',
  modelCost: '費用',
  /** `usd` は `formatCostUsd` の値。 */
  costValue: (usd: string): string => `$${usd}`,
  /** `n` は `formatCount` の値。 */
  countValue: (n: string): string => `${n} 件`,
  /** 上限 (`MAX_METER_PERMISSION_DENIALS`) に達した件数。 */
  countAtLeast: (n: string): string => `${n} 件以上`
} as const

/**
 * 中央のヘッダの行の右の目盛り (O-4 / 014 data-model §4「コンテキストと費用の目盛り」/ §5)。`*Label` は支援技術と `title` に
 * 推定であることを伝える名前。
 */
export const CONTEXT_COST_METER_LABELS = {
  contextMeter: (pct: number): string => `コンテキスト 約 ${pct}%`,
  contextOver: 'コンテキスト 100% 以上',
  contextMeterLabel: 'コンテキストの使用量 (推定)',
  /** `usd` は `formatCostUsd` の値。 */
  costMeter: (usd: string): string => `費用 約 $${usd}`,
  costMeterLabel: '費用の累計 (推定)'
} as const

/**
 * Quota banner の解除の時刻 (014 data-model §4)。`nowMs` と同じ日 (ローカル) なら `HH:mm`、別の日なら `M/d HH:mm`。
 * どちらかが Invalid Date なら null (時刻を出さない)。例外を出さない。
 */
export function formatQuotaResetTime(resetsAtMs: number, nowMs: number): string | null {
  const at = new Date(resetsAtMs)
  const now = new Date(nowMs)
  if (Number.isNaN(at.getTime()) || Number.isNaN(now.getTime())) return null
  const hhmm = `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`
  const sameDay =
    at.getFullYear() === now.getFullYear() &&
    at.getMonth() === now.getMonth() &&
    at.getDate() === now.getDate()
  return sameDay ? hhmm : `${at.getMonth() + 1}/${at.getDate()} ${hhmm}`
}
