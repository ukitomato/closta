import { ipcMain, type IpcMainInvokeEvent } from 'electron'

import { IPC_CHANNELS } from '@domain/capability'
import type { SessionIndexDTO } from '@domain/session/dto'
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
import {
  handleFetchMoreSessions,
  handleGetTranscript,
  handleListSessions,
  handleRefreshSessions
} from './session-ipc'
import type { TranscriptResult } from './transcript-service'
import {
  checkBeginBrowseLocation,
  checkFolderDraft,
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
