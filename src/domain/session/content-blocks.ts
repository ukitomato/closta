import { isValidToolUseId } from './meter'
import { sanitizeBody, TOOL_RESULT_MAX_BYTES } from './sanitize-body'
import { redactedBodyLine } from './system-event'
import type {
  DocumentMediaType,
  ServerToolResultDTO,
  TranscriptPartDTO,
  WebSourceDTO
} from './transcript-dto'

/** 名前の上限 (コードポイント。data-model §2.2 の `document` の行)。 */
export const DOCUMENT_NAME_MAX_CODE_POINTS = 120

/** サーバー側の検索の結果の項目の上限と、タイトルの上限 (コードポイント)。data-model §2.2。 */
export const WEB_SOURCES_MAX = 20
export const WEB_SOURCE_TITLE_MAX_CODE_POINTS = 200

/** URL の上限 (バイト。data-model §2.2.1)。 */
export const WEB_SOURCE_URL_MAX_BYTES = 2048

export type ServerToolCallPart = Extract<TranscriptPartDTO, { type: 'server-tool-call' }>
export type UnsupportedBlockPart = Extract<TranscriptPartDTO, { type: 'unsupported-block' }>
/** 変換中に `result` を後付けするための可変の `server-tool-call`。 */
export type MutableServerToolCall = {
  -readonly [K in keyof ServerToolCallPart]: ServerToolCallPart[K]
}
/** `server_tool_use` の id → part (最初の一致を保持。data-model §2.3)。 */
export type ServerCallTable = Map<string, MutableServerToolCall>

function asRecord(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : null
}

/** tool の入力を表示用の文字列にする (過去ログと実行中で共有)。 */
export function safeStringify(v: unknown): string {
  if (typeof v === 'string') return v
  if (v === undefined) return ''
  try {
    return JSON.stringify(v, null, 2) ?? ''
  } catch {
    return String(v)
  }
}

function documentMediaType(source: Record<string, unknown> | null): DocumentMediaType {
  switch (source?.type) {
    case 'base64':
    case 'url':
      return 'application/pdf'
    case 'text':
      return 'text/plain'
    default:
      return ''
  }
}

/**
 * user の `document` ブロック → `file` の part (data-model §2.2。O-12 / FR-010)。
 * 名前 = `title` → `source.filename` → `''` の順 (伏せ字・1 行化・120 コードポイント)。
 * 種類は `source.type` だけで決め、`source.data` / `context` / `citations` は読まない。
 */
export function documentPart(
  block: Record<string, unknown>
): Extract<TranscriptPartDTO, { type: 'file' }> {
  const source = asRecord(block.source)
  const raw =
    typeof block.title === 'string' && block.title.length > 0
      ? block.title
      : typeof source?.filename === 'string'
        ? source.filename
        : ''
  return {
    type: 'file',
    filename: redactedBodyLine(raw, DOCUMENT_NAME_MAX_CODE_POINTS),
    mediaType: documentMediaType(source)
  }
}

/* ── サーバー側の tool と知らないブロック (O-12 BE-030。data-model §2.2 / §2.3) ───────────── */

const BLOCK_TYPE_SHAPE = /^[a-z][a-z0-9_]{0,63}$/

/** `server_tool_use` の結果のブロックの `type` (`web_search_tool_result` と、結果の中身を読まない 6 つ)。 */
const SERVER_RESULT_TYPES: ReadonlySet<string> = new Set([
  'web_search_tool_result',
  'web_fetch_tool_result',
  'advisor_tool_result',
  'code_execution_tool_result',
  'bash_code_execution_tool_result',
  'text_editor_code_execution_tool_result',
  'tool_search_tool_result'
])

/** 結果のブロックか (assistant の switch の判定)。 */
export function isServerResultBlock(block: Record<string, unknown>): boolean {
  return typeof block.type === 'string' && SERVER_RESULT_TYPES.has(block.type)
}

/** 知らないブロックの印 (種類の名前だけ。形が外れたら '')。 */
export function unsupportedBlockPart(type: unknown): UnsupportedBlockPart {
  return {
    type: 'unsupported-block',
    blockType: typeof type === 'string' && BLOCK_TYPE_SHAPE.test(type) ? type : ''
  }
}

/** 制御文字と双方向制御を含むか (URL の検査。`sanitizeBody` は TAB / LF を残すので別に見る)。 */
function hasControlOrBidi(value: string): boolean {
  for (const ch of value) {
    const c = ch.codePointAt(0) ?? 0
    if (c < 0x20 || c === 0x7f || (c >= 0x80 && c <= 0x9f)) return true
    if (c === 0x061c || c === 0x200e || c === 0x200f) return true
    if (c >= 0x202a && c <= 0x202e) return true
    if (c >= 0x2066 && c <= 0x2069) return true
  }
  return false
}

