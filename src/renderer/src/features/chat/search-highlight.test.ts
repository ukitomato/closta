import { afterEach, describe, expect, it } from 'vitest'

import type { SearchHit } from './conversation-search'
import {
  applySearchHighlights,
  clearSearchHighlights,
  collectSearchRanges,
  cssHighlightRegistry,
  SEARCH_HIGHLIGHT,
  SEARCH_HIGHLIGHT_CURRENT,
  type HighlightRegistry
} from './search-highlight'

/**
 * O-3 FE-021 — 会話内検索の強調 (spec FR-005 / US-2 AC8 / 012 data-model §2「強調」「メッセージの要素の引き方」)。
 * jsdom は `CSS.highlights` を持たないので、作った `Range` (どの text node のどこか) を検査する。
 */

const hit = (messageId: string, occurrence: number): SearchHit => ({ messageId, occurrence })

/** `[data-message-id]` の中に `[data-search-text]` を置いた DOM を作る。id は `dataset` で入れる (セレクタに使わない)。 */
function message(id: string, ...texts: (string | Node[])[]): HTMLElement {
  const root = document.createElement('div')
  root.dataset.messageId = id
  for (const text of texts) {
    const wrapper = document.createElement('div')
    wrapper.setAttribute('data-search-text', '')
    if (typeof text === 'string') wrapper.append(document.createTextNode(text))
    else wrapper.append(...text)
    root.append(wrapper)
  }
  return root
}

function transcript(...messages: HTMLElement[]): HTMLElement {
  const root = document.createElement('div')
  root.append(...messages)
  document.body.append(root)
  return root
}

function fakeRegistry(): HighlightRegistry & { readonly entries: Map<string, readonly Range[]> } {
  const entries = new Map<string, readonly Range[]>()
  return {
    entries,
    set(name, ranges) {
      if (ranges.length === 0) entries.delete(name)
      else entries.set(name, ranges)
    },
    delete(name) {
      entries.delete(name)
    }
  }
}

/** Range が掛かる元の本文 (要素の外の文字を含まないこと・書記素を割らないことを見る)。 */
const textOf = (range: Range): string => range.toString()

afterEach(() => {
  document.body.replaceChildren()
})

