import type { LaunchFailureReason, SessionLaunchRejectReason } from '@domain/session/agent-session'
import { MAX_CONCURRENT_SESSIONS } from '@domain/session/concurrency'
import { MAX_PRESETS, type SafePermissionMode } from '@domain/session/launch-config'
import type {
  AxisResetReason,
  DirectoryResetReason,
  LaunchBlocker
} from '@domain/session/launch-resolution'
import type {
  LiveSettingBlocker,
  LiveSettingFailure,
  LiveSettingKind
} from '@domain/session/live-settings'
import type { ResumeUnavailableReason } from '@domain/session/resume'
import type { SavePresetResult } from '@domain/session/preset'
import type { SessionRunState } from '@domain/session/run-state'

import { PERMISSION_MODE_NAMES } from '@/features/chat/labels'

import type { Elapsed, SessionRowStatus } from './running-session-types'

/**
 * X-1 セッション起動 + ストリーミングの日本語ラベル (FE-030 / FR-020 / Principle XV)。
 *
 * **理由キーは `session`/`infra` が保持し、訳出は `ui`** (Principle XV。R-2 と同じ分担)。
 * `LaunchFailureReason` (18 種。X-5 で `supervisor-exited`、O-4 でターンの失敗の 8 種) + 調停由来 (`session-limit` /
 * `shutting-down` / `unknown-target`) + X-4 の起動前段 (`invalid-config` / `provider-unavailable` / `needs-confirmation`) の
 * 計 24 種を網羅する。
 */

/**
 * **対応表 (`docs/ui-coverage.md`) D 節 launch-failure の文言の正本** (FailureBanner は `launchFailureLabel` を通して描く)。
 * 変えるときは対応表の該当の行を見る (ui-coverage-reviewer の発火条件の外。O-7 pr-gate R2 ui-coverage M-101 / R3 L-202)。
 */
const LAUNCH_REJECT_LABELS: Record<SessionLaunchRejectReason, string> = {
  'distro-not-running': '所在 (WSL ディストロ) が停止しています。起動してから再度お試しください。',
  'not-verified-running':
    '所在の実行中確認が取れませんでした。ランタイムを再検出してから起動してください。',
  'distro-mismatch':
    '作業フォルダの所在と選んだランタイムのディストロが一致しません。組み合わせを見直してください。',
  'claude-not-found':
    'claude が見つかりませんでした。ランタイム一覧で claude の状態を確かめ、導入するか場所を指定してから再検出してください。',
  'launch-failed': '起動に失敗しました。もう一度お試しください。',
  'process-crashed': 'セッションのプロセスが異常終了しました。',
  'stream-protocol-error': '応答ストリームが壊れました。セッションを開き直してください。',
  'provider-error':
    'Provider の認証/接続でエラーが発生しました。ログイン状態やクレジットを確認してください。',
  'interrupt-unavailable': 'このセッションは中断に対応していないため強制終了に切り替えました。',
  // X-5: supervisor (全セッションをまとめるプロセス) の終了。全セッションが同時に終わる (FR-008)。
  'supervisor-exited':
    'セッションをまとめて管理するプロセスが終了したため、すべてのセッションが終了しました。新しく起動し直してください。',
  // O-4: ターンの失敗の理由 (014 data-model §1 / §5)。HTTP の状態と失敗の文字列 (`errors`) は文言に入れない (U-5)。
  // `execution-error` / `api-error` の「ログイン状態」は、実機の失敗の形を確かめるまでの添え書き (014 plan RK-06)。
  'max-turns': 'ターン数の上限に達したため止まりました。',
  'max-budget': '費用の上限に達したため止まりました。',
  'structured-output-retries': '構造化出力の再試行の上限に達したため止まりました。',
  'execution-error':
    '実行中にエラーが起きました。ログイン状態を確かめてから、起動し直してください。',
  'auth-failed':
    '認証または権限のエラーです。ログイン状態や API キー、組織の設定を確かめてください。',
  billing:
    '請求またはアカウントの問題で止まりました。クレジットとアカウントの状態を確かめてください。',
  // Quota banner の有無に依らない (帯を参照しない。014 spec Edge Cases)。
  'rate-limited': 'レート制限のため止まりました。しばらく待ってから起動し直してください。',
  'api-error':
    'API がエラーを返しました。ログイン状態を確かめ、しばらく待ってから起動し直してください。',
  // X-9 (data-model §7): 再開の起動の失敗。会話の id・パスは文言に入れない。
  'resume-failed':
    '会話を再開できませんでした。会話の記録が見つからない・読めない、または再開した会話が安全でない権限モードで起きました。',
  // X-5: 上限超過 (FR-006)。停止処理中の枠も数えるため「終了を待つ」も含める。上限値は domain の定数から組む。
  // 枠を空ける操作を、一覧に実際に出る操作どおりに案内する (pr-gate R1 po M-004)。中断だけでは枠は空かない (FR-011)。
  'session-limit': `同時に動かせるセッションは ${MAX_CONCURRENT_SESSIONS} 件までです。プロンプト待ち・応答待ち・中断のセッションは「終了」、起動中・応答中・承認待ちのセッションは「強制終了」で枠が空きます (中断だけでは空きません)。停止処理中のセッションも数えるため、終わるまで少し待つ場合があります。`,
  'shutting-down': 'アプリを終了しているため起動できません。',
  'unknown-target': '選んだ作業フォルダまたはランタイムが見つかりませんでした。',
  // X-4 の起動前段 (spec US-1 AC7)。値 (パス・モデル ID) は含めない。
  'invalid-config':
    '起動設定が現在の状態と合いません (カタログに無いモデル・非対応の effort・組み合わせの不一致など)。設定を見直してください。',
  'provider-unavailable':
    '選んだ Provider はこのランタイムから使えません (到達できない・設定を解決できない)。別の Provider を選んでください。',
  'needs-confirmation':
    '選んだ Provider が使えなくなっていたため起動を止めました。Provider を選び直すか、既定 Provider での起動を確認してください。'
}

