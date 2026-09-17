import type { HostPath, RuntimePath } from '@domain/runtime/path-types'
import { isNamespaceConsistent, locationNamespace, type Location } from '@domain/workspace/folder'

/**
 * 列挙対象 (data-model §1)。
 *
 * **所在と config ディレクトリの組**である。1 つの所在に複数の対象がありうる —
 * ディストロ内に複数ユーザのホームがあり、`.claude` を持つものすべてを対象にするため
 * (FR-011 / `[USER]` 確定)。**1 つを暗黙に選ばない。**
 *
 * **`WslUncPath` を持たない。** UNC 形式は `infra` の実名リストに載ったモジュールだけが
 * 文字列として materialize してよい (AD-025 / research R-05 の規則 1)。
 */

/** 由来。X-3 で `'provider'` が増える (FR-015)。集合を差し替えるだけで済む形にしておく。 */
export type EnumerationTargetOrigin = 'default'

export interface EnumerationTarget {
  /** 不透明な識別子。IPC の引数と突き合わせに使う (下記 `enumerationTargetKey`)。 */
  readonly key: string
  readonly location: Location
  /** 所在の名前空間で表した config ディレクトリ。 */
  readonly configDir: HostPath | RuntimePath
  readonly origin: EnumerationTargetOrigin
  /** 表示用。どの候補から来たか (ユーザ名など)。FR-052 が常時表示を要求する。 */
  readonly label: string
}

/**
 * `key` を組み立てる。
 *
 * **不透明とする** — `configDir` の値・UNC 形式の文字列・ホームディレクトリのパスを
 * **含めない**。含めると `EnumerationOutcomeDTO` 経由で config ディレクトリの実体パスが
 * renderer に露出し、FR-042 と「不要な情報を境界に出さない」の双方に触れる。
 *
 * 所在の名前空間識別子は含める — これは `LocationDTO` として既に境界を越えており、
 * 隠しても得がない。加えて**由来の序数**だけを添える。
 * これにより由来のパスは復元できず、プロセスの寿命では安定する
 * (`fetchMoreSessions` が跨ぐため安定性が要る)。
 */
export function enumerationTargetKey(location: Location, ordinal: number): string {
  return `${locationNamespace(location)}#${ordinal}`
}

/**
 * 所在と config ディレクトリの名前空間が一致しているか (data-model §1 の不変条件)。
 *
 * R-1 の `isNamespaceConsistent()` を**そのまま使う** — 判定を 2 つ持つと、
 * 所在の種別だけが一致してディストロ名が異なる対象が片方だけ通過する。
 */
export function isTargetConsistent(target: EnumerationTarget): boolean {
  return isNamespaceConsistent(target.location, target.configDir)
}

/**
 * 所在ごとの失敗理由 (data-model §6)。**参照キーであり訳出は `ui` が行う。**
 *
 * **`no-history` はここに無い。** config ディレクトリが無いことは失敗ではなく
 * `status` の別の値として表す (FR-012)。混ぜると、Claude Code を使っていない
 * ディストロが毎回エラーとして現れる。
 */
export type FailureReason =
  | 'distro-not-running'
  | 'wsl-unavailable'
  | 'permission-denied'
  | 'path-too-long'
  | 'stopped-midway'
  | 'enumeration-failed'

/**
 * 実行時に照合できる一覧。**型と同じ集合であることを `satisfies` で縛る。**
 *
 * 列挙プロセスの応答は**アプリ外のパッケージ由来の値を含む**ため、
 * 親は理由キーが既知の集合に属することを確かめる必要がある。
 * ここに置かずに `agents` 側で配列を書くと、語彙が 2 箇所に分かれる。
 */
export const FAILURE_REASONS = [
  'distro-not-running',
  'wsl-unavailable',
  'permission-denied',
  'path-too-long',
  'stopped-midway',
  'enumeration-failed'
] as const satisfies readonly FailureReason[]

export function isFailureReason(value: unknown): value is FailureReason {
  return typeof value === 'string' && (FAILURE_REASONS as readonly string[]).includes(value)
}

export type TargetStatus = 'ok' | 'no-history' | 'failed'

/**
 * 列挙 1 単位の結果 (data-model §6)。
 *
 * **`key` は常に存在し、`configDir` は無いことがある。**
 * 停止中の所在では探索そのものを発行しないため対象を組み立てられないが、
 * **行は必ず作る** — 行が無いと (a) 利用者に「未列挙である」ことを示せず、
 * (b) 「既知の `key` + 停止中」という SC-002 / SC-010 が検証したい経路が踏めない。
 *
 * `configDir` を推測で埋めないのは、埋めると「探索した」と読める値ができるためである。
 */
export interface TargetOutcome {
  readonly key: string
  readonly location: Location
  /** 対象を組み立てられなかった場合は空文字。 */
  readonly label: string
  /** 対象を組み立てられなかった場合は `null`。**推測で埋めない。** */
  readonly configDir: HostPath | RuntimePath | null
  readonly status: TargetStatus
  readonly reasonKey: FailureReason | null
  readonly count: number
  /** 件数上限で打ち切ったか (FR-038)。**黙って切らない。** */
  readonly truncated: boolean
}

/** 所在ごとの成否 (data-model §6)。 */
export interface EnumerationOutcome {
  readonly location: Location
  readonly outcomes: readonly TargetOutcome[]
  /** 取得時刻。**必ず提示する** (FR-034 / SC-012)。 */
  readonly fetchedAt: number
}

/** 対象を作れた場合の行。 */
export function targetOutcome(
  target: EnumerationTarget,
  status: TargetStatus,
  reasonKey: FailureReason | null,
  count: number,
  truncated: boolean
): TargetOutcome {
  return {
    key: target.key,
    location: target.location,
    label: target.label,
    configDir: target.configDir,
    status,
    reasonKey,
    count,
    truncated
  }
}

/**
 * 対象を作れなかった所在の行 (停止中 / WSL 利用不可 / 権限拒否)。
 *
 * **探索を発行しないまま行を作る** (FR-007 / FR-008)。
 */
export function unreachableOutcome(
  location: Location,
  reasonKey: FailureReason,
  fetchedAt: number
): EnumerationOutcome {
  return {
    location,
    outcomes: [
      {
        key: enumerationTargetKey(location, 0),
        location,
        label: '',
        configDir: null,
        status: 'failed',
        reasonKey,
        count: 0,
        truncated: false
      }
    ],
    fetchedAt
  }
}
