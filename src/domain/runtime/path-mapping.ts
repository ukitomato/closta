import { isHostNamespace, type NamespaceId } from './namespace'

/**
 * 2 つの名前空間のあいだの対応 (data-model §2)。
 *
 * 取得元はマウントオプションが示すドライブ対応である (AD-015 §6)。
 * 特定のマウント位置を決め打ちせず、ファイルシステム種別でフィルタもしない (FR-024)。
 *
 * ドライブレターを鍵に固定しないのは、I-1 の 2 ホップ目 (WSL → コンテナ) が
 * 両端にドライブを持たないためである (AD-012)。
 */

export interface PathMappingEntry {
  /** `from` 名前空間側の接頭辞。 */
  readonly fromPrefix: string
  /** `to` 名前空間側の接頭辞。 */
  readonly toPrefix: string
}

export interface PathMapping {
  readonly from: NamespaceId
  readonly to: NamespaceId
  readonly entries: readonly PathMappingEntry[]
  readonly acquiredAt: number
}

export type MappingErrorReason = 'empty-entries' | 'malformed-entry' | 'not-composable'

export type MappingResult =
  | { readonly ok: true; readonly mapping: PathMapping }
  | { readonly ok: false; readonly reason: MappingErrorReason }

function hasForbiddenCharacter(value: string): boolean {
  for (const ch of value) {
    const code = ch.codePointAt(0)!
    if (code < 0x20 || code === 0x7f || (code >= 0x80 && code <= 0x9f)) return true
  }
  return false
}

/** ホスト側の接頭辞はドライブレター形式であること。 */
function isValidHostPrefix(prefix: string): boolean {
  if (hasForbiddenCharacter(prefix)) return false
  return /^[A-Z]:(\\|\\.*[^\\])?$/.test(prefix)
}

/**
 * ランタイム側の接頭辞は `/` 始まりの絶対 POSIX 接頭辞であること。
 * バックスラッシュを含んではならない。
 */
function isValidPosixPrefix(prefix: string): boolean {
  if (hasForbiddenCharacter(prefix)) return false
  if (prefix.includes('\\')) return false
  if (!prefix.startsWith('/')) return false
  return prefix === '/' || !prefix.endsWith('/')
}

function isValidPrefixFor(namespace: NamespaceId, prefix: string): boolean {
  return isHostNamespace(namespace) ? isValidHostPrefix(prefix) : isValidPosixPrefix(prefix)
}

/**
 * `PathMapping` を生成する。
 *
 * **形式を満たさない要素が 1 つでもあれば取得失敗として扱う** —
 * 部分的に欠けたマッピングを採用しない。呼び出し元は `probeState: failed` に倒す。
 * `entries` が空の場合も未取得として扱う。
 *
 * マッピングは「ディストロ内で実行したスクリプトの出力をホスト側で整形する」経路で生まれる
 * 唯一の入力であり、かつ FR-005 の sandbox 判定 (必須依存の解決パスが Windows マウント
 * 配下かどうか) の基準でもある。検証を欠くと `autoModeSafe` の表明が誤って開く側に倒れる。
 */
export function makePathMapping(
  from: NamespaceId,
  to: NamespaceId,
  entries: readonly PathMappingEntry[],
  acquiredAt: number
): MappingResult {
  if (entries.length === 0) return { ok: false, reason: 'empty-entries' }

  for (const entry of entries) {
    if (!isValidPrefixFor(from, entry.fromPrefix)) return { ok: false, reason: 'malformed-entry' }
    if (!isValidPrefixFor(to, entry.toPrefix)) return { ok: false, reason: 'malformed-entry' }
  }

  return { ok: true, mapping: { from, to, entries, acquiredAt } }
}

/**
 * 2 つのマッピングを合成する。a.to === b.from のときのみ成立する (FR-026)。
 *
 * I-1 の 2 ホップ (host -> wsl:D -> container:X) を同一機構で表現するための拡張点。
 *
 * 照合そのものは domain/workspace/prefix-match.ts が持つ (標準モジュール非依存)。
 * 本モジュールは型と検証だけを持ち、照合アルゴリズムを再実装しない。
 */
export function compose(
  a: PathMapping,
  b: PathMapping,
  match: (mapping: PathMapping, value: string) => PathMappingEntry | null,
  apply: (mapping: PathMapping, entry: PathMappingEntry, value: string) => string
): MappingResult {
  if (a.to !== b.from) return { ok: false, reason: 'not-composable' }

  const entries: PathMappingEntry[] = []
  for (const first of a.entries) {
    const intermediate = first.toPrefix
    const hit = match(b, intermediate)
    if (hit === null) continue
    entries.push({ fromPrefix: first.fromPrefix, toPrefix: apply(b, hit, intermediate) })
  }

  return makePathMapping(a.from, b.to, entries, Math.min(a.acquiredAt, b.acquiredAt))
}
