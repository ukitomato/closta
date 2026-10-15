import { describe, expect, it } from 'vitest'

import { RESEND_RESULT_MAX_BYTES } from '@domain/session/tool-result'
import type { TranscriptMessageDTO, TranscriptPartDTO } from '@domain/session/transcript-dto'

import { createLiveToolResultTracker, MAX_PENDING_TOOL_MESSAGES } from './live-tool-results'

/**
 * 実行中の tool の結果の対応 (O-2 / BE-024。data-model §3)。SDK のメッセージは fake の構造で渡す。
 */

type ToolCallPart = Extract<TranscriptPartDTO, { type: 'tool-call' }>

function toolCall(id: string): ToolCallPart {
  return {
    type: 'tool-call',
    toolCallId: id,
    toolName: 'Bash',
    argsText: '{}',
    result: null,
    isError: false,
    truncated: false,
    children: []
  }
}

function assistant(id: string, ...toolIds: string[]): TranscriptMessageDTO {
  return {
    id,
    role: 'assistant',
    parts: [{ type: 'text', text: 'calling' }, ...toolIds.map(toolCall)],
    createdAt: null
  }
}

function user(...content: unknown[]): unknown {
  return { type: 'user', message: { role: 'user', content }, parent_tool_use_id: null }
}

function result(id: string, content: unknown, isError = false): unknown {
  return { type: 'tool_result', tool_use_id: id, content, is_error: isError }
}

const calls = (m: TranscriptMessageDTO): ToolCallPart[] =>
  m.parts.filter((p): p is ToolCallPart => p.type === 'tool-call')

