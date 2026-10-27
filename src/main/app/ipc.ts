import { ipcMain, type IpcMainInvokeEvent } from 'electron'

import {
  IPC_CHANNELS,
  type PastResumeDTO,
  type SessionResumeHandshakeDTO,
  type Win32ClaudePathResult
} from '@domain/capability'
import type {
  ProviderDraft,
  ProviderLoadIssuesDTO,
  ProviderPatch,
  ProviderSummaryDTO,
  ReachableProvidersDTO,
  RegisterProviderResult,
  UpdateProviderResult
} from '@domain/provider/dto'
import type { ExtraEnvPredicates } from '@domain/provider/forward-env'
import type { DetectedCandidate } from '@domain/provider/types'
import type { SessionControl, SessionLaunchHandshakeDTO } from '@domain/session/agent-session'
import type { SessionIndexDTO } from '@domain/session/dto'
import type { SafePermissionMode, SessionLaunchConfig } from '@domain/session/launch-config'
import type { LiveSettingResult, RenameResult } from '@domain/session/live-settings'
import type { LaunchOrigin, LaunchUsageSummaryDTO } from '@domain/session/launch-usage'
import type { PresetDTO, SavePresetResult } from '@domain/session/preset'
import type { SessionResumeRequest } from '@domain/session/resume'
import type { PastResumeAxes } from '@domain/session/resume-axes'
import type { RuntimeDescriptor } from '@domain/runtime/descriptor'
import type { RuntimeDescriptorDTO, RuntimeListDTO } from '@domain/runtime/dto'
import type { NamespaceId } from '@domain/runtime/namespace'
import type {
  BeginBrowseResult,
  BrowseDirectoryResult,
  FolderListDTO,
  FolderRuntimeResolutionDTO,
  RegisterFolderResult,
  WorkspaceFolderDraftDTO
} from '@domain/workspace/dto'
import type { Location } from '@domain/workspace/folder'

import type { TranscriptHandshakeDTO } from '@domain/session/transcript-dto'

import type { Measure } from './measure'
import type { SavePresetInput } from './preset-service'
import type { LaunchOutcome, ResumeOutcome } from './session-launch-service'
import {
  handleFetchMoreSessions,
  handleGetLaunchUsage,
  handleGetResumedTranscript,
  handleGetTranscript,
  handleResolvePastResume,
  handleResumeSession,
  handleEndSession,
  handleInterruptSession,
  handleSetSessionPermissionMode,
  handleSetSessionModel,
  handleRenameSession,
  handleKillSession,
  handleLaunchSession,
  handleListPresets,
  handleListSessions,
  handleRefreshSessions,
  handleRemovePreset,
  handleRespondElicitation,
  handleRespondPermission,
  handleSavePreset,
  handleSendPrompt
} from './session-ipc'
import type { TranscriptResult } from './transcript-service'
import {
  checkBeginBrowseLocation,
  checkFolderDraft,
  checkProviderDraft,
  checkProviderPatch,
  findRuntime,
  isKnownFolderId,
  isTrustedSender,
  toLocation
} from './validate'

/**
 * IPC ハンドラ (BE-009 / BE-028 / BE-046 / AD-023 のセキュリティ要件 5)。
 *
 * **送信元とペイロードをすべて未信頼として検証する。**
 * 送信元の検証は全メソッド共通の前置きであり、個々のハンドラに任せない —
 * 任せると 1 つ書き忘れた時点で穴になる。
 *
 * **検証は `validate.ts` に集約する。** ここに条件を書くと、
 * SC-018 が「検証表の各行」を対象にしているのに実装が 2 箇所へ散る。
 */

export type ProbeRuntimeResult = RuntimeDescriptorDTO | { readonly error: 'distro-not-running' }

