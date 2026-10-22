import type { ThreadMessageLike } from '@assistant-ui/react'

import { normalizeForSearch } from '@/features/search/text-search'

import { isSystemEventMessage, SYSTEM_EVENT_DATA_NAME } from './convert'
import { transcriptBoundaryHeading } from './labels'
import { isSystemEventFields } from './transcript-guard'

/**
 * 会話内検索の走査と移動の純関数 (O-3 / spec FR-003〜FR-005 / 012 data-model §2「状態」「走査」「移動」)。
 *
 * | 規則 | 根拠 |
 * |---|---|
 * | 対象は user / assistant のメッセージの `text` part だけ。tool の入力・結果・Reasoning・data part・システムイベントの行は除く | spec FR-004 |
 * | 語は**語全体** (`normalizeForSearch(query)`) の出現を数える (Thread search の AND にしない)。正規化した語が空なら 0 件 | data-model §2 |
 * | 正規化した本文はメッセージの object ごとに `WeakMap` に覚え、語が変わったときは `indexOf` だけを回す | data-model §2「走査」/ plan RK-09 |
 * | メッセージの配列が変わったら、object が変わったメッセージ (追加・ストリーミング・送り直し) だけを走査し直す | spec FR-005 / SC-002 |
 * | 走査の呼び出しは `counts()` で数えられる (SC-002 の判定は呼び出しの回数で行う) | data-model §2「走査」 |
 * | `current` は `(messageId, occurrence)` のキーで持つ。走査し直しても同じキーが残れば指し続け、消えたら一番近い前の一致、前が無ければ最初の一致 | spec US-2 AC5 / data-model §2 |
 * | 一致は字面の部分一致 (`indexOf`) だけ。検索語から `RegExp` を組まない | spec FR-002 |
 */

/** 会話内検索の対象のメッセージ (data-model §2)。 */
export interface SearchableMessage {
  readonly id: string
  readonly role: 'user' | 'assistant'
  /** `text` part の本文だけ (spec FR-004)。並びは part の並び。 */
  readonly texts: readonly string[]
}

/** 一致 1 つ。`occurrence` はメッセージの中の出現の順 (0 から。text part の並び → 出現の並び)。 */
export interface SearchHit {
  readonly messageId: string
  readonly occurrence: number
}

/** 現在の一致を指すキー。一致と同じ形 (メッセージの id と出現の順)。 */
export type SearchHitKey = SearchHit

/** 会話内検索の状態 (data-model §2)。renderer の表示状態で、永続化しない。 */
export interface ConversationSearchState {
  readonly open: boolean
  /** 入力のまま。 */
  readonly query: string
  /** メッセージの並び → 出現の順。 */
  readonly hits: readonly SearchHit[]
  /** `hits` が空なら null。 */
  readonly current: SearchHitKey | null
}

const NO_HITS: readonly SearchHit[] = Object.freeze([])

/**
 * `ThreadMessageLike` から検索の対象を作る (data-model §2)。role が user / assistant で、システムイベントの行でなく、
 * id を持つものだけ。part は `type: 'text'` だけを取る (変換が text part にした添付のファイル名と圧縮の境界は描かれる
 * 本文なので入る。`convert.ts`)。対象でなければ null。
 */
export function toSearchableMessage(message: ThreadMessageLike): SearchableMessage | null {
  if (message.role !== 'user' && message.role !== 'assistant') return null
  if (message.id === undefined || isSystemEventMessage(message)) return null
  const content = message.content
  const texts =
    typeof content === 'string'
      ? [content]
      : content.flatMap((part) => {
          if (part.type === 'text') return [part.text]
          // 添付の文書は file の part に写る (O-12 / FE-020)。名前だけを本文の 1 つとして取る (今までの検索の結果を保つ)。
          if (part.type === 'file') return [part.filename ?? '']
          // 過去ログの圧縮の境界 (data part)。描かれる見出し (TranscriptBoundary と同じ関数) を本文の 1 つとして取る。
          // 実行中の境界の行は `isSystemEventMessage` で上で除かれ、他の data part は対象外 (O-3 の範囲を保つ)。
          if (part.type === 'data' && part.name === SYSTEM_EVENT_DATA_NAME) {
            const data: unknown = part.data
            if (isSystemEventFields(data) && data.category === 'compact-boundary') {
              return [transcriptBoundaryHeading(data.category, data.detail)]
            }
          }
          return []
        })
  return { id: message.id, role: message.role, texts }
}

/** 正規化した本文の出現を数える。重ならない出現を左から順に数える。 */
function occurrencesIn(id: string, texts: readonly string[], term: string): readonly SearchHit[] {
  const hits: SearchHit[] = []
  let occurrence = 0
  for (const text of texts) {
    let from = 0
    for (;;) {
      const index = text.indexOf(term, from)
      if (index === -1) break
      hits.push({ messageId: id, occurrence })
      occurrence += 1
      from = index + term.length
    }
  }
  return hits.length === 0 ? NO_HITS : hits
}

