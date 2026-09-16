import {
  isValidDistroName,
  namespaceDistroName,
  type HostNamespaceId,
  type NamespaceId,
  type UncNamespaceId,
  type WslNamespaceId
} from './namespace'

/**
 * 3 つのパス名前空間 (data-model §1)。
 *
 * 型は相互に代入できない (FR-021)。名前空間識別子は**実行時に保持する** —
 * 識別子はディストロ検出の結果として決まる値であり、静的な型として扱えない。
 *
 * 生の値から直接キャストしない。生成関数を通し形式検証を経る。
 */

declare const hostPathBrand: unique symbol
declare const runtimePathBrand: unique symbol
declare const wslUncPathBrand: unique symbol

/** ホスト (Windows ドライブ) のパス。名前空間は常に `host`。 */
export interface HostPath {
  readonly [hostPathBrand]: true
  readonly namespace: HostNamespaceId
  readonly value: string
}

/** ホスト以外のランタイム名前空間のパス。POSIX 形式。 */
export interface RuntimePath {
  readonly [runtimePathBrand]: true
  readonly namespace: WslNamespaceId
  readonly value: string
}

/** WSL への UNC 経路。`infra/fs` の内側に閉じ、IPC 境界を越えない。 */
export interface WslUncPath {
  readonly [wslUncPathBrand]: true
  readonly namespace: UncNamespaceId
  readonly value: string
}

export type PathErrorReason =
  | 'forbidden-character'
  | 'invalid-format'
  | 'namespace-mismatch'
  | 'distro-mismatch'
  | 'not-mapped'
  | 'outside-share'
  | 'too-long'

export type PathResult<T> =
  { readonly ok: true; readonly path: T } | { readonly ok: false; readonly reason: PathErrorReason }

const ok = <T>(path: T): PathResult<T> => ({ ok: true, path })
const fail = <T>(reason: PathErrorReason): PathResult<T> => ({ ok: false, reason })

/** Windows の MAX_PATH は 260 だが UNC + 長パス対応もあるため緩めに上限を置く。 */
const MAX_PATH_LENGTH = 4096

export const UNC_PREFIX = '\\\\wsl.localhost\\'

/** NUL と制御文字を含まないこと。どの型の値にも共通する (data-model §1)。 */
function hasForbiddenCharacter(value: string): boolean {
  for (const ch of value) {
    const code = ch.codePointAt(0)!
    if (code < 0x20 || code === 0x7f || (code >= 0x80 && code <= 0x9f)) return true
  }
  return false
}

/**
 * `HostPath` を生成する。
 *
 * ドライブレターを大文字に正規化し、末尾セパレータを除去する (data-model §1)。
 * ドライブルート (`C:\`) は末尾セパレータを残す — 除去すると `C:` になり
 * Windows では「カレントディレクトリ相対」を意味する別のパスになるため。
 */
export function makeHostPath(raw: string): PathResult<HostPath> {
  if (raw.length === 0) return fail('invalid-format')
  if (raw.length > MAX_PATH_LENGTH) return fail('too-long')
  if (hasForbiddenCharacter(raw)) return fail('forbidden-character')

  const match = /^([A-Za-z]):[\\/]/.exec(raw)
  if (match === null) return fail('invalid-format')

  const drive = match[1].toUpperCase()
  const rest = raw.slice(2).replace(/\//g, '\\')
  const trimmed = rest.length > 1 ? rest.replace(/\\+$/, '') : '\\'
  const value = `${drive}:${trimmed.length === 0 ? '\\' : trimmed}`

  return ok({ namespace: 'host', value } as HostPath)
}

/**
 * `RuntimePath` を生成する。名前空間識別子を**必須引数**として要求する。
 *
 * - POSIX 絶対パスであること
 * - 末尾セパレータを除去する
 * - `.` / `..` セグメントを含まないこと (解決済みであること)
 * - **バックスラッシュを成分に含まないこと** — POSIX 意味論では通常の文字であり
 *   `.` / `..` の解決規則が発火しないため、含んだまま UNC 形式へ変換すると
 *   値が字面で示す位置とは別の位置に解決される
 */
export function makeRuntimePath(namespace: WslNamespaceId, raw: string): PathResult<RuntimePath> {
  const distro = namespaceDistroName(namespace)
  if (distro === null || !isValidDistroName(distro)) return fail('invalid-format')

  if (raw.length === 0) return fail('invalid-format')
  if (raw.length > MAX_PATH_LENGTH) return fail('too-long')
  if (hasForbiddenCharacter(raw)) return fail('forbidden-character')
  if (raw.includes('\\')) return fail('forbidden-character')
  if (!raw.startsWith('/')) return fail('invalid-format')

  const segments = raw.split('/').filter((s) => s.length > 0)
  if (segments.some((s) => s === '.' || s === '..')) return fail('invalid-format')

  const value = segments.length === 0 ? '/' : `/${segments.join('/')}`
  return ok({ namespace, value } as RuntimePath)
}

/**
 * `WslUncPath` を生成する。名前空間識別子を**必須引数**として要求し、
 * **値に埋め込まれたディストロ名との一致を検証する** (data-model §1)。
 *
 * 一致を検証しないと `unc:A` のタグを持つ B のパスが作れてしまう。
 */
export function makeWslUncPath(namespace: UncNamespaceId, raw: string): PathResult<WslUncPath> {
  const distro = namespaceDistroName(namespace)
  if (distro === null || !isValidDistroName(distro)) return fail('invalid-format')

  if (raw.length === 0) return fail('invalid-format')
  if (raw.length > MAX_PATH_LENGTH) return fail('too-long')
  if (hasForbiddenCharacter(raw)) return fail('forbidden-character')
  if (!raw.startsWith(UNC_PREFIX)) return fail('invalid-format')

  const afterPrefix = raw.slice(UNC_PREFIX.length)
  const sep = afterPrefix.indexOf('\\')
  const embedded = sep < 0 ? afterPrefix : afterPrefix.slice(0, sep)
  if (embedded !== distro) return fail('distro-mismatch')

  const rest = sep < 0 ? '' : afterPrefix.slice(sep)
  const trimmed = rest.replace(/\\+$/, '')
  const value = `${UNC_PREFIX}${distro}${trimmed}`

  return ok({ namespace, value } as WslUncPath)
}

/** 表示・IPC 用の素の値。brand は境界で退化するため DTO では名前空間を明示して運ぶ。 */
export interface PathParts {
  readonly namespace: NamespaceId
  readonly value: string
}

export function pathParts(path: HostPath | RuntimePath | WslUncPath): PathParts {
  return { namespace: path.namespace, value: path.value }
}
