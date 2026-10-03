import { readFileSync } from 'node:fs'

import ts from 'typescript'
import { describe, expect, it } from 'vitest'

import {
  checkCoverage,
  formatCounts,
  formatFailure,
  LOWER_BOUNDS,
  parseAssignment,
  parseControlRequestSubtypes,
  parseCoverage,
  parsePackageVersion,
  parseRoadmapFeatures,
  parseSdkMessageUnion,
  parseToolInputs
} from '../../scripts/ui-coverage/coverage.mjs'

/**
 * ui-coverage 対応表の検査の単体 (O-2 / BE-011 / SC-002)。
 *
 * FR-003 の失敗の条件のそれぞれを、文字列の fixture で崩して落ちることを確かめる。
 * 基準の対応表はインストール済みの SDK から読んだ集合で組み、全行を `表示不要` の Tier B にしておく。
 * 各テストはそこから 1 か所だけ崩す。
 *
 * **parse から独立した正解**: `typescript` のコンパイラ API で同じ `.d.ts` を構文木として読み、
 * `coverage.mjs` (依存なしの regex) の parse と集合が一致することを確かめる (design-gate R2 platform-boundary M-101)。
 */

const SDK_DIR = 'node_modules/@anthropic-ai/claude-agent-sdk'
const sdkDts = readFileSync(`${SDK_DIR}/sdk.d.ts`, 'utf8')
const toolsDts = readFileSync(`${SDK_DIR}/sdk-tools.d.ts`, 'utf8')
const sdkVersion = parsePackageVersion(readFileSync(`${SDK_DIR}/package.json`, 'utf8'))

const messageTypes: string[] = parseSdkMessageUnion(sdkDts)
const toolInputs: string[] = parseToolInputs(toolsDts)
const controlSubtypes: string[] = parseControlRequestSubtypes(sdkDts)

/* ── 独立した正解 (TypeScript のコンパイラ API) ──────────────────── */

function typeAliases(file: string, source: string): Map<string, ts.TypeAliasDeclaration> {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true)
  const out = new Map<string, ts.TypeAliasDeclaration>()
  const visit = (node: ts.Node): void => {
    if (ts.isTypeAliasDeclaration(node)) out.set(node.name.text, node)
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return out
}

function unionReferenceNames(node: ts.TypeNode): string[] {
  if (!ts.isUnionTypeNode(node)) throw new Error(`union ではない: ${ts.SyntaxKind[node.kind]}`)
  return node.types.map((member) => {
    if (!ts.isTypeReferenceNode(member)) throw new Error('型参照でないメンバー')
    return member.typeName.getText()
  })
}

function property(node: ts.TypeNode, name: string): ts.PropertySignature | undefined {
  if (!ts.isTypeLiteralNode(node)) return undefined
  return node.members.find(
    (m): m is ts.PropertySignature =>
      ts.isPropertySignature(m) && ts.isIdentifier(m.name) && m.name.text === name
  )
}

const sdkAliases = typeAliases('sdk.d.ts', sdkDts)
const toolAliases = typeAliases('sdk-tools.d.ts', toolsDts)

function groundTruthMessages(): string[] {
  const alias = sdkAliases.get('SDKMessage')
  if (alias === undefined) throw new Error('SDKMessage が無い')
  return unionReferenceNames(alias.type)
}

function groundTruthToolInputs(): string[] {
  const alias = toolAliases.get('ToolInputSchemas')
  if (alias === undefined) throw new Error('ToolInputSchemas が無い')
  // ToolOutputSchemas は出力の union (入力型ではない)。coverage.mjs と同じく除く。
  return unionReferenceNames(alias.type).filter((name) => name !== 'ToolOutputSchemas')
}

