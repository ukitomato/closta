import { SYSTEM_EVENT_DATA_NAME } from './convert'
import { isSystemEventFields } from './transcript-guard'

/**
 * 名前を伏せた Hook の行の番号 (O-11 / 019 data-model §1.3)。純関数。
 *
 * - 対象: category `hook` で `name === ''` の行だけ
 * - 番号 (1 から): 同じターンの中で、同じ `hook_event` の行の出現順。ターンは role `user` のメッセージ (システムイベントの
 *   行でないもの) で区切る。最初の user より前は 1 つのターン
 * - 番号は表示の位置からの導出で、DTO・ストアに持たない
 */

/** thread のメッセージのうち、ここで読む形 (assistant-ui の `ThreadMessage` / `ThreadMessageLike` の部分)。 */
export interface OrdinalMessage {
  readonly id?: string | undefined
  readonly role: string
  readonly content: unknown
}

/** 行の data part の中身 (検証済み) を取り出す。システムイベントの行でなければ null。 */
function systemEventFieldsOf(
  message: OrdinalMessage
): { readonly category: string; readonly name: string; readonly detail: string } | null {
  const content = message.content
  if (!Array.isArray(content) || content.length !== 1) return null
  const part: unknown = content[0]
  if (typeof part !== 'object' || part === null) return null
  const record = part as Record<string, unknown>
  if (record.type !== 'data' || record.name !== SYSTEM_EVENT_DATA_NAME) return null
  return isSystemEventFields(record.data) ? record.data : null
}

export function maskedHookOrdinals(
  messages: readonly OrdinalMessage[]
): ReadonlyMap<string, number> {
  const result = new Map<string, number>()
  let counts = new Map<string, number>()
  for (const message of messages) {
    const row = systemEventFieldsOf(message)
    if (row === null) {
      if (message.role === 'user') counts = new Map()
      continue
    }
    if (row.category !== 'hook' || row.name !== '' || message.id === undefined) continue
    const next = (counts.get(row.detail) ?? 0) + 1
    counts.set(row.detail, next)
    result.set(message.id, next)
  }
  return result
}
