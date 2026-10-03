import {
  orphanResultPart,
  pendingToolCallIds,
  readToolResult,
  withToolResults,
  type ToolResult
} from '@domain/session/tool-result'
import type { TranscriptMessageDTO } from '@domain/session/transcript-dto'

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
 */

/** 結果待ちのメッセージの上限 (data-model §3 [ASSUMED])。 */
export const MAX_PENDING_TOOL_MESSAGES = 256

export interface LiveToolResultTracker {
  /** 送った assistant メッセージを覚える (結果待ちの tool_use が無ければ何もしない)。 */
  trackAssistant(message: TranscriptMessageDTO): void
  /** SDK の `user` メッセージ (未信頼) から、送り直すメッセージ (同じ id) と結果だけのメッセージを返す。 */
  applyUserMessage(raw: unknown): readonly TranscriptMessageDTO[]
  /** 覚えているメッセージの数 (テスト用の観測点)。 */
  pendingMessageCount(): number
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

function orphanMessage(result: ToolResult): TranscriptMessageDTO {
  return {
    id: `result:${result.toolUseId}`,
    role: 'assistant',
    parts: [orphanResultPart(result)],
    createdAt: null
  }
}

export function createLiveToolResultTracker(): LiveToolResultTracker {
  // toolUseId → messageId / messageId → 最後に送った DTO (挿入順 = 古い順)。
  const pendingToolCalls = new Map<string, string>()
  const lastMessages = new Map<string, TranscriptMessageDTO>()

  const forget = (messageId: string): void => {
    const message = lastMessages.get(messageId)
    if (message === undefined) return
    lastMessages.delete(messageId)
    for (const id of pendingToolCallIds(message)) {
      // 同じ toolUseId が後のメッセージに付け替わっていれば消さない。
      if (pendingToolCalls.get(id) === messageId) pendingToolCalls.delete(id)
    }
  }

  return {
    trackAssistant(message) {
      const ids = pendingToolCallIds(message)
      if (ids.length === 0) return
      forget(message.id)
      lastMessages.set(message.id, message)
      for (const id of ids) pendingToolCalls.set(id, message.id)
      while (lastMessages.size > MAX_PENDING_TOOL_MESSAGES) {
        const oldest = lastMessages.keys().next().value
        if (oldest === undefined) break
        forget(oldest)
      }
    },

    applyUserMessage(raw) {
      const results = toolResultsOf(raw)
      if (results.length === 0) return []

      // 対象のメッセージごとにまとめる (送り直しを 1 メッセージ 1 回にする)。
      const groups = new Map<string, ToolResult[]>()
      const orphans: ToolResult[] = []
      for (const result of results) {
        const messageId = pendingToolCalls.get(result.toolUseId)
        if (messageId === undefined) {
          orphans.push(result)
          continue
        }
        const group = groups.get(messageId)
        if (group === undefined) groups.set(messageId, [result])
        else group.push(result)
      }

      const out: TranscriptMessageDTO[] = []
      for (const [messageId, group] of groups) {
        const current = lastMessages.get(messageId)
        const filled = current === undefined ? null : withToolResults(current, group)
        if (filled === null) {
          orphans.push(...group)
          continue
        }
        const applied = new Set(filled.applied)
        for (const id of applied) pendingToolCalls.delete(id)
        for (const result of group) if (!applied.has(result.toolUseId)) orphans.push(result)
        if (pendingToolCallIds(filled.message).length === 0) lastMessages.delete(messageId)
        else lastMessages.set(messageId, filled.message)
        out.push(filled.message)
      }
      for (const result of orphans) out.push(orphanMessage(result))
      return out
    },

    pendingMessageCount() {
      return lastMessages.size
    }
  }
}
