import { isValidToolUseId } from './meter'
import { pathTail } from './path-tail'
import { isMcpName, isMeterModelId } from './session-init-report'
import { redactedBodyLine, SYSTEM_EVENT_NAME_MAX_CODE_POINTS } from './system-event'
import type { SystemEventCategory, SystemEventStatus, TranscriptMessageDTO } from './transcript-dto'

/**
 * 知らせの類の行 (O-12 / AD-060。規則の正本は
 * [data-model](../../../specs/022-ui-notices-checkpoints-and-content-blocks/data-model.md) §1)。**純粋関数**で、
 * 実行中 (`agents/live-signals.ts`) と過去ログ (`transcript.ts`) の両方が呼ぶ (変換の関数は 1 つ。FR-012)。
 * SDK も Electron も agents も import しない (Principle VII)。乱数を持たない (`fallbackId` は呼び出し元が渡す)。
 *
 * 12 の種類 (§1.3): O-6 の `informational`・`model_refusal_fallback`・`model_refusal_no_fallback`・`conversation_reset`、
 * O-10 の `elicitation_complete`、O-12 の `notification`・`local_command_output`・`tool_use_summary`・`active_goal`・
 * `mirror_error`・`memory_recall`・`files_persisted`。読まないフィールドの値は DTO に入らない。
 */

/* ── 行に使う値の照合 (016 data-model §1。`Object.hasOwn` の表で引き、外れたら `-`) ───── */

const DIRECTIONS: Readonly<Record<string, true>> = { retry: true, revert: true, sticky: true }
const SCOPES: Readonly<Record<string, true>> = { session: true, local: true }
const WARNING_LEVELS: Readonly<Record<string, true>> = { warning: true, suggestion: true }
const REFUSAL_CATEGORY_SHAPE = /^[a-z_-]{1,32}$/
const NOTIFICATION_KEY_SHAPE = /^[A-Za-z0-9_.:-]{1,64}$/
const MEMORY_MODES: Readonly<Record<string, true>> = { select: true, synthesize: true }

/** 名前の列の項目数の上限 (超えた分は最後に `+<N>`。§1.2)。 */
export const NOTICE_NAME_LIST_MAX_ITEMS = 20

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

/** 表の鍵に合う文字列ならそれ、そうでなければ `-` (`constructor` / `__proto__` / 空白を含む値を通さない)。 */
export function pickKey(table: Readonly<Record<string, true>>, raw: unknown): string {
  return typeof raw === 'string' && Object.hasOwn(table, raw) ? raw : '-'
}

/** 0 以上の安全な整数なら文字列、そうでなければ `-`。 */
export function countToken(raw: unknown): string {
  return typeof raw === 'number' && Number.isSafeInteger(raw) && raw >= 0 ? String(raw) : '-'
}

/** 拒否の分類。形の検査を通ったときだけ (外れたら '')。 */
function refusalCategory(raw: unknown): string {
  return typeof raw === 'string' && REFUSAL_CATEGORY_SHAPE.test(raw) ? raw : ''
}

function row(
  id: string,
  category: SystemEventCategory,
  detail: string,
  status: SystemEventStatus | null,
  name: string,
  createdAt: number | null
): TranscriptMessageDTO {
  return {
    id,
    role: 'system',
    parts: [{ type: 'system-event', category, opens: true, name, detail, status }],
    createdAt
  }
}

/** `<prefix>:<uuid>` (uuid が形を通れば) / `<prefix>:<fallbackId>`。 */
function idOf(prefix: string, uuid: unknown, fallbackId: string): string {
  return `${prefix}:${isValidToolUseId(uuid) ? uuid : fallbackId}`
}

/** 名前の列 (§1.2): 各項目を `redactedBodyLine` に通し、空を除いて改行で連ね、20 件まで。超えた分は最後に `+<N>`。 */
function nameList(items: readonly unknown[]): string {
  const lines: string[] = []
  for (const item of items) {
    const line = redactedBodyLine(item, SYSTEM_EVENT_NAME_MAX_CODE_POINTS)
    if (line !== '') lines.push(line)
  }
  const shown = lines.slice(0, NOTICE_NAME_LIST_MAX_ITEMS)
  const rest = lines.length - shown.length
  if (rest > 0) shown.push(`+${rest}`)
  return shown.join('\n')
}

function arrayOf(raw: unknown): readonly unknown[] {
  return Array.isArray(raw) ? (raw as readonly unknown[]) : []
}

