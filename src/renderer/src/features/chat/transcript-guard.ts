import {
  SYSTEM_EVENT_CATEGORIES,
  SYSTEM_EVENT_STATUSES,
  type TranscriptMessageDTO,
  type TranscriptPartDTO
} from '@domain/session/transcript-dto'

/**
 * transcript の本文 (未信頼) の形の検証 (O-2 / data-model §2「renderer の検証」/ design-gate R2 security L-101)。
 *
 * 実行中の decoder (`session-event-decoder.ts`) と過去ログの frame の受け口 (`useTranscript.ts`) の**両方**で使う。
 * 本文の無害化は agents / domain が済ませているので、ここは**形だけ**を見る。
 *
 * | 規則 | 根拠 |
 * |---|---|
 * | メッセージは `id` (文字列)・`role` (3 値)・`parts` (`type` が文字列の record の配列)・`createdAt` (数値か null)。崩れたら破棄 | X-5 FR-012 |
 * | `system-event` の part は列挙を `Object.hasOwn` で照合 (prototype のキーを通さない)、`opens` は boolean、`name` / `detail` は文字列。外れた part は落とす | data-model §2 |
 * | `tool-call` の part は `result` が `string \| null`、`isError` / `truncated` が boolean。外れた part は落とす | data-model §2 |
 * | part を落として空になったメッセージ (元は part があった) は破棄する — 空の system メッセージは assistant-ui が例外を投げる | FR-009 (例外を投げない) |
 */

type Rec = Record<string, unknown>

function isRecord(value: unknown): value is Rec {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 列挙の照合表 (prototype を持たない。`Object.hasOwn` と組で `constructor` などを通さない)。 */
function enumTable(values: readonly string[]): Readonly<Record<string, true>> {
  const table: Record<string, true> = Object.create(null) as Record<string, true>
  for (const v of values) table[v] = true
  return table
}

const CATEGORY_TABLE = enumTable(SYSTEM_EVENT_CATEGORIES)
const STATUS_TABLE = enumTable(SYSTEM_EVENT_STATUSES)

function inEnum(table: Readonly<Record<string, true>>, value: unknown): boolean {
  return typeof value === 'string' && Object.hasOwn(table, value)
}

type SystemEventPart = Extract<TranscriptPartDTO, { type: 'system-event' }>
type ToolCallPart = Extract<TranscriptPartDTO, { type: 'tool-call' }>

/** `system-event` の part の中身 (`type` を除く) の形か。data part の `data` の検証にも使う。 */
export function isSystemEventFields(value: unknown): value is Omit<SystemEventPart, 'type'> {
  return (
    isRecord(value) &&
    inEnum(CATEGORY_TABLE, value.category) &&
    typeof value.opens === 'boolean' &&
    typeof value.name === 'string' &&
    typeof value.detail === 'string' &&
    (value.status === null || inEnum(STATUS_TABLE, value.status))
  )
}

export function isSystemEventPart(value: unknown): value is SystemEventPart {
  return isRecord(value) && value.type === 'system-event' && isSystemEventFields(value)
}

/** 入れ子 (subagent の children) の深さの上界。domain が深さを打ち切った後の値なので、これを超える入力は捨てる。 */
const MAX_CHILD_DEPTH = 32

function isToolCallShape(value: Rec): boolean {
  return (
    typeof value.toolCallId === 'string' &&
    typeof value.toolName === 'string' &&
    typeof value.argsText === 'string' &&
    (value.result === null || typeof value.result === 'string') &&
    typeof value.isError === 'boolean' &&
    typeof value.truncated === 'boolean' &&
    Array.isArray(value.children)
  )
}

/** サーバー側の検索の結果の項目の上限 (domain の `WEB_SOURCES_MAX` と同じ。data-model §2.1)。 */
const SERVER_SOURCES_MAX = 20

function isWebSource(value: unknown): boolean {
  return isRecord(value) && typeof value.title === 'string' && typeof value.url === 'string'
}

/** `server-tool-call` の結果の形か (`kind` は 3 つのどれか。`sources` は 20 件まで)。 */
function isServerToolResult(value: unknown): boolean {
  if (!isRecord(value)) return false
  switch (value.kind) {
    case 'web-search':
      return (
        Array.isArray(value.sources) &&
        value.sources.length <= SERVER_SOURCES_MAX &&
        value.sources.every(isWebSource) &&
        typeof value.omitted === 'number' &&
        Number.isFinite(value.omitted)
      )
    case 'error':
      return typeof value.errorCode === 'string'
    case 'unsupported':
      return typeof value.blockType === 'string'
    default:
      return false
  }
}

function isServerToolCallShape(value: Rec): boolean {
  return (
    typeof value.toolCallId === 'string' &&
    typeof value.toolName === 'string' &&
    typeof value.argsText === 'string' &&
    typeof value.truncated === 'boolean' &&
    (value.result === null || isServerToolResult(value.result))
  )
}

const ROLES: ReadonlySet<unknown> = new Set(['user', 'assistant', 'system'])

function filterPart(part: Rec, depth: number): TranscriptPartDTO | null {
  switch (part.type) {
    case 'system-event':
      return isSystemEventPart(part) ? part : null
    case 'tool-call': {
      if (!isToolCallShape(part)) return null
      const children: TranscriptMessageDTO[] = []
      if (depth < MAX_CHILD_DEPTH) {
        for (const child of part.children as readonly unknown[]) {
          const decoded = decodeAt(child, depth + 1)
          if (decoded !== null) children.push(decoded)
        }
      }
      return { ...(part as unknown as ToolCallPart), children }
    }
    case 'server-tool-call':
      return isServerToolCallShape(part) ? (part as unknown as TranscriptPartDTO) : null
    case 'unsupported-block':
      return typeof part.blockType === 'string' ? (part as unknown as TranscriptPartDTO) : null
    default:
      // 他の part は従来どおり (本文の無害化は agents / domain 済み。表示は assistant-ui の変換が形を見る)。
      return part as unknown as TranscriptPartDTO
  }
}

function decodeAt(value: unknown, depth: number): TranscriptMessageDTO | null {
  if (!isRecord(value)) return null
  if (typeof value.id !== 'string' || !ROLES.has(value.role)) return null
  if (!(value.createdAt === null || typeof value.createdAt === 'number')) return null
  const rawParts = value.parts
  if (!Array.isArray(rawParts)) return null
  if (!rawParts.every((p) => isRecord(p) && typeof p.type === 'string')) return null
  const parts: TranscriptPartDTO[] = []
  for (const p of rawParts as readonly Rec[]) {
    const kept = filterPart(p, depth)
    if (kept !== null) parts.push(kept)
  }
  if (rawParts.length > 0 && parts.length === 0) return null
  return {
    id: value.id,
    role: value.role as TranscriptMessageDTO['role'],
    parts,
    createdAt: value.createdAt as number | null
  }
}

/**
 * 未信頼の値を transcript のメッセージとして読む。形が崩れていれば `null`、検証に通らない part は落とす。
 */
export function decodeTranscriptMessage(value: unknown): TranscriptMessageDTO | null {
  return decodeAt(value, 0)
}
