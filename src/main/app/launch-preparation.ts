import { sdkModelOf } from '@domain/provider/model-catalog'
import type { DerivedLaunchEnv } from '@domain/provider/types'
import type {
  RuntimeDescriptor,
  Win32RuntimeDescriptor,
  WslRuntimeDescriptor
} from '@domain/runtime/descriptor'
import type { WslNamespaceId } from '@domain/runtime/namespace'
import { makeHostPath, type HostPath } from '@domain/runtime/path-types'
import type { VerifiedRunning } from '@domain/runtime/verified-running'
import type {
  LaunchInput,
  LaunchQueryOptions,
  Win32LaunchSpec,
  WslLaunchSpec
} from '@domain/session/agent-session'
import type { SessionLaunchConfig } from '@domain/session/launch-config'
import { evaluateLaunch } from '@domain/session/launch-gate'
import {
  resolveLaunchAxes,
  toLaunchDraft,
  type FolderFact,
  type ProviderFact
} from '@domain/session/launch-resolution'
import { isWslFolder, type WorkspaceFolder } from '@domain/workspace/folder'
import { resolveFolderRuntime } from '@domain/workspace/resolution'

import type { LaunchPreparation } from './session-launch-service'

/**
 * X-4 の**起動前段** (FR-005 / FR-006 / FR-013 / [AD-041](../../../docs/decisions/0041-x4-launch-config-on-x1-launch-gate.md))。
 *
 * **I/O を注入で受ける** (composition が実体を渡す)。Electron を立てずに単体で測れる形にする
 * (design-gate R1 arch M-006 / SC-002 の「main 起動ゲートの単体」/ SC-007 の「fork env に導出キーが 0」)。
 *
 * | 段 | 規則 |
 * |---|---|
 * | 1. 依存解決の再評価 | renderer と同じ `resolveLaunchAxes` を main の facts で呼ぶ。blocker → `invalid-config` (`runtime-stopped` だけは `distro-not-running`)。Provider の reset → `needs-confirmation` (黙って既定で起動しない)。ただし、キャッシュ上のランタイムが stopped で、reset の理由が `provider-unreachable` のときは `distro-not-running` を返す (pr-gate R2 platform-boundary L-401)。model / effort の reset → `invalid-config` |
 * | 2. 起動ゲート | X-1 の `evaluateLaunch` (VerifiedRunning / 期限 / 所在 distro 一致) |
 * | 3. env 導出 | Provider あり → `deriveEnv` (null / throw → `provider-unavailable`)。既定 → curated base のみ |
 * | 4. env 合成 | `composeLaunchEnv` (WSLENV = forwardKeys + `/u`)。規則違反 → `invalid-config`。`buildRuntimeLaunchSpec` の throw → `launch-failed` |
 * | 5. fork env | **ここでは持たない** — supervisor の fork env はランタイムに依存しない curated base で、接続の構築時に注入する (`createSupervisorConnection(forkEnv)`。導出 env を utilityProcess に入れない。AD-041 (e) 6 / AD-043 Decision 7) |
 */

export interface LaunchPreparationDeps {
  readonly folders: () => readonly WorkspaceFolder[]
  readonly runtimes: () => readonly RuntimeDescriptor[]
  /** 起動時点で実行中確認を取り直す (X-1 の R-1 判定を再利用)。 */
  readonly verifyRunning: (runtimeId: WslNamespaceId) => Promise<VerifiedRunning | null>
  /** 選択ランタイムから見た Provider の事実 (到達可能性とカタログ)。 */
  readonly providerFacts: (runtimeId: string) => Promise<readonly ProviderFact[]>
  /** Provider の env 導出。到達不可 / 規則違反は null。 */
  readonly deriveEnv: (providerId: string, runtimeId: string) => Promise<DerivedLaunchEnv | null>
  /** curated base (`buildLaunchEnv(process.env)`)。wsl.exe 解決と env 合成に使う (fork env は接続の構築時に注入する。AD-043 Decision 7)。 */
  readonly baseEnv: () => Record<string, string>
  /** 作業フォルダを runtime 名前空間の cwd にする (Principle I)。 */
  readonly resolveCwd: (folder: WorkspaceFolder, runtime: WslRuntimeDescriptor) => string | null
  /** `composeLaunchEnv` (規則違反は throw)。 */
  readonly composeLaunchEnv: (
    baseEnv: Record<string, string>,
    derived: Pick<DerivedLaunchEnv, 'env' | 'forwardKeys'>
  ) => Record<string, string>
  readonly buildRuntimeLaunchSpec: (params: {
    readonly distroName: string
    readonly cwd: string
    readonly claudePath: string
    readonly baseEnv: Record<string, string>
    readonly launchEnv: Record<string, string>
  }) => WslLaunchSpec
  /** Win32 の起動 env のもとになる許可リストの env (`buildWin32LaunchEnv(process.env)`。X-8 / data-model §6)。 */
  readonly win32BaseEnv: () => Record<string, string>
  /** `composeWin32LaunchEnv` (規則違反は throw)。 */
  readonly composeWin32LaunchEnv: (
    baseEnv: Record<string, string>,
    derived: Pick<DerivedLaunchEnv, 'env' | 'forwardKeys'>
  ) => Record<string, string>
  /** `buildWin32LaunchSpec` (満たさなければ throw)。 */
  readonly buildWin32LaunchSpec: (params: {
    readonly cwd: string
    readonly claudePath: string
    readonly baseEnv: Record<string, string>
    readonly launchEnv: Record<string, string>
  }) => Win32LaunchSpec
  /** 起動の時点で claude の実行ファイルが在るか (検出の後に変わった場合の防御)。 */
  readonly win32ClaudeIsFile: (path: HostPath) => Promise<boolean>
  readonly now: () => number
  /** 拒否理由キーを 1 行記録する (値は渡さない。Principle V / CWE-532)。 */
  readonly logRejection: (reasonKey: string) => void
}

