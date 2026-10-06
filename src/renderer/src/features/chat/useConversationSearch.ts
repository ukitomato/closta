import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type KeyboardEvent as ReactKeyboardEvent
} from 'react'

import type { ThreadMessageLike } from '@assistant-ui/react'

import { normalizeForSearch } from '@/features/search/text-search'

import {
  createConversationScanner,
  positionOf,
  reconcileCurrent,
  sameHit,
  stepHit,
  type SearchHit,
  type SearchHitKey
} from './conversation-search'

/**
 * 会話内検索の状態 (O-3 / spec FR-003〜FR-005 / 012 data-model §2「状態」「走査」「移動」)。DOM に触れない
 * (移動・強調・キー・フォーカスは `ConversationSearchProvider`)。
 *
 * | 規則 | 根拠 |
 * |---|---|
 * | 入力は 150ms 間引いてから走査する。走査は間引きの後に 1 回 (走査器が変わったメッセージだけを走査し直す) | spec FR-005 |
 * | 語 (正規化した後) が変わって走査したら `current` を最初の一致にし、そこへ移る | spec US-2 AC1 |
 * | メッセージの変化で走査し直したときは `current` を同じキーのまま保ち、**移らない** (消えたときだけ前の一致へ) | spec US-2 AC5 |
 * | 次 / 前は端で反対の端へ戻る。間引きの途中なら先に語を反映する (最初の一致へ移る) | spec US-2 AC2 |
 * | 閉じたら語・一致・現在の位置を捨てる (永続化しない) | data-model §2 |
 */

export const SEARCH_DEBOUNCE_MS = 150

const NO_HITS: readonly SearchHit[] = Object.freeze([])

/** 移る要求。同じ一致へ移り直す要求も区別するため通し番号を持つ。 */
export interface SearchNavigation {
  readonly key: SearchHitKey
  readonly seq: number
}

export interface ConversationSearchController {
  readonly open: boolean
  /** 入力のまま。 */
  readonly query: string
  /** 間引いた後の正規化した語。空なら検索していない。 */
  readonly term: string
  readonly hits: readonly SearchHit[]
  readonly current: SearchHitKey | null
  /** 現在の位置 (1 から)。一致が無ければ 0。 */
  readonly position: number
  /** 最後の移る要求 (provider が navigator で移る)。 */
  readonly navigation: SearchNavigation | null
  setQuery(query: string): void
  openBar(): void
  close(): void
  next(): void
  prev(): void
}

interface Scanned {
  readonly hits: readonly SearchHit[]
  readonly term: string
}

/** `messages` は本文の供給元 (過去ログの transcript・稼働中のセッションのストアの全件。data-model §2「本文の供給元」)。 */
export function useConversationSearch(
  messages: readonly ThreadMessageLike[]
): ConversationSearchController {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [term, setTerm] = useState('')
  const [scanner] = useState(createConversationScanner)
  const hits = useMemo(
    () => (open ? scanner.scan(messages, term) : NO_HITS),
    [open, scanner, messages, term]
  )

  const [scanned, setScanned] = useState<Scanned>({ hits: NO_HITS, term: '' })
  const [current, setCurrent] = useState<SearchHitKey | null>(null)
  const [navigation, setNavigation] = useState<SearchNavigation | null>(null)

  /*
   * 走査の結果が変わったら `current` を合わせる (React 公式「prop 変化時の state 調整」の形。effect で同期 setState しない)。
   * 語の変化では最初の一致へ移り、メッセージの変化では同じ一致を指し続けて移らない。
   */
  if (scanned.hits !== hits || scanned.term !== term) {
    const termChanged = scanned.term !== term
    const nextCurrent = termChanged
      ? (hits[0] ?? null)
      : reconcileCurrent(scanned.hits, hits, current)
    setScanned({ hits, term })
    if (!sameHit(nextCurrent, current)) setCurrent(nextCurrent)
    if (termChanged && nextCurrent !== null) {
      setNavigation((previous) => ({ key: nextCurrent, seq: (previous?.seq ?? 0) + 1 }))
    }
  }

  // 150ms の間引き (spec FR-005)。
  useEffect(() => {
    const timer = setTimeout(() => setTerm(normalizeForSearch(query)), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [query])

  const step = (delta: 1 | -1): void => {
    const normalized = normalizeForSearch(query)
    if (normalized !== term) {
      // 間引きの途中の語を先に反映する (語の変化として最初の一致へ移る)。
      setTerm(normalized)
      return
    }
    const target = stepHit(hits, current, delta)
    if (target === null) return
    setCurrent(target)
    setNavigation((previous) => ({ key: target, seq: (previous?.seq ?? 0) + 1 }))
  }

  return {
    open,
    query,
    term,
    hits,
    current,
    position: positionOf(hits, current),
    navigation,
    setQuery,
    openBar: () => setOpen(true),
    close: () => {
      setOpen(false)
      setQuery('')
      setTerm('')
      setCurrent(null)
      setNavigation(null)
    },
    next: () => step(1),
    prev: () => step(-1)
  }
}

/**
 * 中央のヘッダのボタンと検索のバーに渡す値 (`ConversationSearchProvider` が作る)。部品のファイルから分けて置く
 * (fast refresh は component だけを export するファイルでしか効かない)。
 */
export interface ConversationSearchContextValue {
  readonly open: boolean
  readonly query: string
  /** 一致の件数。 */
  readonly count: number
  /** 現在の位置 (1 から)。一致が無ければ 0。 */
  readonly position: number
  /** 間引いた後の語が空でない (検索した)。0 件の空の状態はこのときだけ出す。 */
  readonly searched: boolean
  /** 検索のバーの入力欄を provider に渡す (callback ref。開いたときにフォーカスを移す先)。 */
  readonly bindInput: (element: HTMLInputElement | null) => void
  /** 中央のヘッダの検索のボタンを provider に渡す (callback ref。閉じた後の戻り先の控え)。 */
  readonly bindButton: (element: HTMLButtonElement | null) => void
  readonly setQuery: (query: string) => void
  /** 開く (開いていれば入力欄へフォーカスを移すだけ)。 */
  readonly openSearch: () => void
  readonly close: () => void
  readonly next: () => void
  readonly prev: () => void
  /** 入力欄の Enter / Shift+Enter / Esc (IME の変換中は何もしない)。 */
  readonly onInputKeyDown: (event: ReactKeyboardEvent<HTMLInputElement>) => void
}

export const ConversationSearchContext = createContext<ConversationSearchContextValue | null>(null)

/** provider の外 (中央に会話を出していない・単体の画面) では null。 */
export function useConversationSearchContext(): ConversationSearchContextValue | null {
  return useContext(ConversationSearchContext)
}
