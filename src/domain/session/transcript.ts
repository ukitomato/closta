import {
  convertServerOrUnsupported,
  documentPart,
  safeStringify,
  unsupportedBlockPart,
  type MutableServerToolCall,
  type ServerCallTable
} from './content-blocks'
import { sanitizeBody, TOOL_RESULT_MAX_BYTES } from './sanitize-body'
import { redactSecrets } from './secret-redaction'
import { createForegroundTaskMemory, createTaskRowBuilder } from './foreground-tasks'
import { isValidToolUseId } from './meter'
import { toNoticeRow } from './notice-rows'
import { mergeSystemEvent, systemEventPartOf } from './system-event'
import { orphanResultPart, readToolResult } from './tool-result'
import { parseMessageTime } from './transcript-time'
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
  /**
   * 記録の時刻 (ISO 8601。型には無いが SDK の返りに入る。O-9 / AD-051)。未信頼として `parseMessageTime` で検査する。
   * 記録の最上位にあり、`message` の中ではない。
   */
  readonly timestamp?: unknown
}

/** `toTranscriptMessages` の options。 */
export interface ToTranscriptMessagesOptions {
  /** 時刻の検査の「今」(epoch ms。取得の時点)。省略時は `Date.now()` (O-9)。 */
  readonly now?: number
  /**
   * subagent ごとの記録の列 (`getSubagentMessages` の返り。O-11 / AD-055)。省略時は空。各列の親 (`parent_tool_use_id`) の
   * tool-call の `children` に、親が `toolCallById` にある列から入れる。親の見つからない列は捨てる。
   */
  readonly subagents?: readonly (readonly SessionMessageLike[])[]
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
type BuildPart =
  | Exclude<TranscriptPartDTO, { type: 'tool-call' | 'server-tool-call' }>
  | MutableToolCall
  | MutableServerToolCall

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
 * 1 件の記録の content のブロックを part にする (主の記録と subagent の記録で共有する。O-11)。
 * `toolCallById` は親の検索に使う全体の表、`resultTargets` は tool_result を埋める先の表 (主の記録では同じ表。subagent の列では
 * 列の中の tool-call だけ)。`subagent` が真なら、user の記録は tool_result だけを読み、対応の無い結果は出さない。
 */
/** 過去ログの主ループの user の記録で読むブロックの種類 (data-model §2.2)。 */
const USER_ALLOWED_BLOCK_TYPES: ReadonlySet<string> = new Set([
  'text',
  'image',
  'document',
  'tool_result'
])

function convertBlocks(
  rec: SessionMessageLike,
  role: TranscriptMessageRole,
  toolCallById: Map<string, MutableToolCall>,
  subagent: boolean,
  parts: BuildPart[],
  ownToolCalls: MutableToolCall[],
  orphanResults: BuildPart[],
  serverCalls: ServerCallTable,
  resultTargets: Map<string, MutableToolCall> = toolCallById
): void {
  for (const raw of contentBlocks(rec.message)) {
    const b = asRecord(raw)
    if (!b) continue
    // subagent の user の記録は tool_result だけを読む (text・画像などは読まない。O-11 U-11)。
    if (subagent && role === 'user' && b.type !== 'tool_result') continue
    // 主ループの user の記録の許可一覧は text / image / document / tool_result の 4 つ。外のすべては印にする
    // (data-model §2.2。thinking・tool_use・サーバー側の tool などは user のメッセージに現れない組み合わせ。O-12 U-11)。
    if (role === 'user' && !USER_ALLOWED_BLOCK_TYPES.has(String(b.type))) {
      parts.push(unsupportedBlockPart(b.type))
      continue
    }
    switch (b.type) {
      case 'text': {
        // `system` の記録の本文 (informational / local_command_output / 拒否) は伏せ字を当てる (O-6 data-model §1)。
        // assistant / user の本文は今のまま。行は足さない。
        const body = sanitizeBody(b.text).value
        parts.push({ type: 'text', text: role === 'system' ? redactSecrets(body) : body })
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
        // tool 名は実行中 (`live-message.ts`) と同じ `sanitizeBody` を通す (O-5 FR-001)。
        // MCP のサーバー名・tool 名は外部由来なので、双方向制御で見出しを偽装させない。
        const name = sanitizeBody(b.name).value
        const toolCall: MutableToolCall = {
          type: 'tool-call',
          toolCallId: id,
          toolName: name.length > 0 ? name : '(unknown tool)',
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
        if (id.length > 0 && !resultTargets.has(id)) resultTargets.set(id, toolCall)
        break
      }
      case 'tool_result': {
        // 取り出しと無害化は実行中の経路と共有する (`tool-result.ts`。O-2 / FR-007)。
        const res = readToolResult(b)
        if (!res) break
        const target = res.toolUseId.length > 0 ? resultTargets.get(res.toolUseId) : undefined
        if (target) {
          target.result = res.text
          target.isError = res.isError
          if (res.truncated) target.truncated = true
        } else if (!subagent) {
          // 孤児 tool_result: 対応する tool_use が無い。**欠落させず単独表示** (data-model §4)。
          orphanResults.push({ ...(orphanResultPart(res) as MutableToolCall), children: [] })
        }
        break
      }
      case 'image': {
        const url = imageUrl(b)
        if (url) parts.push({ type: 'image', url })
        break
      }
      case 'document': {
        parts.push(documentPart(b))
        break
      }
      default: {
        // system の記録は text だけを本文にし、他は印を出さずに飛ばす (data-model §2.2)。
        if (role === 'system') break
        // サーバー側の tool は 1 つの part (結果は同じ id で埋める)、知らないブロックは種類の名前だけの印 (O-12 / FR-008 / FR-011)。
        const part = convertServerOrUnsupported(b, serverCalls)
        if (part) parts.push(part)
        break
      }
    }
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
  records: readonly SessionMessageLike[],
  options?: ToTranscriptMessagesOptions
): readonly TranscriptMessageDTO[] {
  const now = options?.now ?? Date.now()
  const topLevel: MutableMessage[] = []
  /** toolCallId → tool-call part。**最初の一致を保持** (二重 attach 防止。design-gate L-4)。 */
  const toolCallById = new Map<string, MutableToolCall>()
  /** `server_tool_use` の id → part (最初の一致。`toolCallById` と別の表。後の記録の結果のブロックも埋める。O-12 / data-model §2.3)。 */
  const serverCalls: ServerCallTable = new Map()
  /** tool-call → その tool-call を持つメッセージの深さ (ネスト深さの計算に使う)。 */
  const ownerDepth = new Map<MutableToolCall, number>()
  /** Hook / task の行 (合成済み) と、その行の id → 位置。 */
  const systemEvents: TranscriptMessageDTO[] = []
  const systemEventIndex = new Map<string, number>()
  /** 前景で始まった task の記憶と行の包み (O-11。1 回の変換に 1 つ。実行中の経路と同じ関数)。 */
  const taskRows = createTaskRowBuilder(createForegroundTaskMemory())
  /** 主の記録と入れた subagent の記録の uuid (同じ uuid を 2 度出さない。O-11)。 */
  const seenUuids = new Set<string>()

  for (const rec of records) {
    if (!rec || typeof rec.uuid !== 'string' || rec.uuid.length === 0) continue
    seenUuids.add(rec.uuid)
    const role: TranscriptMessageRole = rec.type
    const parts: BuildPart[] = []
    const orphanResults: BuildPart[] = []
    const ownToolCalls: MutableToolCall[] = []
    const createdAt = parseMessageTime(rec.timestamp, now)

    // Hook / Background task のシステムメッセージは 1 つの Hook / task を 1 行に合成する (O-2 / FR-009)。
    // 規則は実行中の経路と同じ `system-event.ts`。行の無い id への更新は捨てる。
    if (role === 'system') {
      // 知らせの類 (O-12 / FR-012) は Hook / task の行でなければ実行中と同じ `toNoticeRow` で行にする。
      // どちらでもなければ今の経路 (伏せ字つきの本文)。
      const event =
        taskRows.build({ ...asRecord(rec.message), type: 'system' }, createdAt, (toolUseId) => {
          const call = toolCallById.get(toolUseId)
          return call?.toolName === 'Bash' ? call.argsText : undefined
        }) ?? toNoticeRow({ type: 'system', ...asRecord(rec.message) }, createdAt, rec.uuid)
      if (event) {
        const index = systemEventIndex.get(event.id)
        const merged = mergeSystemEvent(
          index === undefined ? undefined : systemEvents[index],
          event
        )
        const mergedPart = systemEventPartOf(merged ?? undefined)
        if (merged && mergedPart) {
          if (index === undefined) {
            systemEventIndex.set(event.id, systemEvents.length)
            systemEvents.push(merged)
            topLevel.push({
              id: merged.id,
              role: 'system',
              parts: [mergedPart],
              createdAt: merged.createdAt
            })
          } else {
            systemEvents[index] = merged
            const row = topLevel.find((m) => m.id === merged.id)
            if (row) row.parts = [mergedPart]
          }
        }
        continue
      }
    }

    // コンパクション境界を最小の区切りで示す (FR-018)。
    if (role === 'system' && isCompactBoundary(rec.message)) {
      parts.push({ type: 'divider', label: 'コンテキストを圧縮' })
    }

    convertBlocks(rec, role, toolCallById, false, parts, ownToolCalls, orphanResults, serverCalls)

    for (const orphan of orphanResults) parts.push(orphan)
    if (parts.length === 0) continue

    const msg: MutableMessage = { id: rec.uuid, role, parts, createdAt }

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

  // ---- subagent の記録の列 (O-11 / AD-055 / data-model §3.2) ----
  /** 列の親 = 列の中で最初の文字列の `parent_tool_use_id`。空・形が外れた・無いときは列を捨てる (`null`)。 */
  const listParentOf = (list: readonly SessionMessageLike[]): string | null => {
    for (const rec of list) {
      const value: unknown = rec?.parent_tool_use_id
      if (typeof value !== 'string') continue
      return isValidToolUseId(value) ? value : null
    }
    return null
  }

  /** 列を親の tool-call の `children` に入れる。列の記録は tool_result だけを読む user と、本文の assistant だけ。 */
  const insertSubagentList = (
    list: readonly SessionMessageLike[],
    listParent: string,
    parentTc: MutableToolCall
  ): void => {
    // inline の子が既にあれば入れない。
    if (parentTc.children.length > 0) return
    const depth = (ownerDepth.get(parentTc) ?? 0) + 1
    if (depth > MAX_SUBAGENT_DEPTH) return
    const localCalls = new Map<string, MutableToolCall>()
    for (const rec of list) {
      if (!rec || typeof rec.uuid !== 'string' || rec.uuid.length === 0) continue
      // system の記録と、列の親と違う帰属の記録は捨てる。
      if (rec.type === 'system' || rec.parent_tool_use_id !== listParent) continue
      if (seenUuids.has(rec.uuid)) continue
      seenUuids.add(rec.uuid)
      const role: TranscriptMessageRole = rec.type
      const parts: BuildPart[] = []
      const ownToolCalls: MutableToolCall[] = []
      convertBlocks(rec, role, toolCallById, true, parts, ownToolCalls, [], serverCalls, localCalls)
      if (parts.length === 0) continue
      parentTc.children.push({
        id: rec.uuid,
        role,
        parts,
        createdAt: parseMessageTime(rec.timestamp, now)
      })
      for (const tc of ownToolCalls) ownerDepth.set(tc, depth)
    }
  }

  // 親が `toolCallById` にある列から入れる。入れると列の中の tool-call が表に入るので、進まなくなるまで繰り返す。
  let pending = (options?.subagents ?? []).flatMap((list) => {
    const listParent = listParentOf(list)
    return listParent === null ? [] : [{ list, listParent }]
  })
  while (pending.length > 0) {
    const waiting: typeof pending = []
    for (const entry of pending) {
      const parentTc = toolCallById.get(entry.listParent)
      if (parentTc === undefined) waiting.push(entry)
      else insertSubagentList(entry.list, entry.listParent, parentTc)
    }
    if (waiting.length === pending.length) break
    pending = waiting
  }

  return topLevel.map(toDtoMessage)
}
