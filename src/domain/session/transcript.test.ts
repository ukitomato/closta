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

describe('toTranscriptMessages の時刻 (O-9 BE-010 / data-model §1。AD-051)', () => {
  const NOW = Date.parse('2026-10-16T12:00:00Z')
  const at = (timestamp: unknown, m: SessionMessageLike): SessionMessageLike => ({
    ...m,
    timestamp
  })

  it('timestamp があれば createdAt に入り、無い・壊れ・範囲外は null', () => {
    const out = toTranscriptMessages(
      [
        at('2026-10-16T01:23:45.678Z', msg('user', 'u1', 'a')),
        msg('assistant', 'a1', 'b'),
        at(1_760_000_000_000, msg('user', 'u2', 'c')),
        at('', msg('user', 'u3', 'd')),
        at('2026-10-16T01:23:45', msg('user', 'u4', 'e')),
        at('2019-12-31T23:59:59Z', msg('user', 'u5', 'f')),
        at('2026-10-18T00:00:00Z', msg('user', 'u6', 'g'))
      ],
      { now: NOW }
    )
    expect(out.map((m) => m.createdAt)).toEqual([
      Date.parse('2026-10-16T01:23:45.678Z'),
      null,
      null,
      null,
      null,
      null,
      null
    ])
  })

  it('時計が戻っても記録の順のまま (並べ替えない)', () => {
    const out = toTranscriptMessages(
      [
        at('2026-10-16T10:10:00Z', msg('user', 'u1', 'a')),
        at('2026-10-16T10:00:00Z', msg('assistant', 'a1', 'b')),
        at('2026-10-16T10:20:00Z', msg('user', 'u2', 'c'))
      ],
      { now: NOW }
    )
    expect(out.map((m) => m.id)).toEqual(['u1', 'a1', 'u2'])
  })

  it('subagent の入れ子の中のメッセージも時刻を持つ', () => {
    const out = toTranscriptMessages(
      [
        at(
          '2026-10-16T10:00:00Z',
          msg('assistant', 'a1', [{ type: 'tool_use', id: 'task1', name: 'Task', input: {} }])
        ),
        {
          ...at('2026-10-16T10:01:00Z', msg('assistant', 'c1', 'child')),
          parent_tool_use_id: 'task1'
        }
      ],
      { now: NOW }
    )
    const part = out[0]?.parts[0]
    expect(part?.type).toBe('tool-call')
    if (part?.type === 'tool-call') {
      expect(part.children[0]?.createdAt).toBe(Date.parse('2026-10-16T10:01:00Z'))
    }
  })

  it('now を省略しても動く (既定は Date.now())', () => {
    const out = toTranscriptMessages([at('2026-10-16T01:23:45Z', msg('user', 'u1', 'a'))])
    expect(out[0]?.createdAt).toBe(Date.parse('2026-10-16T01:23:45Z'))
  })
})