/** `https://` で始まり URL として読めるなら host。 */
function httpsHost(path: string): string | null {
  if (!path.startsWith('https://')) return null
  try {
    const host = new URL(path).host
    return host === '' ? null : host
  } catch {
    return null
  }
}

/* ── 種類ごとの規則 (§1.3) ───── */

function informational(
  r: Record<string, unknown>,
  createdAt: number | null
): TranscriptMessageDTO | null {
  const uuid = r.uuid
  if (!isValidToolUseId(uuid)) return null
  const toolUseId = r.tool_use_id
  const id = isValidToolUseId(toolUseId) ? `info:${toolUseId}` : `info:${uuid}`
  const status: SystemEventStatus =
    r.prevent_continuation === true
      ? 'prevented'
      : typeof r.level === 'string' && Object.hasOwn(WARNING_LEVELS, r.level)
        ? 'warning'
        : 'notice'
  return row(id, 'informational', redactedBodyLine(r.content), status, '', createdAt)
}

function refusalFallback(
  r: Record<string, unknown>,
  createdAt: number | null
): TranscriptMessageDTO | null {
  const uuid = r.uuid
  if (!isValidToolUseId(uuid)) return null
  const scope = r.scope === undefined || r.scope === null ? 'session' : pickKey(SCOPES, r.scope)
  const category = refusalCategory(r.api_refusal_category)
  const head = `${pickKey(DIRECTIONS, r.direction)} ${scope} ${category === '' ? '-' : category}`
  // 説明は先頭の 3 トークンと空白 1 つを除いた残りの長さで切り詰める (`detail` 全体が 120 コードポイントを超えない)。
  const explanation = redactedBodyLine(
    r.api_refusal_explanation,
    SYSTEM_EVENT_NAME_MAX_CODE_POINTS - head.length - 1
  )
  const detail = explanation === '' ? head : `${head} ${explanation}`
  const model = isMeterModelId(r.fallback_model) ? r.fallback_model : ''
  return row(`refusal:${uuid}`, 'refusal', detail, 'fallback', model, createdAt)
}

function refusalNoFallback(
  r: Record<string, unknown>,
  createdAt: number | null
): TranscriptMessageDTO | null {
  const uuid = r.uuid
  if (!isValidToolUseId(uuid)) return null
  const texts = [r.content, r.api_refusal_explanation].filter(
    (v): v is string => typeof v === 'string' && v !== ''
  )
  const detail = redactedBodyLine(texts.join('\n'))
  // 拒否された入力の uuid は値を運ばず、有無だけを status に写す (O-10 / US-4)。
  const refused = r.refused_user_message_uuid
  const status: SystemEventStatus =
    typeof refused === 'string' && refused !== '' ? 'no-fallback-retry' : 'no-fallback'
  return row(
    `refusal:${uuid}`,
    'refusal',
    detail,
    status,
    refusalCategory(r.api_refusal_category),
    createdAt
  )
}

function conversationReset(
  r: Record<string, unknown>,
  createdAt: number | null
): TranscriptMessageDTO | null {
  // 読むのは `uuid` だけ (`new_conversation_id` は読まない。016 data-model §1)。
  const uuid = r.uuid
  if (!isValidToolUseId(uuid)) return null
  return row(`reset:${uuid}`, 'conversation-reset', '', 'marked', '', createdAt)
}

function elicitationComplete(
  r: Record<string, unknown>,
  createdAt: number | null,
  fallbackId: string
): TranscriptMessageDTO {
  const id = idOf('elicitation', r.elicitation_id, fallbackId)
  const name = isMcpName(r.mcp_server_name) ? r.mcp_server_name : ''
  return row(id, 'elicitation', '', 'completed', name, createdAt)
}

function notification(
  r: Record<string, unknown>,
  createdAt: number | null,
  fallbackId: string
): TranscriptMessageDTO {
  const key = r.key
  const id =
    typeof key === 'string' && NOTIFICATION_KEY_SHAPE.test(key)
      ? `notification:${key}`
      : idOf('notification', r.uuid, fallbackId)
  const status: SystemEventStatus =
    r.priority === 'high' || r.priority === 'immediate' ? 'warning' : 'notice'
  return row(id, 'notification', redactedBodyLine(r.text), status, '', createdAt)
}

function activeGoal(
  r: Record<string, unknown>,
  createdAt: number | null,
  fallbackId: string
): TranscriptMessageDTO | null {
  const id = idOf('goal', r.uuid, fallbackId)
  if (r.value === null) return row(id, 'active-goal', '', 'completed', '', createdAt)
  const value = asRecord(r.value)
  if (value === null) return null
  return row(id, 'active-goal', redactedBodyLine(value.condition), 'notice', '', createdAt)
}

