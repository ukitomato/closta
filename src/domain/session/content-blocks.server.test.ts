import { describe, expect, it } from 'vitest'

import {
  placeServerResult,
  serverToolResultOf,
  serverToolUsePart,
  unsupportedBlockPart,
  webSourceUrl,
  type ServerCallTable
} from './content-blocks'
import { toLiveAssistantMessage } from './live-message'
import { toTranscriptMessages } from './transcript'

/** data-model §4.2 の B 節の 33 行 (role ごとのブロックの `type`)。 */
const B_ASSISTANT = [
  'text',
  'thinking',
  'redacted_thinking',
  'tool_use',
  'server_tool_use',
  'web_search_tool_result',
  'web_fetch_tool_result',
  'advisor_tool_result',
  'code_execution_tool_result',
  'bash_code_execution_tool_result',
  'text_editor_code_execution_tool_result',
  'tool_search_tool_result',
  'mcp_tool_use',
  'mcp_tool_result',
  'container_upload',
  'compaction',
  'fallback'
]
const B_USER = [
  'text',
  'image',
  'document',
  'search_result',
  'thinking',
  'redacted_thinking',
  'tool_use',
  'tool_result',
  'server_tool_use',
  'web_search_tool_result',
  'web_fetch_tool_result',
  'code_execution_tool_result',
  'bash_code_execution_tool_result',
  'text_editor_code_execution_tool_result',
  'tool_search_tool_result',
  'container_upload'
]

function blockOf(type: string): Record<string, unknown> {
  const base: Record<string, unknown> = {
    type,
    MARK: 'BLOCK_BODY_MARK',
    content: 'BLOCK_BODY_MARK'
  }
  if (type === 'text') return { type, text: 'hello' }
  if (type === 'thinking') return { type, thinking: 'hmm' }
  if (type === 'tool_use' || type === 'server_tool_use') {
    return { type, id: 'toolu_1', name: 'n', input: { a: 1 } }
  }
  if (type === 'tool_result') return { type, tool_use_id: 'toolu_1', content: 'ok' }
  if (type === 'image') {
    return { type, source: { type: 'base64', media_type: 'image/png', data: 'AA' } }
  }
  if (type === 'document') return { type, title: 't', source: { type: 'base64', data: 'D' } }
  if (type.endsWith('_tool_result')) return { ...base, tool_use_id: 'srv_1' }
  return base
}

describe('B 節の 33 行 (O-12 BE-030 / SC-003 / SC-004)', () => {
  it('B 節の行数は assistant 17 + user 16', () => {
    expect(B_ASSISTANT.length + B_USER.length).toBe(33)
  })

  it('assistant の 17 種は専用の part か印になり、消えるものが無い (過去ログと実行中)', () => {
    const expected: Record<string, string> = {
      text: 'text',
      thinking: 'reasoning',
      redacted_thinking: 'reasoning',
      tool_use: 'tool-call',
      server_tool_use: 'server-tool-call'
    }
    for (const type of B_ASSISTANT) {
      const want =
        expected[type] ??
        (type.endsWith('_tool_result') && type !== 'mcp_tool_result'
          ? 'server-tool-call'
          : 'unsupported-block')
      const out = toTranscriptMessages([
        { type: 'assistant', uuid: `a-${type}`, message: { content: [blockOf(type)] } }
      ])
      expect(
        out[0]?.parts.map((p) => p.type),
        `assistant/${type}`
      ).toEqual([want])
      const live = toLiveAssistantMessage(
        { type: 'assistant', uuid: 'l', message: { content: [blockOf(type)] } },
        1
      )
      expect(
        live.parts.map((p) => p.type),
        `live assistant/${type}`
      ).toEqual([want])
    }
  })

  it('user の 16 種は許可一覧の 4 つが今のまま、残りは unsupported-block になる', () => {
    const expected: Record<string, string> = { text: 'text', image: 'image', document: 'file' }
    for (const type of B_USER) {
      if (type === 'tool_result') continue
      const out = toTranscriptMessages([
        { type: 'user', uuid: `u-${type}`, message: { content: [blockOf(type)] } }
      ])
      const want = expected[type] ?? 'unsupported-block'
      expect(
        out[0]?.parts.map((p) => p.type),
        `user/${type}`
      ).toEqual([want])
    }
  })

  it('中身の目印が unsupported-block の DTO に 0 件', () => {
    const out = toTranscriptMessages([
      {
        type: 'user',
        uuid: 'u1',
        message: {
          content: [
            { type: 'search_result', MARK: 'BLOCK_BODY_MARK', content: ['BLOCK_BODY_MARK'] }
          ]
        }
      },
      {
        type: 'assistant',
        uuid: 'a1',
        message: { content: [{ type: 'mcp_tool_use', input: 'BLOCK_BODY_MARK' }] }
      }
    ])
    expect(JSON.stringify(out)).not.toContain('BLOCK_BODY_MARK')
  })
})

describe('unsupportedBlockPart (blockType の形)', () => {
  it('形に合えばその値、外れたら空', () => {
    expect(unsupportedBlockPart('mcp_tool_use').blockType).toBe('mcp_tool_use')
    expect(unsupportedBlockPart('MCP_Tool').blockType).toBe('')
    expect(unsupportedBlockPart('a'.repeat(65)).blockType).toBe('')
    expect(unsupportedBlockPart('').blockType).toBe('')
    expect(unsupportedBlockPart(undefined).blockType).toBe('')
  })
})

