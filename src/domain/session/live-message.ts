import { sanitizeBody } from './sanitize-body'
import type { TranscriptMessageDTO, TranscriptPartDTO } from './transcript-dto'
import { parseMessageTime } from './transcript-time'

/**
 * live stream の `SDKAssistantMessage` → `TranscriptMessageDTO` の**純粋変換** (X-1 / FR-008・FR-009)。
 *
 * `SDKAssistantMessage.message` は Anthropic Messages API 形状の `BetaMessage` で、content は
 * text / thinking / tool_use のブロック配列 (sdk.d.ts:3339-3344)。R-3 の `TranscriptMessageDTO` へ写し、
 * renderer が R-3/R-4 の表示基盤 (`convert.ts`) で描画する。**SDK を import しない** (構造型で受ける)。
 *
 * **本文は取得プロセス (agents) 側でサニタイズ**する — 完結メッセージ単位で `sanitizeBody` を適用し、
 * 双方向制御文字・C0/C1 を除去しバイト長上限で切り詰める (FR-009 / SC-008)。`toolName` / argsText も同様 (H-05)。
 * 逐次生成は `SDKAssistantMessage` の**メッセージ単位更新**で扱い、`SDKPartialAssistantMessage` の
 * チャンク単位は採らない (AD-020 Open Q / design-gate H-06。チャンク境界で bidi/サロゲートを割らない)。
 */

/** `SDKAssistantMessage` の本変換が使う構造だけ (SDK 非 import)。 */
export interface LiveAssistantMessage {
  readonly type: 'assistant'
  readonly uuid: string
  readonly message: { readonly content?: unknown }
  /** SDK の時刻 (ISO 8601。未信頼。O-9 / AD-051)。無い・壊れ・範囲外は受信時刻にする。 */
  readonly timestamp?: unknown
}

function safeJsonString(input: unknown): string {
  if (typeof input === 'string') return input
  try {
    return JSON.stringify(input) ?? ''
  } catch {
    return ''
  }
}

/**
 * assistant メッセージを表示 DTO に変換する。**未知のブロック型は落とす** (割当は docs/ui-coverage.md の B 節)。
 * tool の結果は後から届く `user` メッセージで `withToolResults` が埋める (`tool-result.ts`。O-2 / FR-007)。
 * content が配列でない / ブロックが object でない場合も例外を投げず空 parts に倒す (行を落とさない)。
 */
export function toLiveAssistantMessage(
  msg: LiveAssistantMessage,
  receivedAt: number
): TranscriptMessageDTO {
  const content = Array.isArray(msg.message.content) ? msg.message.content : []
  const parts: TranscriptPartDTO[] = []

  for (const block of content) {
    if (typeof block !== 'object' || block === null) continue
    const b = block as Record<string, unknown>
    switch (b.type) {
      case 'text':
        parts.push({ type: 'text', text: sanitizeBody(b.text).value })
        break
      case 'thinking':
        parts.push({ type: 'reasoning', text: sanitizeBody(b.thinking).value })
        break
      case 'redacted_thinking':
        // 過去ログ (`transcript.ts`) と同じ文言にそろえる (O-2 / FR-007)。
        parts.push({ type: 'reasoning', text: '[redacted thinking]' })
        break
      case 'tool_use': {
        const args = sanitizeBody(safeJsonString(b.input))
        parts.push({
          type: 'tool-call',
          toolCallId: typeof b.id === 'string' ? b.id : '',
          toolName: sanitizeBody(b.name).value,
          argsText: args.value,
          result: null,
          isError: false,
          truncated: args.truncated,
          children: []
        })
        break
      }
      default:
        // server_tool_use など専用表示を持たないブロックは落とす (割当は docs/ui-coverage.md の B 節。O-12)。
        break
    }
  }

  return {
    id: msg.uuid,
    role: 'assistant',
    parts,
    createdAt: parseMessageTime(msg.timestamp, receivedAt) ?? receivedAt
  }
}
