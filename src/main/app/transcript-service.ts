import type { MessagePortMain } from 'electron'

import type { FailureReason } from '@domain/session/target'
import type { TranscriptHandshakeDTO } from '@domain/session/transcript-dto'

/**
 * transcript 取得の調停 (R-3 / BE-023 / [AD-034](../../../docs/decisions/0034-transcript-read-path-and-process-boundary.md))。
 *
 * | 規則 | 根拠 |
 * |---|---|
 * | **本文を保持しない。** port2 を IPC ハンドラへ渡すだけ (main を本文経路から外す) | Principle IX / AD-034 決定 1 |
 * | 取得は **target ごとに env 固定の専用短命プロセス** | AD-034 決定 2 |
 * | 起動ゲート (`wsl:<D>` は実行中確認) は `resolveTarget` (session-service) が掛ける | FR-008 |
 * | **同時取得プロセス数に上限**。超過や dispose で kill | S-003 / CWE-400 |
 *
 * **`electron` を実行時 import しない。** `MessagePortMain` は型のみ (実行時に消える) で扱い、
 * 子プロセスを実際に起こす層は `transcript-spawner.ts` に分けて注入で受け取る
 * (`session-enumerator.ts` が `enumerator-spawner.ts` を分けたのと同じ形。テスト容易性)。
 */

/** transcript 取得プロセス 1 つ分の窓。**テストで差し替える**ため型で切る。 */
export interface TranscriptSpawn {
  /** 取得プロセスに繋がった port2。IPC ハンドラが renderer へ transfer する。 */
  readonly port: MessagePortMain
  /** 終了させる。**戻り値を捨てない** (session-enumerator と同じ規約)。 */
  kill(): boolean
  /** 子が exit したときに呼ばれる (自然終了・kill の双方)。追跡から外すのに使う。 */
  onExit(listener: () => void): void
}

export interface TranscriptSpawnRequest {
  readonly sessionId: string
  readonly requestToken: string
}

export interface TranscriptSpawner {
  /**
   * 取得プロセスを起こす。
   *
   * **メソッド名に `spawn` を使わない** (session-enumerator の `launch` と同じ理由)。
   * check.mjs 項目 7 (Principle VI) はプロセス起動 API を**名前の文字列**で探すため、
   * `spawn(` を許可リスト外モジュール (本サービス) に置くと発火する (実測)。
   */
  launch(env: Record<string, string>, request: TranscriptSpawnRequest): TranscriptSpawn
}

/**
 * `targetKey` → config ディレクトリ env と起動ゲートの解決 (session-service が実装)。
 * `null` は未知の `targetKey`。
 */
export type TranscriptTargetResolution =
  | { readonly ok: true; readonly configDirEnv: string }
  | { readonly ok: false; readonly reasonKey: FailureReason }
  | null

export interface TranscriptServiceDeps {
  readonly spawner: TranscriptSpawner
  readonly resolveTarget: (targetKey: string) => Promise<TranscriptTargetResolution>
  /** config ディレクトリ env を固定した環境変数を組み立てる (config-dir の `buildTranscriptEnv`)。 */
  readonly buildEnv: (configDirEnv: string) => Record<string, string>
  /** 同時取得プロセス数の上限 (S-003)。既定 4。 */
  readonly maxConcurrent?: number
}

export interface TranscriptResult {
  readonly handshake: TranscriptHandshakeDTO
  /**
   * renderer へ transfer する port2。失敗時は `null`。
   * **IPC ハンドラ (`ipc.ts`) が `event.sender.postMessage` で transfer する** —
   * transfer 後に main 側で neutralize されるため、main は本文に触れない (AD-034 決定 1)。
   */
  readonly port: MessagePortMain | null
}

export interface TranscriptService {
  getTranscript(
    sessionId: string,
    targetKey: string,
    requestToken: string
  ): Promise<TranscriptResult>
  /** アプリ終了時に in-flight プロセスを片付ける。**終了を確認できなかった台数**を返す。 */
  dispose(): number
}

export function createTranscriptService(deps: TranscriptServiceDeps): TranscriptService {
  const maxConcurrent = deps.maxConcurrent ?? 4
  /** requestToken → 実行中の取得プロセス。 */
  const active = new Map<string, TranscriptSpawn>()

  function failed(requestToken: string, reasonKey: FailureReason): TranscriptResult {
    return { handshake: { status: 'failed', requestToken, reasonKey }, port: null }
  }

  return {
    async getTranscript(sessionId, targetKey, requestToken): Promise<TranscriptResult> {
      const resolution = await deps.resolveTarget(targetKey)
      if (resolution === null) return failed(requestToken, 'enumeration-failed')
      if (!resolution.ok) return failed(requestToken, resolution.reasonKey)

      /*
       * **同時数上限を超えたら最も古いものを kill する** (S-003)。
       * 取得プロセスは ~2.7s 生存するため、高速切替や連打で積み上がる resource exhaustion を防ぐ。
       * 取得プロセスは 1 frame を返して自ら exit するので、通常は onExit で先に減る。
       */
      while (active.size >= maxConcurrent) {
        const oldest = active.keys().next().value
        if (oldest === undefined) break
        active.get(oldest)?.kill()
        active.delete(oldest)
      }

      const worker = deps.spawner.launch(deps.buildEnv(resolution.configDirEnv), {
        sessionId,
        requestToken
      })
      active.set(requestToken, worker)
      worker.onExit(() => {
        /* 自然終了・kill のどちらでも追跡から外す (地図を伸ばし続けない)。 */
        if (active.get(requestToken) === worker) active.delete(requestToken)
      })

      return { handshake: { status: 'streaming', requestToken }, port: worker.port }
    },

    dispose(): number {
      let unconfirmed = 0
      for (const worker of [...active.values()]) {
        if (!worker.kill()) unconfirmed += 1
      }
      active.clear()
      return unconfirmed
    }
  }
}
