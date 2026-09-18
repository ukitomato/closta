import { utilityProcess } from 'electron'

import enumerateSessionsModulePath from '@agents/enumerate-sessions?modulePath'
import { createLineAssembler } from '@agents/protocol'

import type { EnumerationWorker, EnumerationWorkerLauncher } from './session-enumerator'

/**
 * 常駐する列挙プロセスを実際に起こす層 (BE-025 / AD-030)。
 *
 * **このファイルが子プロセス生成 API を持つ唯一の場所である**
 * (`PROCESS_SPAWN_MODULES` の実名リスト。AD-028 §4)。
 *
 * **`session-enumerator.ts` から分けてある。** 理由は 1 つで、
 * 待ち行列 / timeout / 作り直し / ゲートという**方針**を
 * **Electron を立てずに検証できる形**にするためである (BE-025c / AD-028 §4 の訂正)。
 * `electron` を import したモジュールは Vitest の node 環境で読み込めず、
 * スタブを置けば「モックゼロで書ける」(AD-023 §1 / `vitest.config.ts`) が崩れる。
 *
 * **所在の判別に文字列リテラルを書かない** (AD-028 §4)。
 * 本ファイルは所在を見ない — 行を送り、行を受けるだけである。
 */

/** バンドル後の列挙プロセスのファイルパス。子プロセスの生成に渡す。 */
export const ENUMERATE_SESSIONS_MODULE_PATH: string = enumerateSessionsModulePath

/**
 * 要求は `postMessage`、応答は標準出力で受ける (AD-030 §5)。
 *
 * **`utilityProcess` は標準入力を支えていない。**
 * `ForkOptions.stdio` の説明に「`stdin` を `ignore` 以外に設定するのは非対応であり
 * エラーになる」と明記されており、`UtilityProcess` に `stdin` のメンバも無い。
 * 常駐させて要求を送るには `postMessage` を使うほかない。
 *
 * **子の本体は経路を知らない。** 選択は `src/agents/transport.ts` に閉じてあり、
 * 標準入出力の経路が単独起動の形を保っている (Principle VII / AD-010 / SH-094)。
 *
 * **応答は標準出力で受ける。** `postMessage` の往復にしてもよいが、
 * 標準出力なら**単独起動のときと同じ経路**になり、親側の読み取りを 1 通りで済ませられる。
 */
export function createUtilityProcessLauncher(): EnumerationWorkerLauncher {
  return {
    launch(env): EnumerationWorker {
      const child = utilityProcess.fork(ENUMERATE_SESSIONS_MODULE_PATH, [], {
        env,
        stdio: 'pipe'
      })

      /*
       * **読み手のいないパイプを作らない。** 子は応答を書き終えられず、
       * 親は timeout まで待つ (実測でこの形にはまった)。
       * **内容は出力しない** — SDK の例外メッセージは UNC の完全パスを含みうるため、
       * 理由キーに落としてからでなければ出せない (contracts C-5)。
       */
      child.stderr?.on('data', () => {})

      return {
        onLine(listener) {
          const stdout = child.stdout
          if (stdout === null) {
            /*
             * **黙って無視しない。** 省略可の連結で流すと購読が no-op になり、
             * 「応答が来ない」という形で timeout まで待つことになる。
             * ここに来たら `stdio` の指定が効いていないという意味である。
             */
            throw new Error('列挙プロセスの標準出力を購読できない (stdio の指定が効いていない)')
          }
          const assemble = createLineAssembler(listener)
          stdout.on('data', (chunk: Buffer) => assemble(chunk.toString('utf8')))
        },

        onExit(listener) {
          child.on('exit', (code: number) => listener(code))
        },

        send(line) {
          /*
           * **送れたかどうかを返す。** `postMessage` は戻り値を持たないので、
           * 例外が出なかったことを「送れた」とする。
           * 送れなかったことを黙って捨てると、親は timeout まで気付けない。
           */
          try {
            child.postMessage(line)
            return true
          } catch {
            return false
          }
        },

        kill() {
          return child.kill()
        }
      }
    }
  }
}
