import type { createMessageQueue, ThreadMessageLike } from '@assistant-ui/react'

import type {
  LaunchFailureReason,
  PermissionDeniedInfo,
  SessionLaunchRejectReason
} from '@domain/session/agent-session'
import type { ElicitationPrompt } from '@domain/session/elicitation'
import type { SessionLaunchConfig } from '@domain/session/launch-config'
import type { LaunchOrigin } from '@domain/session/launch-usage'
import type {
  LiveModelOption,
  LiveSettingFailure,
  LiveSettingKind
} from '@domain/session/live-settings'
import type { ResumeSource, ResumeUnavailableReason } from '@domain/session/resume'
import type { BackgroundTaskEntry, MeterUpdate, PermissionModeKey } from '@domain/session/meter'
import type { CommandsMeter, InitReportMeter } from '@domain/session/session-init-report'
import type { SessionRunState } from '@domain/session/run-state'
import type { SessionStatusUpdate } from '@domain/session/status-update'

import type { EnqueueVerdict } from './composer-queue'
import type { QueueAdapter } from './composer-queue-adapter'

/**
 * 稼働中セッションのストアの状態型 (X-5)。ストア (`running-session-store.ts`) と表示用の導出 (`session-view.ts`) の
 * 両方が読む — 型をストア側に置くと、ストア → 導出 → ストアの循環になる (depcruise `no-circular`)。
 * 文言の表 (`labels.ts`) を import しない — ストアの型と導出が UI の文言に依存しない (O-4 FR-018 (2))。
 */

/**
 * 一覧の行の状態の 9 値 (X-5 FR-009 / O-1)。run-state と生存フラグの組から `rowStatus` (`session-view.ts`) が決める。
 * 文言は `labels.ts` の `SESSION_ROW_STATUS_LABELS` (`Record<SessionRowStatus, string>` で網羅を型で検査する)。
 */
export const SESSION_ROW_STATUSES = [
  'launching',
  'ready',
  'running',
  'awaiting',
  'interrupted',
  'waiting',
  'ending',
  'failed',
  'ended'
] as const

export type SessionRowStatus = (typeof SESSION_ROW_STATUSES)[number]

/** 経過時間の表記の区分 (`session-view.ts` の `formatElapsed` が導き、`labels.ts` の `elapsedLabel` が訳す。O-1 FR-005 [ASSUMED])。 */
export type Elapsed =
  | { readonly unit: 'sec'; readonly sec: number }
  | { readonly unit: 'min'; readonly min: number }
  | { readonly unit: 'hourMin'; readonly hour: number; readonly min: number }

/** 承認カード表示用 (サニタイズ済み plain text。X-1 H-05)。 */
export interface PendingPermission {
  readonly requestId: string
  readonly toolName: string
  readonly input: string
  readonly scope: 'once' | 'capability'
  /** agents が付ける印。'ask-user-question' のときだけ承認カードに答える部品を出す (O-10 / AD-052)。 */
  readonly answerable?: 'ask-user-question'
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
  /**
   * MCP サーバーの問い (Elicitation) の待ち (届いた順。O-10 / data-model §4)。先頭の 1 枚を描き、残りの数を添える。
   * 入力の値は持たない (カードの component の state だけ)。
   */
  readonly elicitations: readonly ElicitationPrompt[]
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
  /**
   * このセッションを起動したときの起動元 (O-3 / 012 data-model §4「renderer の起動元」)。失敗したセッションを閉じたとき、
   * `config` と一緒に起動の状態の `lastOrigin` へ戻す (`lastConfig` と同じ規則)。計測にだけ使う。
   */
  readonly launchOrigin: LaunchOrigin
  /**
   * 会話の id を main が持っているか (X-9 / data-model §9.6)。`sessionResumable` の通知と再開の受け付けで立つ。
   * id の値は renderer に渡らない (真偽だけ)。
   */
  readonly resumable: boolean
  /** 再開した行のそれまでの会話の読み取りの状態 (再開の受け付けで `loading`。読み取りは FE-040)。再開した行でなければ null。 */
  readonly resumed: { readonly phase: 'loading' | 'loaded' | 'failed' } | null
  /** 成功したモデルの変更の値 (カタログの `id`。023 / data-model §8.1)。無ければ null (起動の `config.modelId` を出す)。 */
  readonly currentModelId: string | null
  /** main が返した名前 (023)。永続化しない。 */
  readonly name: string | null
  /** 結果を待っている実行中の設定の変更の種類 (023)。 */
  readonly changing: LiveSettingKind | null
  /** 直前の変更の失敗 (1 行の表示。次の変更の開始で消す。023)。 */
  readonly settingError: LiveSettingKind | null
  /** 既定の Provider のモデルの一覧の状態 (025 / data-model §6.3)。Provider のあるセッションでは使わない。 */
  readonly liveModels: LiveModelsState
}

