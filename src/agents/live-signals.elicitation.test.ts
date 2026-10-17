import { describe, expect, it, vi } from 'vitest'

import type { SessionEvent } from '@domain/session/agent-session'
import { toSystemEventMessage } from '@domain/session/system-event'

import { createLiveSignals } from './live-signals'

/** O-10 BE-023 — `elicitation_complete` の行 (data-model §5。SC-005)。 */

const MARK = 'O10-LEAK-MARK'

function setup(): { signals: ReturnType<typeof createLiveSignals>; emitted: SessionEvent[] } {
  const emitted: SessionEvent[] = []
  const signals = createLiveSignals({
    launchPermissionMode: 'default',
    emit: (event) => emitted.push(event),
    clock: { now: () => 7, setTimer: vi.fn(), clearTimer: vi.fn() }
  })
  return { signals, emitted }
}

const complete = (extra: Record<string, unknown>): unknown => ({
  type: 'system',
  subtype: 'elicitation_complete',
  ...extra
})

function rowOf(event: SessionEvent | undefined): Record<string, unknown> {
  if (event?.kind !== 'message') throw new Error('not a message event')
  const part = event.message.parts[0]
  if (part?.type !== 'system-event') throw new Error('not a system-event part')
  return { id: event.message.id, createdAt: event.message.createdAt, ...part }
}

describe('elicitation_complete の行', () => {
  it('id・category・opens・name・detail・status・時刻', () => {
    const { signals, emitted } = setup()
    signals.onSystem(complete({ mcp_server_name: 'github', elicitation_id: 'el-1' }))
    expect(emitted).toHaveLength(1)
    expect(rowOf(emitted[0])).toEqual({
      id: 'elicitation:el-1',
      createdAt: 7,
      type: 'system-event',
      category: 'elicitation',
      opens: true,
      name: 'github',
      detail: '',
      status: 'completed'
    })
  })

  it('サーバー名の形が外れると name が空', () => {
    const { signals, emitted } = setup()
    signals.onSystem(complete({ mcp_server_name: 'a b', elicitation_id: 'el-1' }))
    signals.onSystem(complete({ mcp_server_name: 5, elicitation_id: 'el-2' }))
    expect(rowOf(emitted[0]).name).toBe('')
    expect(rowOf(emitted[1]).name).toBe('')
  })

  it('elicitation_id の形が外れると uuid の id', () => {
    const { signals, emitted } = setup()
    signals.onSystem(complete({ mcp_server_name: 's', elicitation_id: 'a b' }))
    signals.onSystem(complete({ mcp_server_name: 's' }))
    for (const e of emitted) {
      expect(rowOf(e).id).toMatch(
        /^elicitation:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
      )
    }
  })

  it('読まないフィールドは SessionEvent に 0 件・対応する要求が無くても行が出る', () => {
    const { signals, emitted } = setup()
    signals.onSystem(
      complete({
        mcp_server_name: 's',
        elicitation_id: 'el-1',
        uuid: MARK,
        session_id: MARK,
        extra: MARK
      })
    )
    expect(emitted).toHaveLength(1)
    expect(JSON.stringify(emitted)).not.toContain(MARK)
  })

  it('過去ログの変換 (toSystemEventMessage) は行を作らない (実行中だけの経路。回帰)', () => {
    expect(
      toSystemEventMessage(complete({ mcp_server_name: 's', elicitation_id: 'el-1' }), 0)
    ).toBeNull()
  })
})
