import { utilityProcess } from 'electron'

import enumerateSessionsModulePath from '@agents/enumerate-sessions?modulePath'

import { createLineAssembler, type EnumerationLauncher } from './session-enumerator'

/**
 * 列挙プロセスを実際に起こす層 (BE-025)。
 *
 * **このファイルが子プロセス生成 API を持つ唯一の場所である**
 * (`PROCESS_SPAWN_MODULES` の実名リスト。AD-028 §4)。
 *
 * **`session-enumerator.ts` から分けてある。** 理由は 1 つで、
 * timeout / 同時数上限 / 束ね / クールダウン / ゲートという**方針**を
 * **Electron を立てずに検証できる形**にするためである (BE-025c)。
 * `electron` を import したモジュールは Vitest の node 環境で読み込めず、
 * スタブを置けば「モックゼロで書ける」(AD-023 §1 / vitest.config.ts) が崩れる。
 * AD-023 が `window.ts` / `protocol.ts` を Electron 境界として切り出したのと同じ形である。
 *
 * **所在の判別に文字列リテラルを書かない** (AD-028 §4)。
 * 本ファイルは所在を見ない — 引数と環境変数を受け取って起こすだけである。
 */

/** バンドル後の列挙プロセスのファイルパス。子プロセスの生成に渡す。 */
export const ENUMERATE_SESSIONS_MODULE_PATH: string = enumerateSessionsModulePath

/**
 * 標準入出力を `pipe` にして標準出力を読む。
 *
 * **`parentPort` を使わない** — 使うと `agents` 側が Electron 前提になり、
 * 単独起動が崩れる (Principle VII / AD-010)。
 * `parentPort` は import を伴わないため、**機械検証は緑のまま**破れる経路である。
 */
export function createUtilityProcessLauncher(): EnumerationLauncher {
  return {
    launch(args, env) {
      const child = utilityProcess.fork(ENUMERATE_SESSIONS_MODULE_PATH, [...args], {
        env,
        stdio: 'pipe'
      })

      return {
        onLine(listener) {
          const assemble = createLineAssembler(listener)
          child.stdout?.on('data', (chunk: Buffer) => assemble(chunk.toString('utf8')))
        },
        onExit(listener) {
          child.on('exit', (code: number) => listener(code))
        },
        kill() {
          return child.kill()
        }
      }
    }
  }
}
