import path from 'node:path'

import { applyEntry, findLongestMatch } from '@domain/workspace/prefix-match'

import type { HostPathOps, RuntimePathOps } from './interfaces'
import {
  isValidDistroName,
  namespaceDistroName,
  toUncNamespace,
  toWslNamespace,
  uncNamespace,
  type NamespaceId
} from './namespace'
import type { PathMapping } from './path-mapping'
import {
  UNC_PREFIX,
  makeHostPath,
  makeRuntimePath,
  makeWslUncPath,
  type HostPath,
  type PathErrorReason,
  type PathResult,
  type RuntimePath,
  type WslUncPath
} from './path-types'

/**
 * パス API の実装 (data-model §7 / FR-025)。
 *
 * **パス操作の標準モジュールを import してよいのは本ファイル 1 つだけである。**
 * ディレクトリ単位の制限では、制限の外でパス合成を必要とするモジュールが実装不能になる。
 * API を提供して初めて制限が成立する。
 *
 * **`path.win32` / `path.posix` を明示的に使い、素の `path.*` を使わない。**
 * 素の `path.*` はホスト OS によって挙動が変わるため、Constitution Principle II
 * (実行環境で結果が変わってはならない) に反する。ホスト名前空間は win32 の意味論、
 * ランタイム名前空間は posix の意味論で扱う。
 *
 * 接頭辞照合そのものは `domain/workspace/prefix-match.ts` が持つ。
 * 本ファイルは標準モジュールに依存するため、`ui` から到達してはならない。
 */

const win32 = path.win32
const posix = path.posix

const fail = <T>(reason: PathErrorReason): PathResult<T> => ({ ok: false, reason })

/**
 * 結合に使う名前 1 つ分の検証。
 *
 * セパレータ (両方の意味論)・NUL・制御文字を含まず、`.` / `..` そのものでないこと。
 * 先頭ドット (`.git`) は許す — 「`.` を含まない」と書くと `.git` や `Ubuntu-26.04` を
 * 弾き、実装時に必ず緩められる。
 */
export function isValidSegment(name: string): boolean {
  if (name.length === 0 || name.length > 255) return false
  if (name === '.' || name === '..') return false
  if (name.includes('/') || name.includes('\\')) return false
  for (const ch of name) {
    const code = ch.codePointAt(0)!
    if (code < 0x20 || code === 0x7f || (code >= 0x80 && code <= 0x9f)) return false
  }
  return true
}

/**
 * Windows のファイル名で使えない文字。
 *
 * **`:` を通すと、パスが指すものが変わる。**
 * `index.html:stream` は NTFS の代替データストリームを指し、`C:` はドライブ相対を指す。
 * どちらも「接頭辞が同じであること」の検査を通り抜けるため、
 * 封じ込めを接頭辞照合だけで守ろうとすると漏れる。
 *
 * `?` と `*` はワイルドカードとして解釈される API があるため併せて弾く。
 *
 * **ホスト名前空間に限る。** POSIX のファイル名は `:` を含めてよいので、
 * `isValidSegment` 側で弾くと正当な名前を拒否することになる。
 */
const WIN32_FORBIDDEN_IN_NAME = [':', '<', '>', '"', '|', '?', '*']

/**
 * ホスト名前空間で結合に使える名前かどうか。
 * 共通の規則に加えて、Windows のファイル名で使えない文字を拒否する。
 */
export function isValidHostSegment(name: string): boolean {
  if (!isValidSegment(name)) return false
  return !WIN32_FORBIDDEN_IN_NAME.some((ch) => name.includes(ch))
}

/**
 * legacy の共有名。新しい `\\wsl.localhost\` と同じ経路を指す (AD-015 §1)。
 *
 * **受理はするが、正規形は常に `UNC_PREFIX` に寄せる。**
 * 2 つの綴りを値として持ち回ると、同じディレクトリを指す 2 つの値が
 * 等価判定で不一致になる。
 */
const UNC_LEGACY_PREFIX = '\\\\wsl$\\'

/** `parseWslUncPath` の結果。ディストロ名は**検証済み**である。 */
export interface ParsedWslUnc {
  readonly distroName: string
  readonly unc: WslUncPath
}

