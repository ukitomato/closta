import type { WslNamespaceId } from '@domain/runtime/namespace'
import type { HostPath, RuntimePath } from '@domain/runtime/path-types'

import type { CwdOriginKind } from './keys'

/**
 * 作業ディレクトリの出自の**型** (data-model §2)。
 *
 * **判定の実装 (`cwd-origin.ts`) から分けてある。** 判定はパス API に依存し、
 * パス API は `node:path` を import する。型を実装と同じファイルに置くと、
 * `SessionSummary` を型 import した `ui` から **`node:path` へ推移的に到達**する
 * (dependency-cruiser は `tsPreCompilationDeps: true` で型だけの import も辿る。
 * 実測で `ui-not-to-core` が発火した)。
 *
 * **`path-types` と `namespace` は I/O を持たない** ため、ここに依存してよい。
 * 依存の重い側を分けるのが正しい向きである (`keys.ts` と同じ判断)。
 */

export type { CwdOriginKind }

export type CwdOrigin =
  | { readonly kind: 'host'; readonly path: HostPath }
  | {
      readonly kind: 'wsl-from-unc'
      readonly path: RuntimePath
      readonly namespace: WslNamespaceId
    }
  | {
      readonly kind: 'wsl-inherited'
      readonly path: RuntimePath
      readonly namespace: WslNamespaceId
    }
  /** どのディストロか分からない。**推測で埋めない** (AD-025)。 */
  | { readonly kind: 'unknown-location'; readonly display: string }
  /** ディストロは特定できたが検出済みの集合に無い。**所在不明とは別**である。 */
  | {
      readonly kind: 'undetected-distro'
      readonly distroName: string
      readonly display: string
    }
  | { readonly kind: 'absent' }
