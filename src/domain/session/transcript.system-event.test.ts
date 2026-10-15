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

  it('status / api_retry / task_progress / thinking_tokens から行を作らず、task の種類を変えない (O-4 / 014 plan RK-10)', () => {
    const out = toTranscriptMessages([
      system('s1', {
        subtype: 'task_started',
        task_id: 't1',
        description: 'ビルド',
        task_type: 'local_agent',
        is_backgrounded: true
      }),
      system('s2', { subtype: 'status', status: 'compacting', permissionMode: 'plan' }),
      system('s3', { subtype: 'status', status: null, compact_result: 'failed' }),
      system('s4', {
        subtype: 'api_retry',
        attempt: 1,
        max_retries: 10,
        retry_delay_ms: 500,
        error_status: 529,
        error: 'SECRET'
      }),
      system('s5', {
        subtype: 'task_progress',
        task_id: 't1',
        usage: { total_tokens: 10, tool_uses: 1, duration_ms: 100 },
        summary: 'SECRET'
      }),
      system('s6', { subtype: 'thinking_tokens', estimated_tokens: 42 })
    ])
    expect(out.map((m) => m.id)).toEqual(['task:t1'])
    expect(out[0]?.parts[0]).toMatchObject({ type: 'system-event', detail: 'local_agent' })
    expect(JSON.stringify(out)).not.toMatch(/SECRET/)
  })
})

describe('過去ログの system の本文の伏せ字 (O-6 BE-010 / data-model §1)', () => {
  const MARKS = [
    'Bearer abcdefgh12345678',
    'https://user:pw0rd@example.com/x',
    'AKIAABCDEFGHIJKLMNOP',
    'eyJhbGciOiJIUzI1.eyJzdWIiOiIxMjM0.abcdefgh',
    'token=hunter22secret'
  ]

  it('informational / local_command_output / 拒否の system の本文に伏せ字が当たり、DTO に目印が 0 件', () => {
    for (const subtype of ['informational', 'local_command_output', 'model_refusal_no_fallback']) {
      const out = toTranscriptMessages([
        system('s1', { subtype, content: `before ${MARKS.join(' ')} after` })
      ])
      const json = JSON.stringify(out)
      for (const mark of MARKS) expect(json).not.toContain(mark)
      expect(json).toContain('•••')
      expect(json).toContain('before')
    }
  })

  it('assistant / user の本文には伏せ字を当てない', () => {
    const text = `see ${MARKS.join(' ')}`
    const out = toTranscriptMessages([
      { type: 'user', uuid: 'u1', message: { role: 'user', content: text } },
      { type: 'assistant', uuid: 'a1', message: { role: 'assistant', content: text } }
    ])
    expect(out.map((m) => m.parts[0])).toEqual([
      { type: 'text', text },
      { type: 'text', text }
    ])
  })

  it('4 つの subtype から行を足さず、divider の生成は圧縮だけ (回帰)', () => {
    const out = toTranscriptMessages([
      system('s1', { subtype: 'model_refusal_fallback', fallback_model: 'm' }),
      system('s2', { subtype: 'informational', level: 'warning' }),
      system('s3', { subtype: 'conversation_reset' }),
      system('s4', { subtype: 'compact_boundary', compact_metadata: {} })
    ])
    const types = out.flatMap((m) => m.parts.map((p) => p.type))
    expect(types).not.toContain('system-event')
    expect(types.filter((t) => t === 'divider')).toHaveLength(1)
  })
})
