import { namespaceDistroName } from '@domain/runtime/namespace'
import { parseWslUncPath, runtimePathOps } from '@domain/runtime/path-api'
import {
  makeHostPath,
  makeRuntimePath,
  type HostPath,
  type RuntimePath
} from '@domain/runtime/path-types'
import { locationNamespace, type Location } from '@domain/workspace/folder'

import type { CwdOrigin } from './origin'

/**
 * セッションの作業ディレクトリの出自判定 (data-model §2 / FR-016 〜 FR-018)。
 *
 * **由来 config ディレクトリの所在から名前空間を推定しない。値の形から判定する。**
 * 実測でホスト側の 1 つの config ディレクトリに 3 形式が混在した
 * (Windows 形式 30 / POSIX 形式 6 / UNC 形式 7。research R-02)。
 *
 * **UNC の解析と変換はパス API に委ねる** — 文字列操作で接頭辞を剥がさない。
 * その依存により本モジュールは `ui` から推移的到達禁止で届かなくなる。これは意図した性質で、
 * `ui` が名前空間つきパス値を合成する経路を構造的に無くしている。
 *
 * 入力の `cwd` は **config ディレクトリ由来 = アプリ外のプロセスが書いた未信頼入力**である。
 *
 * **参照キーの語彙は `keys.ts` に置く。** 本モジュールはパス API に依存するため、
 * ここに型を置いて `dto.ts` が型 import すると **`ui → node:path` の推移的到達**が
 * 成立してしまう (dependency-cruiser は型だけの import も辿る)。
 */

/**
 * 型の定義は `origin.ts` にある。**判定の実装から分けてある** —
 * ここはパス API (= `node:path`) に依存するため、型を同じファイルに置くと
 * `SessionSummary` を型 import した `ui` から推移的に到達してしまう。
 */
export type { CwdOrigin, CwdOriginKind } from './origin'

export interface ClassifyInput {
  /** セッションに記録されていた生の作業ディレクトリ。 */
  readonly cwd: string | null | undefined
  /** **由来 config ディレクトリの所在。** セッションの所在とは別物である (data-model §8)。 */
  readonly targetLocation: Location
  /** 検出済みディストロ名の集合 (完全一致で照合する。AD-025 §2)。 */
  readonly detectedDistros: ReadonlySet<string>
}

/**
 * 判定表 (data-model §2)。**順序に意味がある。**
 *
 * | # | 条件 | 結果 |
 * |---|---|---|
 * | 1 | 値が無い / 空 | `absent` |
 * | 2 | UNC 形式 かつ ディストロが検出済み | `wsl-from-unc` |
 * | 3 | UNC 形式 かつ ディストロが未検出 | `undetected-distro` |
 * | 4 | ドライブレター始まり | `host` |
 * | 5 | `/` 始まり かつ 由来 config の所在が `wsl:<D>` | `wsl-inherited` |
 * | 6 | `/` 始まり かつ 由来 config の所在が `windows` | `unknown-location` |
 * | 7 | 上記以外 (相対パス等) | `unknown-location` |
 *
 * **#3 と #6 を混ぜない。** 前者は「どのディストロかは分かるが、そのディストロが今ない」、
 * 後者は「どのディストロか分からない」であり、利用者に示すべきことが違う。
 */
