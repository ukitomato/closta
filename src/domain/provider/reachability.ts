import type { RuntimeDescriptor } from '@domain/runtime/descriptor'
import { namespaceDistroName } from '@domain/runtime/namespace'
import type { Reachability } from '@domain/workspace/folder'

import { classifyHelperPath, resolveConfigDirPath } from './helper-path'
import type { ProviderProfile } from './types'

/**
 * **Provider × ランタイムの到達可能性を判定する純粋関数** (FR-011 / FR-012 / data-model §6)。
 *
 * runtime domain の **`Reachability` (3 値) を再利用**する (再定義しない。AD-025 / AD-039 §5)。
 * 判定入力は **configDir から所在 (`Location`) を導出**してから行い、**所在を特定できない場合は
 * 非 `reachable` に写像**して安全側に倒す (fail-closed。M-06 / SC-004)。
 *
 * **判定と実行を同じ関数にする** (X-4 / PB-M-101)。config dir と helper パスの変換は `helper-path.ts` の
 * `resolveConfigDirPath` / `classifyHelperPath` を呼び、起動時の解決 (main/app/provider-service の `deriveEnv`) も同じ関数を呼ぶ。
 * 判定側だけが通して起動側で拒否される Provider を選択肢に出さない。
 */

/** config dir の到達可否に依存する方式 (`CLAUDE_CONFIG_DIR` を使う)。 */
const CONFIG_DIR_SOURCES: ReadonlySet<string> = new Set(['config-dir', 'in-app-login'])

export function assessReachability(
  profile: ProviderProfile,
  runtime: RuntimeDescriptor
): Reachability {
  const cred = profile.credential

  // helper 系は helper パスを選択ランタイムの名前空間で解決できるときだけ到達可能 (X-4 FR-014)。
  if (
    cred.source === 'api-key-helper' ||
    cred.source === 'aws-credential-export' ||
    cred.source === 'aws-assume-role'
  ) {
    const r = classifyHelperPath(cred.helperPath, runtime)
    return r.ok ? 'reachable' : r.reason
  }

  // config dir に依存しない方式は任意ランタイムから到達可能 (秘密は env で届く。X-4 は WSLENV で配送)。
  if (!CONFIG_DIR_SOURCES.has(cred.source)) return 'reachable'

  // configDir 未指定 = ランタイム内の既定 config dir。到達可能。
  const configDir = profile.configDir
  if (configDir === undefined) return 'reachable'

  if (configDir.namespace === 'host') {
    // win32 ランタイムはホストの config dir をそのまま見られる。
    if (runtime.kind === 'win32') return 'reachable'
  } else {
    // opaque-unc → fail-closed。win32 は WSL 内部の config dir に到達できない。
    if (namespaceDistroName(configDir.namespace) === null) return 'unreachable'
    if (runtime.kind === 'win32') return 'unreachable'
  }

  const r = resolveConfigDirPath(configDir, runtime)
  return r.ok ? 'reachable' : r.reason
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
