import { isValidToolUseId } from '@domain/session/meter'
import {
  orphanResultPart,
  pendingToolCallIds,
  readToolResult,
  RESEND_RESULT_MAX_BYTES,
  truncateBytes,
  withToolResults,
  type ToolResult
} from '@domain/session/tool-result'
import type { TranscriptMessageDTO, TranscriptPartDTO } from '@domain/session/transcript-dto'
import { MAX_SUBAGENT_DEPTH } from '@domain/session/transcript'

/**
 * 実行中の tool の結果の対応 (O-2 / FR-007。[data-model](../../specs/011-ui-coverage/data-model.md) §3)。
 *
 * セッションスレッド (`sdk-agent-session.ts`) の `run()` が **closure の中で 1 つ作る** (`permissions` と同じ寿命。
 * module スコープに置かない)。SDK を import しない — SDK のメッセージは構造だけで受ける (単体テストのため)。
 *
 * | 規則 | 根拠 |
 * |---|---|
 * | 結果待ちの tool_use を含む assistant メッセージだけを覚える。`toolCallId` が空の tool_use は登録しない | data-model §3 |
 * | `user` メッセージは `tool_result` ブロックだけを読む。**本文 (それ以外のブロック) は返さない** | data-model §3 / FR-007 |
 * | 影響を受けたメッセージは user メッセージ 1 つにつき 1 回だけ返す (並列の結果をまとめて埋める) | data-model §3 |
 * | 1 回の送り直しの `result` の合計は `RESEND_RESULT_MAX_BYTES` まで (`withToolResults` が切る) | design-gate R2 security M-004 |
 * | 引けない結果は結果だけのメッセージ (`result:<toolUseId>`) にする | data-model §3 |
 * | 結果待ちは 256 メッセージまで。超えたら古いものから捨てる | data-model §3 [ASSUMED] |
 * | subagent の中のメッセージ (O-11 / AD-055) は `nest` で位置の表を引き、親の tool-call の `children` に足した根を送り直す | data-model §3.1 |
 *
 * 根 = 主ループの assistant の最新の DTO (子を含む)。位置の表 = 結果待ちの `toolUseId` → (根の id、根からその tool-call までの
 * tool-call の id の道)。根を忘れたら位置も一緒に忘れる。根の DTO は readonly なので、道に沿って写し直して差し替える。
 */

/** 1 つの tool-call の子の上限 (data-model §3.1 [ASSUMED]。超えたら親の `truncated` を立てる。U-10)。 */
export const MAX_NESTED_CHILDREN = 500

/** 結果待ちのメッセージの上限 (data-model §3 [ASSUMED])。 */
export const MAX_PENDING_TOOL_MESSAGES = 256

export interface LiveToolResultTracker {
  /** 送った assistant メッセージを覚える (結果待ちの tool_use が無ければ何もしない)。 */
  trackAssistant(message: TranscriptMessageDTO): void
  /** SDK の `user` メッセージ (未信頼) から、送り直すメッセージ (同じ id) と結果だけのメッセージを返す。 */
  applyUserMessage(raw: unknown, receivedAt: number): readonly TranscriptMessageDTO[]
  /** 覚えているメッセージの数 (テスト用の観測点)。 */
  pendingMessageCount(): number
  /**
   * 取り消し (O-6 / 016 data-model §1「戻らない仕組み」)。該当のメッセージを忘れ、その結果待ちの `toolUseId` を覚えて
   * (以後の結果を送り直しにも結果だけのメッセージにもしない)、取り消した id の assistant を後から送らないようにする。
   * 冪等。送った assistant の id に当たらなかった件数を返す (開発用のログ用)。
   */
  retract(messageIds: readonly string[]): { readonly unmatched: number }
  /** 取り消した id か (後から届いた assistant を送らない判定)。 */
  isRetracted(messageId: string): boolean
  /**
   * 覚えている根のメッセージの `Bash` の tool-call の `argsText` (O-11。`local_bash` の task の行の名前を引く)。
   * 忘れていれば・`Bash` でなければ `undefined`。
   */
  toolCallArgs(toolUseId: string): string | undefined
  /**
   * subagent の中のメッセージ (`parent_tool_use_id` が文字列) を親の tool-call の `children` に足す (O-11 / data-model §3.1)。
   * `resend`: 送り直す根 (同じ id) / `orphan`: 親が分からない・形が外れた・自己参照・深さ超過 (呼び出し元が主ループの位置に
   * そのまま送る) / `none`: 送らない (取り消した根の配下・切り詰めの後)。
   */
  nest(child: TranscriptMessageDTO, parentToolUseId: unknown): NestResult
}

