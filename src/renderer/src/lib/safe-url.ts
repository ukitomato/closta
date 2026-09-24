/**
 * 会話由来 markdown が生む URL の allowlist (R-3 / FE-035 / FR-020 / contracts C-7)。
 *
 * react-markdown の `urlTransform` として `MarkdownTextPrimitive` に渡す。**生 HTML は描画しない**
 * (rehype-raw を足さない) ので、ここが絞るのは markdown 構文が生む `href` / `src` だけである。
 * 返り値が空文字なら react-markdown は当該属性を落とす。
 *
 * | 属性 | 許可 | 根拠 |
 * |---|---|---|
 * | `a` の `href` | http(s) / 相対 / `data:` 画像 MIME | contracts C-7 |
 * | `img` の `src` | 相対 / `data:` 画像 MIME **のみ** (http(s) リモート画像は除外) | 実 CSP `img-src 'self' data:` と一致 (S-002) |
 * | いずれも | `javascript:` / `vbscript:` / `file:` / その他スキームは除去 | FR-020 |
 *
 * CSP (`img-src 'self' data:` / `default-src 'self'`) を最終防御線に残す (contracts C-7)。
 */

/** react-markdown 既定が許す data 画像 MIME に揃える (gif / jpeg / png / webp)。SVG は script 面が残るため入れない。 */
const SAFE_DATA_IMAGE = /^data:image\/(?:gif|jpe?g|png|webp)[;,]/i

/** URL の scheme を小文字で取り出す。相対 URL (scheme 無し) は `null`。 */
function schemeOf(url: string): string | null {
  const match = /^([a-z][a-z0-9+.-]*):/i.exec(url)
  return match === null ? null : match[1].toLowerCase()
}

/**
 * react-markdown の `urlTransform` は `(url, key, node)` で呼ぶが、node は使わないので受けない
 * (引数を減らした関数は多い側の型に代入可能)。
 *
 * @param url  markdown が解決した URL
 * @param key  属性名。`img` の `src` かどうかで http(s) の可否が変わる
 * @returns 許可する URL。除去する場合は空文字
 */
export function safeUrlTransform(url: string, key: string): string {
  const trimmed = url.trim()
  const scheme = schemeOf(trimmed)

  // scheme 無し = 相対 (`/path` `#anchor` `./x` 等)。常に許可。
  if (scheme === null) return url

  // data: は画像 MIME のみ (a / img とも)。それ以外の data: は除去。
  if (scheme === 'data') return SAFE_DATA_IMAGE.test(trimmed) ? url : ''

  // http(s): link は許可。画像 (`src`) は CSP に合わせて除外する。
  if (scheme === 'http' || scheme === 'https') return key === 'src' ? '' : url

  // http(s) / 相対 / data:画像 以外はすべて除去 (javascript: / vbscript: / file: / mailto: を含む。deny-by-default)。
  return ''
}
