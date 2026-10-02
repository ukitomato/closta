import type { MessagePortMain } from 'electron'

import type {
  LaunchFailureReason,
  LaunchInput,
  LaunchPreflightReason,
  LaunchQueryOptions,
  RuntimeLaunchSpec,
  SessionControl,
  SessionLaunchRejectReason
} from '@domain/session/agent-session'
import { canReserve, countOccupying } from '@domain/session/concurrency'
import type { SessionLaunchConfig } from '@domain/session/launch-config'
import {
  acceptBatch,
  applySynthesized,
  synthesizeExit,
  type RegistryStatus,
  type SessionStatusUpdate
} from '@domain/session/status-update'

/**
 * 複数セッションの起動調停 (X-5 / spec FR-005・FR-007・FR-013・FR-014 / AD-043)。X-1 の単一セッション不変を置き換えた。
 *
 * | 規則 | 根拠 |
 * |---|---|
 * | **本文を保持しない。** port を IPC ハンドラへ渡すだけ (main を本文経路から外す) | Principle IX / AD-034 |
 * | **同時実行数の上限は 10。** 枠の判定と予約は `await` の前に同期で行う。枠は registry の `claudeAlive` で数える (run-state では数えない) | FR-005 / concurrency.ts |
 * | 状態通知の受信規則は domain の `acceptBatch` だけ (世代・registry・単調性)。受理した値だけを relay へ渡す | FR-004 / AD-023 §5 |
 * | 制御は registry に在り、セッションスレッドが生きている sessionId にだけ送る | FR-007 |
 * | supervisor の異常終了ではその世代の全セッションを `supervisor-exited` にし、原因を追える 1 行を記録する (会話由来の文字列・env を出さない) | FR-013 |
 * | renderer の再読み込み・クラッシュでは全セッションを止める (`killAll`)。その間に起動途中だった要求は登録しない | FR-014 / design-gate R3 sec M-001 |
 * | 終了処理は 1 回だけ走り、全セッションの `claude` の終了か期限を待ってから supervisor を止める | FR-014 |
 *
 * **`electron` を実行時 import しない** (`MessagePortMain` は型のみ)。実プロセスの層は `session-spawner.ts` に
 * 分けて注入で受け取る (Vitest で試せる形)。起動前段 (`prepareLaunch`) も注入で受け取る。
 */

export type SupervisorLaunchResult =
  | { readonly ok: true; readonly port: MessagePortMain; readonly generation: number }
  | { readonly ok: false }

/** 単一 supervisor への接続 (実体は `session-spawner.ts`。**テストで差し替える**ため型で切る)。 */
export interface SupervisorConnection {
  /** セッションを 1 本起こす。必要なら supervisor を fork する (メソッド名に `spawn` を使わない。check.mjs 項目 7)。 */
  launch(
    sessionId: string,
    spec: RuntimeLaunchSpec,
    options: LaunchQueryOptions
  ): SupervisorLaunchResult
  control(sessionId: string, control: SessionControl): void
  /** supervisor を止める。**戻り値を捨てない** (止められなかったら false)。 */
  kill(): boolean
  onStatusBatch(listener: (generation: number, updates: readonly unknown[]) => void): void
  onThreadEnded(listener: (generation: number, sessionId: string) => void): void
  onExit(listener: (generation: number, code: number | null) => void): void
}

/**
 * 起動設定を解決し、依存解決の再評価・起動ゲート・env 導出・spec/env 構築まで済ませた結果 (X-4)。
 * wsl.exe の env は `spec.env` に載る。supervisor の fork env はここに持たない — ランタイムに依存しない curated base を
 * 接続の構築時に注入する (`createSupervisorConnection(forkEnv)`。pr-gate R1 platform-boundary L-001)。
 */
export type LaunchPreparation =
  | {
      readonly ok: true
      readonly input: LaunchInput
      readonly spec: RuntimeLaunchSpec
    }
  | { readonly ok: false; readonly reason: LaunchFailureReason | LaunchPreflightReason }
  | null // 未知の folderId / runtimeId

export interface TimerLike {
  setTimeout(fn: () => void, ms: number): unknown
  clearTimeout(handle: unknown): void
}

export interface SessionLaunchServiceDeps {
  readonly connection: SupervisorConnection
  readonly prepareLaunch: (config: SessionLaunchConfig) => Promise<LaunchPreparation>
  /** sessionId の生成源 (UUID。本番は `crypto.randomUUID`)。 */
  readonly newSessionId: () => string
  /** 受理した状態通知を renderer へ届ける (relay)。 */
  readonly onStatus: (updates: readonly SessionStatusUpdate[]) => void
  readonly timer: TimerLike
  /** 理由キー・件数・終了コードだけを記録する (会話由来の文字列・env を出さない)。 */
  readonly log: (line: string) => void
  /** 終了処理で `claude` の終了を待つ期限 (spec Assumptions [ASSUMED] 3 秒)。 */
  readonly disposeWaitMs?: number
}

export type LaunchOutcome =
  | { readonly status: 'launching'; readonly sessionId: string; readonly port: MessagePortMain }
  | { readonly status: 'rejected'; readonly reason: SessionLaunchRejectReason }

export interface SessionLaunchService {
  /** 検証済みの起動設定で起動する (X-4 の起動前段を通る)。 */
  launch(config: SessionLaunchConfig): Promise<LaunchOutcome>
  /** 制御を該当セッションへ送る。未知 / セッションスレッドが終わった sessionId なら `false`。 */
  control(sessionId: string, control: SessionControl): boolean
  /** 全セッションに kill を送る (renderer の再読み込み・クラッシュ)。supervisor は止めない。送った数を返す。 */
  killAll(): number
  /** アプリ終了時の後始末。1 回だけ走る。**終了を確認できなかった台数**を返す。 */
  dispose(): Promise<number>
}

