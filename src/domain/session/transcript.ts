import { sanitizeBody, TOOL_RESULT_MAX_BYTES } from './sanitize-body'
import type {
  TranscriptMessageDTO,
  TranscriptMessageRole,
  TranscriptPartDTO
} from './transcript-dto'

/**
 * SDK の `SessionMessage` (`getSessionMessages` の返り) を **構造的に**受ける
 * ([data-model.md](../../../specs/003-ui-transcript-rendering/data-model.md) §1)。
 *
 * **SDK 型を import しない** — `src/agents/enumerate.ts` が `SdkSessionLike` を構造定義して
 * 回避したのと同じ (Principle IV の SDK 境界は `agents` が担い、`domain` は純粋関数)。
 * `message` は Anthropic API の message (`{ role, content }`) だが**未信頼**として narrowing する。
 */
export interface SessionMessageLike {
  readonly type: 'user' | 'assistant' | 'system'
  readonly uuid: string
  readonly message: unknown
  readonly parent_tool_use_id?: string | null
  readonly parent_agent_id?: string | null
}

/** 変換中に result を後付けするための可変 tool-call。返却時は readonly DTO として扱う。 */
interface MutableToolCall {
  type: 'tool-call'
  toolCallId: string
  toolName: string
  argsText: string
  result: string | null
  isError: boolean
}

type BuildPart = TranscriptPartDTO | MutableToolCall

function asRecord(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : null
}

/** `message.content` を content block 配列に正規化する。文字列 content は 1 つの text block に。 */
function contentBlocks(message: unknown): readonly unknown[] {
  const m = asRecord(message)
  if (!m) return []
  const c = m.content
  if (typeof c === 'string') return [{ type: 'text', text: c }]
  if (Array.isArray(c)) return c
  return []
}

/** tool_use.input を fallback 表示用の文字列にする。 */
function safeStringify(v: unknown): string {
  if (typeof v === 'string') return v
  if (v === undefined) return ''
  try {
    return JSON.stringify(v, null, 2) ?? ''
  } catch {
    return String(v)
  }
}

/** tool_result.content (文字列 or block 配列) を平坦な文字列にする。 */
function toolResultText(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((c) => {
        const r = asRecord(c)
        return r && typeof r.text === 'string' ? r.text : ''
      })
      .filter((s) => s.length > 0)
      .join('\n')
  }
  return ''
}

/**
 * image block を **data: (画像 MIME) の URL** にする。
 * **http(s) リモート画像は含めない** (S-002。tracking pixel を作らない)。
 * base64 image source のみを data: URL に組み立てる。
 */
/**
 * `<img>` 経由でも安全な data 画像 MIME。**`ui` の `safe-url.ts` の `SAFE_DATA_IMAGE` と揃える** —
 * `image/svg+xml` は script 面が残るため除外する (pr-gate security M-001。CSP `img-src 'self' data:` と同方針)。
 */
const SAFE_IMAGE_MEDIA_TYPES = new Set(['image/gif', 'image/jpeg', 'image/png', 'image/webp'])

function imageUrl(block: Record<string, unknown>): string | null {
  const src = asRecord(block.source)
  if (!src) return null
  if (
    src.type === 'base64' &&
    typeof src.media_type === 'string' &&
    SAFE_IMAGE_MEDIA_TYPES.has(src.media_type.toLowerCase()) &&
    typeof src.data === 'string'
  ) {
    return `data:${src.media_type};base64,${src.data}`
  }
  return null
}

function documentName(block: Record<string, unknown>): string {
  if (typeof block.title === 'string' && block.title.length > 0) return block.title
  const src = asRecord(block.source)
  if (src && typeof src.filename === 'string' && src.filename.length > 0) return src.filename
  return 'document'
}

/**
 * `SessionMessage[]` → transcript の表示メッセージ列へ変換する **純粋関数** (FR-004)。
 *
 * - text → markdown / thinking → reasoning / tool_use → tool-call / image → image / document → file
 * - **tool_use と後続 user の tool_result を `id` で対にする** (data-model §4)。
 *   位置に依存しない。孤児 (対応する tool_use が無い result) は欠落させず単独 tool-call として出す
 * - 会話由来文字列は**本文サニタイザ**を通す (改行/タブ保持。FR-016)
 * - tool_result だけになった user メッセージは、直前の assistant に result を付けたうえで**出さない**
 *   (assistant-ui が隣接 assistant+tool をまとめる表示に合わせる)
 *
 * I/O を持たず、モックなしでテストできる (AD-023 Consequences)。
 */
