import { sanitizeBody, TOOL_RESULT_MAX_BYTES } from './sanitize-body'
import type { TranscriptMessageDTO, TranscriptPartDTO } from './transcript-dto'

/**
 * tool の結果 (`tool_result` ブロック) の取り出しと、tool-call の part への書き込み (O-2 / FR-007。
 * [data-model](../../../specs/011-ui-coverage/data-model.md) §3)。過去ログの変換 (`transcript.ts`) と
 * 実行中のセッションスレッド (`sdk-agent-session.ts`) で同じ関数を使う (表示の形をそろえる)。**純粋関数**。
 */

/** 結果を取り出した形。本文は `sanitizeBody` (`TOOL_RESULT_MAX_BYTES`) 済み。 */
export interface ToolResult {
  readonly toolUseId: string
  readonly text: string
  readonly isError: boolean
  readonly truncated: boolean
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : null
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

/** `tool_result` ブロックから結果を取り出す。`tool_result` でなければ `null`。未信頼の形は空に倒す。 */
export function readToolResult(block: unknown): ToolResult | null {
  const b = asRecord(block)
  if (!b || b.type !== 'tool_result') return null
  const res = sanitizeBody(toolResultText(b.content), TOOL_RESULT_MAX_BYTES)
  return {
    toolUseId: typeof b.tool_use_id === 'string' ? b.tool_use_id : '',
    text: res.value,
    isError: b.is_error === true,
    truncated: res.truncated
  }
}

/** 対応する呼び出しが見つからない結果を、結果だけの tool-call の part にする (過去ログと同じ形)。 */
export function orphanResultPart(result: ToolResult): TranscriptPartDTO {
  return {
    type: 'tool-call',
    toolCallId: result.toolUseId,
    toolName: '(tool result)',
    argsText: '',
    result: result.text,
    isError: result.isError,
    truncated: result.truncated,
    children: []
  }
}

/**
 * メッセージの中の `toolUseId` の tool-call に結果を埋めた新しいメッセージを返す。該当する呼び出しが無ければ `null`。
 * `truncated` は args の切り詰めと結果の切り詰めの論理和。
 */
export function withToolResult(
  message: TranscriptMessageDTO,
  result: ToolResult
): TranscriptMessageDTO | null {
  if (result.toolUseId === '') return null
  let found = false
  const parts = message.parts.map((part): TranscriptPartDTO => {
    if (part.type !== 'tool-call' || part.toolCallId !== result.toolUseId || found) return part
    found = true
    return {
      ...part,
      result: result.text,
      isError: result.isError,
      truncated: part.truncated || result.truncated
    }
  })
  return found ? { ...message, parts } : null
}

/** 送り直す 1 メッセージの tool-call の結果の合計の上限 (バイト)。data-model §3 [ASSUMED]。 */
export const RESEND_RESULT_MAX_BYTES = 1_000_000

function byteLength(value: string): number {
  return new TextEncoder().encode(value).length
}

/** 文字列を UTF-8 で `maxBytes` 以下に、コードポイント境界で切る。 */
export function truncateBytes(value: string, maxBytes: number): string {
  if (maxBytes <= 0) return ''
  let used = 0
  let out = ''
  for (const ch of value) {
    const size = byteLength(ch)
    if (used + size > maxBytes) break
    out += ch
    used += size
  }
  return out
}

/**
 * 複数の結果をまとめて埋める (user メッセージ 1 つにつき送り直しを 1 回にするため。data-model §3)。
 * 埋めた後の結果の合計が `maxTotalBytes` を超えるときは、**今回埋めた結果**を後ろから短くして `truncated` にする
 * (先に埋まっていた結果は削らない)。該当する呼び出しが 1 つも無ければ `null`。
 * 返す `applied` は埋めた結果の `toolUseId`。
 */
export function withToolResults(
  message: TranscriptMessageDTO,
  results: readonly ToolResult[],
  maxTotalBytes: number = RESEND_RESULT_MAX_BYTES
): { readonly message: TranscriptMessageDTO; readonly applied: readonly string[] } | null {
  let current = message
  const applied: string[] = []
  for (const result of results) {
    const next = withToolResult(current, result)
    if (next === null) continue
    current = next
    applied.push(result.toolUseId)
  }
  if (applied.length === 0) return null

  const appliedSet = new Set(applied)
  const fixedBytes = current.parts.reduce(
    (sum, part) =>
      part.type === 'tool-call' && part.result !== null && !appliedSet.has(part.toolCallId)
        ? sum + byteLength(part.result)
        : sum,
    0
  )
  let budget = Math.max(0, maxTotalBytes - fixedBytes)
  const parts = current.parts.map((part): TranscriptPartDTO => {
    if (part.type !== 'tool-call' || part.result === null || !appliedSet.has(part.toolCallId))
      return part
    const size = byteLength(part.result)
    if (size <= budget) {
      budget -= size
      return part
    }
    const cut = truncateBytes(part.result, budget)
    budget = 0
    return { ...part, result: cut, truncated: true }
  })
  return { message: { ...current, parts }, applied }
}

/** 結果を待っている tool-call の id (結果が `null` で id が空でないもの)。 */
export function pendingToolCallIds(message: TranscriptMessageDTO): readonly string[] {
  return message.parts.flatMap((part) =>
    part.type === 'tool-call' && part.result === null && part.toolCallId !== ''
      ? [part.toolCallId]
      : []
  )
}