/**
 * 生の作業ディレクトリの**形**。名前空間の候補はこれで決まる
 * (pr-gate Round 4 / 不変条件 1)。
 *
 * ## なぜ接頭辞の一覧照合をやめたか
 *
 * Round 1 から 3 まで、UNC の綴りの穴が**毎ラウンド出た**。
 * 接頭辞を並べる設計である限り「まだ並べていない綴り」が必ず残るためである。
 * しかも穴を塞ぐたびに隣が壊れた —
 * Round 2 はデバイス綴りを足して `parseWslUncPath` への接続を忘れ FR-017 を落とし、
 * Round 3 は `raw.startsWith('/')` の一括ガードで**正当な POSIX 表示**を壊した。
 *
 * ## 何で決めるか
 *
 * **先頭の区切りの本数**で決める。これは綴りの一覧ではなく値の形の性質である。
 *
 * 数えるのは `trim()` した後の先頭である。
 *
 * | 先頭区切り | 意味 |
 * |---|---|
 * | 0 本 | ドライブレターか相対。POSIX でも UNC でもない |
 * | 1 本 | POSIX 絶対パス。**UNC ではないので生値を出してよい** |
 * | 2 本以上 | **区切り 2 本以上の形**。POSIX でもホストでもない |
 *
 * **2 本以上を「UNC」と呼ばない** (pr-gate Round 4 / PB4-009)。
 * `\\?\C:\dev` と `\\.\C:\dev` は Win32 の**デバイス名前空間接頭辞**であって UNC ではなく、
 * サーバ名も共有名も含まない (実機で解決することを確認済み)。
 * この形は FR-042 の対象外だが、**解析できない以上は同じく表示値を持たせない** —
 * 対象外であることと、構造が読めることは別である。
 *
 * ## 実測されていない綴りに分岐を作らない
 *
 * 実測 ([research R-02](../../../specs/002-session-cross-folder-session-enumeration/research.md))
 * で現れた UNC の綴りは `\\wsl.localhost\<distro>\...` の **1 種類だけ**である
 * (ホスト既定 43 件中 7 件)。デバイス名前空間 (`\\?\UNC\`) や `GLOBALROOT` 経由の綴りは
 * **誰も観測していない**。
 *
 * したがって 2 本以上の中で解析するのは `UNC_PREFIX` と `UNC_LEGACY_PREFIX` だけにし、
 * **それ以外は一律 `opaque-unc`** とする。綴りが増えても安全側に落ちる。
 *
 * ## `opaque-unc` が表示値を持たない理由
 *
 * 構造が分からない値から「安全な残余」を切り出すのは、結局また推測である。
 * 例えば `\\?\UNC\wsl.localhost\Ubuntu\home\alice` から
 * 「server と share の 2 セグメントを落とす」規則を当てると `?` と `UNC` が落ち、
 * **共有名 `wsl.localhost` が残る**。
 * 解析できない以上どこまでが所在かを決められないので、**何も出さない**。
 * 参照キー `unknown-location` が意味を運ぶ (訳出は `ui` の責務 / FR-047)。
 */
export type RawPathShape =
  | { readonly kind: 'wsl-unc'; readonly parsed: ParsedWslUnc }
  | { readonly kind: 'opaque-unc' }
  | { readonly kind: 'host'; readonly path: HostPath }
  | { readonly kind: 'posix'; readonly value: string }
  | { readonly kind: 'other'; readonly value: string }

/** 先頭に連続する区切り (`/` と `\` の両方) の本数。 */
function leadingSeparatorCount(raw: string): number {
  let n = 0
  while (n < raw.length && (raw[n] === '/' || raw[n] === '\\')) n += 1
  return n
}

/** 区切りが 2 本以上連続する箇所。**位置を問わない。** */
const SEPARATOR_RUN = /[\\/]{2,}/

/**
 * 生値の形を判定する。**UNC の綴りを知ってよいのはこの関数の内側だけである**
 * (AD-029 §3 / 検証項目 12)。
 *
 * 呼び出し側は `switch (shape.kind)` を書く。`startsWith` も `replace` も持たない。
 */
export function classifyRawPath(input: string): RawPathShape {
  /*
   * **先頭の空白を落としてから数える** (pr-gate Round 4 / S4-001)。
   *
   * 落とさないと、空白 1 つで先頭区切りの本数が 0 になり `other` に落ち、
   * **生の UNC がそのまま表示値として境界に出た**。
   * 制御文字は `build.ts` が `classifyCwd` の**前**に `normalizeText` で
   * 落としているので、ここに届く先頭ジャンクは空白だけである。
   */
  const raw = input.trim()
  const separators = leadingSeparatorCount(raw)

  if (separators >= 2) {
    /* **UNC 形。** 解析できるのは実測された 2 綴りだけで、残りは不透明にする。 */
    const parsed = parseWslUncPath(raw)
    return parsed.ok ? { kind: 'wsl-unc', parsed: parsed.path } : { kind: 'opaque-unc' }
  }

  if (separators === 1) return { kind: 'posix', value: raw }

  /* 0 本。ドライブレターならホスト。 */
  const host = makeHostPath(raw)
  if (host.ok) return { kind: 'host', path: host.path }

  /*
   * **形が分からないのに区切りの連続を含む値は、表示値を持たせない。**
   *
   * `trim()` は空白しか落とさない。書式文字 (`U+200B` など) は
   * `hasControlCharacter` にも `trim()` にも掛からないので、
   * それを先頭に付けた UNC がここへ落ちうる。
   * **どの文字が前に付いたかを数えるのをやめ、「区切りの連続を含むか」で決める** —
   * 文字種の一覧を持たないので、知らない文字が増えても破れない。
   */
  return SEPARATOR_RUN.test(raw) ? { kind: 'opaque-unc' } : { kind: 'other', value: raw }
}

