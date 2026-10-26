import { describe, expect, it } from 'vitest'

import { toNoticeRow } from './notice-rows'
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

describe('過去ログのシステムイベントの行の時刻 (O-9 BE-010 / data-model §1)', () => {
  it('Hook / task の行は最初の記録の時刻を持ち、2 つ目の記録の時刻に替わらない', () => {
    const out = toTranscriptMessages(
      [
        {
          ...system('s1', {
            subtype: 'task_started',
            task_id: 't1',
            description: 'ビルド',
            task_type: 'local_agent',
            is_backgrounded: true
          }),
          timestamp: '2026-10-16T10:00:00Z'
        },
        {
          ...system('s2', { subtype: 'task_notification', task_id: 't1', status: 'completed' }),
          timestamp: '2026-10-16T10:30:00Z'
        }
      ],
      { now: Date.parse('2026-10-16T12:00:00Z') }
    )
    expect(out).toHaveLength(1)
    expect(out[0]?.createdAt).toBe(Date.parse('2026-10-16T10:00:00Z'))
  })

  it('timestamp が無ければ null', () => {
    const out = toTranscriptMessages([
      system('s1', {
        subtype: 'task_started',
        task_id: 't1',
        description: 'x',
        task_type: 'local_agent',
        is_backgrounded: true
      })
    ])
    expect(out[0]?.createdAt).toBeNull()
  })
})

describe('過去ログの後から背景に移った task (O-11 BE-022)', () => {
  const bashCall = (command: string): SessionMessageLike => ({
    type: 'assistant',
    uuid: 'a1',
    message: {
      role: 'assistant',
      content: [{ type: 'tool_use', id: 'toolu_1', name: 'Bash', input: { command } }]
    }
  })
  const fgStart = (extra: Record<string, unknown> = {}): SessionMessageLike =>
    system('s1', {
      subtype: 'task_started',
      task_id: 't1',
      description: 'SECRET-DESC',
      task_type: 'local_bash',
      tool_use_id: 'toolu_1',
      ...extra
    })
  const bgMove = system('s2', {
    subtype: 'task_updated',
    task_id: 't1',
    patch: { is_backgrounded: true }
  })

  it('前景で始まり task_updated で背景に移った task が backgrounded-task の 1 行になり、名前は Bash のコマンドの名前', () => {
    const out = toTranscriptMessages([bashCall('npm run build'), fgStart(), bgMove])
    const rows = out.filter((m) => m.id === 'task:t1')
    expect(rows).toHaveLength(1)
    expect(rows[0]?.parts[0]).toMatchObject({
      category: 'backgrounded-task',
      opens: true,
      name: 'npm',
      detail: 'local_bash',
      status: 'running'
    })
    expect(JSON.stringify(out)).not.toContain('SECRET-DESC')
  })

  it('tool_use_id が過去ログに無いと名前は空', () => {
    const out = toTranscriptMessages([fgStart(), bgMove])
    expect(out.find((m) => m.id === 'task:t1')?.parts[0]).toMatchObject({ name: '' })
  })

  it('背景に移さなかった前景の task は行にならない', () => {
    const out = toTranscriptMessages([bashCall('npm x'), fgStart()])
    expect(out.find((m) => m.id === 'task:t1')).toBeUndefined()
  })
})

/** O-12 BE-040 / SC-005 — 過去ログの知らせの類は実行中と同じ `toNoticeRow` で行になる。 */
const TS = Date.parse('2026-01-01T00:00:01.000Z')

describe('toTranscriptMessages の知らせの類 (O-12)', () => {
  const live: Record<string, unknown>[] = [
    { type: 'system', subtype: 'informational', uuid: 'inf-1', content: '知らせ', level: 'info' },
    { type: 'system', subtype: 'local_command_output', content: 'out SECRET-NOT' },
    { type: 'system', subtype: 'mirror_error', error: 'mirror failed', key: 'KEYMARK' },
    { type: 'system', subtype: 'notification', key: 'n1', text: 'hello', priority: 'high' },
    {
      type: 'system',
      subtype: 'files_persisted',
      files: [{ filename: 'a.txt', file_id: 'FID' }],
      failed: []
    }
  ]

  it('判別子のある記録が実行中と同じ DTO の行になる', () => {
    for (const [i, raw] of live.entries()) {
      const expected = toNoticeRow(raw, TS, `u${i}`)
      expect(expected).not.toBeNull()
      const out = toTranscriptMessages(
        [{ type: 'system', uuid: `u${i}`, timestamp: '2026-01-01T00:00:01.000Z', message: raw }],
        { now: TS }
      )
      expect(out).toHaveLength(1)
      expect(out[0]).toEqual(expected)
    }
  })

  it('message.type に残る種類 (conversation_reset / tool_use_summary / active_goal) が読める', () => {
    const cases: Record<string, unknown>[] = [
      { type: 'conversation_reset', uuid: 'rst-1' },
      { type: 'tool_use_summary', summary: 'did things' },
      { type: 'active_goal', value: null }
    ]
    for (const [i, message] of cases.entries()) {
      const expected = toNoticeRow({ type: 'system', ...message }, TS, `r${i}`)
      expect(expected).not.toBeNull()
      const out = toTranscriptMessages(
        [{ type: 'system', uuid: `r${i}`, timestamp: '2026-01-01T00:00:01.000Z', message }],
        { now: TS }
      )
      expect(out[0]).toEqual(expected)
    }
  })

  it('判別子が無い・知らない subtype の記録は今どおり伏せ字つきの本文で欠落しない', () => {
    const out = toTranscriptMessages([
      system('x1', { content: 'plain body' }),
      system('x2', { subtype: 'unknown_kind', content: 'other body' })
    ])
    expect(out.map((m) => m.id)).toEqual(['x1', 'x2'])
    expect(JSON.stringify(out)).toMatch(/plain body/)
  })

  it('同じ key の notification は 1 行に合成され、読まないフィールドは DTO に出ない', () => {
    const out = toTranscriptMessages([
      system('a', { subtype: 'notification', key: 'n1', text: 'one' }),
      system('b', { subtype: 'notification', key: 'n1', text: 'two' }),
      system('c', { subtype: 'mirror_error', error: 'e', key: 'KEYMARK' }),
      system('d', {
        subtype: 'files_persisted',
        files: [{ filename: 'a.txt', file_id: 'FID' }],
        failed: []
      })
    ])
    expect(out.filter((m) => m.parts[0]?.type === 'system-event')).toHaveLength(3)
    expect(JSON.stringify(out)).not.toMatch(/KEYMARK|FID/)
  })

  it('model_refusal_fallback の retracted_message_uuids は読まない', () => {
    const out = toTranscriptMessages([
      { type: 'user', uuid: 'u1', message: { role: 'user', content: 'hi' } },
      system('s1', { subtype: 'model_refusal_fallback', retracted_message_uuids: ['u1'] })
    ])
    expect(out.some((m) => m.id === 'u1')).toBe(true)
  })
})
