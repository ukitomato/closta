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

/** ターンの所要時間の接頭辞 (O-9 data-model §5。`所要 0:05`)。 */
export const TURN_DURATION_LABEL = '所要'

/** 入力の先頭が空のターンの表示 (O-9 data-model §3)。 */
export const TURN_HEAD_EMPTY_LABEL = '(本文なし)'

/** メッセージの時刻の文言 (O-9 data-model §5 / §6)。 */
export const MESSAGE_TIME_LABELS = {
  /** 支援技術の名前。全体の書式の前に付ける (短い書式を二重に読ませない)。 */
  fullPrefix: '時刻'
} as const

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
  plugin: 'プラグイン',
  // O-6 の行 (016 data-model §1 / §4)。境界は `TranscriptBoundary` が描く (見出しは `transcriptBoundaryHeading`)。
  'compact-boundary': 'コンテキストの圧縮の境界',
  'conversation-reset': '会話の作り直し',
  refusal: 'モデルの拒否',
  informational: '知らせ',
  // O-10 の行 (018 data-model §5)。URL での手続きの完了。
  elicitation: 'MCP の手続き',
  // O-11 の行 (019 data-model §2.2)。task の行と同じ見出しに `SYSTEM_EVENT_LABELS.backgroundedMark` を添える。
  'backgrounded-task': 'Background task'
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
  authenticating: '認証中',
  // O-6 の行の見た目の段階 (016 data-model §1 / §4)。
  marked: '区切り',
  fallback: 'モデルを切り替え',
  'no-fallback': '拒否',
  'no-fallback-retry': '拒否',
  prevented: 'ここで止まりました',
  warning: '注意',
  notice: '知らせ'
}

/** 状態の文言 (Badge) を出さない状態 (行の見出しや本文がそのまま伝える。016 data-model §4)。 */
export const QUIET_SYSTEM_EVENT_STATUSES: ReadonlySet<SystemEventStatus> = new Set([
  'marked',
  'notice'
])

/**
 * 会話の境界と拒否・知らせの行の文言 (O-6 / 016 data-model §4)。SDK は `conversation_reset` を /clear・plan モードの終了・
 * 新しいセッションで出すので「これより上がコンテキストに無い」とは断定しない。
 */
export const TRANSCRIPT_BOUNDARY_LABELS = {
  compactHeading: 'ここでコンテキストを圧縮しました',
  resetHeading: 'ここから新しい会話です',
  trigger: { manual: '手動', auto: '自動' } as Readonly<Record<string, string>>,
  tokens: (pre: string, post: string): string => `${pre} → ${post} トークン`,
  refusalFallback: (model: string): string =>
    `モデルが応答を拒否したため${model === '' ? '別のモデル' : ` ${model} `}に切り替えました`,
  refusalLocal: 'この応答だけ',
  refusalNoFallback: 'モデルが応答を拒否しました。言い直して送り直せます',
  refusalCategory: (label: string): string => `分類: ${label}`,
  /** 拒否の分類の訳 (知らない値は出さない)。 */
  categories: { cyber: 'サイバーセキュリティ', bio: '生物・化学' } as Readonly<
    Record<string, string>
  >
} as const

/**
 * 読み上げの文言 (O-6 / 016 data-model §4「読み上げ」)。固定の文言・既知の列挙・件数だけ (`content`・説明・`prompt`・パス・
 * Hook 名を入れない)。
 */
export const ANNOUNCER_LABELS = {
  toolError: (toolName: string): string => `${toolName} がエラーになりました`,
  toolErrors: (n: number): string => `${n} 件の tool がエラーになりました`,
  /** 登録済みでも形に合わない tool 名のときの呼び名。 */
  unknownTool: 'tool',
  hookEnded: (status: string): string => `Hook が${status}`,
  taskEnded: (status: string): string => `Background task が${status}`,
  mixed: (n: number): string => `${n} 件の知らせがあります`,
  compactBoundary: 'ここでコンテキストを圧縮しました',
  conversationReset: 'ここから新しい会話です',
  refusal: 'モデルが応答を拒否しました',
  prevented: 'ここで止まりました'
} as const

