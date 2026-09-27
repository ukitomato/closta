import type { MessagePortMain } from 'electron'

import type {
  LaunchFailureReason,
  LaunchInput,
  RuntimeLaunchSpec,
  SessionControl
} from '@domain/session/agent-session'

/**
 * 単一セッション起動の調停 (X-1 / BE-007・BE-011・BE-021・BE-022。data-model §9 / contracts C-6)。
 *
 * | 規則 | 根拠 |
 * |---|---|
 * | **本文を保持しない。** stream port を IPC ハンドラへ渡すだけ (main を本文経路から外す) | Principle IX / AD-034 決定 1 |
 * | **単一セッション不変**: 生存中の agents プロセスが在れば新規 launch を拒否 | FR-019 / SC-011 |
 * | 制御 (send-prompt/respond-permission/interrupt/kill) は sessionId 鍵で該当プロセスへ送る | contracts C-1 |
 * | `before-quit` / window close で in-flight を kill (孤児回収) | FR-017 / SC-005 / SC-010 |
 *
 * **`electron` を実行時 import しない** (`MessagePortMain` は型のみ)。実プロセスを起こす層は
 * `session-spawner.ts` に分けて注入で受け取る (transcript-service と同じ分離。テスト容易性)。
 * 起動ゲート (`evaluateLaunch`) + spec/env 構築は `prepareLaunch` に注入する (composition が実装)。
 */

/** 起動プロセス 1 つ分の窓 (長寿命。**テストで差し替える**ため型で切る)。 */
export interface SessionSpawn {
  readonly sessionId: string
  /** agents に繋がった port2。IPC ハンドラが renderer へ transfer する (一方向 data plane)。 */
  readonly port: MessagePortMain
  /** 制御要求を agents へ送る (control plane)。 */
  sendControl(control: SessionControl): void
  /** 強制終了。agents 経由で `SpawnedProcess` (wsl.exe) を kill する。**戻り値を捨てない。** */
  kill(): boolean
  /** プロセスが exit したときに呼ばれる (自然終了・crash・kill の全て)。registry から外すのに使う。 */
  onExit(listener: () => void): void
}

export interface SessionSpawner {
  /** 起動プロセスを起こす。メソッド名に `spawn` を使わない (check.mjs 項目 7。transcript-service と同じ)。 */
  launch(input: LaunchInput, spec: RuntimeLaunchSpec, env: Record<string, string>): SessionSpawn
}

/** `folderId` / `runtimeId` を解決し、起動ゲートと spec/env 構築まで済ませた結果。 */
export type LaunchPreparation =
  | {
      readonly ok: true
      readonly input: LaunchInput
      readonly spec: RuntimeLaunchSpec
      readonly env: Record<string, string>
    }
  | { readonly ok: false; readonly reason: LaunchFailureReason }
  | null // 未知の folderId / runtimeId

export interface SessionLaunchServiceDeps {
  readonly spawner: SessionSpawner
  readonly prepareLaunch: (folderId: string, runtimeId: string) => Promise<LaunchPreparation>
}

export type LaunchOutcome =
  | { readonly status: 'launching'; readonly sessionId: string; readonly port: MessagePortMain }
  | {
      readonly status: 'rejected'
      readonly reason: LaunchFailureReason | 'session-active' | 'unknown-target'
    }

export interface SessionLaunchService {
  launch(folderId: string, runtimeId: string): Promise<LaunchOutcome>
  /** 制御を該当セッションへ送る。未知 / 終了済み sessionId なら `false`。 */
  control(sessionId: string, control: SessionControl): boolean
  /** アプリ終了時に in-flight を片付ける。**終了を確認できなかった台数**を返す。 */
  dispose(): number
}

export function createSessionLaunchService(deps: SessionLaunchServiceDeps): SessionLaunchService {
  /** sessionId → 生存中の起動プロセス。**空でない = 単一セッション占有** (FR-019 / SC-011)。 */
  const active = new Map<string, SessionSpawn>()

  return {
    async launch(folderId, runtimeId): Promise<LaunchOutcome> {
      // 単一セッション不変: 生存中のプロセスが在れば拒否 (data-model §9 / SC-011)。
      // **registry は「プロセス生存」基準** (run-state ではない。pr-gate arch M-001)。kill 経路は worker が
      // process.exit(0) するため onExit で除去されるが、**terminal error / done では worker は exit しない**
      // (failure 配送優先。孫 wsl.exe は finally で killSpawnedChild 済)。reset/kill/dispose の kill 経路が
      // worker を exit させて初めて onExit → 除去される。UI は error/done 後 entry へ戻る全経路で killSession を
      // 発火する (FailureBanner「再起動」/「閉じる」/ 画面遷移 unmount) ため、reset せず再 launch で詰む恒久
      // soft-lock は無い。run-state 基準の解放へ寄せる設計余地は follow-up。
      if (active.size > 0) return { status: 'rejected', reason: 'session-active' }

      const prep = await deps.prepareLaunch(folderId, runtimeId)
      if (prep === null) return { status: 'rejected', reason: 'unknown-target' }
      if (!prep.ok) return { status: 'rejected', reason: prep.reason }

      const spawn = deps.spawner.launch(prep.input, prep.spec, prep.env)
      active.set(spawn.sessionId, spawn)
      spawn.onExit(() => {
        // 自然終了・crash・kill のどれでも除去し、再 launch を許す (contracts C-6 / M-102)。
        if (active.get(spawn.sessionId) === spawn) active.delete(spawn.sessionId)
      })

      return { status: 'launching', sessionId: spawn.sessionId, port: spawn.port }
    },

    control(sessionId, control): boolean {
      const spawn = active.get(sessionId)
      if (spawn === undefined) return false
      // **kill も agents へ送る** — Windows の親 kill は孫 (wsl.exe) に伝播しないため、
      // agents が保持する `SpawnedProcess` を直接 kill させる必要がある (AD-036 §3 / security H-001)。
      // agents は wsl.exe を kill してから自プロセスを exit し、onExit で registry から外れる。
      // utilityProcess ハンドルの kill だけでは孫が孤児化する (kill only の旧実装が dead code 化していた)。
      spawn.sendControl(control)
      return true
    },

    dispose(): number {
      let unconfirmed = 0
      for (const spawn of [...active.values()]) {
        // 先に agents へ kill を送り孫 (wsl.exe) を殺させ、続けて utilityProcess を回収する (二段構成)。
        spawn.sendControl({ kind: 'kill' })
        if (!spawn.kill()) unconfirmed += 1
      }
      active.clear()
      return unconfirmed
    }
  }
}
