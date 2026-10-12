import { describe, expect, it } from 'vitest'

import { MAX_SUBAGENT_DEPTH, toTranscriptMessages, type SessionMessageLike } from './transcript'

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

  it('過去ログの tool 名を実行中と同じ sanitizeBody に通す (双方向制御・ゼロ幅の方向記号が落ちる。O-5 FR-001)', () => {
    const out = toTranscriptMessages([
      msg('assistant', 'a1', [
        {
          type: 'tool_use',
          id: 'tc1',
          name: 'mcp__a‮__b‎‏',
          input: {}
        }
      ])
    ])
    expect(out[0].parts[0]).toMatchObject({ type: 'tool-call', toolName: 'mcp__a__b' })
  })

  it('空の tool 名・文字列でない tool 名・無害化で空になる tool 名は (unknown tool) のまま', () => {
    const out = toTranscriptMessages([
      msg('assistant', 'a1', [
        { type: 'tool_use', id: 'tc1', name: '', input: {} },
        { type: 'tool_use', id: 'tc2', name: 42, input: {} },
        { type: 'tool_use', id: 'tc3', name: '‮‎', input: {} }
      ])
    ])
    expect(out[0].parts.map((p) => (p as { toolName: string }).toolName)).toEqual([
      '(unknown tool)',
      '(unknown tool)',
      '(unknown tool)'
    ])
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

  it('過去ログの auth_status / plugin_install から行を作らない (実行中だけ。O-5 BE-031 / 015 data-model §4)', () => {
    const out = toTranscriptMessages([
      {
        type: 'system',
        uuid: 's1',
        message: { subtype: 'plugin_install', status: 'started', name: 'acme' }
      },
      {
        type: 'system',
        uuid: 's2',
        message: { subtype: 'plugin_install', status: 'completed', name: 'acme' }
      },
      {
        type: 'system',
        uuid: 's3',
        message: { type: 'auth_status', subtype: 'auth_status', isAuthenticating: true }
      }
    ])
    expect(out).toHaveLength(0)
  })

  // ---- R-4: argsText サニタイズ (design-gate H-1/H-2) ----

  it('argsText の双方向制御文字を除去する (R-4 / design-gate H-1)', () => {
    const out = toTranscriptMessages([
      msg('assistant', 'a1', [
        { type: 'tool_use', id: 'tc1', name: 'Bash', input: { command: 'ls‮evil' } }
      ])
    ])
    const toolPart = out[0].parts[0] as { argsText: string }
    expect(toolPart.argsText).not.toContain('‮')
    expect(toolPart.argsText).toContain('lsevil')
  })

  it('巨大な argsText を切り詰め truncated: true を立てる (R-4 / design-gate H-2)', () => {
    const huge = 'y'.repeat(500_000)
    const out = toTranscriptMessages([
      msg('assistant', 'a1', [
        { type: 'tool_use', id: 'tc1', name: 'Write', input: { content: huge } }
      ])
    ])
    const toolPart = out[0].parts[0] as { argsText: string; truncated: boolean }
    expect(toolPart.argsText.length).toBeLessThan(huge.length)
    expect(toolPart.truncated).toBe(true)
  })

  it('通常サイズの tool-call は truncated: false / children: [] を持つ', () => {
    const out = toTranscriptMessages([
      msg('assistant', 'a1', [
        { type: 'tool_use', id: 'tc1', name: 'Bash', input: { command: 'ls' } }
      ])
    ])
    expect(out[0].parts[0]).toMatchObject({ truncated: false, children: [] })
  })

  // ---- R-4: subagent 入れ子 (US-2 / SC-004 / SC-009 / contracts C-2) ----

  it('Task 配下の subagent メッセージを親 Task の children に記録順で入れ子にする (SC-004)', () => {
    const out = toTranscriptMessages([
      msg('assistant', 'a1', [
        {
          type: 'tool_use',
          id: 'task1',
          name: 'Task',
          input: { subagent_type: 'search', prompt: 'find x' }
        }
      ]),
      {
        type: 'assistant',
        uuid: 'sa1',
        parent_tool_use_id: 'task1',
        message: { role: 'assistant', content: [{ type: 'text', text: 'step 1' }] }
      },
      {
        type: 'assistant',
        uuid: 'sa2',
        parent_tool_use_id: 'task1',
        message: { role: 'assistant', content: [{ type: 'text', text: 'step 2' }] }
      },
      msg('user', 'u1', [{ type: 'tool_result', tool_use_id: 'task1', content: 'found 3' }])
    ])
    // top-level は Task を持つ a1 のみ。subagent は children に入り、tool_result だけの u1 は出さない。
    expect(out).toHaveLength(1)
    const taskPart = out[0].parts[0]
    expect(taskPart.type).toBe('tool-call')
    if (taskPart.type !== 'tool-call') return
    expect(taskPart.toolName).toBe('Task')
    expect(taskPart.result).toBe('found 3')
    expect(taskPart.children.map((c) => c.id)).toEqual(['sa1', 'sa2'])
    expect(taskPart.children[0].parts[0]).toEqual({ type: 'text', text: 'step 1' })
  })

  it('親 Task を持たない (親不明の) subagent メッセージは欠落させず top-level に置く (孤児)', () => {
    const out = toTranscriptMessages([
      {
        type: 'assistant',
        uuid: 'sa1',
        parent_tool_use_id: 'unknown-task',
        message: { role: 'assistant', content: [{ type: 'text', text: 'orphan subagent' }] }
      }
    ])
    expect(out).toHaveLength(1)
    expect(out[0].id).toBe('sa1')
    expect(out[0].parts[0]).toEqual({ type: 'text', text: 'orphan subagent' })
  })

  it('自己参照 (parent_tool_use_id が自分の tool_use id) は入れ子にせず top-level に置く (循環防止)', () => {
    const out = toTranscriptMessages([
      {
        type: 'assistant',
        uuid: 'a1',
        parent_tool_use_id: 'self',
        message: {
          role: 'assistant',
          content: [{ type: 'tool_use', id: 'self', name: 'Bash', input: {} }]
        }
      }
    ])
    expect(out).toHaveLength(1)
    expect(out[0].id).toBe('a1')
    const toolPart = out[0].parts[0]
    expect(toolPart.type).toBe('tool-call')
    if (toolPart.type !== 'tool-call') return
    expect(toolPart.children).toHaveLength(0)
  })

  it('同一 toolCallId が複数あっても最初の一致に attach する (二重 attach しない。design-gate L-4)', () => {
    const out = toTranscriptMessages([
      msg('assistant', 'a1', [{ type: 'tool_use', id: 'dup', name: 'Task', input: {} }]),
      msg('assistant', 'a2', [{ type: 'tool_use', id: 'dup', name: 'Task', input: {} }]),
      {
        type: 'assistant',
        uuid: 'sa1',
        parent_tool_use_id: 'dup',
        message: { role: 'assistant', content: [{ type: 'text', text: 'child' }] }
      }
    ])
    // 最初の Task (a1) の children にのみ入る。a2 の children は空。二重 attach しない。
    expect(out.map((m) => m.id)).toEqual(['a1', 'a2'])
    const first = out[0].parts[0]
    const second = out[1].parts[0]
    if (first.type !== 'tool-call' || second.type !== 'tool-call') return
    expect(first.children.map((c) => c.id)).toEqual(['sa1'])
    expect(second.children).toHaveLength(0)
  })

  it('多段 subagent (subagent がさらに Task を起動) を parent_tool_use_id で 2 段に組む', () => {
    const out = toTranscriptMessages([
      msg('assistant', 'a1', [{ type: 'tool_use', id: 'task1', name: 'Task', input: {} }]),
      {
        type: 'assistant',
        uuid: 'sa1',
        parent_tool_use_id: 'task1',
        message: {
          role: 'assistant',
          content: [{ type: 'tool_use', id: 'task2', name: 'Task', input: {} }]
        }
      },
      {
        type: 'assistant',
        uuid: 'sa2',
        parent_tool_use_id: 'task2',
        message: { role: 'assistant', content: [{ type: 'text', text: 'deep' }] }
      }
    ])
    expect(out).toHaveLength(1)
    const l1 = out[0].parts[0]
    if (l1.type !== 'tool-call') return
    expect(l1.children.map((c) => c.id)).toEqual(['sa1'])
    const l2 = l1.children[0].parts[0]
    if (l2.type !== 'tool-call') return
    expect(l2.children.map((c) => c.id)).toEqual(['sa2'])
    expect(l2.children[0].parts[0]).toEqual({ type: 'text', text: 'deep' })
  })

  it('subagent が親 Task と隣接していなくても id で入れ子にする (SC-009 隣接非依存。design-gate PR-H-2)', () => {
    const out = toTranscriptMessages([
      msg('assistant', 'a1', [
        { type: 'tool_use', id: 'task1', name: 'Task', input: { subagent_type: 's' } }
      ]),
      // 親 Task と subagent の間に無関係な top-level メッセージが挟まる (非隣接)。
      msg('assistant', 'mid', [{ type: 'text', text: '間に挟まる別メッセージ' }]),
      {
        type: 'assistant',
        uuid: 'sa1',
        parent_tool_use_id: 'task1',
        message: { role: 'assistant', content: [{ type: 'text', text: 'child' }] }
      }
    ])
    // top-level は a1 (Task) と mid。sa1 は隣接していなくても task1 の children に入る。
    expect(out.map((m) => m.id)).toEqual(['a1', 'mid'])
    const taskPart = out[0].parts[0]
    if (taskPart.type !== 'tool-call') return
    expect(taskPart.children.map((c) => c.id)).toEqual(['sa1'])
  })

  it('MAX_SUBAGENT_DEPTH を超えるネストは欠落させず top-level に平坦化する (深さ有界化。design-gate PR-M-2/PB-L-001)', () => {
    const records: SessionMessageLike[] = [
      msg('assistant', 't0', [{ type: 'tool_use', id: 'task0', name: 'Task', input: {} }])
    ]
    // task0 の下に MAX_SUBAGENT_DEPTH+2 段の Task チェーンを作る (深さ超過を確実に踏む)。
    const CHAIN = MAX_SUBAGENT_DEPTH + 2
    for (let i = 1; i <= CHAIN; i++) {
      records.push({
        type: 'assistant',
        uuid: `sa${i}`,
        parent_tool_use_id: `task${i - 1}`,
        message: {
          role: 'assistant',
          content: [{ type: 'tool_use', id: `task${i}`, name: 'Task', input: {} }]
        }
      })
    }
    const out = toTranscriptMessages(records)
    // 全メッセージが欠落せず現れる (入れ子 + 平坦化のどちらでも tree のどこかに存在する)。
    const dump = JSON.stringify(out)
    expect(dump).toContain('"t0"')
    for (let i = 1; i <= CHAIN; i++) expect(dump).toContain(`"sa${i}"`)
    // 深さ超過分は top-level に平坦化されるため top-level が 1 件より増える。
    expect(out.length).toBeGreaterThan(1)
  })
})
