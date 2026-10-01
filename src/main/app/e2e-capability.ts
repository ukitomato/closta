import { randomUUID } from 'node:crypto'

import { MessageChannelMain, type MessagePortMain } from 'electron'

import type { ProviderSummaryDTO } from '@domain/provider/dto'
import { fixedCapabilities } from '@domain/runtime/capabilities'
import type { WslRuntimeDescriptor } from '@domain/runtime/descriptor'
import type { RuntimeDescriptorDTO, RuntimeListDTO } from '@domain/runtime/dto'
import { wslNamespace } from '@domain/runtime/namespace'
import type { SessionControl, SessionEvent } from '@domain/session/agent-session'
import type { SessionIndexDTO } from '@domain/session/dto'
import { normalizePresetName } from '@domain/session/launch-config'
import type { PresetDTO } from '@domain/session/preset'
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

/** 合成ランタイム descriptor の共通部分 (IPC の `findRuntime` 照合用。`wsl.exe` を呼ばない)。 */
function descriptorBase(
  now: number
): Omit<WslRuntimeDescriptor, 'id' | 'distroName' | 'isDefault'> {
  return {
    kind: 'wsl',
    state: 'running',
    wslVersion: 2,
    pathMapping: null,
    capabilities: fixedCapabilities(now),
    detectedAt: now
  }
}

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
  // X-4 (SH-022): 依存解決の E2E 用に 2 つ目のランタイムと Windows フォルダを足す。
  // **既存 E2E は「1 番目のフォルダ / 1 番目のランタイム」を選ぶため、追加分は後ろに並べる。**
  const otherDistro = 'E2E-Debian'
  const otherRuntimeId = wslNamespace(otherDistro)
  const winFolderId = 'e2e-win-folder'

  const runtimeDtoFor = (
    id: typeof runtimeId,
    name: string,
    isDefault: boolean
  ): RuntimeDescriptorDTO => ({
    id,
    kind: 'wsl',
    distroName: name,
    wslVersion: 2,
    state: 'running',
    isDefault,
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
  })
  const fakeRuntimeDto = runtimeDtoFor(runtimeId, distro, true)
  const fakeRuntimes: RuntimeListDTO = {
    wslAvailability: 'available',
    runtimes: [fakeRuntimeDto, runtimeDtoFor(otherRuntimeId, otherDistro, false)],
    enumerationIssues: []
  }
  /** IPC の未信頼入力照合 (`findRuntime`) に使う descriptor。表示用の合成値で `wsl.exe` は呼ばない。 */
  const snapshot: WslRuntimeDescriptor[] = [
    { ...descriptorBase(now), id: runtimeId, distroName: distro, isDefault: true },
    { ...descriptorBase(now), id: otherRuntimeId, distroName: otherDistro, isDefault: false }
  ]

  // X-4: Provider (カタログ付き) と到達可能性の合成値。e2e-far は E2E-Debian からだけ到達できる。
  const bedrock: ProviderSummaryDTO = {
    id: 'e2e-bedrock',
    displayName: 'E2E Bedrock',
    backend: 'bedrock',
    source: 'aws-profile',
    modelCount: 2,
    models: [
      { id: 'e2e-sonnet', displayName: 'E2E Sonnet', supportedEffortLevels: ['low', 'high'] },
      { id: 'e2e-haiku', displayName: 'E2E Haiku' }
    ]
  }
  const far: ProviderSummaryDTO = {
    id: 'e2e-far',
    displayName: 'E2E Debian 専用',
    backend: 'anthropic',
    source: 'config-dir',
    modelCount: 0,
    models: []
  }

  // X-4: プリセットはメモリ内だけに持つ (永続化しない。E2E は production-inert)。
  // **削除済み Provider を参照するプリセットを 1 件 seed する** (pr-gate M-06 / US-2 AC2・AC3)。
  // `e2e-removed` は listProviders に無い = 登録後に削除された Provider を表す。
  const stalePreset: PresetDTO = {
    id: 'e2e-preset-stale',
    name: 'E2E 削除済み Provider',
    config: {
      folderId,
      runtimeId,
      providerId: 'e2e-removed',
      modelId: null,
      effort: null,
      permissionMode: 'default'
    },
    updatedAt: now - 1
  }
  let presets: PresetDTO[] = [stalePreset]
  let presetSeq = 0

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
  const fakeWinFolderDto: WorkspaceFolderDTO = {
    ...fakeFolderDto,
    id: winFolderId,
    location: { kind: 'windows' },
    path: { namespace: 'host', value: 'C:\\e2e\\project' },
    displayName: 'E2E Windows Project'
  }
  const fakeFolders: FolderListDTO = {
    folders: [fakeFolderDto, fakeWinFolderDto],
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
    snapshotRuntimes: () => snapshot,

    listFolders: async () => fakeFolders,
    beginBrowse: async () => ({ ok: false, error: 'unsupported-location' }),
    browseDirectory: async () => ({ ok: false, error: 'browse-session-expired' }),
    registerFolder: async () => ({ ok: false, reason: 'unknown-location', existing: null }),
    unregisterFolder: async () => ({ ok: false }),
    folderIds: () => [folderId, winFolderId],
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

    listProviders: async () => [bedrock, far],
    detectProviders: async () => [],
    registerProvider: async () => ({ ok: false, reason: 'invalid-record' }),
    updateProvider: async () => ({ ok: false, reason: 'not-found' }),
    removeProvider: async () => ({ ok: false }),
    listReachableProviders: async (id) =>
      id === otherRuntimeId
        ? { reachable: [bedrock, far], excluded: [] }
        : { reachable: [bedrock], excluded: [{ provider: far, reason: 'unreachable' }] },

    listPresets: async () => [...presets].sort((a, b) => b.updatedAt - a.updatedAt),
    savePreset: async (input) => {
      const name = normalizePresetName(input.name)
      const existing = presets.find((p) => p.name === name)
      if (existing !== undefined && !input.overwrite) return { ok: false, reason: 'name-conflict' }
      const preset: PresetDTO = {
        id: existing?.id ?? `e2e-preset-${(presetSeq += 1)}`,
        name,
        config: input.config,
        updatedAt: Date.now()
      }
      presets = [...presets.filter((p) => p.id !== preset.id), preset]
      return { ok: true, preset }
    },
    removePreset: async (id) => {
      const before = presets.length
      presets = presets.filter((p) => p.id !== id)
      return { ok: presets.length < before }
    },
    presetIds: async () => presets.map((p) => p.id),

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

    // pr-gate R1 M-03 / M-302: 退避 0 件。registerProvider は常に拒否なので述語は fail-closed で足りる。
    providerLoadIssues: async () => ({
      skippedOnLoad: 0,
      wholeFileUnreadable: false,
      storeNewerVersion: false
    }),
    extraEnvPredicates: { isForbiddenForwardKey: () => true, isDeniedEnvKey: () => true },

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
