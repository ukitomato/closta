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
import type { ResumeUnavailableReason } from '@domain/session/resume'
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
  /** 会話の id (X-9 / AD-059)。セッションスレッドが最初の `init` で 1 回送ったものを、調停役スレッドが即座に中継する。 */
  onConversation(
    listener: (generation: number, sessionId: string, conversationId: string) => void
  ): void
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
  /**
   * 稼働中の行が会話の id を初めて持ったときに 1 回呼ぶ (X-9 / data-model §1.4)。渡すのは Closta の `sessionId` だけで、
   * 会話の id の値は渡さない。再開の起動の行は受け付けの時点で持つので呼ばない。
   */
  readonly onResumable?: (sessionId: string) => void
}

/**
 * 稼働中の行の再開の元 (main だけが持つ。X-9 / data-model §1.3)。永続化しない・値をログに出さない。
 */
export interface ConversationRecord {
  readonly conversationId: string
  /** 元の起動設定の引き継ぐ 3 軸 (data-model §4)。 */
  readonly folderId: string
  readonly runtimeId: string
  readonly providerId: string | null
  /** それまでの会話を読む列挙対象 (data-model §8)。過去の行から再開したときだけ値を持つ。 */
  readonly targetKey: string | null
}

/** 退避の表の上限 (data-model §1.5。超えたら挿入順で最も古いものを捨てる)。 */
export const MAX_CONVERSATION_RECORDS = 256

export type LaunchOutcome =
  | { readonly status: 'launching'; readonly sessionId: string; readonly port: MessagePortMain }
  | { readonly status: 'rejected'; readonly reason: SessionLaunchRejectReason }

/** 再開の source から main が解いた値 (`resume-service` の結果。renderer の値ではない)。 */
export interface ResolvedResume {
  readonly conversationId: string
  readonly folderId: string
  readonly runtimeId: string
  readonly providerId: string | null
  /** それまでの会話を読む列挙対象 (過去の行なら行の `targetKey`)。 */
  readonly targetKey: string | null
  /** 稼働中の行から再開するときの元の行の `sessionId`。受け付けたら元の行の退避の表のレコードを消す (data-model §1.5)。 */
  readonly replacesSessionId?: string | null
}

export type ResumeRejectReason =
  SessionLaunchRejectReason | ResumeUnavailableReason | 'conversation-running'

export type ResumeOutcome =
  | LaunchOutcome
  | { readonly status: 'already-running'; readonly sessionId: string }
  | { readonly status: 'rejected'; readonly reason: ResumeRejectReason }

export interface SessionLaunchService {
  /** 検証済みの起動設定で起動する (X-4 の起動前段を通る)。 */
  launch(config: SessionLaunchConfig): Promise<LaunchOutcome>
  /**
   * 再開の起動 (X-9 / data-model §5 の 4〜9)。`config` の 3 軸は `resolved` と照合済みであること
   * (`resume-service`)。会話の id は `prepareLaunch` に渡さず、起動の options の `resume` に足す。
   */
  resume(config: SessionLaunchConfig, resolved: ResolvedResume): Promise<ResumeOutcome>
  /** 制御を該当セッションへ送る。未知 / セッションスレッドが終わった sessionId なら `false`。 */
  control(sessionId: string, control: SessionControl): boolean
  /** 退避の表の引き当て (X-9)。レコードが無い (会話の id を持たない・上限で捨てた・`killAll` の後) なら `null`。 */
  conversationRecord(sessionId: string): ConversationRecord | null
  /** 全セッションに kill を送る (renderer の再読み込み・クラッシュ)。supervisor は止めない。送った数を返す。 */
  killAll(): number
  /** アプリ終了時の後始末。1 回だけ走る。**終了を確認できなかった台数**を返す。 */
  dispose(): Promise<number>
}

/** 起動設定の引き継ぐ 3 軸 (起動の時点で覚え、会話の id が届いたら `ConversationRecord` にする。起動設定そのものは持たない)。 */
interface LaunchAxes {
  readonly folderId: string
  readonly runtimeId: string
  readonly providerId: string | null
}

interface Entry extends RegistryStatus {
  readonly threadAlive: boolean
  /** 会話の id (X-9)。新しい起動は `null`。再開の起動は要求の id。`onConversation` で上書きする。 */
  readonly conversationId: string | null
  readonly axes: LaunchAxes
}

/** dispose の待ちの既定の上限 (X-8 / AD-058 Decision 4 で 3,000 → 6,000。全部が終われば待たない)。 */
const DEFAULT_DISPOSE_WAIT_MS = 6000