interface Entry extends RegistryStatus {
  readonly threadAlive: boolean
}

const DEFAULT_DISPOSE_WAIT_MS = 3000

export function createSessionLaunchService(deps: SessionLaunchServiceDeps): SessionLaunchService {
  /** sessionId → 状態。**枠を占める = claudeAlive: true** (FR-005)。 */
  let registry = new Map<string, Entry>()
  /** 予約済みで registry にまだ登録していない起動要求の数。 */
  let reserved = 0
  /** `killAll` のたびに進む。起動途中の要求が killAll をまたいだかを判定する。 */
  let epoch = 0
  let disposing: Promise<number> | null = null
  /** dispose が `claude` の終了を待つときの通知口。 */
  let onAllEnded: (() => void) | null = null

  const occupying = (): number => countOccupying(registry.values())

  /** domain の受信規則の結果を registry に書き戻す (threadAlive は保つ)。両方終わったエントリは消す。 */
  const commit = (next: ReadonlyMap<string, RegistryStatus>): void => {
    const updated = new Map<string, Entry>()
    for (const [id, status] of next) {
      const prev = registry.get(id)
      const threadAlive = prev?.threadAlive ?? false
      if (!status.claudeAlive && !threadAlive) continue
      updated.set(id, { ...status, threadAlive })
    }
    registry = updated
    if (onAllEnded !== null && occupying() === 0) onAllEnded()
  }

  const statusView = (): Map<string, RegistryStatus> => new Map(registry)

  deps.connection.onStatusBatch((generation, updates) => {
    const { accepted, next } = acceptBatch(statusView(), generation, updates)
    commit(next)
    if (accepted.length > 0) deps.onStatus(accepted)
  })

  deps.connection.onThreadEnded((generation, sessionId) => {
    const entry = registry.get(sessionId)
    if (entry === undefined || entry.generation !== generation) return
    if (entry.claudeAlive) registry.set(sessionId, { ...entry, threadAlive: false })
    else registry.delete(sessionId)
    if (onAllEnded !== null && occupying() === 0) onAllEnded()
  })

  deps.connection.onExit((generation, code) => {
    // その世代のエントリだけを対象にする (新しい世代で動いているセッションに付けない)。
    const ids = [...registry].filter(([, e]) => e.generation === generation).map(([id]) => id)
    deps.log(
      `[supervisor] exited code=${String(code)} generation=${generation} sessions=${ids.length}`
    )
    if (ids.length === 0) return
    const { accepted, next } = applySynthesized(
      statusView(),
      synthesizeExit(ids, 'supervisor-exited')
    )
    for (const id of ids) {
      const entry = registry.get(id)
      if (entry !== undefined) registry.set(id, { ...entry, threadAlive: false })
    }
    commit(next)
    deps.onStatus(accepted)
  })

  const killAll = (): number => {
    epoch += 1
    let sent = 0
    for (const [id, entry] of registry) {
      if (!entry.threadAlive) continue
      deps.connection.control(id, { kind: 'kill' })
      sent += 1
    }
    return sent
  }

  return {
    async launch(config): Promise<LaunchOutcome> {
      if (disposing !== null) return { status: 'rejected', reason: 'shutting-down' }
      // 上限の判定と枠の予約を await の前に同期で行う (同時に届いた要求でも超えない。FR-005)。
      if (!canReserve(occupying(), reserved)) return { status: 'rejected', reason: 'session-limit' }
      reserved += 1
      const startedEpoch = epoch
      try {
        const prep = await deps.prepareLaunch(config)
        if (prep === null) return { status: 'rejected', reason: 'unknown-target' }
        if (!prep.ok) return { status: 'rejected', reason: prep.reason }
        if (disposing !== null) return { status: 'rejected', reason: 'shutting-down' }
        // 起動途中に renderer が再読み込みされたら登録しない (見えない枠を作らない。R3 sec M-001)。
        if (epoch !== startedEpoch) return { status: 'rejected', reason: 'launch-failed' }

        const sessionId = deps.newSessionId()
        const result = deps.connection.launch(sessionId, prep.spec, prep.input.options)
        if (!result.ok) return { status: 'rejected', reason: 'launch-failed' }
        registry.set(sessionId, {
          generation: result.generation,
          state: 'launching',
          reasonKey: null,
          claudeAlive: true,
          threadAlive: true
        })
        return { status: 'launching', sessionId, port: result.port }
      } finally {
        reserved -= 1
      }
    },

    control(sessionId, control): boolean {
      const entry = registry.get(sessionId)
      if (entry === undefined || !entry.threadAlive) return false
      deps.connection.control(sessionId, control)
      return true
    },

    killAll(): number {
      const sent = killAll()
      if (sent > 0) deps.log(`[session] killAll sessions=${sent}`)
      return sent
    },

    dispose(): Promise<number> {
      if (disposing !== null) return disposing
      disposing = (async (): Promise<number> => {
        killAll()
        if (occupying() > 0) {
          await new Promise<void>((resolve) => {
            const handle = deps.timer.setTimeout(() => {
              onAllEnded = null
              resolve()
            }, deps.disposeWaitMs ?? DEFAULT_DISPOSE_WAIT_MS)
            onAllEnded = () => {
              onAllEnded = null
              deps.timer.clearTimeout(handle)
              resolve()
            }
          })
        }
        const remaining = occupying()
        const killed = deps.connection.kill()
        return remaining + (killed ? 0 : 1)
      })()
      return disposing
    }
  }
}