/**
 * 再開できない理由の文言 (X-9 / data-model §10。[ASSUMED: エラーメッセージ文言])。
 * 過去の行の帯 (`resolvePastResume` の理由) と、再開の起動の拒否の両方が使う。
 */
export const RESUME_UNAVAILABLE_LABELS: Record<ResumeUnavailableReason, string> = {
  'folder-unregistered':
    'この会話の作業フォルダは登録されていません。フォルダを登録してから再開してください',
  'cwd-mismatch':
    'この会話の作業ディレクトリは、登録フォルダの下の別のディレクトリです。そのディレクトリを作業フォルダとして登録してから再開してください',
  'folder-pending': 'この会話の所在の確認が終わっていません。しばらくしてから再開してください',
  'location-unknown': 'この会話の作業ディレクトリの所在が分からないため、再開できません',
  'runtime-missing':
    'この会話のランタイムが見つかりません。ランタイムを再検出してから再開してください',
  'location-mismatch':
    'この会話は、記録のある環境と別の環境の作業ディレクトリで動いていたため、Closta からは再開できません',
  'provider-missing':
    'この会話の config ディレクトリに対応する Provider がありません。Provider を登録してから再開してください',
  'provider-ambiguous':
    'この会話の config ディレクトリに対応する Provider が複数あります。1 つにしてから再開してください',
  'source-unknown': 'この会話を再開できません。一覧を再取得してから試してください'
}

/** 再開の操作・ダイアログの文言 (X-9 / data-model §9.3・§10。[ASSUMED: UI ラベル・ボタン文言])。 */
export const RESUME_LABELS = {
  /** 稼働中の行・過去の行の帯の操作。 */
  action: '再開',
  retry: 'やり直す',
  /** 再開の形の起動ダイアログ。 */
  heading: 'セッションを再開',
  description:
    '前の会話の続きから再開します。作業フォルダ・ランタイム・Provider は引き継ぎます。モデル・effort・権限モードは選び直せます。',
  submit: '再開する',
  deleted: '(削除済み)',
  conversationRunning: 'この会話はすでに実行中です',
  /** 過去の行の帯の名前 (region)。 */
  barLabel: '会話の再開',
  /** 再開した行の中央の先頭 (それまでの会話の後ろの区切り・読み取りの失敗の 1 行。data-model §8.2)。 */
  resumedDivider: 'ここから再開',
  resumedLoadFailed: 'それまでの会話を読み込めませんでした'
} as const

function isResumeUnavailable(reason: string): reason is ResumeUnavailableReason {
  return Object.hasOwn(RESUME_UNAVAILABLE_LABELS, reason)
}

export function launchRejectLabel(
  reason: SessionLaunchRejectReason | ResumeUnavailableReason | 'conversation-running'
): string {
  if (reason === 'conversation-running') return RESUME_LABELS.conversationRunning
  if (isResumeUnavailable(reason)) return RESUME_UNAVAILABLE_LABELS[reason]
  return LAUNCH_REJECT_LABELS[reason]
}

export function launchFailureLabel(reason: LaunchFailureReason): string {
  return LAUNCH_REJECT_LABELS[reason]
}

/**
 * compact の行で状態の印の横に出す短い理由 (O-1 FR-003 / FR-008。pr-gate R1 po M-002)。全文は
 * ツールチップと読み上げ (`launchFailureLabel`) で出す。
 */
const LAUNCH_FAILURE_SHORT_LABELS: Record<LaunchFailureReason, string> = {
  'distro-not-running': 'ディストロ停止',
  'not-verified-running': '実行中確認なし',
  'distro-mismatch': 'ディストロ不一致',
  'claude-not-found': 'claude なし',
  'launch-failed': '起動失敗',
  'process-crashed': '異常終了',
  'stream-protocol-error': 'ストリーム破損',
  'provider-error': 'Provider エラー',
  'interrupt-unavailable': '中断非対応',
  'supervisor-exited': '管理プロセス終了',
  'max-turns': 'ターン上限',
  'max-budget': '費用上限',
  'structured-output-retries': '出力再試行上限',
  'execution-error': '実行エラー',
  'auth-failed': '認証エラー',
  billing: '請求エラー',
  'rate-limited': 'レート制限',
  'api-error': 'API エラー',
  'resume-failed': '再開できませんでした'
}

export function launchFailureShortLabel(reason: LaunchFailureReason): string {
  return LAUNCH_FAILURE_SHORT_LABELS[reason]
}

/**
 * 「再ログイン」導線を出す理由 (正本は 014 data-model §1): 認証または権限の失敗 (`auth-failed`) と、汎用の
 * `provider-error` (分類できない失敗。X-1 FR-020 / US-4 AC6 から変えない)。他は再起動導線 (レート制限・請求などで
 * 再ログインを案内しない)。
 */