/** URL (data-model §2.2.1)。http(s) の形で 2048 バイト以下、制御文字なしだけを運ぶ。外れたら ''。 */
export function webSourceUrl(raw: unknown): string {
  if (typeof raw !== 'string') return ''
  if (!/^https?:\/\//i.test(raw)) return ''
  if (new TextEncoder().encode(raw).length > WEB_SOURCE_URL_MAX_BYTES) return ''
  return hasControlOrBidi(raw) ? '' : raw
}

/** 結果のブロック → 結果 (data-model §2.2 の結果の行)。中身はタイトルと URL とエラーの種類だけ読む。 */
export function serverToolResultOf(block: Record<string, unknown>): ServerToolResultDTO {
  const type = typeof block.type === 'string' ? block.type : ''
  if (type !== 'web_search_tool_result') {
    return { kind: 'unsupported', blockType: unsupportedBlockPart(type).blockType }
  }
  const content: unknown = block.content
  if (Array.isArray(content)) {
    const items = content.flatMap((item): WebSourceDTO[] => {
      const r = asRecord(item)
      if (r === null || r.type !== 'web_search_result') return []
      return [
        {
          title: redactedBodyLine(r.title, WEB_SOURCE_TITLE_MAX_CODE_POINTS),
          url: webSourceUrl(r.url)
        }
      ]
    })
    return {
      kind: 'web-search',
      sources: items.slice(0, WEB_SOURCES_MAX),
      omitted: Math.max(0, items.length - WEB_SOURCES_MAX)
    }
  }
  const error = asRecord(content)
  if (error !== null && error.type === 'web_search_tool_result_error') {
    const code = error.error_code
    return {
      kind: 'error',
      errorCode: typeof code === 'string' && /^[a-z_]{1,64}$/.test(code) ? code : ''
    }
  }
  return { kind: 'unsupported', blockType: 'web_search_tool_result' }
}

/**
 * `server_tool_use` → `server-tool-call` (`result: null`)。表に最初の一致を登録する (同じ id の 2 つ目は上書きしない)。
 * `caller` は読まない。名前と入力は tool_use と同じ無害化。
 */
export function serverToolUsePart(
  block: Record<string, unknown>,
  table: ServerCallTable
): MutableServerToolCall {
  const id = typeof block.id === 'string' ? block.id : ''
  const args = sanitizeBody(safeStringify(block.input), TOOL_RESULT_MAX_BYTES)
  const part: MutableServerToolCall = {
    type: 'server-tool-call',
    toolCallId: id,
    toolName: sanitizeBody(block.name).value,
    argsText: args.value,
    truncated: args.truncated,
    result: null
  }
  if (id.length > 0 && !table.has(id)) table.set(id, part)
  return part
}

/**
 * 結果のブロックを同じ id の `server-tool-call` に埋める (§2.3)。埋めたら `null` (part を作らない)。
 * 対応が無い・既に結果が入っている (2 つ目以降) ときは、結果だけの孤児の part を返す (欠落させない)。
 */
export function placeServerResult(
  block: Record<string, unknown>,
  table: ServerCallTable
): MutableServerToolCall | null {
  const result = serverToolResultOf(block)
  const useId = block.tool_use_id
  const id = isValidToolUseId(useId) ? useId : ''
  const target = id.length > 0 ? table.get(id) : undefined
  if (target !== undefined && target.result === null) {
    target.result = result
    return null
  }
  return {
    type: 'server-tool-call',
    toolCallId: id,
    toolName: '',
    argsText: '',
    truncated: false,
    result
  }
}

/**
 * 実行中・過去ログの assistant の switch が共有する、サーバー側の tool と知らないブロックの変換
 * (data-model §2.2。assistant の表の新しい行と `default:`)。呼び出し元は、既存の 7 つの case を先に処理しておく。
 * 戻りは足す part (結果を埋めただけなら `null`)。
 */
export function convertServerOrUnsupported(
  block: Record<string, unknown>,
  table: ServerCallTable
): MutableServerToolCall | UnsupportedBlockPart | null {
  if (block.type === 'server_tool_use') return serverToolUsePart(block, table)
  if (isServerResultBlock(block)) return placeServerResult(block, table)
  return unsupportedBlockPart(block.type)
}