function groundTruthControlSubtypes(): string[] {
  const envelope = sdkAliases.get('SDKControlRequest')
  const request = envelope === undefined ? undefined : property(envelope.type, 'request')
  if (request?.type === undefined || !ts.isTypeReferenceNode(request.type)) {
    throw new Error('SDKControlRequest.request が型参照でない')
  }
  const inner = sdkAliases.get(request.type.typeName.getText())
  if (inner === undefined) throw new Error('request の型が無い')
  const subtypes: string[] = []
  for (const member of unionReferenceNames(inner.type)) {
    const alias = sdkAliases.get(member)
    const subtype = alias === undefined ? undefined : property(alias.type, 'subtype')
    const literals =
      subtype?.type === undefined
        ? []
        : ts.isUnionTypeNode(subtype.type)
          ? [...subtype.type.types]
          : [subtype.type]
    if (literals.length === 0) throw new Error(`${member} に subtype が無い`)
    for (const literal of literals) {
      if (!ts.isLiteralTypeNode(literal) || !ts.isStringLiteral(literal.literal)) {
        throw new Error(`${member} の subtype が文字列リテラルでない`)
      }
      subtypes.push(literal.literal.text)
    }
  }
  return subtypes
}

describe('parse から独立した正解 (TypeScript のコンパイラ API)', () => {
  it('SDKMessage の union のメンバーが一致する', () => {
    expect([...messageTypes].sort()).toEqual(groundTruthMessages().sort())
    expect(messageTypes.length).toBeGreaterThanOrEqual(LOWER_BOUNDS.A)
  })

  it('ToolInputSchemas のメンバーが一致する', () => {
    expect([...toolInputs].sort()).toEqual(groundTruthToolInputs().sort())
    expect(toolInputs.length).toBeGreaterThanOrEqual(LOWER_BOUNDS.C)
  })

  it('control_request の subtype が一致する', () => {
    expect([...controlSubtypes].sort()).toEqual(groundTruthControlSubtypes().sort())
    expect(controlSubtypes.length).toBeGreaterThanOrEqual(LOWER_BOUNDS.E)
    expect(new Set(controlSubtypes).size).toBe(controlSubtypes.length)
  })
})

describe('.d.ts の parse', () => {
  it('コメントの中の subtype と関数型の => に惑わされない', () => {
    const dts = [
      'export declare type SDKControlRequest = { type: "control_request"; request: Inner; };',
      'declare type Inner = A | B;',
      "/** 例: subtype: 'fake' */",
      "declare type A = { /* subtype: 'fake2' */ subtype: 'a'; cb: (x: number) => void; nested: { subtype: 'nested' }; };",
      "declare type B = { subtype: 'b1' | 'b2'; };"
    ].join('\n')
    expect(parseControlRequestSubtypes(dts)).toEqual(['a', 'b1', 'b2'])
  })

  it('型名でないメンバーや subtype の無いメンバーは例外にする (黙って取りこぼさない)', () => {
    expect(() =>
      parseSdkMessageUnion('export declare type SDKMessage = A | { type: "x" };')
    ).toThrow()
    expect(() =>
      parseControlRequestSubtypes(
        'export declare type SDKControlRequest = { request: Inner; };\ndeclare type Inner = A;\ndeclare type A = { kind: "a"; };'
      )
    ).toThrow()
    expect(() => parseSdkMessageUnion('export declare type Other = A;')).toThrow()
  })

  it('ToolInputSchemas から ToolOutputSchemas を除く', () => {
    expect(
      parseToolInputs(
        'export type ToolInputSchemas =\n  | AInput\n  | BInput\n  | ToolOutputSchemas;'
      )
    ).toEqual(['AInput', 'BInput'])
  })
})

/* ── 対応表の fixture ─────────────────────────────────────────────── */

type Row = { id: string; tier?: string; assignment?: string; path?: string }

function line(row: Row): string {
  const tier = row.tier ?? 'B'
  const assignment = row.assignment ?? '表示不要: 内部制御'
  const path = row.path ?? 'なし'
  return `| \`${row.id}\` | — | ${tier} | ${assignment} | ${path} |  |`
}

