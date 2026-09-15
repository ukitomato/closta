import { hasConversionMaterial, type RuntimeDescriptor } from '@domain/runtime/descriptor'
import { isSameDistro } from '@domain/runtime/namespace'
import { runtimePathOps } from '@domain/runtime/path-api'
import type { PathMapping } from '@domain/runtime/path-mapping'
import type { PathDTO } from '@domain/runtime/dto'

import type { Boundary, CrossBoundaryRecommendation, FolderRuntimeResolutionDTO } from './dto'
import {
  isWindowsFolder,
  isWslFolder,
  locationNamespace,
  type FolderReachability,
  type WorkspaceFolder
} from './folder'
import { isUnderAnyPrefix } from './prefix-match'

/**
 * 組み合わせの解決 (BE-052 / data-model §8)。
 *
 * **3 段を上から順に適用する。上の段で決まったら下の段を見ない** (FR-029)。
 *
 * 順序を固定するのは、実行状態を到達可否より先に見ると
 * **起動しても使えない組み合わせに「起動して再検出せよ」と案内する**ことになるためである。
 * 所在 `wsl:<A>` のフォルダと停止中の `WslRuntime(<B>)` がこれにあたり、
 * 案内に従って起動すると第 1 段で `foreign-distro` になって選択肢から消える。
 *
 * **純粋関数。** パス変換はパス API に委ね、ここでは判定だけを行う。
 */

function unreachable(
  reason: FolderRuntimeResolutionDTO['unreachableReason']
): FolderRuntimeResolutionDTO {
  return {
    reachability: 'unreachable',
    unreachableReason: reason,
    blockedReason: null,
    resolutionSteps: [],
    boundary: 'unknown',
    runtimePath: null,
    recommendation: null
  }
}

/** `blocked` は**必ず `resolutionSteps` を 1 つ以上伴う** (data-model §8 不変条件)。 */
function blocked(
  reason: NonNullable<FolderRuntimeResolutionDTO['blockedReason']>,
  steps: FolderRuntimeResolutionDTO['resolutionSteps']
): FolderRuntimeResolutionDTO {
  return {
    reachability: 'blocked',
    unreachableReason: null,
    blockedReason: reason,
    resolutionSteps: steps,
    boundary: 'unknown',
    runtimePath: null,
    recommendation: null
  }
}

function reachable(
  boundary: Boundary,
  runtimePath: PathDTO,
  recommendation: CrossBoundaryRecommendation | null
): FolderRuntimeResolutionDTO {
  return {
    reachability: 'reachable',
    unreachableReason: null,
    blockedReason: null,
    resolutionSteps: [],
    boundary,
    runtimePath,
    recommendation
  }
}

/**
 * 越境の案内 (FR-031)。**3 要素はすべて非空。**
 *
 * 手順に**旧エントリの登録解除を含める**。含めないと、同じフォルダが 2 つの所在で
 * 登録されたまま残り、どちらを使っているのか利用者に分からなくなる。
 */
function crossRecommendation(suggestedLocation: PathDTO): CrossBoundaryRecommendation {
  return {
    impact:
      'ファイルシステムの境界を越えるため、読み書きが大幅に遅くなります (実測で最大 1000 倍以上)。',
    suggestedLocation,
    steps: ['clone-to-suggested-location', 'register-new-folder', 'unregister-old-folder']
  }
}

/**
 * 越境時の推奨配置先。**ランタイム側のホームディレクトリ直下**を指す。
 *
 * ディストロ内のどこが速いかはマッピングの**外側**であれば成立するので、
 * マッピングに現れない位置を 1 つ選べばよい。`/home` を使うのは慣例に沿うためである。
 */
function suggestedNativeLocation(runtime: RuntimeDescriptor): PathDTO {
  if (runtime.kind === 'win32') return { namespace: 'host', value: 'C:\\' }
  return { namespace: runtime.id, value: '/home' }
}

export interface ResolveInput {
  readonly folder: WorkspaceFolder
  readonly runtime: RuntimeDescriptor
}

/**
 * 第 1 段: 到達可否 — 所在 × ランタイム種別。
 *
 * **ランタイムの実行状態と probe の進行を見ない。**
 * ここで `unreachable` になるものはディストロを起動しても解消しない。
 */
