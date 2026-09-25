import { sanitizeBody, TOOL_RESULT_MAX_BYTES } from './sanitize-body'
import type {
  TranscriptMessageDTO,
  TranscriptMessageRole,
  TranscriptPartDTO
} from './transcript-dto'

/**
 * SDK の `SessionMessage` (`getSessionMessages` の返り) を **構造的に**受ける
 * ([data-model.md](../../../specs/003-ui-transcript-rendering/data-model.md) §1 /
 * [R-4 data-model.md](../../../specs/004-ui-tier-a-tool-display/data-model.md) §4)。
 *
 * **SDK 型を import しない** — `src/agents/enumerate.ts` が `SdkSessionLike` を構造定義して
 * 回避したのと同じ (Principle IV の SDK 境界は `agents` が担い、`domain` は純粋関数)。
 * `message` は Anthropic API の message (`{ role, content }`) だが**未信頼**として narrowing する。
 *
 * **R-4**: `parent_tool_use_id` を使って subagent (Task) 配下メッセージを親 Task の tool-call に入れ子にする
 * (research R-02: `parent_tool_use_id` = 起動した Task の `tool_use.id`)。`parent_agent_id` は多段連鎖の補助。
 */
export interface SessionMessageLike {
  readonly type: 'user' | 'assistant' | 'system'
  readonly uuid: string
  readonly message: unknown
  /** subagent 内で生成されたメッセージのとき、それを起動した Task の `tool_use.id` (research R-02。一次リンク鍵)。 */
  readonly parent_tool_use_id?: string | null
  /** この subagent を起動した subagent の agentId (多段。depth-1 / main では null。research R-02)。 */
  readonly parent_agent_id?: string | null
}

/**
 * 多段 subagent ネストの深さ上限 (R-4 / data-model §4 の SSoT)。
 *
 * 親子リンクは「親 tool_use は子より必ず前に現れる」ため forest となり循環しない (self-reference は個別に弾く)。
 * それでも病的な入力に備え、この深さを超えるネストは **top-level に平坦化**する (欠落させず、深さを有界化する)。
 * 視覚的なインデント上限は renderer 側でさらに絞ってよい。
 */
export const MAX_SUBAGENT_DEPTH = 8

/** 変換中に result / children を後付けするための可変 tool-call。返却時は readonly DTO へ写す。 */
interface MutableToolCall {
  type: 'tool-call'
  toolCallId: string
  toolName: string
  argsText: string
  result: string | null
  isError: boolean
  truncated: boolean
  /** subagent 配下メッセージ (可変。返却時に DTO へ)。 */
  children: MutableMessage[]
}

/** 変換中の part。tool-call は必ず `MutableToolCall` として作るため DTO の tool-call 変種は除く。 */
type BuildPart = Exclude<TranscriptPartDTO, { type: 'tool-call' }> | MutableToolCall

interface MutableMessage {
  id: string
  role: TranscriptMessageRole
  parts: BuildPart[]
  createdAt: number | null
}

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
 * コンパクション境界か (AD-020: R-3 で必ず出会う。FR-018)。**shape を未信頼として防御的に検出する**。
 */
function isCompactBoundary(message: unknown): boolean {
  const m = asRecord(message)
  if (!m) return false
  if (m.subtype === 'compact_boundary' || m.type === 'compact_boundary') return true
  return 'compact_metadata' in m || 'compactMetadata' in m
}

function toDtoMessage(m: MutableMessage): TranscriptMessageDTO {
  return { id: m.id, role: m.role, parts: m.parts.map(toDtoPart), createdAt: m.createdAt }
}

function toDtoPart(part: BuildPart): TranscriptPartDTO {
  if (part.type !== 'tool-call') return part
  return {
    type: 'tool-call',
    toolCallId: part.toolCallId,
    toolName: part.toolName,
    argsText: part.argsText,
    result: part.result,
    isError: part.isError,
    truncated: part.truncated,
    children: part.children.map(toDtoMessage)
  }
}

/**
 * `SessionMessage[]` → transcript の表示メッセージ列へ変換する **純粋関数** (FR-004 / FR-010)。
 *
 * - text → markdown / thinking → reasoning / tool_use → tool-call / image → image / document → file
 * - **tool_use と後続 user の tool_result を `id` で対にする** (data-model §4)。位置に依存しない。
 *   孤児 (対応する tool_use が無い result) は欠落させず単独 tool-call として出す
 * - **会話由来文字列は本文サニタイザ (`sanitizeBody`) を通す** — text / thinking / tool_result に加え、
 *   **R-4 では `tool_use.input` (`argsText`) にも適用**する (5 専用表示の主コンテンツが argsText 由来。
 *   bidi 表示偽装 + 巨大 args の renderer DoS を取得プロセス側で塞ぐ。FR-012 / design-gate H-1/H-2)
 * - **subagent (Task) の入れ子** (R-4 / US-2): `parent_tool_use_id` == 親 Task の `tool_use.id` で対応づけ、
 *   親 tool-call の `children` に記録順で入れる。孤児 (親不明) / 自己参照 / 深さ超過は欠落させず top-level に置く。
 *   循環は「親 tool_use は子より前に現れる」構造上起きない (forest)。同一 id は**最初の一致に attach** (二重 attach しない)
 * - tool_result だけになった user メッセージは、直前の tool-call に result を付けたうえで**出さない**
 *
 * I/O を持たず、モックなしでテストできる (AD-023 Consequences)。
 */
