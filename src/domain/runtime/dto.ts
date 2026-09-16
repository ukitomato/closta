import type {
  AutoModeStatus,
  DependencyName,
  ProbeState,
  SandboxKind,
  SeccompFilterState
} from './capabilities'
import type {
  WslAvailability,
  EnumerationIssueReason,
  RuntimeKind,
  RunState,
  WslVersion
} from './descriptor'
import type { NamespaceId } from './namespace'

/**
 * IPC 境界を渡る値 (contracts/ipc-capability.md)。
 *
 * **DTO 型は `domain` に置く。** preload (= `app` レイヤ) に置いて renderer が import すると
 * `ui → app` になり AD-023 §7 の `app ↮ ui` に抵触する。
 *
 * branded type は境界を越えると退化するため、**パスは名前空間を明示して運ぶ**。
 */

export interface PathDTO {
  readonly namespace: NamespaceId
  readonly value: string
}

export interface MissingDependencyDTO {
  readonly name: DependencyName
  /** 導入手順文書のアンカー。**コマンド文字列を持たない** (FR-009)。 */
  readonly docAnchor: string
}

/**
 * capabilities の DTO。
 *
 * `sandboxKind` は**閉じた参照キー**であり renderer が FR-047 に従って訳出する。
 * 訳出済みのラベルを渡すと、`isolation` の隔離バッジ (I-2) が
 * ローカライズ済み文字列の比較でしか種別を分岐できなくなる。
 *
 * **不変条件**: renderer は無人実行の可否を `autoModeStatus` / `autoModeAllowed` 以外から
 * 導出してはならない。**`sandboxKind` から `autoModeSafe` 相当を再導出してはならない。**
 * 生の 3 値 `autoModeSafe` は渡さない — `unknown` は JavaScript で truthy であり真偽判定が誤る。
 */
export interface CapabilitiesDTO {
  readonly probeState: ProbeState
  readonly sandboxKind: SandboxKind
  readonly seccompStatus: SeccompFilterState
  readonly missingDependencies: readonly MissingDependencyDTO[]
  readonly probedAt: number | null
  /** ゲート判定にのみ使う。未判定を `false` に潰すため表示に使わない (FR-003)。 */
  readonly autoModeAllowed: boolean
  /** 表示にはこちらを使う。3 状態を区別できる。 */
  readonly autoModeStatus: AutoModeStatus
}

export interface RuntimeDescriptorDTO {
  readonly id: NamespaceId
  readonly kind: RuntimeKind
  readonly distroName: string | null
  readonly wslVersion: WslVersion
  readonly state: RunState
  readonly isDefault: boolean
  readonly capabilities: CapabilitiesDTO
  /** `PathMapping` の中身は渡さない。変換は main 側の `domain` 純粋関数で行う。 */
  readonly hasPathMapping: boolean
  readonly detectedAt: number
}

/**
 * 列挙できなかったディストロ (SC-002)。
 *
 * 文字種制約を満たさない名前を**黙って落とさない** — 落とすと `wsl -l -v` との
 * 1 対 1 が破れ、利用者は原因が名前だと気付けない。
 */
export interface EnumerationIssueDTO {
  /** 表示専用。識別子としても引数としても使わない。 */
  readonly rawName: string
  readonly reasonKey: EnumerationIssueReason
}

export interface RuntimeListDTO {
  /** WSL そのものの利用可否 (SC-015)。**訳出は renderer が `Record` で行う。** */
  readonly wslAvailability: WslAvailability
  readonly runtimes: readonly RuntimeDescriptorDTO[]
  readonly enumerationIssues: readonly EnumerationIssueDTO[]
}
