import type { Capabilities } from './capabilities'
import type { NamespaceId, RuntimeNamespaceId, WslNamespaceId } from './namespace'
import type { PathMapping } from './path-mapping'

/**
 * 検出結果から生成されるランタイムの**値** (data-model §4)。
 *
 * シングルトンではない (AD-003)。**I/O も関数も持たないデータ**であり、
 * そのまま IPC に載せられる。パス API を束ねたインタフェースは `AgentRuntime` (§7)。
 */

export type RuntimeKind = 'win32' | 'wsl'

export type WslVersion = 1 | 2 | null

export type RunState = 'running' | 'stopped'

interface RuntimeDescriptorBase {
  readonly id: RuntimeNamespaceId
  readonly kind: RuntimeKind
  /** **キャッシュ値** (§5)。実体と乖離する。 */
  readonly state: RunState
  readonly isDefault: boolean
  readonly capabilities: Capabilities
  /** 検出時刻。**表示用であり自動再検出のトリガーには使わない** (FR-010)。 */
  readonly detectedAt: number
}

export interface Win32RuntimeDescriptor extends RuntimeDescriptorBase {
  readonly id: 'host'
  readonly kind: 'win32'
  /** `Win32Runtime` は恒等変換であり `PathMapping` を持たない (§2)。 */
  readonly pathMapping?: undefined
  readonly distroName?: undefined
  readonly wslVersion?: undefined
}

export interface WslRuntimeDescriptor extends RuntimeDescriptorBase {
  readonly id: WslNamespaceId
  readonly kind: 'wsl'
  readonly distroName: string
  /** `null` は**バージョン列挙から読めなかった**ことを表す。 */
  readonly wslVersion: WslVersion
  /** **probe 完了まで未取得**。取得済みかどうかが第 2 段の分岐鍵である (§8)。 */
  readonly pathMapping: PathMapping | null
  /**
   * WSL 内 `claude` の実行パス (RuntimePath の文字列。X-1 / AD-036 / AD-018 §4)。
   *
   * 検出時に `command -v claude` で 1 回解決する (`probe-script.ts`)。**probe 前・不在時は
   * `null`/未設定** (起動ゲートが `claude-not-found` に倒す)。起動は絶対パスで行い裸名 PATH に依存しない
   * (L-102 / CWE-426)。**IPC/DTO には出さない** — main 側の起動詳細であり renderer は要らない。
   */
  readonly claudePath?: string | null
}

export type RuntimeDescriptor = Win32RuntimeDescriptor | WslRuntimeDescriptor

/**
 * 変換材料を持っているか (data-model §8 第 2 段の分岐鍵)。
 *
 * **`probeState` を鍵にしてはならない。** capabilities の判定とマッピングの取得は
 * 同じ 1 回の呼び出しで行うが (FR-023)、両者は独立した成果物である。
 * WSL1 は実地判定を行わず capabilities を固定値で表明する (FR-004) 一方、
 * パス変換にはマッピングを要する。`probeState` で分岐すると実行中の WSL1 が
 * 「材料あり」と誤判定され、所在 `windows` のフォルダがすべて変換不能になる。
 */
export function hasConversionMaterial(descriptor: RuntimeDescriptor): boolean {
  if (descriptor.kind === 'win32') return true
  return descriptor.pathMapping !== null
}

/** ディストロの改名は**別の descriptor** として現れる。同一性は `id` で判定する (FR-011)。 */
export function sameRuntime(a: RuntimeDescriptor, b: RuntimeDescriptor): boolean {
  return a.id === b.id
}

/**
 * 列挙できなかったディストロ (data-model §4 / SC-002)。
 *
 * 文字種制約を満たさない名前は descriptor を生成しないが、**黙って落とさない** —
 * 落とすと `wsl -l -v` との 1 対 1 が破れ、利用者は原因が名前だと気付けない。
 */
export type EnumerationIssueReason = 'invalid-name-charset'

export interface EnumerationIssue {
  /** 表示専用。識別子としても引数としても使わない。 */
  readonly rawName: string
  readonly reasonKey: EnumerationIssueReason
}

/**
 * WSL そのものの利用可否。**参照キーであり、訳出は `ui` が行う。**
 *
 * `enumerationIssues` に相乗りさせない。あちらは
 * 「`wsl -l -v` との 1 対 1 が破れた**ディストロ**」を表し `rawName` を必須にしている。
 * ホスト全体の状態はその意味論に属さず、該当する `rawName` も無い。
 *
 * | 値 | 意味 |
 * |---|---|
 * | `available` | 列挙できた (ディストロが 0 台でも `available`) |
 * | `not-installed` | `wsl.exe` が無い |
 * | `enumeration-failed` | `wsl.exe` はあるが列挙に失敗した (非 0 終了 / 期限切れ / I/O) |
 *
 * **`not-installed` と `enumeration-failed` を混ぜない。**
 * 前者は「この環境では WSL を使えない」、後者は「一時的な失敗かもしれない」であり、
 * 利用者に示すべきことが違う (SC-015 / FR-012)。
 */
export type WslAvailability = 'available' | 'not-installed' | 'enumeration-failed'

export interface RuntimeEnumeration {
  readonly runtimes: readonly RuntimeDescriptor[]
  readonly enumerationIssues: readonly EnumerationIssue[]
  /**
   * **WSL の利用可否。**
   *
   * 以前は列挙に失敗すると `Win32Runtime` だけを返し、
   * **失敗したという事実を捨てていた**。その結果、利用者は
   * 「WSL が無いホスト」「列挙に失敗した」「ディストロが 0 台」を区別できなかった。
   * `runtimes.length === 0` の空状態にも到達しない (`win32` が必ず 1 件返るため)。
   */
  readonly wslAvailability: WslAvailability
}

/** 名前空間識別子が descriptor 集合のいずれかに一致するか (未信頼入力の検証に使う)。 */
export function isKnownRuntimeId(
  runtimes: readonly RuntimeDescriptor[],
  id: NamespaceId
): id is RuntimeNamespaceId {
  return runtimes.some((r) => r.id === id)
}