const HEADER = '| 識別子 | 判別子 | Tier | 割当 | 経路 | 備考 |\n|---|---|---|---|---|---|'

function section(heading: string, rows: Row[]): string {
  return `${heading}\n\n${HEADER}\n${rows.map(line).join('\n')}\n`
}

type TableSpec = {
  version?: string | null
  A?: Row[]
  Aprime?: Row[]
  B?: Row[]
  C?: Row[]
  D?: Row[]
  E?: Row[]
  F?: string
  omit?: string[]
}

function buildTable(spec: TableSpec = {}): string {
  const version = spec.version === undefined ? sdkVersion : spec.version
  const parts = ['# ui-coverage 対応表', '']
  if (version !== null) parts.push(`SDK: \`@anthropic-ai/claude-agent-sdk\` ${version}`, '')
  // 凡例の表は節の外なので読まない (A〜F 以外の `## ` 見出しが節を閉じる)。
  parts.push('## 凡例', '', '| 割当 | 意味 |', '|---|---|', '| 未割当 | 例 |', '')
  const omit = new Set(spec.omit ?? [])
  if (!omit.has('A')) {
    parts.push(section('## A メッセージ型', spec.A ?? messageTypes.map((id) => ({ id }))))
    parts.push(
      section(
        "### A' union の外",
        spec.Aprime ?? [{ id: 'SDKActiveGoalMessage' }, { id: 'keep_alive' }]
      )
    )
  }
  if (!omit.has('B')) {
    parts.push(
      section(
        '## B 中身のブロック',
        spec.B ?? [
          { id: 'assistant/text', assignment: '実装済み: Markdown text (両方)', path: '両方' }
        ]
      )
    )
  }
  if (!omit.has('C')) parts.push(section('## C tool', spec.C ?? toolInputs.map((id) => ({ id }))))
  if (!omit.has('D')) {
    parts.push(
      section(
        '## D アプリが作る経路',
        spec.D ?? [
          {
            id: 'permission-request',
            tier: 'A',
            assignment: '実装済み: Approval card (実行中)',
            path: '実行中'
          }
        ]
      )
    )
  }
  if (!omit.has('E')) {
    parts.push(section('## E 制御要求', spec.E ?? controlSubtypes.map((id) => ({ id }))))
  }
  if (!omit.has('F')) {
    parts.push(
      spec.F ??
        '## F element の分類\n\n| element | Tier | 使い道 | 備考 |\n|---|---|---|---|\n| Thread | A | 会話 |  |\n| Voice orb | C | 対象外 |  |\n'
    )
  }
  return parts.join('\n')
}

const ROADMAP = `# Roadmap

## 着手前に片付けること（Pre-flight）

| # | 作業 | 状態 | 理由 |
|---|---|---|---|
| P-4 | reviewer | **O-2 へ延期** | — |

## M1: 読める

| 順 | ID | feature | domain | 依存 | 前提 SPIKE |
|---|---|---|---|---|---|
| 1 | R-1 | フォルダ登録 | \`runtime\` | — | SPIKE-8 / SPIKE-9 **完了** |
| — | — | *(SPIKE は R-1 までに実施)* | — | — | — |

## M2: 走らせられる

| 順 | ID | feature | domain | 依存 | 前提 SPIKE |
|---|---|---|---|---|---|
| 9 | X-5 | supervisor | \`session\` | X-4 | 実機確認 **完了** / design-gate R3 PASS / **完了** (PR #9) |

| ID | feature | domain | 依存 | 内容 |
|---|---|---|---|---|
| X-6 | 起動設定の拡張軸 | \`session\` | X-5 | fork / resume |

## M3: 差配できる

| 順 | ID | feature | domain | 依存 | 前提 SPIKE |
|---|---|---|---|---|---|
| 10 | O-1 | セッション監視ビュー | \`session\` | X-5 | — / pr-gate R2 PASS / **完了** (PR #10) |
| 11 | O-2 | 対応表 | \`ui\` | O-1 | SPIKE-12 **完了** |
| 13 | O-4 | 計量と制限 | \`ui\` | O-2 | — |
| 15 | O-6 | 会話の境界 | \`ui\` | O-2 | — |

## M4: 任せられる

| 順 | ID | feature | domain | 依存 | 前提 SPIKE |
|---|---|---|---|---|---|
| 16 | I-1 | DockerRuntime | \`isolation\` | X-5 | SPIKE-10 **完了** |
| 18 | I-3 | sandbox capability | \`isolation\` | I-2 | — |

## Optional scope

| ID | feature | domain | 着手の目安 |
|---|---|---|---|
| OPT-pty | PTY フォールバックタブ | \`ui\` | 必要になったら |

## SPIKE 一覧

| ID | 内容 | いつ | 所要 |
|---|---|---|---|
| SPIKE-12 | 何か | O-2 の前 | **完了** |
`

