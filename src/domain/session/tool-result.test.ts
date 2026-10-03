import { describe, expect, it } from 'vitest'

import { toLiveAssistantMessage } from './live-message'
import {
  orphanResultPart,
  pendingToolCallIds,
  readToolResult,
  withToolResult,
  withToolResults
} from './tool-result'

/** O-2 BE-020 — tool の結果の取り出しと書き込み (data-model §3)。 */

const assistant = toLiveAssistantMessage({
  type: 'assistant',
  uuid: 'a1',
  message: {
    content: [
      { type: 'tool_use', id: 'u1', name: 'Bash', input: { command: 'ls' } },
      { type: 'tool_use', id: 'u2', name: 'Read', input: { file_path: '/x' } }
    ]
  }
})

describe('readToolResult', () => {
  it('文字列・text ブロックの配列から本文を取り、エラーを読む。無害化する', () => {
    expect(
      readToolResult({ type: 'tool_result', tool_use_id: 'u1', content: 'ok‮', is_error: true })
    ).toEqual({ toolUseId: 'u1', text: 'ok', isError: true, truncated: false })
    expect(
      readToolResult({
        type: 'tool_result',
        tool_use_id: 'u1',
        content: [{ type: 'text', text: 'a' }, { type: 'image' }, { type: 'text', text: 'b' }]
      })?.text
    ).toBe('a\nb')
  })

  it('tool_result でなければ null、壊れた形は空に倒す', () => {
    expect(readToolResult({ type: 'text', text: 'x' })).toBeNull()
    expect(readToolResult(null)).toBeNull()
    expect(readToolResult({ type: 'tool_result', content: 5 })).toEqual({
      toolUseId: '',
      text: '',
      isError: false,
      truncated: false
    })
  })

  it('上限を超える本文は切り詰めて truncated', () => {
    const big = readToolResult({
      type: 'tool_result',
      tool_use_id: 'u1',
      content: 'x'.repeat(300_000)
    })
    expect(big?.truncated).toBe(true)
    expect(big?.text.length).toBe(200_000)
  })
})

describe('withToolResult / withToolResults', () => {
  it('該当する tool-call に結果を埋め、無ければ null', () => {
    const r = readToolResult({ type: 'tool_result', tool_use_id: 'u1', content: 'out' })!
    const filled = withToolResult(assistant, r)
    const first = filled?.parts[0]
    expect(first?.type === 'tool-call' && first.result).toBe('out')
    expect(withToolResult(assistant, { ...r, toolUseId: 'nope' })).toBeNull()
    expect(withToolResult(assistant, { ...r, toolUseId: '' })).toBeNull()
    expect(pendingToolCallIds(filled!)).toEqual(['u2'])
  })

  it('複数の結果を 1 回で埋め、今回埋めた結果だけを合計の上限で短くする', () => {
    const r1 = readToolResult({ type: 'tool_result', tool_use_id: 'u1', content: 'a'.repeat(80) })!
    const r2 = readToolResult({ type: 'tool_result', tool_use_id: 'u2', content: 'b'.repeat(80) })!
    const out = withToolResults(assistant, [r1, r2], 100)
    expect(out?.applied).toEqual(['u1', 'u2'])
    const parts = out!.message.parts
    const p1 = parts[0]
    const p2 = parts[1]
    expect(p1?.type === 'tool-call' && p1.result?.length).toBe(80)
    expect(p1?.type === 'tool-call' && p1.truncated).toBe(false)
    expect(p2?.type === 'tool-call' && p2.result?.length).toBe(20)
    expect(p2?.type === 'tool-call' && p2.truncated).toBe(true)
    expect(withToolResults(assistant, [{ ...r1, toolUseId: 'x' }])).toBeNull()
  })

  it('先に埋まっていた結果は削らない', () => {
    const r1 = readToolResult({ type: 'tool_result', tool_use_id: 'u1', content: 'a'.repeat(80) })!
    const first = withToolResults(assistant, [r1], 1_000)!.message
    const r2 = readToolResult({ type: 'tool_result', tool_use_id: 'u2', content: 'b'.repeat(80) })!
    const second = withToolResults(first, [r2], 100)!.message
    const p1 = second.parts[0]
    const p2 = second.parts[1]
    expect(p1?.type === 'tool-call' && p1.result?.length).toBe(80)
    expect(p2?.type === 'tool-call' && p2.result?.length).toBe(20)
  })

  it('対応の無い結果は結果だけの tool-call にする', () => {
    const r = readToolResult({ type: 'tool_result', tool_use_id: 'zz', content: 'o' })!
    expect(orphanResultPart(r)).toMatchObject({
      type: 'tool-call',
      toolName: '(tool result)',
      result: 'o'
    })
  })
})
