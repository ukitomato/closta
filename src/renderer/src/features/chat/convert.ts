import type { ThreadMessageLike } from '@assistant-ui/react'

import type { TranscriptMessageDTO, TranscriptPartDTO } from '@domain/session/transcript-dto'

/**
 * `TranscriptMessageDTO` (domain / port 由来) を assistant-ui の `ThreadMessageLike` に変換する (R-3 / FE-031)。
 *
 * **`domain` は assistant-ui を import しない**ため、DTO ↔ runtime 形の写しは `ui` 側のここで行う。
 * 本文サニタイズと tool_use↔tool_result の対応づけは `domain` の `transcript.ts` が済ませているので、
 * ここは**部品の形を assistant-ui の part に写すだけ** (規則を持たない)。
 */

type MessagePart = Extract<ThreadMessageLike['content'], readonly unknown[]>[number]
type ToolCallArgs = Extract<MessagePart, { type: 'tool-call' }>['args']

function parseArgs(argsText: string): ToolCallArgs {
  if (argsText.length === 0) return {}
  try {
    const value: unknown = JSON.parse(argsText)
    return typeof value === 'object' && value !== null ? (value as ToolCallArgs) : {}
  } catch {
    return {}
  }
}

function convertPart(part: TranscriptPartDTO): MessagePart {
  switch (part.type) {
    case 'text':
      return { type: 'text', text: part.text }
    case 'reasoning':
      return { type: 'reasoning', text: part.text }
    case 'tool-call':
      return {
        type: 'tool-call',
        toolCallId: part.toolCallId,
        toolName: part.toolName,
        args: parseArgs(part.argsText),
        argsText: part.argsText,
        result: part.result ?? undefined,
        isError: part.isError
      }
    case 'image':
      return { type: 'image', image: part.url }
    case 'file':
      // R-3 は最小表示。File element への完全対応は R-4 / O-2 に譲り、ファイル名を text で示す。
      return { type: 'text', text: `📎 ${part.filename}` }
    case 'divider':
      // コンパクション境界の最小の区切り (FR-018 / [USER] 確定)。専用 element は O-2。
      return { type: 'text', text: `── ${part.label} ──` }
  }
}

export function toThreadMessage(dto: TranscriptMessageDTO): ThreadMessageLike {
  return {
    role: dto.role,
    content: dto.parts.map(convertPart),
    id: dto.id,
    ...(dto.createdAt !== null ? { createdAt: new Date(dto.createdAt) } : {})
  }
}
