import { describe, expect, it } from 'vitest'

import {
  COMMAND_ARGUMENT_HINT_MAX_CODE_POINTS,
  COMMAND_DESCRIPTION_MAX_CODE_POINTS,
  decodeCommands,
  decodeInitReport,
  decodePluginDetail,
  encodePluginDetail,
  INIT_REPORT_MAX_BYTES,
  isMcpName,
  isReportName,
  MAX_COMMANDS,
  MAX_INIT_MCP_SERVERS,
  MCP_STATUS_KEYS,
  normalizeSlashCommandName,
  stableSerialize,
  toCommands,
  toInitReport,
  toMcpStatusKey,
  toOneLineText,
  toPluginVersion,
  type CommandsChangedInput,
  type SessionInitReportInput
} from './session-init-report'

/** O-5 BE-001 — 構成 (`init-report` / `commands`) の形の検査・変換・decoder (015 data-model §2)。どれも例外を出さない (SC-002)。 */

const MARK = 'SECRET_MARK'

/** 制御文字・不可視文字 (ソースに直に書かない)。 */
const ch = (code: number): string => String.fromCodePoint(code)
const NUL = ch(0x00)
const BEL = ch(0x07)
const ESC = ch(0x1b)
const SHY = ch(0x00ad)
const ZWSP = ch(0x200b)
const LS = ch(0x2028)
const PS = ch(0x2029)
const RLO = ch(0x202e)
const TAG_A = ch(0xe0041)

/** SDK の `init` に近い形 (通さないフィールドに目印の値を入れる)。 */
function initMessage(over: Record<string, unknown> = {}): SessionInitReportInput {
  return {
    type: 'system',
    subtype: 'init',
    model: 'claude-sonnet-4-5',
    mcp_servers: [
      { name: 'github', status: 'connected', error: MARK },
      { name: 'slack', status: 'needs-auth' }
    ],
    tools: ['Bash', 'Read', 'mcp__github__create_issue'],
    skills: ['pdf'],
    plugins: [{ name: 'my-plugin', path: `/home/u/${MARK}`, version: '1.2.3' }],
    slash_commands: ['/review', 'compact'],
    cwd: `/home/u/${MARK}`,
    apiKeySource: MARK,
    betas: [MARK],
    capabilities: [MARK],
    claude_code_version: MARK,
    agents: [MARK],
    output_style: MARK,
    terminal_slash_commands: [MARK],
    permissionMode: 'default',
    ...over
  } as unknown as SessionInitReportInput
}

function commandsMessage(commands: readonly unknown[]): CommandsChangedInput {
  return {
    type: 'system',
    subtype: 'commands_changed',
    commands
  } as unknown as CommandsChangedInput
}

const BAD_NAMES = [
  '',
  'a b',
  `a${NUL}b`,
  `a${ESC}b`,
  `a${TAG_A}b`,
  `a${LS}b`,
  'a//b',
  'a'.repeat(129),
  `a${RLO}b`,
  `a${ZWSP}b`
]

