import { describe, expect, it } from 'vitest'
import type { TranscriptMessageDTO } from './transcript-dto'
import { toLiveAssistantMessage, type LiveAssistantMessage } from './live-message'

const RECEIVED_AT = Date.parse('2026-10-17T00:00:00Z')

function assistant(content: unknown, timestamp?: unknown): LiveAssistantMessage {
  return { type: 'assistant', uuid: 'u1', message: { content }, timestamp }
}

const toLive = (msg: LiveAssistantMessage): TranscriptMessageDTO =>
  toLiveAssistantMessage(msg, RECEIVED_AT)

describe('toLiveAssistantMessage', () => {
  it('text / thinking / tool_use ブロックを対応する part に写す', () => {
    const dto = toLive(
      assistant([
        { type: 'text', text: 'hello' },
        { type: 'thinking', thinking: 'considering' },
        { type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'ls' } }
      ])
    )
    expect(dto.id).toBe('u1')
    expect(dto.role).toBe('assistant')
    expect(dto.parts).toEqual([
      { type: 'text', text: 'hello' },
      { type: 'reasoning', text: 'considering' },
      {
        type: 'tool-call',
        toolCallId: 't1',
        toolName: 'Bash',
        argsText: '{"command":"ls"}',
        result: null,
        isError: false,
        truncated: false,
        children: []
      }
    ])
  })

  it('本文をサニタイズする (双方向制御文字を除去。FR-009/SC-008)', () => {
    const dto = toLive(assistant([{ type: 'text', text: 'a‮b' }]))
    expect(dto.parts[0]).toEqual({ type: 'text', text: 'ab' })
  })

  it('toolName もサニタイズする (MCP 由来の表示偽装を防ぐ。H-05)', () => {
    const dto = toLive(assistant([{ type: 'tool_use', id: 't', name: 'Read‮Bash', input: {} }]))
    const part = dto.parts[0]
    expect(part.type).toBe('tool-call')
    if (part.type === 'tool-call') expect(part.toolName).toBe('ReadBash')
  })

  it('content が配列でない / object でないブロックは例外を投げず落とす (行を落とさない)', () => {
    expect(toLive(assistant(undefined)).parts).toEqual([])
    expect(toLive(assistant('not-array')).parts).toEqual([])
    expect(toLive(assistant([null, 42])).parts).toEqual([])
    // 専用表示の無いブロックは種類の名前だけの印にする (O-12 / FR-011)。
    expect(toLive(assistant([{ type: 'some_future_block' }])).parts).toEqual([
      { type: 'unsupported-block', blockType: 'some_future_block' }
    ])
  })

  it('redacted_thinking は過去ログと同じ Reasoning の文言にそろえる (O-2 / FR-007)', () => {
    expect(toLive(assistant([{ type: 'redacted_thinking', data: 'x' }])).parts).toEqual([
      { type: 'reasoning', text: '[redacted thinking]' }
    ])
  })

  it('createdAt: SDK の timestamp があればその値、無い・壊れ・範囲外は受信時刻 (O-9 / AD-051)', () => {
    const at = '2026-10-16T01:23:45.678Z'
    expect(toLive(assistant([], at)).createdAt).toBe(Date.parse(at))
    expect(toLive(assistant([])).createdAt).toBe(RECEIVED_AT)
    expect(toLive(assistant([], 'garbage')).createdAt).toBe(RECEIVED_AT)
    expect(toLive(assistant([], 1_760_000_000_000)).createdAt).toBe(RECEIVED_AT)
    expect(toLive(assistant([], '2019-12-31T23:59:59Z')).createdAt).toBe(RECEIVED_AT)
  })

  it('tool_use の input が文字列化不能でも空 argsText に倒す', () => {
    const circular: Record<string, unknown> = {}
    circular.self = circular
    const dto = toLive(assistant([{ type: 'tool_use', id: 't', name: 'X', input: circular }]))
    const part = dto.parts[0]
    if (part.type === 'tool-call') expect(part.argsText).toBe('')
  })
})