describe('serverToolUsePart', () => {
  it('名前と入力を無害化し、caller は読まない。最初の一致を表に残す', () => {
    const table: ServerCallTable = new Map()
    const part = serverToolUsePart(
      {
        type: 'server_tool_use',
        id: 'srv_1',
        name: 'web‮_search',
        input: { query: 'q' },
        caller: 'CALLER_MARK'
      },
      table
    )
    expect(part.toolName).toBe('web_search')
    expect(part.argsText).toContain('"query"')
    expect(part.result).toBeNull()
    expect(JSON.stringify(part)).not.toContain('CALLER_MARK')
    const second = serverToolUsePart({ type: 'server_tool_use', id: 'srv_1', name: 'x' }, table)
    expect(table.get('srv_1')).toBe(part)
    expect(second).not.toBe(part)
  })

  it('入力はバイトの上限で切り、truncated を立てる', () => {
    const part = serverToolUsePart(
      { type: 'server_tool_use', id: 's', name: 'n', input: 'x'.repeat(300_000) },
      new Map()
    )
    expect(part.truncated).toBe(true)
  })
})

describe('serverToolResultOf', () => {
  const item = (n: number): Record<string, unknown> => ({
    type: 'web_search_result',
    title: `t${n}`,
    url: `https://example.com/${n}`,
    encrypted_content: 'ENC_MARK',
    page_age: 'AGE_MARK'
  })

  it('21 件で 20 件と omitted 1。type が違う項目と encrypted_content・page_age は読まない', () => {
    const content = [
      ...Array.from({ length: 21 }, (_, i) => item(i)),
      { type: 'other', title: 'OTHER_MARK' }
    ]
    const result = serverToolResultOf({ type: 'web_search_tool_result', content })
    expect(result.kind).toBe('web-search')
    if (result.kind !== 'web-search') return
    expect(result.sources).toHaveLength(20)
    expect(result.omitted).toBe(1)
    const json = JSON.stringify(result)
    for (const mark of ['ENC_MARK', 'AGE_MARK', 'OTHER_MARK']) expect(json).not.toContain(mark)
  })

  it('タイトルは伏せ字と 200 コードポイント', () => {
    const secret = 'sk-ant-api03-ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    const result = serverToolResultOf({
      type: 'web_search_tool_result',
      content: [
        { type: 'web_search_result', title: `a ${secret}`, url: 'https://e.com' },
        { type: 'web_search_result', title: 'あ'.repeat(500), url: 'https://e.com' }
      ]
    })
    if (result.kind !== 'web-search') throw new Error('kind')
    expect(result.sources[0]?.title).not.toContain(secret)
    expect(Array.from(result.sources[1]?.title ?? '')).toHaveLength(200)
  })

  it('エラーは種類だけ。形が外れたら空', () => {
    const err = (code: unknown): unknown =>
      serverToolResultOf({
        type: 'web_search_tool_result',
        content: { type: 'web_search_tool_result_error', error_code: code }
      })
    expect(err('max_uses_exceeded')).toEqual({ kind: 'error', errorCode: 'max_uses_exceeded' })
    expect(err('Bad Code!')).toEqual({ kind: 'error', errorCode: '' })
    expect(err(1)).toEqual({ kind: 'error', errorCode: '' })
  })

  it('他の結果の種類は unsupported', () => {
    expect(serverToolResultOf({ type: 'web_fetch_tool_result', content: 'X' })).toEqual({
      kind: 'unsupported',
      blockType: 'web_fetch_tool_result'
    })
    expect(serverToolResultOf({ type: 'web_search_tool_result', content: 'str' })).toEqual({
      kind: 'unsupported',
      blockType: 'web_search_tool_result'
    })
  })
})

describe('webSourceUrl', () => {
  it('http(s) だけを運ぶ', () => {
    expect(webSourceUrl('https://a.com/x')).toBe('https://a.com/x')
    expect(webSourceUrl('HTTPS://a.com')).toBe('HTTPS://a.com')
    expect(webSourceUrl('javascript:alert(1)')).toBe('')
    expect(webSourceUrl('file:///etc/passwd')).toBe('')
    expect(webSourceUrl('https://a.com/\n')).toBe('')
    expect(webSourceUrl('https://a.com/‮')).toBe('')
    expect(webSourceUrl(`https://a.com/${'a'.repeat(2049)}`)).toBe('')
    expect(webSourceUrl(1)).toBe('')
  })
})

describe('placeServerResult', () => {
  it('同じ id に埋める。2 つ目と対応の無い結果と形の外れた id は孤児', () => {
    const table: ServerCallTable = new Map()
    const call = serverToolUsePart(
      { type: 'server_tool_use', id: 'srv_1', name: 'web_search' },
      table
    )
    const result = (id: unknown): Record<string, unknown> => ({
      type: 'web_fetch_tool_result',
      tool_use_id: id
    })
    expect(placeServerResult(result('srv_1'), table)).toBeNull()
    expect(call.result).toEqual({ kind: 'unsupported', blockType: 'web_fetch_tool_result' })
    expect(placeServerResult(result('srv_1'), table)?.toolName).toBe('')
    expect(placeServerResult(result('srv_9'), table)?.toolCallId).toBe('srv_9')
    expect(placeServerResult(result('bad id!'), table)?.toolCallId).toBe('')
  })
})
