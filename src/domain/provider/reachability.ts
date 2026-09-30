import type { RuntimeDescriptor } from '@domain/runtime/descriptor'
import { namespaceDistroName } from '@domain/runtime/namespace'
import { runtimePathOps } from '@domain/runtime/path-api'
import type { Reachability } from '@domain/workspace/folder'

import type { ProviderProfile } from './types'

/**
 * **Provider × ランタイムの到達可能性を判定する純粋関数** (FR-011 / FR-012 / data-model §6)。
 *
 * runtime domain の **`Reachability` (3 値) を再利用**する (再定義しない。AD-025 / AD-039 §5)。
 * `config-dir` 系だけが `CLAUDE_CONFIG_DIR` の到達可否に依存する — 他方式は env/settings で任意ランタイムへ届くため
 * `reachable`。判定入力は **configDir から所在 (`Location`) を導出**してから行い、**所在を特定できない場合は
 * 非 `reachable` に写像**して安全側に倒す (fail-closed。M-06 / SC-004)。
 *
 * ホスト config dir を WSL から見る場合、**`PathMapping` で実際に変換できるときだけ `reachable`** とする
 * (workspace の `fromHost` と同じ意味論。マッピングの有無だけで通すと mapping 配下でないパスを楽観側に倒す。
 * ARCH-H-001 / FR-011「PathMapping に載せる」)。
 */

/** config dir の到達可否に依存する方式 (`CLAUDE_CONFIG_DIR` を使う)。 */
const CONFIG_DIR_SOURCES: ReadonlySet<string> = new Set(['config-dir', 'in-app-login'])

export function assessReachability(
  profile: ProviderProfile,
  runtime: RuntimeDescriptor
): Reachability {
  // config dir に依存しない方式は任意ランタイムから到達可能 (秘密/helper は env/settings で届く)。
  if (!CONFIG_DIR_SOURCES.has(profile.credential.source)) return 'reachable'

  // configDir 未指定 = ランタイム内の既定 config dir。到達可能。
  const configDir = profile.configDir
  if (configDir === undefined) return 'reachable'

  if (configDir.namespace === 'host') {
    // ホストの config dir (configDir は HostPath に narrow 済み)。
    if (runtime.kind === 'win32') return 'reachable'
    if (runtime.state === 'stopped') return 'blocked'
    // WSL からは PathMapping で**実際に変換できるとき**だけ到達可能 (fail-closed。ARCH-H-001)。
    if (runtime.pathMapping === null) return 'blocked' // 変換材料 (mapping) 待ち
    return runtimePathOps.fromHost(configDir, runtime.pathMapping).ok ? 'reachable' : 'unreachable'
  }

  // WSL 内 (UNC) の config dir。所在を導出する (素の文字列を判定に食わせない。H-101 / AD-025)。
  const distro = namespaceDistroName(configDir.namespace)
  if (distro === null) return 'unreachable' // opaque-unc → fail-closed
  if (runtime.kind === 'win32') return 'unreachable' // win32 は WSL 内部の config dir に到達できない
  if (runtime.state === 'stopped') return 'blocked'

  // WSL 内の config dir は**同一ディストロ**からのみ到達できる (別 distro の ~/.claude は不可視。charter Journey 2)。
  return distro === runtime.distroName ? 'reachable' : 'unreachable'
}

/**
 * 到達できる Provider だけを起動の選択肢に出す (FR-012)。除外理由 (`Reachability` 値) を付す (L-05)。
 */
export interface ReachableSplit {
  readonly reachable: readonly ProviderProfile[]
  readonly excluded: readonly { readonly profile: ProviderProfile; readonly reason: Reachability }[]
}

export function splitByReachability(
  profiles: readonly ProviderProfile[],
  runtime: RuntimeDescriptor
): ReachableSplit {
  const reachable: ProviderProfile[] = []
  const excluded: { profile: ProviderProfile; reason: Reachability }[] = []
  for (const profile of profiles) {
    const reason = assessReachability(profile, runtime)
    if (reason === 'reachable') reachable.push(profile)
    else excluded.push({ profile, reason })
  }
  return { reachable, excluded }
}