describe('形の検査', () => {
  it('MCP の名前は ^[A-Za-z0-9_-]{1,128}$', () => {
    expect(isMcpName('github')).toBe(true)
    expect(isMcpName('a_b-c')).toBe(true)
    expect(isMcpName('a'.repeat(128))).toBe(true)
    for (const raw of [...BAD_NAMES, 'a.b', 'a:b', 'a/b', 'a@b', 42, null]) {
      expect(isMcpName(raw)).toBe(false)
    }
  })

  it('その他の名前は ^[A-Za-z0-9_.:@/-]{1,128}$ で // を含まない', () => {
    for (const raw of ['Bash', 'plugin:cmd', 'a@b', '/review', 'x.y', 'a'.repeat(128)]) {
      expect(isReportName(raw)).toBe(true)
    }
    for (const raw of [...BAD_NAMES, '//a', 42, undefined]) expect(isReportName(raw)).toBe(false)
  })

  it('version の形 (外れたら null)', () => {
    expect(toPluginVersion('1.2.3')).toBe('1.2.3')
    expect(toPluginVersion('1.0.0-beta+1')).toBe('1.0.0-beta+1')
    for (const raw of ['', '1 2', '1.0/2', 'v'.repeat(33), `1.0${RLO}`, 1, null, undefined]) {
      expect(toPluginVersion(raw)).toBeNull()
    }
  })

  it('status は 5 値、prototype のキーと知らない値は unknown', () => {
    for (const key of MCP_STATUS_KEYS) expect(toMcpStatusKey(key)).toBe(key)
    const bad = ['__proto__', 'constructor', 'toString', 'hasOwnProperty', 'exploded', '', 1, null]
    for (const raw of bad) expect(toMcpStatusKey(raw)).toBe('unknown')
  })

  it('説明は Cc / Cf / Zl / Zp を除いて 1 行にし、200 / 64 コードポイントで切り詰める', () => {
    expect(toOneLineText(`a\nb\r\nc\td${LS}e${PS}f`, 200)).toBe('a b c d e f')
    expect(toOneLineText(`x${ZWSP}y${RLO}z${TAG_A}w${SHY}v${BEL}u`, 200)).toBe('xyzwvu')
    expect(toOneLineText('  spaced  ', 200)).toBe('spaced')
    const description = toOneLineText('あ'.repeat(300), COMMAND_DESCRIPTION_MAX_CODE_POINTS)
    expect(Array.from(description)).toHaveLength(COMMAND_DESCRIPTION_MAX_CODE_POINTS)
    const hint = toOneLineText('😀'.repeat(100), COMMAND_ARGUMENT_HINT_MAX_CODE_POINTS)
    expect(Array.from(hint)).toHaveLength(COMMAND_ARGUMENT_HINT_MAX_CODE_POINTS)
    for (const raw of [1, null, undefined, {}]) expect(toOneLineText(raw, 200)).toBe('')
  })

  it('スラッシュコマンドの名前は先頭の / を 1 つ外す', () => {
    expect(normalizeSlashCommandName('/a')).toBe('a')
    expect(normalizeSlashCommandName('a')).toBe('a')
    expect(normalizeSlashCommandName('plugin:a')).toBe('plugin:a')
  })
})