export interface IpcDependencies {
  /** 検出済みランタイムの現在の一覧。未判定の descriptor を先に返す (SC-004)。 */
  listRuntimes(): Promise<RuntimeListDTO>
  /** 利用者の明示操作による再検出 (FR-010)。 */
  refreshRuntimes(): Promise<RuntimeListDTO>
  /** 単発の再判定。**毎回実行状態を取り直す** (SC-005)。 */
  probeRuntime(runtimeId: NamespaceId): Promise<ProbeRuntimeResult>
  /** 未信頼入力の照合に使う descriptor 集合。 */
  snapshotRuntimes(): readonly RuntimeDescriptor[]

  listFolders(): Promise<FolderListDTO>
  beginBrowse(location: Location, senderId: number): Promise<BeginBrowseResult>
  browseDirectory(token: unknown, target: unknown, senderId: number): Promise<BrowseDirectoryResult>
  registerFolder(draft: WorkspaceFolderDraftDTO): Promise<RegisterFolderResult>
  unregisterFolder(id: string): Promise<{ readonly ok: boolean }>
  /** 未信頼入力の照合に使う登録済み `id` の集合。 */
  folderIds(): readonly string[]
  resolveFolderRuntime(
    folderId: string,
    runtimeId: NamespaceId
  ): Promise<FolderRuntimeResolutionDTO | null>

  /** 所在 `windows` のネイティブフォルダピッカー。 */
  pickHostFolder(): Promise<WorkspaceFolderDraftDTO | null>

  /** Win32 の claude.exe の場所の指定 (ダイアログ → 検査 → 保存 → 再検出。X-8 contracts C-1)。 */
  pickWin32ClaudePath(): Promise<Win32ClaudePathResult>
  /** 指定の解除 (X-8 contracts C-2)。 */
  clearWin32ClaudePath(): Promise<Win32ClaudePathResult>

  /* ── セッション一覧 (R-2。**読み取り専用**) ── */

  listSessions(): Promise<SessionIndexDTO>
  refreshSessions(): Promise<SessionIndexDTO>
  fetchMoreSessions(targetKey: string, offset: number): Promise<SessionIndexDTO>
  /**
   * 未信頼入力の照合に使う `targetKey` の集合。
   *
   * **停止中の所在の `key` も含む** — 「既知の `key` + 停止中」という
   * SC-002 / SC-010 が検証したい経路を踏めるようにするためである。
   */
  sessionTargetKeys(): readonly string[]

  /* ── transcript (R-3。**読み取り専用**) ── */

  /** transcript 取得。**本文は port**、戻り値は本文を含まない handshake + transfer 用 port (AD-034)。 */
  getTranscript(
    sessionId: string,
    targetKey: string,
    requestToken: string
  ): Promise<TranscriptResult>

  /* ── セッション起動 + 制御 (X-1) ── */

  /** 起動を調停する (X-4: 検証済みの起動設定)。**本文は port**、戻り値は handshake + transfer 用 port (AD-036 §2)。 */
  launchSession(config: SessionLaunchConfig): Promise<LaunchOutcome>
  /** 制御を該当セッションへ送る。未知 / 終了済み sessionId なら `false`。 */
  controlSession(sessionId: string, control: SessionControl): boolean
  /** 実行中の権限モードの切り替え (023)。結果は `LiveSettingResult`。 */
  setSessionPermissionMode(sessionId: string, mode: SafePermissionMode): Promise<LiveSettingResult>
  setSessionModel(sessionId: string, modelId: string): Promise<LiveSettingResult>
  /** 実行中のセッションの改名 (023)。結果は `RenameResult` (成功なら trim した名前)。 */
  renameSession(sessionId: string, name: string): Promise<RenameResult>

  /* ── セッションの再開 (X-9 / contracts C-1〜C-3) ── */

  /** 過去の行の軸を決める (列挙のキャッシュだけを見る)。 */
  resolvePastResume(targetKey: string, conversationId: string): Promise<PastResumeAxes>
  /** 再開の要求を解いて起動する。**本文は port**、戻り値は handshake + transfer 用 port。 */
  resumeSession(request: SessionResumeRequest): Promise<ResumeOutcome>
  /** それまでの会話の読み取り。**本文は port** (`getTranscript` と同じ経路)。 */
  getResumedTranscript(sessionId: string, requestToken: string): Promise<TranscriptResult>