/** 既定の Provider のモデルの一覧の状態 (025 / data-model §6.3)。永続化しない。 */
export type LiveModelsState =
  | { readonly phase: 'idle' }
  | { readonly phase: 'loading' }
  | {
      readonly phase: 'ready'
      readonly options: readonly LiveModelOption[]
      /** effort で絞る前の件数 (空の理由を分ける。data-model §3.2)。 */
      readonly reportedCount: number
    }
  | { readonly phase: 'failed'; readonly reason: LiveSettingFailure }

/** 監視ビューの情報密度 (O-1 / FR-008)。renderer の表示状態であり永続化しない。 */
export type Density = 'comfortable' | 'compact'

/** ターンの計量 (最新の `result` 由来。費用・ターン数・モデルごとの内訳・拒否の件数)。 */
export type TurnMeter = Extract<MeterUpdate, { readonly type: 'turn' }>

/** レート制限の最新の状態 (`rate_limit_event` 由来)。 */
export type RateLimitMeter = Extract<MeterUpdate, { readonly type: 'rate-limit' }>

/**
 * 稼働中のセッション 1 本の計量の最新の値 (O-4 / 014 data-model §2「renderer の保持」)。永続化しない。
 * 起動の設定・`lastConfig`・プリセットに書き戻さない (`permissionMode` を含む)。
 */
export interface SessionMeters {
  readonly lastTurn: TurnMeter | null
  /** コンテキストの使用量の推定 (主ループの最後の assistant の入力側のトークン)。 */
  readonly contextUsed: number | null
  readonly rateLimit: RateLimitMeter | null
  /** 今の権限モード (起動時と違うかは表示側が比べる)。 */
  readonly permissionMode: PermissionModeKey | null
  /** 思考のトークンの推定。主ループの assistant のメッセージと `turn` で null に戻る。 */
  readonly thinkingTokens: number | null
  /** tool の id → 経過時間 (秒)。`turn` で空。更新のたびにその id を末尾へ移し、上限を超えたら先頭 (更新の古いもの) から落とす。 */
  readonly toolElapsed: ReadonlyMap<string, number>
  /** Claude Code が報告した構成の最新の値 (`init-report`。O-5 / 015 data-model §2「renderer の保持」)。 */
  readonly initReport: InitReportMeter | null
  /** スラッシュコマンドの一覧の最新の値 (`commands`。説明と `argumentHint` はここから名前で引く)。 */
  readonly commands: CommandsMeter | null
  /** スラッシュコマンドの名前の集合の出所 (合流の規則。015 data-model §2)。どちらもまだ無ければ null。 */
  readonly slashCommandSource: 'init-report' | 'commands' | null
  /**
   * 今動いている背景の task の一覧 (`background-tasks`。O-11 / AD-056 Decision 2。最新の値で置き換える)。SDK は起動のとき何も emit
   * しないので、空の配列から始まる (0 件は空の配列)。セッションのプロセスの起動で空に戻る。永続化しない。
   */
  readonly backgroundTasks: readonly BackgroundTaskEntry[] | null
}

