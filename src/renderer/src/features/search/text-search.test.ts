import { describe, expect, it } from 'vitest'

import {
  matchesAllNormalizedTerms,
  matchesAllTerms,
  normalizeForSearch,
  normalizeWithMap,
  toTerms
} from './text-search'

/** O-3 FE-001 — 検索語の一致の規則 (spec FR-002 / SC-001 / data-model §1)。 */

/** 元の文字列の書記素の境界 (0 と末尾を含む)。 */
function graphemeBoundaries(text: string): ReadonlySet<number> {
  const boundaries = new Set<number>([0, text.length])
  for (const { index } of new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(
    text
  )) {
    boundaries.add(index)
  }
  return boundaries
}

describe('normalizeForSearch (正規化の 4 段)', () => {
  it('全角 / 半角の英数とカナを揃える (NFKC)', () => {
    expect(normalizeForSearch('ＡＢＣ１２３')).toBe('abc123')
    expect(normalizeForSearch('ｱｲｳ')).toBe('アイウ')
  })

  it('大文字 / 小文字を揃える', () => {
    expect(normalizeForSearch('Hello WORLD')).toBe('hello world')
  })

  it('半角カナと半角の濁点・半濁点を 1 文字に合成する (書記素ごと)', () => {
    expect(normalizeForSearch('ｶﾞ')).toBe('ガ')
    expect(normalizeForSearch('ｶﾞ')).toHaveLength(1)
    expect(normalizeForSearch('ｶﾞｲﾄﾞ')).toBe('ガイド')
    expect(normalizeForSearch('ﾊﾟﾝ')).toBe('パン')
  })

  it('TAB・改行・U+3000 を空白 1 つに圧縮し、先頭と末尾を落とす', () => {
    expect(normalizeForSearch('a\t\tb\n\nc　　d')).toBe('a b c d')
    expect(normalizeForSearch('a\r\nb')).toBe('a b')
    expect(normalizeForSearch(' \t　a  b\n ')).toBe('a b')
  })

  it('C0・DEL・C1・双方向制御・ゼロ幅を除く', () => {
    expect(normalizeForSearch('a\u0000b\u0007c\u001bd')).toBe('abcd')
    expect(normalizeForSearch('a\u007fb')).toBe('ab')
    expect(normalizeForSearch('a\u0085b\u009fc')).toBe('abc')
    expect(normalizeForSearch('a‮b⁦c‏d؜e⁩f')).toBe('abcdef')
    expect(normalizeForSearch('a​b‌c‍d⁠e﻿f')).toBe('abcdef')
  })

  it('除いた文字は空白の連なりを分けない', () => {
    expect(normalizeForSearch('a ​ b')).toBe('a b')
    expect(normalizeForSearch('a ‮\t b')).toBe('a b')
  })

  it('空・空白だけ・制御文字だけは空になる', () => {
    expect(normalizeForSearch('')).toBe('')
    expect(normalizeForSearch(' \t\n　')).toBe('')
    expect(normalizeForSearch('​‮\u0000')).toBe('')
  })
})

describe('toTerms', () => {
  it('正規化して空白で区切る', () => {
    expect(toTerms('  Ｒｅｖｉｅｗ　設計  ')).toEqual(['review', '設計'])
  })

  it('空白だけの語は [] (絞り込まない)', () => {
    expect(toTerms('')).toEqual([])
    expect(toTerms('   　\t\n')).toEqual([])
  })
})

describe('matchesAllTerms', () => {
  it('すべての語がどれかのフィールドに部分一致したら一致する (AND)', () => {
    const fields = ['設計レビューの記録', 'feature/main-branch']
    expect(matchesAllTerms(fields, toTerms('レビュー main'))).toBe(true)
    expect(matchesAllTerms(fields, toTerms('レビュー 不在'))).toBe(false)
    expect(matchesAllTerms(fields, toTerms('記録'))).toBe(true)
  })

  it('全角 / 半角・大文字 / 小文字だけ違うフィールドに一致する', () => {
    expect(matchesAllTerms(['ＴＯＤＯ リスト'], toTerms('todo'))).toBe(true)
    expect(matchesAllTerms(['ｶﾞｲﾄﾞ'], toTerms('ガイド'))).toBe(true)
    expect(matchesAllTerms(['ガイド'], toTerms('ｶﾞｲﾄﾞ'))).toBe(true)
  })

  it('null のフィールドは対象外で、例外を出さない', () => {
    expect(matchesAllTerms([null, 'abc'], toTerms('abc'))).toBe(true)
    expect(matchesAllTerms([null, null], toTerms('abc'))).toBe(false)
    expect(matchesAllTerms([], toTerms('abc'))).toBe(false)
  })

  it('空白だけの語では絞り込まない (常に一致)', () => {
    expect(matchesAllTerms([null], toTerms('   '))).toBe(true)
    expect(matchesAllTerms(['x'], [])).toBe(true)
  })

  it('語が 1 つのフィールドに収まらないとき (フィールドの境界をまたぐ) は一致しない', () => {
    expect(matchesAllTerms(['ab', 'cd'], toTerms('bc'))).toBe(false)
  })

  it('`.*` / `(a+)+` / `[` を含む語を字面で扱う (RegExp を組まない)', () => {
    expect(matchesAllTerms(['abc'], toTerms('.*'))).toBe(false)
    expect(matchesAllTerms(['a.*b'], toTerms('.*'))).toBe(true)
    expect(matchesAllTerms(['x(a+)+y'], toTerms('(a+)+'))).toBe(true)
    expect(matchesAllTerms(['aaaa'], toTerms('(a+)+'))).toBe(false)
    expect(matchesAllTerms(['a[b'], toTerms('['))).toBe(true)
    expect(matchesAllTerms(['ab'], toTerms('['))).toBe(false)
    // 正規表現なら破滅的なバックトラックになる語と本文でも、字面の比較なのですぐ返る。
    expect(matchesAllTerms(['a'.repeat(64) + '!'], toTerms('(a+)+$'))).toBe(false)
  })

  it('matchesAllNormalizedTerms は正規化済みのフィールドに同じ規則で一致する', () => {
    const fields = ['ｶﾞｲﾄﾞ の Ｍａｉｎ', null]
    const normalized = fields.flatMap((f) => (f === null ? [] : [normalizeForSearch(f)]))
    for (const query of ['ガイド main', 'ガイド 不在', '', 'の']) {
      expect(matchesAllNormalizedTerms(normalized, toTerms(query))).toBe(
        matchesAllTerms(fields, toTerms(query))
      )
    }
  })
})

