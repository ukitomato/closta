/**
 * transcript **本文用**のサニタイザ (R-3 / C-003 / FR-016 /
 * [data-model.md](../../../specs/003-ui-transcript-rendering/data-model.md) §6)。
 *
 * **R-2 の 1 行要約用 `normalize.ts` を本文に流用しない。** あちらは `codePoint < 0x20` を
 * 一律除去する (= 改行・タブ・CR を落とす) うえ `TEXT_MAX_BYTES = 512` で切り詰めるため、
 * markdown 本文に通すとコードフェンス・段落・インデントが 1 行に潰れ (FR-007 破綻)、512B で
 * 本文が打ち切られる。本文は**改行とタブを保持**しつつ、表示偽装・破壊に使える制御文字だけを除く。
 */

/** 本文の既定バイト上限。要約用の 512B とは別枠 (C-003)。 */
export const BODY_MAX_BYTES = 200_000

/** tool_result 本文の上限。巨大値は切り詰め + 折りたたみ表示にする (data-model §6)。 */
export const TOOL_RESULT_MAX_BYTES = 200_000

export interface SanitizedBody {
  readonly value: string
  readonly truncated: boolean
  readonly controlCharsRemoved: boolean
}

/**
 * 本文で除去する制御文字 (S-005 で実名確定)。
 *
 * - **保持**: TAB (0x09) / LF (0x0A) — markdown の整形に必須
 * - **除去**: それ以外の C0 (0x00-0x08 / 0x0B / 0x0C / **CR 0x0D** / 0x0E-0x1F) / DEL (0x7F) / C1 (0x80-0x9F)
 * - **除去**: 双方向制御文字 (`normalize.ts` と同じ集合。表示偽装防御) —
 *   `U+061C` / `U+200E` / `U+200F` / `U+202A-202E` / `U+2066-2069`
 *
 * CR は `\r\n` を `\n` に畳む意図で除去する (単独 CR も表示差の原因になるため落とす)。
 */
function isRemovableInBody(codePoint: number): boolean {
  if (codePoint === 0x09 || codePoint === 0x0a) return false
  if (codePoint < 0x20 || codePoint === 0x7f) return true
  if (codePoint >= 0x80 && codePoint <= 0x9f) return true
  if (codePoint === 0x061c || codePoint === 0x200e || codePoint === 0x200f) return true
  if (codePoint >= 0x202a && codePoint <= 0x202e) return true
  if (codePoint >= 0x2066 && codePoint <= 0x2069) return true
  return false
}

/** UTF-8 でのバイト長。`TextEncoder` はグローバルであり標準モジュールの import を要さない。 */
function byteLength(value: string): number {
  return new TextEncoder().encode(value).length
}

/**
 * 本文を正規化する。**未信頼入力**として扱い、型が違う値は空文字に倒す (行は落とさない)。
 *
 * **コードポイント境界で切る** — バイト位置で切るとサロゲートペアを割る。
 */
export function sanitizeBody(raw: unknown, maxBytes: number = BODY_MAX_BYTES): SanitizedBody {
  if (typeof raw !== 'string') return { value: '', truncated: false, controlCharsRemoved: false }

  let controlCharsRemoved = false
  let truncated = false
  let used = 0
  let out = ''

  for (const ch of raw) {
    const code = ch.codePointAt(0)!
    if (isRemovableInBody(code)) {
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