/** スラッシュコマンドの一覧の 1 行 (構成のタブが出す。`description` / `argumentHint` は `commands` に無ければ null)。 */
export interface SlashCommandEntry {
  /** 正規の名前 (先頭の `/` を外した形。表示は `/` を付ける)。 */
  readonly name: string
  readonly description: string | null
  readonly argumentHint: string | null
}

/**
 * `toolElapsed` に持つ tool の数の上限。agents の間引きの上限 (新しい鍵を捨てる) と向きが違う — renderer の Map には
 * 結果の届いた tool の値も `turn` まで残り、更新の古いものほど結果が届いている見込みが高い (014 data-model §2)。
 */
export const MAX_TOOL_ELAPSED_ENTRIES = 64

/** 計量がまだ届いていないセッションの値 (共有する。中身を書き換えない)。 */
export const EMPTY_SESSION_METERS: SessionMeters = {
  lastTurn: null,
  contextUsed: null,
  rateLimit: null,
  permissionMode: null,
  thinkingTokens: null,
  toolElapsed: new Map(),
  initReport: null,
  commands: null,
  slashCommandSource: null,
  backgroundTasks: []
}

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

/** 起動ダイアログが再開の形で開くときの状態 (X-9 / data-model §9.3)。 */
export interface ResumeDialogState {
  readonly source: ResumeSource
  /** 引き継ぐ 3 軸 (表示だけ)。 */
  readonly fixed: {
    readonly folderId: string
    readonly runtimeId: string
    readonly providerId: string | null
  }
  /** 選び直せる 3 軸の初期値。稼働中の行は元の起動設定の値、過去の行は null (ダイアログの既定)。 */
  readonly initial: Pick<SessionLaunchConfig, 'modelId' | 'effort' | 'permissionMode'> | null
  /** 初期値の組の起動元。稼働中の行はその行の `launchOrigin`、過去の行は `'manual'`。 */
  readonly initialOrigin: LaunchOrigin
  /** 稼働中の行から開いたときの元の行 (受け付けで `replace` する)。 */
  readonly replaces: string | null
}

/** 起動の拒否の理由 (再開の拒否を含む。X-9 §10)。 */
export type LaunchRejectReason =
  SessionLaunchRejectReason | ResumeUnavailableReason | 'conversation-running'

/** 起動ダイアログの状態 (直近の起動要求)。 */
export interface LaunchState {
  readonly phase: 'entry' | 'launching' | 'rejected'
  readonly rejectReason: LaunchRejectReason | null
  /** 再開の形で開くときの状態 (X-9)。null なら新規起動の形。 */
  readonly resume: ResumeDialogState | null
  /** 最後に起動を試みた設定 (失敗・拒否で戻ったときの復元。X-4 US-1 AC7)。 */
  readonly lastConfig: SessionLaunchConfig | null
  /**
   * `lastConfig` と組の起動元 (O-3 / 012 data-model §4「renderer の起動元」)。`lastConfig` と同じ規則で残す・戻す:
   * 起動の開始で入り、受け付けられても告知を消しても残り、失敗したセッションを閉じたらそのセッションの起動元に替わる。
   * 起動の初期値の片方で、起動の告知 (Launch notice) には含めない。
   */
  readonly lastOrigin: LaunchOrigin | null
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
  /**
   * 全セッションの受信メッセージの累計 (実機計測の観測点。会話由来の値を持たない。O-1 / FR-012)。
   * `meter` は数えない (O-4 / 014 data-model §2)。
   */
  readonly receivedMessages: number
  readonly density: Density
  /**
   * セッションごとの計量の最新の値 (O-4 / 014 data-model §2)。`sessions` とは別の枝 — 計量の更新で `sessions` の参照を
   * 変えず、表示中の Thread を描き直さない。`close()` で消す。
   */
  readonly meters: Readonly<Record<string, SessionMeters>>
}

/** セッション 1 本の送信待ちキュー (assistant-ui native queue + 積み込み検証)。 */
export interface SessionQueue {
  readonly controller: ReturnType<typeof createMessageQueue>
  readonly adapter: QueueAdapter
}
