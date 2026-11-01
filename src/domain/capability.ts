import type {
  ProviderDraft,
  ProviderLoadIssuesDTO,
  ProviderPatch,
  ProviderSummaryDTO,
  ReachableProvidersDTO,
  RegisterProviderResult,
  UpdateProviderResult
} from './provider/dto'
import type { DetectedCandidate } from './provider/types'
import type { RuntimeDescriptorDTO, RuntimeListDTO } from './runtime/dto'
import type { SessionLaunchHandshakeDTO, SessionLaunchRejectReason } from './session/agent-session'
import type { SessionIndexDTO } from './session/dto'
import type {
  PresetLaunchConfig,
  SelectablePermissionMode,
  SessionLaunchConfig
} from './session/launch-config'
import type { LiveModelsResult, LiveSettingResult, RenameResult } from './session/live-settings'
import type { LaunchOrigin, LaunchUsageSummaryDTO } from './session/launch-usage'
import type { PresetDTO, SavePresetResult } from './session/preset'
import type { ResumeUnavailableReason, SessionResumeRequest } from './session/resume'
import type { SessionStatusUpdate } from './session/status-update'
import type { TranscriptHandshakeDTO } from './session/transcript-dto'
import type {
  BeginBrowseResult,
  BrowseDirectoryResult,
  BrowseTargetDTO,
  FolderListDTO,
  FolderRuntimeResolutionDTO,
  LocationDTO,
  RegisterFolderResult,
  WorkspaceFolderDraftDTO
} from './workspace/dto'

/** Win32 の claude の場所の指定の結果 (X-8 / contracts C-1・C-2)。パスを持たない。 */
export type Win32ClaudePathResult =
  | { readonly status: 'updated'; readonly runtimes: readonly RuntimeDescriptorDTO[] }
  | { readonly status: 'cancelled' }
  | { readonly status: 'rejected'; readonly reason: 'not-exe' }
  | { readonly status: 'save-failed' }

/** 過去の行の再開の軸の解決の結果 (X-9 / contracts C-1)。3 つの不透明な id と理由のキーだけ (パスを持たない)。 */
export type PastResumeDTO =
  | {
      readonly ok: true
      readonly folderId: string
      readonly runtimeId: string
      readonly providerId: string | null
    }
  | { readonly ok: false; readonly reason: ResumeUnavailableReason }

/** `resumeSession` の handshake (X-9 / contracts C-2)。本文を含まない。 */
export type SessionResumeHandshakeDTO =
  | Extract<SessionLaunchHandshakeDTO, { readonly status: 'launching' }>
  | { readonly status: 'already-running'; readonly sessionId: string }
  | {
      readonly status: 'rejected'
      readonly reasonKey:
        SessionLaunchRejectReason | ResumeUnavailableReason | 'conversation-running'
    }

/**
 * preload が公開する**単一 capability** の形 (FR-039 / contracts/ipc-capability.md)。
 *
 * 生の `ipcRenderer` を渡さない。すべて非同期で、戻り値は plain object のみ。
 *
 * 型を `domain` に置くのは、preload (`app`) と renderer (`ui`) の双方が
 * ここから import する必要があるためである。preload に置いて renderer が import すると
 * `ui → app` になり AD-023 §7 の `app ↮ ui` に抵触する。
 */
export interface ClostaCapability {
  // --- ランタイム ---

  /** キャッシュを返す。未検出なら走査を開始し、capabilities 未判定の descriptor を先に返す。 */
  listRuntimes(): Promise<RuntimeListDTO>
  /** 再検出は**利用者の明示操作に限る** (FR-010)。実行状態を一括で 1 回だけ確認する。 */
  refreshRuntimes(): Promise<RuntimeListDTO>
  /**
   * 単発の再判定。main 側は毎回実行状態を取り直す。
   * 停止中なら**プロセスを起動せず** `distro-not-running` を返す。
   */
  probeRuntime(
    runtimeId: string
  ): Promise<RuntimeDescriptorDTO | { readonly error: 'distro-not-running' }>
  /**
   * Win32 の claude.exe の場所を利用者が選ぶ (X-8 / contracts C-1)。renderer はパスを渡さない
   * (ダイアログも検査も保存も main が行う)。保存したら再検出した一覧を返す。戻り値にパスを含めない。
   */
  pickWin32ClaudePath(): Promise<Win32ClaudePathResult>
  /** Win32 の claude.exe の場所の指定を解除して再検出する (X-8 / contracts C-2)。`cancelled` / `rejected` は返さない。 */
  clearWin32ClaudePath(): Promise<Win32ClaudePathResult>