const roadmap = parseRoadmapFeatures(ROADMAP)

type Failure = { section: string; id: string; reason: string }
type Counts = {
  rows: Record<string, number>
  byKindTier: Record<string, Record<string, number>>
  followUps: { id: string; milestone: string | null; count: number; tierA: number }[]
  m3Remaining: number
}

function run(
  spec: TableSpec = {},
  overrides: Record<string, unknown> = {}
): { failures: Failure[]; counts: Counts | null } {
  return checkCoverage({
    sdkVersion,
    messageTypes,
    toolInputs,
    controlSubtypes,
    table: parseCoverage(buildTable(spec)),
    roadmap,
    ...overrides
  })
}

/** A 節の先頭の行だけを差し替えた行の一覧。 */
function withFirstA(row: Partial<Row>): Row[] {
  return messageTypes.map((id, i) => (i === 0 ? { id, ...row } : { id }))
}

function reasonsFor(result: { failures: Failure[] }, section: string, id: string): string[] {
  return result.failures.filter((f) => f.section === section && f.id === id).map((f) => f.reason)
}

describe('checkCoverage — 基準の対応表', () => {
  it('SDK と一致し全行に割当がある対応表は通る', () => {
    const result = run()
    expect(result.failures).toEqual([])
    expect(result.counts?.rows).toEqual({
      A: messageTypes.length,
      "A'": 2,
      B: 1,
      C: toolInputs.length,
      D: 1,
      E: controlSubtypes.length,
      F: 2
    })
  })

  it("A' 節の行は A の余分な行にならない (SDKMessage の外)", () => {
    const result = run()
    expect(result.failures.some((f) => f.id === 'SDKActiveGoalMessage')).toBe(false)
    // A' の行を A に置けば余分な行として落ちる。
    const moved = run({
      A: [...messageTypes.map((id) => ({ id })), { id: 'SDKActiveGoalMessage' }]
    })
    expect(reasonsFor(moved, 'A', 'SDKActiveGoalMessage')).toHaveLength(1)
  })

  it('凡例の表 (節の外) の「未割当」は読まない', () => {
    expect(run().failures.some((f) => f.reason.includes('未割当'))).toBe(false)
  })
})

describe('checkCoverage — 行の欠けと余分 (A / C / E)', () => {
  it('SDK に型が増えた (対応表に行が無い) と、その名前を示して落ちる', () => {
    const result = run({}, { messageTypes: [...messageTypes, 'SDKNewMessage'] })
    expect(reasonsFor(result, 'A', 'SDKNewMessage')[0]).toContain('行が無い')
  })

  it('SDK から型が消えた (対応表にだけ行がある) と落ちる', () => {
    const [gone, ...rest] = messageTypes
    const result = run({}, { messageTypes: rest })
    expect(reasonsFor(result, 'A', gone)[0]).toContain('型定義に無い')
  })

  it('C 節 (tool) と E 節 (制御要求) も同じく照合する', () => {
    const c = run({}, { toolInputs: [...toolInputs, 'NewToolInput'] })
    expect(reasonsFor(c, 'C', 'NewToolInput')).toHaveLength(1)
    const e = run({ E: controlSubtypes.slice(1).map((id) => ({ id })) })
    expect(reasonsFor(e, 'E', controlSubtypes[0])[0]).toContain('行が無い')
  })

  it('同じ識別子の行が 2 つあると落ちる', () => {
    const result = run({ C: [...toolInputs, toolInputs[0]].map((id) => ({ id })) })
    expect(reasonsFor(result, 'C', toolInputs[0])[0]).toContain('2 つ以上')
  })

  it('節が無いと落ちる', () => {
    const result = run({ omit: ['D'] })
    expect(reasonsFor(result, 'D', '(節)')).toHaveLength(1)
  })
})

