import { isSameNamespace, type NamespaceId } from '@domain/runtime/namespace'
import type { RuntimeDescriptor } from '@domain/runtime/descriptor'
import type { Boundary, FolderRuntimeResolutionDTO } from '@domain/workspace/dto'
import { locationNamespace, type WorkspaceFolder } from '@domain/workspace/folder'
import { matchesAtSegmentBoundary, separatorFor } from '@domain/workspace/prefix-match'
import type { ResolveInput } from '@domain/workspace/resolution'

import { originLocation, originPath, type CwdOrigin } from './cwd-origin'
import type { PendingReason, UnknownReason } from './keys'

/**
 * セッションと登録フォルダの対応づけ (data-model §4 / FR-019 〜 FR-024)。
 *
 * **R-1 の `resolveFolderRuntime()` を変換エンジンとして再利用する。**
 * セッションの所在は R-1 のランタイム識別子と同じ空間にあるため、
 * 「登録フォルダをその所在から見たときのパス」を R-1 が既に計算できる。
 * **同じ表を 2 つ持たない** — 持つと越境判定と到達可能性が必ず食い違う。
 */

/**
 * 理由キーの定義は `keys.ts` にある。
 *
 * **`dto.ts` を依存の軽いモジュールだけに依存させるため**である —
 * 本モジュールはパス API に到達するので、`dto.ts` がここから型を取ると
 * `ui → node:path` の推移的到達が成立する (型だけの import も依存グラフに現れる)。
 * 互換のため同じ名前で再 export する。
 */
export type { PendingReason, UnknownReason }

export type FolderMatch =
  | {
      readonly kind: 'folder'
      readonly folderId: string
      readonly boundary: Boundary
      readonly matchedPrefix: string
    }
  | { readonly kind: 'pending'; readonly reason: PendingReason }
  | { readonly kind: 'unregistered'; readonly cwdKey: string }
  | { readonly kind: 'unknown'; readonly reason: UnknownReason }

/** 組み合わせの解決関数。**メモ化した実体を注入する** (data-model §4 の不変条件)。 */
export type ResolveFolderRuntime = (input: ResolveInput) => FolderRuntimeResolutionDTO

export interface MatchInput {
  readonly origin: CwdOrigin
  readonly folders: readonly WorkspaceFolder[]
  readonly runtimes: readonly RuntimeDescriptor[]
  readonly resolve: ResolveFolderRuntime
}

/**
 * 保留理由の強さ。**解消手順が最も明確なものを優先する。**
 *
 * 停止中は「起動して再検出する」という 1 手が示せる。判定失敗はやり直しを促せる。
 * 未判定は待つしかない。**弱いものを前に出すと、利用者が取れる行動が隠れる。**
 */
const PENDING_PRIORITY: readonly PendingReason[] = [
  'distro-not-running',
  'probe-failed',
  'capabilities-not-probed'
]

function strongerPending(a: PendingReason | null, b: PendingReason): PendingReason {
  if (a === null) return b
  return PENDING_PRIORITY.indexOf(a) <= PENDING_PRIORITY.indexOf(b) ? a : b
}

/**
 * 未登録の作業ディレクトリをまとめる鍵。
 *
 * **`(所在, 正規化済みパス)` の組**とする。R-1 の `folderKey()` と同じ作りであり、
 * 重複判定の規則を 2 つ持たない。
 */
export function cwdKeyOf(namespace: NamespaceId, value: string): string {
  return `${namespace}\u0000${value}`
}

/**
 * 判定 4 段 (data-model §4)。**順序に意味がある。**
 *
 * 第 0 段を先に置くのは、出自が確定しない値に対して登録フォルダを走査しても
 * 結果が出ないためである。所在不明のセッションに対して「どの登録フォルダとも
 * 一致しなかった」と報告すると、**未登録と区別がつかなくなる**。
 */
export function matchFolder(input: MatchInput): FolderMatch {
  // ── 第 0 段: 出自の判定結果を受け取る ──────────────────────────────
  switch (input.origin.kind) {
    case 'absent':
      return { kind: 'unknown', reason: 'cwd-absent' }
    case 'unknown-location':
      return { kind: 'unknown', reason: 'location-unknown' }
    case 'undetected-distro':
      return { kind: 'unknown', reason: 'distro-undetected' }
    default:
      break
  }

  const location = originLocation(input.origin)
  const cwd = originPath(input.origin)
  if (location === null || cwd === null) {
    // 出自が `host` / `wsl-*` ならここには来ない。来たら分類側の不整合である。
    return { kind: 'unknown', reason: 'location-unknown' }
  }

  // ── 第 1 段: 所在に対応する RuntimeDescriptor を引く ────────────────
  const sessionNamespace = locationNamespace(location)
  const runtime = input.runtimes.find((r) => isSameNamespace(r.id, sessionNamespace))
  if (runtime === undefined) return { kind: 'unknown', reason: 'distro-undetected' }

  // ── 第 2 段 / 第 3 段: 各登録フォルダを所在の名前空間へ変換して照合 ──
  const separator = separatorFor(sessionNamespace)
  let best: { folderId: string; boundary: Boundary; prefix: string } | null = null
  let pending: PendingReason | null = null

  for (const folder of input.folders) {
    const resolution = input.resolve({ folder, runtime })

    if (resolution.reachability === 'blocked') {
      if (resolution.blockedReason !== null) {
        pending = strongerPending(pending, resolution.blockedReason)
      }
      continue
    }
    if (resolution.reachability !== 'reachable') continue
    if (resolution.runtimePath === null) continue

    // 変換後パスの名前空間はランタイムの `id` であり、セッションの所在と一致する。
    if (!isSameNamespace(resolution.runtimePath.namespace, sessionNamespace)) continue

    const prefix = resolution.runtimePath.value
    if (!matchesAtSegmentBoundary(cwd.value, prefix, separator)) continue

    // **最長一致を採る** — `/home/y/project2` を `/home/y/project` に吸わせない。
    if (best === null || prefix.length > best.prefix.length) {
      best = { folderId: folder.id, boundary: resolution.boundary, prefix }
    }
  }

  if (best !== null) {
    return {
      kind: 'folder',
      folderId: best.folderId,
      boundary: best.boundary,
      matchedPrefix: best.prefix
    }
  }

  /*
   * **保留を未登録より優先する。** 保留は「今は決められない」、
   * 未登録は「決めた結果として対応が無い」である。
   * 保留を未登録として見せると、利用者は**登録済みのフォルダに対して再登録を促される**。
   */
  if (pending !== null) return { kind: 'pending', reason: pending }

  return { kind: 'unregistered', cwdKey: cwdKeyOf(sessionNamespace, cwd.value) }
}