describe('live-tool-results: 結果を同じ id のメッセージに埋めて送り直す (FR-007)', () => {
  it('tool_use を含む assistant → 結果の user で同じ id のメッセージが結果を埋めて返る', () => {
    const t = createLiveToolResultTracker()
    t.trackAssistant(assistant('m1', 'tu1'))
    const out = t.applyUserMessage(user(result('tu1', 'ok')))
    expect(out).toHaveLength(1)
    expect(out[0]?.id).toBe('m1')
    expect(calls(out[0] as TranscriptMessageDTO)[0]).toMatchObject({
      toolCallId: 'tu1',
      result: 'ok',
      isError: false,
      truncated: false
    })
    // 結果待ちが 0 になったメッセージは忘れる。
    expect(t.pendingMessageCount()).toBe(0)
  })

  it('エラーの結果は isError、block 配列の text は連結する', () => {
    const t = createLiveToolResultTracker()
    t.trackAssistant(assistant('m1', 'tu1'))
    const out = t.applyUserMessage(
      user(
        result(
          'tu1',
          [
            { type: 'text', text: 'a' },
            { type: 'text', text: 'b' }
          ],
          true
        )
      )
    )
    expect(calls(out[0] as TranscriptMessageDTO)[0]).toMatchObject({
      result: 'a\nb',
      isError: true
    })
  })

  it('長すぎる結果は切り詰めて truncated', () => {
    const t = createLiveToolResultTracker()
    t.trackAssistant(assistant('m1', 'tu1'))
    const out = t.applyUserMessage(user(result('tu1', 'x'.repeat(2_000_000))))
    const part = calls(out[0] as TranscriptMessageDTO)[0] as ToolCallPart
    expect(part.truncated).toBe(true)
    expect((part.result ?? '').length).toBeLessThan(2_000_000)
  })

  it('並列の結果が 1 つの user メッセージで来ても送り直しは 1 回', () => {
    const t = createLiveToolResultTracker()
    t.trackAssistant(assistant('m1', 'a', 'b', 'c'))
    const out = t.applyUserMessage(user(result('a', '1'), result('b', '2'), result('c', '3')))
    expect(out.map((m) => m.id)).toEqual(['m1'])
    expect(calls(out[0] as TranscriptMessageDTO).map((p) => p.result)).toEqual(['1', '2', '3'])
  })

  it('結果が 1 つずつ別の user メッセージで来ても、送り直しの回数は user メッセージの数以下', () => {
    const t = createLiveToolResultTracker()
    t.trackAssistant(assistant('m1', 'a', 'b', 'c'))
    const users = [user(result('a', '1')), user(result('b', '2')), user(result('c', '3'))]
    const resent = users.flatMap((u) => t.applyUserMessage(u))
    expect(resent.length).toBeLessThanOrEqual(users.length)
    // 後の送り直しは前に埋めた結果を保つ。
    expect(calls(resent.at(-1) as TranscriptMessageDTO).map((p) => p.result)).toEqual([
      '1',
      '2',
      '3'
    ])
    expect(t.pendingMessageCount()).toBe(0)
  })

  it('複数のメッセージに跨る結果は、メッセージごとに 1 回ずつ', () => {
    const t = createLiveToolResultTracker()
    t.trackAssistant(assistant('m1', 'a'))
    t.trackAssistant(assistant('m2', 'b', 'c'))
    const out = t.applyUserMessage(user(result('b', '2'), result('a', '1'), result('c', '3')))
    expect(out.map((m) => m.id).sort()).toEqual(['m1', 'm2'])
  })

  it('対応の無い結果は result:<id> の結果だけのメッセージ', () => {
    const t = createLiveToolResultTracker()
    const out = t.applyUserMessage(user(result('ghost', 'boo')))
    expect(out).toEqual([
      {
        id: 'result:ghost',
        role: 'assistant',
        parts: [
          {
            type: 'tool-call',
            toolCallId: 'ghost',
            toolName: '(tool result)',
            argsText: '',
            result: 'boo',
            isError: false,
            truncated: false,
            children: []
          }
        ],
        createdAt: null
      }
    ])
  })

  it('同じ結果が 2 度来たら 2 度目は result:<id> (埋め済みを上書きしない)', () => {
    const t = createLiveToolResultTracker()
    t.trackAssistant(assistant('m1', 'a', 'b'))
    t.applyUserMessage(user(result('a', '1')))
    const out = t.applyUserMessage(user(result('a', 'again')))
    expect(out.map((m) => m.id)).toEqual(['result:a'])
  })

  it('toolCallId が空の tool_use は登録しない', () => {
    const t = createLiveToolResultTracker()
    t.trackAssistant(assistant('m1', ''))
    expect(t.pendingMessageCount()).toBe(0)
    const out = t.applyUserMessage(user(result('', 'x')))
    expect(out.map((m) => m.id)).toEqual(['result:'])
  })

  it('tool_use を含まない assistant は覚えない', () => {
    const t = createLiveToolResultTracker()
    t.trackAssistant(assistant('m1'))
    expect(t.pendingMessageCount()).toBe(0)
  })

  it(`${MAX_PENDING_TOOL_MESSAGES} 件を超えたら古いものから捨てる`, () => {
    const t = createLiveToolResultTracker()
    for (let i = 0; i <= MAX_PENDING_TOOL_MESSAGES; i++)
      t.trackAssistant(assistant(`m${i}`, `t${i}`))
    expect(t.pendingMessageCount()).toBe(MAX_PENDING_TOOL_MESSAGES)
    // 最古 (m0) は捨てたので結果だけのメッセージ、最新は同じ id で埋まる。
    expect(t.applyUserMessage(user(result('t0', 'x'))).map((m) => m.id)).toEqual(['result:t0'])
    expect(
      t.applyUserMessage(user(result(`t${MAX_PENDING_TOOL_MESSAGES}`, 'y'))).map((m) => m.id)
    ).toEqual([`m${MAX_PENDING_TOOL_MESSAGES}`])
  })

  it('1 回の送り直しの result の合計は RESEND_RESULT_MAX_BYTES 以下 (超えた分は truncated)', () => {
    const t = createLiveToolResultTracker()
    const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g']
    t.trackAssistant(assistant('m1', ...ids))
    // 1 件は TOOL_RESULT_MAX_BYTES 以内でも、合計は 1MB を超える。
    const out = t.applyUserMessage(user(...ids.map((id) => result(id, 'z'.repeat(190_000)))))
    expect(out).toHaveLength(1)
    const parts = calls(out[0] as TranscriptMessageDTO)
    const total = parts.reduce((sum, p) => sum + new TextEncoder().encode(p.result ?? '').length, 0)
    expect(total).toBeLessThanOrEqual(RESEND_RESULT_MAX_BYTES)
    expect(parts.some((p) => p.truncated)).toBe(true)
  })

  it('上限を使い切った後に届いた同じメッセージの結果は空の truncated になる (累積で効く。security L-004)', () => {
    const t = createLiveToolResultTracker()
    const ids = ['a', 'b', 'c', 'd', 'e', 'f']
    t.trackAssistant(assistant('m1', ...ids, 'late'))
    // 先の送り直しで合計がちょうど上限に達する (190KB × 6 > 1MB なので最後の 1 件が削られる)。
    const first = t.applyUserMessage(user(...ids.map((id) => result(id, 'z'.repeat(190_000)))))
    const filled = calls(first[0] as TranscriptMessageDTO)
    const total = filled.reduce(
      (sum, p) => sum + new TextEncoder().encode(p.result ?? '').length,
      0
    )
    expect(total).toBe(RESEND_RESULT_MAX_BYTES)

    const out = t.applyUserMessage(user(result('late', 'あとから届いた結果')))
    expect(out.map((m) => m.id)).toEqual(['m1'])
    const late = calls(out[0] as TranscriptMessageDTO).find((p) => p.toolCallId === 'late')
    expect(late).toMatchObject({ result: '', truncated: true })
    // 先に埋まっていた結果は削らない。
    expect(
      calls(out[0] as TranscriptMessageDTO)
        .filter((p) => p.toolCallId !== 'late')
        .map((p) => p.result)
    ).toEqual(filled.filter((p) => p.toolCallId !== 'late').map((p) => p.result))
  })

  it('user の本文 (tool_result 以外のブロック・文字列の content) は返さない', () => {
    const t = createLiveToolResultTracker()
    t.trackAssistant(assistant('m1', 'a'))
    expect(t.applyUserMessage(user({ type: 'text', text: 'SECRET-BODY' }))).toEqual([])
    expect(
      t.applyUserMessage({ type: 'user', message: { role: 'user', content: 'SECRET-BODY' } })
    ).toEqual([])
    const out = t.applyUserMessage(user({ type: 'text', text: 'SECRET-BODY' }, result('a', 'ok')))
    expect(JSON.stringify(out)).not.toContain('SECRET-BODY')
  })

  it('形の壊れた user メッセージでも例外を投げない', () => {
    const t = createLiveToolResultTracker()
    expect(t.applyUserMessage(null)).toEqual([])
    expect(t.applyUserMessage({ type: 'user' })).toEqual([])
    expect(t.applyUserMessage(user(null, 1, 'x'))).toEqual([])
  })
})

