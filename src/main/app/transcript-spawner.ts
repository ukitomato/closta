import { MessageChannelMain, utilityProcess } from 'electron'

import readTranscriptModulePath from '@agents/read-transcript?modulePath'

import type {
  TranscriptSpawn,
  TranscriptSpawner,
  TranscriptSpawnRequest
} from './transcript-service'

/**
 * transcript 取得の**専用短命プロセス**を起こす層 (R-3 / [AD-034](../../../docs/decisions/0034-transcript-read-path-and-process-boundary.md) 決定 2)。
 *
 * **このファイルが子プロセス生成 API を持つ 2 つ目のモジュールである**
 * (`PROCESS_SPAWN_MODULES` の実名リスト。R-3 で追加)。
 * `enumerator-spawner.ts` と別にしたのは、あちらが AD-030 の**常駐**プロセスを
 * postMessage+stdout で起こす前提であり、こちらは **1 要求ごとに env 固定**で起こし
 * **`MessageChannelMain` の port を子へ transfer** する (main を本文経路から外す) ためである。
 *
 * **方針 (上限 / kill / 解決) は `transcript-service.ts` に置き、注入で受け取る** —
 * `electron` を import したモジュールは Vitest の node 環境で読み込めないため、
 * 方針を Electron 抜きで検証できる形にする (`session-enumerator.ts` と同じ分離)。
 *
 * **本文は port1↔port2 直通で renderer に届く。** main は port ハンドルを中継するだけで
 * `JSON.parse` も structured clone deserialize もしない (Principle IX / AD-034 決定 1)。
 */

/** バンドル後の取得プロセスのファイルパス。子プロセスの生成に渡す。 */
export const READ_TRANSCRIPT_MODULE_PATH: string = readTranscriptModulePath

export function createTranscriptSpawner(): TranscriptSpawner {
  return {
    launch(env: Record<string, string>, request: TranscriptSpawnRequest): TranscriptSpawn {
      const channel = new MessageChannelMain()
      const child = utilityProcess.fork(READ_TRANSCRIPT_MODULE_PATH, [], {
        env,
        /*
         * **stdout を読まない。** 応答は port 経由で renderer へ直通するため、
         * 親が読むパイプは要らない。`ignore` にして「読み手のいないパイプ」を作らない
         * (enumerator が `pipe` で踏んだ問題を構造的に避ける)。
         * SDK が stderr に出す UNC を含みうる例外文字列も OS 側で破棄される (C-7)。
         */
        stdio: 'ignore'
      })

      const exitListeners: (() => void)[] = []
      let ended = false
      const end = (): void => {
        if (ended) return
        ended = true
        for (const cb of exitListeners) cb()
      }
      child.on('exit', end)
      /* spawn に失敗した子も片付ける (追跡から外れる)。 */
      child.on('error', end)

      /*
       * **子が起きてから port1 と要求を transfer する。**
       * `spawn` を待つのは、fork 直後の postMessage が確実に届く保証が薄いため。
       * port1 は transfer 後 main 側で neutralize され、以後 main は本文に触れない。
       */
      child.once('spawn', () => {
        child.postMessage(request, [channel.port1])
      })

      return {
        port: channel.port2,
        kill(): boolean {
          if (ended) return true
          return child.kill()
        },
        onExit(listener: () => void): void {
          if (ended) listener()
          else exitListeners.push(listener)
        }
      }
    }
  }
}