  // --- 作業フォルダ ---

  listFolders(): Promise<FolderListDTO>
  /** **所在 `windows` は常に `unsupported-location` を返す** (host の入口はピッカーのみ)。 */
  beginBrowse(location: LocationDTO): Promise<BeginBrowseResult>
  browseDirectory(token: string, target: BrowseTargetDTO): Promise<BrowseDirectoryResult>
  /** 所在 `windows` 用のネイティブダイアログ。`app` レイヤに置く (FR-013 / FR-038)。 */
  pickHostFolder(): Promise<WorkspaceFolderDraftDTO | null>
  registerFolder(draft: WorkspaceFolderDraftDTO): Promise<RegisterFolderResult>
  unregisterFolder(id: string): Promise<{ readonly ok: boolean }>

  // --- 解決 ---

  resolveFolderRuntime(folderId: string, runtimeId: string): Promise<FolderRuntimeResolutionDTO>

  // --- セッション一覧 (R-2。**読み取り専用**) ---

  /**
   * キャッシュを返す。未取得なら**先頭ページ**を取る (FR-031 / R-06)。
   *
   * **起動と、過去の行の改名・削除の経路は無い** (FR-002)。R-2 は読み取り専用である。稼働中の行の改名は `renameSession` (023)。
   */
  listSessions(): Promise<SessionIndexDTO>
  /** 再取得は**利用者の明示操作に限る** (FR-033)。**置き換える** (FR-035)。 */
  refreshSessions(): Promise<SessionIndexDTO>
  /**
   * 続きを取る (FR-038)。
   *
   * `targetKey` は main が発行した**不透明な値**であり、
   * main 側は**既知の集合との完全一致**でのみ照合する。パスとして解釈しない。
   * 未知の値ではキャッシュをそのまま返す。
   */
  fetchMoreSessions(targetKey: string, offset: number): Promise<SessionIndexDTO>

  // --- transcript (R-3。**読み取り専用**) ---

  /**
   * 選んだセッションの過去 transcript の取得を開始する (R-3 / AD-034)。
   *
   * **本文は戻り値に含まれない。** 戻り値は handshake (status / requestToken) のみで、
   * 本文 (`TranscriptMessageDTO[]`) は **`MessageChannelMain` の port** で
   * 取得プロセス↔renderer 直通で届く (main を本文経路から外す。Principle IX)。
   * port は `window` メッセージ (`TRANSCRIPT_PORT_MESSAGE`) として renderer main world へ渡る —
   * MessagePort は contextBridge を越えられないため。renderer は `requestToken` で自分の port を照合する。
   *
   * `sessionId` は UUID 形式に一致すること (main が検証。path traversal 防止)。
   * `targetKey` は R-2 の一覧が発行した既知の値。`requestToken` は renderer が採番し stale 破棄に使う。
   */
  getTranscript(
    sessionId: string,
    targetKey: string,
    requestToken: string
  ): Promise<TranscriptHandshakeDTO>

  // --- セッション起動 + ストリーミング (X-1。**唯一の起動・制御経路**) ---

