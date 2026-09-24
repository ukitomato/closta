import type { RuntimeDescriptorDTO, RuntimeListDTO } from './runtime/dto'
import type { SessionIndexDTO } from './session/dto'
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
   * **起動・改名・削除の経路は無い** (FR-002)。R-2 は読み取り専用である。
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

  // --- 通知 (main → renderer) ---

  /** 購読解除は返る**トークン**で行う。renderer からコールバックを main に渡さない。 */
  onRuntimesChanged(listener: (list: RuntimeListDTO) => void): () => void
  onFoldersChanged(listener: (list: FolderListDTO) => void): () => void
  onSessionsChanged(listener: (index: SessionIndexDTO) => void): () => void
}

/** `contextBridge.exposeInMainWorld` で公開する名前。 */
export const CAPABILITY_KEY = 'closta'

/** IPC のチャンネル名。main / preload の双方がここを参照する。 */
export const IPC_CHANNELS = {
  listRuntimes: 'closta:listRuntimes',
  refreshRuntimes: 'closta:refreshRuntimes',
  probeRuntime: 'closta:probeRuntime',
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
