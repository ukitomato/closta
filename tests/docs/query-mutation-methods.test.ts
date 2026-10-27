import { readFile } from 'node:fs/promises'

import { describe, expect, it } from 'vitest'

import { QUERY_MUTATION_METHODS } from '../../scripts/constitution/allowlists.mjs'

/**
 * 検証項目 16 の P3 (`Query` の mutation メソッド) の**集合が縮まないこと**の検証
 * (O-5 / 015 research R-06 (1) / (5) / AD-036 §4 P3 / AD-048 Decision 2)。
 *
 * 違反の fixture は項目単位で照合する (`[VIOLATE] #16`) ので、列挙から名前を 1 つ消しても
 * fixture は緑のままになる。**集合そのものはこのテストが固定する。**
 *
 * **外すには ADR が要る** (AD-036 §4 P3 / AD-048 Decision 2)。
 * **足すのは AD-036 §4 P3 (呼んでよいのは `interrupt` だけ) の範囲内で ADR 不要** — そのときは
 * 下の集合と `src/agents/sdk-agent-session.ts` の `QueryMutationMethod` にも同じ PR で足す。
 */

const EXPECTED = [
  // X-1 (AD-036 §4 P3)。`setPermissionMode` / `setModel` は X-6 の 023 (AD-062 Decision 1) で外した
  'setMcpPermissionModeOverride',
  'applyFlagSettings',
  'updateSettings',
  'setMaxThinkingTokens',
  // O-5 (AD-048 Decision 2)
  'mcpServerStatus',
  'reconnectMcpServer',
  'toggleMcpServer',
  'setMcpServers',
  'reloadPlugins',
  'reloadSkills',
  'rewindFiles',
  'stopTask',
  'seedReadState',
  'streamInput',
  'reinitialize',
  // O-5 (AD-036 §4 P3 そのもの。ADR 不要)
  'reloadOutputStyles',
  'backgroundTasks',
  // O-5 (AD-047 Decision 4 が呼ばないと決めた読み取り。pr-gate R1 MD-10)
  'getContextUsage',
  'usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET',
  // 016 (AD-049 Decision 6 / FR-018)
  'readFile'
]

const SESSION_SOURCE = 'src/agents/sdk-agent-session.ts'

/** `type QueryMutationMethod =` の union のリテラルを抜き出す (1 行に 1 つ `| 'name'`)。 */
function unionLiterals(source: string): string[] {
  const lines = source.split(/\r?\n/)
  const start = lines.findIndex((line) => /^type QueryMutationMethod =\s*$/.test(line))
  if (start < 0) return []
  const literals: string[] = []
  for (const line of lines.slice(start + 1)) {
    const name = /^\s*\|\s*'([A-Za-z_]\w*)'\s*$/.exec(line)?.[1]
    if (name === undefined) break
    literals.push(name)
  }
  return literals
}

describe('検証項目 16 の P3 の集合', () => {
  it('`QUERY_MUTATION_METHODS` は 20 個で、並びを問わず固定した集合に一致する', () => {
    expect(QUERY_MUTATION_METHODS).toHaveLength(20)
    expect(new Set(QUERY_MUTATION_METHODS).size).toBe(20)
    expect([...QUERY_MUTATION_METHODS].sort()).toEqual([...EXPECTED].sort())
  })

  it('`interrupt` を含まない (P3 で呼んでよい唯一のメソッド)', () => {
    expect(QUERY_MUTATION_METHODS).not.toContain('interrupt')
  })

  it('`sdk-agent-session.ts` の `QueryMutationMethod` の union と集合が一致する', async () => {
    const source = await readFile(SESSION_SOURCE, 'utf8')
    const literals = unionLiterals(source)
    // 抜き出しが 0 件なら失敗にする (型の名前や書き方を変えたときに黙って緑にならない)。
    expect(literals.length).toBeGreaterThan(0)
    expect(new Set(literals).size).toBe(literals.length)
    expect([...literals].sort()).toEqual([...QUERY_MUTATION_METHODS].sort())
  })
})
