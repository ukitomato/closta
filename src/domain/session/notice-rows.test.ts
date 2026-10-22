import { describe, expect, it } from 'vitest'

import { toNoticeRow } from './notice-rows'
import { mergeSystemEvent } from './system-event'
import type { TranscriptMessageDTO, TranscriptPartDTO } from './transcript-dto'

const UUID = '11111111-2222-3333-4444-555555555555'
const FALLBACK = 'fallback-id'
const SECRET = 'sk-abcdefghijklmnopqrstuvwxyz0123'

function sys(subtype: string, fields: Record<string, unknown> = {}): Record<string, unknown> {
  return { type: 'system', subtype, uuid: UUID, ...fields }
}

function partOf(
  message: TranscriptMessageDTO | null
): Extract<TranscriptPartDTO, { type: 'system-event' }> {
  const part = message?.parts[0]
  if (part === undefined || part.type !== 'system-event') throw new Error('no system-event part')
  return part
}

describe('toNoticeRow (O-12 data-model §1)', () => {
  it('record でない・判別子が無い・12 の種類の外は null', () => {
    expect(toNoticeRow(null, 1, FALLBACK)).toBeNull()
    expect(toNoticeRow('x', 1, FALLBACK)).toBeNull()
    expect(toNoticeRow([], 1, FALLBACK)).toBeNull()
    expect(toNoticeRow({}, 1, FALLBACK)).toBeNull()
    expect(toNoticeRow({ type: 'system' }, 1, FALLBACK)).toBeNull()
    expect(toNoticeRow(sys('something_else'), 1, FALLBACK)).toBeNull()
    expect(toNoticeRow({ type: 'prompt_suggestion', suggestion: 'x' }, 1, FALLBACK)).toBeNull()
  })

  it('O-6 / O-10 の 5 つの種類の行', () => {
    const info = partOf(
      toNoticeRow(sys('informational', { content: 'hi', level: 'warning' }), 5, FALLBACK)
    )
    expect(info).toMatchObject({ category: 'informational', status: 'warning', detail: 'hi' })
    const infoMsg = toNoticeRow(sys('informational', { tool_use_id: 'toolu_1' }), 5, FALLBACK)
    expect(infoMsg?.id).toBe('info:toolu_1')
    expect(infoMsg?.createdAt).toBe(5)

    const fb = toNoticeRow(
      sys('model_refusal_fallback', { direction: 'retry', fallback_model: 'claude-sonnet-4-5' }),
      1,
      FALLBACK
    )
    expect(fb?.id).toBe(`refusal:${UUID}`)
    expect(partOf(fb)).toMatchObject({
      category: 'refusal',
      status: 'fallback',
      detail: 'retry session -'
    })

    const nf = toNoticeRow(
      sys('model_refusal_no_fallback', {
        refused_user_message_uuid: UUID,
        api_refusal_category: 'cyber'
      }),
      1,
      FALLBACK
    )
    expect(partOf(nf)).toMatchObject({ status: 'no-fallback-retry', name: 'cyber' })

    const reset = toNoticeRow(
      { type: 'conversation_reset', uuid: UUID, new_conversation_id: 'zz' },
      1,
      FALLBACK
    )
    expect(reset?.id).toBe(`reset:${UUID}`)
    expect(partOf(reset)).toMatchObject({ category: 'conversation-reset', status: 'marked' })

    const el = toNoticeRow(
      sys('elicitation_complete', { elicitation_id: 'el-1', mcp_server_name: 'srv' }),
      1,
      FALLBACK
    )
    expect(el?.id).toBe('elicitation:el-1')
    expect(partOf(el)).toMatchObject({ category: 'elicitation', name: 'srv', status: 'completed' })
    expect(toNoticeRow(sys('elicitation_complete'), 1, FALLBACK)?.id).toBe(
      'elicitation:fallback-id'
    )
  })

  it('refusal: の uuid が外れたら null', () => {
    expect(
      toNoticeRow({ type: 'system', subtype: 'model_refusal_fallback', uuid: 'a b' }, 1, FALLBACK)
    ).toBeNull()
    expect(
      toNoticeRow({ type: 'system', subtype: 'model_refusal_no_fallback' }, 1, FALLBACK)
    ).toBeNull()
  })

  it('notification: key の形・priority・本文の伏せ字・読まないフィールド', () => {
    const m = toNoticeRow(
      sys('notification', {
        key: 'k.1',
        text: `a ${SECRET}`,
        priority: 'high',
        color: 'MARK_COLOR',
        timeout_ms: 987654
      }),
      1,
      FALLBACK
    )
    expect(m?.id).toBe('notification:k.1')
    expect(partOf(m)).toMatchObject({ category: 'notification', status: 'warning', opens: true })
    expect(JSON.stringify(m)).not.toContain(SECRET)
    expect(JSON.stringify(m)).not.toContain('MARK_COLOR')
    expect(JSON.stringify(m)).not.toContain('987654')
    expect(toNoticeRow(sys('notification', { key: 'bad key!' }), 1, FALLBACK)?.id).toBe(
      `notification:${UUID}`
    )
    expect(
      partOf(toNoticeRow(sys('notification', { priority: 'immediate' }), 1, FALLBACK)).status
    ).toBe('warning')
    for (const priority of ['low', 'medium', 'weird', undefined])
      expect(partOf(toNoticeRow(sys('notification', { priority }), 1, FALLBACK)).status).toBe(
        'notice'
      )
  })

  it('本文は 120 コードポイントで切り詰める', () => {
    const m = toNoticeRow(sys('local_command_output', { content: 'あ'.repeat(300) }), 1, FALLBACK)
    expect(Array.from(partOf(m).detail)).toHaveLength(120)
    expect(partOf(m).detail.endsWith('…')).toBe(true)
    expect(m?.id).toBe(`local-command:${UUID}`)
    expect(partOf(m).category).toBe('local-command-output')
  })

  it('tool_use_summary: 読まない preceding_tool_use_ids', () => {
    const m = toNoticeRow(
      {
        type: 'tool_use_summary',
        summary: 'did it',
        uuid: UUID,
        preceding_tool_use_ids: ['MARK_PRECEDING']
      },
      1,
      FALLBACK
    )
    expect(m?.id).toBe(`summary:${UUID}`)
    expect(partOf(m)).toMatchObject({ category: 'tool-use-summary', detail: 'did it' })
    expect(JSON.stringify(m)).not.toContain('MARK_PRECEDING')
  })

  it('active_goal: null は解除 (completed)、record は設定 (notice)、他は行なし', () => {
    const set = toNoticeRow(
      {
        type: 'active_goal',
        uuid: UUID,
        value: {
          condition: 'ship it',
          iterations: 77123,
          set_at: 'MARK_SET',
          tokens_at_start: 66123,
          last_reason: 'MARK_REASON'
        }
      },
      1,
      FALLBACK
    )
    expect(partOf(set)).toMatchObject({
      category: 'active-goal',
      status: 'notice',
      detail: 'ship it'
    })
    for (const mark of ['77123', 'MARK_SET', '66123', 'MARK_REASON'])
      expect(JSON.stringify(set)).not.toContain(mark)
    expect(
      partOf(toNoticeRow({ type: 'active_goal', uuid: UUID, value: null }, 1, FALLBACK))
    ).toMatchObject({
      status: 'completed',
      detail: ''
    })
    expect(toNoticeRow({ type: 'active_goal', uuid: UUID }, 1, FALLBACK)).toBeNull()
    expect(toNoticeRow({ type: 'active_goal', uuid: UUID, value: 'x' }, 1, FALLBACK)).toBeNull()
  })

  it('mirror_error: failed で key を読まない', () => {
    const m = toNoticeRow(
      sys('mirror_error', { error: 'boom', key: { projectKey: 'MARK_KEY' } }),
      1,
      FALLBACK
    )
    expect(partOf(m)).toMatchObject({ category: 'mirror-error', status: 'failed', detail: 'boom' })
    expect(JSON.stringify(m)).not.toContain('MARK_KEY')
  })

  it('memory_recall: 名前は末尾・host だけ、要約は数える、content と絶対パスを運ばない', () => {
    const m = toNoticeRow(
      sys('memory_recall', {
        mode: 'select',
        memories: [
          { path: 'C:\\Users\\MARK_USER\\mem\\a.md', scope: 'personal', content: 'MARK_CONTENT' },
          { path: '/home/MARK_HOME/mem/b.md', scope: 'team' },
          { path: 'https://example.com/x/y?token=1', scope: 'organization' },
          { path: '<synthesis:/MARK_DIR>', scope: 'personal' }
        ]
      }),
      1,
      FALLBACK
    )
    const part = partOf(m)
    expect(part.category).toBe('memory-recall')
    expect(part.name).toBe('a.md\nb.md\nexample.com')
    expect(part.detail).toBe('select 4 2 1 1 1')
    const json = JSON.stringify(m)
    for (const mark of ['MARK_USER', 'MARK_HOME', 'MARK_CONTENT', 'MARK_DIR', 'token=1'])
      expect(json).not.toContain(mark)
    expect(
      partOf(
        toNoticeRow(sys('memory_recall', { mode: 'other', memories: [] }), 1, FALLBACK)
      ).detail.startsWith('- ')
    ).toBe(true)
  })

  it('files_persisted: 空は null、failed で理由、21 件目で +1、読まないフィールド', () => {
    expect(toNoticeRow(sys('files_persisted', { files: [], failed: [] }), 1, FALLBACK)).toBeNull()
    expect(toNoticeRow(sys('files_persisted', { files: 'x' }), 1, FALLBACK)).toBeNull()
    const ok = toNoticeRow(
      sys('files_persisted', {
        files: [{ filename: 'a.txt', file_id: 'MARK_FILE_ID' }],
        failed: [],
        processed_at: 'MARK_AT'
      }),
      1,
      FALLBACK
    )
    expect(partOf(ok)).toMatchObject({
      category: 'files-persisted',
      status: 'completed',
      detail: '1 0',
      name: 'a.txt'
    })
    expect(JSON.stringify(ok)).not.toContain('MARK_FILE_ID')
    expect(JSON.stringify(ok)).not.toContain('MARK_AT')
    const bad = toNoticeRow(
      sys('files_persisted', {
        files: [{ filename: 'a' }],
        failed: [{ filename: 'b', error: `no ${SECRET}` }]
      }),
      1,
      FALLBACK
    )
    expect(partOf(bad)).toMatchObject({ status: 'failed', name: 'a\nb' })
    expect(partOf(bad).detail.startsWith('1 1 no ')).toBe(true)
    expect(JSON.stringify(bad)).not.toContain(SECRET)
    const many = toNoticeRow(
      sys('files_persisted', {
        files: Array.from({ length: 21 }, (_, i) => ({ filename: `f${i}` }))
      }),
      1,
      FALLBACK
    )
    const lines = partOf(many).name.split('\n')
    expect(lines).toHaveLength(21)
    expect(lines.at(-1)).toBe('+1')
  })

  it('fallbackId を使う (uuid が無いとき)', () => {
    expect(
      toNoticeRow({ type: 'system', subtype: 'mirror_error', error: 'e' }, 1, FALLBACK)?.id
    ).toBe('mirror-error:fallback-id')
  })

  it('同じ key の notification は mergeSystemEvent で最初の行の位置の 1 行に書き換わる', () => {
    const first = toNoticeRow(
      sys('notification', { key: 'k', text: 'one', priority: 'low' }),
      1,
      FALLBACK
    )
    const second = toNoticeRow(
      sys('notification', { key: 'k', text: 'two', priority: 'high' }),
      2,
      FALLBACK
    )
    if (first === null || second === null) throw new Error('rows')
    expect(first.id).toBe(second.id)
    const merged = mergeSystemEvent(first, second)
    expect(partOf(merged)).toMatchObject({ detail: 'two', status: 'warning' })
    expect(merged?.id).toBe(first.id)
  })
})