describe('checkCoverage — 割当', () => {
  it.each(['', '未割当', 'TBD', '—', '後続', '実装済み:', '表示不要:', '後続: O-4 と O-6'])(
    '割当が "%s" の行は落ちる',
    (assignment) => {
      const result = run({ A: withFirstA({ assignment }) })
      expect(reasonsFor(result, 'A', messageTypes[0])[0]).toContain('3 種類')
    }
  )

  it('3 種類の綴りを読む', () => {
    expect(parseAssignment('実装済み: Terminal block / ToolFallback (両方)')).toEqual({
      kind: '実装済み',
      elements: ['Terminal block', 'ToolFallback'],
      fallbackOnly: false
    })
    expect(parseAssignment('後続: `O-6`')).toEqual({ kind: '後続', id: 'O-6' })
    expect(parseAssignment('表示不要: Tier C (Voice)')).toEqual({
      kind: '表示不要',
      reason: 'Tier C (Voice)'
    })
  })

  it('roadmap に無い ID は落ちる', () => {
    const result = run({ A: withFirstA({ assignment: '後続: O-99' }) })
    expect(reasonsFor(result, 'A', messageTypes[0])[0]).toContain('roadmap の feature の表に無い')
  })

  it.each(['P-4', 'SPIKE-12'])('feature の表に無い ID (%s) は落ちる', (id) => {
    const result = run({ A: withFirstA({ assignment: `後続: ${id}` }) })
    expect(reasonsFor(result, 'A', messageTypes[0])[0]).toContain('roadmap の feature の表に無い')
  })

  it.each(['O-1', 'X-5'])('完了済みの feature の ID (%s) は落ちる', (id) => {
    const result = run({ A: withFirstA({ assignment: `後続: ${id}` }) })
    expect(reasonsFor(result, 'A', messageTypes[0])[0]).toContain('完了済み')
  })

  it('Tier A の行を ToolFallback だけで実装済みにすると落ちる。Tier B / C は通る', () => {
    const a = run({
      C: [
        { id: toolInputs[0], tier: 'A', assignment: '実装済み: ToolFallback (両方)', path: '両方' },
        ...toolInputs.slice(1).map((id) => ({ id }))
      ]
    })
    expect(reasonsFor(a, 'C', toolInputs[0])[0]).toContain('ToolFallback')

    const b = run({
      C: [
        {
          id: toolInputs[0],
          tier: 'B',
          assignment: '実装済み: `ToolFallback` (両方)',
          path: '両方'
        },
        ...toolInputs.slice(1).map((id) => ({ id }))
      ]
    })
    expect(b.failures).toEqual([])

    const dedicated = run({
      C: [
        { id: toolInputs[0], tier: 'A', assignment: '実装済み: Subagent (両方)', path: '両方' },
        ...toolInputs.slice(1).map((id) => ({ id }))
      ]
    })
    expect(dedicated.failures).toEqual([])
  })

  it('Tier C の行は "表示不要: Tier C (<理由>)" でなければ落ちる', () => {
    const wrong = run({ A: withFirstA({ tier: 'C', assignment: '表示不要: 内部制御' }) })
    expect(reasonsFor(wrong, 'A', messageTypes[0])[0]).toContain('Tier C')
    const wrong2 = run({ A: withFirstA({ tier: 'C', assignment: '後続: O-4' }) })
    expect(reasonsFor(wrong2, 'A', messageTypes[0])[0]).toContain('Tier C')
    const right = run({ A: withFirstA({ tier: 'C', assignment: '表示不要: Tier C (Voice)' }) })
    expect(right.failures).toEqual([])
  })

  it('Tier が A / B / C でない行は落ちる (F 節も)', () => {
    const result = run({ A: withFirstA({ tier: 'D' }) })
    expect(reasonsFor(result, 'A', messageTypes[0])[0]).toContain('Tier')
    const f = run({
      F: '## F element\n\n| element | Tier | 使い道 | 備考 |\n|---|---|---|---|\n| Thread | X | 会話 |  |\n'
    })
    expect(reasonsFor(f, 'F', 'Thread')).toHaveLength(1)
  })

  it('経路が 4 値のどれでもない行は落ちる', () => {
    const result = run({ A: withFirstA({ path: 'ライブ' }) })
    expect(reasonsFor(result, 'A', messageTypes[0])[0]).toContain('経路')
  })

  it("A' / B / D 節の行も割当の書式を検査する", () => {
    const result = run({
      Aprime: [{ id: 'SDKActiveGoalMessage', assignment: '未割当' }],
      B: [{ id: 'assistant/text', assignment: 'TBD' }]
    })
    expect(reasonsFor(result, "A'", 'SDKActiveGoalMessage')).toHaveLength(1)
    expect(reasonsFor(result, 'B', 'assistant/text')).toHaveLength(1)
  })

  it('列が凡例と違う表は落ちる', () => {
    const table = buildTable().replace(
      '## B 中身のブロック\n\n| 識別子 | 判別子 | Tier | 割当 | 経路 | 備考 |',
      '## B 中身のブロック\n\n| 識別子 | Tier | 割当 | 経路 | 備考 | 判別子 |'
    )
    const result = checkCoverage({
      sdkVersion,
      messageTypes,
      toolInputs,
      controlSubtypes,
      table: parseCoverage(table),
      roadmap
    })
    expect(
      result.failures.some((f) => f.section === 'B' && f.reason.includes('列が凡例と違う'))
    ).toBe(true)
  })
})