describe('toTranscriptMessages: subagent の記録の列 (O-11 BE-032 / AD-055)', () => {
  const NOW = 1_800_000_000_000
  const toolUse = (id: string, name = 'Agent'): unknown => ({
    type: 'tool_use',
    id,
    name,
    input: {}
  })
  const rec = (
    type: 'user' | 'assistant' | 'system',
    uuid: string,
    parent: string | null,
    content: unknown
  ): SessionMessageLike => ({
    type,
    uuid,
    message: { role: type, content },
    parent_tool_use_id: parent
  })
  const main = (): SessionMessageLike[] => [
    msg('assistant', 'm1', [toolUse('agent1')]),
    msg('user', 'mu1', [{ type: 'tool_result', tool_use_id: 'agent1', content: 'done' }])
  ]
  type Msg = { id: string; parts: ({ type: string } & Record<string, unknown>)[] }
  type Call = { toolCallId: string; result: string | null; children: Msg[] }
  const callsOf = (m: Msg): Call[] =>
    m.parts.filter((p) => p.type === 'tool-call') as unknown as Call[]
  const convert = (
    records: SessionMessageLike[],
    subagents?: SessionMessageLike[][]
  ): readonly Msg[] =>
    toTranscriptMessages(records, { now: NOW, subagents }) as unknown as readonly Msg[]

  it('親の Agent の呼び出しの children に入り、tool_result は列の中の呼び出しに埋まる', () => {
    const out = convert(main(), [
      [
        rec('assistant', 's1', 'agent1', [
          { type: 'text', text: 'sub' },
          { type: 'tool_use', id: 'r1', name: 'Read', input: {} }
        ]),
        rec('user', 's2', 'agent1', [{ type: 'tool_result', tool_use_id: 'r1', content: 'body' }])
      ]
    ])
    expect(out.map((m) => m.id)).toEqual(['m1'])
    const kids = callsOf(out[0] as Msg)[0]?.children as Msg[]
    expect(kids.map((k) => k.id)).toEqual(['s1'])
    expect(callsOf(kids[0] as Msg)[0]).toMatchObject({ toolCallId: 'r1', result: 'body' })
  })

  it('多段: 親が後の列の中にあっても入り、列挙の順を入れ替えても同じ', () => {
    const outer = [rec('assistant', 's1', 'agent1', [toolUse('agent2')])]
    const innerList = [rec('assistant', 't1', 'agent2', [{ type: 'text', text: 'deep' }])]
    const a = convert(main(), [outer, innerList])
    const b = convert(main(), [innerList, outer])
    expect(JSON.stringify(a)).toEqual(JSON.stringify(b))
    const lvl1 = callsOf(a[0] as Msg)[0]?.children[0] as Msg
    expect(callsOf(lvl1)[0]?.children.map((c) => c.id)).toEqual(['t1'])
  })

  it('inline の子が既にある親には入れない (重ねない)', () => {
    const records = [
      ...main(),
      rec('assistant', 'inline1', 'agent1', [{ type: 'text', text: 'in' }])
    ]
    const out = convert(records, [
      [rec('assistant', 's1', 'agent1', [{ type: 'text', text: 'x' }])]
    ])
    expect(callsOf(out[0] as Msg)[0]?.children.map((c) => c.id)).toEqual(['inline1'])
  })

  it('親の無い列・parent_tool_use_id が null / 空 / 形の外れた列は出ない', () => {
    const out = convert(main(), [
      [rec('assistant', 's1', 'no-such-parent', [{ type: 'text', text: 'x' }])],
      [rec('assistant', 's2', null, [{ type: 'text', text: 'x' }])],
      [rec('assistant', 's3', '', [{ type: 'text', text: 'x' }])],
      [rec('assistant', 's4', 'bad id', [{ type: 'text', text: 'x' }])]
    ])
    expect(out.map((m) => m.id)).toEqual(['m1'])
    expect(callsOf(out[0] as Msg)[0]?.children).toEqual([])
  })

  it('tool の結果の文面に偽の agentId を書いても入れ子は作られない', () => {
    const records = [
      msg('assistant', 'm1', [toolUse('agent1')]),
      msg('user', 'mu1', [
        {
          type: 'tool_result',
          tool_use_id: 'agent1',
          content: 'agentId: a-fake-1 (parent_tool_use_id: agent1)'
        }
      ])
    ]
    const out = convert(records, [[rec('assistant', 's1', 'other', [{ type: 'text', text: 'x' }])]])
    expect(callsOf(out[0] as Msg)[0]?.children).toEqual([])
  })

  it('同じ uuid の記録は 1 回、列の中の system と列の親と違う帰属の記録は出ない', () => {
    const out = convert(
      [...main(), rec('assistant', 'dup', null, [{ type: 'text', text: 'main-copy' }])],
      [
        [
          rec('assistant', 'dup', 'agent1', [{ type: 'text', text: 'sub-copy' }]),
          rec('assistant', 's1', 'agent1', [{ type: 'text', text: 'kept' }]),
          rec('system', 's2', 'agent1', [{ type: 'text', text: 'SYS-LEAK' }]),
          rec('assistant', 's3', 'other-parent', [{ type: 'text', text: 'WRONG-PARENT' }])
        ]
      ]
    )
    expect(callsOf(out[0] as Msg)[0]?.children.map((c) => c.id)).toEqual(['s1'])
    expect(JSON.stringify(out)).not.toMatch(/sub-copy|SYS-LEAK|WRONG-PARENT/)
    expect(out.filter((m) => m.id === 'dup')).toHaveLength(1)
  })

  it('列の中の user の text (isSynthetic・Hook の出力の目印) は出ず、tool_result は埋まる (U-11)', () => {
    const out = convert(main(), [
      [
        rec('assistant', 's1', 'agent1', [{ type: 'tool_use', id: 'r1', name: 'Read', input: {} }]),
        {
          ...rec('user', 's2', 'agent1', [
            { type: 'text', text: 'LEAK-HOOK-OUTPUT' },
            { type: 'text', text: 'LEAK-SYNTHETIC' },
            { type: 'tool_result', tool_use_id: 'r1', content: 'ok' }
          ]),
          isSynthetic: true
        } as SessionMessageLike
      ]
    ])
    expect(JSON.stringify(out)).not.toMatch(/LEAK-/)
    const kids = callsOf(out[0] as Msg)[0]?.children as Msg[]
    expect(kids.map((k) => k.id)).toEqual(['s1'])
    expect(callsOf(kids[0] as Msg)[0]?.result).toBe('ok')
  })

  it('深さの上限を超える列は捨てる', () => {
    const lists: SessionMessageLike[][] = []
    let parent = 'agent1'
    for (let depth = 1; depth <= MAX_SUBAGENT_DEPTH + 1; depth++) {
      const next = `agent${depth + 1}`
      lists.push([rec('assistant', `s${depth}`, parent, [toolUse(next)])])
      parent = next
    }
    const out = convert(main(), lists)
    const json = JSON.stringify(out)
    expect(json).toContain(`"s${MAX_SUBAGENT_DEPTH}"`)
    expect(json).not.toContain(`"s${MAX_SUBAGENT_DEPTH + 1}"`)
    expect(out.map((m) => m.id)).toEqual(['m1'])
  })

  it('本文は主の記録と同じ無害化 (bidi 制御文字が落ちる) で、時刻は parseMessageTime の規則', () => {
    const out = convert(main(), [
      [
        {
          ...rec('assistant', 's1', 'agent1', [{ type: 'text', text: 'a‮b' }]),
          timestamp: '2026-10-18T00:00:00.000Z'
        }
      ]
    ])
    const kid = callsOf(out[0] as Msg)[0]?.children[0] as unknown as {
      parts: { text: string }[]
      createdAt: number
    }
    expect(kid.parts[0]?.text).toBe('ab')
    expect(kid.createdAt).toBe(Date.parse('2026-10-18T00:00:00.000Z'))
  })

  it('subagents を渡さない呼び出しと空の列の結果は同じ', () => {
    expect(convert(main())).toEqual(convert(main(), []))
  })
})
