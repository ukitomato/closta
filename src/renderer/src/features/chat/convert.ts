import type { ThreadMessageLike } from '@assistant-ui/react'

import type { TranscriptMessageDTO, TranscriptPartDTO } from '@domain/session/transcript-dto'

import { readMessageTime, withMessageTime } from './message-time'
import { isSystemEventFields } from './transcript-guard'

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
      // コンパクション境界 (FR-018 / [USER] 確定)。実行中の行と同じ TranscriptBoundary で描くため、`compact-boundary` の
      // data part に写す (数は出さない。`label` は読まない。O-6 / 016 data-model §1「過去ログの圧縮」)。
      return systemEventDataPart({
        type: 'system-event',
        category: 'compact-boundary',
        opens: true,
        name: '',
        detail: '',
        status: 'marked'
      })
    case 'system-event':
      return systemEventDataPart(part)
  }
}

/* ── システムイベントの行 (O-2 / data-model §2「assistant-ui への写し」) ─────────────── */

type SystemEventPart = Extract<TranscriptPartDTO, { type: 'system-event' }>

/** data part の名前 (glossary の「システムイベントの行」。agents の kind `event` と区別する)。 */
export const SYSTEM_EVENT_DATA_NAME = 'system-event'

/** data part の `data` (DTO の part から `type` を除いたもの)。 */
export type SystemEventData = Omit<SystemEventPart, 'type'>

function systemEventDataPart(part: SystemEventPart): MessagePart {
  const data: SystemEventData = {
    category: part.category,
    opens: part.opens,
    name: part.name,
    detail: part.detail,
    status: part.status
  }
  return { type: 'data', name: SYSTEM_EVENT_DATA_NAME, data }
}

/** ThreadMessageLike がシステムイベントの行か (`metadata.custom.systemEvent`)。 */
export function isSystemEventMessage(message: ThreadMessageLike): boolean {
  return message.metadata?.custom?.systemEvent === true
}

/**
 * 変換済みのシステムイベントの行から DTO を復元する (実行中の store が domain の `mergeSystemEvent` に渡すため。
 * data-model §2「renderer の store での合成」/ design-gate R2 architecture M-101)。行でなければ `undefined`。
 */
export function fromSystemEventData(message: ThreadMessageLike): TranscriptMessageDTO | undefined {
  if (!isSystemEventMessage(message) || message.id === undefined) return undefined
  const content = message.content
  if (typeof content === 'string' || content.length !== 1) return undefined
  const part = content[0]
  if (part?.type !== 'data' || part.name !== SYSTEM_EVENT_DATA_NAME) return undefined
  const data: unknown = part.data
  if (!isSystemEventFields(data)) return undefined
  return {
    id: message.id,
    role: 'system',
    parts: [
      {
        type: 'system-event',
        category: data.category,
        opens: data.opens,
        name: data.name,
        detail: data.detail,
        status: data.status
      }
    ],
    createdAt: readMessageTime(message)
  }
}

/**
 * assistant-ui の system ロールは text の part を 1 つしか受けない (`@assistant-ui/core` の
 * `thread-message-like.ts:269-273`。外れると変換が例外を投げる)。
 */
function isPlainSystemContent(content: readonly MessagePart[]): boolean {
  return content.length === 1 && content[0]?.type === 'text'
}

export function toThreadMessage(dto: TranscriptMessageDTO): ThreadMessageLike {
  // 圧縮の境界の記録 (divider) は境界だけを描く。同じ記録の本文 (SDK の定型文など) を境界の後に重ねて出さない
  // (016 plan RK-10。DTO は変えず、ここで境界のメッセージにする)。
  const parts =
    dto.role === 'system' && dto.parts.some((p) => p.type === 'divider')
      ? dto.parts.filter((p) => p.type === 'divider')
      : dto.parts
  const content = parts.map(convertPart)
  const systemEvent = dto.parts.length === 1 && dto.parts[0]?.type === 'system-event'
  // システムイベントの行は DTO では `system` (意味として) のまま、assistant-ui には data part 1 つの assistant で渡す
  // (research R-04 / design-gate R1 architecture H-001)。text 1 つでない system も同じ理由で assistant に倒す。
  const role = dto.role === 'system' && !isPlainSystemContent(content) ? 'assistant' : dto.role
  const like: ThreadMessageLike = {
    role,
    content,
    id: dto.id,
    ...(systemEvent ? { metadata: { custom: { systemEvent: true } } } : {})
  }
  // 時刻は `createdAt` と `metadata.custom.createdAt` の両方に入れる (表示は後者だけを読む。O-9 / AD-051)。
  return dto.createdAt !== null && Number.isFinite(dto.createdAt)
    ? withMessageTime(like, dto.createdAt)
    : like
}
