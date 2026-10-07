import { normalizeForSearch, normalizeWithMap } from '@/features/search/text-search'

import type { SearchHit, SearchHitKey } from './conversation-search'
import { MESSAGE_ELEMENT_SELECTOR, SEARCH_TEXT_SELECTOR } from './transcript-context'

/**
 * 会話内検索の強調 (O-3 / spec FR-005 / 012 data-model §2「強調」)。
 *
 * | 規則 | 根拠 |
 * |---|---|
 * | 強調は CSS Custom Highlight API (`CSS.highlights` と `Range`) で掛ける。**DOM を書き換えない・HTML を組まない** | spec FR-005 / research R-03 |
 * | 対象は描かれたメッセージの要素 (`[data-message-id]`) のうち hits のあるものの `[data-search-text]` の中の text node だけ | data-model §2 |
 * | メッセージの要素は固定のセレクタで集め、`dataset.messageId` を hits の id の `Set` で照合する。**id をセレクタに埋め込まない** | data-model §2「メッセージの要素の引き方」 |
 * | `[data-search-text]` ごとに text node を連結して `normalizeWithMap` に通し、正規化後の位置 → 元の書記素の範囲 → (text node, offset) に写す | data-model §2 |
 * | `0 <= offset <= node.length` を満たさない位置は飛ばす (例外を出さない) | spec FR-005 |
 * | `current` の `occurrence` 番目を `closta-search-current`、ほかを `closta-search` に入れる。描画に k 番目が無ければ現在の強調は出さない | data-model §2 |
 * | 登録先は差し替えられる (`HighlightRegistry`)。jsdom は `CSS.highlights` を持たない | data-model §2 |
 * | `::highlight()` の規則は `assets/main.css` (バンドルされる CSS)。実行時に `<style>` も `style` 属性も足さない | spec FR-005 (本番の CSP `style-src 'self'`) |
 */

export const SEARCH_HIGHLIGHT = 'closta-search'
export const SEARCH_HIGHLIGHT_CURRENT = 'closta-search-current'

/** 強調の登録先 (本番は `CSS.highlights`)。 */
export interface HighlightRegistry {
  /** 名前の強調を `ranges` で置き換える。空なら消す。 */
  set(name: string, ranges: readonly Range[]): void
  delete(name: string): void
}

/** `CSS.highlights` (Map と同じ形) のうち使う口だけ。 */
interface HighlightRegistryLike {
  set(name: string, highlight: unknown): unknown
  delete(name: string): unknown
}

/** CSS Custom Highlight API の大域の名前。持たない環境 (jsdom) があるので省略可能として読む。 */
interface HighlightGlobals {
  readonly CSS?: { readonly highlights?: HighlightRegistryLike }
  readonly Highlight?: new (...ranges: Range[]) => unknown
}

/** `CSS.highlights` を登録先にする。CSS Custom Highlight API を持たない環境 (jsdom) では null。 */
export function cssHighlightRegistry(): HighlightRegistry | null {
  const globals = globalThis as HighlightGlobals
  const registry = globals.CSS?.highlights
  const HighlightCtor = globals.Highlight
  if (registry === undefined || HighlightCtor === undefined) return null
  return {
    set(name, ranges) {
      if (ranges.length === 0) registry.delete(name)
      else registry.set(name, new HighlightCtor(...ranges))
    },
    delete(name) {
      registry.delete(name)
    }
  }
}

export interface SearchHighlightRanges {
  /** 現在の一致以外の出現。 */
  readonly others: readonly Range[]
  /** 現在の一致の出現。描画に無ければ null。 */
  readonly current: Range | null
}

const NO_RANGES: SearchHighlightRanges = { others: [], current: null }

interface TextRun {
  readonly nodes: readonly Text[]
  /** 各 text node の、連結した文字列の中の開始位置。 */
  readonly starts: readonly number[]
  readonly text: string
}

function textRunOf(element: Element): TextRun {
  const doc = element.ownerDocument
  const walker = doc.createTreeWalker(element, NodeFilter.SHOW_TEXT)
  const nodes: Text[] = []
  const starts: number[] = []
  let text = ''
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    const data = (node as Text).data
    if (data.length === 0) continue
    nodes.push(node as Text)
    starts.push(text.length)
    text += data
  }
  return { nodes, starts, text }
}

interface Position {
  readonly node: Text
  readonly offset: number
}

