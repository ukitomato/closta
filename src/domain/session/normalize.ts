/**
 * 会話由来文字列の正規化 (FR-049 / SC-015)。
 *
 * **対象は config ディレクトリ由来の値 = アプリ外のプロセスが書いた未信頼入力である。**
 * R-1 は renderer 発の値に制御文字・長さ・文字種の拘束を掛けている。
 * **方向が逆になったからといって外さない。**
 *
 * `summary` / `firstPrompt` / `customTitle` は SDK の定義上「会話由来の逐語文字列」を
 * 含みうる (`firstPrompt` は "First meaningful user prompt in the session.")。
 * **「要約だから安全」と扱わない** (FR-044)。
 *
 * **境界のサイズ制御は main の責務、表示のための省略は `ui` の責務** (data-model §3)。
 * 本モジュールは前者を担う。
 */

/**
 * 会話由来の短い文字列の上限 (バイト)。
 *
 * 一覧の 1 行に出る値であり、これを超える分は表示に寄与しない。
 * 実測では 1 セッションの JSONL が最大 25 MB あり、`firstPrompt` に
 * 極端に長い値が入りうる。**上限が無いと structured-clone の応答サイズが膨らむ**
 * (R-1 が `browseDirectory` に `too-many-entries` を設けたのと同じ理由)。
 */
export const TEXT_MAX_BYTES = 512

/** 表示用パス文字列の上限 (バイト)。パスは長くなりうるので別枠にする。 */
export const PATH_DISPLAY_MAX_BYTES = 1024

/**
 * 除去する制御文字。
 *
 * - C0 (`U+0000`〜`U+001F`) / DEL (`U+007F`) / C1 (`U+0080`〜`U+009F`)
 * - **双方向制御文字** — `cwdDisplay` に `U+202E` を仕込むと、
 *   「未登録フォルダ」の行が登録済みフォルダのパスに見える形に偽装でき、
 *   FR-026 の登録導線で**利用者に誤った判断をさせられる**
 */
function isRemovable(codePoint: number): boolean {
  if (codePoint < 0x20 || codePoint === 0x7f) return true
  if (codePoint >= 0x80 && codePoint <= 0x9f) return true
  // 双方向制御文字 (LRM / RLM / ALM / LRE..RLO / PDF / LRI..PDI)
  if (codePoint === 0x061c || codePoint === 0x200e || codePoint === 0x200f) return true
  if (codePoint >= 0x202a && codePoint <= 0x202e) return true
  if (codePoint >= 0x2066 && codePoint <= 0x2069) return true
  return false
}

/** UTF-8 でのバイト長。`TextEncoder` はグローバルであり標準モジュールの import を要さない。 */
function byteLength(value: string): number {
  return new TextEncoder().encode(value).length
}

export interface NormalizedText {
  readonly value: string
  readonly truncated: boolean
  readonly controlCharsRemoved: boolean
}

/**
 * 制御文字を除去し、バイト長上限で切り詰める。
 *
 * **コードポイント境界で切る** — バイト位置で切るとサロゲートペアや
 * マルチバイト文字を割り、壊れた文字が境界を越える。
 */
export function normalizeText(raw: string, maxBytes: number = TEXT_MAX_BYTES): NormalizedText {
  let controlCharsRemoved = false
  let truncated = false
  let used = 0
  let out = ''

  for (const ch of raw) {
    const code = ch.codePointAt(0)!
    if (isRemovable(code)) {
      controlCharsRemoved = true
      continue
    }
    const size = byteLength(ch)
    if (used + size > maxBytes) {
      truncated = true
      break
    }
    out += ch
    used += size
  }

  return { value: out, truncated, controlCharsRemoved }
}

/** 空文字を `null` に寄せた結果。`NormalizedText` との交差型にはできない (`value` の型が違う)。 */
export interface NormalizedOptionalText {
  readonly value: string | null
  readonly truncated: boolean
  readonly controlCharsRemoved: boolean
}

/**
 * 空文字と**空白だけの値**を `null` に寄せる版。DTO の nullable 項目に使う。
 *
 * 前後の空白を落とすのは、境界での正規化として意味を持つ範囲に限る —
 * 制御文字を除去したあとに空白だけが残る値 (`"  \t  "` → `"     "`) は
 * 表示に何も寄与しないので、**「値がある」と見せない**。
 */
export function normalizeOptionalText(
  raw: string | null | undefined,
  maxBytes: number = TEXT_MAX_BYTES
): NormalizedOptionalText {
  if (raw === null || raw === undefined) {
    return { value: null, truncated: false, controlCharsRemoved: false }
  }
  const result = normalizeText(raw, maxBytes)
  const trimmed = result.value.trim()
  return { ...result, value: trimmed.length === 0 ? null : trimmed }
}

/**
 * 時刻・サイズの検証 (FR-049)。
 *
 * **有限の安全整数でなければ `null` に落とす。** `NaN` / `Infinity` / 負の時刻が
 * 並べ替えと描画に流れると、行の位置が不定になる。
 * **行そのものは落とさない** — 「不明」として扱う (FR-028 の精神に合わせる)。
 */
export function normalizeEpochMs(raw: unknown): number | null {
  if (typeof raw !== 'number') return null
  if (!Number.isSafeInteger(raw)) return null
  if (raw < 0) return null
  return raw
}

/** ファイルサイズ。負値と非整数を落とす。 */
export function normalizeByteCount(raw: unknown): number | null {
  return normalizeEpochMs(raw)
}

/** 正規化の結果をまとめた印 (DTO の `normalized` に対応)。 */
export interface NormalizationMarks {
  readonly truncated: boolean
  readonly controlCharsRemoved: boolean
}

/** 複数フィールドの印を畳む。1 つでも起きたら立てる。 */
export function foldMarks(parts: readonly NormalizationMarks[]): NormalizationMarks {
  return {
    truncated: parts.some((p) => p.truncated),
    controlCharsRemoved: parts.some((p) => p.controlCharsRemoved)
  }
}