describe('checkCoverage — 版・入力・下限', () => {
  it('対応表の SDK の版が違うと落ちる', () => {
    const result = run({ version: '0.3.269' })
    expect(reasonsFor(result, '冒頭', 'SDK')[0]).toContain('0.3.269')
  })

  it('版の行が無いと落ちる', () => {
    expect(reasonsFor(run({ version: null }), '冒頭', 'SDK')).toHaveLength(1)
  })

  it.each(['sdkVersion', 'messageTypes', 'toolInputs', 'controlSubtypes', 'table', 'roadmap'])(
    '入力 %s が無いと落ちる',
    (key) => {
      const result = run({}, { [key]: null })
      expect(result.failures).toEqual([{ section: '入力', id: key, reason: '検査の入力が無い' }])
      expect(result.counts).toBeNull()
    }
  )

  it('SDK から読めた名前が下限を下回ると落ちる (対応表が同じだけ欠けていても)', () => {
    const fewMessages = messageTypes.slice(0, 5)
    const fewTools = toolInputs.slice(0, 5)
    const fewControls = controlSubtypes.slice(0, 5)
    const result = run(
      {
        A: fewMessages.map((id) => ({ id })),
        C: fewTools.map((id) => ({ id })),
        E: fewControls.map((id) => ({ id }))
      },
      { messageTypes: fewMessages, toolInputs: fewTools, controlSubtypes: fewControls }
    )
    expect(result.failures.map((f) => `${f.section} ${f.id}`).sort()).toEqual([
      'A (SDK)',
      'C (SDK)',
      'E (SDK)'
    ])
  })
})