describe('toInitReport (system / init)', () => {
  it('許可リストのフィールドだけを読み、通さないフィールドの目印が出力に 0 件', () => {
    const out = toInitReport(initMessage())
    expect(out).toEqual({
      type: 'init-report',
      model: 'claude-sonnet-4-5',
      mcpServers: [
        { name: 'github', status: 'connected' },
        { name: 'slack', status: 'needs-auth' }
      ],
      tools: ['Bash', 'Read', 'mcp__github__create_issue'],
      skills: ['pdf'],
      plugins: [{ name: 'my-plugin', version: '1.2.3' }],
      slashCommands: ['review', 'compact'],
      omitted: 0
    })
    expect(JSON.stringify(out)).not.toContain(MARK)
    expect(stableSerialize(out)).not.toContain(MARK)
  })

  it('名前の allowlist の外は落として omitted に数える', () => {
    const out = toInitReport(
      initMessage({
        mcp_servers: BAD_NAMES.map((name) => ({ name, status: 'connected' })),
        tools: [...BAD_NAMES, 'mcp__a.b__c'],
        skills: BAD_NAMES,
        plugins: BAD_NAMES.map((name) => ({ name, version: '1' })),
        slash_commands: [...BAD_NAMES, '//a', '/']
      })
    )
    expect(out.mcpServers).toEqual([])
    expect(out.tools).toEqual([])
    expect(out.skills).toEqual([])
    expect(out.plugins).toEqual([])
    expect(out.slashCommands).toEqual([])
    expect(out.omitted).toBe(BAD_NAMES.length * 5 + 1 + 2)
  })

  it('init の slash_commands の /a と b は a と b になり、//a は落ちる', () => {
    const out = toInitReport(initMessage({ slash_commands: ['/a', 'b', '//a'] }))
    expect(out.slashCommands).toEqual(['a', 'b'])
    expect(out.omitted).toBe(1)
  })

  it(`MCP サーバー ${MAX_INIT_MCP_SERVERS + 1} 件で ${MAX_INIT_MCP_SERVERS} 件と omitted 1`, () => {
    const servers = Array.from({ length: MAX_INIT_MCP_SERVERS + 1 }, (_, i) => ({
      name: `s${i}`,
      status: 'connected'
    }))
    const out = toInitReport(initMessage({ mcp_servers: servers }))
    expect(out.mcpServers).toHaveLength(MAX_INIT_MCP_SERVERS)
    expect(out.mcpServers.at(-1)?.name).toBe(`s${MAX_INIT_MCP_SERVERS - 1}`)
    expect(out.omitted).toBe(1)
  })

  it('バイト数の上限を超えたら後ろの要素から落とし、omitted に数える', () => {
    const long = (p: string, i: number): string => `${p}${i}`.padEnd(128, 'x')
    const out = toInitReport(
      initMessage({
        mcp_servers: Array.from({ length: 64 }, (_, i) => ({
          name: long('s', i),
          status: 'connected'
        })),
        tools: Array.from({ length: 256 }, (_, i) => long('t', i)),
        skills: Array.from({ length: 128 }, (_, i) => long('k', i)),
        plugins: Array.from({ length: 64 }, (_, i) => ({ name: long('p', i), version: '1' })),
        slash_commands: Array.from({ length: 256 }, (_, i) => long('c', i))
      })
    )
    expect(new TextEncoder().encode(JSON.stringify(out)).length).toBeLessThanOrEqual(
      INIT_REPORT_MAX_BYTES
    )
    expect(out.omitted).toBeGreaterThan(0)
    // 前の要素は残り、後ろ (スラッシュコマンド → プラグイン) から落ちる。
    expect(out.mcpServers).toHaveLength(64)
    expect(out.tools).toHaveLength(256)
    expect(out.skills).toHaveLength(128)
    expect(out.slashCommands).toEqual([])
    expect(out.plugins.length).toBeGreaterThan(0)
    expect(out.plugins.length).toBeLessThan(64)
    expect(out.plugins[0]?.name).toBe(long('p', 0))
    const kept =
      out.mcpServers.length +
      out.tools.length +
      out.skills.length +
      out.plugins.length +
      out.slashCommands.length
    expect(kept + out.omitted).toBe(64 + 256 + 128 + 64 + 256)
  })

  it('status の __proto__ / constructor / toString / 知らない値は unknown', () => {
    const out = toInitReport(
      initMessage({
        mcp_servers: ['__proto__', 'constructor', 'toString', 'exploded'].map((status, i) => ({
          name: `s${i}`,
          status
        }))
      })
    )
    expect(out.mcpServers.every((s) => s.status === 'unknown')).toBe(true)
    expect(out.mcpServers).toHaveLength(4)
  })

  it('model が形に通らないと null。version の外れは null', () => {
    for (const model of ['https://u:p@h/m', 'u:p@h/m', 'sk-ant-api03-abc', 'a//b', '', 42]) {
      expect(toInitReport(initMessage({ model })).model).toBeNull()
    }
    const plugins = [{ name: 'p', version: '1 0' }, { name: 'q' }]
    const out = toInitReport(initMessage({ plugins }))
    expect(out.plugins).toEqual([
      { name: 'p', version: null },
      { name: 'q', version: null }
    ])
  })

  it('型の崩れた入力でも例外を出さない (配列でない値は空)', () => {
    const broken = [
      null,
      undefined,
      'init',
      { mcp_servers: 'x', tools: 1, skills: {}, plugins: null, slash_commands: [1, null, {}] },
      { mcp_servers: [null, 1, 'a', { name: 1 }], plugins: [null, 'p'] }
    ]
    for (const raw of broken) {
      expect(() => toInitReport(raw as unknown as SessionInitReportInput)).not.toThrow()
    }
    const out = toInitReport(broken[3] as unknown as SessionInitReportInput)
    expect(out.slashCommands).toEqual([])
    expect(out.omitted).toBe(3)
  })
})

