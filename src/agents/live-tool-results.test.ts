import { describe, expect, it } from 'vitest'

import { RESEND_RESULT_MAX_BYTES } from '@domain/session/tool-result'
import type { TranscriptMessageDTO, TranscriptPartDTO } from '@domain/session/transcript-dto'

import { createLiveToolResultTracker, MAX_PENDING_TOOL_MESSAGES } from './live-tool-results'

/**
 * 実行中の tool の結果の対応 (O-2 / BE-024。data-model §3)。SDK のメッセージは fake の構造で渡す。
 */

type ToolCallPart = Extract<TranscriptPartDTO, { type: 'tool-call' }>

const RECEIVED_AT = 1_760_000_000_000

/** 受信時刻を固定した tracker (O-9 / AD-051。`applyUserMessage` の第 2 引数は呼ぶ側が渡す)。 */
function createTracker(receivedAt = RECEIVED_AT): {
  trackAssistant: ReturnType<typeof createLiveToolResultTracker>['trackAssistant']
  applyUserMessage: (raw: unknown) => readonly TranscriptMessageDTO[]
  pendingMessageCount: ReturnType<typeof createLiveToolResultTracker>['pendingMessageCount']
  retract: ReturnType<typeof createLiveToolResultTracker>['retract']
  isRetracted: ReturnType<typeof createLiveToolResultTracker>['isRetracted']
} {
  const t = createLiveToolResultTracker()
  return {
    trackAssistant: t.trackAssistant,
    applyUserMessage: (raw) => t.applyUserMessage(raw, receivedAt),
    pendingMessageCount: t.pendingMessageCount,
    retract: t.retract,
    isRetracted: t.isRetracted
  }
}

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
    const t = createTracker()
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
    const t = createTracker()
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
    const t = createTracker()
    t.trackAssistant(assistant('m1', 'tu1'))
    const out = t.applyUserMessage(user(result('tu1', 'x'.repeat(2_000_000))))
    const part = calls(out[0] as TranscriptMessageDTO)[0] as ToolCallPart
    expect(part.truncated).toBe(true)
    expect((part.result ?? '').length).toBeLessThan(2_000_000)
  })

  it('並列の結果が 1 つの user メッセージで来ても送り直しは 1 回', () => {
    const t = createTracker()
    t.trackAssistant(assistant('m1', 'a', 'b', 'c'))
    const out = t.applyUserMessage(user(result('a', '1'), result('b', '2'), result('c', '3')))
    expect(out.map((m) => m.id)).toEqual(['m1'])
    expect(calls(out[0] as TranscriptMessageDTO).map((p) => p.result)).toEqual(['1', '2', '3'])
  })

  it('結果が 1 つずつ別の user メッセージで来ても、送り直しの回数は user メッセージの数以下', () => {
    const t = createTracker()
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
    const t = createTracker()
    t.trackAssistant(assistant('m1', 'a'))
    t.trackAssistant(assistant('m2', 'b', 'c'))
    const out = t.applyUserMessage(user(result('b', '2'), result('a', '1'), result('c', '3')))
    expect(out.map((m) => m.id).sort()).toEqual(['m1', 'm2'])
  })

  it('対応の無い結果は result:<id> の結果だけのメッセージ', () => {
    const t = createTracker()
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
        createdAt: RECEIVED_AT
      }
    ])
  })

  it('送り直しの createdAt は最初の値のまま (受信時刻を進めても変わらない。O-9 / AD-051)', () => {
    const t = createLiveToolResultTracker()
    const first: TranscriptMessageDTO = { ...assistant('m1', 'a'), createdAt: 1_000 }
    t.trackAssistant(first)
    const out = t.applyUserMessage(user(result('a', 'ok')), RECEIVED_AT + 60_000)
    expect(out[0]?.id).toBe('m1')
    expect(out[0]?.createdAt).toBe(1_000)
  })

  it('同じ結果が 2 度来たら 2 度目は result:<id> (埋め済みを上書きしない)', () => {
    const t = createTracker()
    t.trackAssistant(assistant('m1', 'a', 'b'))
    t.applyUserMessage(user(result('a', '1')))
    const out = t.applyUserMessage(user(result('a', 'again')))
    expect(out.map((m) => m.id)).toEqual(['result:a'])
  })

  it('toolCallId が空の tool_use は登録しない', () => {
    const t = createTracker()
    t.trackAssistant(assistant('m1', ''))
    expect(t.pendingMessageCount()).toBe(0)
    const out = t.applyUserMessage(user(result('', 'x')))
    expect(out.map((m) => m.id)).toEqual(['result:'])
  })

  it('tool_use を含まない assistant は覚えない', () => {
    const t = createTracker()
    t.trackAssistant(assistant('m1'))
    expect(t.pendingMessageCount()).toBe(0)
  })

  it(`${MAX_PENDING_TOOL_MESSAGES} 件を超えたら古いものから捨てる`, () => {
    const t = createTracker()
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
    const t = createTracker()
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
    const t = createTracker()
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
    const t = createTracker()
    t.trackAssistant(assistant('m1', 'a'))
    expect(t.applyUserMessage(user({ type: 'text', text: 'SECRET-BODY' }))).toEqual([])
    expect(
      t.applyUserMessage({ type: 'user', message: { role: 'user', content: 'SECRET-BODY' } })
    ).toEqual([])
    const out = t.applyUserMessage(user({ type: 'text', text: 'SECRET-BODY' }, result('a', 'ok')))
    expect(JSON.stringify(out)).not.toContain('SECRET-BODY')
  })

  it('形の壊れた user メッセージでも例外を投げない', () => {
    const t = createTracker()
    expect(t.applyUserMessage(null)).toEqual([])
    expect(t.applyUserMessage({ type: 'user' })).toEqual([])
    expect(t.applyUserMessage(user(null, 1, 'x'))).toEqual([])
  })
})

