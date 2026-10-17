import { describe, expect, it } from 'vitest'

import type { ThreadMessageLike } from '@assistant-ui/react'

import {
  formatMessageTime,
  formatMessageTimeFull,
  formatTurnDuration,
  readMessageTime,
  readReceivedAt,
  withMessageTime,
  withReceivedAt
} from './message-time'

const base: ThreadMessageLike = { role: 'user', content: [{ type: 'text', text: 'hi' }], id: 'u1' }
/** ローカル時刻から epoch ms を作る (テストのタイムゾーンに依らない)。 */
const local = (y: number, mo: number, d: number, h = 0, mi = 0, s = 0): number =>
  new Date(y, mo - 1, d, h, mi, s).getTime()

describe('message-time (O-9 FE-010)', () => {
  it('createdAt が無いメッセージは null (assistant-ui の既定値「今」を拾わない)', () => {
    expect(readMessageTime(base)).toBeNull()
    expect(readMessageTime({ ...base, createdAt: new Date() })).toBeNull()
  })

  it('withMessageTime は createdAt と metadata.custom.createdAt に入れ、systemEvent と同居する', () => {
    const like = withMessageTime(
      { ...base, metadata: { custom: { systemEvent: true } } },
      1_700_000_000_000
    )
    expect(like.createdAt?.getTime()).toBe(1_700_000_000_000)
    expect(like.metadata?.custom).toEqual({ systemEvent: true, createdAt: 1_700_000_000_000 })
    expect(readMessageTime(like)).toBe(1_700_000_000_000)
  })

  it('有限でない値は null', () => {
    expect(readMessageTime({ ...base, metadata: { custom: { createdAt: Number.NaN } } })).toBeNull()
    expect(readMessageTime({ ...base, metadata: { custom: { createdAt: '1' } } })).toBeNull()
    expect(readReceivedAt({ ...base, metadata: { custom: { receivedAt: Infinity } } })).toBeNull()
  })

  it('receivedAt は createdAt と独立', () => {
    const like = withReceivedAt(withMessageTime(base, 10), 20)
    expect(readMessageTime(like)).toBe(10)
    expect(readReceivedAt(like)).toBe(20)
    expect(readReceivedAt(withMessageTime(base, 10))).toBeNull()
  })

  it('短い書式: 今日は HH:mm、前日は M/D HH:mm (0 で埋めない)、24 時間制', () => {
    const now = local(2026, 10, 17, 12, 0)
    expect(formatMessageTime(local(2026, 10, 17, 9, 5), now)).toBe('09:05')
    expect(formatMessageTime(local(2026, 10, 17, 21, 30), now)).toBe('21:30')
    expect(formatMessageTime(local(2026, 10, 16, 23, 59), now)).toBe('10/16 23:59')
    expect(formatMessageTime(local(2026, 3, 5, 0, 7), now)).toBe('3/5 00:07')
    expect(formatMessageTime(local(2025, 10, 17, 9, 5), now)).toBe('10/17 09:05')
  })

  it('全体の書式は YYYY/MM/DD HH:mm:ss', () => {
    expect(formatMessageTimeFull(local(2026, 3, 5, 0, 7, 9))).toBe('2026/03/05 00:07:09')
    expect(formatMessageTimeFull(local(2026, 10, 17, 23, 59, 59))).toBe('2026/10/17 23:59:59')
  })

  it('所要時間 (端数は切り捨て)', () => {
    expect(formatTurnDuration(5_000)).toBe('所要 0:05')
    expect(formatTurnDuration(5_999)).toBe('所要 0:05')
    expect(formatTurnDuration(0)).toBe('所要 0:00')
    expect(formatTurnDuration(59 * 60_000 + 59_000)).toBe('所要 59:59')
    expect(formatTurnDuration(3_600_000)).toBe('所要 1:00:00')
  })
})