describe('collectSearchRanges (強調の範囲)', () => {
  it('現在の一致を current に、ほかを others に分ける (出現の順はメッセージの中の text part → 出現)', () => {
    const root = transcript(message('a', 'りんご と りんご'), message('b', 'りんご'))
    const ranges = collectSearchRanges(
      root,
      [hit('a', 0), hit('a', 1), hit('b', 0)],
      hit('a', 1),
      'りんご'
    )
    expect(ranges.current).not.toBeNull()
    expect(textOf(ranges.current!)).toBe('りんご')
    // 「りんご と りんご」の 2 つめ (7 文字目から)。
    expect(ranges.current!.startOffset).toBe(6)
    expect(ranges.others.map(textOf)).toEqual(['りんご', 'りんご'])
  })

  it('text node をまたぐ出現も 1 つの Range で掛ける', () => {
    const strong = document.createElement('strong')
    strong.append('ご')
    const root = transcript(
      message('a', [document.createTextNode('りん'), strong, document.createTextNode('は赤い')])
    )
    const ranges = collectSearchRanges(root, [hit('a', 0)], hit('a', 0), 'りんご')
    expect(ranges.current).not.toBeNull()
    expect(textOf(ranges.current!)).toBe('りんご')
    expect(ranges.current!.startContainer.textContent).toBe('りん')
    expect(ranges.current!.endContainer.textContent).toBe('ご')
  })

  it('正規化で長さの変わる文字 (㍿ / İ / U+FDFA / 合字 / ゼロ幅 / 双方向制御) を含む本文で例外が出ず、元の一致の範囲に掛かる (US-2 AC8)', () => {
    const body = '前\u200b置き ㍿ と İstanbul と \ufdfa と ﬁle と \u202eabc\u202c と 終わり'
    const root = transcript(message('a', body))
    const cases: readonly [string, string][] = [
      // ㍿ (U+337F) は NFKC で 4 文字 (株式会社) になる。
      ['株式会社', '㍿'],
      ['式会', '㍿'],
      ['i̇stanbul', 'İstanbul'],
      // 合字 ﬁ (U+FB01) は NFKC で fi になる。
      ['file', 'ﬁle'],
      // 双方向制御とゼロ幅は除く。強調は元の本文の一致した範囲 (除いた文字を挟んだまま) に掛かる。
      ['abc', 'abc'],
      ['前置き', '前\u200b置き']
    ]
    for (const [query, expected] of cases) {
      let ranges: ReturnType<typeof collectSearchRanges> | null = null
      expect(() => {
        ranges = collectSearchRanges(root, [hit('a', 0)], hit('a', 0), query)
      }).not.toThrow()
      expect(ranges!.current, query).not.toBeNull()
      expect(textOf(ranges!.current!), query).toBe(expected)
    }
    // U+FDFA は NFKC で長い句になる。句の一部を探しても、元の 1 文字 (書記素) に掛かる。
    const phrase = '\ufdfa'.normalize('NFKC')
    const part = phrase.slice(2, 6)
    const ranges = collectSearchRanges(root, [hit('a', 0)], hit('a', 0), part)
    expect(textOf(ranges.current!)).toBe('\ufdfa')
  })

  it('描画に k 番目の出現が無ければ現在の強調を出さない (ほかの出現は強調する)', () => {
    const root = transcript(message('a', 'りんご'))
    const ranges = collectSearchRanges(root, [hit('a', 0), hit('a', 1)], hit('a', 1), 'りんご')
    expect(ranges.current).toBeNull()
    expect(ranges.others).toHaveLength(1)
  })

  it('hits の無いメッセージ・[data-search-text] の外 (tool・Reasoning の描画) には掛けない', () => {
    const a = message('a', 'りんご')
    const outside = document.createElement('div')
    outside.append('りんご (tool の結果)')
    a.append(outside)
    const root = transcript(a, message('b', 'りんご'))
    const ranges = collectSearchRanges(root, [hit('a', 0)], null, 'りんご')
    expect(ranges.others).toHaveLength(1)
    expect(a.contains(ranges.others[0]!.startContainer)).toBe(true)
    expect(outside.contains(ranges.others[0]!.startContainer)).toBe(false)
  })

  it('正規化した語が空・一致が無ければ空', () => {
    const root = transcript(message('a', 'りんご'))
    expect(collectSearchRanges(root, [hit('a', 0)], hit('a', 0), '  ')).toEqual({
      others: [],
      current: null
    })
    expect(collectSearchRanges(root, [], null, 'りんご')).toEqual({ others: [], current: null })
  })

  it('hits の id が `a"],[data-message-id="b` や `"` `\\` `]` `,` 改行を含んでも例外が出ず、その id のメッセージだけに掛かる', () => {
    const tricky = 'a"],[data-message-id="b'
    const odd = 'x"\\],\ny'
    const target = message(tricky, 'りんご')
    const decoy = message('b', 'りんご')
    const oddMessage = message(odd, 'りんご')
    const root = transcript(target, decoy, oddMessage)
    let ranges: ReturnType<typeof collectSearchRanges> | null = null
    expect(() => {
      ranges = collectSearchRanges(root, [hit(tricky, 0), hit(odd, 0)], hit(tricky, 0), 'りんご')
    }).not.toThrow()
    expect(target.contains(ranges!.current!.startContainer)).toBe(true)
    expect(ranges!.others).toHaveLength(1)
    expect(oddMessage.contains(ranges!.others[0]!.startContainer)).toBe(true)
    // id が `b` のメッセージには掛からない (セレクタの結合として当たらない)。
    const all = [ranges!.current!, ...ranges!.others]
    expect(all.some((range) => decoy.contains(range.startContainer))).toBe(false)
  })
})

describe('applySearchHighlights / clearSearchHighlights (登録先)', () => {
  it('2 つの名前に掛け、DOM を書き換えない。消すと 2 つとも消える', () => {
    const root = transcript(message('a', '<b>りんご</b> と りんご'), message('b', 'りんご'))
    const before = root.innerHTML
    const registry = fakeRegistry()
    applySearchHighlights(
      registry,
      root,
      [hit('a', 0), hit('a', 1), hit('b', 0)],
      hit('b', 0),
      'りんご'
    )
    expect(registry.entries.get(SEARCH_HIGHLIGHT)).toHaveLength(2)
    expect(registry.entries.get(SEARCH_HIGHLIGHT_CURRENT)).toHaveLength(1)
    // 強調の前後で DOM が変わらない (HTML を組まない・要素を差し込まない)。
    expect(root.innerHTML).toBe(before)
    expect(root.querySelector('b')).toBeNull()

    clearSearchHighlights(registry)
    expect(registry.entries.size).toBe(0)
    expect(root.innerHTML).toBe(before)
  })

  it('jsdom (CSS Custom Highlight API が無い) では CSS の登録先を作らない', () => {
    expect(cssHighlightRegistry()).toBeNull()
  })
})
