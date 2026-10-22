import { describe, expect, it, vi } from 'vitest'

import type { SessionEvent } from '@domain/session/agent-session'
import type { MeterUpdate } from '@domain/session/meter'
import type { TranscriptMessageDTO } from '@domain/session/transcript-dto'

import { createLiveSignals, type RetractionInfo } from './live-signals'

/**
 * O-6 BE-011 / BE-012 — 会話の境界・拒否・知らせの行と取り消し (016 data-model §1)。
 * SC-001: 行の id・category・name・detail・status、読まないフィールドが DTO に 0 件、伏せ字、取り消しの経路。
 */

const MARK = 'SECRET_MARK_ZZZ'

function setup(): {
  signals: ReturnType<typeof createLiveSignals>
  emitted: SessionEvent[]
  retracted: RetractionInfo[]
} {
  const emitted: SessionEvent[] = []
  const retracted: RetractionInfo[] = []
  const signals = createLiveSignals({
    launchPermissionMode: 'default',
    emit: (event) => emitted.push(event),
    clock: { now: () => 0, setTimer: vi.fn(), clearTimer: vi.fn() },
    onRetract: (info) => retracted.push(info)
  })
  return { signals, emitted, retracted }
}

function rowOf(event: SessionEvent | undefined): {
  id: string
  category: string
  opens: boolean
  name: string
  detail: string
  status: string | null
} {
  if (event?.kind !== 'message') throw new Error('not a message event')
  const message: TranscriptMessageDTO = event.message
  const part = message.parts[0]
  if (part?.type !== 'system-event') throw new Error('not a system-event part')
  return {
    id: message.id,
    category: part.category,
    opens: part.opens,
    name: part.name,
    detail: part.detail,
    status: part.status
  }
}

const system = (subtype: string, extra: Record<string, unknown>): unknown => ({
  type: 'system',
  subtype,
  ...extra
})

const retractionsOf = (emitted: readonly SessionEvent[]): MeterUpdate[] =>
  emitted.flatMap((e) => (e.kind === 'meter' && e.meter.type === 'retraction' ? [e.meter] : []))

describe('compact_boundary と conversation_reset (BE-011)', () => {
  it('圧縮の境界の行: id・detail・status。読まないフィールドを運ばない', () => {
    const { signals, emitted } = setup()
    signals.onSystem(
      system('compact_boundary', {
        uuid: 'u1',
        compact_metadata: {
          trigger: 'auto',
          pre_tokens: 1200,
          post_tokens: 300,
          preserved_segment: MARK,
          duration_ms: 5
        },
        preserved_messages: MARK
      })
    )
    expect(rowOf(emitted[0])).toEqual({
      id: 'compact-boundary:u1',
      category: 'compact-boundary',
      opens: true,
      name: '',
      detail: 'auto 1200 300',
      status: 'marked'
    })
    expect(JSON.stringify(emitted)).not.toContain(MARK)
  })

  it('trigger / 数が外れたら -。prototype のキーや空白入りの値を通さない', () => {
    const { signals, emitted } = setup()
    for (const trigger of ['constructor', '__proto__', 'retry local', 1, undefined]) {
      signals.onSystem(
        system('compact_boundary', {
          uuid: 'u1',
          compact_metadata: { trigger, pre_tokens: -1, post_tokens: 1.5 }
        })
      )
    }
    for (const e of emitted) expect(rowOf(e).detail).toBe('- - -')
    signals.onSystem(system('compact_boundary', { uuid: 'u2' }))
    expect(rowOf(emitted[emitted.length - 1]).detail).toBe('- - -')
  })

  it('uuid の形が外れたら行を作らない', () => {
    const { signals, emitted } = setup()
    signals.onSystem(system('compact_boundary', { uuid: 'a b' }))
    signals.onSystem(system('compact_boundary', {}))
    signals.onConversationReset({ type: 'conversation_reset', uuid: '' })
    expect(emitted).toEqual([])
  })

  it('会話の作り直しの行。new_conversation_id は読まない', () => {
    const { signals, emitted } = setup()
    signals.onConversationReset({
      type: 'conversation_reset',
      uuid: 'r1',
      new_conversation_id: MARK
    })
    expect(rowOf(emitted[0])).toEqual({
      id: 'reset:r1',
      category: 'conversation-reset',
      opens: true,
      name: '',
      detail: '',
      status: 'marked'
    })
    expect(JSON.stringify(emitted)).not.toContain(MARK)
  })
})