export function isReloginFailure(reason: LaunchFailureReason | null): boolean {
  return reason === 'auth-failed' || reason === 'provider-error'
}

const RUN_STATE_LABELS: Record<SessionRunState, string> = {
  idle: '待機中',
  // claude は最初のプロンプトを受け取るまで会話を始めない。起動直後はこの状態で入力を待つ (X-4 quickstart)。
  launching: '準備完了 — プロンプトを送ると始まります',
  running: '応答中…',
  awaiting_permission: '承認待ち',
  interrupted: '中断しました',
  error: 'エラー',
  done: '完了'
}

export function runStateLabel(state: SessionRunState): string {
  return RUN_STATE_LABELS[state]
}

/* ── 稼働中セッションの一覧 (X-5 FE-004 / FR-009 / FR-011 / Principle XV) ── */

/**
 * 一覧の行の状態。run-state と生存フラグの組から決める (`rowStatus`)。
 * とくに `done` は生存なら「応答待ち」、終わっていれば「終了済み」(FR-009)。
 * 状態の値 (`SessionRowStatus`) は `running-session-types.ts` にあり、ここは `Record` で網羅を型で検査する (O-4 FR-018 (2))。
 * **対応表 (`docs/ui-coverage.md`) D 節 session-state の文言の正本** (launch-failure の正本は `LAUNCH_REJECT_LABELS`)。
 * 変えるときは対応表の該当の行を見る (監視ビューと共有するので ui-coverage-reviewer の発火条件には入れていない。
 * O-7 pr-gate R2 ui-coverage M-101)。
 */
export const SESSION_ROW_STATUS_LABELS: Record<SessionRowStatus, string> = {
  launching: '起動中',
  // 最初のプロンプトを待っている (claude は最初のプロンプトまで何もしない。pr-gate R1 po H-001)。
  ready: 'プロンプト待ち',
  running: '応答中',
  awaiting: '承認待ち',
  interrupted: '中断',
  waiting: '応答待ち',
  // 終了を押した後、claude の終わりを受けるまで (pr-gate R2 po L-103)。
  ending: '終了中',
  failed: '失敗',
  ended: '終了済み'
}

/** 一覧と表示中セッションの操作 (FR-011)。新規起動の文言はシェルの `SHELL_LABELS.newSession` (O-7)。 */
export const SESSION_ACTION_LABELS = {
  end: '終了',
  ending: '終了中…',
  endTitle: 'claude を正常に終了させます。',
  interrupt: '中断',
  kill: '強制終了',
  killTitle: '強制終了します。途中出力の保全と履歴ファイルの整合は保証されません。',
  close: '閉じる'
} as const

export const SESSION_LIST_LABELS = {
  /** サイドバーの稼働中の区画の見出し (O-7 data-model §6)。 */
  heading: '稼働中',
  /** 「新規起動」はサイドバーの上にあるので案内を外す (O-7 data-model §6)。 */
  empty: '稼働中のセッションはありません。',
  /** 一覧の aria-label。 */
  list: '稼働中のセッション一覧'
} as const

/** 終わり方の通知 (FR-011)。 */
export const SESSION_END_NOTICES = {
  killed: '強制終了しました。途中出力の保全と履歴ファイルの整合は保証されません。',
  /** 終了が期限内に終わらず強制終了に落ちた (X-1 FR-016 の警告の趣旨を黙って外さない)。 */
  endForced:
    '終了が時間内に完了しなかったため強制終了しました。途中出力の保全と履歴ファイルの整合は保証されません。',
  ended: 'このセッションは終了しました。入力はできません。「閉じる」で一覧から外せます。'
} as const

/** 承認カード (O-5 / 015 data-model §4・§6 の session の行。O-10 / 018 data-model §5「文言」)。 */
export const APPROVAL_CARD_LABELS = {
  allow: '許可',
  deny: '拒否',
  /** `AskUserQuestion` の答える部品の送信ボタン (O-10 / AD-052)。 */
  sendAnswers: '回答を送る',
  /** 選択肢の最後の「その他」(自由に書く)。 */
  other: 'その他',
  otherPlaceholder: '自由に書く',
  /** 未回答の問いがあるとき (ボタンは `aria-disabled`。U-6 (a))。 */
  unanswered: '未回答の問いがあります',
  /** 未回答の問いの見出しに付ける印 (色だけに頼らない。WCAG 1.4.1)。 */
  unansweredMark: '未回答',
  /** 読めない・重なる問いの文・件数の外のとき。「拒否」だけを出す。 */
  cannotAnswer: 'この問いにはアプリから答えられません。拒否して本文で答えてください。',
  /** 送る前の確かめ (`isPermissionAnswers`) で外れたとき。カードは外れない (U-6 (e) / U-9)。 */
  answerInvalid: '回答を確かめてください (各回答は 1,000 文字まで)。'
} as const

const ELICITATION_UNKNOWN_SERVER = 'MCP サーバー'

