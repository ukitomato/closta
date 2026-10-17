import { describe, expect, it } from 'vitest'

import type { ThreadMessageLike } from '@assistant-ui/react'

import { SYSTEM_EVENT_DATA_NAME } from './convert'
import { TURN_HEAD_EMPTY_LABEL } from './labels'
import { withMessageTime, withReceivedAt } from './message-time'
import { deriveTurns } from './turns'

const user = (
  id: string,
  text: string,
  at: number | null,
  received?: number
): ThreadMessageLike => {
  let m: ThreadMessageLike = { role: 'user', content: [{ type: 'text', text }], id }
  if (at !== null) m = withMessageTime(m, at)
  if (received !== undefined) m = withReceivedAt(m, received)
  return m
}
const assistant = (
  id: string,
  at: number | null,
  received?: number,
  content: ThreadMessageLike['content'] = [{ type: 'text', text: 'ok' }]
): ThreadMessageLike => {
  let m: ThreadMessageLike = { role: 'assistant', content, id }
  if (at !== null) m = withMessageTime(m, at)
  if (received !== undefined) m = withReceivedAt(m, received)
  return m
}
const tool = (id: string, isError = false): ThreadMessageLike['content'] => [
  { type: 'tool-call', toolCallId: id, toolName: 'Read', args: {}, argsText: '{}', isError }
]
const marker = (id: string, category: string, at: number): ThreadMessageLike =>
  withMessageTime(
    {
      role: 'assistant',
      id,
      content: [{ type: 'data', name: SYSTEM_EVENT_DATA_NAME, data: { category } }],
      metadata: { custom: { systemEvent: true } }
    },
    at
  )

describe('deriveTurns (O-9 FE-011)', () => {
  it('孤児の tool の結果 (assistant) とシステムイベントは始まりにならず、最初の始まりより前は入らない', () => {
    const turns = deriveTurns(
      [assistant('r', 1), marker('m', 'hook', 2), user('u1', 'a', 10), assistant('a1', 14)],
      false
    )
    expect(turns.map((t) => t.id)).toEqual(['u1'])
    expect(turns[0]?.durationMs).toBe(4)
  })

  it('endedAt は始まりを除いた記録の順で最後の時刻', () => {
    const turns = deriveTurns(
      [user('u1', 'a', 100), assistant('a1', 200), assistant('a1', 300), user('u2', 'b', 400)],
      false
    )
    expect(turns[0]?.endedAt).toBe(300)
    expect(turns[0]?.durationMs).toBe(200)
    expect(turns[1]?.durationMs).toBeNull()
    expect(turns.map((t) => t.ordinal)).toEqual([1, 2])
  })

  it('durationMs は時刻無し・開いている最後・負で null、0 は 0', () => {
    expect(
      deriveTurns([user('u', 'a', null), assistant('x', null)], false)[0]?.durationMs
    ).toBeNull()
    expect(deriveTurns([user('u', 'a', 1), assistant('x', 5)], true)[0]?.durationMs).toBeNull()
    expect(deriveTurns([user('u', 'a', 9), assistant('x', 5)], false)[0]?.durationMs).toBeNull()
    expect(deriveTurns([user('u', 'a', 5), assistant('x', 5)], false)[0]?.durationMs).toBe(0)
    expect(
      deriveTurns([user('u1', 'a', 1), assistant('x', 5), user('u2', 'b', 6)], true)[0]?.durationMs
    ).toBe(4)
  })

  it('時計が 2 つ: 始まりが receivedAt を持てば receivedAt どうしで引く', () => {
    for (const skew of [300_000, -300_000, 0]) {
      const turns = deriveTurns(
        [user('u', 'a', 1_000 + skew, 1_000), assistant('x', 99_999 + skew, 5_000)],
        false
      )
      expect(turns[0]?.durationMs).toBe(4_000)
    }
    const record = deriveTurns([user('u', 'a', 1_000), assistant('x', 6_000)], false)
    expect(record[0]?.durationMs).toBe(5_000)
  })

  it('toolCount / errorCount / marks (表の順・重複なし)', () => {
    const turns = deriveTurns(
      [
        user('u', 'a', 1),
        assistant('a1', 2, undefined, tool('c1')),
        assistant('a2', 3, undefined, tool('c2', true)),
        marker('m1', 'refusal', 4),
        marker('m2', 'compact-boundary', 5),
        marker('m3', 'refusal', 6),
        marker('m4', 'hook', 7)
      ],
      false
    )
    expect(turns[0]?.toolCount).toBe(2)
    expect(turns[0]?.errorCount).toBe(1)
    expect(turns[0]?.marks).toEqual(['compact-boundary', 'refusal'])
  })

  it('head: 空白を畳み 60 コードポイントで切る (サロゲートペアを割らない)・本文なし', () => {
    expect(deriveTurns([user('u', '  a \n\n  b  ', 1)], false)[0]?.head).toBe('a b')
    const long = '😀'.repeat(70)
    expect(deriveTurns([user('u', long, 1)], false)[0]?.head).toBe(`${'😀'.repeat(60)}…`)
    const image: ThreadMessageLike = {
      role: 'user',
      id: 'i',
      content: [{ type: 'image', image: 'data:image/png;base64,AA' }]
    }
    expect(deriveTurns([image], false)[0]?.head).toBe(TURN_HEAD_EMPTY_LABEL)
  })
})