describe('normalizeWithMap (位置の表)', () => {
  const samples = [
    'Hello Ｗｏｒｌｄ',
    'ｶﾞｲﾄﾞ\tと　ｶﾞ',
    'a㍿b',
    'İstanbul',
    'xﷺy',
    'ﬁle ﬂow',
    'a‍b‮c﻿d',
    '👨‍👩‍👧 家族',
    '  前後の空白  ',
    '\r\n改行\r\n',
    ''
  ]

  it('normalizeForSearch(s) === normalizeWithMap(s).text (規則を 2 つ持たない)', () => {
    for (const s of samples) expect(normalizeWithMap(s).text).toBe(normalizeForSearch(s))
  })

  it('表の長さは正規化後の文字列と同じで、値は元の書記素の境界を指す', () => {
    for (const s of samples) {
      const { text, sourceStart, sourceEnd } = normalizeWithMap(s)
      expect(sourceStart).toHaveLength(text.length)
      expect(sourceEnd).toHaveLength(text.length)
      const boundaries = graphemeBoundaries(s)
      for (let i = 0; i < text.length; i++) {
        expect(boundaries.has(sourceStart[i]!)).toBe(true)
        expect(boundaries.has(sourceEnd[i]!)).toBe(true)
        expect(sourceStart[i]!).toBeLessThan(sourceEnd[i]!)
        if (i > 0) expect(sourceStart[i]!).toBeGreaterThanOrEqual(sourceStart[i - 1]!)
      }
    }
  })

  it('長さの変わる文字 (㍿・İ・U+FDFA・合字) は、展開した全部の位置が元の 1 書記素を指す', () => {
    const kabu = normalizeWithMap('a㍿b')
    expect(kabu.text).toBe('a株式会社b')
    expect(kabu.sourceStart.slice(1, 5)).toEqual([1, 1, 1, 1])
    expect(kabu.sourceEnd.slice(1, 5)).toEqual([2, 2, 2, 2])
    expect([kabu.sourceStart[5], kabu.sourceEnd[5]]).toEqual([2, 3])

    const dotted = normalizeWithMap('İx')
    expect(dotted.text).toBe('i̇x')
    expect(dotted.sourceStart).toEqual([0, 0, 1])
    expect(dotted.sourceEnd).toEqual([1, 1, 2])

    // U+FDFA は NFKC で空白を含む 18 文字になる。中の空白も同じ書記素を指す。
    const ligature = normalizeWithMap('ﷺ')
    expect(ligature.text.length).toBeGreaterThan(1)
    expect(ligature.text).toContain(' ')
    expect(new Set(ligature.sourceStart)).toEqual(new Set([0]))
    expect(new Set(ligature.sourceEnd)).toEqual(new Set([1]))

    const fi = normalizeWithMap('ﬁle')
    expect(fi.text).toBe('file')
    expect(fi.sourceStart).toEqual([0, 0, 1, 2])
    expect(fi.sourceEnd).toEqual([1, 1, 2, 3])
  })

  it('半角カナと濁点は 1 書記素として写る', () => {
    const { text, sourceStart, sourceEnd } = normalizeWithMap('aｶﾞb')
    expect(text).toBe('aガb')
    expect([sourceStart[1], sourceEnd[1]]).toEqual([1, 3])
  })

  it('圧縮した空白は、元の空白の連なりの最初から最後までを指す', () => {
    const { text, sourceStart, sourceEnd } = normalizeWithMap('a \t　b')
    expect(text).toBe('a b')
    expect([sourceStart[1], sourceEnd[1]]).toEqual([1, 4])
  })

  it('除いた文字を含む書記素は、残った文字がその書記素全体を指す', () => {
    // ZWJ は直前の文字と 1 書記素にまとまる (Grapheme_Cluster_Break=ZWJ)。
    const { text, sourceStart, sourceEnd } = normalizeWithMap('a‍b')
    expect(text).toBe('ab')
    expect([sourceStart[0], sourceEnd[0]]).toEqual([0, 2])
    expect([sourceStart[1], sourceEnd[1]]).toEqual([2, 3])
  })
})
