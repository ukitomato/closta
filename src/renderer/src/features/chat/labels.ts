import type { PermissionModeKey } from '@domain/session/meter'
import type { PluginDetail } from '@domain/session/session-init-report'
import type { RetryDetail, TaskProgress } from '@domain/session/system-event'
import type { SystemEventCategory, SystemEventStatus } from '@domain/session/transcript-dto'

/**
 * transcript (過去ログと実行中で共有する element) の文言 (O-2 / FR-009・FR-012)。
 *
 * transcript の element (`thread.aui.tsx`) は過去ログと実行中で共有し、elements が import する features は
 * `features/chat` だけなので、session の `labels.ts` には置かない (research R-06 / design-gate R1 architecture M-006)。
 * 状態の理由キーは domain の `SYSTEM_EVENT_STATUSES` (data-model §2)。
 */

/** 数 (トークン・回数・秒) の表記 (`ja-JP` の桁区切り)。 */
const COUNT_FORMAT = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 0 })

/** システムイベントの行の種類 (行の先頭に出す)。 */
export const SYSTEM_EVENT_CATEGORY_LABELS: Readonly<Record<SystemEventCategory, string>> = {
  hook: 'Hook',
  task: 'Background task',
  // O-4 の行 (014 data-model §5)。アイコンと detail の描き分けは `thread.aui.tsx` の `SystemEventRow`。
  'api-retry': 'API の再試行',
  compaction: 'コンテキストの圧縮',
  'permission-mode': '権限モード',
  // O-5 の行 (015 data-model §4 / §6)。文の描き分けは `thread.aui.tsx` の `SystemEventRow`。
  auth: '認証',
  plugin: 'プラグイン'
}

/** 状態の理由キー → 文言。 */
export const SYSTEM_EVENT_STATUS_LABELS: Readonly<Record<SystemEventStatus, string>> = {
  // Hook の started は応答が来るまでの間ずっと出るので「開始」ではなく「実行中」(pr-gate R1 po L-003)。
  started: '実行中',
  succeeded: '成功',
  failed: '失敗',
  cancelled: '取り消し',
  pending: '待機中',
  running: '実行中',
  completed: '完了',
  killed: '強制停止',
  paused: '一時停止',
  stopped: '停止',
  // SDK が新しく足した、本アプリの知らない状態。「結果不明」と紛らわしくしない (pr-gate R2 ux L-005)。
  unknown: 'SDK が知らない状態',
  // O-4 の行 (014 data-model §5)。
  retrying: '再試行中',
  compacting: '圧縮中',
  changed: '変更',
  // O-5 の認証の行 (015 data-model §4)。
  authenticating: '認証中'
}

export const SYSTEM_EVENT_LABELS = {
  /**
   * 終わりの来ない行 (セッションの終了・失敗の後と過去ログ。FR-009 / US-2 AC6)。括弧の中は実行中のペインと
   * 過去ログのどちらにも通じる言い方にする (pr-gate R2 ux L-005)。
   */
  outcomeUnknown: '結果不明 (終わりの知らせが届いていない)',
  /**
   * 失敗した Hook の行の案内 (出力本文は出さない。見る場所と次の操作を示す。spec Edge Cases / pr-gate R1 po L-003 /
   * R2 ux L-004)。
   */
  hookFailedGuidance:
    'Hook の設定 (.claude/settings.json などの hooks) と、claude --debug の出力を確かめてください。直したらセッションを起動し直してください。',
  /** 失敗・強制停止した Background task の行の案内 (出力本文は出さない。pr-gate R2 ux L-004)。 */
  taskFailedGuidance:
    'task を起動した tool の呼び出し (Bash・Task など) の表示で出力を確かめてください。',
  /**
   * API の再試行の行の detail (O-4 / 014 data-model §5 の `retryDetail`)。回数・HTTP の状態・待ち時間だけで、エラーの中身は
   * 出さない (014 spec FR-007)。HTTP の状態が無い (接続の失敗など) ときは HTTP の部分を出さない。待ち時間は秒に切り上げる。
   */
  retryDetail: (retry: RetryDetail): string =>
    [
      `${retry.attempt}/${retry.maxRetries} 回目`,
      ...(retry.errorStatus === null ? [] : [`HTTP ${retry.errorStatus}`]),
      `${Math.ceil(retry.retryDelayMs / 1000)} 秒後`
    ].join('・'),
  /**
   * 権限モードの行の文 (O-4 / 014 data-model §5 の `permissionModeChanged`)。`name` は `permissionModeName` の値
   * (行の `detail` は権限モードの鍵で、知らない鍵は `unknown` の名前)。
   */
  permissionModeChanged: (name: string): string => `権限モードが「${name}」に変わりました`,
  /**
   * Background task の行の進み具合 (O-4 / 014 data-model §5 の `taskProgress`)。task の種類の後ろに並べる。数は `ja-JP` の
   * 桁区切り、経過時間は秒に切り捨てる。要約・説明・最後の tool 名は届かない (014 spec FR-013)。
   */
  taskProgress: (progress: TaskProgress): string =>
    `約 ${COUNT_FORMAT.format(progress.tokens)} トークン・tool ${COUNT_FORMAT.format(progress.tools)} 回・${COUNT_FORMAT.format(Math.floor(progress.durationMs / 1000))} 秒`,
  /**
   * 認証の行の文 (O-5 / 015 data-model §6 の chat のシステムイベントの行・spec US-3 AC1〜AC3)。`output` / `error` の
   * 文字列は届かない (U-4)。状態ごとに 1 つで、行の下の案内の段に出す。
   */
  authInProgress:
    'Claude Code が認証中です。セッションを起動した環境の端末で claude にログインしてください',
  authSucceeded: '認証しました',
  authFailed: '認証に失敗しました (再ログインしてください)',
  /** プラグインの行の進み具合 (O-5 / 015 data-model §6・spec US-3 AC5)。数は `ja-JP` の桁区切り。 */
  pluginInstalling: 'プラグインのマーケットプレイスを導入中',
  pluginInstalled: (n: number): string => `導入しました (${COUNT_FORMAT.format(n)} 件)`,
  pluginFailed: (n: number): string => `導入に失敗しました (${COUNT_FORMAT.format(n)} 件)`
} as const

