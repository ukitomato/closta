import { namespaceDistroName, wslNamespace, type WslNamespaceId } from '@domain/runtime/namespace'
import type { HostPath, RuntimePath } from '@domain/runtime/path-types'

/**
 * 利用者が登録した作業ディレクトリ (data-model §6)。
 *
 * **所在は推測されず、登録時に明示的に選ばれる。**
 * 所在を先に選ばせることが、越境判定と到達可能性判定を構造的に決定可能にする。
 */

export type Location =
  { readonly kind: 'windows' } | { readonly kind: 'wsl'; readonly distroName: string }

/** 到達可能性。**§8 と同じ 3 値**であり 2 値に潰さない (FR-017 / FR-027)。 */
export type Reachability = 'reachable' | 'unreachable' | 'blocked'

export type UnreachableReason =
  'foreign-distro' | 'unc-cwd-unsupported' | 'folder-missing' | 'distro-absent' | 'path-not-mapped'

export type BlockedReason = 'distro-not-running' | 'capabilities-not-probed' | 'probe-failed'

export type ResolutionStep = 'start-distro' | 'rescan-runtimes' | 'wait-for-probe'

export type CrossBoundaryStep =
  'clone-to-suggested-location' | 'register-new-folder' | 'unregister-old-folder'

/** 所在 `windows` のエントリ。パスはホスト名前空間。 */
export interface WindowsWorkspaceFolder {
  readonly id: string
  readonly location: { readonly kind: 'windows' }
  readonly path: HostPath
  readonly displayName: string
  readonly registeredAt: number
}

/** 所在 `wsl:<D>` のエントリ。パスはそのディストロの名前空間。 */
export interface WslWorkspaceFolder {
  readonly id: string
  readonly location: { readonly kind: 'wsl'; readonly distroName: string }
  readonly path: RuntimePath
  readonly displayName: string
  readonly registeredAt: number
}

/** 判別可能な union。所在とパスの名前空間が型のうえで対応する。 */
export type WorkspaceFolder = WindowsWorkspaceFolder | WslWorkspaceFolder

/** 一覧表示のための到達可能性。**永続化しない** — 起動時に判定し直す。 */
export interface FolderReachability {
  readonly reachability: Reachability
  readonly unreachableReason: UnreachableReason | null
  readonly blockedReason: BlockedReason | null
  readonly resolutionSteps: readonly ResolutionStep[]
}

/**
 * 所在で絞り込む型ガード。
 *
 * **`folder.location.kind === 'windows'` では `folder.path` が絞り込めない。**
 * union の判別子が入れ子にあるため TypeScript が対応を追えず、
 * `path` が `HostPath | RuntimePath` のまま残る。
 * 所在とパス型の対応を知っているのはこの型定義だけなので、ガードもここに置く。
 */
export function isWindowsFolder(folder: WorkspaceFolder): folder is WindowsWorkspaceFolder {
  return folder.location.kind === 'windows'
}

export function isWslFolder(folder: WorkspaceFolder): folder is WslWorkspaceFolder {
  return folder.location.kind === 'wsl'
}

/** 所在から名前空間識別子を構成する。 */
export function locationNamespace(location: Location): 'host' | WslNamespaceId {
  return location.kind === 'windows' ? 'host' : wslNamespace(location.distroName)
}

/**
 * 所在とパスの名前空間が一致するかを判定する (data-model §6)。
 *
 * **IPC 境界と永続化境界の双方がこれを呼ぶ。** 粒度を揃えないと、所在の種別だけが一致して
 * ディストロ名が異なるレコードが片方だけ通過する。
 *
 * **ディストロ名は検出時の表記をそのまま保持し、比較は完全一致で行う** (正規化しない)。
 */
export function isNamespaceConsistent(
  location: Location,
  path: { readonly namespace: string }
): boolean {
  if (location.kind === 'windows') return path.namespace === 'host'

  const expected = wslNamespace(location.distroName)
  if (path.namespace !== expected) return false

  // 識別子に埋め込まれたディストロ名が所在と完全一致すること (種別まで一致した後の再確認)。
  return namespaceDistroName(expected) === location.distroName
}

/** 重複判定のキー。`(所在, 正規化済みパス)` の組が一意 (FR-016)。 */
export function folderKey(folder: WorkspaceFolder): string {
  return `${locationNamespace(folder.location)}\u0000${folder.path.value}`
}

/**
 * 解除を**勧める**表示を出してよいか (FR-017 の 2 層のうち上の層)。
 *
 * **解除操作そのものは `reachability` によらず全エントリに提供する** —
 * 制限すると FR-031 の越境案内 (旧エントリの登録解除を含む) が実行不能になる。
 * 越境するエントリは `reachable` であるため、操作を制限すると案内が実行不能な指示になる。
 *
 * WSL2 のアイドル自動停止は日常的に起きるため、`blocked` に解除を勧めると
 * 正常な登録を毎日削除させることになる。
 */
export function shouldSuggestUnregister(reachability: Reachability): boolean {
  return reachability === 'unreachable'
}