/**
 * 連結した文字列の位置を (text node, offset) に写す。`edge` が `start` なら位置を含む node (境界では後ろの node)、
 * `end` (排他) なら位置の直前の文字を含む node を選ぶ。`0 <= offset <= node.length` を満たさなければ null。
 */
function locate(run: TextRun, position: number, edge: 'start' | 'end'): Position | null {
  for (let i = 0; i < run.nodes.length; i += 1) {
    const node = run.nodes[i]
    const start = run.starts[i]
    if (node === undefined || start === undefined) return null
    const end = start + node.length
    const inside =
      edge === 'start' ? position >= start && position < end : position > start && position <= end
    if (!inside) continue
    const offset = position - start
    return offset >= 0 && offset <= node.length ? { node, offset } : null
  }
  return null
}

/** `[data-search-text]` 1 つの中の出現の Range (写せない出現は null。出現の順を数えるため並びに残す)。 */
function occurrenceRanges(element: Element, term: string): (Range | null)[] {
  const run = textRunOf(element)
  if (run.text === '') return []
  const { text, sourceStart, sourceEnd } = normalizeWithMap(run.text)
  const ranges: (Range | null)[] = []
  let from = 0
  for (;;) {
    const index = text.indexOf(term, from)
    if (index === -1) break
    from = index + term.length
    const start = sourceStart[index]
    const end = sourceEnd[index + term.length - 1]
    const startAt = start === undefined ? null : locate(run, start, 'start')
    const endAt = end === undefined ? null : locate(run, end, 'end')
    if (startAt === null || endAt === null) {
      ranges.push(null)
      continue
    }
    try {
      const range = element.ownerDocument.createRange()
      range.setStart(startAt.node, startAt.offset)
      range.setEnd(endAt.node, endAt.offset)
      ranges.push(range)
    } catch {
      // 位置を検証した後でも DOM が掛けられない (描画の途中で node が外れた等) ときは、その出現だけを飛ばす。
      ranges.push(null)
    }
  }
  return ranges
}

/**
 * 描かれた transcript の中の強調の範囲を集める (DOM は読むだけ)。`root` は transcript のスクローラ (navigator の
 * `root()`)。正規化した語が空・一致が無ければ空。
 */
export function collectSearchRanges(
  root: ParentNode,
  hits: readonly SearchHit[],
  current: SearchHitKey | null,
  query: string
): SearchHighlightRanges {
  const term = normalizeForSearch(query)
  if (term === '' || hits.length === 0) return NO_RANGES
  const ids = new Set(hits.map((hit) => hit.messageId))
  const others: Range[] = []
  let currentRange: Range | null = null
  const messageElements = root.querySelectorAll<HTMLElement>(MESSAGE_ELEMENT_SELECTOR)
  for (const messageElement of Array.from(messageElements)) {
    const id = messageElement.dataset.messageId
    if (id === undefined || !ids.has(id)) continue
    let occurrence = 0
    const textElements = messageElement.querySelectorAll(SEARCH_TEXT_SELECTOR)
    for (const textElement of Array.from(textElements)) {
      // 入れ子のメッセージの要素の中の本文は、その要素の分として数える (このメッセージの出現に混ぜない)。
      if (textElement.closest(MESSAGE_ELEMENT_SELECTOR) !== messageElement) continue
      for (const range of occurrenceRanges(textElement, term)) {
        const isCurrent =
          current !== null && current.messageId === id && current.occurrence === occurrence
        occurrence += 1
        if (range === null) continue
        if (isCurrent) currentRange = range
        else others.push(range)
      }
    }
  }
  return { others, current: currentRange }
}

/** 強調を掛け直す (2 つの名前を置き換える)。集めた範囲を返す (テスト用)。 */
export function applySearchHighlights(
  registry: HighlightRegistry,
  root: ParentNode,
  hits: readonly SearchHit[],
  current: SearchHitKey | null,
  query: string
): SearchHighlightRanges {
  const ranges = collectSearchRanges(root, hits, current, query)
  registry.set(SEARCH_HIGHLIGHT, ranges.others)
  registry.set(SEARCH_HIGHLIGHT_CURRENT, ranges.current === null ? [] : [ranges.current])
  return ranges
}

/** 強調を 2 つとも消す (検索を閉じたとき)。 */
export function clearSearchHighlights(registry: HighlightRegistry): void {
  registry.delete(SEARCH_HIGHLIGHT)
  registry.delete(SEARCH_HIGHLIGHT_CURRENT)
}