describe('live-tool-results: toolCallArgs (O-11 BE-023)', () => {
  it('覚えている Bash の tool-call の argsText を返す。忘れた・知らない id は undefined', () => {
    const t = createLiveToolResultTracker()
    const msg = assistant('m1', 'tu1')
    const withArgs: TranscriptMessageDTO = {
      ...msg,
      parts: msg.parts.map((p) =>
        p.type === 'tool-call' ? { ...p, argsText: '{"command":"npm x"}' } : p
      )
    }
    t.trackAssistant(withArgs)
    expect(t.toolCallArgs('tu1')).toBe('{"command":"npm x"}')
    expect(t.toolCallArgs('nope')).toBeUndefined()
    t.retract(['m1'])
    expect(t.toolCallArgs('tu1')).toBeUndefined()
  })
})

describe('live-tool-results: 取り消し (O-6 BE-012 / 016 data-model §1)', () => {
  it('取り消した後に結果が届いても、送り直しにも結果だけのメッセージにもしない', () => {
    const t = createTracker()
    t.trackAssistant(assistant('m1', 'tu1'))
    expect(t.retract(['m1'])).toEqual({ unmatched: 0 })
    expect(t.pendingMessageCount()).toBe(0)
    expect(t.applyUserMessage(user(result('tu1', 'ok')))).toEqual([])
  })

  it('取り消していない tool の結果は今までどおり (同じ user メッセージの別の結果)', () => {
    const t = createTracker()
    t.trackAssistant(assistant('m1', 'tu1'))
    t.trackAssistant(assistant('m2', 'tu2'))
    t.retract(['m1'])
    const out = t.applyUserMessage(user(result('tu1', 'a'), result('tu2', 'b')))
    expect(out.map((m) => m.id)).toEqual(['m2'])
  })

  it('取り消した id の assistant を後で受けても送らない判定になり、その tool の結果も捨てる', () => {
    const t = createTracker()
    t.retract(['m1'])
    expect(t.isRetracted('m1')).toBe(true)
    t.trackAssistant(assistant('m1', 'tu1'))
    expect(t.pendingMessageCount()).toBe(0)
    expect(t.applyUserMessage(user(result('tu1', 'ok')))).toEqual([])
  })

  it('冪等。同じ id を続けて取り消しても例外が出ず、当たらなかった件数を数える', () => {
    const t = createTracker()
    t.trackAssistant(assistant('m1'))
    expect(t.retract(['m1', 'm1', 'unknown'])).toEqual({ unmatched: 1 })
    expect(t.retract(['m1'])).toEqual({ unmatched: 0 })
    expect(t.isRetracted('other')).toBe(false)
  })

  it('取り消した id の記憶は上限 512 (古いものから捨てる)', () => {
    const t = createTracker()
    t.retract(Array.from({ length: 513 }, (_, i) => `m${i}`))
    expect(t.isRetracted('m0')).toBe(false)
    expect(t.isRetracted('m512')).toBe(true)
  })
})

