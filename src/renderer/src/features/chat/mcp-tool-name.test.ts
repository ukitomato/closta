import { describe, expect, it } from 'vitest'

import {
  MCP_BUILTIN_TOOL_NAMES,
  mcpToolHeading,
  parseMcpToolName,
  summarizeResourceUri
} from './mcp-tool-name'

describe('parseMcpToolName (data-model §1 の表。SC-001)', () => {
  it('一致がちょうど 1 つなら印なし: a__b だけがあると mcp__a__b__c → a__b › c', () => {
    expect(parseMcpToolName('mcp__a__b__c', ['a__b'])).toEqual({
      kind: 'mcp',
      server: 'a__b',
      tool: 'c',
      inferred: false
    })
  })

  it('一致がちょうど 1 つなら印なし: a だけなら mcp__a__b__c → a › b__c', () => {
    expect(parseMcpToolName('mcp__a__b__c', ['a'])).toEqual({
      kind: 'mcp',
      server: 'a',
      tool: 'b__c',
      inferred: false
    })
  })

  it('2 つ以上の前方一致は最長で分けて推定の印 (a と a__b の両方。CWE-451)', () => {
    expect(parseMcpToolName('mcp__a__b__c', ['a', 'a__b'])).toEqual({
      kind: 'mcp',
      server: 'a__b',
      tool: 'c',
      inferred: true
    })
    // 並びに依らない
    expect(parseMcpToolName('mcp__a__b__c', ['a__b', 'a'])).toMatchObject({
      server: 'a__b',
      inferred: true
    })
  })

  it('同じサーバー名の重複は 1 つに数える', () => {
    expect(parseMcpToolName('mcp__a__b', ['a', 'a'])).toMatchObject({
      server: 'a',
      tool: 'b',
      inferred: false
    })
  })

  it('構成が無いときは最初の __ で分けて推定の印 (過去ログ)', () => {
    expect(parseMcpToolName('mcp__a__b', [])).toEqual({
      kind: 'mcp',
      server: 'a',
      tool: 'b',
      inferred: true
    })
    expect(parseMcpToolName('mcp__a__b__c', [])).toEqual({
      kind: 'mcp',
      server: 'a',
      tool: 'b__c',
      inferred: true
    })
  })

  it('どれにも一致しないときも最初の __ で分けて推定の印', () => {
    expect(parseMcpToolName('mcp__x__y', ['a', 'b'])).toEqual({
      kind: 'mcp',
      server: 'x',
      tool: 'y',
      inferred: true
    })
  })

  it('サーバー名の後に tool 名が無い一致は一致に数えない', () => {
    expect(parseMcpToolName('mcp__a__', ['a'])).toEqual({
      kind: 'mcp',
      server: null,
      tool: 'mcp__a__',
      inferred: false
    })
  })

  it('mcp__ で始まるが分けられない名前は server null で全体を tool 名にする', () => {
    expect(parseMcpToolName('mcp__x', [])).toEqual({
      kind: 'mcp',
      server: null,
      tool: 'mcp__x',
      inferred: false
    })
    expect(parseMcpToolName('mcp__x', ['x'])).toMatchObject({ server: null, tool: 'mcp__x' })
  })

  it.each(['mcp_x', 'MCP__a__b', 'xmcp__a__b', 'constructor', '__proto__', 'toString', 'Bash', ''])(
    '非 MCP の名前 %s は null',
    (name) => {
      expect(parseMcpToolName(name, ['a'])).toBeNull()
    }
  )

  it('prototype のキーのサーバー名でも例外を出さず文字列で比べる', () => {
    expect(parseMcpToolName('mcp__constructor__x', ['constructor', '__proto__'])).toEqual({
      kind: 'mcp',
      server: 'constructor',
      tool: 'x',
      inferred: false
    })
    expect(parseMcpToolName('mcp____proto____x', ['__proto__'])).toMatchObject({
      server: '__proto__',
      tool: 'x'
    })
  })

  it('2 層目の無害化: 制御文字・双方向制御・ゼロ幅・tag 文字を落としてから解く', () => {
    expect(parseMcpToolName('mcp__a\u202E\u200B__b\u2066\u{E0041}\u0007', ['a'])).toEqual({
      kind: 'mcp',
      server: 'a',
      tool: 'b',
      inferred: false
    })
    // 不可視の文字で接頭辞を偽装しても MCP にはならない
    expect(parseMcpToolName('m\u200Bcp_\u200D_a__b', [])).toMatchObject({
      kind: 'mcp',
      server: 'a'
    })
    expect(parseMcpToolName('\u202Emcp_x', [])).toBeNull()
  })

  it.each(MCP_BUILTIN_TOOL_NAMES)(
    '組み込みの %s は入力の server を形の検査に通して読む',
    (name) => {
      expect(
        parseMcpToolName(name, [], JSON.stringify({ server: 'github', uri: 'x://y' }))
      ).toEqual({
        kind: 'mcp-builtin',
        server: 'github',
        tool: name,
        inferred: false
      })
    }
  )

  it('組み込みの tool の server が形に合わない・無い・入力が読めないと server null', () => {
    for (const argsText of [
      JSON.stringify({ server: 'a b' }),
      JSON.stringify({ server: 'x\u202E' }),
      JSON.stringify({ server: 'a'.repeat(129) }),
      JSON.stringify({ server: 42 }),
      JSON.stringify({}),
      '[1]',
      'not json',
      ''
    ]) {
      expect(parseMcpToolName('ReadMcpResourceTool', ['a'], argsText)).toMatchObject({
        kind: 'mcp-builtin',
        server: null
      })
    }
  })
})