export function classifyCwd(input: ClassifyInput): CwdOrigin {
  const raw = input.cwd
  if (raw === null || raw === undefined || raw.trim().length === 0) return { kind: 'absent' }

  // #2 / #3 — UNC 形式。**ディストロ名は値に埋め込まれているので推測が要らない。**
  const parsed = parseWslUncPath(raw)
  if (parsed.ok) {
    const { distroName, unc } = parsed.path
    // 変換はパス API の `fromUnc` に委ねる (名前空間の対応づけもそこが持つ)。
    const converted = runtimePathOps.fromUnc(unc)
    if (!converted.ok) return { kind: 'unknown-location', display: raw }

    // **表示用の値は変換後の POSIX パスを使う** — UNC 接頭辞を境界に出さない (FR-042)。
    if (!input.detectedDistros.has(distroName)) {
      return { kind: 'undetected-distro', distroName, display: converted.path.value }
    }
    return {
      kind: 'wsl-from-unc',
      path: converted.path,
      namespace: converted.path.namespace
    }
  }

  // #4 — ホスト名前空間。ドライブレターの大小は `makeHostPath` が正規化する。
  const host = makeHostPath(raw)
  if (host.ok) return { kind: 'host', path: host.path }

  // #5 — POSIX 形式は**由来 config の所在でしか所在を決められない**。
  if (raw.startsWith('/') && input.targetLocation.kind === 'wsl') {
    const namespace = locationNamespace(input.targetLocation)
    if (namespace !== 'host') {
      const runtime = makeRuntimePath(namespace, raw)
      if (runtime.ok) return { kind: 'wsl-inherited', path: runtime.path, namespace }
    }
  }

  // #6 / #7 — 所在を推測しない。
  return { kind: 'unknown-location', display: raw }
}

/**
 * 出自から所在を取り出す。決められない出自では `null`。**推測しない。**
 *
 * ディストロ名の取り出しは `namespaceDistroName()` を使う —
 * 名前空間識別子の内部構造に触れてよいのは `namespace.ts` だけである。
 */
export function originLocation(origin: CwdOrigin): Location | null {
  switch (origin.kind) {
    case 'host':
      return { kind: 'windows' }
    case 'wsl-from-unc':
    case 'wsl-inherited': {
      const distroName = namespaceDistroName(origin.namespace)
      return distroName === null ? null : { kind: 'wsl', distroName }
    }
    default:
      return null
  }
}

/** 出自のパス値。所在が決まらない出自では `null` (DTO の `cwd` に対応する)。 */
export function originPath(origin: CwdOrigin): HostPath | RuntimePath | null {
  switch (origin.kind) {
    case 'host':
    case 'wsl-from-unc':
    case 'wsl-inherited':
      return origin.path
    default:
      return null
  }
}

/**
 * セグメント分割に使う区切り。
 *
 * **2 つの意味論を同時に見る。** 出自が `host` なら値はバックスラッシュ区切り、
 * `wsl-*` ならスラッシュ区切りであり、`unknown-location` はどちらもありうる。
 * パス API の `basename` を使わないのは、**セグメント 2 つの並び**を見る必要があるためである。
 */
const SEGMENT_SEPARATORS = /[/\\]/

/**
 * git worktree 由来の作業ディレクトリか (FR-029 / research R-09)。
 *
 * **`SDKSessionInfo` に worktree を示す項目が無い** (design-gate L-002) ため、
 * 作業ディレクトリの**形**から決める。実測では登録フォルダ配下の
 * `.claude/worktrees/<name>` に現れた。
 *
 * **セグメント境界で照合する。** 部分文字列で見ると
 * `/home/y/my.claude/worktreesX` のような無関係なパスを拾う。
 * 区切りは POSIX とホストの両方を見る — 出自が `host` なら値はバックスラッシュ区切りである。
 *
 * 出自が `absent` なら偽。所在不明でも**表示値に対して判定する** —
 * 所在が決まらないことと worktree であることは独立である。
 */
export function isWorktreeOrigin(origin: CwdOrigin): boolean {
  const value = originPath(origin)?.value ?? originDisplay(origin)
  if (value === null) return false

  const segments = value.split(SEGMENT_SEPARATORS)
  for (let i = 0; i + 1 < segments.length; i += 1) {
    if (segments[i] === '.claude' && segments[i + 1] === 'worktrees') return true
  }
  return false
}

/** 表示専用の文字列。所在が決まる出自では `null` (`cwd` で足りる)。 */
export function originDisplay(origin: CwdOrigin): string | null {
  switch (origin.kind) {
    case 'unknown-location':
    case 'undetected-distro':
      return origin.display
    default:
      return null
  }
}
