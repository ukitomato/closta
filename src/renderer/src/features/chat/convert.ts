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

/**
 * 会話由来 (untrusted) の args から内部マーカー (`__` prefix) を除去する (design-gate PR-H-1)。
 *
 * `__subagentChildren` / `__truncated` は domain が付す**信頼**信号だが、`args` は argsText の parse 結果と
 * 同じ namespace を共有する。攻撃者が argsText に `__subagentChildren` を仕込むと偽の入れ子を描画できるため、
 * parse 結果からは常に `__` prefix を剥がし、信頼値だけを後段で明示設定する。
 */
function stripInternalKeys(args: ToolCallArgs): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(args ?? {})) {
    if (!key.startsWith('__')) out[key] = value
  }
  return out
}

function convertPart(part: TranscriptPartDTO): MessagePart {
  switch (part.type) {
    case 'text':
      return { type: 'text', text: part.text }
    case 'reasoning':
      return { type: 'reasoning', text: part.text }
    case 'tool-call': {
      // subagent 入れ子 (children) と切り詰めフラグは assistant-ui の tool-call part に専用フィールドが無いため
      // args に載せて Subagent / Code diff 表示へ渡す (R-4 / data-model §5 / design-gate M-N01)。argsText には現れない。
      // **untrusted の argsText 由来キーから `__` prefix を剥がし、信頼値を必ず明示設定する** — 攻撃者が
      // argsText に `__subagentChildren` / `__truncated` を仕込んで偽装するのを防ぐ (design-gate PR-H-1)。
      // DTO の children は JSON-safe だが TS の `ReadonlyJSONValue` に構造的に一致しない (index signature 無し) ため
      // `unknown` 経由で cast する。runtime は JSON で port2 を渡ってきた値であり安全。
      const args = {
        ...stripInternalKeys(parseArgs(part.argsText)),
        __subagentChildren: part.children,
        __truncated: part.truncated
      } as unknown as ToolCallArgs
      return {
        type: 'tool-call',
        toolCallId: part.toolCallId,
        toolName: part.toolName,
        args,
        argsText: part.argsText,
        result: part.result ?? undefined,
        isError: part.isError
      }
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
