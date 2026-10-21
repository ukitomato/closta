import type { RuntimeDescriptor } from '@domain/runtime/descriptor'
import { isSameNamespace, type RuntimeNamespaceId } from '@domain/runtime/namespace'
import { resolveConfigDirPath } from '@domain/provider/helper-path'
import type { ProviderProfile } from '@domain/provider/types'
import { locationNamespace, type WorkspaceFolder } from '@domain/workspace/folder'

import { matchFolder, type ResolveFolderRuntime } from './match'
import type { CwdOrigin } from './origin'
import type { EnumerationTarget } from './target'
import type { ResumeUnavailableReason } from './resume'

/**
 * 過去の行の引き継ぐ 3 軸の解決 (X-9 / data-model §3.1)。
 * `resume.ts` から分けた: renderer が `resume.ts` の型を読むとき、`match` → `path-api` → `node:path` へ
 * 推移的に届かないようにする (dependency-cruiser の `ui-not-to-core`)。
 */

export interface PastResumeInput {
  /** 列挙対象 (所在・config ディレクトリ・origin)。 */
  readonly target: EnumerationTarget
  /** 行の cwd の出自 (列挙の結果の `SessionSummary.origin`)。 */
  readonly origin: CwdOrigin
  readonly folders: readonly WorkspaceFolder[]
  readonly runtimes: readonly RuntimeDescriptor[]
  readonly providers: readonly ProviderProfile[]
  readonly resolve: ResolveFolderRuntime
}

export type PastResumeAxes =
  | {
      readonly ok: true
      readonly folderId: string
      readonly runtimeId: RuntimeNamespaceId
      readonly providerId: string | null
    }
  | { readonly ok: false; readonly reason: ResumeUnavailableReason }

/**
 * 過去の行の引き継ぐ 3 軸を決める (data-model §3.1。上から順に、最初に当たった段で決まる)。
 * パスを組み立てない・`process.platform` を見ない。
 */
export function resolvePastResumeAxes(input: PastResumeInput): PastResumeAxes {
  const { target, origin } = input

  // 段 1: ランタイム (所在 → 名前空間 → descriptor)
  const runtimeNamespace = locationNamespace(target.location)
  const runtime = input.runtimes.find((r) => isSameNamespace(r.id, runtimeNamespace))
  if (runtime === undefined) return { ok: false, reason: 'runtime-missing' }

  // 段 1b: 出自が所在と一致するか。`absent` / `unknown-location` / `undetected-distro` は段 2 へ。
  switch (origin.kind) {
    case 'host':
      if (!isSameNamespace(origin.path.namespace, runtimeNamespace)) {
        return { ok: false, reason: 'location-mismatch' }
      }
      break
    case 'wsl-inherited':
      if (!isSameNamespace(origin.namespace, runtimeNamespace)) {
        return { ok: false, reason: 'location-mismatch' }
      }
      break
    case 'wsl-from-unc':
      return { ok: false, reason: 'location-mismatch' }
    default:
      break
  }

  // 段 2: フォルダ
  const match = matchFolder({
    origin,
    folders: input.folders,
    runtimes: input.runtimes,
    resolve: input.resolve
  })
  switch (match.kind) {
    case 'unregistered':
      return { ok: false, reason: 'folder-unregistered' }
    case 'pending':
      return { ok: false, reason: 'folder-pending' }
    case 'unknown':
      return { ok: false, reason: 'location-unknown' }
    case 'folder':
      break
  }
  // `folder` のとき出自は host / wsl-* のどれかで、段 1b を通っている (path を持つ)。
  if (origin.kind !== 'host' && origin.kind !== 'wsl-inherited') {
    return { ok: false, reason: 'location-unknown' }
  }
  if (match.matchedPrefix !== origin.path.value) {
    return { ok: false, reason: 'cwd-mismatch' }
  }

  // 段 3: Provider
  const candidates = input.providers.filter((p) => {
    if (p.credential.source !== 'config-dir' && p.credential.source !== 'in-app-login') return false
    if (p.configDir === undefined) return false
    const resolved = resolveConfigDirPath(p.configDir, runtime)
    if (!resolved.ok) return false
    return (
      resolved.path.namespace === target.configDir.namespace &&
      resolved.path.value === target.configDir.value
    )
  })
  if (candidates.length >= 2) return { ok: false, reason: 'provider-ambiguous' }
  const only = candidates[0]
  if (only !== undefined) {
    return { ok: true, folderId: match.folderId, runtimeId: runtime.id, providerId: only.id }
  }
  if (target.origin === 'default') {
    return { ok: true, folderId: match.folderId, runtimeId: runtime.id, providerId: null }
  }
  return { ok: false, reason: 'provider-missing' }
}
