import { describe, expect, it } from 'vitest'

import { toTranscriptMessages, type SessionMessageLike } from './transcript'

const assistant = (
  uuid: string,
  content: unknown[],
  extra?: Partial<SessionMessageLike>
): SessionMessageLike =>
  ({ type: 'assistant', uuid, message: { content }, ...extra }) as SessionMessageLike
const user = (
  uuid: string,
  content: unknown[],
  extra?: Partial<SessionMessageLike>
): SessionMessageLike =>
  ({ type: 'user', uuid, message: { content }, ...extra }) as SessionMessageLike

const SEARCH_USE = {
  type: 'server_tool_use',
  id: 'srv_1',
  name: 'web_search',
  input: { query: 'q' }
}
const searchResult = (id: unknown = 'srv_1'): Record<string, unknown> => ({
  type: 'web_search_tool_result',
  tool_use_id: id,
  content: [
    { type: 'web_search_result', title: 'T', url: 'https://e.com/a', encrypted_content: 'X' }
  ]
})

describe('過去ログのサーバー側の tool と知らないブロック (O-12 BE-031)', () => {
  it('同じ記録の結果のブロックが server-tool-call に埋まる', () => {
    const out = toTranscriptMessages([assistant('a1', [SEARCH_USE, searchResult()])])
    expect(out[0]?.parts).toHaveLength(1)
    const part = out[0]?.parts[0]
    expect(part).toMatchObject({
      type: 'server-tool-call',
      toolCallId: 'srv_1',
      toolName: 'web_search',
      result: { kind: 'web-search', omitted: 0 }
    })
  })

  it('別の記録の結果のブロックも埋まり、結果だけの記録は出ない', () => {
    const out = toTranscriptMessages([
      assistant('a1', [SEARCH_USE]),
      assistant('a2', [searchResult()])
    ])
    expect(out).toHaveLength(1)
    expect(out[0]?.parts[0]).toMatchObject({
      type: 'server-tool-call',
      result: { kind: 'web-search' }
    })
  })

  it('対応の無い結果は孤児の server-tool-call になる', () => {
    const out = toTranscriptMessages([assistant('a1', [searchResult('srv_9')])])
    expect(out[0]?.parts).toEqual([
      expect.objectContaining({ type: 'server-tool-call', toolCallId: 'srv_9', toolName: '' })
    ])
  })

  it('同じ id の 2 つ目の結果は孤児になる (上書きしない)', () => {
    const out = toTranscriptMessages([
      assistant('a1', [SEARCH_USE, searchResult(), searchResult()])
    ])
    expect(out[0]?.parts).toHaveLength(2)
    expect(out[0]?.parts[1]).toMatchObject({ toolName: '', toolCallId: 'srv_1' })
  })

  it('tool_use_id の形が外れたら toolCallId は空', () => {
    const out = toTranscriptMessages([assistant('a1', [searchResult('bad id!')])])
    expect(out[0]?.parts[0]).toMatchObject({ type: 'server-tool-call', toolCallId: '' })
  })

  it('web_fetch_tool_result などは結果の unsupported', () => {
    const out = toTranscriptMessages([
      assistant('a1', [
        { type: 'server_tool_use', id: 'srv_2', name: 'web_fetch', input: {} },
        { type: 'web_fetch_tool_result', tool_use_id: 'srv_2', content: 'BODY_MARK' }
      ])
    ])
    expect(out[0]?.parts[0]).toMatchObject({
      result: { kind: 'unsupported', blockType: 'web_fetch_tool_result' }
    })
    expect(JSON.stringify(out)).not.toContain('BODY_MARK')
  })

  it('user の thinking / tool_use / サーバー側のブロックなどは unsupported-block で、reasoning・tool-call にならない', () => {
    const out = toTranscriptMessages([
      user('u1', [
        { type: 'thinking', thinking: 'T' },
        { type: 'redacted_thinking', data: 'D' },
        { type: 'tool_use', id: 'toolu_1', name: 'n', input: {} },
        SEARCH_USE,
        searchResult(),
        { type: 'search_result', content: [] },
        { type: 'container_upload', file_id: 'f' }
      ])
    ])
    expect(out[0]?.parts.map((p) => p.type)).toEqual(Array(7).fill('unsupported-block'))
  })

  it('assistant の thinking / tool_use は今どおり reasoning / tool-call', () => {
    const out = toTranscriptMessages([
      assistant('a1', [
        { type: 'thinking', thinking: 'T' },
        { type: 'tool_use', id: 'toolu_1', name: 'Read', input: {} }
      ])
    ])
    expect(out[0]?.parts.map((p) => p.type)).toEqual(['reasoning', 'tool-call'])
  })

  it('経路の表: subagent の user は tool_result だけ、subagent の assistant は主ループと同じ', () => {
    const records = [
      assistant('a1', [{ type: 'tool_use', id: 'toolu_task', name: 'Agent', input: {} }])
    ]
    const sub = [
      assistant('s1', [SEARCH_USE, { type: 'mcp_tool_use' }, searchResult()], {
        parent_tool_use_id: 'toolu_task'
      }),
      user('s2', [{ type: 'search_result' }, { type: 'text', text: 'T' }], {
        parent_tool_use_id: 'toolu_task'
      })
    ]
    const out = toTranscriptMessages(records, { subagents: [sub] })
    const task = out[0]?.parts[0]
    if (task?.type !== 'tool-call') throw new Error('tool-call')
    expect(task.children).toHaveLength(1)
    expect(task.children[0]?.parts.map((p) => p.type)).toEqual([
      'server-tool-call',
      'unsupported-block'
    ])
  })

  it('text の citations は読まない', () => {
    const out = toTranscriptMessages([
      assistant('a1', [{ type: 'text', text: 'hi', citations: [{ cited_text: 'CITE_MARK' }] }])
    ])
    expect(JSON.stringify(out)).not.toContain('CITE_MARK')
  })

  it('system の記録は印を出さない', () => {
    const out = toTranscriptMessages([
      { type: 'system', uuid: 's1', message: { content: [{ type: 'mcp_tool_use' }] } }
    ])
    expect(out).toEqual([])
  })
})
