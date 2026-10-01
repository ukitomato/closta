import { randomUUID } from 'node:crypto'

import { MessageChannelMain, utilityProcess } from 'electron'

import sdkAgentSessionModulePath from '@agents/sdk-agent-session?modulePath'

import type { LaunchInput, RuntimeLaunchSpec, SessionControl } from '@domain/session/agent-session'

import type { SessionSpawn, SessionSpawner } from './session-launch-service'

/**
 * per-session の agents `utilityProcess` を起こす層 (X-1 / BE-003。AD-036 §3 / contracts C-2・C-6)。
 *
 * **子プロセス生成 API を持つモジュール**であり `PROCESS_SPAWN_MODULES` に入る (check.mjs 項目 7)。
 * `transcript-spawner.ts` (R-3) と同型 — **1 セッションごとに env 固定で fork** し、
 * `new MessageChannelMain()` の **port1 を agents / port2 を renderer へ** transfer する
 * (main を本文のデータ経路から外す。Principle IX / AD-034)。
 *
 * **方針 (単一セッション不変 / 制御ルーティング / kill / dispose) は `session-launch-service.ts` に置き、
 * 注入で受け取る** — `electron` を import したモジュールは Vitest の node 環境で読めないため、
 * 検証できる形にする (transcript-service と同じ分離)。
 *
 * | 規則 | 根拠 |
 * |---|---|
 * | **launch spec は `port1` と共に子へ transfer** (RuntimeLaunchSpec の値。agents は WSL-free) | data-model §8 / C-7 |
 * | 制御 (send-prompt/respond-permission/interrupt/kill) は `postMessage` で子へ | contracts C-1 |
 * | **kill 対象は utilityProcess ハンドル。** 孫 (wsl) の kill は agents が `SpawnedProcess` に対して行う | contracts C-6 |
 * | stdout を読まない (`stdio: 'ignore'`)。応答は port 直通、制御は message 経由 | AD-034 決定 1 |
 */

/** バンドル後の agents session worker のファイルパス。子プロセスの生成に渡す。 */
export const SDK_AGENT_SESSION_MODULE_PATH: string = sdkAgentSessionModulePath

export function createSessionSpawner(): SessionSpawner {
  return {
    launch(input: LaunchInput, spec: RuntimeLaunchSpec, env: Record<string, string>): SessionSpawn {
      const sessionId = randomUUID()
      const channel = new MessageChannelMain()
      const child = utilityProcess.fork(SDK_AGENT_SESSION_MODULE_PATH, [], {
        env,
        // 応答は port 直通、制御は message 経由。読み手のいないパイプを作らない (transcript-spawner と同じ)。
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
      // spawn に失敗した子も片付ける (追跡から外れる)。
      child.on('error', end)

      /*
       * **子が起きてから port1 と launch spec を transfer する。**
       * `spawn` を待つのは fork 直後の postMessage が確実に届く保証が薄いため
       * (transcript-spawner と同じ理由)。port1 は transfer 後 main 側で neutralize される。
       */
      child.once('spawn', () => {
        // **query() 時の選択 (permissionMode / model / effort / settings) を明示フィールドで運ぶ** (X-4 FR-005)。
        // spec.env に紛れ込ませない。agents の decoder が同じ述語で再検証し、未知キーを捨てる。
        child.postMessage({ kind: 'launch', spec, options: input.options }, [channel.port1])
      })

      return {
        sessionId,
        port: channel.port2,
        sendControl(control: SessionControl): void {
          if (ended) return
          child.postMessage({ kind: 'control', control })
        },
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