/** MCP サーバーの問い (Elicitation) のカード (O-10 / 018 data-model §5「文言」)。 */
export const ELICITATION_LABELS = {
  /** 見出し。サーバー名が空 (形の検査を通らない) なら `unknownServer`。 */
  heading: (serverName: string): string =>
    `${serverName === '' ? ELICITATION_UNKNOWN_SERVER : serverName} からの問い`,
  unknownServer: ELICITATION_UNKNOWN_SERVER,
  /** form だけ。 */
  submit: '送る',
  decline: '断る',
  cancel: '取り消す',
  /** URL のリンク。押すと開いて `accept` を返す (U-8)。 */
  openUrl: 'ブラウザで手続きをする',
  openUrlNote: '開くと、手続きに進むことがサーバーに伝わります',
  cannotOpenUrl: 'この URL はアプリから開けません',
  unsupported: 'このアプリでは答えられない形式の問いです。断るか取り消してください',
  required: '必須',
  /** 先頭の 1 枚の後ろに待っている問いの数。 */
  remaining: (n: number): string => `ほか ${n} 件の問い`,
  invalid: '入力を確かめてください',
  /** 項目ごとの理由 (項目に `aria-invalid` / `aria-describedby` で結ぶ。WCAG 3.3.1)。 */
  fieldRequired: 'この項目は必須です',
  fieldInvalid: 'この項目の値を確かめてください',
  /** 列挙の「未選択」(任意の項目は選ばずに送れる)。 */
  unselected: '選択しない'
} as const

/** 表示中セッションで古いメッセージを省略しているときの行 (X-5 / SC-003。本文は保持したまま、窓を広げて辿れる)。 */
export const OLDER_MESSAGES_LABELS = {
  showMore: 'さらに表示'
} as const

export function olderMessagesLabel(count: number): string {
  return `古いメッセージ ${count} 件を省略しています。`
}

/** 一覧の行・表示中セッションのヘッダの表示名が引けないとき (pr-gate R1 po L-001。生の id を出さない)。 */
export const SESSION_NAME_FALLBACKS = {
  folder: '登録が解除された作業フォルダ',
  runtime: '見つからないランタイム'
} as const

/* ── 監視ビュー (O-1 / FR-001〜FR-009 / Principle XV) ─────────────────── */

/** 一覧の見出し (O-7 からは件数の印もここ)・密度 (O-1)。 */
export const MONITOR_LABELS = {
  /** 承認待ちの件数のボタンが押せないとき (移れる先が無い。FR-002)。 */
  awaitingNoTarget: 'ほかに承認待ちのセッションはありません。',
  /** 押せない理由が「表示中のセッションだけが承認待ち」のとき (spec Edge Cases。pr-gate R1 po L-003)。 */
  awaitingOnlyWatched: '承認待ちは表示中のセッションだけです。',
  awaitingNext: '承認待ちのセッションへ移る (承認待ちになったのが早い順)',
  density: '表示の密度',
  densityComfortable: '詳しく',
  densityCompact: 'コンパクト',
  /** 枠が上限に達しているときの見出し (空け方は `session-limit` の拒否文言を再利用する。FR-007)。 */
  limitReached: '同時に動かせるセッションの上限に達しています。',
  /** 実機計測の観測点の要素 (視覚的に隠す。FR-012)。 */
  receivedMessages: '受信したメッセージの累計'
} as const

export function slotUsageLabel(used: number, limit: number): string {
  return `枠 ${used}/${limit}`
}

export function slotUsageTitle(used: number, limit: number): string {
  return `同時に動かせるセッション ${limit} 件のうち ${used} 件を使っています。`
}

export function awaitingCountLabel(count: number): string {
  return `承認待ち ${count} 件`
}

export function failedCountLabel(count: number): string {
  return `失敗 ${count} 件`
}

/** 件数の印の `title` (0 件のものは書かない。O-7 pr-gate R2 ux M-101)。 */
export function attentionSummaryLabel(awaiting: number, failed: number): string {
  const parts = [
    awaiting > 0 ? awaitingCountLabel(awaiting) : null,
    failed > 0 ? failedCountLabel(failed) : null
  ].filter((part): part is string => part !== null)
  return `稼働中のセッション: ${parts.join('・')}`
}

/** 直近の活動の前置き (会話由来の部分と別の要素で出す。FR-006)。 */
const ACTIVITY_PREFIX_LABELS = {
  approval: '承認を求めています',
  tool: '実行',
  prompt: '送信',
  reply: '応答'
} as const

/** 直近の活動の前置き (区切りの記号まで含めて `labels.ts` で組む。Principle XV)。 */
export function activityPrefixLabel(kind: keyof typeof ACTIVITY_PREFIX_LABELS): string {
  return `${ACTIVITY_PREFIX_LABELS[kind]}:`
}

/**
 * 経過時間 (FR-005 [ASSUMED]: 1 分未満は秒、1 時間未満は分、それ以上は時間と分)。区分 (`Elapsed`。型は
 * `running-session-types.ts`) は `session-view.ts` の `formatElapsed` が導き、ここで訳す。
 */
export function elapsedLabel(elapsed: Elapsed): string {
  switch (elapsed.unit) {
    case 'sec':
      return `${elapsed.sec}秒`
    case 'min':
      return `${elapsed.min}分`
    case 'hourMin':
      return `${elapsed.hour}時間${elapsed.min}分`
  }
}

/** 読み上げの文で作業フォルダの表示名が引けないとき (FR-004。文を壊さない)。 */
const ANNOUNCE_FOLDER_FALLBACK = '名前を取得できないセッション'

function joinNames(names: readonly (string | null)[]): string {
  return names.map((n) => (n === null || n === '' ? ANNOUNCE_FOLDER_FALLBACK : n)).join('、')
}

