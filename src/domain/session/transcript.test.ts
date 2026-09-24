import { describe, expect, it } from 'vitest'

import { toTranscriptMessages, type SessionMessageLike } from './transcript'

/** テスト用の SessionMessage を組む簡易ヘルパ。 */
function msg(
  type: 'user' | 'assistant' | 'system',
  uuid: string,
  content: unknown
): SessionMessageLike {
  return { type, uuid, message: { role: type, content } }
}

describe('toTranscriptMessages', () => {
  it('user / assistant の text を記録順に text part へ写す (markdown 改行を保持)', () => {
    const out = toTranscriptMessages([
      msg('user', 'u1', 'こんにちは'),
      msg('assistant', 'a1', [{ type: 'text', text: '# 見出し\n本文' }])
    ])
    expect(out.map((m) => m.role)).toEqual(['user', 'assistant'])
    expect(out[0]).toMatchObject({ id: 'u1', parts: [{ type: 'text', text: 'こんにちは' }] })
    expect(out[1].parts[0]).toEqual({ type: 'text', text: '# 見出し\n本文' })
  })

  it('文字列 content を 1 つの text part に正規化する', () => {
    const out = toTranscriptMessages([msg('user', 'u1', 'plain string')])
    expect(out[0].parts).toEqual([{ type: 'text', text: 'plain string' }])
  })

  it('thinking を reasoning part に写す', () => {
    const out = toTranscriptMessages([
      msg('assistant', 'a1', [{ type: 'thinking', thinking: '考え中' }])
    ])
    expect(out[0].parts[0]).toEqual({ type: 'reasoning', text: '考え中' })
  })

  it('tool_use と後続 user の tool_result を id で対にし、user メッセージは出さない', () => {
    const out = toTranscriptMessages([
      msg('assistant', 'a1', [
        { type: 'text', text: '実行します' },
        { type: 'tool_use', id: 'tc1', name: 'Bash', input: { command: 'ls' } }
      ]),
      msg('user', 'u1', [{ type: 'tool_result', tool_use_id: 'tc1', content: 'file.txt' }])
    ])
    // tool_result だけの user は出さない → assistant 1 件のみ
    expect(out).toHaveLength(1)
    expect(out[0].role).toBe('assistant')
    const toolPart = out[0].parts.find((p) => p.type === 'tool-call')
    expect(toolPart).toMatchObject({
      type: 'tool-call',
      toolCallId: 'tc1',
      toolName: 'Bash',
      result: 'file.txt',
      isError: false
    })
    expect((toolPart as { argsText: string }).argsText).toContain('"command": "ls"')
  })

  it('専用表示を持たない (未定義の) tool も tool-call part として名前・入力・結果を欠落なく出す', () => {
    const out = toTranscriptMessages([
      msg('assistant', 'a1', [
        { type: 'tool_use', id: 'tc1', name: 'MysteryTool', input: { x: 1 } }
      ]),
      msg('user', 'u1', [{ type: 'tool_result', tool_use_id: 'tc1', content: 'done' }])
    ])
    const toolPart = out[0].parts[0]
    expect(toolPart).toMatchObject({ toolName: 'MysteryTool', result: 'done' })
  })

  it('result を持たない tool_use は result: null で出す', () => {
    const out = toTranscriptMessages([
      msg('assistant', 'a1', [{ type: 'tool_use', id: 'tc1', name: 'Bash', input: {} }])
    ])
    expect(out[0].parts[0]).toMatchObject({ type: 'tool-call', result: null })
  })

  it('孤児 tool_result (対応する tool_use が無い) を欠落させず単独 tool-call で出す', () => {
    const out = toTranscriptMessages([
      msg('user', 'u1', [{ type: 'tool_result', tool_use_id: 'missing', content: 'orphan output' }])
    ])
    expect(out).toHaveLength(1)
    expect(out[0].parts[0]).toMatchObject({ type: 'tool-call', result: 'orphan output' })
  })

  it('is_error の tool_result を isError: true で写す', () => {
    const out = toTranscriptMessages([
      msg('assistant', 'a1', [{ type: 'tool_use', id: 'tc1', name: 'Bash', input: {} }]),
      msg('user', 'u1', [
        { type: 'tool_result', tool_use_id: 'tc1', content: 'boom', is_error: true }
      ])
    ])
    expect(out[0].parts[0]).toMatchObject({ isError: true, result: 'boom' })
  })

  it('未知の content block を欠落として扱わず、クラッシュせず skip する', () => {
    const out = toTranscriptMessages([
      msg('assistant', 'a1', [
        { type: 'text', text: 'ok' },
        { type: 'some_future_block', payload: 42 }
      ])
    ])
    expect(out[0].parts).toEqual([{ type: 'text', text: 'ok' }])
  })

  it('会話由来本文の双方向制御文字を除去する (サニタイザ経由)', () => {
    const out = toTranscriptMessages([msg('assistant', 'a1', [{ type: 'text', text: 'a‮b' }])])
    expect(out[0].parts[0]).toEqual({ type: 'text', text: 'ab' })
  })

  it('巨大な tool_result を切り詰める', () => {
    const huge = 'x'.repeat(500_000)
    const out = toTranscriptMessages([
      msg('assistant', 'a1', [{ type: 'tool_use', id: 'tc1', name: 'Bash', input: {} }]),
      msg('user', 'u1', [{ type: 'tool_result', tool_use_id: 'tc1', content: huge }])
    ])
    const result = (out[0].parts[0] as { result: string }).result
    expect(result.length).toBeLessThan(huge.length)
  })

  it('uuid が無いレコードは skip する', () => {
    const out = toTranscriptMessages([
      { type: 'user', uuid: '', message: { role: 'user', content: 'x' } }
    ])
    expect(out).toHaveLength(0)
  })

  it('base64 image を data: URL に、http(s) リモート画像は除外する', () => {
    const out = toTranscriptMessages([
      msg('user', 'u1', [
        { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAAA' } },
        { type: 'image', source: { type: 'url', url: 'https://attacker.example/track.png' } }
      ])
    ])
    expect(out[0].parts).toEqual([{ type: 'image', url: 'data:image/png;base64,AAAA' }])
  })

  it('image/svg+xml は除外する (script 面が残るため。pr-gate security M-001)', () => {
    const out = toTranscriptMessages([
      msg('user', 'u1', [
        {
          type: 'image',
          source: { type: 'base64', media_type: 'image/svg+xml', data: 'PHN2Zz4=' }
        },
        // 安全な MIME は通す (対照)。
        { type: 'image', source: { type: 'base64', media_type: 'image/webp', data: 'BBBB' } }
      ])
    ])
    expect(out[0].parts).toEqual([{ type: 'image', url: 'data:image/webp;base64,BBBB' }])
  })

  it('コンパクション境界を最小の divider で示す (FR-018)', () => {
    const out = toTranscriptMessages([
      {
        type: 'system',
        uuid: 's1',
        message: { subtype: 'compact_boundary', compact_metadata: {} }
      },
      {
        type: 'assistant',
        uuid: 'a1',
        message: { role: 'assistant', content: [{ type: 'text', text: 'after' }] }
      }
    ])
    expect(out).toHaveLength(2)
    expect(out[0]).toMatchObject({
      role: 'system',
      parts: [{ type: 'divider', label: 'コンテキストを圧縮' }]
    })
    expect(out[1].parts[0]).toEqual({ type: 'text', text: 'after' })
  })

  it('コンパクション境界でない system メッセージ (認識できる content なし) は出さない', () => {
    const out = toTranscriptMessages([
      { type: 'system', uuid: 's1', message: { subtype: 'something_else' } }
    ])
    expect(out).toHaveLength(0)
  })
})