function memoryRecall(
  r: Record<string, unknown>,
  createdAt: number | null,
  fallbackId: string
): TranscriptMessageDTO {
  const names: string[] = []
  const counts = { personal: 0, team: 0, organization: 0 }
  let syntheses = 0
  let total = 0
  for (const item of arrayOf(r.memories)) {
    const memory = asRecord(item)
    if (memory === null) continue
    total += 1
    if (memory.scope === 'personal') counts.personal += 1
    else if (memory.scope === 'team') counts.team += 1
    else if (memory.scope === 'organization') counts.organization += 1
    const path = memory.path
    if (typeof path !== 'string') continue
    if (path.startsWith('<synthesis:')) {
      syntheses += 1
      continue
    }
    // `path` そのものは DTO に入れない (末尾の要素か host だけ。FR-005)。
    names.push(httpsHost(path) ?? pathTail(path))
  }
  const mode = pickKey(MEMORY_MODES, r.mode)
  const detail = `${mode} ${total} ${counts.personal} ${counts.team} ${counts.organization} ${syntheses}`
  return row(
    idOf('memory', r.uuid, fallbackId),
    'memory-recall',
    detail,
    'notice',
    nameList(names),
    createdAt
  )
}

function filenamesOf(raw: unknown): unknown[] {
  return arrayOf(raw).map((item) => asRecord(item)?.filename)
}

function filesPersisted(
  r: Record<string, unknown>,
  createdAt: number | null,
  fallbackId: string
): TranscriptMessageDTO | null {
  const files = arrayOf(r.files)
  const failed = arrayOf(r.failed)
  if (files.length === 0 && failed.length === 0) return null
  const head = `${countToken(files.length)} ${countToken(failed.length)}`
  const firstError =
    failed.length > 0
      ? redactedBodyLine(
          asRecord(failed[0])?.error,
          SYSTEM_EVENT_NAME_MAX_CODE_POINTS - head.length - 1
        )
      : ''
  const detail = firstError === '' ? head : `${head} ${firstError}`
  return row(
    idOf('files-persisted', r.uuid, fallbackId),
    'files-persisted',
    detail,
    failed.length > 0 ? 'failed' : 'completed',
    nameList([...filenamesOf(files), ...filenamesOf(failed)]),
    createdAt
  )
}

/**
 * SDK のメッセージ (実行中) / 過去ログの記録の message (未信頼) → 知らせの行。12 の種類のどれでもなければ `null`
 * (呼び出し元が今の経路に戻す)。合成は呼び出し元が `mergeSystemEvent` で行う。
 */
export function toNoticeRow(
  raw: unknown,
  createdAt: number | null,
  fallbackId: string
): TranscriptMessageDTO | null {
  const r = asRecord(raw)
  if (r === null) return null
  const kind = r.type === 'system' ? r.subtype : r.type
  if (typeof kind !== 'string') return null
  switch (kind) {
    case 'informational':
      return informational(r, createdAt)
    case 'model_refusal_fallback':
      return refusalFallback(r, createdAt)
    case 'model_refusal_no_fallback':
      return refusalNoFallback(r, createdAt)
    case 'conversation_reset':
      return conversationReset(r, createdAt)
    case 'elicitation_complete':
      return elicitationComplete(r, createdAt, fallbackId)
    case 'notification':
      return notification(r, createdAt, fallbackId)
    case 'local_command_output':
      return row(
        idOf('local-command', r.uuid, fallbackId),
        'local-command-output',
        redactedBodyLine(r.content),
        'notice',
        '',
        createdAt
      )
    case 'tool_use_summary':
      return row(
        idOf('summary', r.uuid, fallbackId),
        'tool-use-summary',
        redactedBodyLine(r.summary),
        'notice',
        '',
        createdAt
      )
    case 'active_goal':
      return activeGoal(r, createdAt, fallbackId)
    case 'mirror_error':
      return row(
        idOf('mirror-error', r.uuid, fallbackId),
        'mirror-error',
        redactedBodyLine(r.error),
        'failed',
        '',
        createdAt
      )
    case 'memory_recall':
      return memoryRecall(r, createdAt, fallbackId)
    case 'files_persisted':
      return filesPersisted(r, createdAt, fallbackId)
    default:
      return null
  }
}