/** 認証の行の文 (状態ごと)。終わりの来ない行 (「結果不明」) と知らない状態では null。 */
export function authRowText(status: SystemEventStatus | null, unresolved: boolean): string | null {
  if (unresolved) return null
  switch (status) {
    case 'authenticating':
      return SYSTEM_EVENT_LABELS.authInProgress
    case 'succeeded':
      return SYSTEM_EVENT_LABELS.authSucceeded
    case 'failed':
      return SYSTEM_EVENT_LABELS.authFailed
    default:
      return null
  }
}

/**
 * プラグインの行の detail の文 (015 data-model §4 / §6)。導入中の印 (`started` のとき)・導入できた数・できなかった数と、
 * 最後のマーケットプレイスの名前 (形の検査済み。「」で括る) を `・` でつなぐ。0 件の数は出さない (終わった行の導入できた数は出す)。
 */
export function pluginRowText(plugin: PluginDetail, status: SystemEventStatus | null): string {
  const done = status !== null && status !== 'started'
  return [
    ...(done ? [] : [SYSTEM_EVENT_LABELS.pluginInstalling]),
    ...(plugin.installed > 0 || (done && plugin.failed === 0)
      ? [SYSTEM_EVENT_LABELS.pluginInstalled(plugin.installed)]
      : []),
    ...(plugin.failed > 0 ? [SYSTEM_EVENT_LABELS.pluginFailed(plugin.failed)] : []),
    ...(plugin.marketplace === null ? [] : [`「${plugin.marketplace}」`])
  ].join('・')
}

/**
 * 権限モードの表示名 (O-4 / 014 data-model §5 / research R-15)。鍵は domain の `PermissionModeKey` (SDK の 6 値と
 * 知らない値の `unknown`)。**権限モードの名前の表はここ 1 つ** — 起動ダイアログの安全 3 値 (`session/labels.ts` の
 * `PERMISSION_MODE_LABELS`) はここから取り、transcript の権限モードの行・「概要」の現在の権限モード・中央の警告の帯が
 * 同じ名前を出す (Principle XIV)。昇格値の綴りは domain と renderer の文言の表にだけ置く (`src/agents/` に置かない。項目 16)。
 */
export const PERMISSION_MODE_NAMES: Readonly<Record<PermissionModeKey, string>> = {
  default: '通常 (操作ごとに承認)',
  plan: '計画のみ (実行しない)',
  dontAsk: '事前承認のみ (承認カードを出さない)',
  acceptEdits: '編集を自動で許可',
  bypassPermissions: 'すべて許可',
  auto: '自動で判断',
  unknown: '不明なモード'
}

/**
 * 権限モードの鍵 (未信頼の文字列。transcript の行の `detail` など) → 表示名。表に無い鍵 (`toString` などの prototype の
 * キーを含む) は `unknown` の名前。
 */
export function permissionModeName(key: string): string {
  return Object.hasOwn(PERMISSION_MODE_NAMES, key)
    ? PERMISSION_MODE_NAMES[key as PermissionModeKey]
    : PERMISSION_MODE_NAMES.unknown
}

/**
 * Background task の種類 (SDK の `task_type`) → 文言 (pr-gate R1 po L-002)。値は SDK 0.3.270 の `sdk.d.ts` に
 * 現れるもの。知らない値は識別子のまま出す (`taskTypeLabel`)。
 */
const TASK_TYPE_LABELS: Readonly<Record<string, string>> = {
  local_bash: 'シェルのコマンド',
  local_agent: 'サブエージェント',
  local_workflow: 'ワークフロー',
  mcp_task: 'MCP のタスク'
}

/** task の種類の文言。表に無い値 (`toString` などの prototype のキーを含む) はそのまま返す。 */
export function taskTypeLabel(taskType: string): string {
  return Object.hasOwn(TASK_TYPE_LABELS, taskType)
    ? (TASK_TYPE_LABELS[taskType] ?? taskType)
    : taskType
}