describe('live-tool-results: 取り消し (O-6 BE-012 / 016 data-model §1)', () => {
  it('取り消した後に結果が届いても、送り直しにも結果だけのメッセージにもしない', () => {
    const t = createLiveToolResultTracker()
    t.trackAssistant(assistant('m1', 'tu1'))
    expect(t.retract(['m1'])).toEqual({ unmatched: 0 })
    expect(t.pendingMessageCount()).toBe(0)
    expect(t.applyUserMessage(user(result('tu1', 'ok')))).toEqual([])
  })

  it('取り消していない tool の結果は今までどおり (同じ user メッセージの別の結果)', () => {
    const t = createLiveToolResultTracker()
    t.trackAssistant(assistant('m1', 'tu1'))
    t.trackAssistant(assistant('m2', 'tu2'))
    t.retract(['m1'])
    const out = t.applyUserMessage(user(result('tu1', 'a'), result('tu2', 'b')))
    expect(out.map((m) => m.id)).toEqual(['m2'])
  })

  it('取り消した id の assistant を後で受けても送らない判定になり、その tool の結果も捨てる', () => {
    const t = createLiveToolResultTracker()
    t.retract(['m1'])
    expect(t.isRetracted('m1')).toBe(true)
    t.trackAssistant(assistant('m1', 'tu1'))
    expect(t.pendingMessageCount()).toBe(0)
    expect(t.applyUserMessage(user(result('tu1', 'ok')))).toEqual([])
  })

  it('冪等。同じ id を続けて取り消しても例外が出ず、当たらなかった件数を数える', () => {
    const t = createLiveToolResultTracker()
    t.trackAssistant(assistant('m1'))
    expect(t.retract(['m1', 'm1', 'unknown'])).toEqual({ unmatched: 1 })
    expect(t.retract(['m1'])).toEqual({ unmatched: 0 })
    expect(t.isRetracted('other')).toBe(false)
  })

  it('取り消した id の記憶は上限 512 (古いものから捨てる)', () => {
    const t = createLiveToolResultTracker()
    t.retract(Array.from({ length: 513 }, (_, i) => `m${i}`))
    expect(t.isRetracted('m0')).toBe(false)
    expect(t.isRetracted('m512')).toBe(true)
  })
})
