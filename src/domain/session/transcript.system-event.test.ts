import { describe, expect, it } from 'vitest'

import { toTranscriptMessages, type SessionMessageLike } from './transcript'

/** O-2 BE-022 — 過去ログの Hook / Background task のシステムメッセージ (実行中と同じ合成の規則)。 */

function system(uuid: string, message: Record<string, unknown>): SessionMessageLike {
  return { type: 'system', uuid, message }
}

describe('toTranscriptMessages のシステムイベント', () => {
  it('同じ task の開始・更新・通知を 1 行に合成し、状態の無い更新で状態を保つ', () => {
    const out = toTranscriptMessages([
      system('s1', {
        subtype: 'task_started',
        task_id: 't1',
        description: 'ビルド',
        task_type: 'local_agent',
        is_backgrounded: true
      }),
      { type: 'user', uuid: 'u1', message: { role: 'user', content: '続けて' } },
      system('s2', { subtype: 'task_updated', task_id: 't1', patch: { end_time: 1 } }),
      system('s3', {
        subtype: 'task_notification',
        task_id: 't1',
        status: 'completed',
        summary: 'SECRET'
      })
    ])
    expect(out.map((m) => m.id)).toEqual(['task:t1', 'u1'])
    expect(out[0]?.parts[0]).toMatchObject({
      type: 'system-event',
      name: 'ビルド',
      status: 'completed'
    })
    expect(JSON.stringify(out)).not.toMatch(/SECRET/)
  })

  it('行の無い task への更新は捨て、隠した task は出さない', () => {
    const out = toTranscriptMessages([
      system('s1', {
        subtype: 'task_started',
        task_id: 't1',
        description: 'hidden',
        is_backgrounded: true,
        skip_transcript: true
      }),
      system('s2', {
        subtype: 'task_updated',
        task_id: 't1',
        patch: { status: 'running', description: 'leak' }
      }),
      system('s3', { subtype: 'task_updated', task_id: 't9', patch: { status: 'running' } })
    ])
    expect(out).toEqual([])
  })

  it('Hook の開始と応答は 1 行になり、コンパクション境界は従来どおり divider', () => {
    const out = toTranscriptMessages([
      system('s1', {
        subtype: 'hook_started',
        hook_id: 'h1',
        hook_name: 'lint',
        hook_event: 'SessionStart'
      }),
      system('s2', {
        subtype: 'hook_response',
        hook_id: 'h1',
        hook_name: 'lint',
        hook_event: 'SessionStart',
        outcome: 'success',
        stdout: 'SECRET'
      }),
      system('s3', { subtype: 'compact_boundary', compact_metadata: {} })
    ])
    expect(out.map((m) => m.id)).toEqual(['hook:h1', 's3'])
    expect(out[0]?.parts[0]).toMatchObject({ type: 'system-event', status: 'succeeded' })
    expect(out[1]?.parts[0]).toMatchObject({ type: 'divider' })
    expect(JSON.stringify(out)).not.toMatch(/SECRET/)
  })
})