/**
 * tool の結果の印 (O-2 / FR-007)。Terminal block・Code diff・ToolFallback・Subagent・Todo list・Agent plan で
 * 同じ文言を使う (pr-gate R1 po H-001)。
 */
export const TOOL_RESULT_LABELS = {
  /**
   * 結果がエラー (失敗・拒否) だったとき。利用者自身の拒否も含むので「失敗」とは書かず中立な「エラー」にする
   * (pr-gate R2 po L-001 / ux L-001)。
   */
  failed: 'エラー',
  /** 完了したとき (Terminal block のアイコンの名前)。 */
  completed: '完了',
  /** args か結果が上限で切り詰められたとき。 */
  truncated: '（切り詰め）',
  /**
   * 結果待ちの tool の経過時間 (O-4 / 014 data-model §5 の `toolElapsed`。実行中だけ。1 秒に 1 回まで更新される)。
   * 60 秒未満は `{n}秒`、それ以上は `{m}分{s}秒`。
   */
  toolElapsed: (seconds: number): string =>
    seconds < 60 ? `${seconds}秒` : `${Math.floor(seconds / 60)}分${seconds % 60}秒`
} as const

/**
 * MCP の tool の表示 (O-5 / 015 data-model §1・§6 の chat の MCP の行)。見出しのサーバー名と tool 名は会話由来の値で、
 * 文言はこの 3 つだけ。状態の印 (アイコン・中断・経過時間) は ToolFallback と同じ部品が出す。
 */
export const MCP_TOOL_LABELS = {
  input: '入力',
  result: '結果',
  /** 構成のサーバー名で分け方を確かめられなかったとき (過去ログ・2 つ以上の前方一致。015 data-model §1)。 */
  serverInferred: 'サーバー名は推定'
} as const

/**
 * `AskUserQuestion` の読み取り専用の表示 (O-5 / 015 data-model §1・§6 の chat の問いの行)。回答の入力は出さない (O-10)。
 */
export const ASK_USER_QUESTION_LABELS = {
  multiSelect: '複数選択',
  selectedAnswer: '選ばれた回答',
  result: MCP_TOOL_LABELS.result
} as const

/**
 * 実行中の思考の印 (O-4 / 014 data-model §5 の `thinkingTokens`「思考中 約 {n} トークン」。research R-07)。registry の
 * Thinking indicator の `label` には変わらない「思考中」を、`elapsed` には毎秒変わりうる推定のトークン数を渡す
 * (`label` は付け替えの key なので、数を入れると更新のたびに入りのアニメーションが走る。014 research R-09 の申し送り)。
 */
export const THINKING_LABELS = {
  thinking: '思考中',
  /** 推定のトークン数 (`ja-JP` の桁区切り)。 */
  tokens: (n: number): string => `約 ${COUNT_FORMAT.format(n)} トークン`
} as const

/**
 * composer の入力欄の名前と placeholder (O-3 / spec FR-014 / 012 data-model §5)。`thread.aui.tsx` の
 * `ComposerPrimitive.Input` に渡す (部品は差し替えない。AD-037)。ほかの composer のボタンの名前は対象外 (012 plan RK-08)。
 */
export const COMPOSER_LABELS = {
  composerInput: 'メッセージ',
  composerPlaceholder: 'メッセージを入力'
} as const

/**
 * 会話内検索 (O-3 / spec FR-003 / FR-008 / 012 data-model §5)。中央のヘッダのボタンと、その下の検索のバーの文言。
 * `searchOpen` はボタンと入力欄の名前を兼ねる。
 */
export const CONVERSATION_SEARCH_LABELS = {
  searchOpen: '会話内を検索',
  searchPlaceholder: '語を入力',
  searchPosition: (i: number, n: number): string => `${i} / ${n} 件`,
  searchNone: '一致する箇所はありません。',
  searchNoneHint: '語を変えるか、検索を閉じてください。',
  searchNext: '次へ',
  searchPrev: '前へ',
  searchClose: '検索を閉じる'
} as const

/**
 * transcript の情報密度の切り替え (FR-012)。**監視ビューの行の密度 (`MONITOR_LABELS.density`) と区別できる文言**
 * にする (US-3 AC5 / design-gate R1 po M-005)。group 名は見える見出しとしても出す (pr-gate R1 po M-001)。
 * ボタンの説明 (`title`) は `thread.aui.tsx` の描き分けに合わせる。
 */
export const TRANSCRIPT_DENSITY_LABELS = {
  group: 'transcript の表示',
  comfortable: '開いて表示',
  compact: '畳んで表示',
  // 内部用語 (Tool group / Reasoning) ではなく画面で見る言葉で書く (pr-gate R2 ux L-003)
  comfortableHint:
    'tool の呼び出しのまとまりを最初から開いて表示します (考えている過程は応答中だけ開きます)。',
  compactHint: 'tool の呼び出しのまとまりと考えている過程を最初から畳んで表示します。'
} as const