/** 圧縮の境界の `detail` (`<trigger> <pre> <post>`。`-` は読めなかった値。空は過去ログ) から見出しの文言を作る。 */
export function transcriptBoundaryHeading(
  category: 'compact-boundary' | 'conversation-reset',
  detail: string
): string {
  if (category === 'conversation-reset') return TRANSCRIPT_BOUNDARY_LABELS.resetHeading
  const base = TRANSCRIPT_BOUNDARY_LABELS.compactHeading
  const [trigger = '-', pre = '-', post = '-'] = detail.split(' ')
  const parts: string[] = []
  if (Object.hasOwn(TRANSCRIPT_BOUNDARY_LABELS.trigger, trigger)) {
    parts.push(TRANSCRIPT_BOUNDARY_LABELS.trigger[trigger] ?? '')
  }
  if (/^\d{1,16}$/.test(pre) && /^\d{1,16}$/.test(post)) {
    parts.push(
      TRANSCRIPT_BOUNDARY_LABELS.tokens(
        COUNT_FORMAT.format(Number(pre)),
        COUNT_FORMAT.format(Number(post))
      )
    )
  }
  return parts.length === 0 ? base : `${base} (${parts.join('、')})`
}

/** 拒否の分類の訳 (表に無い値・`-`・空は '')。 */
function refusalCategoryText(key: string): string {
  return Object.hasOwn(TRANSCRIPT_BOUNDARY_LABELS.categories, key)
    ? (TRANSCRIPT_BOUNDARY_LABELS.categories[key] ?? '')
    : ''
}

/**
 * 拒否の行の文 (`text`) と、モデルの説明・本文 (`body`。折り返して別の段に出す)。fallback は `name` がモデル名、`detail` が
 * `<direction> <scope> <category>` と、あれば空白 1 つの後に説明。no fallback は `name` が分類、`detail` が本文。
 */
export function refusalRowText(
  status: SystemEventStatus | null,
  name: string,
  detail: string
): { readonly text: string; readonly body: string } {
  if (status === 'fallback') {
    const m = /^(\S+) (\S+) (\S+)(?: ([\s\S]*))?$/.exec(detail)
    const scope = m?.[2] ?? '-'
    const category = refusalCategoryText(m?.[3] ?? '-')
    const text = [
      TRANSCRIPT_BOUNDARY_LABELS.refusalFallback(name),
      ...(scope === 'local' ? [`(${TRANSCRIPT_BOUNDARY_LABELS.refusalLocal})`] : []),
      ...(category === '' ? [] : [`/ ${TRANSCRIPT_BOUNDARY_LABELS.refusalCategory(category)}`])
    ].join(' ')
    return { text, body: m?.[4] ?? '' }
  }
  const category = refusalCategoryText(name)
  return {
    text:
      category === ''
        ? TRANSCRIPT_BOUNDARY_LABELS.refusalNoFallback
        : `${TRANSCRIPT_BOUNDARY_LABELS.refusalNoFallback} / ${TRANSCRIPT_BOUNDARY_LABELS.refusalCategory(category)}`,
    body: detail
  }
}