export function toTranscriptMessages(
  records: readonly SessionMessageLike[]
): readonly TranscriptMessageDTO[] {
  const topLevel: MutableMessage[] = []
  /** toolCallId → tool-call part。**最初の一致を保持** (二重 attach 防止。design-gate L-4)。 */
  const toolCallById = new Map<string, MutableToolCall>()
  /** tool-call → その tool-call を持つメッセージの深さ (ネスト深さの計算に使う)。 */
  const ownerDepth = new Map<MutableToolCall, number>()

  for (const rec of records) {
    if (!rec || typeof rec.uuid !== 'string' || rec.uuid.length === 0) continue
    const role: TranscriptMessageRole = rec.type
    const parts: BuildPart[] = []
    const orphanResults: BuildPart[] = []
    const ownToolCalls: MutableToolCall[] = []

    // コンパクション境界を最小の区切りで示す (FR-018)。専用 element は O-2。
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
          // **argsText も sanitizeBody + byte 上限を通す** (R-4 / design-gate H-1/H-2)。
          const args = sanitizeBody(safeStringify(b.input), TOOL_RESULT_MAX_BYTES)
          const toolCall: MutableToolCall = {
            type: 'tool-call',
            toolCallId: id,
            toolName: typeof b.name === 'string' && b.name.length > 0 ? b.name : '(unknown tool)',
            argsText: args.value,
            result: null,
            isError: false,
            truncated: args.truncated,
            children: []
          }
          parts.push(toolCall)
          ownToolCalls.push(toolCall)
          // **最初の一致を保持** (同一 id が複数現れても上書きしない。design-gate L-4)。
          if (id.length > 0 && !toolCallById.has(id)) toolCallById.set(id, toolCall)
          break
        }
        case 'tool_result': {
          const id = typeof b.tool_use_id === 'string' ? b.tool_use_id : ''
          const res = sanitizeBody(toolResultText(b.content), TOOL_RESULT_MAX_BYTES)
          const isError = b.is_error === true
          const target = id.length > 0 ? toolCallById.get(id) : undefined
          if (target) {
            target.result = res.value
            target.isError = isError
            if (res.truncated) target.truncated = true
          } else {
            // 孤児 tool_result: 対応する tool_use が無い。**欠落させず単独表示** (data-model §4)。
            orphanResults.push({
              type: 'tool-call',
              toolCallId: id,
              toolName: '(tool result)',
              argsText: '',
              result: res.value,
              isError,
              truncated: res.truncated,
              children: []
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
          // 未知の content block: 欠落させないが専用表示は持たない。無害に skip する。
          break
      }
    }

    for (const orphan of orphanResults) parts.push(orphan)
    if (parts.length === 0) continue

    const msg: MutableMessage = { id: rec.uuid, role, parts, createdAt: null }

    // ---- subagent 入れ子の対応づけ (R-4 / US-2 / data-model §4) ----
    const parentId =
      typeof rec.parent_tool_use_id === 'string' && rec.parent_tool_use_id.length > 0
        ? rec.parent_tool_use_id
        : null
    const parentTc = parentId ? toolCallById.get(parentId) : undefined
    // 自己参照ガード: 親 tool-call が「このメッセージ自身の tool-call」なら入れ子にしない (孤児扱い)。
    const selfRef = parentTc ? ownToolCalls.includes(parentTc) : false

    if (parentTc && !selfRef) {
      const depth = (ownerDepth.get(parentTc) ?? 0) + 1
      if (depth <= MAX_SUBAGENT_DEPTH) {
        parentTc.children.push(msg)
      } else {
        // 深さ超過: 欠落させず top-level に平坦化する (深さ有界化)。
        topLevel.push(msg)
      }
      for (const tc of ownToolCalls) ownerDepth.set(tc, Math.min(depth, MAX_SUBAGENT_DEPTH))
    } else {
      topLevel.push(msg)
      for (const tc of ownToolCalls) ownerDepth.set(tc, 0)
    }
  }

  return topLevel.map(toDtoMessage)
}
