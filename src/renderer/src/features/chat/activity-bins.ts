import type { ThreadMessageLike } from '@assistant-ui/react'

import { isServerToolCallPart, isSystemEventMessage } from './convert'
import { readMessageTime } from './message-time'

/**
 * 活動の区間 (O-9 / data-model §4)。**メッセージの数に比例する 1 回の走査**。開いている会話 1 つの時間を区間に分ける
 * 純関数で、永続化しない。時刻は表示だけに使い、並べ替えない (AD-051)。
 */

/** 区間の数の目安 (`width` の算出に使う)。 */
const TARGET_BINS = 48
/** 区間の幅の下限 (ms)。 */
const MIN_WIDTH_MS = 60_000
/** 濃さの段の数 (1〜4。0 は活動なし)。 */
const LEVELS = 4

export interface ActivityBin {
  /** 区間の番号 (0 から)。 */
  readonly index: number
  /** 区間の始まり (含む。ms)。 */
  readonly start: number
  /** 区間の終わり (含まない。最後の区間だけ最大の時刻を含む。ms)。 */
  readonly end: number
  /** 区間に入るメッセージの重みの和。 */
  readonly activity: number
  /** 0 (活動なし) または 1〜4。 */
  readonly level: 0 | 1 | 2 | 3 | 4
  /** 区間に入るメッセージのうち記録の順で最初のもの (活動が 0 なら `null`)。 */
  readonly targetId: string | null
}

/** 対象か (user / assistant で、システムイベントの行でなく、data part だけでない)。 */
function weightOf(message: ThreadMessageLike): number | null {
  if (message.role !== 'user' && message.role !== 'assistant') return null
  if (isSystemEventMessage(message)) return null
  if (typeof message.content === 'string') return 1
  if (message.role === 'assistant' && message.content.every((p) => p.type === 'data')) return null
  let tools = 0
  for (const part of message.content) {
    // サーバー側の tool は数えない (O-12)。
    if (part.type === 'tool-call' && !isServerToolCallPart(part)) tools += 1
  }
  return 1 + tools
}

/** `messages` (記録の順) から区間を作る。時刻を持つ対象が 2 つ未満なら空 (空の状態)。 */
export function activityBins(messages: readonly ThreadMessageLike[]): readonly ActivityBin[] {
  const items: { time: number; weight: number; id: string | null }[] = []
  let min = Infinity
  let max = -Infinity
  for (const message of messages) {
    const weight = weightOf(message)
    if (weight === null) continue
    const time = readMessageTime(message)
    if (time === null) continue
    items.push({ time, weight, id: message.id ?? null })
    if (time < min) min = time
    if (time > max) max = time
  }
  if (items.length < 2) return []

  const span = max - min
  const width = Math.max(MIN_WIDTH_MS, Math.ceil(span / TARGET_BINS))
  const count = Math.max(1, Math.ceil(span / width))
  const activity = new Array<number>(count).fill(0)
  const targets = new Array<string | null>(count).fill(null)
  for (const item of items) {
    const i = Math.min(count - 1, Math.floor((item.time - min) / width))
    activity[i] = (activity[i] ?? 0) + item.weight
    if (targets[i] === null) targets[i] = item.id
  }
  const peak = Math.max(...activity)
  return activity.map((a, i) => ({
    index: i,
    start: min + i * width,
    end: i === count - 1 ? max : min + (i + 1) * width,
    activity: a,
    level: (a === 0 ? 0 : Math.ceil((LEVELS * a) / peak)) as ActivityBin['level'],
    targetId: a === 0 ? null : (targets[i] ?? null)
  }))
}
