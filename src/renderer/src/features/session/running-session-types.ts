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
import type { SessionRowStatus } from './labels'

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
  /**
   * 起動の受付時に写した作業フォルダの表示名 (O-1 / data-model §1)。App の寿命の live region が IPC を持たずに
   * 文を組むために使う。引けなかったときは `null` (固定の代替語を使う)。
   */
  readonly folderLabel: string | null
}

/** 監視ビューの情報密度 (O-1 / FR-008)。renderer の表示状態であり永続化しない。 */
export type Density = 'comfortable' | 'compact'

/** 行の状態に入った時刻 (O-1 / FR-005。glossary Status since)。 */
export interface StatusSince {
  readonly status: SessionRowStatus
  readonly at: number
}

/**
 * 直近の活動 (O-1 / FR-006。glossary Recent activity)。`tool` / `detail` は会話由来の文字列を `toActivityLine` で
 * 1 行の plain text にした値。
 */
export interface Activity {
  readonly kind: 'approval' | 'tool' | 'prompt' | 'reply'
  readonly tool: string | null
  readonly detail: string
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
  /** 選択中の稼働中のセッション。null は選択なし。中央に出すかはシェルの `focus` が決める (O-7)。 */
  readonly selectedId: string | null
  /**
   * 選択の操作 (行の選択・承認待ちへの移動・起動の受け付け) のたびに増える通知の値 (O-7 / data-model §1)。
   * 同じ id を選び直しても上がるので、シェルは値の変化ではなくこれで「稼働中の側が選ばれた」を受ける。
   */
  readonly selectionSeq: number
  readonly launch: LaunchState
  /** 行の状態に入った時刻 (O-1)。1 回のストア更新の中の変化は 1 回の `setState` にまとめる (data-model §1)。 */
  readonly statusSince: Readonly<Record<string, StatusSince>>
  /** 直近の活動。購読の手前で間引いて書く (O-1 / research R-03)。 */
  readonly activity: Readonly<Record<string, Activity | null>>
  /** 全セッションの受信メッセージの累計 (実機計測の観測点。会話由来の値を持たない。O-1 / FR-012)。 */
  readonly receivedMessages: number
  readonly density: Density
}

/** セッション 1 本の送信待ちキュー (assistant-ui native queue + 積み込み検証)。 */
export interface SessionQueue {
  readonly controller: ReturnType<typeof createMessageQueue>
  readonly adapter: QueueAdapter
}