  /* ── プリセット (X-4) ── */

  listPresets(): Promise<readonly PresetDTO[]>
  savePreset(input: SavePresetInput): Promise<SavePresetResult>
  removePreset(id: string): Promise<{ readonly ok: boolean }>
  presetIds(): Promise<readonly string[]>

  /* ── 起動の利用記録 (O-3) ── */

  /** 受け付けた起動を 1 回数える (reject しない)。起動元の検証と呼ぶかの判定は `session-ipc.ts` の `handleLaunchSession`。 */
  recordLaunchUsage(origin: LaunchOrigin): Promise<void>
  getLaunchUsage(): Promise<LaunchUsageSummaryDTO>

  /* ── Provider (X-3) ── */

  listProviders(): Promise<readonly ProviderSummaryDTO[]>
  detectProviders(): Promise<readonly DetectedCandidate[]>
  registerProvider(draft: ProviderDraft): Promise<RegisterProviderResult>
  updateProvider(id: string, patch: ProviderPatch): Promise<UpdateProviderResult>
  removeProvider(id: string): Promise<{ readonly ok: boolean }>
  listReachableProviders(runtimeId: string): Promise<ReachableProvidersDTO>
  /** providers.json の読み込みで退避したレコードの件数 (X-4 pr-gate R1 M-03)。 */
  providerLoadIssues(): Promise<ProviderLoadIssuesDTO>
  /**
   * extraEnv の登録境界の述語 (転送禁止キー / 資格情報 denylist)。composition root が transport のキー集合から
   * 組んで注入する (validate が infra/runtime を直接 import しない。pr-gate R1 platform-boundary M-302)。
   */
  readonly extraEnvPredicates: ExtraEnvPredicates

  /** 計測関数。composition root が開発ビルド判定を解決して渡す (BE-030 / FR-038)。 */
  readonly measure: Measure
}

/**
 * 送信元検証で包んだハンドラを登録する。
 *
 * 送信元が信頼できない場合は**内容を持たない拒否を返す** — どのチャンネルが
 * 存在するかを教えない。応答を返さない形にすると renderer が待ち続ける。
 */
function handle(
  channel: string,
  handler: (event: IpcMainInvokeEvent, ...args: readonly unknown[]) => Promise<unknown>
): void {
  ipcMain.handle(channel, async (event, ...args: unknown[]) => {
    if (!isTrustedSender(event.senderFrame)) throw new Error('rejected')
    return handler(event, ...args)
  })
}