export function createSessionLaunchService(deps: SessionLaunchServiceDeps): SessionLaunchService {
  /** sessionId → 状態。**枠を占める = claudeAlive: true** (FR-005)。 */
  let registry = new Map<string, Entry>()
  /** 退避の表 (X-9 / data-model §1.3)。registry のエントリが消えても残る。挿入順で上限 256。 */
  const conversations = new Map<string, ConversationRecord>()
  /** 予約済みで registry にまだ登録していない起動要求の数。 */
  let reserved = 0
  /** 準備の途中の再開の会話の id (data-model §5 の 5。連打の 2 本目を `conversation-running` にする)。 */
  const inFlightConversations = new Set<string>()
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
      // 受信規則の結果に無い値 (会話の id・3 軸) は元のエントリから引き継ぐ。エントリを作るのは起動だけ。
      if (prev === undefined) continue
      const threadAlive = prev.threadAlive
      if (!status.claudeAlive && !threadAlive) continue
      updated.set(id, {
        ...status,
        threadAlive,
        conversationId: prev.conversationId,
        axes: prev.axes
      })
    }
    registry = updated
    if (onAllEnded !== null && occupying() === 0) onAllEnded()
  }

  const statusView = (): Map<string, RegistryStatus> => new Map(registry)

  /** 退避の表に入れる。挿入順を保つため既存でも入れ直し (最も新しい扱い)、256 を超えたら最も古いものを捨てる。 */
  const putRecord = (sessionId: string, record: ConversationRecord): void => {
    conversations.delete(sessionId)
    conversations.set(sessionId, record)
    while (conversations.size > MAX_CONVERSATION_RECORDS) {
      const oldest = conversations.keys().next()
      if (oldest.done === true) break
      conversations.delete(oldest.value)
    }
  }

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

  deps.connection.onConversation((generation, sessionId, conversationId) => {
    // 世代の違う・知らない sessionId は捨てる (`onThreadEnded` と同じ)。中身を解釈せず、値をログに出さない。
    const entry = registry.get(sessionId)
    if (entry === undefined || entry.generation !== generation) return
    const first = entry.conversationId === null
    if (!first && entry.conversationId !== conversationId) {
      // 再開の起動の `init` が要求と別の id を出した (research R-02)。上書きして事実だけを記録する (値を出さない)。
      deps.log('[session] conversation-id-changed')
    }
    registry.set(sessionId, { ...entry, conversationId })
    const prevRecord = conversations.get(sessionId)
    // 挿入順を保つため、既存でも入れ直す (最も新しい扱いにする)。
    putRecord(sessionId, {
      conversationId,
      folderId: entry.axes.folderId,
      runtimeId: entry.axes.runtimeId,
      providerId: entry.axes.providerId,
      targetKey: prevRecord?.targetKey ?? null
    })
    if (first) deps.onResumable?.(sessionId)
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
    conversations.clear()
    let sent = 0
    for (const [id, entry] of registry) {
      if (!entry.threadAlive) continue
      deps.connection.control(id, { kind: 'kill' })
      sent += 1
    }
    return sent
  }

  /**
   * 予約から登録までの本体 (`launch` と、再開の起動 (X-9) が共有する)。
   * 上限の判定と枠の予約は `await` の前に同期で行う (同時に届いた要求でも超えない。FR-005)。
   */
  const startSession = async (
    config: SessionLaunchConfig,
    resumeOf: ResolvedResume | null = null
  ): Promise<LaunchOutcome> => {
    if (disposing !== null) return { status: 'rejected', reason: 'shutting-down' }
    if (!canReserve(occupying(), reserved)) return { status: 'rejected', reason: 'session-limit' }
    reserved += 1
    if (resumeOf !== null) inFlightConversations.add(resumeOf.conversationId)
    const startedEpoch = epoch
    try {
      const prep = await deps.prepareLaunch(config)
      if (prep === null) return { status: 'rejected', reason: 'unknown-target' }
      if (!prep.ok) return { status: 'rejected', reason: prep.reason }
      if (disposing !== null) return { status: 'rejected', reason: 'shutting-down' }
      // 起動途中に renderer が再読み込みされたら登録しない (見えない枠を作らない。R3 sec M-001)。
      if (epoch !== startedEpoch) return { status: 'rejected', reason: 'launch-failed' }

      const sessionId = deps.newSessionId()
      // 再開の起動で `resume` を足す処理はここの 1 か所だけ (WSL / Win32 の分岐の外。FR-014)。
      const options: LaunchQueryOptions =
        resumeOf === null
          ? prep.input.options
          : { ...prep.input.options, resume: resumeOf.conversationId }
      const result = deps.connection.launch(sessionId, prep.spec, options)
      if (!result.ok) return { status: 'rejected', reason: 'launch-failed' }
      const axes: LaunchAxes = {
        folderId: config.folderId,
        runtimeId: config.runtimeId,
        providerId: config.providerId
      }
      registry.set(sessionId, {
        generation: result.generation,
        state: 'launching',
        reasonKey: null,
        claudeAlive: true,
        threadAlive: true,
        conversationId: resumeOf === null ? null : resumeOf.conversationId,
        axes
      })
      if (resumeOf !== null) {
        putRecord(sessionId, {
          conversationId: resumeOf.conversationId,
          ...axes,
          targetKey: resumeOf.targetKey
        })
        // 受け付けたら元の行のレコードを消す (同じ行からの 2 回目の再開は `source-unknown`。拒否では消さない)。
        if (resumeOf.replacesSessionId != null) conversations.delete(resumeOf.replacesSessionId)
      }
      return { status: 'launching', sessionId, port: result.port }
    } finally {
      reserved -= 1
      if (resumeOf !== null) inFlightConversations.delete(resumeOf.conversationId)
    }
  }

  return {
    launch: (config): Promise<LaunchOutcome> => startSession(config),

    resume(config, resolved): Promise<ResumeOutcome> {
      // 4〜6 は `await` の前に同期で行う。4 は上限の判定より前 (上限いっぱいでも動いている行を選ぶ答えは返せる)。
      for (const [id, entry] of registry) {
        if (entry.claudeAlive && entry.conversationId === resolved.conversationId) {
          return Promise.resolve({ status: 'already-running', sessionId: id })
        }
      }
      if (inFlightConversations.has(resolved.conversationId)) {
        return Promise.resolve({ status: 'rejected', reason: 'conversation-running' })
      }
      return startSession(config, resolved)
    },

    control(sessionId, control): boolean {
      const entry = registry.get(sessionId)
      if (entry === undefined || !entry.threadAlive) return false
      deps.connection.control(sessionId, control)
      return true
    },

    conversationRecord(sessionId): ConversationRecord | null {
      return conversations.get(sessionId) ?? null
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
