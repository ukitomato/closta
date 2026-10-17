import { describe, expect, it } from 'vitest'

import type { ThreadMessageLike } from '@assistant-ui/react'

import { activityBins } from './activity-bins'
import { SYSTEM_EVENT_DATA_NAME } from './convert'
import { withMessageTime } from './message-time'

/** O-9 FE-030 — 区間の分け方 (data-model §4 の表 11 行。SC-004)。 */

const MIN = 60_000
const T0 = 1_800_000_000_000

function user(id: string, minutes: number): ThreadMessageLike {
  return withMessageTime(
    { role: 'user', id, content: [{ type: 'text', text: id }] },
    T0 + minutes * MIN
  )
}

function assistant(id: string, minutes: number, tools = 0): ThreadMessageLike {
  return withMessageTime(
    {
      role: 'assistant',
      id,
      content: [
        { type: 'text', text: id },
        ...Array.from({ length: tools }, (_, i) => ({
          type: 'tool-call' as const,
          toolCallId: `${id}-${i}`,
          toolName: 'Read',
          args: {},
          argsText: '{}'
        }))
      ]
    },
    T0 + minutes * MIN
  )
}

describe('activityBins (O-9 FE-030)', () => {
  it('#1 時刻を持つものが 0 / 1 つなら区間なし', () => {
    expect(activityBins([])).toEqual([])
    expect(activityBins([user('a', 0)])).toEqual([])
    expect(activityBins([{ role: 'user', id: 'x', content: 'no time' }, user('a', 0)])).toEqual([])
  })

  it('#2 同じ時刻の 2 つは区間 1 つ・活動 2・濃さ 4', () => {
    const bins = activityBins([user('a', 0), assistant('b', 0)])
    expect(bins).toHaveLength(1)
    expect(bins[0]).toMatchObject({ activity: 2, level: 4, targetId: 'a' })
  })

  it('#3 0 分と 30 分は区間 30、両端に活動 1 (濃さ 4)、中の 28 は 0', () => {
    const bins = activityBins([user('a', 0), user('b', 30)])
    expect(bins).toHaveLength(30)
    expect(bins[0]).toMatchObject({ activity: 1, level: 4, targetId: 'a' })
    expect(bins[29]).toMatchObject({ activity: 1, level: 4, targetId: 'b' })
    const middle = bins.slice(1, 29)
    expect(middle).toHaveLength(28)
    expect(middle.every((b) => b.activity === 0 && b.level === 0 && b.targetId === null)).toBe(true)
  })

  it('#4 0・47・48 分は 48 区間で、48 分は最後の区間に入り活動 2', () => {
    const bins = activityBins([user('a', 0), user('b', 47), user('c', 48)])
    expect(bins).toHaveLength(48)
    expect(bins[47]).toMatchObject({ activity: 2, targetId: 'b' })
    expect(bins[0]?.end).toBe(T0 + MIN)
    expect(bins[47]?.end).toBe(T0 + 48 * MIN)
  })

  it('#5 8 時間に 10 件は width 10 分・count 48', () => {
    const messages = Array.from({ length: 10 }, (_, i) => user(`m${i}`, i === 9 ? 480 : i * 50))
    const bins = activityBins(messages)
    expect(bins).toHaveLength(48)
    expect(bins[1]!.start - bins[0]!.start).toBe(10 * MIN)
  })

  it('#6 3 日は width = ceil(span / 48)・count 48', () => {
    const bins = activityBins([user('a', 0), user('b', 3 * 24 * 60)])
    const width = Math.ceil((3 * 24 * 60 * MIN) / 48)
    expect(bins).toHaveLength(48)
    expect(bins[1]!.start - bins[0]!.start).toBe(width)
  })

  it('#7 時計の戻り: 各メッセージは自分の時刻の区間に入り、移り先は区間の中で記録の順の最初', () => {
    const bins = activityBins([user('a', 10), user('b', 0), user('c', 20), user('d', 0.5)])
    expect(bins).toHaveLength(20)
    expect(bins[0]).toMatchObject({ activity: 2, targetId: 'b' })
    expect(bins[10]).toMatchObject({ activity: 1, targetId: 'a' })
    expect(bins[19]).toMatchObject({ activity: 1, targetId: 'c' })
  })

  it('#8 時刻の無いメッセージは数えない', () => {
    const bins = activityBins([
      { role: 'user', id: 'none', content: 'x' },
      user('a', 0),
      user('b', 1)
    ])
    expect(bins.reduce((n, b) => n + b.activity, 0)).toBe(2)
  })

  it('#9 tool-call の part 3 つの assistant は重み 4', () => {
    const bins = activityBins([user('a', 0), assistant('b', 0, 3)])
    expect(bins[0]?.activity).toBe(5)
  })

  it('#10 活動 1・2・8 (peak 8) は濃さ 1・1・4', () => {
    const messages = [
      user('a', 0),
      assistant('b', 10, 1),
      ...Array.from({ length: 8 }, (_, i) => user(`c${i}`, 20))
    ]
    const bins = activityBins(messages)
    expect(bins).toHaveLength(20)
    expect([bins[0]?.activity, bins[10]?.activity, bins[19]?.activity]).toEqual([1, 2, 8])
    expect([bins[0]?.level, bins[10]?.level, bins[19]?.level]).toEqual([1, 1, 4])
  })

  it('#11 システムイベントの行・divider だけが時刻を持つなら空', () => {
    const event = withMessageTime(
      {
        role: 'assistant',
        id: 'e',
        content: [{ type: 'text', text: 'hook' }],
        metadata: { custom: { systemEvent: true } }
      },
      T0
    )
    const divider = withMessageTime(
      {
        role: 'assistant',
        id: 'd',
        content: [
          { type: 'data', name: SYSTEM_EVENT_DATA_NAME, data: { category: 'compact-boundary' } }
        ]
      },
      T0 + MIN
    )
    expect(activityBins([event, divider, event, divider])).toEqual([])
  })
})