export function parseWslUncPath(raw: string): PathResult<ParsedWslUnc> {
  if (raw.length === 0) return fail('invalid-format')

  /*
   * 区切りをバックスラッシュに寄せる。POSIX パスはこの時点で接頭辞に一致しなくなる。
   *
   * **述語をここに増やさない** (pr-gate Round 4 / 不変条件 1)。
   * 以前は `looksLikeWslUnc` / `uncRelativeDisplay` が同じ寄せを別に持ち、
   * **同じ入力に別の答えを返していた**。今は `classifyRawPath` が
   * 「UNC 形かどうか」を先頭区切りの本数で決め、この関数は
   * **「実測された 2 綴りを解析できるか」だけ**に責任を持つ。
   */
  const backslashed = raw.replace(/\//g, '\\')
  const lower = backslashed.toLowerCase()

  const prefix = lower.startsWith(UNC_PREFIX.toLowerCase())
    ? UNC_PREFIX
    : lower.startsWith(UNC_LEGACY_PREFIX.toLowerCase())
      ? UNC_LEGACY_PREFIX
      : null
  if (prefix === null) return fail('invalid-format')

  const afterPrefix = backslashed.slice(prefix.length)
  const sep = afterPrefix.indexOf('\\')
  const distroName = sep < 0 ? afterPrefix : afterPrefix.slice(0, sep)
  if (!isValidDistroName(distroName)) return fail('invalid-format')

  const rest = sep < 0 ? '' : afterPrefix.slice(sep)
  const canonical = `${UNC_PREFIX}${distroName}${rest}`

  const result = makeWslUncPath(uncNamespace(distroName), canonical)
  if (!result.ok) return fail(result.reason)
  return { ok: true, path: { distroName, unc: result.path } }
}

/** ランタイム名前空間 (POSIX 意味論) の操作。 */
export const runtimePathOps: RuntimePathOps = {
  join(base, ...segments) {
    for (const s of segments) {
      if (!isValidSegment(s)) return fail('invalid-format')
    }
    const joined = posix.join(base.value, ...segments)
    const normalized = posix.normalize(joined)
    return makeRuntimePath(base.namespace, normalized)
  },

  parent(target) {
    const parentValue = posix.dirname(target.value)
    if (parentValue === target.value) return null
    const result = makeRuntimePath(target.namespace, parentValue)
    return result.ok ? result.path : null
  },

  basename(target) {
    return posix.basename(target.value)
  },

  equals(a, b) {
    // 名前空間まで一致することを要求する。値だけの比較は別ディストロを同一視する。
    return a.namespace === b.namespace && a.value === b.value
  },

  toHost(target, mapping) {
    const check = assertMappingDirection(mapping, target.namespace, 'host')
    if (check !== null) return fail(check)

    const converted = convertWithMapping(mapping, target.value)
    if (converted === null) return fail('not-mapped')
    return makeHostPath(converted)
  },

  fromHost(target, mapping) {
    /*
     * **`target.namespace` を期待値に使ってはならない。**
     * `HostPath` の名前空間は常に `host` であり、`assertMappingDirection(mapping, 'host',
     * target.namespace)` と書くと `mapping.to === 'host'` を要求してしまう。
     * すると直後の `toWslNamespace(mapping.to)` が必ず `null` になり、
     * **この関数はどんな入力でも失敗する**。行き先は `mapping.to` から決める。
     */
    if (mapping.from !== 'host') return fail('namespace-mismatch')

    const wslNs = toWslNamespace(mapping.to)
    if (wslNs === null) return fail('namespace-mismatch')

    const converted = convertWithMapping(mapping, target.value)
    if (converted === null) return fail('not-mapped')
    return makeRuntimePath(wslNs, converted)
  },

  toUnc(target) {
    const uncNs = toUncNamespace(target.namespace)
    const distro = namespaceDistroName(target.namespace)
    if (uncNs === null || distro === null) return fail('namespace-mismatch')

    // POSIX 値を win32 のセパレータへ移し、share 接頭辞と合成する。
    const withinShare = target.value.split('/').join('\\')
    const composed = `${UNC_PREFIX}${distro}${withinShare === '\\' ? '' : withinShare}`

    // **合成後に再正規化し、share 配下への封じ込めを検証する。**
    // `makeRuntimePath` が `.` / `..` とバックスラッシュを既に拒否しているため
    // 構造上ここを抜ける値は無いが、長パス接頭辞つきの形など正規化を迂回する表現に
    // 対しても効かせるため、形式を問わず検証する。
    const normalized = win32.normalize(composed)
    const shareRoot = `${UNC_PREFIX}${distro}`
    if (normalized !== shareRoot && !normalized.startsWith(`${shareRoot}\\`)) {
      return fail('outside-share')
    }

    return makeWslUncPath(uncNs, normalized)
  },

  fromUnc(target) {
    const wslNs = toWslNamespace(target.namespace)
    const distro = namespaceDistroName(target.namespace)
    if (wslNs === null || distro === null) return fail('namespace-mismatch')

    const shareRoot = `${UNC_PREFIX}${distro}`
    if (!target.value.startsWith(shareRoot)) return fail('distro-mismatch')

    const rest = target.value.slice(shareRoot.length)
    const posixValue = rest.length === 0 ? '/' : rest.split('\\').join('/')
    return makeRuntimePath(wslNs, posix.normalize(posixValue))
  }
}

/** ホスト名前空間 (win32 意味論) の操作。同じモジュールが別の名前で公開する。 */
export const hostPathOps: HostPathOps = {
  join(base, ...segments) {
    for (const s of segments) {
      if (!isValidHostSegment(s)) return fail('invalid-format')
    }
    const joined = win32.join(base.value, ...segments)
    return makeHostPath(win32.normalize(joined))
  },

  parent(target) {
    const parentValue = win32.dirname(target.value)
    if (parentValue === target.value) return null
    const result = makeHostPath(parentValue)
    return result.ok ? result.path : null
  },

  basename(target) {
    return win32.basename(target.value)
  },

  equals(a, b) {
    // ドライブレターは `makeHostPath` で大文字に正規化済み。値の比較で足りる。
    return a.value === b.value
  }
}

/**
 * 変換の入口検証 (data-model §7)。
 *
 * **すべての変換関数が入口で名前空間識別子の一致を検証する。**
 * 型では防げないため (§1)、ここが別ディストロのパスを取り違える唯一の防御である。
 */
function assertMappingDirection(
  mapping: PathMapping,
  expectedFrom: NamespaceId,
  expectedTo: NamespaceId
): PathErrorReason | null {
  if (mapping.from !== expectedFrom) return 'namespace-mismatch'
  if (mapping.to !== expectedTo) return 'namespace-mismatch'
  return null
}

/**
 * マッピングを適用する。**`from === to` は恒等**であり `entries` を参照しない (§2)。
 *
 * 照合は `domain/workspace/prefix-match.ts` に委譲する。
 * 同じセグメント境界規則を 2 箇所に持つと必ず drift するため、ここでは再実装しない。
 * 依存の向きは `path-api → prefix-match` の一方向であり、逆は作らない —
 * `prefix-match` が標準モジュールに依存しないことが `ui` の builtin 非到達の前提である。
 */
function convertWithMapping(mapping: PathMapping, value: string): string | null {
  if (mapping.from === mapping.to) return value
  const hit = findLongestMatch(mapping, value)
  if (hit === null) return null
  return applyEntry(mapping, hit, value)
}

/** `Win32Runtime` の恒等変換。ランタイムから見たパスは `HostPath` そのものである (§1)。 */
export function identityHost(target: HostPath): HostPath {
  return target
}

/**
 * ビルド出力の相対参照を解決する (`app` レイヤの起動経路専用)。
 *
 * `hostPathOps.join` / `runtimePathOps.join` は `..` を拒否する。未信頼入力に対しては
 * それが正しいが、`out/main` から `out/preload/index.js` を指すような
 * **ビルド出力の相対参照**は `..` を必要とする。
 *
 * **引数は必ずコード上の文字列リテラルであること。未信頼入力を渡してはならない。**
 * 呼び出し箇所がリテラルであることは SH-014 の検証項目で機械的に確認する。
 */
export function resolveBuildPath(
  baseDir: string,
  ...relative: readonly string[]
): PathResult<HostPath> {
  return makeHostPath(win32.resolve(baseDir, ...relative))
}

export type { HostPath, RuntimePath, WslUncPath }