function folderFact(folder: WorkspaceFolder): FolderFact {
  return { id: folder.id, distroName: isWslFolder(folder) ? folder.location.distroName : null }
}

export function createPrepareLaunch(
  deps: LaunchPreparationDeps
): (config: SessionLaunchConfig) => Promise<LaunchPreparation> {
  type Rejected = Extract<LaunchPreparation, { ok: false }>
  const reject = (reason: Rejected['reason']): Rejected => {
    deps.logRejection(reason)
    return { ok: false, reason }
  }

  /**
   * Win32Runtime の起動前段 (X-8 / data-model §7)。WSL の段とは別の関数 (WSL の段の本体に触れない)。
   * `VerifiedRunning` を使わない (ホストは常に実行中)。
   */
  const prepareWin32 = async (
    config: SessionLaunchConfig,
    folder: WorkspaceFolder,
    win32: Win32RuntimeDescriptor,
    folders: readonly WorkspaceFolder[]
  ): Promise<LaunchPreparation> => {
    // 1. 依存解決の再評価 (ホストの facts。停止中の分岐は無い)。
    const providers = await deps.providerFacts(win32.id)
    const resolution = resolveLaunchAxes(toLaunchDraft(config), {
      folders: folders.map(folderFact),
      runtimes: [{ id: win32.id, distroName: null, running: true }],
      providers
    })
    if (resolution.blockers.length > 0) return reject('invalid-config')
    if (resolution.resets.some((r) => r.requiresConfirmation)) return reject('needs-confirmation')
    if (resolution.resets.length > 0) return reject('invalid-config')

    // 2. 作業フォルダとランタイム。所在 WSL は U-3 でここに落ちる (到達不可)。
    const resolved = resolveFolderRuntime({ folder, runtime: win32 })
    if (
      resolved.reachability !== 'reachable' ||
      resolved.runtimePath === null ||
      resolved.runtimePath.namespace !== 'host'
    ) {
      return reject('invalid-config')
    }
    const cwd = resolved.runtimePath.value

    // 3. claude。検出の後に変わった場合も拒否する (起動の時点で在るかを取り直す)。
    const claudePath = win32.claudePath
    if (win32.claudeStatus !== 'found' || claudePath === null) return reject('claude-not-found')
    const claudeHostPath = makeHostPath(claudePath)
    if (!claudeHostPath.ok || !(await deps.win32ClaudeIsFile(claudeHostPath.path))) {
      return reject('claude-not-found')
    }

    // 4. env 導出 (WSL と同じ)。
    const baseEnv = deps.win32BaseEnv()
    let derived: DerivedLaunchEnv = { env: {}, forwardKeys: [] }
    if (config.providerId !== null) {
      let d: DerivedLaunchEnv | null
      try {
        d = await deps.deriveEnv(config.providerId, win32.id)
      } catch {
        return reject('provider-unavailable')
      }
      if (d === null) return reject('provider-unavailable')
      derived = d
    }

    // 5. env 合成 (forwardKeys の値だけを重ねる)。
    let launchEnv: Record<string, string>
    try {
      launchEnv = deps.composeWin32LaunchEnv(baseEnv, derived)
    } catch {
      return reject('invalid-config')
    }

    // 6. 起動の値。
    let spec: Win32LaunchSpec
    try {
      spec = deps.buildWin32LaunchSpec({ cwd, claudePath, baseEnv, launchEnv })
    } catch {
      return reject('launch-failed')
    }

    const entry =
      config.providerId === null || config.modelId === null
        ? null
        : (providers
            .find((p) => p.id === config.providerId)
            ?.models.find((m) => m.id === config.modelId) ?? null)
    const options: LaunchQueryOptions = {
      permissionMode: config.permissionMode,
      ...(entry !== null ? { model: sdkModelOf(entry) } : {}),
      ...(config.effort !== null ? { effort: config.effort } : {}),
      ...(derived.settings !== undefined ? { settings: derived.settings } : {})
    }
    const input: LaunchInput = { folder, runtime: win32, options }
    return { ok: true, input, spec }
  }

  return async (config) => {
    const folders = deps.folders()
    const folder = folders.find((f) => f.id === config.folderId) ?? null
    const runtime = deps.runtimes().find((r) => r.id === config.runtimeId) ?? null
    // 未知の folderId / runtimeId、または WslRuntime でない対象は null (→ unknown-target。X-1 と同じ)。
    if (folder === null || runtime === null) return null
    if (runtime.kind === 'win32') return prepareWin32(config, folder, runtime, folders)
    const wsl: WslRuntimeDescriptor = runtime

    // 1. 依存解決の再評価 (main の facts で。renderer の善意に依存しない)。
    const providers = await deps.providerFacts(wsl.id)
    const resolution = resolveLaunchAxes(toLaunchDraft(config), {
      folders: folders.map(folderFact),
      // 実行状態は下の evaluateLaunch (verifyRunning) が正とする。ここではキャッシュで弾かない。
      runtimes: [{ id: wsl.id, distroName: wsl.distroName, running: true }],
      providers
    })
    if (resolution.blockers.length > 0) {
      // 停止中は利用者が取れる行動 (ディストロを起動) を示す理由キーにする (pr-gate R1 po L-003 / US-1 AC7)。
      return reject(
        resolution.blockers.includes('runtime-stopped') ? 'distro-not-running' : 'invalid-config'
      )
    }
    // providerFacts はキャッシュ上の descriptor で到達可能性を判定する。キャッシュが stopped のとき、
    // config-dir / POSIX helper の Provider は blocked → 到達不可になる。これは Provider の問題ではなく
    // ランタイムの状態なので、利用者が取れる行動 (ディストロを起動して再検出) を示す理由キーにする
    // (pr-gate R2 platform-boundary L-401。最小案: providerFacts の deps の形を変えない)。
    if (
      wsl.state === 'stopped' &&
      resolution.resets.some((r) => r.axis === 'provider' && r.reason === 'provider-unreachable')
    ) {
      return reject('distro-not-running')
    }
    if (resolution.resets.some((r) => r.requiresConfirmation)) return reject('needs-confirmation')
    if (resolution.resets.length > 0) return reject('invalid-config')

    // 2. 起動ゲート (X-1)。
    const verified = await deps.verifyRunning(wsl.id)
    const gate = evaluateLaunch({ folder, runtime: wsl, verified, now: deps.now() })
    if (!gate.ok) return reject(gate.reason)
    if (verified === null) return reject('not-verified-running')

    const cwd = deps.resolveCwd(folder, wsl)
    if (cwd === null) return reject('launch-failed')
    const claudePath = wsl.claudePath ?? null
    if (claudePath === null) return reject('claude-not-found')

    // 3. env 導出。既定 Provider は X-1 の curated base だけで起動する (US-2 AC3 の確認を経た後)。
    const baseEnv = deps.baseEnv()
    let derived: DerivedLaunchEnv = { env: {}, forwardKeys: [] }
    if (config.providerId !== null) {
      // 導出の throw (safeStorage の復号失敗など) も理由キーに正規化する。例外を ipcMain.handle まで
      // 伝えない (メッセージが main のログに出る経路を作らない。pr-gate R1 security L-001 / CWE-532)。
      let d: DerivedLaunchEnv | null
      try {
        d = await deps.deriveEnv(config.providerId, wsl.id)
      } catch {
        return reject('provider-unavailable')
      }
      if (d === null) return reject('provider-unavailable')
      derived = d
    }

    // 4. wsl.exe の spawn env を合成する (WSLENV = forwardKeys + /u)。
    let launchEnv: Record<string, string>
    try {
      launchEnv = deps.composeLaunchEnv(baseEnv, derived)
    } catch {
      return reject('invalid-config')
    }

    // ランチャ解決不能・引数のバックスラッシュは throw する。launch-failed に正規化する (L-001)。
    let spec: WslLaunchSpec
    try {
      spec = deps.buildRuntimeLaunchSpec({
        distroName: wsl.distroName,
        cwd,
        claudePath,
        baseEnv,
        launchEnv
      })
    } catch {
      return reject('launch-failed')
    }

    const entry =
      config.providerId === null || config.modelId === null
        ? null
        : (providers
            .find((p) => p.id === config.providerId)
            ?.models.find((m) => m.id === config.modelId) ?? null)
    const options: LaunchQueryOptions = {
      permissionMode: config.permissionMode,
      ...(entry !== null ? { model: sdkModelOf(entry) } : {}),
      ...(config.effort !== null ? { effort: config.effort } : {}),
      ...(derived.settings !== undefined ? { settings: derived.settings } : {})
    }
    const input: LaunchInput = { folder, runtime: wsl, verified, options }

    // 5. fork env は curated base のまま (導出 env・WSLENV を utilityProcess に入れない)。
    return { ok: true, input, spec }
  }
}
