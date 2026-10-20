import { readdirSync, readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

/**
 * agents は Windows 固有の値を綴らない (X-8 / FR-014 / data-model §5)。
 * 停止のコマンドの名前・引数・実行ファイルの拡張子は domain の定数と述語 (`WIN32_TREE_STOP_*`・
 * `classifyClaudeExecutable`) から受け取り、`src/agents/` のファイルの本文に書かない。ソースの文字列を読む静的な検査。
 */
describe('src/agents/ の本文に Windows 固有の綴りが無い (FR-014)', () => {
  it('停止のコマンドの名前と実行ファイルの拡張子の綴りが 0 件', () => {
    const dir = new URL('../../src/agents/', import.meta.url)
    const sources = readdirSync(dir).filter(
      (name) => name.endsWith('.ts') && !name.endsWith('.test.ts')
    )
    expect(sources.length).toBeGreaterThan(0)
    for (const name of sources) {
      const text = readFileSync(new URL(name, dir), 'utf8')
      expect(text.toLowerCase().includes('taskkill'), name).toBe(false)
      expect(/['"]\.exe['"]/i.test(text), name).toBe(false)
    }
  })
})