describe('live-tool-results: subagent の入れ子 (O-11 BE-030 / AD-055)', () => {
  const NO_BYTES = 1_000_000

  function setup(): {
    t: ReturnType<typeof createLiveToolResultTracker>
    track: (m: TranscriptMessageDTO) => void
    user: (...content: unknown[]) => readonly TranscriptMessageDTO[]
  } {
    const t = createLiveToolResultTracker()
    return {
      t,
      track: (m: TranscriptMessageDTO): void => t.trackAssistant(m),
      user: (...content: unknown[]): readonly TranscriptMessageDTO[] =>
        t.applyUserMessage(user(...content), RECEIVED_AT)
    }
  }
  /** 子のメッセージ。tool-call を持つときは結果待ち。 */
  const child = (id: string, ...toolIds: string[]): TranscriptMessageDTO =>
    assistant(id, ...toolIds)
  const firstCall = (m: TranscriptMessageDTO): ToolCallPart => calls(m)[0] as ToolCallPart
  const sizeOf = (m: TranscriptMessageDTO): number =>
    new TextEncoder().encode(JSON.stringify(m)).length

  it('親の children に入り、同じ id で根が出直す (根の createdAt は変わらない。元の DTO は書き換えない)', () => {
    const { t, track } = setup()
    const root = assistant('m1', 'agent1')
    track(root)
    const out = t.nest(child('c1'), 'agent1')
    expect(out.kind).toBe('resend')
    if (out.kind !== 'resend') return
    expect(out.message.id).toBe('m1')
    expect(firstCall(out.message).children.map((c) => c.id)).toEqual(['c1'])
    expect(firstCall(root).children).toEqual([]) // 写し直し
  })

  it('多段: 2 段で入り、8 段で入り、9 段で平ら (孤児)', () => {
    const { t, track } = setup()
    track(assistant('m1', 'a0'))
    let parent = 'a0'
    for (let depth = 1; depth <= 8; depth++) {
      const next = `a${depth}`
      const out = t.nest(child(`c${depth}`, next), parent)
      expect(out.kind).toBe('resend')
      parent = next
    }
    expect(t.nest(child('c9'), parent).kind).toBe('orphan')
  })

  it('孤児の 3 つの形: 親が表に無い・形が外れた id・自分の tool-call', () => {
    const { t, track } = setup()
    track(assistant('m1', 'agent1'))
    expect(t.nest(child('c1'), 'unknown').kind).toBe('orphan')
    expect(t.nest(child('c2'), 'bad id with space').kind).toBe('orphan')
    expect(t.nest(child('c3'), 42).kind).toBe('orphan')
    expect(t.nest(child('c4', 'agent1'), 'agent1').kind).toBe('orphan')
  })

  it(`${500} 件で親が truncated になり、立てた親を 1 回だけ送り直す`, () => {
    const { t, track } = setup()
    track(assistant('m1', 'agent1'))
    for (let i = 0; i < 500; i++) expect(t.nest(child(`c${i}`), 'agent1').kind).toBe('resend')
    const over = t.nest(child('c500'), 'agent1')
    expect(over.kind).toBe('resend')
    if (over.kind !== 'resend') return
    expect(firstCall(over.message).truncated).toBe(true)
    expect(firstCall(over.message).children).toHaveLength(500)
    // 以後は送り直さない
    expect(t.nest(child('c501'), 'agent1').kind).toBe('none')
    expect(t.nest(child('c502'), 'agent1').kind).toBe('none')
  })

  it('送り直しの量: 子 1 件につき 1 回、各回 1,000,000 バイト以下、truncated の後は 0 回。親の結果は後から埋まる (RK-04)', () => {
    const { t, track, user: applyUser } = setup()
    track(assistant('m1', 'agent1'))
    let resends = 0
    let truncatedAt = -1
    const big = (id: string): TranscriptMessageDTO => ({
      id,
      role: 'assistant',
      parts: [{ type: 'text', text: 'x'.repeat(300_000) }],
      createdAt: null
    })
    for (let i = 0; i < 6; i++) {
      const out = t.nest(big(`c${i}`), 'agent1')
      if (out.kind === 'resend') {
        resends += 1
        expect(sizeOf(out.message)).toBeLessThanOrEqual(NO_BYTES)
        if (firstCall(out.message).truncated && truncatedAt < 0) truncatedAt = i
      }
    }
    // 300KB の子は 3 件入り、4 件目で truncated の印を 1 回、以後は送り直し 0 回。
    expect(truncatedAt).toBe(3)
    expect(resends).toBe(4)
    const filled = applyUser(result('agent1', 'done'))
    expect(filled).toHaveLength(1)
    expect(firstCall(filled[0] as TranscriptMessageDTO)).toMatchObject({
      result: 'done',
      truncated: true
    })
  })

  it('深い位置の結果が埋まり、根が 1 回送り直される (主ループと同じ規則)', () => {
    const { t, track, user: applyUser } = setup()
    track(assistant('m1', 'agent1'))
    t.nest(child('c1', 'inner1', 'inner2'), 'agent1')
    const out = applyUser(result('inner1', 'r1'), result('inner2', 'r2', true))
    expect(out.map((m) => m.id)).toEqual(['m1'])
    const kids = firstCall(out[0] as TranscriptMessageDTO).children
    expect(calls(kids[0] as TranscriptMessageDTO)).toMatchObject([
      { toolCallId: 'inner1', result: 'r1', isError: false },
      { toolCallId: 'inner2', result: 'r2', isError: true }
    ])
    // 根の直下の呼び出しは結果待ちのまま。
    expect(t.pendingMessageCount()).toBe(1)
    const last = applyUser(result('agent1', 'done'))
    expect(last.map((m) => m.id)).toEqual(['m1'])
    expect(t.pendingMessageCount()).toBe(0)
  })

  it('取り消した根の子は送られず、結果も捨てる', () => {
    const { t, track, user: applyUser } = setup()
    track(assistant('m1', 'agent1'))
    t.nest(child('c1', 'inner1'), 'agent1')
    t.retract(['m1'])
    expect(t.nest(child('c2'), 'agent1').kind).toBe('none')
    expect(t.nest(child('c3'), 'inner1').kind).toBe('none')
    expect(applyUser(result('inner1', 'late'))).toEqual([])
  })

  it('根の LRU で忘れた後の子は孤児', () => {
    const { t, track } = setup()
    for (let i = 0; i <= MAX_PENDING_TOOL_MESSAGES; i++) track(assistant(`m${i}`, `t${i}`))
    expect(t.nest(child('c0'), 't0').kind).toBe('orphan')
    expect(t.nest(child('cN'), `t${MAX_PENDING_TOOL_MESSAGES}`).kind).toBe('resend')
  })

  it('toolCallArgs は深い位置の tool-call も引く', () => {
    const { t, track } = setup()
    track(assistant('m1', 'agent1'))
    t.nest(
      {
        id: 'c1',
        role: 'assistant',
        parts: [{ ...toolCall('inner1'), argsText: '{"command":"npm test"}' }],
        createdAt: null
      },
      'agent1'
    )
    expect(t.toolCallArgs('inner1')).toBe('{"command":"npm test"}')
  })
})