describe('mcpToolHeading', () => {
  it('{server} › {tool}、server が null なら tool だけ', () => {
    expect(
      mcpToolHeading({ kind: 'mcp', server: 'github', tool: 'create_issue', inferred: false })
    ).toBe('github › create_issue')
    expect(mcpToolHeading({ kind: 'mcp', server: null, tool: 'mcp__x', inferred: false })).toBe(
      'mcp__x'
    )
  })

  it('64 コードポイントで切り詰める', () => {
    const heading = mcpToolHeading({
      kind: 'mcp',
      server: 's',
      tool: 't'.repeat(100),
      inferred: true
    })
    expect(Array.from(heading)).toHaveLength(65)
    expect(heading.endsWith('…')).toBe(true)
  })
})

describe('summarizeResourceUri (data-model §1「URI の要約」[Q3])', () => {
  it.each([
    ['https://u:p@h/x', 'https://h/x'],
    ['postgres://user:pw@db/t', 'postgres://db/t'],
    ['https://h/x?access_token=abc', 'https://h/x'],
    ['https://h/a/b/x#frag', 'https://h/…/x']
  ])('%s の userinfo / query / hash を出さない', (uri, expected) => {
    const out = summarizeResourceUri(uri)
    expect(out).toBe(expected)
    expect(out).not.toMatch(/u:p|user|pw|access_token|abc|frag/)
  })

  it('末尾が秘密の形なら末尾を出さない', () => {
    expect(
      summarizeResourceUri('https://hooks.slack.com/services/T000/B000/XXXXXXXXXXXXXXXXXXXXXXXX')
    ).toBe('https://hooks.slack.com')
    // 途中の要素の token は出さない (最後の要素だけ)
    const telegram = summarizeResourceUri('https://api.telegram.org/bot123:ABC/x')
    expect(telegram).not.toContain('123:ABC')
    expect(summarizeResourceUri('https://api.telegram.org/bot123:ABC')).toBe(
      'https://api.telegram.org'
    )
    expect(summarizeResourceUri('https://h/a%20b.md')).toBe('https://h')
    expect(summarizeResourceUri('https://h/abcdefghij0123456789')).toBe('https://h')
    expect(summarizeResourceUri('https://h/ghp_abc')).toBe('https://h')
  })

  it('host が秘密の形なら protocol だけ (host も末尾も出さない)', () => {
    expect(summarizeResourceUri('https://abcdefghij0123456789klm.ngrok.io/readme.md')).toBe(
      'https:'
    )
    expect(summarizeResourceUri('https://ghp_abc.example.com/readme.md')).toBe('https:')
  })

  it('host の正例と file URI', () => {
    expect(summarizeResourceUri('https://api.github.com/readme.md')).toBe(
      'https://api.github.com/readme.md'
    )
    expect(summarizeResourceUri('file:///a/b/readme.md')).toBe('file:///…/readme.md')
  })

  it('読めない URI・257 文字・文字列でない値は出さない', () => {
    expect(summarizeResourceUri('not a uri')).toBeNull()
    expect(summarizeResourceUri('')).toBeNull()
    expect(summarizeResourceUri(`https://h/${'a'.repeat(247)}`)).toBeNull()
    expect(summarizeResourceUri(`https://h/${'a'.repeat(246)}`)).not.toBeNull()
    expect(summarizeResourceUri(42)).toBeNull()
    expect(summarizeResourceUri(null)).toBeNull()
  })
})
