/**
 * 検索語の一致の規則 (O-3 / spec FR-002 / data-model §1)。Thread search・Command palette・会話内検索が共有する。
 *
 * | 規則 | 根拠 |
 * |---|---|
 * | **正規化は書記素ごと** — `Intl.Segmenter` の `grapheme` で分け、書記素ごとに NFKC → 小文字にする。半角カナと半角の濁点 (`ｶﾞ`) は 1 書記素にまとまり、`ガ` に合成される | research R-02 / Principle VIII |
 * | 空白類 (`/\s/u`。TAB・改行・U+3000 を含む) は空白 1 つにまとめ、先頭と末尾を落とす | data-model §1 |
 * | 空白類を除く C0・DEL・C1・双方向制御・ゼロ幅を除く。U+FEFF は `/\s/u` にも当たるが、ゼロ幅として除く (data-model §1 の除去の表が名指す) | data-model §1 |
 * | 一致は正規化した文字列への**字面の部分一致** (`includes`) だけ。**検索語から `RegExp` を組まない** | spec FR-002 (ReDoS を避ける) |
 * | 正規化の規則は `normalizeCore` の 1 か所。`normalizeForSearch(s) === normalizeWithMap(s).text` | data-model §1 |
 * | 位置の表は、正規化後の各 UTF-16 位置が元の文字列のどの書記素 `[start, end)` から来たかを持つ。書記素を割らない | data-model §1 / §2 (強調) |
 */

const GRAPHEMES = new Intl.Segmenter(undefined, { granularity: 'grapheme' })

const WHITESPACE = /\s/u

/** 双方向制御とゼロ幅 (data-model §1)。空白類の判定より先に見る (U+FEFF は `/\s/u` にも当たる)。 */
function isInvisible(code: number): boolean {
  return (
    code === 0x061c ||
    (code >= 0x200b && code <= 0x200f) ||
    (code >= 0x202a && code <= 0x202e) ||
    code === 0x2060 ||
    (code >= 0x2066 && code <= 0x2069) ||
    code === 0xfeff
  )
}

/** 空白類を除いた C0・DEL・C1。 */
function isControl(code: number): boolean {
  return code <= 0x1f || (code >= 0x7f && code <= 0x9f)
}

type CharKind = 'keep' | 'space' | 'drop'

function classify(ch: string): CharKind {
  const code = ch.codePointAt(0) ?? 0
  if (isInvisible(code)) return 'drop'
  if (WHITESPACE.test(ch)) return 'space'
  if (isControl(code)) return 'drop'
  return 'keep'
}

/** 書記素 1 つを畳む。ASCII の 1 文字は NFKC で変わらないので小文字化だけにする (同じ結果を早く出す)。 */
function fold(grapheme: string): string {
  if (grapheme.length === 1 && grapheme.charCodeAt(0) < 0x80) return grapheme.toLowerCase()
  return grapheme.normalize('NFKC').toLowerCase()
}

interface SourceMap {
  readonly starts: number[]
  readonly ends: number[]
}

/** 正規化の規則の唯一の実装。`map` を渡したときだけ位置の表を書く。 */
function normalizeCore(text: string, map: SourceMap | null): string {
  let out = ''
  let pendingSpace = false
  let spaceStart = 0
  let spaceEnd = 0
  for (const { segment, index } of GRAPHEMES.segment(text)) {
    const start = index
    const end = index + segment.length
    for (const ch of fold(segment)) {
      const kind = classify(ch)
      if (kind === 'drop') continue
      if (kind === 'space') {
        // 先頭の空白は落とす。連なりは 1 つにまとめ、元の範囲は連なりの最初から最後までにする。
        if (out.length === 0) continue
        if (!pendingSpace) {
          pendingSpace = true
          spaceStart = start
        }
        spaceEnd = end
        continue
      }
      if (pendingSpace) {
        out += ' '
        map?.starts.push(spaceStart)
        map?.ends.push(spaceEnd)
        pendingSpace = false
      }
      out += ch
      if (map !== null) {
        // サロゲートペアは 2 つの位置を持つ。どちらも同じ書記素を指す。
        for (let i = 0; i < ch.length; i++) {
          map.starts.push(start)
          map.ends.push(end)
        }
      }
    }
  }
  // 末尾の空白 (`pendingSpace` のまま終わった連なり) は出さない。
  return out
}

/** 検索のための正規化 (data-model §1 の 4 段)。 */
export function normalizeForSearch(text: string): string {
  return normalizeCore(text, null)
}

/**
 * 正規化と位置の表 (data-model §1)。`sourceStart[i]` / `sourceEnd[i]` は、正規化後の `text` の UTF-16 位置 `i` が
 * 元の文字列のどの書記素 `[start, end)` から来たか。どちらも `text.length` と同じ長さで、値は元の文字列の書記素の境界。
 */
export function normalizeWithMap(text: string): {
  readonly text: string
  readonly sourceStart: readonly number[]
  readonly sourceEnd: readonly number[]
} {
  const map: SourceMap = { starts: [], ends: [] }
  const normalized = normalizeCore(text, map)
  return { text: normalized, sourceStart: map.starts, sourceEnd: map.ends }
}

/** 検索語を正規化して空白で区切る。空白だけ・空なら `[]` (絞り込まない)。 */
export function toTerms(query: string): readonly string[] {
  const normalized = normalizeForSearch(query)
  return normalized === '' ? [] : normalized.split(' ')
}

/**
 * 正規化済みのフィールドに対する AND の部分一致。`terms` は `toTerms` の結果。語が空なら常に一致。
 * 行ごとの正規化したフィールドを覚えておく呼び出し側 (`session-search.ts`) が使う。規則は `matchesAllTerms` と同じ 1 つ。
 */
export function matchesAllNormalizedTerms(
  normalizedFields: readonly string[],
  terms: readonly string[]
): boolean {
  return terms.every((term) => normalizedFields.some((field) => field.includes(term)))
}

/**
 * すべての語が、正規化したどれかのフィールドに部分一致したら一致 (AND。data-model §1)。`null` のフィールドは対象外。
 * `terms` は `toTerms` の結果。語が空なら常に一致 (絞り込まない)。
 */
export function matchesAllTerms(
  fields: readonly (string | null)[],
  terms: readonly string[]
): boolean {
  if (terms.length === 0) return true
  const normalized: string[] = []
  for (const field of fields) {
    if (field !== null) normalized.push(normalizeForSearch(field))
  }
  return matchesAllNormalizedTerms(normalized, terms)
}