/** 失敗の読み上げで理由を添えるか (理由が無い・汎用の `provider-error` は添えない。014 data-model §5)。 */
function announcedFailureReason(reason: LaunchFailureReason | null): string | null {
  return reason === null || reason === 'provider-error' ? null : launchFailureShortLabel(reason)
}

/**
 * 支援技術に読ませる文 (FR-004)。**作業フォルダの表示名と固定の文言だけ**で組む (会話由来の文字列を入れない)。
 * 同じ更新で複数が遷移したら 1 回の読み上げにまとめる。失敗には監視ビューの行と同じ短い理由を添え
 * (`{名前}: 失敗しました ({短い理由})。`。014 spec US-1 AC5 / data-model §5)、同じ理由のものは名前をつないで 1 文にする。
 */
export function attentionAnnouncement(
  awaiting: readonly (string | null)[],
  failed: readonly { readonly name: string | null; readonly reason: LaunchFailureReason | null }[]
): string {
  const parts: string[] = []
  if (awaiting.length > 0) parts.push(`${joinNames(awaiting)}: 承認待ちになりました。`)
  // 短い理由ごとに名前をまとめる (最初に出た順)。理由を添えないものは null の鍵にまとめる。
  const groups = new Map<string | null, (string | null)[]>()
  for (const { name, reason } of failed) {
    const key = announcedFailureReason(reason)
    const names = groups.get(key)
    if (names === undefined) groups.set(key, [name])
    else names.push(name)
  }
  for (const [reason, names] of groups) {
    parts.push(`${joinNames(names)}: 失敗しました${reason === null ? '' : ` (${reason})`}。`)
  }
  return parts.join(' ')
}

/** 起動時刻 (秒まで。FR-009)。 */
export function formatStartedAt(epochMs: number): string {
  return new Date(epochMs).toLocaleTimeString('ja-JP', { hour12: false })
}

/** 同じ登録フォルダで動いているセッションがあるときの警告 (起動はブロックしない。spec US-1 AC2)。 */
export function sameFolderWarning(count: number): string {
  return `この作業フォルダでは既に ${count} 件のセッションが動いています。同じファイルを同時に編集すると内容が食い違うことがあります。起動はできます。`
}

/* ── 起動設定ダイアログ (X-4 FE-004 / Principle XV) ─────────────────── */

/**
 * 起動ダイアログの権限モードの名前 (安全 3 値)。文字列は transcript と共有の権限モードの名前の表
 * (`features/chat/labels.ts` の `PERMISSION_MODE_NAMES`) から取る — 同じモードの名前を 2 か所に分けない
 * (O-4 / 014 research R-15 / Principle XIV)。名前は Claude Code の表記で、説明は付けない (025 / AD-065 Decision 3)。
 */
export const PERMISSION_MODE_LABELS: Record<SafePermissionMode, string> = {
  default: PERMISSION_MODE_NAMES.default,
  plan: PERMISSION_MODE_NAMES.plan,
  dontAsk: PERMISSION_MODE_NAMES.dontAsk
}

/* ── 実行中の設定の変更 (023 / data-model §8.4 / Principle XV) ── */

export const LIVE_SETTING_LABELS = {
  permissionMode: '権限モード',
  model: 'モデル',
  currentModel: '現在のモデル',
  rename: '名前を変更',
  nameField: '名前',
  save: '保存',
  cancel: 'キャンセル',
  defaultModel: '既定',
  nameRule: '1〜100 文字で、改行を含めずに入力してください',
  noModelList: 'この Provider にはモデルの一覧がありません',
  loadingModelList: 'モデルの一覧を読み込み中',
  emptyModelList: 'Claude Code がモデルの一覧を返しませんでした',
  noModelForEffort: '起動の effort が効くモデルが Claude Code の一覧にありません',
  failure: {
    'permission-mode': '権限モードを変更できませんでした',
    model: 'モデルを変更できませんでした',
    name: '名前を変更できませんでした'
  } satisfies Record<LiveSettingKind, string>,
  blocker: {
    'not-running': 'Claude Code が動いていません',
    'not-ready': '最初の応答の後に変更できます',
    busy: '変更中です',
    'no-conversation': '最初の応答の後に名前を付けられます',
    'turn-running': '応答の実行中は名前を変更できません'
  } satisfies Record<LiveSettingBlocker, string>
} as const

/** 既定の Provider のモデルの一覧を読み込めなかった理由の文言 (025 data-model §9)。 */
export const LIVE_MODEL_LIST_FAILURE_LABELS = {
  'unknown-session': 'セッションが見つからないため、モデルの一覧を読み込めませんでした',
  'invalid-value': 'このセッションでは Claude Code にモデルの一覧を聞けません',
  'not-running': 'Claude Code が動いていないため、モデルの一覧を読み込めませんでした',
  'not-ready': '最初の応答の後にモデルの一覧を読み込みます',
  busy: '変更中のため、モデルの一覧を読み込めませんでした',
  'no-conversation': '最初の応答の後にモデルの一覧を読み込みます',
  'turn-running': '応答の実行中のため、モデルの一覧を読み込めませんでした',
  rejected: 'Claude Code がモデルの一覧に答えませんでした',
  'session-ended': 'セッションが終わったため、モデルの一覧を読み込めませんでした',
  timeout: 'モデルの一覧の読み込みが時間内に終わりませんでした',
  'write-failed': 'モデルの一覧を読み込めませんでした'
} satisfies Record<LiveSettingFailure, string>

