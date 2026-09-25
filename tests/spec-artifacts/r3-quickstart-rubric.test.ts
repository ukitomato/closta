import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * SH-067b — SC-010 rubric の機械確認 (R-3)。
 *
 * `quickstart-results.md` が **rubric 4 観点 (a〜d) の判定行を含む**ことを検査する。
 * SC-010 は「判定表が記録済みであること」を done の必須 artifact と定める (実機操作自体は人間 deferred)。
 * この検査が落ちる = 判定表の欠落 → done を fail させる (po M-001)。
 *
 * **判定表の形状を grep 可能な決定的形式に固定する**: 表の各行は `| rubric-<a-d> | 観点 | 判定 | 根拠 |`。
 * 判定は `OK` / `NG` / `未実施` のいずれか (実機実施後に OK/NG へ更新する)。
 */

const RESULTS_PATH = resolve(
  process.cwd(),
  'specs/003-ui-transcript-rendering/quickstart-results.md'
)

const RUBRIC_KEYS = ['rubric-a', 'rubric-b', 'rubric-c', 'rubric-d'] as const
const VERDICT = /^(OK|NG|未実施)/

/** `| rubric-a | 観点 | 判定 | 根拠 |` の行から key → 判定セルを引く。 */
function verdictOf(content: string, key: string): string | null {
  for (const line of content.split('\n')) {
    const cells = line.split('|').map((cell) => cell.trim())
    // 先頭が空 (行頭の `|`) の table 行で、2 番目のセルが key と一致する行を探す。
    if (cells.length >= 5 && cells[1] === key) return cells[3]
  }
  return null
}

describe('SC-010 rubric 判定表の記録 (SH-067b)', () => {
  const content = readFileSync(RESULTS_PATH, 'utf8')

  it.each(RUBRIC_KEYS)('%s の判定行が存在する', (key) => {
    const verdict = verdictOf(content, key)
    expect(verdict, `${key} の判定行が quickstart-results.md に無い`).not.toBeNull()
  })

  it.each(RUBRIC_KEYS)('%s の判定が OK/NG/未実施 のいずれかである', (key) => {
    const verdict = verdictOf(content, key) ?? ''
    expect(verdict, `${key} の判定が空または不正 (${verdict})`).toMatch(VERDICT)
  })
})