function stage1(input: ResolveInput): FolderRuntimeResolutionDTO | null {
  const { folder, runtime } = input
  if (folder.location.kind === 'windows') return null

  const folderNamespace = locationNamespace(folder.location)

  if (runtime.kind === 'win32') {
    /*
     * **未検証を根拠にした安全側の既定である** (spec `## Assumptions`)。
     * UNC パスを cwd とするネイティブ Windows プロセスの起動は AD-015 で検証されていない。
     * 起動契約を持つ X-1 が検証し、可能ならこのセルを改める。
     */
    return unreachable('unc-cwd-unsupported')
  }

  if (!isSameDistro(folderNamespace, runtime.id)) return unreachable('foreign-distro')
  return null
}

/**
 * 第 2 段: 変換材料の有無。
 *
 * **分岐の鍵は `pathMapping` を持っているかどうかであり `probeState` ではない。**
 * capabilities の判定とマッピングの取得は同じ 1 回の呼び出しで行うが (FR-023)、
 * 両者は独立した成果物である。`probeState` で分岐すると実行中の WSL1 が
 * 「材料あり」と誤判定され、所在 `windows` のフォルダがすべて消える。
 */
function stage2(runtime: RuntimeDescriptor): FolderRuntimeResolutionDTO | null {
  if (hasConversionMaterial(runtime)) return null

  if (runtime.state === 'stopped') {
    return blocked('distro-not-running', ['start-distro', 'rescan-runtimes'])
  }
  if (runtime.capabilities.probeState === 'failed') {
    return blocked('probe-failed', ['rescan-runtimes'])
  }
  // `idle` / `probing`。**起動直後と再検出中は必ずここを通る** (例外経路ではない)。
  return blocked('capabilities-not-probed', ['wait-for-probe'])
}

/** 第 3 段: 変換と越境。 */
function stage3(input: ResolveInput): FolderRuntimeResolutionDTO {
  const { folder, runtime } = input

  // 所在 `windows` × `Win32Runtime` — 恒等。
  if (isWindowsFolder(folder) && runtime.kind === 'win32') {
    return reachable('native', { namespace: 'host', value: folder.path.value }, null)
  }

  // 所在 `windows` × `WslRuntime` — マッピングで変換する。越境。
  if (isWindowsFolder(folder) && runtime.kind === 'wsl') {
    const mapping = runtime.pathMapping
    if (mapping === null) return unreachable('path-not-mapped')

    const converted = runtimePathOps.fromHost(folder.path, mapping)
    if (!converted.ok) return unreachable('path-not-mapped')

    return reachable(
      'cross',
      { namespace: converted.path.namespace, value: converted.path.value },
      crossRecommendation(suggestedNativeLocation(runtime))
    )
  }

  /*
   * 所在 `wsl:<D>` × `WslRuntime(<D>)` — 恒等。
   * **Windows マウント配下かどうかで越境を分ける** (AD-016 の性能崖)。
   * 実体が Windows 側ファイルシステムなら `cross` である。
   */
  if (isWslFolder(folder) && runtime.kind === 'wsl') {
    const mapping = runtime.pathMapping
    const path: PathDTO = { namespace: runtime.id, value: folder.path.value }

    // **マッピングを基準に判定する。特定のマウント位置を決め打ちしない** (FR-024)。
    const underWindowsMount = mapping !== null && isUnderAnyPrefix(reverse(mapping), path.value)

    return underWindowsMount
      ? reachable('cross', path, crossRecommendation(suggestedNativeLocation(runtime)))
      : reachable('native', path, null)
  }

  /*
   * 型のうえでは到達しない組み合わせ。
   * **`reachable` へ倒さない** — 根拠が無いものを「使える」と表明しない (FR-003)。
   */
  return unreachable('foreign-distro')
}

/** マッピングの向きを入れ替える。ランタイム側の値を照合するため。 */
function reverse(mapping: PathMapping): PathMapping {
  return {
    from: mapping.to,
    to: mapping.from,
    entries: mapping.entries.map((entry) => ({
      fromPrefix: entry.toPrefix,
      toPrefix: entry.fromPrefix
    })),
    acquiredAt: mapping.acquiredAt
  }
}

/** 3 段を順に適用する。 */
export function resolveFolderRuntime(input: ResolveInput): FolderRuntimeResolutionDTO {
  return stage1(input) ?? stage2(input.runtime) ?? stage3(input)
}

/** 一覧側の畳み込みが使う形へ落とす (data-model §6)。 */
export function toFolderReachability(resolution: FolderRuntimeResolutionDTO): FolderReachability {
  return {
    reachability: resolution.reachability,
    unreachableReason: resolution.unreachableReason,
    blockedReason: resolution.blockedReason,
    resolutionSteps: resolution.resolutionSteps
  }
}