/** `/resume` の選ぶ画面の文言 (025 data-model §9)。 */
export const RESUME_PICKER_LABELS = {
  title: '過去のセッションを再開',
  search: 'セッションを検索',
  empty: 'このフォルダに過去のセッションはありません',
  noMatch: (query: string): string => `「${query}」に合うセッションがありません`,
  loading: '読み込み中',
  close: '閉じる'
} as const

/** 起動設定ダイアログの軸ラベル (select の見出しと aria-label を兼ねる。FE-004)。 */
export const LAUNCH_AXIS_LABELS = {
  folder: '作業フォルダ',
  runtime: 'ランタイム',
  provider: 'Provider',
  model: 'モデル',
  effort: 'effort',
  permissionMode: '権限モード'
} as const

/**
 * Provider の「既定」の選択肢の文言を、選んだランタイムの種類で替える (X-8 data-model §10.1)。
 * 既定 = Provider を重ねずに、そのランタイム側の claude の設定で動かす。ランタイム未選択は WSL と同じ今の文言。
 */
export const PROVIDER_DEFAULT_LABELS = {
  wsl: '既定 (ディストロ内の claude の設定)',
  win32: '既定 (Windows の claude の設定)'
} as const

/**
 * 空状態と次の一手 (FE-004 / spec Edge Cases)。起動ダイアログはモーダルで、サイドバーの「設定」に手が届かないので、
 * 設定へ移る手順を文に含める (O-7 pr-gate R1 ux M-003)。
 */
export const LAUNCH_EMPTY_STATE_LABELS = {
  // 「→」は読み上げで「右矢印」になるので「の」でつなぐ (O-7 pr-gate R2 ux M-003)。
  noFolders:
    '作業フォルダが登録されていません。このダイアログを閉じて、サイドバーの「設定」の「作業フォルダ」で登録してください。',
  noWslRuntimes:
    'WSL ランタイムが見つかりません。このダイアログを閉じて、サイドバーの「設定」の「ランタイム」で再検出してください。',
  allRuntimesStopped:
    'WSL ランタイムがすべて停止しています。WSL ディストロを起動してから「再評価」を押してください (アプリはディストロを起動しません)。',
  noProviders:
    '既定 Provider で起動できます。登録するには、このダイアログを閉じて、サイドバーの「設定」の「Provider」を開いてください。',
  /** 一覧の読み込み中・失敗は空状態と分ける (読み込み中に「登録してください」と案内しない。po M-102)。 */
  foldersLoading: '作業フォルダを読み込んでいます…',
  foldersLoadFailed: '作業フォルダを読み込めませんでした。',
  runtimesLoading: 'ランタイムを読み込んでいます…',
  runtimesLoadFailed: 'ランタイムを読み込めませんでした。',
  retry: '再試行',
  presetsLoading: 'プリセットを読み込んでいます…',
  presetsLoadFailed: 'プリセットを読み込めませんでした。',
  noPresets:
    '保存したプリセットはまだありません。軸を選んで名前を付けて保存すると、次回から選ぶだけで起動設定を復元できます。',
  presetSaveUnavailable: '作業フォルダとランタイムを選ぶと保存できます。'
} as const

export const AXIS_RESET_LABELS: Record<AxisResetReason, string> = {
  'provider-removed': '選んでいた Provider が削除されていたため、既定に戻しました。',
  'provider-unreachable':
    'このランタイムからは選んでいた Provider に到達できないため、既定に戻しました。',
  'model-not-in-catalog': 'Provider のモデルカタログに無いモデルだったため、既定に戻しました。',
  'effort-unsupported': 'このモデルが対応しない effort だったため、既定に戻しました。'
}

/**
 * 起動設定の残りの軸 (024 data-model §9.3。Principle XV)。追加ディレクトリ・ターン数の上限・費用の上限・セッション名。
 * 概要のタブの「なし」「上限なし」もここに置く (起動ダイアログと同じ言葉)。
 */
export const EXTRA_AXES_LABELS = {
  additionalDirectories: '追加ディレクトリ',
  maxTurns: 'ターン数の上限',
  maxBudgetUsd: '費用の上限 (USD)',
  sessionName: 'セッション名',
  addFolder: 'フォルダを追加',
  removeFolder: '外す',
  unlimitedPlaceholder: '上限なし',
  namePlaceholder: '自動で付ける',
  maxTurnsRange: 'ターン数は 1〜1000 の整数で入力してください',
  maxBudgetRange: '費用は 0.01〜1000 の範囲で入力してください',
  /** 登録が解除されて表示名が引けない項目 (起動ダイアログの通知と概要のタブで共通) */
  deletedFolder: '(削除されたフォルダ)',
  /** 概要のタブ: 追加ディレクトリが 0 件のとき */
  overviewNone: 'なし',
  /** 概要のタブ: 上限が無いとき */
  overviewUnlimited: '上限なし'
} as const

/**
 * 追加ディレクトリの項目を外した通知 (024 data-model §9.3)。`name` は項目の表示名
 * (引けなければ `EXTRA_AXES_LABELS.deletedFolder`)。理由の全値を網羅する (型で漏れを落とす)。
 */
