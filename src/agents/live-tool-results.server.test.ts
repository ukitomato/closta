import { describe, expect, it } from 'vitest'

import { RESEND_RESULT_MAX_BYTES } from '@domain/session/tool-result'
import type { TranscriptMessageDTO, TranscriptPartDTO } from '@domain/session/transcript-dto'

import { createLiveToolResultTracker, MAX_PENDING_TOOL_MESSAGES } from './live-tool-results'

/** サーバー側の tool の結果の対応づけ (O-12 BE-032。data-model §2.3)。 */

type ServerPart = Extract<TranscriptPartDTO, { type: 'server-tool-call' }>
type Result = NonNullable<ServerPart['result']>

const call = (id: string): ServerPart => ({
  type: 'server-tool-call',
  toolCallId: id,
  toolName: 'web_search',
  argsText: '{}',
  truncated: false,
  result: null
})
const orphan = (id: string, result: Result): ServerPart => ({
  type: 'server-tool-call',
  toolCallId: id,
  toolName: '',
  argsText: '',
  truncated: false,
  result
})
const msg = (id: string, ...parts: TranscriptPartDTO[]): TranscriptMessageDTO => ({
  id,
  role: 'assistant',
  parts,
  createdAt: 1
})
const search = (n: number): Result => ({
  kind: 'web-search',
  sources: Array.from({ length: n }, (_, i) => ({ title: `t${i}`, url: `https://e.com/${i}` })),
  omitted: 0
})
const err: Result = { kind: 'error', errorCode: 'unavailable' }

describe('applyServerResults', () => {
  it('結果が無い (孤児が無い) メッセージはそのまま返す', () => {
    const t = createLiveToolResultTracker()
    const m = msg('a', { type: 'text', text: 'x' })
    expect(t.applyServerResults(m)).toEqual({ resend: [], message: m })
  })

  it('別のメッセージの結果で 1 回送り直し、届いたメッセージから孤児が消える (他の part は残る)', () => {
    const t = createLiveToolResultTracker()
    t.trackAssistant(msg('a', call('srv_1')))
    const out = t.applyServerResults(
      msg('b', { type: 'text', text: 'x' }, orphan('srv_1', search(2)))
    )
    expect(out.resend).toHaveLength(1)
    expect(out.resend[0]?.id).toBe('a')
    expect(out.resend[0]?.parts[0]).toMatchObject({
      toolName: 'web_search',
      result: { kind: 'web-search' }
    })
    expect(out.message?.parts).toEqual([{ type: 'text', text: 'x' }])
  })

  it('part が残らなければ届いたメッセージは送らない', () => {
    const t = createLiveToolResultTracker()
    t.trackAssistant(msg('a', call('srv_1')))
    const out = t.applyServerResults(msg('b', orphan('srv_1', err)))
    expect(out.resend).toHaveLength(1)
    expect(out.message).toBeNull()
  })

  it('対応の無い結果は孤児のまま残る', () => {
    const t = createLiveToolResultTracker()
    const m = msg('b', orphan('srv_9', err))
    expect(t.applyServerResults(m)).toEqual({ resend: [], message: m })
  })

  it('2 つ目の結果は孤児のまま出る', () => {
    const t = createLiveToolResultTracker()
    t.trackAssistant(msg('a', call('srv_1')))
    t.applyServerResults(msg('b', orphan('srv_1', err)))
    const second = msg('c', orphan('srv_1', err))
    expect(t.applyServerResults(second)).toEqual({ resend: [], message: second })
  })

  it('取り消した根は送り直さず、その結果も捨てる', () => {
    const t = createLiveToolResultTracker()
    t.trackAssistant(msg('a', call('srv_1')))
    t.retract(['a'])
    const out = t.applyServerResults(msg('b', { type: 'text', text: 'x' }, orphan('srv_1', err)))
    expect(out.resend).toEqual([])
    expect(out.message?.parts).toEqual([{ type: 'text', text: 'x' }])
  })

  it('257 件目で最も古い記憶を忘れて孤児になる', () => {
    const t = createLiveToolResultTracker()
    for (let i = 0; i <= MAX_PENDING_TOOL_MESSAGES; i += 1) {
      t.trackAssistant(msg(`m${i}`, call(`srv_${i}`)))
    }
    const old = msg('x', orphan('srv_0', err))
    expect(t.applyServerResults(old)).toEqual({ resend: [], message: old })
    const recent = t.applyServerResults(msg('y', orphan(`srv_${MAX_PENDING_TOOL_MESSAGES}`, err)))
    expect(recent.resend).toHaveLength(1)
  })

  it('送り直しの大きさが上限以下で、超えたら sources を後ろから減らして omitted に足す', () => {
    const t = createLiveToolResultTracker()
    t.trackAssistant(msg('a', call('srv_1'), call('srv_2')))
    const big = (n: number): Result => ({
      kind: 'web-search',
      sources: Array.from({ length: n }, (_, i) => ({
        title: 'T'.repeat(200),
        url: `https://e.com/${'p'.repeat(1900)}${i}`
      })),
      omitted: 0
    })
    // 1 つの結果は約 20 x 2.1KB = 42KB。上限の 1MB に収まる大きさなので、そのまま埋まる。
    const ok = t.applyServerResults(msg('b', orphan('srv_1', big(20))))
    expect(ok.resend).toHaveLength(1)
    const sent = ok.resend[0]?.parts[0]
    expect(sent).toMatchObject({ result: { omitted: 0 } })
    // 上限を超える入力 (テストでは直接大きな結果を作る) は減らして omitted に足す。
    const huge: Result = {
      kind: 'web-search',
      sources: Array.from({ length: 20 }, () => ({
        title: 'T',
        url: `https://e.com/${'p'.repeat(60_000)}`
      })),
      omitted: 0
    }
    const t2 = createLiveToolResultTracker()
    t2.trackAssistant(msg('a', call('srv_1')))
    const out = t2.applyServerResults(msg('b', orphan('srv_1', huge)))
    const part = out.resend[0]?.parts[0]
    if (part?.type !== 'server-tool-call' || part.result?.kind !== 'web-search')
      throw new Error('part')
    expect(part.result.omitted).toBeGreaterThan(0)
    expect(part.result.sources.length + part.result.omitted).toBe(20)
    expect(JSON.stringify(out.resend[0]).length).toBeLessThanOrEqual(RESEND_RESULT_MAX_BYTES)
  })

  it('結果の届かない server-tool-call は result: null のまま覚えられる', () => {
    const t = createLiveToolResultTracker()
    const m = msg('a', call('srv_1'))
    t.trackAssistant(m)
    const out = t.applyServerResults(msg('b', { type: 'text', text: 'x' }))
    expect(out.resend).toEqual([])
    expect(m.parts[0]).toMatchObject({ result: null })
  })
})
