import { isHostNamespace, type NamespaceId } from '@domain/runtime/namespace'
import type { PathMapping, PathMappingEntry } from '@domain/runtime/path-mapping'

/**
 * 接頭辞照合 (data-model §2)。
 *
 * **標準モジュール (`node:path` 等) に一切依存しない。**
 * 越境判定に必要な照合はここに置き、解決関数 (`resolution.ts`) はこちらを使う。
 * パス API の実装モジュールは標準モジュールに依存するため、
 * `ui` が `domain` を型以外で参照しうる経路を builtin 非依存に保つ必要がある
 * (FR-035 / SH-013 が `ui ⇢ node builtins` の推移的到達を禁止する)。
 *
 * 文字列操作のみで成立する規則だけを置く。実際の正規化・結合は
 * パス API の実装モジュールが行う。
 */

/** セパレータ。ホスト名前空間は `\`、それ以外は `/`。 */
export function separatorFor(namespace: NamespaceId): string {
  return isHostNamespace(namespace) ? '\\' : '/'
}

function stripTrailing(prefix: string, separator: string): string {
  return prefix.endsWith(separator) ? prefix.slice(0, -separator.length) : prefix
}

/**
 * 接頭辞が**パスセグメント境界**で一致するかを判定する。
 *
 * 文字列の前方一致では `/mnt/cdrom` が `/mnt/c` に一致し、
 * マウント位置が `/c` になる構成では `/certs` や `/dev` まで誤変換の対象になる。
 */
export function matchesAtSegmentBoundary(
  value: string,
  prefix: string,
  separator: string
): boolean {
  const normalized = stripTrailing(prefix, separator)
  if (normalized.length === 0) return true
  if (!value.startsWith(normalized)) return false
  const rest = value.slice(normalized.length)
  return rest.length === 0 || rest.startsWith(separator)
}

/**
 * 値に適用できる entry のうち**最長の接頭辞**を持つものを返す。
 * 該当が無ければ `null` (= 変換不能。推測で対応を作らない)。
 */
export function findLongestMatch(mapping: PathMapping, value: string): PathMappingEntry | null {
  const separator = separatorFor(mapping.from)
  let best: PathMappingEntry | null = null
  for (const entry of mapping.entries) {
    if (!matchesAtSegmentBoundary(value, entry.fromPrefix, separator)) continue
    if (best === null || entry.fromPrefix.length > best.fromPrefix.length) best = entry
  }
  return best
}

/** 一致した entry を使って接頭辞を置き換える。セパレータも変換先の意味論に合わせる。 */
export function applyEntry(mapping: PathMapping, entry: PathMappingEntry, value: string): string {
  const fromSep = separatorFor(mapping.from)
  const toSep = separatorFor(mapping.to)
  const fromPrefix = stripTrailing(entry.fromPrefix, fromSep)
  const toPrefix = stripTrailing(entry.toPrefix, toSep)

  const rest = value.slice(fromPrefix.length)
  const converted = rest.split(fromSep).join(toSep)
  const joined = `${toPrefix}${converted}`
  return joined.length === 0 ? toSep : joined
}

/**
 * 値が mapping のいずれかの接頭辞配下にあるか。
 * 所在 `wsl:<D>` のパスが当該ディストロの Windows マウント配下かの判定に使う (§8 第 3 段)。
 *
 * **特定のマウント位置を決め打ちしない** — マッピングを基準にする (FR-024)。
 */
export function isUnderAnyPrefix(mapping: PathMapping, value: string): boolean {
  return findLongestMatch(mapping, value) !== null
}
