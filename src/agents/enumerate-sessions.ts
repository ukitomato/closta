import { listSessions } from '@anthropic-ai/claude-agent-sdk'

import { createRequestHandler, type EnumerateDeps } from './enumerate'
import { encodeResponse } from './protocol'
import { createTransport, type Transport } from './transport'

/**
 * セッション列挙プロセスの**入口** (BE-023 / AD-030 / contracts C-1 〜 C-4)。
 *
 * **Agent SDK を呼ぶ唯一の場所である** (Principle IV / AD-023 §2)。
 * 呼んでよいのは **`listSessions()` だけ**であり、判定は
 * 「許可 1 件以外を禁じる」形で機械検証する (C-4 / 検証項目 14)。
 *
 * | 規則 | 根拠 |
 * |---|---|
 * | `electron` とネイティブモジュールに依存しない (推移的にも) | Principle VII / AD-010 / FR-045 |
 * | **Node 標準モジュールを import しない** | `eslint.config.mjs` policy 3。stdio はグローバルの `process` |
 * | **本体は経路を知らない。** 選択は `transport.ts` に閉じ、単独起動は標準入出力で保つ | Principle VII Statement 後半 / AD-030 §5 / SH-094 |
 * | **パス値に一切触らない。** 受け取った値をそのまま SDK に渡す | AD-028 §3 規則 2 / 3 |
 * | **transcript の本文を読まない** | FR-044 / SC-011 |
 * | ディスクに書かない | FR-036 / SC-014 |
 *
 * **常駐し、要求を直列に処理する** ([AD-030](../../docs/decisions/0030-enumeration-runs-in-one-resident-process.md))。
 * 1 要求ごとにプロセスを起こしていた頃は、**費用のほぼ全部が起動だった**
 * (実測: 起動 2,704 ms に対して列挙 36〜83 ms)。
 *
 * **論理は `enumerate.ts` に分けてある** (code-gate iteration 1 / test track)。
 * このファイルは (a) SDK の実 import、(b) 環境変数の綴り、(c) 末尾の `main()` を持つため
 * **Vitest から読むと副作用が走る**。固定したい不変条件をテストできる形にするために、
 * 論理だけを別モジュールへ出して注入で繋いでいる。
 * 以前はこの 196 行が丸ごと無検証で、SDK を呼ぶ唯一の場所でもあった。
 */

/**
 * SDK が config ディレクトリを読む唯一の経路 (research R-01)。
 *
 * **この文字列リテラルが現れてよいのは本モジュールだけである。**
 * renderer から config ディレクトリを指定できる API を作らないことと合わせて、
 * 「どのディレクトリを列挙するか」を決められる場所を絞る
 * (contracts/ipc-session-list.md の「境界に出さない値」の表)。
 */
const CLAUDE_CONFIG_DIR = 'CLAUDE_CONFIG_DIR'

const deps: EnumerateDeps = {
  listSessions: (options) => listSessions(options),
  setConfigDir: (dir) => {
    process.env[CLAUDE_CONFIG_DIR] = dir
  }
}

/**
 * 入口。**要求を読み続ける。**
 *
 * **経路が閉じたら終わる。** 標準入出力の経路では親の消失をこれで知る
 * (`parentPort` の経路では Electron が孤児を回収する)。
 */
function main(): void {
  const transport: Transport = createTransport()
  const handler = createRequestHandler(deps, (response) => {
    transport.write(encodeResponse(response))
  })

  transport.onLine((line) => handler.handle(line))
  transport.onClosed(() => {
    // 処理中の要求を書き終えてから終わる。
    void handler.drain().then(() => {
      process.exitCode = 0
    })
  })
}

main()
