import { readFile } from 'node:fs/promises'

import { describe, expect, it } from 'vitest'

/**
 * 親が**応答の 2 経路の両方を購読していること**の検証
 * (AD-030 §5 の訂正 / code-gate iteration 1 / test track)。
 *
 * **これは実機でしか出ない事故だった。** 子は要求を受け取った経路で返すため、
 * Electron 下では応答も `parentPort` に載る。親が標準出力だけを購読していたので
 * **要求は届いて応答だけが捨てられ**、全要求が上限時間に当たった
 * (先頭ページ 31,420 ms = 15,000 ms × 2 件)。
 *
 * **通常のテストでは固定できない。**
 * - `enumerator-spawner.ts` は `electron` と `@agents/...?modulePath`
 *   (electron-vite の仮想モジュール) を import するため **Vitest では読めない**
 * - `session-enumerator.test.ts` は `EnumerationWorkerLauncher` を差し替えて書くので、
 *   代役の `onLine` は 1 本しかなく **経路が 2 本あること自体がテストの外**にある
 *   (AD-030 が自認している)
 * - `node` 単独起動の確認 (SH-094) も標準入出力側しか通らないため緑になる
 *
 * **そこでソースのテキストを突き合わせる。**
 * `tests/docs/dependency-anchors.test.ts` が「lint も型も見られない不変条件を
 * node 環境で文書と突き合わせる」形を先例として持っている。同じ形にした。
 *
 * 脆い検証であることは承知している。だが**壊れたときに落ちる**という性質は持つ。
 * 落ちたら、経路の購読が本当に残っているかを人が確かめること。
 */

const SPAWNER = 'src/main/app/enumerator-spawner.ts'
const TRANSPORT = 'src/agents/transport.ts'

async function source(path: string): Promise<string> {
  return readFile(path, 'utf8')
}

describe('親が応答の 2 経路を購読する', () => {
  it(`${SPAWNER} が parentPort 側 (child.on('message')) を購読する`, async () => {
    const text = await source(SPAWNER)

    /* Electron 下で子が選ぶのはこちらである。**見落とすと応答が 1 件も届かない。** */
    expect(text).toContain("child.on('message'")
  })

  it(`${SPAWNER} が標準出力側も購読する (単独起動と同じ経路を保つ)`, async () => {
    const text = await source(SPAWNER)

    expect(text).toContain('child.stdout')
    expect(text).toContain("stdout.on('data'")
    expect(text).toContain('createLineAssembler')
  })

  it(`${SPAWNER} は標準出力が無いことを黙って無視しない`, async () => {
    const text = await source(SPAWNER)

    /*
     * 省略可の連結 (`?.`) で流すと購読が no-op になり、
     * 「応答が来ない」という形で上限時間まで待つことになる。
     */
    expect(text).toMatch(/stdout === null[\s\S]{0,400}throw new Error/)
  })

  it(`${SPAWNER} が要求を postMessage で送る (utilityProcess は標準入力を支えない)`, async () => {
    const text = await source(SPAWNER)

    expect(text).toContain('child.postMessage(line)')
  })

  it(`${TRANSPORT} が経路の選択を 1 箇所に閉じている`, async () => {
    const text = await source(TRANSPORT)

    /*
     * 本体に `parentPort` を書くと**単独起動できる形が崩れたことに気付けない** —
     * `parentPort` は import を伴わないため ESLint にも依存グラフにも現れない。
     */
    expect(text).toContain('parentPort?: ParentPortLike')

    /*
     * **言及ではなく参照を見る。** `parentPort` に触る唯一の書き方は
     * `process` からの取り出しである。本体のコメントが語として触れるのは構わない。
     */
    const enumerate = await source('src/agents/enumerate-sessions.ts')
    expect(enumerate).not.toContain('process.parentPort')
    expect(enumerate).not.toMatch(/parentPort\?:/)
  })

  it(`${TRANSPORT} が electron を import しない (agents の禁止事項)`, async () => {
    const text = await source(TRANSPORT)

    expect(text).not.toContain("from 'electron'")
    expect(text).not.toContain('require("electron")')
  })
})