export type NestResult =
  | { readonly kind: 'resend'; readonly message: TranscriptMessageDTO }
  | { readonly kind: 'orphan' }
  | { readonly kind: 'none' }

type ToolCallPart = Extract<TranscriptPartDTO, { type: 'tool-call' }>

/** 結果待ちの tool-call の位置。`path` は根の tool-call から数えた tool-call の id の列 (根の直下の呼び出しは 1 つ)。 */
interface Position {
  readonly messageId: string
  readonly path: readonly string[]
}

/** メッセージの中の (入れ子を含む) tool-call を、根からの道つきで走査する。id が空の呼び出しは道にできないので飛ばす。 */
function walkToolCalls(
  message: TranscriptMessageDTO,
  prefix: readonly string[],
  visit: (part: ToolCallPart, path: readonly string[]) => void
): void {
  for (const part of message.parts) {
    if (part.type !== 'tool-call' || part.toolCallId === '') continue
    const path = [...prefix, part.toolCallId]
    visit(part, path)
    for (const child of part.children) walkToolCalls(child, path, visit)
  }
}

/** 道が指す tool-call を `fn` で置き換えた新しいメッセージを返す (元は書き換えない)。無ければ `null`。 */
function updateToolCall(
  message: TranscriptMessageDTO,
  path: readonly string[],
  fn: (part: ToolCallPart) => ToolCallPart
): TranscriptMessageDTO | null {
  const [head, ...rest] = path
  let found = false
  const parts = message.parts.map((part): TranscriptPartDTO => {
    if (found || part.type !== 'tool-call' || part.toolCallId !== head) return part
    if (rest.length === 0) {
      found = true
      return fn(part)
    }
    let replaced = false
    const children = part.children.map((child) => {
      if (replaced) return child
      const next = updateToolCall(child, rest, fn)
      if (next === null) return child
      replaced = true
      return next
    })
    if (!replaced) return part
    found = true
    return { ...part, children }
  })
  return found ? { ...message, parts } : null
}

function findToolCall(message: TranscriptMessageDTO, path: readonly string[]): ToolCallPart | null {
  let found: ToolCallPart | null = null
  updateToolCall(message, path, (part) => {
    found = part
    return part
  })
  return found
}

/** 入れ子を含めて結果待ちの tool-call の (id, 道) を集める。 */
function deepPending(
  message: TranscriptMessageDTO
): readonly { readonly id: string; readonly path: readonly string[] }[] {
  const out: { id: string; path: readonly string[] }[] = []
  walkToolCalls(message, [], (part, path) => {
    if (part.result === null) out.push({ id: part.toolCallId, path })
  })
  return out
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).length
}

function measure(message: TranscriptMessageDTO): number {
  return byteLength(JSON.stringify(message))
}

/** 入れ子を含めた結果の合計のバイト数。 */
function deepResultBytes(message: TranscriptMessageDTO): number {
  let total = 0
  walkToolCalls(message, [], (part) => {
    if (part.result !== null) total += byteLength(part.result)
  })
  return total
}

/** 取り消した id と、取り消したメッセージの結果待ちの `toolUseId`、送った assistant の id の記憶の上限。 */
export const MAX_RETRACTION_MEMORY = 512

/** 挿入順の上限つきの集合 (超えたら古いものから捨てる)。 */
function addBounded(set: Set<string>, value: string): void {
  set.delete(value)
  set.add(value)
  while (set.size > MAX_RETRACTION_MEMORY) {
    const oldest = set.values().next().value
    if (oldest === undefined) break
    set.delete(oldest)
  }
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : null
}

/** user メッセージの `tool_result` ブロックだけを取り出す (本文のブロックは読まない)。 */
function toolResultsOf(raw: unknown): readonly ToolResult[] {
  const content = asRecord(asRecord(raw)?.message)?.content
  if (!Array.isArray(content)) return []
  return content.flatMap((block) => {
    const result = readToolResult(block)
    return result === null ? [] : [result]
  })
}

function orphanMessage(result: ToolResult, receivedAt: number): TranscriptMessageDTO {
  return {
    id: `result:${result.toolUseId}`,
    role: 'assistant',
    parts: [orphanResultPart(result)],
    createdAt: receivedAt
  }
}