export function registerIpcHandlers(deps: IpcDependencies): void {
  /* ── ランタイム ─────────────────────────────────────────────────── */

  handle(IPC_CHANNELS.listRuntimes, async (): Promise<RuntimeListDTO> => deps.listRuntimes())

  handle(IPC_CHANNELS.refreshRuntimes, async (): Promise<RuntimeListDTO> => deps.refreshRuntimes())

  // 引数を受け取らない (renderer はパスを渡さない。X-8 contracts C-1 / C-2)。
  handle(IPC_CHANNELS.pickWin32ClaudePath, async (): Promise<Win32ClaudePathResult> =>
    deps.pickWin32ClaudePath()
  )

  handle(IPC_CHANNELS.clearWin32ClaudePath, async (): Promise<Win32ClaudePathResult> =>
    deps.clearWin32ClaudePath()
  )

  handle(IPC_CHANNELS.probeRuntime, async (_event, ...args): Promise<ProbeRuntimeResult> => {
    /*
     * **`runtimeId` は既知の descriptor の識別子に完全一致すること。**
     * 文字列をそのままプロセス起動の引数に渡さない。
     * 停止中の識別子で直接叩かれた場合も、`probeRuntime` の内側で実行状態を
     * 取り直してから拒否する (SC-005)。
     */
    const target = findRuntime(deps.snapshotRuntimes(), args[0])
    if (target === null) return { error: 'distro-not-running' }
    return deps.probeRuntime(target.id)
  })

  /* ── 作業フォルダ ───────────────────────────────────────────────── */

  handle(IPC_CHANNELS.listFolders, async (): Promise<FolderListDTO> => deps.listFolders())

  handle(IPC_CHANNELS.beginBrowse, async (event, ...args): Promise<BeginBrowseResult> => {
    // **所在 `windows` は常に拒否する** (host の入口はネイティブダイアログのみ)。
    const check = checkBeginBrowseLocation(deps.snapshotRuntimes(), args[0])
    if (!check.ok) {
      return {
        ok: false,
        error:
          check.reason === 'unsupported-location' ? 'unsupported-location' : 'distro-unreachable'
      }
    }
    // 検証を通った値だけを渡す。`location` の型復元も検証側の関数で行う。
    // **送信元 id を渡す。** トークンを発行元に束縛するため (contracts の `token` の行)。
    return deps.beginBrowse(toLocation(args[0] as never), event.sender.id)
  })

  handle(IPC_CHANNELS.browseDirectory, async (event, ...args): Promise<BrowseDirectoryResult> =>
    /*
     * トークンと移動先の検証はセッションの名前空間を要するため service 側で行う。
     * **`event` を捨てない。** 送信元 id が要る — トークンは発行元に束縛されている。
     */
    deps.browseDirectory(args[0], args[1], event.sender.id)
  )

  handle(IPC_CHANNELS.pickHostFolder, async (): Promise<WorkspaceFolderDraftDTO | null> =>
    deps.pickHostFolder()
  )

  handle(IPC_CHANNELS.registerFolder, async (_event, ...args): Promise<RegisterFolderResult> => {
    const check = checkFolderDraft(deps.snapshotRuntimes(), args[0])
    if (!check.ok) return { ok: false, reason: check.reason, existing: null }
    return deps.registerFolder(args[0] as WorkspaceFolderDraftDTO)
  })

  handle(IPC_CHANNELS.unregisterFolder, async (_event, ...args) => {
    // **既知の登録エントリに一致すること。** 任意の文字列で削除を試させない。
    if (!isKnownFolderId(deps.folderIds(), args[0])) return { ok: false }
    return deps.unregisterFolder(args[0])
  })

  /* ── セッション一覧 (R-2) ───────────────────────────────────────── */

  handle(IPC_CHANNELS.listSessions, async (): Promise<SessionIndexDTO> => handleListSessions(deps))

  handle(IPC_CHANNELS.refreshSessions, async (): Promise<SessionIndexDTO> =>
    handleRefreshSessions(deps)
  )

  /*
   * **本体は `session-ipc.ts` に置く** (BE-029)。
   * SC-010 は「main 側ハンドラを直接呼ぶ」ことを計測経路にしており、
   * `ipcMain` を import した本ファイルは Vitest の node 環境で読み込めない。
   */
  handle(IPC_CHANNELS.fetchMoreSessions, async (_event, ...args): Promise<SessionIndexDTO> =>
    handleFetchMoreSessions(deps, args)
  )

  /* ── transcript (R-3。**読み取り専用**) ─────────────────────────── */

  /*
   * **検証と service 呼び出しは `session-ipc.ts` (electron 非依存) が行う** (SC-010 と同型)。
   * ここに残すのは port の transfer だけである — `event.sender.postMessage` は electron を要する。
   *
   * **port2 を renderer へ transfer した後、main はその port に触れない** (AD-034 決定 1 /
   * Principle IX)。本文は取得プロセス↔renderer 直通で流れ、main は `JSON.parse` も
   * structured clone deserialize もしない。handshake (本文を含まない) だけを invoke の戻り値で返す。
   */
  handle(IPC_CHANNELS.getTranscript, async (event, ...args): Promise<TranscriptHandshakeDTO> => {
    const result = await handleGetTranscript(deps, args)
    if (result.port !== null) {
      event.sender.postMessage(
        IPC_CHANNELS.transcriptPort,
        { requestToken: result.handshake.requestToken },
        [result.port]
      )
    }
    return result.handshake
  })

  /* ── セッション起動 + ストリーミング (X-1) ─────────────────────── */

  /*
   * **port2 を renderer へ transfer した後、main はその port に触れない** (AD-036 §2 / Principle IX)。
   * 本文 (`SessionEvent`) は supervisor↔renderer 直通で流れ、main は `JSON.parse` も deserialize もしない。
   * handshake (本文を含まない) だけを invoke の戻り値で返す。検証と service 呼び出しは `session-ipc.ts`。
   */
  handle(IPC_CHANNELS.launchSession, async (event, ...args): Promise<SessionLaunchHandshakeDTO> => {
    const outcome = await handleLaunchSession(deps, args)
    if (outcome.status === 'launching') {
      event.sender.postMessage(IPC_CHANNELS.sessionPort, { sessionId: outcome.sessionId }, [
        outcome.port
      ])
      return { status: 'launching', sessionId: outcome.sessionId }
    }
    return { status: 'rejected', reasonKey: outcome.reason }
  })

  /* ── セッションの再開 (X-9 / AD-059) ──────────────────────────────── */

  handle(IPC_CHANNELS.resolvePastResume, async (_event, ...args): Promise<PastResumeDTO> =>
    handleResolvePastResume(deps, args)
  )

  // `launchSession` と同じ形: port の transfer だけここ、検証と service 呼び出しは `session-ipc.ts`。
  handle(IPC_CHANNELS.resumeSession, async (event, ...args): Promise<SessionResumeHandshakeDTO> => {
    const outcome = await handleResumeSession(deps, args)
    if (outcome.status === 'launching') {
      event.sender.postMessage(IPC_CHANNELS.sessionPort, { sessionId: outcome.sessionId }, [
        outcome.port
      ])
      return { status: 'launching', sessionId: outcome.sessionId }
    }
    if (outcome.status === 'already-running') {
      return { status: 'already-running', sessionId: outcome.sessionId }
    }
    return { status: 'rejected', reasonKey: outcome.reason }
  })

  // `getTranscript` と同じ port のチャネル (`transcriptPort`)。renderer は `requestToken` で照合する。
  handle(
    IPC_CHANNELS.getResumedTranscript,
    async (event, ...args): Promise<TranscriptHandshakeDTO> => {
      const result = await handleGetResumedTranscript(deps, args)
      if (result.port !== null) {
        event.sender.postMessage(
          IPC_CHANNELS.transcriptPort,
          { requestToken: result.handshake.requestToken },
          [result.port]
        )
      }
      return result.handshake
    }
  )

  handle(IPC_CHANNELS.sendPrompt, async (_event, ...args): Promise<void> =>
    handleSendPrompt(deps, args)
  )

  handle(IPC_CHANNELS.respondPermission, async (_event, ...args): Promise<void> =>
    handleRespondPermission(deps, args)
  )

  handle(IPC_CHANNELS.respondElicitation, async (_event, ...args): Promise<void> =>
    handleRespondElicitation(deps, args)
  )

  handle(IPC_CHANNELS.interruptSession, async (_event, ...args): Promise<void> =>
    handleInterruptSession(deps, args)
  )

  handle(
    IPC_CHANNELS.setSessionPermissionMode,
    async (_event, ...args): Promise<LiveSettingResult> =>
      handleSetSessionPermissionMode(deps, args)
  )

  handle(
    IPC_CHANNELS.setSessionModel,
    async (_event, ...args): Promise<LiveSettingResult> => handleSetSessionModel(deps, args)
  )

  handle(
    IPC_CHANNELS.renameSession,
    async (_event, ...args): Promise<RenameResult> => handleRenameSession(deps, args)
  )

  handle(IPC_CHANNELS.endSession, async (_event, ...args): Promise<void> =>
    handleEndSession(deps, args)
  )

  handle(IPC_CHANNELS.killSession, async (_event, ...args): Promise<void> =>
    handleKillSession(deps, args)
  )

  /* ── プリセット (X-4) ─────────────────────────────────────────────── */

  // 検証と service 呼び出しは `session-ipc.ts` (electron 非依存・Vitest で直接呼べる)。
  handle(IPC_CHANNELS.listPresets, async (): Promise<readonly PresetDTO[]> =>
    handleListPresets(deps)
  )

  handle(IPC_CHANNELS.savePreset, async (_event, ...args): Promise<SavePresetResult> =>
    handleSavePreset(deps, args)
  )

  handle(IPC_CHANNELS.removePreset, async (_event, ...args): Promise<{ readonly ok: boolean }> =>
    handleRemovePreset(deps, args)
  )

  /* ── 起動の利用記録 (O-3) ─────────────────────────────────────────── */

  // 引数を取らない。DTO への射影は `session-ipc.ts`。起動元の記録は launchSession の handler (`handleLaunchSession`) が行う。
  handle(IPC_CHANNELS.getLaunchUsage, async (): Promise<LaunchUsageSummaryDTO> =>
    handleGetLaunchUsage(deps)
  )

  /* ── Provider (X-3) ─────────────────────────────────────────────── */

  handle(IPC_CHANNELS.listProviders, async (): Promise<readonly ProviderSummaryDTO[]> =>
    deps.listProviders()
  )

  handle(IPC_CHANNELS.detectProviders, async (): Promise<readonly DetectedCandidate[]> =>
    deps.detectProviders()
  )

  handle(
    IPC_CHANNELS.registerProvider,
    async (_event, ...args): Promise<RegisterProviderResult> => {
      // **未信頼な draft の形を検証してから service へ渡す** (contracts C-1)。意味的検証は service。
      const check = checkProviderDraft(args[0], deps.extraEnvPredicates)
      if (!check.ok) return { ok: false, reason: check.reason }
      return deps.registerProvider(args[0] as ProviderDraft)
    }
  )

  handle(IPC_CHANNELS.updateProvider, async (_event, ...args): Promise<UpdateProviderResult> => {
    if (typeof args[0] !== 'string') return { ok: false, reason: 'not-found' }
    if (!checkProviderPatch(args[1], deps.extraEnvPredicates))
      return { ok: false, reason: 'invalid-record' }
    return deps.updateProvider(args[0], args[1] as ProviderPatch)
  })

  handle(
    IPC_CHANNELS.removeProvider,
    async (_event, ...args): Promise<{ readonly ok: boolean }> => {
      if (typeof args[0] !== 'string') return { ok: false }
      return deps.removeProvider(args[0])
    }
  )

  handle(
    IPC_CHANNELS.listReachableProviders,
    async (_event, ...args): Promise<ReachableProvidersDTO> => {
      // **既知の descriptor の識別子に完全一致すること。** 未知なら空 (到達可能 0 件)。
      const runtime = findRuntime(deps.snapshotRuntimes(), args[0])
      if (runtime === null) return { reachable: [], excluded: [] }
      return deps.listReachableProviders(runtime.id)
    }
  )

  handle(IPC_CHANNELS.providerLoadIssues, async (): Promise<ProviderLoadIssuesDTO> =>
    deps.providerLoadIssues()
  )

  /* ── 解決 ───────────────────────────────────────────────────────── */

  handle(
    IPC_CHANNELS.resolveFolderRuntime,
    async (_event, ...args): Promise<FolderRuntimeResolutionDTO | null> => {
      if (!isKnownFolderId(deps.folderIds(), args[0])) return null
      const runtime = findRuntime(deps.snapshotRuntimes(), args[1])
      if (runtime === null) return null
      return deps.resolveFolderRuntime(args[0], runtime.id)
    }
  )
}
