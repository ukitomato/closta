import type { FailureReason } from './target'

/**
 * transcript 表示の JSON-safe な DTO (R-3 / [AD-034](../../../docs/decisions/0034-transcript-read-path-and-process-boundary.md))。
 *
 * **`domain` は assistant-ui を import しない** — レイヤ境界であり、かつ変換は取得プロセス
 * (`src/agents/`。electron/native 非依存) で走るため。renderer が本 DTO を assistant-ui の
 * `ThreadMessageLike` へ変換する (`src/renderer/src/features/chat/convert.ts` の `toThreadMessage`)。
 *
 * **本文は `MessageChannelMain` の port で取得プロセス↔renderer を直通**する (AD-034 決定 1)。
 * main はこの DTO を保持・`JSON.parse`・deserialize しない。
 */

/** transcript の 1 メッセージ内の表示パート ([data-model.md](../../../specs/003-ui-transcript-rendering/data-model.md) §2 / §3)。 */
export type TranscriptPartDTO =
  | { readonly type: 'text'; readonly text: string }
  | { readonly type: 'reasoning'; readonly text: string }
  | {
      readonly type: 'tool-call'
      readonly toolCallId: string
      readonly toolName: string
      /**
       * 入力を JSON 文字列で運ぶ (fallback 表示がそのまま出す)。パース失敗時は生文字列。
       * **R-4: `sanitizeBody` (bidi/C1 除去 + byte 上限) 済み** — 5 専用表示の主コンテンツ (command / old-new /
       * content / plan / prompt) が argsText 由来のため、bidi 表示偽装と巨大 args の DoS を取得プロセス側で塞ぐ
       * (R-4 / FR-012 / design-gate H-1)。
       */
      readonly argsText: string
      /** tool_result 本文 (サニタイズ済み)。未応答の tool_use は `null`。 */
      readonly result: string | null
      readonly isError: boolean
      /** argsText または result が本文上限で切り詰められたか (R-4 / FR-017 / design-gate H-2)。 */
      readonly truncated: boolean
      /**
       * subagent (Task) 配下メッセージの入れ子 (R-4 / FR-005 / US-2)。`parent_tool_use_id` == 当該 Task の
       * `tool_use.id` で対応づく (research R-02)。Task 以外・非 subagent の tool は空配列。
       * 深さ打ち切りと循環検出は `transcript.ts` の純粋関数が行う (data-model §4)。
       */
      readonly children: readonly TranscriptMessageDTO[]
    }
  | { readonly type: 'image'; readonly url: string }
  | { readonly type: 'file'; readonly filename: string; readonly mediaType: DocumentMediaType }
  /**
   * サーバー側の tool (`server_tool_use` とその結果のブロック。O-12 / FR-008。data-model §2.1)。
   * `result` は同じ id の結果のブロックで埋める (§2.3)。対応の無い結果だけのときは `toolName` / `argsText` が空。
   */
  | {
      readonly type: 'server-tool-call'
      readonly toolCallId: string
      readonly toolName: string
      readonly argsText: string
      readonly truncated: boolean
      readonly result: ServerToolResultDTO | null
    }
  /** 専用の表示を持たない content block の種類の名前だけの印 (O-12 / FR-011。中身は運ばない)。 */
  | { readonly type: 'unsupported-block'; readonly blockType: string }
  /** コンパクション境界などの最小の区切り (FR-018)。 */
  | { readonly type: 'divider'; readonly label: string }
  /**
   * Hook / Background task のシステムイベントの行 (O-2 / FR-008・FR-009。[data-model](../../../specs/011-ui-coverage/data-model.md) §2)。
   * 1 つの Hook / task は 1 行で、同じ id の後続は `mergeSystemEvent` で合成する。状態の一覧は持たない。
   * O-4 が API の再試行・コンテキストの圧縮・権限モードの行を足した (実行中だけ。
   * [014 data-model](../../../specs/014-ui-metering-and-limits/data-model.md) §3)。
   */
  | {
      readonly type: 'system-event'
      readonly category: SystemEventCategory
      /** 行を作ってよいイベントか (hook_started / hook_response / task_started と O-4 の行の開始だけ true)。 */
      readonly opens: boolean
      /** Hook: hook_name / task: description (無害化・1 行・120 コードポイント)。無ければ ''。O-4 の行は常に ''。 */
      readonly name: string
      /**
       * Hook: hook_event / task: task_type (進み具合は改行の後ろ。`splitTaskDetail`) / api-retry: `encodeRetryDetail` /
       * permission-mode: 権限モードの鍵 / compaction: '' / auth: 常に '' / plugin: `encodePluginDetail`
       * (導入できた数・できなかった数・最後のマーケットプレイスの名前。O-5 / 015 data-model §4)。無ければ ''。
       */
      readonly detail: string
      /** 無ければ null (task_updated の patch.status は任意)。 */
      readonly status: SystemEventStatus | null
    }