  /**
   * 検証済みの起動設定 (X-4: フォルダ / WSL ランタイム / Provider / モデル / effort / 権限モード) で
   * セッションを 1 本起動する (X-1 / X-5 / FR-001 / contracts C-1)。main が形を検証し、依存解決を再評価する。
   *
   * **戻り値は本文を含まない handshake (status / sessionId)。** 逐次応答 (`SessionEvent`) は
   * `MessageChannelMain` の port で **supervisor↔renderer 直通**に届く (main を本文経路から外す。Principle IX)。
   * port は `window` メッセージ (`SESSION_PORT_MESSAGE`) として renderer main world へ渡り、renderer は
   * `sessionId` で自分の port を照合する (MessagePort は contextBridge を越えられないため)。
   *
   * main が **VerifiedRunning + 所在 distro 一致 + 登録済み + 同時実行数の上限 (10)** を検証する。
   * 停止中 / 未確認 / 不一致 / 上限超過 (`session-limit`) / 終了処理中 (`shutting-down`) は `rejected` を
   * 理由キーつきで返す (SC-002 / X-5 SC-001)。X-1 の単一セッション不変 (`session-active`) は X-5 で廃止した。
   *
   * `origin` は起動元 (`preset` / `manual`。O-3 / 012 spec FR-009・FR-010) で、**計測にだけ使う**。main は厳密比較で
   * 検証し、欠けている・未知でも起動は通常どおり扱って記録だけを行わない。起動の可否・`config` に影響させない。
   */
  launchSession(
    config: SessionLaunchConfig,
    origin: LaunchOrigin,
    /** Auto の確認を承諾したか (026 / AD-066)。main は `=== true` だけを承諾とみなす。 */
    autoModeAcknowledged?: boolean
  ): Promise<SessionLaunchHandshakeDTO>
  /**
   * 過去の行の再開の軸を解く (X-9 / contracts C-1)。列挙のキャッシュだけを見る (列挙・`wsl.exe` を起こさない)。
   * 戻り値は 3 つの不透明な id か理由のキーだけ。外れた入力は `source-unknown`。
   */
  resolvePastResume(targetKey: string, conversationId: string): Promise<PastResumeDTO>
  /**
   * 会話を再開する (X-9 / contracts C-2)。引き継ぐ 3 軸は main が source から解いた値と照合する。
   * 受け付けたら `launchSession` と同じく port で本文が届く (`sessionId` で照合)。`origin` は計測にだけ使う。
   */
  resumeSession(
    request: SessionResumeRequest,
    origin: LaunchOrigin,
    autoModeAcknowledged?: boolean
  ): Promise<SessionResumeHandshakeDTO>
  /**
   * 再開した行のそれまでの会話の読み取りを開始する (X-9 / contracts C-3)。経路は `getTranscript` と同じ
   * (本文は port・`requestToken` で照合)。会話の id は renderer に渡らない。
   */
  getResumedTranscript(sessionId: string, requestToken: string): Promise<TranscriptHandshakeDTO>
  /** 稼働セッションへプロンプトを送る (FR-011 / FR-018)。main が空/空白拒否 + 長さ上限を検証する。 */
  sendPrompt(sessionId: string, text: string): Promise<void>
  /**
   * 承認カードの決定を返す (FR-012 / contracts C-1)。**唯一の承認経路。**
   * main が `outcome ∈ {allow,deny}` / `scope ∈ {once,capability}` を明示述語で検証する (`as` 禁止。H-04)。
   */
  respondPermission(
    sessionId: string,
    requestId: string,
    outcome: 'allow' | 'deny',
    scope: 'once' | 'capability',
    /** `AskUserQuestion` の問いの位置ごとの回答 (O-10 / AD-052。省略可)。main が `isPermissionAnswers` で検証する。 */
    answers?: readonly string[]
  ): Promise<void>
  /**
   * MCP サーバーの問い (Elicitation) への応答を返す (O-10 / AD-053 Decision 3。contracts C-1')。
   * main が UUID ×2・`action`・`accept` のときの `content` (省略可・0〜32 キー) を domain の述語で検証する
   * (外れたら制御を送らない。戻り値は `respondPermission` と同じく失敗を返さない)。`accept` でないとき `content` は捨てる。
   */
  respondElicitation(
    sessionId: string,
    requestId: string,
    action: 'accept' | 'decline' | 'cancel',
    content?: Readonly<Record<string, string | number | boolean>>
  ): Promise<void>
  /** 実行中の応答を中断する (FR-015)。途中出力は保持され同一セッションで継続できる。 */
  interruptSession(sessionId: string): Promise<void>
  /**
   * 穏当に終了する (X-5 / FR-011)。応答待ち (`done`) か中断済み (`interrupted`) のセッションの `claude` を、
   * プロンプトの入力を閉じて正常終了させる。他の状態ではセッションが何もしない。期限内に終わらなければ
   * 強制終了に落ち、本文に `end-forced` が流れる。
   */
  endSession(sessionId: string): Promise<void>
  /** 強制終了する (FR-016)。**中断とは別経路** — 途中出力保全・JSONL 非破損を保証しない。 */
  killSession(sessionId: string): Promise<void>
  /**
   * 実行中のセッションの権限モードを安全 3 値の中で切り替える (023 / AD-062 / contracts C-1)。
   * 値の検証・状態の判定は main が行う。成功のあとの表示は本文の port の `meter` で更新される。
   */
  setSessionPermissionMode(
    sessionId: string,
    mode: SelectablePermissionMode,
    autoModeAcknowledged?: boolean
  ): Promise<LiveSettingResult>
  /** 実行中のセッションのモデルをカタログの中で切り替える (023 / contracts C-2)。effort は変えない。 */
  setSessionModel(sessionId: string, modelId: string): Promise<LiveSettingResult>
  /**
   * 既定の Provider の実行中のセッションで、Claude Code が答えるモデルの一覧を聞く (025 / AD-065 / contracts C-7)。
   * 起動の effort で絞った後の値と、絞る前の件数 (`reportedCount`) を返す。
   */
  listSessionModels(sessionId: string): Promise<LiveModelsResult>
  /** 実行中のセッションに名前を付ける (023 / contracts C-3)。成功なら trim した名前を返す。 */
  renameSession(sessionId: string, name: string): Promise<RenameResult>