describe('toCommands (system / commands_changed)', () => {
  it('name・description・argumentHint だけを読み、aliases を運ばない', () => {
    const out = toCommands(
      commandsMessage([
        { name: 'review', description: 'Review the PR', argumentHint: '<pr>', aliases: [MARK] },
        { name: '/cost', description: '', argumentHint: '', aliases: [MARK], extra: MARK }
      ])
    )
    expect(out).toEqual({
      type: 'commands',
      commands: [
        { name: 'review', description: 'Review the PR', argumentHint: '<pr>' },
        { name: 'cost', description: '', argumentHint: '' }
      ],
      omitted: 0
    })
    expect(JSON.stringify(out)).not.toContain(MARK)
  })

  it('commands_changed の name: a と /a はどちらも a、//a は落ちる', () => {
    const out = toCommands(
      commandsMessage([
        { name: 'a', description: '', argumentHint: '' },
        { name: '/a', description: '', argumentHint: '' },
        { name: '//a', description: '', argumentHint: '' }
      ])
    )
    expect(out.commands.map((c) => c.name)).toEqual(['a', 'a'])
    expect(out.omitted).toBe(1)
  })

  it('説明の制御文字・不可視文字を除き、長さで切り詰める', () => {
    const out = toCommands(
      commandsMessage([
        {
          name: 'x',
          description: `line1\nline2${LS}${RLO}evil${ZWSP}${'d'.repeat(300)}`,
          argumentHint: `<a>${NUL}${'h'.repeat(100)}`
        }
      ])
    )
    const cmd = out.commands[0]!
    expect(cmd.description.startsWith('line1 line2 evil')).toBe(true)
    expect(Array.from(cmd.description)).toHaveLength(COMMAND_DESCRIPTION_MAX_CODE_POINTS)
    for (const c of ['\n', LS, RLO, ZWSP]) expect(cmd.description).not.toContain(c)
    expect(Array.from(cmd.argumentHint)).toHaveLength(COMMAND_ARGUMENT_HINT_MAX_CODE_POINTS)
    expect(cmd.argumentHint.startsWith('<a>h')).toBe(true)
  })

  it(`コマンド ${MAX_COMMANDS + 1} 件で ${MAX_COMMANDS} 件と omitted 1`, () => {
    const commands = Array.from({ length: MAX_COMMANDS + 1 }, (_, i) => ({
      name: `c${i}`,
      description: '',
      argumentHint: ''
    }))
    const out = toCommands(commandsMessage(commands))
    expect(out.commands).toHaveLength(MAX_COMMANDS)
    expect(out.omitted).toBe(1)
  })

  it('バイト数の上限を超えたら後ろの要素から落とす', () => {
    const commands = Array.from({ length: 256 }, (_, i) => ({
      name: `c${i}`,
      description: 'あ'.repeat(200),
      argumentHint: 'い'.repeat(64)
    }))
    const out = toCommands(commandsMessage(commands))
    expect(new TextEncoder().encode(JSON.stringify(out)).length).toBeLessThanOrEqual(
      INIT_REPORT_MAX_BYTES
    )
    expect(out.commands[0]?.name).toBe('c0')
    expect(out.commands.length + out.omitted).toBe(256)
    expect(out.omitted).toBeGreaterThan(0)
  })

  it('型の崩れた入力でも例外を出さない', () => {
    const broken = [
      null,
      { commands: 'x' },
      { commands: [null, 1, { name: 1 }, { name: '__proto__' }] }
    ]
    for (const raw of broken) {
      expect(() => toCommands(raw as unknown as CommandsChangedInput)).not.toThrow()
    }
    const out = toCommands(
      commandsMessage([{ name: '__proto__' }, { name: 'constructor', description: 1 }])
    )
    expect(out.commands).toEqual([
      { name: '__proto__', description: '', argumentHint: '' },
      { name: 'constructor', description: '', argumentHint: '' }
    ])
  })
})

describe('stableSerialize (送るかの判定)', () => {
  it('キーの順に依らず、同じ値で同じ文字列', () => {
    const a = {
      type: 'commands',
      commands: [{ name: 'a', description: 'd', argumentHint: '' }],
      omitted: 0
    }
    const b = {
      omitted: 0,
      commands: [{ argumentHint: '', description: 'd', name: 'a' }],
      type: 'commands'
    }
    expect(stableSerialize(a)).toBe(stableSerialize(b))
    expect(stableSerialize(a)).not.toBe(stableSerialize({ ...a, omitted: 1 }))
    expect(stableSerialize(toInitReport(initMessage()))).toBe(
      stableSerialize(toInitReport(initMessage()))
    )
  })

  it('状態だけが違う init は違う文字列 (同じ長さの別のモデルも)', () => {
    const base = toInitReport(initMessage())
    const failed = toInitReport(
      initMessage({
        mcp_servers: [
          { name: 'github', status: 'failed' },
          { name: 'slack', status: 'needs-auth' }
        ]
      })
    )
    expect(stableSerialize(base)).not.toBe(stableSerialize(failed))
    const other = toInitReport(initMessage({ model: 'claude-sonnet-4-6' }))
    expect(stableSerialize(base)).not.toBe(stableSerialize(other))
  })
})

