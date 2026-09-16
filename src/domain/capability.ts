import type { RuntimeDescriptorDTO, RuntimeListDTO } from './runtime/dto'
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

  // --- 通知 (main → renderer) ---

  /** 購読解除は返る**トークン**で行う。renderer からコールバックを main に渡さない。 */
  onRuntimesChanged(listener: (list: RuntimeListDTO) => void): () => void
  onFoldersChanged(listener: (list: FolderListDTO) => void): () => void
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
  runtimesChanged: 'closta:runtimesChanged',
  foldersChanged: 'closta:foldersChanged'
} as const
