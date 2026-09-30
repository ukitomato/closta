import { randomUUID } from 'node:crypto'

import { MessageChannelMain, type MessagePortMain } from 'electron'

import type { RuntimeDescriptorDTO, RuntimeListDTO } from '@domain/runtime/dto'
import { wslNamespace } from '@domain/runtime/namespace'
import type { SessionControl, SessionEvent } from '@domain/session/agent-session'
import type { SessionIndexDTO } from '@domain/session/dto'
import type { TranscriptMessageDTO } from '@domain/session/transcript-dto'
import type { FolderListDTO, WorkspaceFolderDTO } from '@domain/workspace/dto'

import type { IpcDependencies, ProbeRuntimeResult } from './ipc'
import { noMeasure } from './measure'
import type { LaunchOutcome } from './session-launch-service'

/**
 * **E2E capability stub (X-2 / AD-038 D3 / T030。production-inert)。**
 *
 * Principle VIII の Automated 2 項目 (IME E2E / 日本語スクリーンショット比較) を **real な Claude 認証・WSL・
 * 外部 API・秘密なしに** 走らせるため、有効 composer (active phase・`isDisabled: false`) へ到達させる最小の fake。
 *
 * | 規則 | 根拠 |
 * |---|---|
 * | **`!app.isPackaged && process.env.CLOSTA_E2E === '1'` のときだけ配線する。** 呼び出しは `src/main/index.ts` の 1 分岐のみ | AD-038 D3 / origins.ts E-H004 (env 単独ゲート禁止) |
 * | **単一 capability 境界を保つ** — preload も `window.closta` も本番と同一。ここは `IpcDependencies` を差し替えるだけで、第 2 の exposeInMainWorld を作らない | FR-039 |
 * | **プロセスを起こさない** — `utilityProcess` / `fork` / `spawn` を使わず `MessageChannelMain` の port1 を main に保持して合成 `SessionEvent` を流す。したがって `PROCESS_SPAWN_MODULES` (check.mjs #7) に載らない | Principle VI / AD-038 D3 |
 * | **会話本文・資格情報を運ばない** — 合成テキストのみを生成する (real の agents↔renderer 直通データ経路は不変。本番では本コードに到達しない) | Principle V / Principle IX |
 * | **WSL を名指さない** — fake の distro 名は表示用の合成値であり `wsl.exe` を呼ばない | Principle VI |
 */

/** fake の値の生成時刻。DTO の `detectedAt` / `registeredAt` に使う。 */
function emptySessionIndex(fetchedAt: number): SessionIndexDTO {
  return { groups: [], outcomes: [], fetchedAt, complete: true }
}

/** 合成の起動プロセス 1 つ分。real の `SessionSpawn` を模すが fork せず port を main に保持する。 */
interface StubSpawn {
  readonly sessionId: string
  readonly port: MessagePortMain
  /** control plane の要求を合成 stream に反映する。 */
  handle(control: SessionControl): void
  /** port を閉じ registry から外す。 */
  close(): void
}

function createStubSpawn(onEnd: (sessionId: string) => void): StubSpawn {
  const sessionId = randomUUID()
  const channel = new MessageChannelMain()
  const port1 = channel.port1
  port1.start()

  let ended = false
  let seq = 0
  const emit = (event: SessionEvent): void => {
    if (!ended) port1.postMessage(event)
  }
  const assistantMessage = (text: string): TranscriptMessageDTO => ({
    id: `e2e-assistant-${(seq += 1)}`,
    role: 'assistant',
    parts: [{ type: 'text', text }],
    createdAt: Date.now()
  })

  const close = (): void => {
    if (ended) return
    ended = true
    port1.close()
    onEnd(sessionId)
  }

  return {
    sessionId,
    port: channel.port2,
    handle(control: SessionControl): void {
      if (ended) return
      switch (control.kind) {
        case 'send-prompt':
          // turn を in-flight にして (running) 暫く保ち、合成応答 1 通で完了する。
          // running を挟むことで IME E2E の「running + queue 有効」分岐 (AD-037 §4) を踏める。
          emit({ kind: 'state', state: 'running' })
          setTimeout(() => {
            emit({ kind: 'message', message: assistantMessage('（E2E stub）受け取りました。') })
            emit({ kind: 'state', state: 'done' })
          }, 1200)
          break
        case 'respond-permission':
          emit({ kind: 'state', state: 'running' })
          break
        case 'interrupt':
          emit({ kind: 'interrupt-receipt', stillQueued: [], cancelled: [] })
          emit({ kind: 'state', state: 'interrupted' })
          break
        case 'kill':
          close()
          break
      }
    },
    close
  }
}

