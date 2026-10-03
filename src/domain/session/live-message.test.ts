import { describe, expect, it } from 'vitest'

import { toLiveAssistantMessage, type LiveAssistantMessage } from './live-message'

function assistant(content: unknown): LiveAssistantMessage {
  return { type: 'assistant', uuid: 'u1', message: { content } }
}

describe('toLiveAssistantMessage', () => {
  it('text / thinking / tool_use ブロックを対応する part に写す', () => {
    const dto = toLiveAssistantMessage(
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
    const dto = toLiveAssistantMessage(assistant([{ type: 'text', text: 'a‮b' }]))
    expect(dto.parts[0]).toEqual({ type: 'text', text: 'ab' })
  })

  it('toolName もサニタイズする (MCP 由来の表示偽装を防ぐ。H-05)', () => {
    const dto = toLiveAssistantMessage(
      assistant([{ type: 'tool_use', id: 't', name: 'Read‮Bash', input: {} }])
    )
    const part = dto.parts[0]
    expect(part.type).toBe('tool-call')
    if (part.type === 'tool-call') expect(part.toolName).toBe('ReadBash')
  })

  it('content が配列でない / 未知ブロックは例外を投げず落とす (行を落とさない)', () => {
    expect(toLiveAssistantMessage(assistant(undefined)).parts).toEqual([])
    expect(toLiveAssistantMessage(assistant('not-array')).parts).toEqual([])
    expect(
      toLiveAssistantMessage(assistant([{ type: 'server_tool_use', id: 's' }, null, 42])).parts
    ).toEqual([])
  })

  it('redacted_thinking は過去ログと同じ Reasoning の文言にそろえる (O-2 / FR-007)', () => {
    expect(
      toLiveAssistantMessage(assistant([{ type: 'redacted_thinking', data: 'x' }])).parts
    ).toEqual([{ type: 'reasoning', text: '[redacted thinking]' }])
  })

  it('tool_use の input が文字列化不能でも空 argsText に倒す', () => {
    const circular: Record<string, unknown> = {}
    circular.self = circular
    const dto = toLiveAssistantMessage(
      assistant([{ type: 'tool_use', id: 't', name: 'X', input: circular }])
    )
    const part = dto.parts[0]
    if (part.type === 'tool-call') expect(part.argsText).toBe('')
  })
})
