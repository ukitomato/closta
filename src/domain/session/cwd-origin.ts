import { canonicalDistroName, namespaceDistroName, wslNamespace } from '@domain/runtime/namespace'
import { classifyRawPath, runtimePathOps } from '@domain/runtime/path-api'
import { makeRuntimePath, type HostPath, type RuntimePath } from '@domain/runtime/path-types'
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
 * | # | 値の形 (`classifyRawPath`) | 追加条件 | 結果 |
 * |---|---|---|---|
 * | 1 | — | 値が無い / 空 | `absent` |
 * | 2 | `wsl-unc` | ディストロが検出済み (**大小無視**) | `wsl-from-unc` |
 * | 3 | `wsl-unc` | ディストロが未検出 | `undetected-distro` (`<名前>: <POSIX>`) |
 * | 4 | `opaque-unc` | — | `unknown-location` (**表示値なし**) |
 * | 5 | `host` | — | `host` |
 * | 6 | `posix` | 由来 config の所在が `wsl:<D>` かつ変換に成功 | `wsl-inherited` |
 * | 7 | `posix` | 上記以外 | `unknown-location` (値を表示) |
 * | 8 | `other` | — | `unknown-location` (値を表示) |
 *
 * **この表が正本である。** `data-model.md §2` は本表を参照する形にしてある
 * (pr-gate Round 4 / PO4-005 — 同じ「#4」が 3 つの別のものを指す状態を解消した)。
 *
 * **#3 と #7 を混ぜない。** 前者は「どのディストロかは分かるが、そのディストロが今ない」、
 * 後者は「どのディストロか分からない」であり、利用者に示すべきことが違う。
 * だから #3 は**ディストロ名を表示値に含める** (PO4-002)。
 *
 * **#6 の条件に「変換に成功」が要る** (pr-gate Round 4 / PB4-012)。
 * `\home\y` は先頭区切り 1 本なので `posix` と判定されるが、
 * `makeRuntimePath` が禁止文字で落とすため #7 に流れる。以前の表はこの経路を持たなかった。
 *
 * **#7 / #8 で値を出してよい理由**: どちらも先頭の区切りが 1 本以下であり、
 * 定義上 UNC ではない。共有名もサーバ名も含まない (FR-042 の対象外)。
 * #8 はさらに「区切りの連続を含まない」ことを `classifyRawPath` が保証する。
 *
 * **#4 で表示値を持たない理由**: `classifyRawPath` の doc を参照。
 * 解析できない値から安全な残余を切り出すのは推測になる。
 *
 * **判定後に `raw` を参照しない。** 表示値は必ず `classifyRawPath` が返した値を使う。
 * 判定が見た値と表示する値がずれると、そこが穴になる (S4-001)。
 */
export function classifyCwd(input: ClassifyInput): CwdOrigin {
  const raw = input.cwd
  if (raw === null || raw === undefined || raw.trim().length === 0) return { kind: 'absent' }

  /*
   * **綴りの判定をここに書かない** (pr-gate Round 4 / 不変条件 1)。
   *
   * Round 1〜3 は接頭辞の一覧照合を `cwd-origin` と `path-api` に分けて持ち、
   * **毎ラウンド綴りの穴が出た**。判定を 1 つに畳み、ここは形に応じた
   * 出自の割り当てだけを行う。`startsWith` も `replace` もこの関数には無い。
   */
  const shape = classifyRawPath(raw)

  switch (shape.kind) {
    case 'wsl-unc': {
      // #2 / #3 — **ディストロ名は値に埋め込まれているので推測が要らない。**
      const { distroName, unc } = shape.parsed
      // 変換はパス API の `fromUnc` に委ねる (名前空間の対応づけもそこが持つ)。
      const converted = runtimePathOps.fromUnc(unc)
      /*
       * **構造上ここには来ない** (pr-gate Round 4 / 変異 D で確認)。
       *
       * `parseWslUncPath` が成功した時点で `makeWslUncPath` の検証
       * (長さ `MAX_PATH_LENGTH` / 禁止文字 / ディストロ名) を通っている。
       * POSIX への変換は値を短くするだけなので `fromUnc` は失敗しない。
       *
       * **到達しないと分かったうえで安全側を書いている。**
       * 性質テストの変異 D (ここを `display: raw` にする) が発火しないのは
       * テストが弱いからではなく、この分岐に入る入力が作れないためである。
       * 検証が緩んだときに生値が漏れないよう、値は `''` のままにする。
       */
      if (!converted.ok) return { kind: 'unknown-location', display: '' }

      /*
       * **綴りは検出済み集合のものに寄せる** (pr-gate Round 4 / PB4-001)。
       * Windows は共有名を大小無視で解決するので、`ubuntu-26.04` と書かれた
       * 作業ディレクトリは実在する `Ubuntu-26.04` を指す。完全一致で照合すると
       * **実行中のディストロが「未検出」に落ちる**。判定は `runtime` 側が持つ。
       */
      const canonical = canonicalDistroName(distroName, input.detectedDistros)

      // **表示用の値は変換後の POSIX パスを使う** — UNC 接頭辞を境界に出さない (FR-042)。
      if (canonical === null) {
        /*
         * **ディストロ名を表示値に載せる** (pr-gate Round 4 / PO4-002)。
         * `undetected-distro` を `unknown-location` から分けた唯一の意味は
         * 「**どのディストロかは分かるが、そのディストロが今ない**」である (FR-017 / US-1 AC-8)。
         * 名前が出ないと利用者は「改名前に戻す」「再導入する」を決められず、
         * `unknown-location` との差が訳語だけになる。
         * **FR-042 はディストロ名の露出を禁じていない** —
         * `EnumerationOutcomeDTO.location` は既に平文で運んでいる。禁じているのは UNC の綴りである。
         * 合成をここで行うのは契約 `ipc-session-list.md:141-143` の指示による
         * (分解は `infra` / `domain` 側、renderer は再合成しない)。
         */
        return {
          kind: 'undetected-distro',
          distroName,
          display: `${distroName}: ${converted.path.value}`
        }
      }
      /*
       * **名前空間は検出済みの綴りで組む。**
       * `fromUnc` は書かれていた綴りをそのまま `wsl:<D>` にするので、
       * `ubuntu-26.04` と `Ubuntu-26.04` が別の名前空間に割れる。
       * 変換済みの POSIX 値は綴りに依存しないため、差し替えるのは名前空間だけでよい。
       */
      const runtime = makeRuntimePath(wslNamespace(canonical), converted.path.value)
      if (!runtime.ok) {
        /* 構造上ここには来ない (同じ値が `fromUnc` を通っている)。安全側に倒す。 */
        return { kind: 'unknown-location', display: '' }
      }
      return { kind: 'wsl-from-unc', path: runtime.path, namespace: runtime.path.namespace }
    }

    case 'opaque-unc':
      // #4 — UNC 形だが解析できない。**参照キーだけで語る** (FR-042 / FR-047)。
      return { kind: 'unknown-location', display: '' }

    case 'host':
      // #5 — ドライブレターの大小は `makeHostPath` が正規化済み。
      return { kind: 'host', path: shape.path }

    case 'posix': {
      // #6 / #7 — POSIX 形式は**由来 config の所在でしか所在を決められない**。
      if (input.targetLocation.kind === 'wsl') {
        const namespace = locationNamespace(input.targetLocation)
        if (namespace !== 'host') {
          const runtime = makeRuntimePath(namespace, shape.value)
          if (runtime.ok) return { kind: 'wsl-inherited', path: runtime.path, namespace }
        }
      }
      /*
       * 由来がホストの POSIX パスは所在を決められない。
       * **同じ `/home/y/p` が複数のディストロに存在しうる** (AD-025 と同じ理由)。
       * 1 つに帰属させると別のディストロの登録フォルダに紛れ込む。
       */
      return { kind: 'unknown-location', display: shape.value }
    }

    case 'other':
      /*
       * #8 — 相対パス等。UNC ではないので値を出してよい。
       *
       * **`raw` ではなく `shape.value` を使う** (pr-gate Round 4 / S4-001)。
       * この関数は `classifyRawPath` を呼んだ後に `raw` を参照しない。
       * 参照すると、判定が見た値と表示する値がずれる —
       * 実際に先頭の空白 1 つでその差ができ、生の UNC が境界に出た。
       */
      return { kind: 'unknown-location', display: shape.value }
  }
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