export const DIRECTORY_RESET_LABELS: Record<DirectoryResetReason, (name: string) => string> = {
  unreachable: (name) => `追加ディレクトリ ${name} はこのランタイムから使えないため外しました`,
  'same-as-folder': (name) => `追加ディレクトリ ${name} は作業フォルダと同じため外しました`,
  unregistered: (name) => `追加ディレクトリ ${name} は登録が解除されたため外しました`
}

/** 追加ディレクトリの越境の警告は、作業フォルダと同じ `CROSS_BOUNDARY_LABELS` の文言に項目の表示名を前置する。 */
export function directoryCrossBoundaryLabel(name: string, body: string): string {
  return `追加ディレクトリ ${name}: ${body}`
}

/**
 * 到達可能性の取得に失敗したときの Provider の reset 通知 (po M-101)。domain の `AxisResetReason` は
 * `provider-unreachable` のままで、表示側が `reachable.status === 'failed'` を見て差し替える
 * (確認できていないことを「到達できない」と断定しない)。
 * 同時に出る status 行 (`REACHABILITY_STATUS_LABELS.failed`) は選択肢の話、こちらは**選んでいた Provider が
 * 既定に置き換わった**ことの話であり、内容を重ねない (po L-204)。
 */
export const PROVIDER_RESET_UNVERIFIED_LABEL =
  '選んでいた Provider に到達できるかを確認できなかったため、いまは既定 Provider になっています (再試行で戻せます)。'

/** 「再評価」ボタンの状態と失敗 (po M-102。再評価の失敗を黙らない)。 */
export const REEVALUATE_LABELS = {
  idle: '再評価',
  running: '再評価中…',
  failed: 'ランタイムの再評価に失敗しました。もう一度お試しください。'
} as const

/** blocker の理由と次の一手 (spec Edge Cases / L-103)。 */
export const LAUNCH_BLOCKER_LABELS: Record<LaunchBlocker, string> = {
  'folder-unselected': '作業フォルダを選んでください。',
  'folder-missing':
    '選んでいた作業フォルダは登録が解除されています。作業フォルダを選び直してください。',
  'runtime-unselected': 'ランタイムを選んでください。',
  'runtime-missing': '選んでいたランタイムが見つかりません。ランタイムを選び直してください。',
  'runtime-stopped':
    'ランタイムが停止しています。WSL ディストロを起動してから「再評価」を押してください (アプリはディストロを起動しません)。',
  'distro-mismatch':
    '作業フォルダの所在とランタイムのディストロが一致しません。同じディストロのランタイムを選んでください。'
}

/** 選択肢から除外した Provider の理由 (X-3 `listReachableProviders` の reason。FR-002)。 */
export const REACHABILITY_EXCLUDED_LABELS: Record<'unreachable' | 'blocked', string> = {
  unreachable: 'このランタイムからは到達できません',
  blocked: 'ランタイムの準備待ち (停止中・パス変換の取得前など)'
}

/**
 * 到達可能性の取得状態 (pr-gate H-004)。取得中・失敗の間は Provider の選択肢を「既定」だけにする
 * (fail-open にしない。SC-001)。
 */
export const REACHABILITY_STATUS_LABELS = {
  loading: 'このランタイムから使える Provider を確認しています…',
  failed:
    'このランタイムから使える Provider を確認できませんでした。確認できるまで既定 Provider だけを選べます。',
  retry: '再試行'
} as const

/**
 * 越境の警告 (FR-008 / AD-016)。判定は既存の解決結果 DTO の `boundary` だけで行う (pr-gate C-001)。
 * `unknown` は**解決結果の取得 (IPC) に失敗したときだけ**出す (越境かどうかを示せないことを黙らない)。
 * DTO の `reachability === 'blocked'` は `boundary: 'unknown'` を持つが「判定できない」ではないので
 * この注記を出さない (`FOLDER_RUNTIME_BLOCKED_LABELS`。R3 po M-201)。
 * `checking` は取得中 (起動を保留する)。`unreachable` は DTO の `reachability === 'unreachable'`
 * (別ディストロの所在・パスを変換できない) で、起動しても失敗するため起動を止める (architecture M-001)。
 * main の resolveCwd が null になるのは `unreachable` だけではない — `blocked` (PathMapping 未取得) の
 * Windows フォルダも null になる (R3 platform-boundary L-502)。
 */
export const CROSS_BOUNDARY_LABELS = {
  lead: '作業フォルダとランタイムがファイルシステムの境界をまたいでいます。',
  fallbackImpact: 'ファイル操作が遅くなることがあります。',
  launchable: '起動はできます。',
  unknown:
    '作業フォルダとランタイムの組み合わせを判定できませんでした。ファイルシステムの境界をまたぐ場合はファイル操作が遅くなることがあります。起動はできます。',
  checking: '作業フォルダとランタイムの組み合わせを確認しています…',
  unreachable:
    '選んだランタイムからはこの作業フォルダに到達できません (別のディストロの所在、またはパスを変換できません)。組み合わせを見直してください。'
} as const

/**
 * 解決結果 DTO が `blocked` のときの行 (R3 po M-201 / architecture L-002 / platform-boundary L-502)。
 * `blockedReason` で分ける:
 * - `capabilities-not-probed`: probe の完了を待つ (起動を保留。probe 完了または再評価で DTO を取り直すと
 *   解ける。probe が始まらないこともあるため再評価の導線も出す。R4 platform-boundary L-601)
 * - `probe-failed`: 起動不可。再評価 (再検出) の導線を出す
 * - `distro-not-running`: 行を出さない (runtime-stopped の blocker が次の一手を示す)
 */