export function createLiveToolResultTracker(): LiveToolResultTracker {
  // toolUseId → 位置 / messageId → 最後に送った根の DTO (挿入順 = 古い順)。
  const pendingToolCalls = new Map<string, Position>()
  const lastMessages = new Map<string, TranscriptMessageDTO>()
  // 根の送り直しの大きさ (JSON のバイト数) の記憶。子を足すときに見る。結果を埋めたら忘れて、次に測り直す。
  const rootBytes = new Map<string, number>()

  const retractedMessages = new Set<string>()
  const retractedToolCalls = new Set<string>()
  const sentAssistants = new Set<string>()
  // 子の数・大きさの上限で `truncated` を立てた親の tool-call (立てた後は子を送り直さない。U-10)。
  const truncatedParents = new Set<string>()

  const forget = (messageId: string): void => {
    const message = lastMessages.get(messageId)
    if (message === undefined) return
    lastMessages.delete(messageId)
    rootBytes.delete(messageId)
    for (const { id } of deepPending(message)) {
      // 同じ toolUseId が後のメッセージに付け替わっていれば消さない。
      if (pendingToolCalls.get(id)?.messageId === messageId) pendingToolCalls.delete(id)
    }
  }

  /** 根を覚える (最新にする)。結果待ちが入れ子を含めて 0 なら覚えない。 */
  const remember = (message: TranscriptMessageDTO): void => {
    lastMessages.delete(message.id)
    const pending = deepPending(message)
    if (pending.length === 0) return
    lastMessages.set(message.id, message)
    for (const { id, path } of pending) {
      if (path.length <= MAX_SUBAGENT_DEPTH + 1) {
        pendingToolCalls.set(id, { messageId: message.id, path })
      }
    }
    while (lastMessages.size > MAX_PENDING_TOOL_MESSAGES) {
      const oldest = lastMessages.keys().next().value
      if (oldest === undefined) break
      forget(oldest)
    }
  }

  /** 足さなかった子の tool-call の結果を、以後捨てる (結果だけのメッセージとして平らに出さない)。 */
  const dropResultsOf = (child: TranscriptMessageDTO): void => {
    walkToolCalls(child, [], (part) => addBounded(retractedToolCalls, part.toolCallId))
  }

  return {
    trackAssistant(message) {
      const ids = pendingToolCallIds(message)
      if (retractedMessages.has(message.id)) {
        // 取り消した id の assistant を後で受けた (送らない)。その tool の結果も捨てる。
        for (const id of ids) addBounded(retractedToolCalls, id)
        return
      }
      addBounded(sentAssistants, message.id)
      if (ids.length === 0) return
      forget(message.id)
      remember(message)
    },

    applyUserMessage(raw, receivedAt) {
      // 取り消したメッセージの tool の結果は捨てる (送り直しにも結果だけのメッセージにもしない)。
      const results = toolResultsOf(raw).filter((r) => !retractedToolCalls.has(r.toolUseId))
      if (results.length === 0) return []

      // 対象の根ごとにまとめる (送り直しを 1 メッセージ 1 回にする)。
      const groups = new Map<string, { result: ToolResult; path: readonly string[] }[]>()
      const orphans: ToolResult[] = []
      for (const result of results) {
        const position = pendingToolCalls.get(result.toolUseId)
        if (position === undefined) {
          orphans.push(result)
          continue
        }
        const entry = { result, path: position.path }
        const group = groups.get(position.messageId)
        if (group === undefined) groups.set(position.messageId, [entry])
        else group.push(entry)
      }

      const out: TranscriptMessageDTO[] = []
      for (const [messageId, group] of groups) {
        const current = lastMessages.get(messageId)
        if (current === undefined) {
          orphans.push(...group.map((g) => g.result))
          continue
        }
        let next = current
        const applied = new Set<string>()
        // 根の直下の呼び出しは今までの規則 (`withToolResults`) で、深い位置は道に沿って埋める (同じ上限の考え方)。
        const top = group.filter((g) => g.path.length === 1).map((g) => g.result)
        if (top.length > 0) {
          const filled = withToolResults(next, top)
          if (filled !== null) {
            next = filled.message
            for (const id of filled.applied) applied.add(id)
          }
        }
        for (const { result, path } of group) {
          if (path.length === 1) continue
          const budget = Math.max(0, RESEND_RESULT_MAX_BYTES - deepResultBytes(next))
          const cut =
            byteLength(result.text) <= budget
              ? { text: result.text, truncated: result.truncated }
              : { text: truncateBytes(result.text, budget), truncated: true }
          const updated = updateToolCall(next, path, (part) => ({
            ...part,
            result: cut.text,
            isError: result.isError,
            truncated: part.truncated || cut.truncated
          }))
          if (updated === null) continue
          next = updated
          applied.add(result.toolUseId)
        }
        for (const id of applied) pendingToolCalls.delete(id)
        for (const g of group) if (!applied.has(g.result.toolUseId)) orphans.push(g.result)
        if (applied.size === 0) continue
        rootBytes.delete(messageId)
        if (deepPending(next).length === 0) lastMessages.delete(messageId)
        else lastMessages.set(messageId, next)
        out.push(next)
      }
      for (const result of orphans) out.push(orphanMessage(result, receivedAt))
      return out
    },

    pendingMessageCount() {
      return lastMessages.size
    },

    retract(messageIds) {
      let unmatched = 0
      for (const messageId of messageIds) {
        if (!sentAssistants.has(messageId) && !retractedMessages.has(messageId)) unmatched += 1
        addBounded(retractedMessages, messageId)
        const message = lastMessages.get(messageId)
        if (message !== undefined) {
          // 根の配下 (入れ子の中を含む) の結果待ちの tool-call と、子を持つ tool-call を、以後送らない (O-11)。
          walkToolCalls(message, [], (part) => {
            if (part.result === null || part.children.length > 0)
              addBounded(retractedToolCalls, part.toolCallId)
          })
        }
        forget(messageId)
      }
      return { unmatched }
    },

    isRetracted(messageId) {
      return retractedMessages.has(messageId)
    },

    toolCallArgs(toolUseId) {
      const position = pendingToolCalls.get(toolUseId)
      const root = position === undefined ? undefined : lastMessages.get(position.messageId)
      if (position === undefined || root === undefined) return undefined
      const part = findToolCall(root, position.path)
      return part?.toolName === 'Bash' ? part.argsText : undefined
    },

    nest(child, parentToolUseId) {
      if (!isValidToolUseId(parentToolUseId)) return { kind: 'orphan' }
      if (retractedToolCalls.has(parentToolUseId)) return { kind: 'none' }
      const position = pendingToolCalls.get(parentToolUseId)
      const root = position === undefined ? undefined : lastMessages.get(position.messageId)
      if (position === undefined || root === undefined) return { kind: 'orphan' }
      // 自分の tool-call を親にする形は孤児と同じ。
      if (child.parts.some((p) => p.type === 'tool-call' && p.toolCallId === parentToolUseId)) {
        return { kind: 'orphan' }
      }
      // 子のメッセージの深さ (根を 0) は、親の tool-call の道の長さ。
      if (position.path.length > MAX_SUBAGENT_DEPTH) return { kind: 'orphan' }
      if (truncatedParents.has(parentToolUseId)) {
        dropResultsOf(child)
        return { kind: 'none' }
      }

      const parent = findToolCall(root, position.path)
      if (parent === null) return { kind: 'orphan' }
      const bytes = rootBytes.get(root.id) ?? measure(root)
      const childBytes = measure(child) + 1
      if (
        parent.children.length >= MAX_NESTED_CHILDREN ||
        bytes + childBytes > RESEND_RESULT_MAX_BYTES
      ) {
        // 子を足さず、親に切り詰めの印を立てて 1 回だけ送り直す。以後その親への子は送り直さない。
        dropResultsOf(child)
        addBounded(truncatedParents, parentToolUseId)
        const marked = updateToolCall(root, position.path, (part) => ({ ...part, truncated: true }))
        if (marked === null) return { kind: 'none' }
        lastMessages.delete(root.id)
        lastMessages.set(root.id, marked)
        rootBytes.set(root.id, bytes)
        return { kind: 'resend', message: marked }
      }

      const next = updateToolCall(root, position.path, (part) => ({
        ...part,
        children: [...part.children, child]
      }))
      if (next === null) return { kind: 'orphan' }
      lastMessages.delete(root.id)
      lastMessages.set(root.id, next)
      rootBytes.set(root.id, bytes + childBytes)
      for (const { id, path } of deepPending(child)) {
        const full = [...position.path, ...path]
        if (full.length <= MAX_SUBAGENT_DEPTH + 1) {
          pendingToolCalls.set(id, { messageId: root.id, path: full })
        }
      }
      return { kind: 'resend', message: next }
    }
  }
}
