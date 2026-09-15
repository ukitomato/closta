import type { Capabilities } from './capabilities'
import type { RuntimeDescriptor, RuntimeEnumeration, WslRuntimeDescriptor } from './descriptor'
import type { NamespaceId, WslNamespaceId } from './namespace'
import type { PathMapping } from './path-mapping'
import type { HostPath, PathResult, RuntimePath, WslUncPath } from './path-types'
import type { VerifiedRunning } from './verified-running'

/**
 * `domain` がインタフェースを宣言し、`infra` が実装する (AD-023 §3)。
 *
 * 境界を越えるのは `RuntimeDescriptor` という**値**であって、検出の手続きではない。
 * `agents` に置けば `domain → agents` の外向き依存が要るが、`domain` に置けば
 * 矢印が `infra → domain` に反転する。
 */

export interface ProbeOutcome {
  readonly capabilities: Capabilities
  /** `null` はマッピング取得失敗。呼び出し元は `probeState: failed` に倒す。 */
  readonly pathMapping: PathMapping | null
}

export interface RuntimeDetector {
  /** インストール済みランタイムを列挙する。capabilities は未判定でよい。 */
  list(): Promise<RuntimeEnumeration>

  /**
   * 実行状態を取り直す。**実行中確認済みの値を生成できる唯一の経路。**
   * 引数を省略すると全ディストロ分を 1 回で取得する。
   * 返す値はディストロごとに分かれ、それぞれが対象ディストロの識別子を保持する。
   */
  verifyRunning(
    ids?: readonly WslNamespaceId[]
  ): Promise<ReadonlyMap<WslNamespaceId, VerifiedRunning>>

  /**
   * capabilities とマッピングを確定させる。
   * **実行中確認済みの値しか受け取らない** (FR-007 / SC-005)。
   */
  probe(descriptor: WslRuntimeDescriptor, verified: VerifiedRunning): Promise<ProbeOutcome>
}

/**
 * パス API の公開面 (data-model §7)。
 *
 * Constitution Principle I が要求するパス操作の経路。
 * 実装はパス操作の標準モジュールを import してよい唯一のモジュールに置く (FR-025)。
 */
export interface RuntimePathOps {
  /** 名前空間内での結合。親 + 子の名前 1 つ。 */
  join(base: RuntimePath, ...segments: readonly string[]): PathResult<RuntimePath>
  /** 親ディレクトリ。ルートでは `null`。 */
  parent(path: RuntimePath): RuntimePath | null
  /** 基底名。 */
  basename(path: RuntimePath): string
  /** 等価判定。名前空間まで一致することを要求する。 */
  equals(a: RuntimePath, b: RuntimePath): boolean

  /** ホスト名前空間へ変換する。**入口で名前空間識別子の一致を検証する。** */
  toHost(path: RuntimePath, mapping: PathMapping): PathResult<HostPath>
  /** ホスト名前空間から変換する。 */
  fromHost(path: HostPath, mapping: PathMapping): PathResult<RuntimePath>

  /**
   * UNC 形式へ変換する。**対象ディストロ識別子を必須引数として受け取り**、
   * 合成後に再正規化して share 配下への封じ込めを検証する。
   */
  toUnc(path: RuntimePath): PathResult<WslUncPath>
  /** UNC 形式から変換する。 */
  fromUnc(path: WslUncPath): PathResult<RuntimePath>
}

/** ホスト名前空間の操作。同じモジュール群が別の公開面として提供する (data-model §7)。 */
export interface HostPathOps {
  join(base: HostPath, ...segments: readonly string[]): PathResult<HostPath>
  parent(path: HostPath): HostPath | null
  basename(path: HostPath): string
  equals(a: HostPath, b: HostPath): boolean
}

/**
 * `RuntimeDescriptor` (データ) にパス API を束ねたインタフェース (data-model §7)。
 *
 * `app` の composition root が descriptor から**都度組み立てる**。
 * キャッシュするなら descriptor の更新で破棄する — 古いマッピングを掴み続けないため。
 * **IPC に載せない** (Electron IPC は structured-clone セマンティクス)。
 */
export interface AgentRuntime {
  readonly descriptor: RuntimeDescriptor
  readonly path: RuntimePathOps
}

/** WSL 側のディレクトリ列挙 (`infra/fs`)。UNC 形式はこの内側に閉じる。 */
export interface DirEntry {
  readonly name: string
  readonly isDirectory: boolean
  /**
   * 完成したパス。**名前空間は所在のもの (`wsl:<D>`)** —
   * `unc:<D>` を IPC 境界へ出さない (contracts/ipc-capability.md)。
   */
  readonly path: RuntimePath
}

export type ListDirErrorReason =
  'permission-denied' | 'not-found' | 'path-too-long' | 'distro-unreachable' | 'too-many-entries'

export type ListDirResult =
  | {
      readonly ok: true
      readonly cwd: RuntimePath
      /** 現在地がルートなら `null`。 */
      readonly parent: RuntimePath | null
      readonly entries: readonly DirEntry[]
    }
  | { readonly ok: false; readonly reason: ListDirErrorReason }

export interface WslFileSystem {
  /**
   * ディレクトリを列挙する。
   * **有効期間内の実行中確認済みの値に対してのみ発行する**。
   * 値と対象が同じディストロを指すことを `isSameDistro()` で検証する。
   */
  listDirectory(target: RuntimePath, verified: VerifiedRunning, now: number): Promise<ListDirResult>

  /** パスの実在を確認する。一覧側の第 0 段が使う (data-model §6)。 */
  exists(target: RuntimePath, verified: VerifiedRunning, now: number): Promise<boolean>
}

/** 検出済み descriptor 集合に対する識別子の照合 (未信頼入力の検証)。 */
export interface RuntimeRegistrySnapshot {
  readonly runtimes: readonly RuntimeDescriptor[]
  find(id: NamespaceId): RuntimeDescriptor | undefined
}