export const FOLDER_RUNTIME_BLOCKED_LABELS = {
  waitingProbe: 'ランタイムの準備 (パス変換の取得) を待っています…',
  probeFailed:
    'ランタイムの能力確認に失敗しました。再評価してください。繰り返し失敗する場合は、このダイアログを閉じて、サイドバーの「設定」の「ランタイム」で状態を確認してください。'
} as const

/** 前回のセッションが失敗して起動設定ダイアログに戻ったときの理由 (US-1 AC7 / pr-gate M-07)。 */
export function previousFailureLabel(reason: LaunchFailureReason): string {
  return `前回のセッションは失敗しました。${launchFailureLabel(reason)}`
}

/** Provider が既定に戻った状態で起動するときの確認文言 (US-2 AC3)。 */
export const PROVIDER_RESET_CONFIRMATION = {
  wsl: '選んでいた Provider が使えないため、既定 Provider で起動します。既定 Provider ではディストロ内の claude の既定の資格情報と課金先が使われます。よろしいですか？',
  win32:
    '選んでいた Provider が使えないため、既定 Provider で起動します。既定 Provider ではホストの claude の既定の資格情報と課金先が使われます。よろしいですか？'
} as const

/**
 * 到達可能性の取得に失敗した状態で起動するときの確認文言 (po M-101)。使えないと断定せず、
 * 先に「再試行」できることを示す (確認ダイアログの中に再試行を置く)。
 */
export const PROVIDER_RESET_CONFIRMATION_UNVERIFIED = {
  wsl: '選んでいた Provider に到達できるかを確認できなかったため、このまま起動すると既定 Provider で起動します。既定 Provider ではディストロ内の claude の既定の資格情報と課金先が使われます。先に「再試行」で確認し直すこともできます。',
  win32:
    '選んでいた Provider に到達できるかを確認できなかったため、このまま起動すると既定 Provider で起動します。既定 Provider ではホストの claude の既定の資格情報と課金先が使われます。先に「再試行」で確認し直すこともできます。'
} as const

export const PRESET_SAVE_FAILURE_LABELS: Record<
  Extract<SavePresetResult, { ok: false }>['reason'],
  string
> = {
  'invalid-preset': 'プリセットを保存できませんでした。名前と設定を見直してください。',
  'name-conflict': '同じ名前のプリセットがあります。',
  'limit-reached': `プリセットは ${MAX_PRESETS} 件まで保存できます。不要なプリセットを削除してください。`,
  'store-newer-version':
    'プリセットの保存ファイルが新しい版のため変更できません (ファイルは退避済みです)。',
  'store-read-failed':
    'プリセットの保存ファイルを読み込めなかったため、上書きを止めました。しばらくしてから再度お試しください。'
}

/** プリセットの保存成功の通知と上書き確認 (plan.md:61)。上書き確認は `name-conflict` の文言から組み立てる。 */
export const PRESET_NOTICE_LABELS = {
  saved: 'プリセットを保存しました。',
  overwriteConfirm: `${PRESET_SAVE_FAILURE_LABELS['name-conflict']}上書きしますか？`,
  /** 保存で例外が起きたとき (理由キーが無い。ディスク満杯・権限など。pr-gate M-08)。 */
  saveFailed: '保存できませんでした。',
  /** 削除の確認 (上書き確認と同じ形。po L-001)。 */
  removeConfirm: 'このプリセットを削除しますか？元に戻せません。',
  removed: 'プリセットを削除しました。',
  /**
   * 削除の失敗 (`{ok:false}` は理由キーを持たない。例外も同じ文言。pr-gate M-08)。`{ok:false}` は
   * 未知 id (既に無い) と保存ファイルの不調の両方から来るので、原因を断定しない (po L-102)。
   * usePresets は結果に関わらず一覧を取り直す。
   */
  removeFailed: 'プリセットを削除できませんでした。一覧を読み込み直しました。'
} as const

/** 削除確認の見出しとボタン (po L-001)。 */
export const PRESET_REMOVE_CONFIRM_LABELS = {
  dialog: '削除の確認',
  confirm: '削除する',
  cancel: 'やめる'
} as const

/**
 * プリセットの欄の起動の利用記録 (O-3 / 012 data-model §4「表示」・§5 の `session/labels.ts` の行)。
 * 「プリセットを適用」は起動元が `preset` の回数で、語は session charter の KPI「再利用率」の文言 (U-6) と同じにする。
 * 前回の設定を変えずに起動し直した起動は前回の起動元のまま入る (数え方の正本は data-model §4「renderer の起動元」)。
 */
export const LAUNCH_USAGE_LABELS = {
  usageTitle: '直近 30 日の起動',
  usageCounts: (preset: number, manual: number) =>
    `プリセットを適用 ${preset} 回 / 適用なし ${manual} 回`,
  usageLoading: '記録を読み込み中…',
  /** `ok` で 2 つとも 0 (記録が無い)。 */
  usageEmpty: 'まだ記録がありません。',
  usageEmptyHint: '起動すると、プリセットを適用したかどうかを日ごとに数えます。',
  /** `unreadable` (将来版・読めない) と、読み出しの invoke の失敗。 */
  usageUnreadable: '記録を読めません。',
  usageUnreadableHint: '次に起動ダイアログを開いたときに読み直します。'
} as const