  // --- Provider (X-3) ---

  /** 登録済み Provider の一覧 (**秘密参照を含まない** summary。FR-001)。 */
  listProviders(): Promise<readonly ProviderSummaryDTO[]>
  /** 認証の痕跡を検出候補として提示する (**自動登録しない**・env 値を運ばない。FR-002 / SC-001 / H-10)。 */
  detectProviders(): Promise<readonly DetectedCandidate[]>
  /**
   * Provider を登録する (FR-001)。`api-key` / `oauth-token` の平文秘密は main が `safeStorage` に seal し
   * 参照値のみ保持する。失敗は理由キーのみ (payload/秘密を返さない。contracts C-3)。
   */
  registerProvider(draft: ProviderDraft): Promise<RegisterProviderResult>
  /** Provider を編集する (表示名/モデル/extraEnv のみ。認証方式は再登録の領分。US-4)。 */
  updateProvider(id: string, patch: ProviderPatch): Promise<UpdateProviderResult>
  /** Provider を削除する (紐づく秘密参照も解放。FR-001)。未知 id は `{ ok: false }`。 */
  removeProvider(id: string): Promise<{ readonly ok: boolean }>
  /** 選んだランタイムから**到達できる Provider だけ**を返す (除外は理由キー付き。FR-012 / SC-004)。 */
  listReachableProviders(runtimeId: string): Promise<ReachableProvidersDTO>
  /** providers.json の読み込みで退避したレコードの**件数だけ** (名前・値・パスを運ばない。X-4 pr-gate R1 M-03)。 */
  providerLoadIssues(): Promise<ProviderLoadIssuesDTO>

  // --- プリセット (X-4) ---

  /** 保存済みプリセットの一覧 (更新日時の降順。資格情報を含まない。FR-009 / FR-010)。 */
  listPresets(): Promise<readonly PresetDTO[]>
  /**
   * プリセットを保存する (FR-009)。同名があれば `overwrite: true` のときだけ上書きする
   * (renderer が利用者の確認を取ったあと)。上限超過は `limit-reached`。
   */
  savePreset(
    name: string,
    config: PresetLaunchConfig,
    overwrite: boolean
  ): Promise<SavePresetResult>
  /** プリセットを削除する。未知 id は `{ ok: false }`。 */
  removePreset(id: string): Promise<{ readonly ok: boolean }>

  // --- 起動の利用記録 (O-3) ---

  /**
   * 直近 30 日のプリセット / 手動の起動の回数 (O-3 / 012 spec FR-013)。**引数を取らない。**
   * 返すのは集計済みの 2 つの回数と集計の日数、または `unreadable` だけで、日ごとの記録を渡さない。
   */
  getLaunchUsage(): Promise<LaunchUsageSummaryDTO>

  // --- 通知 (main → renderer) ---

  /** 購読解除は返る**トークン**で行う。renderer からコールバックを main に渡さない。 */
  onRuntimesChanged(listener: (list: RuntimeListDTO) => void): () => void
  onFoldersChanged(listener: (list: FolderListDTO) => void): () => void
  onSessionsChanged(listener: (index: SessionIndexDTO) => void): () => void
  /**
   * 稼働中セッションの状態通知 (X-5 / FR-004)。supervisor の窓 (100ms) でまとめたものが 1 回で届く。
   * 会話由来の文字列を含まない (sessionId / run-state / 理由キー / `claude` の生存フラグだけ)。
   */
  onSessionStatus(listener: (updates: readonly SessionStatusUpdate[]) => void): () => void
  /**
   * 稼働中の行が会話の id を初めて持った通知 (X-9 / contracts C-4)。値は Closta の `sessionId` の列だけ
   * (会話の id を含まない)。
   */
  onSessionResumable(listener: (sessionIds: readonly string[]) => void): () => void
}

/** `contextBridge.exposeInMainWorld` で公開する名前。 */
export const CAPABILITY_KEY = 'closta'

