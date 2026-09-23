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

/**
 * Win32 のデバイス名前空間を経由した UNC の綴り (pr-gate Round 2 / H2-001)。
 *
 * `\\\\?\\UNC\\<server>\\<share>\\...` は
 * `\\\\<server>\\<share>\\...` と**同じ場所を指す**。
 * 長パス (260 文字超) を扱うときに Windows API や一部のツールがこの形を吐くため、
 * セッションの `cwd` に現れうる。
 *
 * **接頭辞を 2 つしか見ていなかったため、この綴りが判定を素通りしていた。**
 * 素通りした値は `/` 綴りだと `raw.startsWith('/')` に当たり、
 * **由来 config の所在を継承した `wsl-inherited` として確定していた** (FR-016 違反)。
 * `\\\\` 綴りだと表示用の生値として UNC 全文が境界を越えていた (FR-042 違反)。
 * どちらも Round 1 で塞いだつもりの経路であり、**綴りを 1 つ変えるだけで復活していた**。
 */
const UNC_DEVICE_PREFIXES = ['\\\\?\\UNC\\', '\\\\.\\UNC\\'] as const

/**
 * 区切りをバックスラッシュへ寄せ、デバイス名前空間の接頭辞を剥がす。
 *
 * **綴りの正規化をこの 1 関数に集める。** 以前は `looksLikeWslUnc` /
 * `uncRelativeDisplay` / `parseWslUncPath` がそれぞれ区切りの寄せを書いており、
 * **接頭辞を 1 つ足すと 3 箇所を直す必要があった**。
 */
function toUncSpelling(raw: string): string {
  const backslashed = raw.replace(/\//g, '\\')
  const lower = backslashed.toLowerCase()
  for (const device of UNC_DEVICE_PREFIXES) {
    if (lower.startsWith(device.toLowerCase())) {
      /* 剥がしたぶんだけ `\\\\` を戻す。指す場所は変わらない。 */
      return '\\\\' + backslashed.slice(device.length)
    }
  }
  return backslashed
}

/** `parseWslUncPath` の結果。ディストロ名は**検証済み**である。 */
export interface ParsedWslUnc {
  readonly distroName: string
  readonly unc: WslUncPath
}

/**
 * **生の UNC 文字列**を解析し、ディストロ名と正規化した `WslUncPath` を返す (BE-010b)。
 *
 * `makeWslUncPath` は名前空間識別子を必須引数として要求するため、
 * **ディストロ名を先に知らなければ呼べない。** アプリ外のプロセスが記録した
 * 作業ディレクトリ (セッションの `cwd`) は生文字列で与えられるので、
 * 「名前空間を先に決める」形が成立しない。その 1 点を埋めるのが本関数である。
 *
 * **この関数が UNC の綴りに関する知識を持つ唯一の場所である。**
 * 呼び出し側 (`domain/session` の出自判定) は文字列操作で接頭辞を剥がさない —
 * 剥がす実装は R-1 の gate が繰り返し塞いだ「境界での再 branding」と同じ形になる。
 *
 * 受理する綴り (いずれも実機で成立することを確認済み。research R-01):
 *
 * | 綴り | 例 |
 * |---|---|
 * | 新しい共有名 | `\\wsl.localhost\Ubuntu\home\y` |
 * | legacy 共有名 | `\\wsl$\Ubuntu\home\y` |
 * | フォワードスラッシュ | `//wsl.localhost/Ubuntu/home/y` |
 *
 * **接頭辞の大小は問わない** (UNC のホスト名は大小を区別しない)。
 * **ディストロ名の大小は区別する** — 検出結果の表記と完全一致で照合するため (AD-025 §2)。
 */
/**
 * UNC の綴りに見えるか (pr-gate Round 1 / C-001 / platform H-001)。
 *
 * **解析の成否と接頭辞の一致を分ける。** `parseWslUncPath` は
 * ディストロ名が不正・4096 文字超・制御文字を含むといった理由で失敗するが、
 * **失敗した値が UNC でなくなるわけではない**。
 * 分けずに扱うと 2 つの欠陥が出る。
 *
 * 1. 失敗した UNC 文字列が「その他」に落ちて**表示用の生値として境界を越える** (FR-042)
 * 2. フォワードスラッシュ綴り (`//wsl.localhost/...`) が `/` 始まりの判定に当たり、
 *    **POSIX 形式として由来 config の所在を継承する** (FR-016 / FR-018)
 *
 * **綴りの知識をここに置く。** 呼び出し側が文字列比較で接頭辞を判定すると、
 * UNC の綴りが 2 箇所に分かれる (AD-029 §3 / 検証項目 12 は
 * UNC リテラルを持てるモジュールを `path-types.ts` と `path-api.ts` に限っている)。
 */
export function looksLikeWslUnc(raw: string): boolean {
  const lower = toUncSpelling(raw).toLowerCase()
  return (
    lower.startsWith(UNC_PREFIX.toLowerCase()) || lower.startsWith(UNC_LEGACY_PREFIX.toLowerCase())
  )
}

/**
 * UNC の綴りから**所在を伴わない表示用文字列**を取り出す (pr-gate Round 1 / C-001)。
 *
 * FR-042 は「変換できない値は形の分類 (参照キー) と、
 * **所在を伴わない安全な表示用文字列**で表す」と定めている。この関数が後半を担う。
 *
 * **接頭辞とディストロ名を落とす。** 落とすのは 2 つの理由からである。
 * 1. UNC 接頭辞を境界に出さない (FR-042 / AD-025「UNC は `infra` の内側」)
 * 2. 解析に失敗したディストロ名は検証を通っていない値であり、そのまま出せない
 *
 * **文字列操作を呼び出し側に書かせない。** 接頭辞の綴りを知ってよいのは
 * `path-types.ts` と本モジュールだけである (AD-029 §3 / 検証項目 12)。
 *
 * @returns 共有名以降の残余。取り出せなければ `null`。
 */
export function uncRelativeDisplay(raw: string): string | null {
  if (!looksLikeWslUnc(raw)) return null

  const backslashed = toUncSpelling(raw)
  const lower = backslashed.toLowerCase()
  const prefix = lower.startsWith(UNC_PREFIX.toLowerCase()) ? UNC_PREFIX : UNC_LEGACY_PREFIX

  /*
   * **先頭の区切りの重なりを落としてから共有名の境界を取る**
   * (pr-gate Round 2 / H2-001)。
   *
   * `\\\\wsl.localhost\\\\-bad\\home\\y` (区切りが 2 つ) では
   * `afterPrefix` が `\\-bad\\home\\y` になり `indexOf` が **0** を返していた。
   * ディストロ名の境界が「先頭」と判定され、
   * **検証を通っていないディストロ名 `-bad` がそのまま残余として出ていた**。
   * Round 1 で書いた `expect(display).not.toContain('-bad')` は、
   * 区切りを 1 つ増やすだけで破れていた。
   */
  const afterPrefix = backslashed.slice(prefix.length).replace(/^\\+/, '')
  const sep = afterPrefix.indexOf('\\')
  /* ディストロ名しか無い (残余が無い) 値は、出せるものが無い。 */
  if (sep < 0) return null

  const rest = afterPrefix.slice(sep).replace(/\\/g, '/')
  return rest.length === 0 ? null : rest
}

export function parseWslUncPath(raw: string): PathResult<ParsedWslUnc> {
  if (raw.length === 0) return fail('invalid-format')

  // 区切りをバックスラッシュに寄せる。POSIX パスはこの時点で接頭辞に一致しなくなる。
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
