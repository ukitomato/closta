import type { ThreadMessageLike } from '@assistant-ui/react'

import type { SystemEventCategory } from '@domain/session/transcript-dto'

import { isSystemEventMessage, SYSTEM_EVENT_DATA_NAME } from './convert'
import { TURN_HEAD_EMPTY_LABEL } from './labels'
import { readMessageTime, readReceivedAt } from './message-time'

/**
 * ターンの導出 (O-9 / data-model §2・§3)。**メッセージの数に比例する 1 回の走査**。
 *
 * ターンは利用者の入力 1 つと、次の入力までのメッセージ。地図の行・中央の所要時間・公開口の `turns` の入力で、
 * 永続化しない (Principle X)。時刻は表示だけに使い、並べ替えない (AD-051)。
 */

/** 地図に印を出す境界の種類 (O-6 の 3 つ。表の順)。 */
export const TURN_MARK_CATEGORIES = ['compact-boundary', 'conversation-reset', 'refusal'] as const

export type TurnMark = (typeof TURN_MARK_CATEGORIES)[number]

/** 入力の先頭の長さ (コードポイント。§3)。 */
export const TURN_HEAD_MAX_CODE_POINTS = 60

export interface Turn {
  /** 始まりのメッセージの `id` (地図の行の key と移り先)。 */
  readonly id: string
  /** 1 から数えた番号。 */
  readonly ordinal: number
  /** 始まりのメッセージの時刻 (表示用)。無ければ `null`。 */
  readonly startedAt: number | null
  /** 所要時間の時計。始まりが受信時刻を持てば `'received'` (実行中)、持たなければ `'record'` (過去ログ)。 */
  readonly clock: 'received' | 'record'
  readonly endedAt: number | null
  readonly durationMs: number | null
  readonly head: string
  readonly toolCount: number
  readonly errorCount: number
  readonly marks: readonly TurnMark[]
}

type Part = Exclude<ThreadMessageLike['content'], string>[number]

function partsOf(message: ThreadMessageLike): readonly Part[] {
  return typeof message.content === 'string'
    ? [{ type: 'text', text: message.content }]
    : message.content
}

/** ターンの始まりか (user で、システムイベントの行でなく、tool-call でない part を 1 つ以上持つ)。 */
export function startsTurn(message: ThreadMessageLike): boolean {
  if (message.role !== 'user' || isSystemEventMessage(message)) return false
  return partsOf(message).some((p) => p.type !== 'tool-call')
}

/** 入力の先頭 (§3): 最初の text part の空白を畳み、先頭 60 コードポイントで切る。空なら「(本文なし)」。 */
function headOf(message: ThreadMessageLike): string {
  const text = partsOf(message).find((p) => p.type === 'text')
  const raw = text?.type === 'text' ? text.text : ''
  const folded = raw.replace(/\s+/gu, ' ').trim()
  if (folded === '') return TURN_HEAD_EMPTY_LABEL
  const points = Array.from(folded)
  return points.length > TURN_HEAD_MAX_CODE_POINTS
    ? `${points.slice(0, TURN_HEAD_MAX_CODE_POINTS).join('')}…`
    : folded
}

interface Builder {
  start: ThreadMessageLike
  ordinal: number
  clock: 'received' | 'record'
  endedAt: number | null
  toolCount: number
  errorCount: number
  marks: Set<TurnMark>
}

function isMark(value: unknown): value is TurnMark {
  return TURN_MARK_CATEGORIES.includes(value as TurnMark)
}

function absorb(b: Builder, message: ThreadMessageLike, isStart: boolean): void {
  for (const part of partsOf(message)) {
    if (part.type === 'tool-call') {
      b.toolCount += 1
      if (part.isError === true) b.errorCount += 1
    } else if (part.type === 'data' && part.name === SYSTEM_EVENT_DATA_NAME) {
      const category = (part.data as { category?: SystemEventCategory } | null)?.category
      if (isMark(category)) b.marks.add(category)
    }
  }
  if (isStart) return
  const value = b.clock === 'received' ? readReceivedAt(message) : readMessageTime(message)
  if (value !== null) b.endedAt = value
}

function finish(b: Builder, isLast: boolean, lastTurnOpen: boolean): Turn {
  const startedAt = readMessageTime(b.start)
  const begin = b.clock === 'received' ? readReceivedAt(b.start) : startedAt
  const open = isLast && lastTurnOpen
  const duration = begin === null || b.endedAt === null || open ? null : b.endedAt - begin
  return {
    id: b.start.id ?? '',
    ordinal: b.ordinal,
    startedAt,
    clock: b.clock,
    endedAt: b.endedAt,
    durationMs: duration === null || duration < 0 ? null : duration,
    head: headOf(b.start),
    toolCount: b.toolCount,
    errorCount: b.errorCount,
    marks: TURN_MARK_CATEGORIES.filter((c) => b.marks.has(c))
  }
}

/**
 * `messages` (記録の順) からターンを導く。`lastTurnOpen` は最後のターンがまだ終わっていないか
 * (稼働中で runtime が busy。過去ログは常に `false`)。最初の始まりより前のメッセージはどのターンにも入れない。
 */
export function deriveTurns(
  messages: readonly ThreadMessageLike[],
  lastTurnOpen: boolean
): readonly Turn[] {
  const builders: Builder[] = []
  let current: Builder | null = null
  for (const message of messages) {
    if (message.id !== undefined && startsTurn(message)) {
      current = {
        start: message,
        ordinal: builders.length + 1,
        clock: readReceivedAt(message) !== null ? 'received' : 'record',
        endedAt: null,
        toolCount: 0,
        errorCount: 0,
        marks: new Set()
      }
      builders.push(current)
      absorb(current, message, true)
    } else if (current !== null) {
      absorb(current, message, false)
    }
  }
  return builders.map((b, i) => finish(b, i === builders.length - 1, lastTurnOpen))
}
