import { describe, expect, it } from 'vitest'

import {
  foldMarks,
  normalizeByteCount,
  normalizeEpochMs,
  normalizeOptionalText,
  normalizeText,
  TEXT_MAX_BYTES
} from './normalize'

/**
 * 会話由来文字列の正規化の**境界値を全数** (BE-016b / SC-015 / FR-049)。
 *
 * ここが本 feature の**唯一の露出面制御**である (FR-044 と対)。
 * `firstPrompt` は SDK の定義上「会話本文の逐語」であり、
 * 「要約だから安全」という前提は成立しない。
 */

describe('制御文字の除去', () => {
  it.each([
    ['C0 (改行)', 'a\nb'],
    ['C0 (タブ)', 'a\tb'],
    ['DEL', 'ab'],
    ['C1', 'ab']
  ])('%s を除去し、印を立てる', (_label, raw) => {
    const result = normalizeText(raw)
    expect(result.value).toBe('ab')
    expect(result.controlCharsRemoved).toBe(true)
    expect(result.truncated).toBe(false)
  })

  /**
   * **双方向制御文字を落とすのは表示上の偽装を防ぐためである。**
   * `cwdDisplay` に `U+202E` を仕込むと「未登録フォルダ」の行が
   * 登録済みフォルダのパスに見える形に偽装でき、FR-026 の登録導線で
   * 利用者に誤った判断をさせられる。
   */
  it.each([
    ['RLO (U+202E)', 'a‮b'],
    ['LRM (U+200E)', 'a‎b'],
    ['RLM (U+200F)', 'a‏b'],
    ['ALM (U+061C)', 'a؜b'],
    ['LRI (U+2066)', 'a⁦b'],
    ['PDI (U+2069)', 'a⁩b']
  ])('%s を除去する', (_label, raw) => {
    const result = normalizeText(raw)
    expect(result.value).toBe('ab')
    expect(result.controlCharsRemoved).toBe(true)
  })

  it('通常の文字は残す (日本語・絵文字を壊さない)', () => {
    const raw = 'セッション一覧 🎉'
    const result = normalizeText(raw)
    expect(result.value).toBe(raw)
    expect(result.controlCharsRemoved).toBe(false)
  })
})

describe('バイト長上限での切り詰め', () => {
  it('上限ちょうどでは切り詰めない', () => {
    const raw = 'a'.repeat(TEXT_MAX_BYTES)
    const result = normalizeText(raw)
    expect(result.value).toHaveLength(TEXT_MAX_BYTES)
    expect(result.truncated).toBe(false)
  })

  it('上限を 1 バイト超えたら切り詰め、印を立てる', () => {
    const raw = 'a'.repeat(TEXT_MAX_BYTES + 1)
    const result = normalizeText(raw)
    expect(result.value).toHaveLength(TEXT_MAX_BYTES)
    expect(result.truncated).toBe(true)
  })

  it('**コードポイント境界で切る** — マルチバイト文字を割らない', () => {
    // 「あ」は UTF-8 で 3 バイト。上限を 4 にすると 1 文字だけ入る。
    const result = normalizeText('ああ', 4)
    expect(result.value).toBe('あ')
    expect(result.truncated).toBe(true)
    // 壊れた文字が残っていないこと (置換文字が現れない)。
    expect(result.value).not.toContain('�')
  })

  it('サロゲートペア (絵文字) を割らない', () => {
    // 🎉 は UTF-8 で 4 バイト。上限 3 では 1 文字も入らない。
    const result = normalizeText('🎉', 3)
    expect(result.value).toBe('')
    expect(result.truncated).toBe(true)
  })

  it('制御文字の除去は上限の消費に数えない', () => {
    const result = normalizeText(`${'a'.repeat(TEXT_MAX_BYTES)}\n\n\n`)
    expect(result.value).toHaveLength(TEXT_MAX_BYTES)
    expect(result.controlCharsRemoved).toBe(true)
    // 制御文字を除いた本体は上限内なので切り詰めは起きない。
    expect(result.truncated).toBe(false)
  })
})

describe('nullable 項目', () => {
  it.each([null, undefined, '', '   \t  '])('%p は null になる', (raw) => {
    expect(normalizeOptionalText(raw as string | null | undefined).value).toBeNull()
  })

  it('値があれば正規化して返す', () => {
    const result = normalizeOptionalText('a\nb')
    expect(result.value).toBe('ab')
    expect(result.controlCharsRemoved).toBe(true)
  })
})

describe('数値の検証', () => {
  it.each([
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['-Infinity', Number.NEGATIVE_INFINITY],
    ['負値', -1],
    ['非整数', 1.5],
    ['安全整数の外', Number.MAX_SAFE_INTEGER + 2],
    ['文字列', '1700000000000'],
    ['null', null],
    ['undefined', undefined]
  ])('%s は null に落ちる', (_label, raw) => {
    expect(normalizeEpochMs(raw)).toBeNull()
  })

  it('正当な epoch ms は通る', () => {
    expect(normalizeEpochMs(1_700_000_000_000)).toBe(1_700_000_000_000)
  })

  it('0 は通る (時刻として正当な値である)', () => {
    expect(normalizeEpochMs(0)).toBe(0)
  })

  it('ファイルサイズも同じ規則で検証する', () => {
    expect(normalizeByteCount(25_767_786)).toBe(25_767_786)
    expect(normalizeByteCount(-1)).toBeNull()
  })
})

describe('印の畳み込み', () => {
  it('1 つでも起きたら立てる', () => {
    expect(
      foldMarks([
        { truncated: false, controlCharsRemoved: false },
        { truncated: true, controlCharsRemoved: false }
      ])
    ).toEqual({ truncated: true, controlCharsRemoved: false })
  })

  it('何も起きなければ立てない', () => {
    expect(foldMarks([{ truncated: false, controlCharsRemoved: false }])).toEqual({
      truncated: false,
      controlCharsRemoved: false
    })
  })

  it('空でも成立する', () => {
    expect(foldMarks([])).toEqual({ truncated: false, controlCharsRemoved: false })
  })
})
