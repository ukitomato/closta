import { sanitizeBody } from './sanitize-body'
import {
  SYSTEM_EVENT_STATUSES,
  type SystemEventCategory,
  type SystemEventStatus,
  type TranscriptMessageDTO,
  type TranscriptPartDTO
} from './transcript-dto'

/**
 * Hook / Background task のシステムメッセージ → transcript の 1 行 (O-2 / FR-008・FR-009。
 * [data-model](../../../specs/011-ui-coverage/data-model.md) §2 が許可リストの正本)。**純粋関数**で、実行中の
 * セッションスレッド (`sdk-agent-session.ts`) と過去ログの変換 (`transcript.ts`) の両方で使う。SDK を import しない。
 *
 * | 規則 | 根拠 |
 * |---|---|
 * | 変換するのは `hook_started` / `hook_response` / `task_started` / `task_updated` / `task_notification` だけ | FR-008 |
 * | Hook の出力本文・終了コード、task の prompt・要約・出力ファイル・更新の説明は読まない | data-model §2 |
 * | task は背景で始まったもの (`is_backgrounded` が true、ambient でも隠すものでもない) だけを行にする | data-model §2 |
 * | 行を作れるのは開始 (と Hook の応答) だけ。後続は同じ id の行に合成し、行の無い id への更新は捨てる | FR-009 |
 * | 状態の一覧は持たない (状態は transcript のメッセージの中にだけある) | USER 決定 2026-10-03 |
 * | O-4 の行 (API の再試行・圧縮・権限モード) と task の進み具合の `detail` の符号化・復号・合成はここ。行の組み立て (いつ・どの id で作るか) は agents (`live-signals.ts`) で、`toSystemEventMessage` には足さない | 014 data-model §3 |
 */

/** 名前と detail の長さ (コードポイント)。 */
export const SYSTEM_EVENT_NAME_MAX_CODE_POINTS = 120

type SystemEventPart = Extract<TranscriptPartDTO, { type: 'system-event' }>

function asRecord(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : null
}

/** 会話由来の文字列を 1 行の plain text にする (無害化・空白の畳み込み・切り詰め)。文字列でなければ ''。 */
function oneLine(raw: unknown): string {
  if (typeof raw !== 'string') return ''
  const line = sanitizeBody(raw, 4_096).value.replace(/\s+/g, ' ').trim()
  const points = Array.from(line)
  return points.length > SYSTEM_EVENT_NAME_MAX_CODE_POINTS
    ? `${points.slice(0, SYSTEM_EVENT_NAME_MAX_CODE_POINTS).join('')}…`
    : line
}

/**
 * コマンドの文字列として秘密を含みうるか (data-model §4 と同じ判定。Hook の名前 `hook_name` に使う)。
 * クォート・バックスラッシュ・`$`・backtick・`(`、環境変数の代入、既知の秘密の接頭辞のどれかがあれば true。
 */