describe('decodeInitReport / decodeCommands', () => {
  const report = toInitReport(initMessage())

  it('変換の出力をそのまま通し、余分なキーを運ばない', () => {
    expect(decodeInitReport(report)).toEqual(report)
    const extra = {
      ...report,
      cwd: MARK,
      mcpServers: [{ name: 'a', status: 'failed', error: MARK }]
    }
    expect(decodeInitReport(extra)).toEqual({
      ...report,
      mcpServers: [{ name: 'a', status: 'failed' }]
    })
    const commands = toCommands(
      commandsMessage([{ name: 'a', description: 'd', argumentHint: '<x>' }])
    )
    expect(decodeCommands(commands)).toEqual(commands)
    const withAliases = {
      ...commands,
      aliases: [MARK],
      commands: [{ name: 'a', aliases: [MARK] }]
    }
    expect(JSON.stringify(decodeCommands(withAliases))).not.toContain(MARK)
  })

  it('同じ形の検査を掛け直す (名前の外れ・status・説明・model)', () => {
    const out = decodeInitReport({
      ...report,
      model: 'u:p@h/m',
      mcpServers: [
        { name: 'a b', status: 'connected' },
        { name: 'ok', status: '__proto__' }
      ],
      slashCommands: ['/a', '//b'],
      omitted: 2
    })
    expect(out?.model).toBeNull()
    expect(out?.mcpServers).toEqual([{ name: 'ok', status: 'unknown' }])
    expect(out?.slashCommands).toEqual(['a'])
    expect(out?.omitted).toBe(4)
    const cmd = decodeCommands({
      type: 'commands',
      commands: [{ name: 'x', description: `a${RLO}b\nc`, argumentHint: 1 }],
      omitted: 0
    })
    expect(cmd?.commands).toEqual([{ name: 'x', description: 'ab c', argumentHint: '' }])
  })

  it('知らない形・型の違いは null。例外を出さない', () => {
    const badInit = [
      null,
      undefined,
      'init-report',
      [],
      { ...report, type: 'commands' },
      { ...report, model: 42 },
      { ...report, mcpServers: 'x' },
      { ...report, tools: {} },
      { ...report, skills: null },
      { ...report, plugins: 1 },
      { ...report, slashCommands: undefined },
      { ...report, omitted: '1' }
    ]
    for (const raw of badInit) {
      expect(() => decodeInitReport(raw)).not.toThrow()
      expect(decodeInitReport(raw)).toBeNull()
    }
    const badCommands = [
      null,
      { type: 'init-report', commands: [], omitted: 0 },
      { type: 'commands', commands: 'x', omitted: 0 },
      { type: 'commands', commands: [] },
      { type: 'commands', commands: [], omitted: null }
    ]
    for (const raw of badCommands) {
      expect(() => decodeCommands(raw)).not.toThrow()
      expect(decodeCommands(raw)).toBeNull()
    }
    const proto: unknown = JSON.parse(
      '{"type":"init-report","__proto__":{"model":"x"},"model":null,' +
        '"mcpServers":[{"__proto__":{"name":"x"}}],"tools":[],"skills":[],"plugins":[],' +
        '"slashCommands":[],"omitted":0}'
    )
    expect(() => decodeInitReport(proto)).not.toThrow()
    expect(decodeInitReport(proto)?.mcpServers).toEqual([])
  })

  it(`decoder も件数の上限で落とす (${MAX_COMMANDS + 1} 件で ${MAX_COMMANDS} 件と omitted 1)`, () => {
    const commands = Array.from({ length: MAX_COMMANDS + 1 }, (_, i) => ({
      name: `c${i}`,
      description: '',
      argumentHint: ''
    }))
    const out = decodeCommands({ type: 'commands', commands, omitted: 0 })
    expect(out?.commands).toHaveLength(MAX_COMMANDS)
    expect(out?.omitted).toBe(1)
  })
})

/** O-5 BE-031 — プラグインの行の `detail` の符号化と復号 (015 data-model §4)。 */
describe('encodePluginDetail / decodePluginDetail', () => {
  it('往復する (名前に / を含んでもよい)', () => {
    const detail = encodePluginDetail({ installed: 2, failed: 1, marketplace: 'acme/tools' })
    expect(detail).toBe('2/1/acme/tools')
    expect(decodePluginDetail(detail)).toEqual({
      installed: 2,
      failed: 1,
      marketplace: 'acme/tools'
    })
  })

  it('形に合わない名前は空にし、復号でも null。外れた数は 0', () => {
    for (const marketplace of [
      `a${ch(0x202e)}b`,
      'a b',
      'a//b',
      'x'.repeat(129),
      `a${ch(0x2028)}`,
      null
    ]) {
      expect(encodePluginDetail({ installed: -1, failed: 1.5, marketplace })).toBe('0/0/')
    }
    expect(decodePluginDetail('0/0/')).toEqual({ installed: 0, failed: 0, marketplace: null })
    expect(decodePluginDetail(`1/0/a b`)?.marketplace).toBeNull()
  })

  it('形の合わない detail は null で、例外を出さない', () => {
    for (const detail of ['', '1/2', 'a/b/c', '-1/0/x', '1/2\n/x'])
      expect(decodePluginDetail(detail)).toBeNull()
  })
})