describe('model_refusal_* (BE-011)', () => {
  it('fallback: モデル・scope・分類・説明。content・request_id などは読まない', () => {
    const { signals, emitted } = setup()
    signals.onSystem(
      system('model_refusal_fallback', {
        uuid: 'f1',
        direction: 'retry',
        scope: 'local',
        fallback_model: 'claude-sonnet-4-5',
        api_refusal_category: 'cyber',
        api_refusal_explanation: 'This   is\nthe reason',
        content: MARK,
        request_id: MARK,
        refused_user_message_uuid: MARK,
        original_model: MARK
      })
    )
    expect(rowOf(emitted[0])).toEqual({
      id: 'refusal:f1',
      category: 'refusal',
      opens: true,
      name: 'claude-sonnet-4-5',
      detail: 'retry local cyber This is the reason',
      status: 'fallback'
    })
    expect(JSON.stringify(emitted)).not.toContain(MARK)
  })

  it('scope が無いと session、値が外れると -。分類が形に外れると -、モデルが外れると空', () => {
    const { signals, emitted } = setup()
    signals.onSystem(
      system('model_refusal_fallback', {
        uuid: 'f1',
        direction: 'sticky',
        api_refusal_category: 'Bad Cat',
        fallback_model: 'https://u:p@h/x'
      })
    )
    signals.onSystem(
      system('model_refusal_fallback', {
        uuid: 'f2',
        direction: 'constructor',
        scope: '__proto__',
        api_refusal_explanation: ''
      })
    )
    expect(rowOf(emitted[0])).toMatchObject({ name: '', detail: 'sticky session -' })
    expect(rowOf(emitted[1])).toMatchObject({ detail: '- - -' })
  })

  it('説明の伏せ字と、detail 全体が 120 コードポイントを超えない', () => {
    const { signals, emitted } = setup()
    signals.onSystem(
      system('model_refusal_fallback', {
        uuid: 'f1',
        direction: 'retry',
        scope: 'session',
        api_refusal_category: 'cyber',
        api_refusal_explanation: `Bearer abcdefgh12345678 ${'あ'.repeat(300)}`
      })
    )
    const detail = rowOf(emitted[0]).detail
    expect(detail).not.toContain('abcdefgh12345678')
    expect(Array.from(detail).length).toBeLessThanOrEqual(120)
    expect(detail.endsWith('…')).toBe(true)
  })

  it('取り消しの id を meter で送り、行には入れない', () => {
    const { signals, emitted, retracted } = setup()
    signals.onSystem(
      system('model_refusal_fallback', {
        uuid: 'f1',
        retracted_message_uuids: ['a1', 'a2', 'bad id']
      })
    )
    expect(retractionsOf(emitted)).toEqual([{ type: 'retraction', messageIds: ['a1', 'a2'] }])
    expect(retracted).toEqual([{ ids: ['a1', 'a2'], instructed: 3, dropped: 1 }])
    expect(JSON.stringify(emitted.filter((e) => e.kind === 'message'))).not.toContain('a1')
    // meter は行より前に届く
    expect(emitted[0]?.kind).toBe('meter')
  })

  it('no fallback: 分類を name、content と説明を改行でつないだ本文を detail に。伏せ字が当たる', () => {
    const { signals, emitted } = setup()
    signals.onSystem(
      system('model_refusal_no_fallback', {
        uuid: 'n1',
        content: `拒否 token=hunter22secret`,
        api_refusal_category: 'bio',
        api_refusal_explanation: 'AKIAABCDEFGHIJKLMNOP です',
        original_model: MARK,
        request_id: MARK
      })
    )
    const row = rowOf(emitted[0])
    expect(row).toMatchObject({
      id: 'refusal:n1',
      category: 'refusal',
      name: 'bio',
      status: 'no-fallback'
    })
    expect(row.detail).not.toContain('hunter22secret')
    expect(row.detail).not.toContain('AKIAABCDEFGHIJKLMNOP')
    expect(row.detail).toContain('拒否')
    expect(row.detail).toContain('です')
    expect(JSON.stringify(emitted)).not.toContain(MARK)
  })

  it('no fallback: 片方が無ければもう片方だけ。分類が外れると name は空', () => {
    const { signals, emitted } = setup()
    signals.onSystem(
      system('model_refusal_no_fallback', {
        uuid: 'n1',
        content: '本文',
        api_refusal_category: 'X'
      })
    )
    expect(rowOf(emitted[0])).toMatchObject({ name: '', detail: '本文' })
  })

  it('no fallback: refused_user_message_uuid が文字列なら no-fallback-retry。値は運ばない (O-10 BE-040)', () => {
    const { signals, emitted } = setup()
    signals.onSystem(
      system('model_refusal_no_fallback', {
        uuid: 'n1',
        content: '本文',
        refused_user_message_uuid: MARK
      })
    )
    expect(rowOf(emitted[0])).toMatchObject({ status: 'no-fallback-retry' })
    expect(JSON.stringify(emitted)).not.toContain(MARK)
  })

  it('no fallback: refused_user_message_uuid が null・無い・空文字・数なら no-fallback', () => {
    const { signals, emitted } = setup()
    const values: readonly unknown[] = [null, undefined, '', 7]
    values.forEach((v, i) => {
      signals.onSystem(
        system('model_refusal_no_fallback', {
          uuid: `n${i}`,
          content: '本文',
          refused_user_message_uuid: v
        })
      )
    })
    expect(emitted.map((e) => rowOf(e).status)).toEqual(Array(4).fill('no-fallback'))
  })
})

