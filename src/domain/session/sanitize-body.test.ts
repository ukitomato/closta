import { describe, expect, it } from 'vitest'

import { BODY_MAX_BYTES, sanitizeBody } from './sanitize-body'

/**
 * 本文サニタイザの回帰 (C-003 / FR-016 / SC-006)。
 *
 * **核心は「改行・タブを保持し、双方向/C1 制御を除去する」こと。**
 * R-2 の `normalize` (改行除去・512B) を本文に流用しない設計の番人。
 */
describe('sanitizeBody', () => {
  it('改行とタブを保持する (markdown の整形に必須)', () => {
    const md = '# 見出し\n\n- a\n- b\n\n```ts\nconst x = 1\n```'
    const result = sanitizeBody(md)
    expect(result.value).toBe(md)
    expect(result.controlCharsRemoved).toBe(false)
    expect(result.truncated).toBe(false)
  })

  it('タブを保持する', () => {
    expect(sanitizeBody('a\tb').value).toBe('a\tb')
  })

  it('双方向制御文字 (U+202E) を除去し controlCharsRemoved を立てる', () => {
    const result = sanitizeBody('safe‮evil')
    expect(result.value).toBe('safeevil')
    expect(result.controlCharsRemoved).toBe(true)
  })

  it('C1 制御文字を除去する', () => {
    const result = sanitizeBody('a\u0085b')
    expect(result.value).toBe('ab')
    expect(result.controlCharsRemoved).toBe(true)
  })

  it('CR (0x0D) を除去する (\\r\\n を \\n に畳む)', () => {
    const result = sanitizeBody('line1\r\nline2')
    expect(result.value).toBe('line1\nline2')
    expect(result.controlCharsRemoved).toBe(true)
  })

  it('その他の C0 (NUL / ESC / BS) を除去する', () => {
    const result = sanitizeBody('a\u0000b\u001bc\u0008d')
    expect(result.value).toBe('abcd')
    expect(result.controlCharsRemoved).toBe(true)
  })

  it('日本語・絵文字を保持する', () => {
    const s = 'にほんご 😀 全角混在'
    expect(sanitizeBody(s).value).toBe(s)
  })

  it('バイト長上限で切り詰め、コードポイント境界を割らない', () => {
    const big = 'あ'.repeat(BODY_MAX_BYTES) // 各 3 バイト
    const result = sanitizeBody(big, 10)
    expect(result.truncated).toBe(true)
    // 3 バイト文字が 10 バイトに収まるのは 3 文字 (9 バイト) まで
    expect(result.value).toBe('あああ')
    expect([...result.value].every((ch) => ch === 'あ')).toBe(true)
  })

  it('非文字列は空文字に倒す (行を落とさない)', () => {
    expect(sanitizeBody(123).value).toBe('')
    expect(sanitizeBody(null).value).toBe('')
    expect(sanitizeBody(undefined).value).toBe('')
  })
})
