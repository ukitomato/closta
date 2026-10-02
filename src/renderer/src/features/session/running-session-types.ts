import type { createMessageQueue, ThreadMessageLike } from '@assistant-ui/react'

import type {
  LaunchFailureReason,
  PermissionDeniedInfo,
  SessionLaunchRejectReason
} from '@domain/session/agent-session'
import type { SessionLaunchConfig } from '@domain/session/launch-config'
import type { SessionRunState } from '@domain/session/run-state'
import type { SessionStatusUpdate } from '@domain/session/status-update'

import type { EnqueueVerdict } from './composer-queue'
import type { QueueAdapter } from './composer-queue-adapter'

/**
 * 稼働中セッションのストアの状態型 (X-5)。ストア (`running-session-store.ts`) と表示用の導出 (`session-view.ts`) の
 * 両方が読む — 型をストア側に置くと、ストア → 導出 → ストアの循環になる (depcruise `no-circular`)。
 */

/** 承認カード表示用 (サニタイズ済み plain text。X-1 H-05)。 */
export interface PendingPermission {
  readonly requestId: string
  readonly toolName: string
  readonly input: string
  readonly scope: 'once' | 'capability'
}

/** セッション 1 本分の表示状態 (X-1 の `LiveSession` の中身 + X-5 の追加)。 */
export interface LiveSessionState {
  readonly sessionId: string
  readonly config: SessionLaunchConfig
  /** 起動時刻 (epoch ms。一覧の行に秒まで出す)。 */
  readonly startedAt: number
  readonly runState: SessionRunState
  readonly messages: readonly ThreadMessageLike[]
  readonly pending: PendingPermission | null
  readonly denied: readonly PermissionDeniedInfo[]
  /** 実行時失敗の理由キー (`failure` SessionEvent 由来)。 */
  readonly failureReason: LaunchFailureReason | null
  /** 利用者が強制終了したか。「強制終了しました」の文言の出し分けと composer の即時無効化に使う (R3-H-04)。 */
  readonly killed: boolean
  /** 終了 (`end`) を送った後か。終了を再び押せず、composer を無効にする (FR-011 / R3-H-04)。 */
  readonly ending: boolean
  /** 終了が期限内に終わらず強制終了に落ちたか (`end-forced`。FR-011)。 */
  readonly endForced: boolean
  /** プロンプトを 1 度でも送ったか。最初のプロンプト待ちの `launching` を見分ける (pr-gate R1 po H-001)。 */
  readonly promptSent: boolean
  /** 送信待ちキューへの積み込みを拒否した理由 (X-2 FR-003 / FR-004)。 */
  readonly queueRejection: Exclude<EnqueueVerdict, 'ok'> | null
}

/** 起動ダイアログの状態 (直近の起動要求)。 */
export interface LaunchState {
  readonly phase: 'entry' | 'launching' | 'rejected'
  readonly rejectReason: SessionLaunchRejectReason | null
  /** 最後に起動を試みた設定 (失敗・拒否で戻ったときの復元。X-4 US-1 AC7)。 */
  readonly lastConfig: SessionLaunchConfig | null
  /** 起動直後に失敗したセッションを閉じて戻ったときの理由 (X-4 US-1 AC7)。 */
  readonly previousFailure: LaunchFailureReason | null
}

export interface RunningSessionStoreState {
  /** 一覧の並び (起動順)。 */
  readonly order: readonly string[]
  readonly sessions: Readonly<Record<string, LiveSessionState>>
  /** main から届いた状態通知 (受理済み)。一覧の行と `ended` の導出に使う。 */
  readonly statuses: Readonly<Record<string, SessionStatusUpdate>>
  /** 表示中のセッション。null は起動ダイアログを表示する。 */
  readonly selectedId: string | null
  readonly launch: LaunchState
}

/** セッション 1 本の送信待ちキュー (assistant-ui native queue + 積み込み検証)。 */
export interface SessionQueue {
  readonly controller: ReturnType<typeof createMessageQueue>
  readonly adapter: QueueAdapter
}