describe('informational (BE-011)', () => {
  it('status: prevent_continuation → prevented / warning・suggestion → warning / それ以外 → notice', () => {
    const { signals, emitted } = setup()
    signals.onSystem(
      system('informational', { uuid: 'i1', content: 'a', prevent_continuation: true })
    )
    signals.onSystem(system('informational', { uuid: 'i2', content: 'b', level: 'warning' }))
    signals.onSystem(system('informational', { uuid: 'i3', content: 'c', level: 'suggestion' }))
    signals.onSystem(system('informational', { uuid: 'i4', content: 'd', level: 'info' }))
    signals.onSystem(system('informational', { uuid: 'i5', content: 'e', level: 'constructor' }))
    expect(emitted.map((e) => rowOf(e).status)).toEqual([
      'prevented',
      'warning',
      'warning',
      'notice',
      'notice'
    ])
  })

  it('同じ tool_use_id は同じ行の id。形が外れると info:<uuid>。uuid が外れると行が無い', () => {
    const { signals, emitted } = setup()
    signals.onSystem(system('informational', { uuid: 'i1', tool_use_id: 'toolu_1', content: 'a' }))
    signals.onSystem(system('informational', { uuid: 'i2', tool_use_id: 'toolu_1', content: '' }))
    signals.onSystem(system('informational', { uuid: 'i3', tool_use_id: 'a b', content: 'c' }))
    signals.onSystem(system('informational', { uuid: '', tool_use_id: 'toolu_1', content: 'd' }))
    expect(emitted.map((e) => rowOf(e).id)).toEqual(['info:toolu_1', 'info:toolu_1', 'info:i3'])
    expect(rowOf(emitted[1]).detail).toBe('')
    expect(rowOf(emitted[0])).toMatchObject({ category: 'informational', name: '', opens: true })
  })

  it('本文の伏せ字・1 行化・120 コードポイント', () => {
    const { signals, emitted } = setup()
    signals.onSystem(
      system('informational', {
        uuid: 'i1',
        content: `line1\n\nline2 https://user:pw0rd@example.com/x ${'い'.repeat(200)}`
      })
    )
    const detail = rowOf(emitted[0]).detail
    expect(detail).not.toContain('pw0rd')
    expect(detail).not.toContain('\n')
    expect(detail.startsWith('line1 line2')).toBe(true)
    expect(Array.from(detail).length).toBeLessThanOrEqual(120)
  })
})