/** 走査の呼び出しの回数 (SC-002 の判定に使う)。 */
export interface ScanCounts {
  /** 語が変わって全件を走査し直した回数。 */
  readonly fullScans: number
  /** メッセージ 1 つの本文に語の出現を探した回数 (全件の走査の分を含む)。 */
  readonly messageScans: number
  /** メッセージの本文を正規化した回数 (object ごとに 1 回)。 */
  readonly normalizations: number
}

export interface ConversationScanner {
  /**
   * メッセージの並びと語から一致を返す。語 (正規化した後) が前回と同じなら、前回から object が変わった
   * メッセージだけを走査し直す。正規化した語が空なら空。
   */
  scan(messages: readonly ThreadMessageLike[], query: string): readonly SearchHit[]
  counts(): ScanCounts
}

interface NormalizedMessage {
  readonly id: string
  readonly texts: readonly string[]
}

/** 走査器を作る。覚えた正規化の本文と一致は、この走査器の中だけで持つ (provider ごとに 1 つ)。 */
export function createConversationScanner(): ConversationScanner {
  const normalized = new WeakMap<ThreadMessageLike, NormalizedMessage | null>()
  let hitsByMessage = new WeakMap<ThreadMessageLike, readonly SearchHit[]>()
  let lastTerm: string | null = null
  let fullScans = 0
  let messageScans = 0
  let normalizations = 0

  const normalizedOf = (message: ThreadMessageLike): NormalizedMessage | null => {
    const cached = normalized.get(message)
    if (cached !== undefined) return cached
    normalizations += 1
    const searchable = toSearchableMessage(message)
    const value =
      searchable === null
        ? null
        : { id: searchable.id, texts: searchable.texts.map((text) => normalizeForSearch(text)) }
    normalized.set(message, value)
    return value
  }

  return {
    scan(messages, query) {
      const term = normalizeForSearch(query)
      if (term === '') return NO_HITS
      if (term !== lastTerm) {
        lastTerm = term
        hitsByMessage = new WeakMap()
        fullScans += 1
      }
      const hits: SearchHit[] = []
      for (const message of messages) {
        let found = hitsByMessage.get(message)
        if (found === undefined) {
          messageScans += 1
          const entry = normalizedOf(message)
          found = entry === null ? NO_HITS : occurrencesIn(entry.id, entry.texts, term)
          hitsByMessage.set(message, found)
        }
        for (const hit of found) hits.push(hit)
      }
      return hits.length === 0 ? NO_HITS : hits
    },
    counts: () => ({ fullScans, messageScans, normalizations })
  }
}

/** 2 つのキーが同じ一致を指すか (どちらも null も同じ)。 */
export function sameHit(a: SearchHitKey | null, b: SearchHitKey | null): boolean {
  if (a === null || b === null) return a === b
  return a.messageId === b.messageId && a.occurrence === b.occurrence
}

/** キーの一致の添字。無ければ -1。 */
export function indexOfHit(hits: readonly SearchHit[], key: SearchHitKey): number {
  return hits.findIndex((hit) => sameHit(hit, key))
}

/** 現在の位置 (1 から)。一致が無い・指していなければ 0。 */
export function positionOf(hits: readonly SearchHit[], current: SearchHitKey | null): number {
  return current === null ? 0 : indexOfHit(hits, current) + 1
}

/**
 * 走査し直した後の `current` (data-model §2「走査」)。同じキーが残っていればそのまま (同じ object) を返し、
 * 消えていたら前の一致の並びで一番近い前のうち残っているもの、前が無ければ最初の一致。一致が無ければ null。
 */
export function reconcileCurrent(
  previous: readonly SearchHit[],
  next: readonly SearchHit[],
  current: SearchHitKey | null
): SearchHitKey | null {
  const first = next[0]
  if (first === undefined) return null
  if (current === null) return first
  const remaining = new Map<string, Set<number>>()
  for (const hit of next) {
    const occurrences = remaining.get(hit.messageId) ?? new Set<number>()
    occurrences.add(hit.occurrence)
    remaining.set(hit.messageId, occurrences)
  }
  const remains = (key: SearchHitKey): boolean =>
    remaining.get(key.messageId)?.has(key.occurrence) === true
  if (remains(current)) return current
  for (let i = indexOfHit(previous, current) - 1; i >= 0; i -= 1) {
    const candidate = previous[i]
    if (candidate !== undefined && remains(candidate)) return candidate
  }
  return first
}

/** 次 (`1`) / 前 (`-1`) の一致。端では反対の端へ戻る (spec US-2 AC2)。一致が無ければ null。 */
export function stepHit(
  hits: readonly SearchHit[],
  current: SearchHitKey | null,
  delta: 1 | -1
): SearchHitKey | null {
  const count = hits.length
  if (count === 0) return null
  const at = current === null ? -1 : indexOfHit(hits, current)
  if (at === -1) return (delta === 1 ? hits[0] : hits[count - 1]) ?? null
  return hits[(at + delta + count) % count] ?? null
}
