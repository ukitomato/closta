import type { PathDTO } from '@domain/runtime/dto'

import type {
  BlockedReason,
  CrossBoundaryStep,
  Reachability,
  ResolutionStep,
  UnreachableReason
} from './folder'

/** IPC 境界を渡る作業フォルダ関連の値 (contracts/ipc-capability.md)。 */

export type LocationDTO =
  { readonly kind: 'windows' } | { readonly kind: 'wsl'; readonly distroName: string }

export interface WorkspaceFolderDTO {
  readonly id: string
  readonly location: LocationDTO
  readonly path: PathDTO
  readonly displayName: string
  /** **§8 と同じ 3 値**。2 値に潰さない (FR-017 / FR-027)。 */
  readonly reachability: Reachability
  readonly unreachableReason: UnreachableReason | null
  readonly blockedReason: BlockedReason | null
  readonly resolutionSteps: readonly ResolutionStep[]
  readonly registeredAt: number
}

export interface WorkspaceFolderDraftDTO {
  readonly location: LocationDTO
  readonly path: PathDTO
  readonly displayName: string
}

export type RestoreIssueReason =
  | 'parse-failed'
  | 'schema-version-unknown'
  | 'namespace-mismatch'
  | 'invalid-path'
  | 'invalid-record'

/**
 * 復元できなかった件数と理由 (FR-019 / SC-013)。
 * `reasonKeys` は参照キーであり renderer が FR-047 に従って訳出する。
 */
export interface RestoreIssuesDTO {
  readonly skipped: number
  readonly reasonKeys: readonly RestoreIssueReason[]
  /** 退避先。所在を持たないため常に `host`。 */
  readonly backupPath: PathDTO | null
}

export interface FolderListDTO {
  readonly folders: readonly WorkspaceFolderDTO[]
  readonly restoreIssues: RestoreIssuesDTO
}

export type Boundary = 'native' | 'cross' | 'unknown'

export interface CrossBoundaryRecommendation {
  /** 想定される影響。 */
  readonly impact: string
  /** 推奨する配置先。 */
  readonly suggestedLocation: PathDTO
  /** 取るべき手順。旧エントリの登録解除を含む (FR-031)。 */
  readonly steps: readonly CrossBoundaryStep[]
}

export interface FolderRuntimeResolutionDTO {
  readonly reachability: Reachability
  readonly unreachableReason: UnreachableReason | null
  readonly blockedReason: BlockedReason | null
  readonly resolutionSteps: readonly ResolutionStep[]
  readonly boundary: Boundary
  /**
   * 解決後のパス。**名前空間識別子を伴う (ランタイムの `id`)。**
   *
   * **所在の名前空間と一致しないことが越境セルの正常な結果である** —
   * 所在 `windows` × `WslRuntime` は `{ namespace: 'wsl:<D>', value: '/mnt/c/...' }` を返す。
   * ここを所在の名前空間へ「正規化」すると、POSIX 値に `host` のタグが付き、
   * 境界を越えた直後の再 branding になる。
   */
  readonly runtimePath: PathDTO | null
  readonly recommendation: CrossBoundaryRecommendation | null
}

export type BrowseError =
  | 'distro-not-running'
  | 'distro-unreachable'
  | 'permission-denied'
  | 'not-found'
  | 'path-too-long'
  | 'browse-session-expired'
  | 'unsupported-location'
  | 'too-many-entries'

export interface DirEntryDTO {
  readonly name: string
  readonly isDirectory: boolean
  /** 完成したパス。**namespace は常に所在のもの** — `unc:<D>` を境界へ出さない。 */
  readonly path: PathDTO
}

/**
 * ブラウズの移動先。**renderer はパス文字列を連結しない** —
 * 子と親のパスは main 側の `domain` パス API が組み立てる。
 */
export type BrowseTargetDTO =
  | { readonly kind: 'root' }
  | { readonly kind: 'current'; readonly of: PathDTO }
  | { readonly kind: 'child'; readonly of: PathDTO; readonly name: string }
  | { readonly kind: 'parent'; readonly of: PathDTO }

export type BeginBrowseResult =
  | { readonly ok: true; readonly token: string }
  | { readonly ok: false; readonly error: BrowseError }

export type BrowseDirectoryResult =
  | {
      readonly ok: true
      readonly cwd: PathDTO
      /** 現在地がルートなら `null`。 */
      readonly parent: PathDTO | null
      readonly entries: readonly DirEntryDTO[]
    }
  | { readonly ok: false; readonly error: BrowseError }

/**
 * 登録が通らない理由。**閉じた参照キー**であり renderer が訳出する (FR-047)。
 *
 * `invalid-display-name` は表示名の検証 (長さ上限・制御文字) 用である。
 * `invalid-path` に混ぜない — 利用者が直すべき入力欄が別であり、
 * 混ぜるとパスを疑わせることになる。
 */
export type RegisterFolderReason =
  'duplicate' | 'namespace-mismatch' | 'invalid-path' | 'invalid-display-name' | 'unknown-location'

export type RegisterFolderResult =
  | { readonly ok: true; readonly folder: WorkspaceFolderDTO }
  | {
      readonly ok: false
      readonly reason: RegisterFolderReason
      /** 重複のとき既存エントリを返す。`reason` が重複以外なら `null`。 */
      readonly existing: WorkspaceFolderDTO | null
    }