describe('取り消し (BE-012)', () => {
  it('supersedes の meter を即時に送り、128 件ごとに分ける (129 件 → 128 + 1)', () => {
    const { signals, emitted, retracted } = setup()
    const ids = Array.from({ length: 129 }, (_, i) => `m${i}`)
    signals.onRetraction(ids)
    const metas = retractionsOf(emitted)
    expect(metas).toHaveLength(2)
    expect(metas.map((m) => (m.type === 'retraction' ? m.messageIds.length : 0))).toEqual([128, 1])
    expect(retracted[0]).toMatchObject({ instructed: 129, dropped: 0 })
  })

  it('1 秒に 21 件の meter の後でも retraction が届く (上限を消費しない)', () => {
    const { signals, emitted } = setup()
    for (let i = 0; i < 21; i += 1) {
      signals.onSystem(system('thinking_tokens', { estimated_tokens: i }))
    }
    signals.onRetraction(['a1'])
    expect(retractionsOf(emitted)).toEqual([{ type: 'retraction', messageIds: ['a1'] }])
  })

  it('形の外れた id は落ち、重複は 1 つ。配列でなければ何もしない。dispose の後は送らない', () => {
    const { signals, emitted, retracted } = setup()
    signals.onRetraction(['ok', 'ok', 7, null, 'bad id', 'x'.repeat(129)])
    expect(retractionsOf(emitted)).toEqual([{ type: 'retraction', messageIds: ['ok'] }])
    expect(retracted[0]).toEqual({ ids: ['ok'], instructed: 6, dropped: 5 })
    signals.onRetraction('not-an-array')
    signals.onRetraction(undefined)
    expect(retracted).toHaveLength(1)
    signals.dispose()
    signals.onRetraction(['zz'])
    expect(retractionsOf(emitted)).toHaveLength(1)
  })

  it('全部形が外れたら meter を送らず、件数だけを渡す', () => {
    const { signals, emitted, retracted } = setup()
    signals.onRetraction(['a b'])
    expect(emitted).toEqual([])
    expect(retracted).toEqual([{ ids: [], instructed: 1, dropped: 1 }])
  })
})

describe('O-12 の知らせの類 (BE-012)', () => {
  it('system の 5 つの subtype と onNotice が message を 1 つ出し、meter を増やさない', () => {
    const { signals, emitted } = setup()
    signals.onSystem(system('notification', { uuid: 'a1', key: 'k', text: 'hi', color: MARK }))
    signals.onSystem(system('local_command_output', { uuid: 'a2', content: 'out' }))
    signals.onSystem(system('memory_recall', { uuid: 'a3', mode: 'select', memories: [] }))
    signals.onSystem(system('mirror_error', { uuid: 'a4', error: 'e', key: { projectKey: MARK } }))
    signals.onSystem(
      system('files_persisted', { uuid: 'a5', files: [{ filename: 'f', file_id: MARK }] })
    )
    signals.onNotice({
      type: 'tool_use_summary',
      uuid: 'a6',
      summary: 's',
      preceding_tool_use_ids: [MARK]
    })
    signals.onNotice({ type: 'active_goal', uuid: 'a7', value: null })
    expect(emitted.map((e) => e.kind)).toEqual(Array(7).fill('message'))
    expect(emitted.map((e) => rowOf(e).category)).toEqual([
      'notification',
      'local-command-output',
      'memory-recall',
      'mirror-error',
      'files-persisted',
      'tool-use-summary',
      'active-goal'
    ])
    expect(JSON.stringify(emitted)).not.toContain(MARK)
  })

  it('同じ key の notification は同じ id で出る。親 tool 付きでも主ループの行になる', () => {
    const { signals, emitted } = setup()
    signals.onSystem(
      system('notification', { uuid: 'b1', key: 'k', text: 'one', parent_tool_use_id: 'toolu_x' })
    )
    signals.onSystem(system('notification', { uuid: 'b2', key: 'k', text: 'two' }))
    expect(emitted.map((e) => rowOf(e).id)).toEqual(['notification:k', 'notification:k'])
  })

  it('知らない種類・record でないものは何も出さない', () => {
    const { signals, emitted } = setup()
    signals.onNotice({ type: 'prompt_suggestion', suggestion: MARK })
    signals.onNotice('x')
    signals.onNotice(null)
    expect(emitted).toEqual([])
  })

  it('dispose の後は何も送らない', () => {
    const { signals, emitted } = setup()
    signals.dispose()
    signals.onNotice({ type: 'tool_use_summary', uuid: 'c1', summary: 's' })
    expect(emitted).toEqual([])
  })
})