export const SYSTEM_EVENT_LABELS = {
  /**
   * 名前を伏せた Hook の行の見出し (O-11 / 019 data-model §1.3)。同じターン・同じ `hook_event` の中の出現順の番号で見分ける。
   * `hookEvent` は会話由来の 1 行 (テキストノードで描く)。空なら「Hook {n}」。
   */
  maskedHookHeading: (hookEvent: string, ordinal: number): string =>
    hookEvent === '' ? `Hook ${ordinal}` : `Hook (${hookEvent}) ${ordinal}`,
  /** 前景で始まって後から背景に移した task の行に添える印 (O-11 / 019 data-model §2.2 [ASSUMED])。 */
  backgroundedMark: '背景に移した',
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
  pluginFailed: (n: number): string => `導入に失敗しました (${COUNT_FORMAT.format(n)} 件)`,
  /** MCP サーバーの URL での手続きの完了の行 (O-10 / 018 data-model §5)。名前が空なら「MCP サーバー」。 */
  elicitationComplete: (serverName: string): string =>
    `${serverName === '' ? 'MCP サーバー' : serverName} の URL での手続きが終わりました`,
  /** 拒否の行のボタン (O-10 / US-4)。拒否された文を composer に戻す。送らない。 */
  retry: '編集して再試行'
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
  mcp_task: 'MCP のタスク',
  other: 'その他の task'
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
  /** 結果待ち (O-6 / 016 data-model §3。応答中・承認待ち)。 */
  pending: '結果待ち',
  /** 結果不明 (応答が終わった・中断した・終了・失敗・過去ログ・前のターン)。 */
  unknown: '結果不明',
  /** 結果が別のメッセージに表示されている (O-2 の 256 件の上限で分かれたとき)。 */
  elsewhere: '結果は別に表示',
  /** ToolFallback の見出し (016 data-model §4)。 */
  fallbackHeading: (toolName: string): string => `${toolName} を実行`,
  /** 見出しの tool 名 (太字) の後ろ。`fallbackHeading` と同じ文言。 */
  fallbackHeadingSuffix: ' を実行',
  /** ToolFallback の中身の見出し・状態の文言。 */
  fallbackResult: '結果',
  fallbackError: 'エラー',
  fallbackCancelled: '取り消されました',
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
 * ファイル・検索・Web・計画の tool の専用表示 (O-6 / 016 data-model §2・§4)。見出しの値 (パス・検索語・URL の host・
 * subject) は会話由来で、ここに置くのは固定の文言だけ。知らない値を引く表は `Object.hasOwn` で照合する。
 */
export const TOOL_DISPLAY_LABELS = {
  path: 'パス',
  result: '結果',
  prompt: 'prompt',
  url: 'URL',
  /** WebFetch の見出し (URL を読めないとき・http(s) でないとき・host が長すぎるとき)。 */
  urlHeading: 'URL',
  /** 結果が text でない・空のとき。 */
  emptyResult: 'text でない結果か、空の結果です',
  /** `Read` の範囲。 */
  readRange: (offset: number | null, limit: number | null): string => {
    if (offset !== null && limit !== null) return `${offset}〜${offset + limit} 行`
    if (offset !== null) return `${offset} 行目から`
    if (limit !== null) return `先頭 ${limit} 行`
    return ''
  },
  readPages: (pages: string): string => `ページ ${pages}`,
  /** `Grep` の `output_mode` の訳。知らない値は出さない。 */
  outputMode: {
    files_with_matches: 'ファイル名',
    content: '一致した行',
    count: '件数'
  } as Readonly<Record<string, string>>,
  more: (n: number): string => `ほか ${n} 件`,
  files: (n: number): string => `${n} 件のファイル`,
  domainRestriction: (n: number): string => `ドメイン制限 ${n} 件`,
  taskCreate: 'タスクを追加',
  taskUpdate: 'タスクを更新',
  taskGet: 'タスクを確認',
  taskList: 'タスクの一覧',
  taskId: (id: string): string => `タスク #${id}`,
  taskAdded: '追加した時点: 未着手',
  /** タスクの状態の対応 (`Object.hasOwn` で引く。知らない値は「不明」)。 */
  taskStatus: {
    pending: '未着手',
    in_progress: '進行中',
    completed: '完了',
    deleted: '削除'
  } as Readonly<Record<string, string>>,
  taskStatusUnknown: '不明',
  /** Agent plan。 */
  raw: '原文',
  planHidden: '表示されない部分があります。原文で確かめてください'
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
  composerPlaceholder: 'メッセージを入力',
  // ボタンの名前と tooltip (O-10 FR-013。018 data-model §5「文言」)。
  send: '送信',
  stop: '生成を止める',
  scrollToBottom: '最下部へ',
  startVoice: '音声入力を始める',
  stopVoice: '音声入力を止める',
  // スラッシュコマンドの候補 (O-10 FR-012)。
  commandCandidates: 'コマンドの候補',
  moreCommands: (n: number): string => `ほか ${n} 件`,
  // 「編集して再試行」で入力中の文を置き換える確認 (O-10 US-4 AC3)。
  retryReplaceTitle: '入力中の文を置き換えますか',
  retryReplace: '置き換える',
  retryCancel: '取り消す'
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