export const SYSTEM_EVENT_CATEGORIES = [
  'hook',
  'task',
  'api-retry',
  'compaction',
  'permission-mode',
  'auth',
  'plugin',
  'compact-boundary',
  'conversation-reset',
  'refusal',
  'informational',
  /** MCP の URL での手続きの完了 (O-10 / AD-053。`elicitation_complete`)。 */
  'elicitation',
  /** 前景で始まって後から背景に移った task (O-11 / AD-056。`task_updated` の `patch.is_backgrounded`)。 */
  'backgrounded-task',
  /** 知らせの類 (O-12 / AD-060。`notice-rows.ts` の `toNoticeRow`)。 */
  'notification',
  'local-command-output',
  'tool-use-summary',
  'active-goal',
  'mirror-error',
  'memory-recall',
  'files-persisted'
] as const
export type SystemEventCategory = (typeof SYSTEM_EVENT_CATEGORIES)[number]

/** システムイベントの行の状態の理由キー (訳は renderer の `features/chat/labels.ts`)。 */
export const SYSTEM_EVENT_STATUSES = [
  'started',
  'succeeded',
  'failed',
  'cancelled',
  'pending',
  'running',
  'completed',
  'killed',
  'paused',
  'stopped',
  'unknown',
  'retrying',
  'compacting',
  'changed',
  'authenticating',
  'marked',
  'fallback',
  'no-fallback',
  /** 拒否の行のうち、拒否された利用者の入力が分かるもの (O-10 / US-4。「編集して再試行」を出す印。表示は `no-fallback` と同じ)。 */
  'no-fallback-retry',
  'prevented',
  'warning',
  'notice'
] as const
/** 行の状態の理由キー (Hook / task の状態と、本 feature (O-6) の行の見た目の段階)。 */
export type SystemEventStatus = (typeof SYSTEM_EVENT_STATUSES)[number]

export type TranscriptMessageRole = 'user' | 'assistant' | 'system'

/** transcript の 1 メッセージ。`ThreadMessageLike` へ 1:1 で写せる形。 */
export interface TranscriptMessageDTO {
  /**
   * SDK の `uuid`、または接頭辞つきの合成 id (`hook:<hook_id>` / `task:<task_id>` / `result:<tool_use_id>`。O-2)。
   * 行の同一性と仮想化の key に使う。
   */
  readonly id: string
  readonly role: TranscriptMessageRole
  readonly parts: readonly TranscriptPartDTO[]
  /** epoch ms。取得できないときは `null`。出所と検査は AD-051 (O-9)。表示だけに使い、並べ替えに使わない。 */
  readonly createdAt: number | null
}

/**
 * transcript 取得の handshake (IPC invoke の戻り。**本文を含まない**。AD-034 決定 1)。
 *
 * 本文 (`TranscriptMessageDTO[]`) は port2 経由で届く。invoke はこの軽量メタのみを返す。
 */
export type TranscriptHandshakeDTO =
  | { readonly status: 'streaming'; readonly requestToken: string }
  | { readonly status: 'empty'; readonly requestToken: string }
  | { readonly status: 'failed'; readonly requestToken: string; readonly reasonKey: FailureReason }

/** port2 で取得プロセスから renderer へ届く本文フレーム。 */
export type TranscriptFrameDTO =
  | {
      readonly kind: 'messages'
      readonly requestToken: string
      readonly messages: readonly TranscriptMessageDTO[]
    }
  | { readonly kind: 'error'; readonly requestToken: string; readonly reasonKey: FailureReason }

/** 添付の文書の種類 (`source.type` から決める。data-model §2.1。不明は '')。 */
export type DocumentMediaType = 'application/pdf' | 'text/plain' | ''

/** サーバー側の tool の結果 (data-model §2.1)。 */
export type ServerToolResultDTO =
  | {
      readonly kind: 'web-search'
      readonly sources: readonly WebSourceDTO[]
      readonly omitted: number
    }
  | { readonly kind: 'error'; readonly errorCode: string }
  | { readonly kind: 'unsupported'; readonly blockType: string }

/** サーバー側の検索の結果の 1 項目 (タイトルと URL だけ。`url` は http(s) の形だけ。外れたら '')。 */
export interface WebSourceDTO {
  readonly title: string
  readonly url: string
}

/**
 * `TranscriptPartDTO` の各 variant の許可フィールド (SC-009 の割り当て台帳の機械検証)。
 * **表示する生の逐語を運ぶフィールドを固定する** — 増えたらスキーマ検査が落ちる。
 */
export const TRANSCRIPT_PART_FIELDS = {
  text: ['type', 'text'],
  reasoning: ['type', 'text'],
  'tool-call': [
    'type',
    'toolCallId',
    'toolName',
    'argsText',
    'result',
    'isError',
    'truncated',
    'children'
  ],
  image: ['type', 'url'],
  file: ['type', 'filename', 'mediaType'],
  'server-tool-call': ['type', 'toolCallId', 'toolName', 'argsText', 'truncated', 'result'],
  'unsupported-block': ['type', 'blockType'],
  divider: ['type', 'label'],
  'system-event': ['type', 'category', 'opens', 'name', 'detail', 'status']
} as const satisfies {
  [K in TranscriptPartDTO['type']]: readonly (keyof Extract<TranscriptPartDTO, { type: K }>)[]
}

/** `TranscriptMessageDTO` の許可フィールド (SC-009)。 */
export const TRANSCRIPT_MESSAGE_FIELDS = [
  'id',
  'role',
  'parts',
  'createdAt'
] as const satisfies readonly (keyof TranscriptMessageDTO)[]