export function mayCarrySecret(text: string): boolean {
  if (/["'\\$`(]/.test(text)) return true
  if (/(^|\s)[A-Za-z_][A-Za-z0-9_]*=/.test(text)) return true
  return /(^|[^A-Za-z0-9])(sk-|ghp_|gho_|glpat-|AIza|xox)/.test(text)
}

/**
 * Hook の名前として出してよい形 (allowlist。pr-gate R2 security L-101)。Claude Code の `hook_name` は
 * `<hook_event>:<matcher>` (`PreToolUse:Bash` / `PostToolUse:Edit|Write` / `SessionStart:startup` など) か
 * 短い識別子なので、英数字と `_.*|-` の語を `:` でつないだ形だけを通す。空白・`/`・`@`・`=` を含むもの
 * (コマンド・`Bearer` の header・URL の資格情報) と、120 コードポイントで切り詰めた (`…` の付いた) ものは出さない。
 */
const HOOK_NAME_SHAPE = /^[\w.*|-]+(?::[\w.*|-]*)*$/

/** 会話由来の `hook_name` を出してよい名前にする。形が allowlist に合い、秘密を含みうる形でもないときだけ。 */
function hookNameOf(raw: unknown): string {
  const name = oneLine(raw)
  return HOOK_NAME_SHAPE.test(name) && !mayCarrySecret(name) ? name : ''
}

const STATUS_SET: ReadonlySet<string> = new Set(SYSTEM_EVENT_STATUSES)

/** 値があれば理由キーに (知らない値は `unknown`)、無ければ `null`。 */
function toStatus(raw: unknown): SystemEventStatus | null {
  if (typeof raw !== 'string') return null
  return STATUS_SET.has(raw) ? (raw as SystemEventStatus) : 'unknown'
}

const HOOK_OUTCOMES: Readonly<Record<string, SystemEventStatus>> = {
  success: 'succeeded',
  error: 'failed',
  cancelled: 'cancelled'
}

function message(
  id: string,
  part: SystemEventPart,
  createdAt: number | null
): TranscriptMessageDTO {
  return { id, role: 'system', parts: [part], createdAt }
}

function part(
  category: SystemEventCategory,
  opens: boolean,
  name: string,
  detail: string,
  status: SystemEventStatus | null
): SystemEventPart {
  return { type: 'system-event', category, opens, name, detail, status }
}

/**
 * SDK のシステムメッセージ (未信頼) を 1 行の DTO にする。対象外の subtype・許可の条件に合わないものは `null`。
 * 行の id は `hook:<hook_id>` / `task:<task_id>`。
 */
export function toSystemEventMessage(
  raw: unknown,
  createdAt: number | null = null
): TranscriptMessageDTO | null {
  const m = asRecord(raw)
  if (!m || m.type !== 'system') return null
  switch (m.subtype) {
    case 'hook_started':
    case 'hook_response': {
      if (typeof m.hook_id !== 'string' || m.hook_id === '') return null
      const status =
        m.subtype === 'hook_started'
          ? 'started'
          : typeof m.outcome === 'string' && Object.hasOwn(HOOK_OUTCOMES, m.outcome)
            ? (HOOK_OUTCOMES[m.outcome] ?? 'unknown')
            : 'unknown'
      // hook_name は Hook の設定のコマンドになりうる (`TOKEN=... cmd` など)。allowlist の形に合わない・秘密を
      // 含みうるなら名前を出さず、行は hook_event と状態だけで描く (pr-gate R1 security L-001 / R2 L-101)。
      return message(
        `hook:${m.hook_id}`,
        part('hook', true, hookNameOf(m.hook_name), oneLine(m.hook_event), status),
        createdAt
      )
    }
    case 'task_started': {
      if (typeof m.task_id !== 'string' || m.task_id === '') return null
      if (m.skip_transcript === true || m.ambient === true || m.is_backgrounded !== true)
        return null
      const taskType = oneLine(m.task_type)
      // local_bash の説明はコマンドそのもの。秘密の判定は URL の資格情報・`Bearer` などを通すので使わず、
      // 名前は常に出さない (コマンド全体は Bash の呼び出しの表示に出ている。pr-gate R1 security L-002)。
      const name = taskType === 'local_bash' ? '' : oneLine(m.description)
      return message(`task:${m.task_id}`, part('task', true, name, taskType, 'running'), createdAt)
    }
    case 'task_updated': {
      if (typeof m.task_id !== 'string' || m.task_id === '') return null
      const patch = asRecord(m.patch)
      return message(
        `task:${m.task_id}`,
        part('task', false, '', '', toStatus(patch?.status)),
        createdAt
      )
    }
    case 'task_notification': {
      if (typeof m.task_id !== 'string' || m.task_id === '') return null
      if (m.skip_transcript === true) return null
      return message(
        `task:${m.task_id}`,
        part('task', false, '', '', toStatus(m.status)),
        createdAt
      )
    }
    default:
      return null
  }
}

/** メッセージの最初の part がシステムイベントならそれを返す。 */
export function systemEventPartOf(msg: TranscriptMessageDTO | undefined): SystemEventPart | null {
  const first = msg?.parts[0]
  return first !== undefined && first.type === 'system-event' ? first : null
}

/**
 * 合成した後の `detail`。task の行で次の `detail` が改行で始まる (進み具合だけの更新。O-4 / 014 data-model §3) ときは、
 * 前の `detail` の最初の改行より前 (task の種類) + 改行 + 次の `detail` の改行より後 (進み具合) にする。
 * それ以外は空でなければ次の値 (O-2 のまま)。`oneLine` は空白を畳むので、開始の行と過去ログの `detail` は改行を含まない。
 */
function mergedDetail(prev: SystemEventPart, next: SystemEventPart): string {
  if (prev.category === 'task' && next.detail.startsWith('\n')) {
    const taskType = prev.detail.split('\n', 1)[0] ?? ''
    return `${taskType}\n${next.detail.slice(1)}`
  }
  return next.detail !== '' ? next.detail : prev.detail
}

/**
 * 同じ id の行への合成 (FR-009。規則の正本はここだけ)。
 * - 前の行が無い: `next.opens` なら行を作る (`next` を返す)。そうでなければ捨てる (`null`)
 * - 前の行がある: `status` は `next` が null でなければ `next`、`name` は空でなければ `next`、`detail` は `mergedDetail`、
 *   `opens` は前のまま
 */
export function mergeSystemEvent(
  prev: TranscriptMessageDTO | undefined,
  next: TranscriptMessageDTO
): TranscriptMessageDTO | null {
  const nextPart = systemEventPartOf(next)
  if (nextPart === null) return next
  const prevPart = systemEventPartOf(prev)
  if (prev === undefined || prevPart === null) return nextPart.opens ? next : null
  return {
    ...prev,
    parts: [
      {
        ...prevPart,
        status: nextPart.status ?? prevPart.status,
        name: nextPart.name !== '' ? nextPart.name : prevPart.name,
        detail: mergedDetail(prevPart, nextPart)
      }
    ]
  }
}

/** 終わりを表す状態か (それ以外の行は、セッションの終了後と過去ログで「結果不明」と描く)。 */
export function isTerminalSystemEventStatus(status: SystemEventStatus | null): boolean {
  return (
    status === 'succeeded' ||
    status === 'failed' ||
    status === 'cancelled' ||
    status === 'completed' ||
    status === 'killed' ||
    status === 'stopped' ||
    status === 'changed'
  )
}

/* ── O-4 の行の `detail` の符号化と復号 (014 data-model §3。part の形は変えない) ───── */

/** 安全な整数で 0 以上なら文字列に、そうでなければ null。 */
function intText(raw: unknown): string | null {
  return typeof raw === 'number' && Number.isSafeInteger(raw) && raw >= 0 ? String(raw) : null
}

/** `\d+` の 1 つを安全な整数に読む。読めなければ null。 */
function readInt(text: string): number | null {
  const n = Number(text)
  return Number.isSafeInteger(n) ? n : null
}

/** API の再試行の行の中身 (`api_retry` の 4 つの数。エラーの中身は持たない)。 */
export interface RetryDetail {
  readonly attempt: number
  readonly maxRetries: number
  /** HTTP の状態。無い・整数でないときは null (符号化では `-`)。 */
  readonly errorStatus: number | null
  readonly retryDelayMs: number
}

/** `api_retry` の 4 つの値 (未信頼。SDK の `attempt` / `max_retries` / `error_status` / `retry_delay_ms`)。 */
export interface RetryDetailInput {
  readonly attempt: unknown
  readonly maxRetries: unknown
  readonly errorStatus: unknown
  readonly retryDelayMs: unknown
}

/**
 * `api_retry` の値 (未信頼) → 再試行の行の `detail` (`<attempt>/<max_retries>/<error_status>/<retry_delay_ms>`)。
 * 各値は 0 以上の安全な整数で、外れたら 0。`error_status` が null・整数でなければ `-`。
 */
export function encodeRetryDetail(raw: RetryDetailInput): string {
  const attempt = intText(raw.attempt) ?? '0'
  const maxRetries = intText(raw.maxRetries) ?? '0'
  const errorStatus = intText(raw.errorStatus) ?? '-'
  const retryDelayMs = intText(raw.retryDelayMs) ?? '0'
  return `${attempt}/${maxRetries}/${errorStatus}/${retryDelayMs}`
}

const RETRY_DETAIL_SHAPE = /^(\d{1,16})\/(\d{1,16})\/(\d{1,16}|-)\/(\d{1,16})$/

/** 再試行の行の `detail` → 4 つの数。形が合わなければ null (detail を出さない)。 */
export function decodeRetryDetail(detail: string): RetryDetail | null {
  const m = RETRY_DETAIL_SHAPE.exec(detail)
  if (m === null) return null
  const [, attemptText = '', maxText = '', statusText = '', delayText = ''] = m
  const attempt = readInt(attemptText)
  const maxRetries = readInt(maxText)
  const errorStatus = statusText === '-' ? null : readInt(statusText)
  const retryDelayMs = readInt(delayText)
  if (attempt === null || maxRetries === null || retryDelayMs === null) return null
  if (statusText !== '-' && errorStatus === null) return null
  return { attempt, maxRetries, errorStatus, retryDelayMs }
}

/** task の進み具合 (`task_progress` の `usage` の 3 つの数)。 */
export interface TaskProgress {
  readonly tokens: number
  readonly tools: number
  readonly durationMs: number
}

/** `task_progress` の `usage` の 3 つの値 (未信頼。SDK の `total_tokens` / `tool_uses` / `duration_ms`)。 */
export interface TaskProgressInput {
  readonly totalTokens: unknown
  readonly toolUses: unknown
  readonly durationMs: unknown
}

/**
 * `task_progress` の `usage` の値 (未信頼) → task の行の進み具合だけの更新の `detail` (`\n<total_tokens>/<tool_uses>/<duration_ms>`)。
 * 先頭の改行が「進み具合だけの更新」の印で、`mergeSystemEvent` が前の行の種類と合成する。外れた値は 0。
 */
export function encodeTaskProgress(raw: TaskProgressInput): string {
  const tokens = intText(raw.totalTokens) ?? '0'
  const tools = intText(raw.toolUses) ?? '0'
  const durationMs = intText(raw.durationMs) ?? '0'
  return `\n${tokens}/${tools}/${durationMs}`
}

const TASK_PROGRESS_SHAPE = /^(\d{1,16})\/(\d{1,16})\/(\d{1,16})$/

/** task の行の `detail` を分けたもの。 */
export interface TaskDetail {
  /** SDK の `task_type` (renderer が `taskTypeLabel` で訳す)。 */
  readonly taskType: string
  readonly progress: TaskProgress | null
}

/**
 * task の行の `detail` → 種類 (`task_type`) と進み具合。改行が無ければ進み具合は null。改行の後ろが形に合わなければ
 * 進み具合は null (種類だけを描く)。
 */
export function splitTaskDetail(detail: string): TaskDetail {
  const newline = detail.indexOf('\n')
  if (newline < 0) return { taskType: detail, progress: null }
  const taskType = detail.slice(0, newline)
  const m = TASK_PROGRESS_SHAPE.exec(detail.slice(newline + 1))
  if (m === null) return { taskType, progress: null }
  const [, tokensText = '', toolsText = '', durationText = ''] = m
  const tokens = readInt(tokensText)
  const tools = readInt(toolsText)
  const durationMs = readInt(durationText)
  if (tokens === null || tools === null || durationMs === null) return { taskType, progress: null }
  return { taskType, progress: { tokens, tools, durationMs } }
}