/**
 * コンパクション境界か (AD-020: R-3 で必ず出会う。FR-018)。
 *
 * `getSessionMessages({ includeSystemMessages: true })` が返す `type: 'system'` のうち、
 * `SDKCompactBoundaryMessage` を最小の区切り (divider) で示す。
 * **shape を未信頼として防御的に検出する** — subtype / type / compact メタの有無のいずれかで判定し、
 * 綴りの揺れに 1 つでも当たれば区切りを出す (取りこぼしより過剰表示のほうが害が小さい)。
 */
function isCompactBoundary(message: unknown): boolean {
  const m = asRecord(message)
  if (!m) return false
  if (m.subtype === 'compact_boundary' || m.type === 'compact_boundary') return true
  return 'compact_metadata' in m || 'compactMetadata' in m
}

export function toTranscriptMessages(
  records: readonly SessionMessageLike[]
): readonly TranscriptMessageDTO[] {
  const out: {
    id: string
    role: TranscriptMessageRole
    parts: BuildPart[]
    createdAt: number | null
  }[] = []
  /** toolCallId → 直近で出力した tool-call part (result を後付けする)。 */
  const toolCalls = new Map<string, MutableToolCall>()

  for (const rec of records) {
    if (!rec || typeof rec.uuid !== 'string' || rec.uuid.length === 0) continue
    const role: TranscriptMessageRole = rec.type
    const parts: BuildPart[] = []
    const orphanResults: BuildPart[] = []

    // コンパクション境界を最小の区切りで示す (FR-018 / [USER] 確定)。専用 element は O-2。
    if (role === 'system' && isCompactBoundary(rec.message)) {
      parts.push({ type: 'divider', label: 'コンテキストを圧縮' })
    }

    for (const raw of contentBlocks(rec.message)) {
      const b = asRecord(raw)
      if (!b) continue
      switch (b.type) {
        case 'text': {
          parts.push({ type: 'text', text: sanitizeBody(b.text).value })
          break
        }
        case 'thinking': {
          parts.push({ type: 'reasoning', text: sanitizeBody(b.thinking).value })
          break
        }
        case 'redacted_thinking': {
          parts.push({ type: 'reasoning', text: '[redacted thinking]' })
          break
        }
        case 'tool_use': {
          const id = typeof b.id === 'string' ? b.id : ''
          const toolCall: MutableToolCall = {
            type: 'tool-call',
            toolCallId: id,
            toolName: typeof b.name === 'string' && b.name.length > 0 ? b.name : '(unknown tool)',
            argsText: safeStringify(b.input),
            result: null,
            isError: false
          }
          parts.push(toolCall)
          if (id.length > 0) toolCalls.set(id, toolCall)
          break
        }
        case 'tool_result': {
          const id = typeof b.tool_use_id === 'string' ? b.tool_use_id : ''
          const resultText = sanitizeBody(toolResultText(b.content), TOOL_RESULT_MAX_BYTES).value
          const isError = b.is_error === true
          const target = id.length > 0 ? toolCalls.get(id) : undefined
          if (target) {
            target.result = resultText
            target.isError = isError
          } else {
            // 孤児 tool_result: 対応する tool_use が無い。**欠落させず単独表示** (data-model §4)。
            orphanResults.push({
              type: 'tool-call',
              toolCallId: id,
              toolName: '(tool result)',
              argsText: '',
              result: resultText,
              isError
            })
          }
          break
        }
        case 'image': {
          const url = imageUrl(b)
          if (url) parts.push({ type: 'image', url })
          break
        }
        case 'document': {
          parts.push({ type: 'file', filename: documentName(b), text: '' })
          break
        }
        default:
          // 未知の content block: 欠落させないが専用表示は持たない。無害に skip する
          // (未定義 tool は上の tool_use → fallback で拾われる)。
          break
      }
    }

    for (const orphan of orphanResults) parts.push(orphan)

    // 空メッセージは出さない。tool_result だけだった user (全 result を直前 assistant に付けた) と、
    // 認識できる content を持たない system (compact boundary 等) の双方が該当する。
    // system の区切りは最小表示 or 表示対象外 (FR-018 / data-model §3) — 現状は表示対象外に倒す。
    if (parts.length === 0) continue

    out.push({ id: rec.uuid, role, parts, createdAt: null })
  }

  return out
}