export interface E2eCapability {
  readonly ipc: IpcDependencies
  /** アプリ終了時に in-flight を片付ける。real の `Composition.dispose` と同型で 0 を返す。 */
  dispose(): number
}

/**
 * E2E 用の fake `IpcDependencies` を組む。real の `createComposition` の代わりに `index.ts` の
 * E2E 分岐が渡す。folder/runtime は canned な DTO、launch は合成 stream (port2 を transfer)。
 */
export function createE2eCapability(): E2eCapability {
  const now = Date.now()
  const distro = 'E2E-Ubuntu'
  const runtimeId = wslNamespace(distro)
  const folderId = 'e2e-folder'

  const fakeRuntimeDto: RuntimeDescriptorDTO = {
    id: runtimeId,
    kind: 'wsl',
    distroName: distro,
    wslVersion: 2,
    state: 'running',
    isDefault: true,
    capabilities: {
      probeState: 'done',
      sandboxKind: 'none',
      seccompStatus: 'unknown',
      missingDependencies: [],
      probedAt: now,
      autoModeAllowed: false,
      autoModeStatus: 'unavailable'
    },
    hasPathMapping: false,
    detectedAt: now
  }
  const fakeRuntimes: RuntimeListDTO = {
    wslAvailability: 'available',
    runtimes: [fakeRuntimeDto],
    enumerationIssues: []
  }

  const fakeFolderDto: WorkspaceFolderDTO = {
    id: folderId,
    location: { kind: 'wsl', distroName: distro },
    path: { namespace: runtimeId, value: '/home/e2e/project' },
    displayName: 'E2E Project',
    reachability: 'reachable',
    unreachableReason: null,
    blockedReason: null,
    resolutionSteps: [],
    registeredAt: now
  }
  const fakeFolders: FolderListDTO = {
    folders: [fakeFolderDto],
    restoreIssues: { skipped: 0, reasonKeys: [], backupPath: null }
  }

  /** sessionId → 生存中の合成プロセス。**空でない = 単一セッション占有** (real の launch-service と同型)。 */
  const active = new Map<string, StubSpawn>()
  const remove = (sessionId: string): void => {
    active.delete(sessionId)
  }

  const ipc: IpcDependencies = {
    listRuntimes: async () => fakeRuntimes,
    refreshRuntimes: async () => fakeRuntimes,
    probeRuntime: async (): Promise<ProbeRuntimeResult> => fakeRuntimeDto,
    snapshotRuntimes: () => [],

    listFolders: async () => fakeFolders,
    beginBrowse: async () => ({ ok: false, error: 'unsupported-location' }),
    browseDirectory: async () => ({ ok: false, error: 'browse-session-expired' }),
    registerFolder: async () => ({ ok: false, reason: 'unknown-location', existing: null }),
    unregisterFolder: async () => ({ ok: false }),
    folderIds: () => [folderId],
    resolveFolderRuntime: async () => null,
    pickHostFolder: async () => null,

    listSessions: async () => emptySessionIndex(Date.now()),
    refreshSessions: async () => emptySessionIndex(Date.now()),
    fetchMoreSessions: async () => emptySessionIndex(Date.now()),
    sessionTargetKeys: () => [],
    getTranscript: async (_sessionId, _targetKey, requestToken) => ({
      handshake: { status: 'empty', requestToken },
      port: null
    }),

    listProviders: async () => [],
    detectProviders: async () => [],
    registerProvider: async () => ({ ok: false, reason: 'invalid-record' }),
    updateProvider: async () => ({ ok: false, reason: 'not-found' }),
    removeProvider: async () => ({ ok: false }),
    listReachableProviders: async () => ({ reachable: [], excluded: [] }),

    launchSession: async (): Promise<LaunchOutcome> => {
      // 単一セッション不変 (real の launch-service と同じ)。
      if (active.size > 0) return { status: 'rejected', reason: 'session-active' }
      const spawn = createStubSpawn(remove)
      active.set(spawn.sessionId, spawn)
      return { status: 'launching', sessionId: spawn.sessionId, port: spawn.port }
    },
    controlSession: (sessionId, control) => {
      const spawn = active.get(sessionId)
      if (spawn === undefined) return false
      spawn.handle(control)
      return true
    },

    measure: noMeasure
  }

  return {
    ipc,
    dispose(): number {
      for (const spawn of [...active.values()]) spawn.close()
      active.clear()
      return 0
    }
  }
}