/** IPC のチャンネル名。main / preload の双方がここを参照する。 */
export const IPC_CHANNELS = {
  listRuntimes: 'closta:listRuntimes',
  refreshRuntimes: 'closta:refreshRuntimes',
  probeRuntime: 'closta:probeRuntime',
  /** Win32 の claude.exe の場所の指定・解除 (X-8 / AD-058。contracts C-1 / C-2)。 */
  pickWin32ClaudePath: 'closta:pickWin32ClaudePath',
  clearWin32ClaudePath: 'closta:clearWin32ClaudePath',
  listFolders: 'closta:listFolders',
  beginBrowse: 'closta:beginBrowse',
  browseDirectory: 'closta:browseDirectory',
  pickHostFolder: 'closta:pickHostFolder',
  registerFolder: 'closta:registerFolder',
  unregisterFolder: 'closta:unregisterFolder',
  resolveFolderRuntime: 'closta:resolveFolderRuntime',
  listSessions: 'closta:listSessions',
  refreshSessions: 'closta:refreshSessions',
  fetchMoreSessions: 'closta:fetchMoreSessions',
  getTranscript: 'closta:getTranscript',
  /** main → preload: 取得プロセスに繋がった port2 を transfer する専用チャネル (R-3 / AD-034)。 */
  transcriptPort: 'closta:transcriptPort',
  launchSession: 'closta:launchSession',
  /** 再開 (X-9 / AD-059。contracts C-1〜C-4)。 */
  resolvePastResume: 'closta:resolvePastResume',
  resumeSession: 'closta:resumeSession',
  getResumedTranscript: 'closta:getResumedTranscript',
  sendPrompt: 'closta:sendPrompt',
  respondPermission: 'closta:respondPermission',
  /** Elicitation (MCP サーバーの問い) への応答 (O-10 / AD-053 Decision 3)。URL を開くチャネルは作らない。 */
  respondElicitation: 'closta:respondElicitation',
  interruptSession: 'closta:interruptSession',
  endSession: 'closta:endSession',
  killSession: 'closta:killSession',
  /** 実行中の設定の変更 (023 / AD-062。contracts C-1〜C-3)。 */
  setSessionPermissionMode: 'closta:setSessionPermissionMode',
  setSessionModel: 'closta:setSessionModel',
  /** 既定の Provider のモデルの一覧 (025 / AD-065 / contracts C-7)。 */
  listSessionModels: 'closta:listSessionModels',
  renameSession: 'closta:renameSession',
  /** main → preload: supervisor に繋がった port2 を transfer する専用チャネル (X-1 / AD-036 §2)。 */
  sessionPort: 'closta:sessionPort',
  /** main → renderer: 状態通知のバッチ (X-5 / FR-004)。 */
  sessionStatus: 'closta:sessionStatus',
  /** main → renderer: 稼働中の行が会話の id を持った通知 (X-9 / contracts C-4)。値は Closta の sessionId だけ。 */
  sessionResumable: 'closta:sessionResumable',
  listProviders: 'closta:listProviders',
  detectProviders: 'closta:detectProviders',
  registerProvider: 'closta:registerProvider',
  updateProvider: 'closta:updateProvider',
  removeProvider: 'closta:removeProvider',
  listReachableProviders: 'closta:listReachableProviders',
  providerLoadIssues: 'closta:providerLoadIssues',
  listPresets: 'closta:listPresets',
  savePreset: 'closta:savePreset',
  removePreset: 'closta:removePreset',
  /** 起動の利用記録の集計の読み出し (O-3 / 012 spec FR-013。本 feature で足す唯一のチャネル。SC-006)。 */
  getLaunchUsage: 'closta:getLaunchUsage',
  runtimesChanged: 'closta:runtimesChanged',
  foldersChanged: 'closta:foldersChanged',
  sessionsChanged: 'closta:sessionsChanged'
} as const

/**
 * preload → renderer main world の `window` メッセージの標識 (R-3 / AD-034)。
 *
 * **MessagePort は contextBridge を越えられない**ため、preload が `window.postMessage` で
 * port を main world へ渡す。renderer は `window` の `message` を購読し、`data.marker` が
 * これに一致する message の `ports[0]` を、`data.requestToken` で自分の要求と照合して受け取る。
 */
export const TRANSCRIPT_PORT_MESSAGE = 'closta:transcript-port' as const

/**
 * preload → renderer main world の `window` メッセージの標識 (X-1 / AD-036 §2)。
 *
 * `TRANSCRIPT_PORT_MESSAGE` と同じ理由 (MessagePort は contextBridge を越えられない)。
 * renderer は `data.marker` がこれに一致する message の `ports[0]` を、`data.sessionId` で
 * 自分の起動要求と照合して受け取る (一方向 data plane。inbound は受けない)。
 */
export const SESSION_PORT_MESSAGE = 'closta:session-port' as const
