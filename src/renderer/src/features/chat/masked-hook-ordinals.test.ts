import { describe, expect, it } from 'vitest'

import { maskedHookOrdinals, type OrdinalMessage } from './masked-hook-ordinals'

/** O-11 FE-010 — 名前を伏せた Hook の番号 (019 data-model §1.3)。 */

const row = (
  id: string,
  detail: string,
  over: { name?: string; category?: string; role?: string } = {}
): OrdinalMessage => ({
  id,
  role: over.role ?? 'assistant',
  content: [
    {
      type: 'data',
      name: 'system-event',
      data: {
        category: over.category ?? 'hook',
        opens: true,
        name: over.name ?? '',
        detail,
        status: 'succeeded'
      }
    }
  ]
})
const user = (id: string): OrdinalMessage => ({
  id,
  role: 'user',
  content: [{ type: 'text', text: 'hi' }]
})

const entries = (messages: readonly OrdinalMessage[]): [string, number][] =>
  Array.from(maskedHookOrdinals(messages).entries())

describe('maskedHookOrdinals', () => {
  it('同じターン・同じ hook_event の中で出現順に 1, 2', () => {
    expect(entries([user('u'), row('a', 'PreToolUse'), row('b', 'PreToolUse')])).toEqual([
      ['a', 1],
      ['b', 2]
    ])
  })

  it('hook_event が違えば別に数える', () => {
    expect(
      entries([user('u'), row('a', 'PreToolUse'), row('b', 'PostToolUse'), row('c', 'PreToolUse')])
    ).toEqual([
      ['a', 1],
      ['b', 1],
      ['c', 2]
    ])
  })

  it('ターンが変われば 1 から数え直す', () => {
    expect(
      entries([user('u1'), row('a', 'Stop'), row('b', 'Stop'), user('u2'), row('c', 'Stop')])
    ).toEqual([
      ['a', 1],
      ['b', 2],
      ['c', 1]
    ])
  })

  it('名前のある行と他の category を数えない', () => {
    expect(
      entries([
        user('u'),
        row('named', 'PreToolUse', { name: 'PreToolUse:Bash' }),
        row('task', 'PreToolUse', { category: 'task' }),
        row('a', 'PreToolUse')
      ])
    ).toEqual([['a', 1]])
  })

  it('最初の user より前は 1 つのターン', () => {
    expect(
      entries([
        row('a', 'SessionStart'),
        row('b', 'SessionStart'),
        user('u'),
        row('c', 'SessionStart')
      ])
    ).toEqual([
      ['a', 1],
      ['b', 2],
      ['c', 1]
    ])
  })

  it('role が user でもシステムイベントの行はターンを区切らない', () => {
    expect(
      entries([
        user('u'),
        row('a', 'Stop'),
        row('x', 'Stop', { role: 'user', name: 'n' }),
        row('b', 'Stop')
      ])
    ).toEqual([
      ['a', 1],
      ['b', 2]
    ])
  })

  it('hook_event が空でも番号を付ける。壊れた data は数えない', () => {
    expect(
      entries([
        user('u'),
        row('a', ''),
        {
          id: 'bad',
          role: 'assistant',
          content: [{ type: 'data', name: 'system-event', data: { category: 'hook' } }]
        }
      ])
    ).toEqual([['a', 1]])
  })
})
