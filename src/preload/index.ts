import { contextBridge, ipcRenderer } from 'electron'

import {
  CAPABILITY_KEY,
  IPC_CHANNELS,
  TRANSCRIPT_PORT_MESSAGE,
  type ClostaCapability
} from '@domain/capability'
import type { RuntimeListDTO } from '@domain/runtime/dto'
import type { SessionIndexDTO } from '@domain/session/dto'
import type { FolderListDTO } from '@domain/workspace/dto'

/**
 * preload。**単一の capability だけを公開する** (FR-039 / AD-023 のセキュリティ要件 4)。
 *
 * 生の `ipcRenderer` を渡さない。渡すと renderer が任意のチャンネルを叩ける。
 *
 * **外部パッケージを import しない。** `sandbox: true` の preload では
 * 限られたモジュールしか `require` できず、`node_modules` の解決は失敗する
 * (scaffold 既定の `@electron-toolkit/preload` はこれで `module not found` になる)。
 * 型だけを `@domain` から取り、実行時依存は `electron` のみとする。
 */

function subscribe<T>(channel: string, listener: (payload: T) => void): () => void {
  const handler = (_event: unknown, payload: T): void => listener(payload)
  ipcRenderer.on(channel, handler)
  return () => {
    ipcRenderer.off(channel, handler)
  }
}

const capability: ClostaCapability = {
  listRuntimes: () => ipcRenderer.invoke(IPC_CHANNELS.listRuntimes),
  refreshRuntimes: () => ipcRenderer.invoke(IPC_CHANNELS.refreshRuntimes),
  probeRuntime: (runtimeId) => ipcRenderer.invoke(IPC_CHANNELS.probeRuntime, runtimeId),

  listFolders: () => ipcRenderer.invoke(IPC_CHANNELS.listFolders),
  beginBrowse: (location) => ipcRenderer.invoke(IPC_CHANNELS.beginBrowse, location),
  browseDirectory: (token, target) =>
    ipcRenderer.invoke(IPC_CHANNELS.browseDirectory, token, target),
  pickHostFolder: () => ipcRenderer.invoke(IPC_CHANNELS.pickHostFolder),
  registerFolder: (draft) => ipcRenderer.invoke(IPC_CHANNELS.registerFolder, draft),
  unregisterFolder: (id) => ipcRenderer.invoke(IPC_CHANNELS.unregisterFolder, id),

  resolveFolderRuntime: (folderId, runtimeId) =>
    ipcRenderer.invoke(IPC_CHANNELS.resolveFolderRuntime, folderId, runtimeId),

  listSessions: () => ipcRenderer.invoke(IPC_CHANNELS.listSessions),
  refreshSessions: () => ipcRenderer.invoke(IPC_CHANNELS.refreshSessions),
  fetchMoreSessions: (targetKey, offset) =>
    ipcRenderer.invoke(IPC_CHANNELS.fetchMoreSessions, targetKey, offset),

  getTranscript: (sessionId, targetKey, requestToken) =>
    ipcRenderer.invoke(IPC_CHANNELS.getTranscript, sessionId, targetKey, requestToken),

  onRuntimesChanged: (listener) =>
    subscribe<RuntimeListDTO>(IPC_CHANNELS.runtimesChanged, listener),
  onFoldersChanged: (listener) => subscribe<FolderListDTO>(IPC_CHANNELS.foldersChanged, listener),
  onSessionsChanged: (listener) =>
    subscribe<SessionIndexDTO>(IPC_CHANNELS.sessionsChanged, listener)
}

/*
 * **transcript の port を main world へ橋渡しする** (R-3 / AD-034)。
 *
 * `MessagePort` は contextBridge を越えられないため capability には載せられない。
 * main が `webContents.postMessage(transcriptPort, { requestToken }, [port2])` で送ってきた port を、
 * preload が `window.postMessage` で main world へ **transfer** する。renderer は `window` の message を
 * 購読し、`data.marker` がこの標識で `data.requestToken` が自分の要求と一致する port を受け取る。
 * **要求の発行は必ず `getTranscript` invoke を通る** (main の検証を経る)。この port は受信専用である。
 */
ipcRenderer.on(IPC_CHANNELS.transcriptPort, (event, payload: { requestToken: string }) => {
  window.postMessage(
    { marker: TRANSCRIPT_PORT_MESSAGE, requestToken: payload.requestToken },
    '*',
    event.ports
  )
})

if (process.contextIsolated) {
  contextBridge.exposeInMainWorld(CAPABILITY_KEY, capability)
} else {
  // `contextIsolation` は FR-039 で必須。到達したら設定が壊れている。
  throw new Error('contextIsolation must be enabled (FR-039)')
}
