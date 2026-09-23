import { readdir } from 'node:fs/promises'

import { describe, expect, it } from 'vitest'

import { WSL_FREE_DIRECTORIES } from '../../scripts/constitution/allowlists.mjs'

/**
 * 検証項目 15 の**検査対象が縮まないこと**の検証 (contracts C-7 / SC-003)。
 *
 * **「違反が 0 件」と「検査が 0 件」は別である** (plan.md の SH-091 と同じ形)。
 * 項目 15 は初版で `src/agents/` / `src/main/infra/session/` / `src/domain/session/` の
 * 3 ディレクトリだけを見ていた。ところが contracts C-7 の
 * 「R-2 は `wsl.exe` を新たに呼ばない」を実際に守る責任があるのは
 * **`src/main/app/session-service.ts`** である (R-1 の `verifyRunning` を注入で受ける側)。
 * **その 1 ファイルが検査の外にあった** (code-gate iteration 1 / convention H-001)。
 *
 * **実名列挙にしたので fixture を置けない。** 項目 15 は
 * `src.file.startsWith(dir)` で対象を決めるため、実名エントリに対して
 * `__rulecheck__` の違反サンプルを差し込む余地がない。
 * 発火することは実ファイルへ文字列を注入して 1 度確認した
 * (`code-gate.md` の MF/convention H-001 の項)。
 * **継続的に守るのはこのテストである** — 対象の集合そのものを固定する。
 *
 * **ディレクトリごと足さない理由**: `composition-root.ts` は R-1 の検出器を結線するため
 * `wsl.exe` 系の語を正当に持つ。`src/main/app/` を丸ごと対象にすると正当な結線が落ちる。
 * 実名列挙なので**新しいファイルは自動では対象にならない** — その判断漏れを
 * このテストが「app レイヤの R-2 由来ファイルが全部入っているか」で捕まえる。
 */

/** R-2 が `src/main/app/` に足したファイル。**ここに足したら項目 15 の対象にも足す。** */
const R2_APP_FILES_EXEMPT = new Set([
  /*
   * **R-1 の結線であり対象外である。** 検出器の生成と注入を行うため
   * `wsl.exe` 系の語を正当に持つ (実測で 2 箇所)。
   */
  'composition-root.ts'
])

describe('検証項目 15 の検査対象', () => {
  it('`session-service.ts` を対象に含む (contracts C-7 を守る責任がある側)', () => {
    expect(WSL_FREE_DIRECTORIES).toContain('src/main/app/session-service.ts')
  })

  it('R-2 が追加したレイヤの 3 ディレクトリを対象に含む', () => {
    expect(WSL_FREE_DIRECTORIES).toContain('src/agents/')
    expect(WSL_FREE_DIRECTORIES).toContain('src/main/infra/session/')
    expect(WSL_FREE_DIRECTORIES).toContain('src/domain/session/')
  })

  it('`src/main/app/session*.ts` と列挙器の層が漏れなく対象に入っている', async () => {
    const entries = await readdir('src/main/app', { withFileTypes: true })

    /*
     * **R-2 が足した app レイヤのファイルを機械的に集める。**
     * 名前で拾うのは、このレイヤに R-1 のファイルが同居しているためである
     * (`runtime-store.ts` / `folder-service.ts` などは R-1 の住人で、
     * R-1 の経路は `wsl.exe` を正当に使う)。
     */
    const r2Files = entries
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .filter((name) => !name.endsWith('.test.ts'))
      .filter((name) => name.startsWith('session') || name.startsWith('enumerator'))
      .filter((name) => !R2_APP_FILES_EXEMPT.has(name))

    /* 前提が壊れていないこと (名前で拾える形を保っていること)。 */
    expect(r2Files.length).toBeGreaterThan(0)

    const missing = r2Files.filter((name) => !WSL_FREE_DIRECTORIES.includes(`src/main/app/${name}`))

    expect(missing).toEqual([])
  })

  it('`composition-root.ts` は対象に入れない (R-1 の正当な結線が落ちる)', () => {
    expect(WSL_FREE_DIRECTORIES).not.toContain('src/main/app/composition-root.ts')
    expect(WSL_FREE_DIRECTORIES).not.toContain('src/main/app/')
  })
})