describe('parseRoadmapFeatures', () => {
  it('feature の表 (`| 順 | ID | feature |` と `| ID | feature |`) の ID だけを読み、milestone を付ける', () => {
    expect([...roadmap.keys()].sort()).toEqual(
      ['I-1', 'I-3', 'O-1', 'O-2', 'O-4', 'O-6', 'OPT-pty', 'R-1', 'X-5', 'X-6'].sort()
    )
    expect(roadmap.get('O-4')).toEqual({ milestone: 'M3', completed: false })
    expect(roadmap.get('I-3')).toEqual({ milestone: 'M4', completed: false })
    expect(roadmap.get('X-6')).toEqual({ milestone: 'M2', completed: false })
    expect(roadmap.get('OPT-pty')).toEqual({ milestone: 'OPT', completed: false })
    expect(roadmap.has('P-4')).toBe(false)
    expect(roadmap.has('SPIKE-12')).toBe(false)
  })

  it('最後の列の断片が **完了** で始まる行だけを完了とみなす (前提 SPIKE の完了は数えない)', () => {
    expect(roadmap.get('O-1')?.completed).toBe(true)
    expect(roadmap.get('X-5')?.completed).toBe(true)
    expect(roadmap.get('R-1')?.completed).toBe(false)
    expect(roadmap.get('O-2')?.completed).toBe(false)
    expect(roadmap.get('I-1')?.completed).toBe(false)
  })

  it('実際の docs/roadmap.md を読める', () => {
    const real = parseRoadmapFeatures(readFileSync('docs/roadmap.md', 'utf8'))
    expect(real.get('O-1')).toEqual({ milestone: 'M3', completed: true })
    expect(real.get('I-3')?.milestone).toBe('M4')
    expect(real.has('P-4')).toBe(false)
    expect(real.has('SPIKE-12')).toBe(false)
  })
})

describe('件数の集計', () => {
  it('割当の種類 × Tier、後続 ID ごとの件数と milestone、M3 の完了の条件の残り', () => {
    const A = messageTypes.map((id, i): Row => {
      if (i === 0) return { id, tier: 'A', assignment: '後続: O-4' }
      if (i === 1) return { id, tier: 'A', assignment: '後続: O-4' }
      if (i === 2) return { id, tier: 'B', assignment: '後続: O-6' }
      if (i === 3) return { id, tier: 'A', assignment: '後続: I-3' }
      if (i === 4) return { id, tier: 'A', assignment: '実装済み: Thread (両方)', path: '両方' }
      if (i === 5) return { id, tier: 'C', assignment: '表示不要: Tier C (内部)' }
      return { id }
    })
    const result = run({ A })
    expect(result.failures).toEqual([])
    const counts = result.counts
    expect(counts?.followUps).toEqual([
      { id: 'I-3', milestone: 'M4', count: 1, tierA: 1 },
      { id: 'O-4', milestone: 'M3', count: 2, tierA: 2 },
      { id: 'O-6', milestone: 'M3', count: 1, tierA: 0 }
    ])
    // Tier A の後続のうち割当先が M3 の行。I-3 (M4) と Tier B の O-6 は数えない。
    expect(counts?.m3Remaining).toBe(2)
    expect(counts?.byKindTier['後続']).toEqual({ A: 3, B: 1, C: 0 })
    expect(counts?.byKindTier['実装済み']).toEqual({ A: 2, B: 1, C: 0 })
    const notNeededB = messageTypes.length - 6 + 2 + toolInputs.length + controlSubtypes.length
    expect(counts?.byKindTier['表示不要']).toEqual({ A: 0, B: notNeededB, C: 1 })

    const note = formatCounts(counts)
    expect(note).toContain('O-4(M3) 2 [Tier A 2]')
    expect(note).toContain('M3 の完了の条件の残り (Tier A の後続で割当先が M3): 2')
  })

  it('失敗は `<節> <識別子>: <理由>` の 1 行', () => {
    expect(formatFailure({ section: 'A', id: 'SDKX', reason: '理由' })).toBe('A SDKX: 理由')
  })
})
