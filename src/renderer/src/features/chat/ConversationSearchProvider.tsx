import {
  useCallback,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent as ReactKeyboardEvent
} from 'react'

import type { ThreadMessageLike } from '@assistant-ui/react'

import { useUiStore } from '@/stores/ui'

import { ConversationNavigateContext } from './center-conversation'
import {
  applySearchHighlights,
  clearSearchHighlights,
  cssHighlightRegistry
} from './search-highlight'
import { createTranscriptNavigatorRegistry, TranscriptNavigatorContext } from './transcript-context'
import {
  ConversationSearchContext,
  useConversationSearch,
  type ConversationSearchContextValue
} from './useConversationSearch'

/**
 * **会話内検索の provider** (O-3 / spec FR-003〜FR-005 / 012 data-model §2)。中央に会話を出している子 (シェルの
 * `RunningCenter` / `PastCenter`) が、中央のヘッダと本体を包む。セッションを切り替えると子が `key` で作り直し、検索は閉じる。
 *
 * | 規則 | 根拠 |
 * |---|---|
 * | 入力は props だけで受ける (`messages` と、稼働中だけ `reveal`)。`features/session` / `features/shell` を import しない | data-model §2「本文の供給元」 |
 * | 移るのは transcript が登録する navigator (`scrollToMessage`)。`false` で `reveal` があれば、窓を広げた後の描画 (navigator の登録し直し) でもう一度移る | data-model §2「移動」/ research R-03 |
 * | Ctrl+F は `window` の keydown (capture)。変換中 (`isComposing` / 229) と `[aria-modal="true"]` の要素が開いている間は何もしない (`preventDefault` もしない)。受けたときだけ `preventDefault` | data-model §2「開く・閉じる・キー」/ Principle VIII |
 * | palette の「会話内を検索」は `stores/ui.ts` の `conversationSearchRequest` (単調増加) の変化で受ける。開いて (開いていればそのまま) 入力欄へフォーカスを移す | data-model §2 / §3「閉じた後のフォーカス」 |
 * | 検索のバーの Enter / Shift+Enter / Esc は変換中は何もしない | spec FR-003 / US-2 AC7 |
 * | 強調は CSS Custom Highlight API。描画の変化は `MutationObserver` で見て、フレームに 1 回掛け直す。閉じたら 2 つとも消す | data-model §2「強調」/ US-2 AC6 |
 * | 閉じたら開く前にフォーカスのあった要素へ戻す (消えていれば中央のヘッダの検索のボタン)。スクロール位置は動かさない | US-2 AC6 |
 */

/** IME の変換中のキーか (Principle VIII / AD-037 の `isComposing` / 229)。 */
function isComposingKey(event: KeyboardEvent): boolean {
  return event.isComposing || event.keyCode === 229
}

/** Ctrl+F (ほかの修飾キーなし)。 */
function isFindShortcut(event: KeyboardEvent): boolean {
  return (
    event.ctrlKey &&
    !event.altKey &&
    !event.shiftKey &&
    !event.metaKey &&
    (event.key === 'f' || event.key === 'F')
  )
}

/** モーダルのダイアログ (`aria-modal="true"`。palette を含む) が開いているか (data-model §2「開く・閉じる・キー」)。 */
function modalDialogOpen(): boolean {
  return document.querySelector('[aria-modal="true"]') !== null
}

export function ConversationSearchProvider({
  messages,
  reveal,
  children
}: {
  /** 本文の供給元 (過去ログの transcript・稼働中のセッションのストアの全件。窓で切る前)。 */
  readonly messages: readonly ThreadMessageLike[]
  /** 稼働中だけ: 窓をそのメッセージまで広げる (`RunningSessionsView.revealMessage`)。過去ログは渡さない。 */
  readonly reveal?: (messageId: string) => void
  readonly children: React.ReactNode
}): React.JSX.Element {
  const search = useConversationSearch(messages)
  const [registry] = useState(createTranscriptNavigatorRegistry)
  const transcriptRoot = useSyncExternalStore(registry.subscribe, registry.root)
  const inputRef = useRef<HTMLInputElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  /** 開く前にフォーカスのあった要素 (閉じたら戻す)。 */
  const returnFocusRef = useRef<HTMLElement | null>(null)
  /** 窓を広げて移り直すのを待っているメッセージの id。 */
  const pendingRevealRef = useRef<string | null>(null)
  const [focusRequest, setFocusRequest] = useState(0)
  // 検索のバーの入力欄と中央のヘッダのボタンは callback ref で受ける (ref の object を context に載せない)。
  const bindInput = useCallback((element: HTMLInputElement | null) => {
    inputRef.current = element
  }, [])
  const bindButton = useCallback((element: HTMLButtonElement | null) => {
    buttonRef.current = element
  }, [])

  /* ── 移動 ───────────────────────────────────────────────────────────── */

  // 移動の経路。会話内検索・会話の地図 (O-9) の両方がこれを使う (context で出す。research R-07)。
  const navigateTo = useCallback(
    (messageId: string): void => {
      pendingRevealRef.current = null
      if (registry.current()?.scrollToMessage(messageId) === true) return
      if (reveal === undefined) return
      // 稼働中で窓の外: 窓を広げ、transcript が navigator を登録し直したら (広げた後の描画) もう一度移る。
      pendingRevealRef.current = messageId
      reveal(messageId)
    },
    [registry, reveal]
  )
  const goTo = useEffectEvent((messageId: string) => navigateTo(messageId))
  const navigation = search.navigation
  useEffect(() => {
    if (navigation !== null) goTo(navigation.key.messageId)
  }, [navigation])

  const retryReveal = useEffectEvent(() => {
    const messageId = pendingRevealRef.current
    if (messageId === null) return
    if (registry.current()?.scrollToMessage(messageId) === true) pendingRevealRef.current = null
  })
  useEffect(() => registry.subscribe(() => retryReveal()), [registry])

  /* ── 開く・閉じる・フォーカス ────────────────────────────────────────── */

  const openSearch = (): void => {
    if (!search.open) {
      const active = document.activeElement
      returnFocusRef.current = active instanceof HTMLElement ? active : null
      search.openBar()
    }
    setFocusRequest((n) => n + 1)
  }

  const close = (): void => {
    const back = returnFocusRef.current
    returnFocusRef.current = null
    pendingRevealRef.current = null
    search.close()
    if (back !== null && back.isConnected) back.focus()
    else buttonRef.current?.focus()
  }

  // 開いた (開いていた) ら入力欄へ。バーは同じ描画で入るので、effect の時点で ref が付いている。
  useEffect(() => {
    if (focusRequest === 0) return
    const input = inputRef.current
    if (input === null) return
    input.focus()
    input.select()
  }, [focusRequest])

  const onShortcut = useEffectEvent((event: KeyboardEvent) => {
    if (isComposingKey(event) || !isFindShortcut(event) || modalDialogOpen()) return
    event.preventDefault()
    openSearch()
  })
  useEffect(() => {
    const listener = (event: KeyboardEvent): void => onShortcut(event)
    window.addEventListener('keydown', listener, true)
    return () => window.removeEventListener('keydown', listener, true)
  }, [])

  // palette の「会話内を検索」(data-model §3)。値の変化だけを受ける (マウントの時点の値では開かない)。
  const onRequest = useEffectEvent(() => openSearch())
  useEffect(
    () =>
      useUiStore.subscribe((state, previous) => {
        if (state.conversationSearchRequest !== previous.conversationSearchRequest) onRequest()
      }),
    []
  )

  const onInputKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>): void => {
    // 変換中の Enter / Esc は確定・取り消しに任せる (`preventDefault` しない。Principle VIII)。
    if (event.nativeEvent.isComposing || event.keyCode === 229) return
    if (event.key === 'Enter') {
      event.preventDefault()
      if (event.shiftKey) search.prev()
      else search.next()
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      close()
    }
  }

  /* ── 強調 ───────────────────────────────────────────────────────────── */

  const { open, term, hits, current } = search
  useEffect(() => {
    const highlights = cssHighlightRegistry()
    if (highlights === null) return
    if (!open || term === '' || transcriptRoot === null) {
      clearSearchHighlights(highlights)
      return
    }
    let frame = 0
    const paint = (): void => {
      frame = 0
      applySearchHighlights(highlights, transcriptRoot, hits, current, term)
    }
    paint()
    // 描かれた本文の変化 (仮想化の窓の移動・ストリーミング・Tool group の開閉) で掛け直す。フレームに 1 回にまとめる。
    const observer = new MutationObserver(() => {
      if (frame === 0) frame = requestAnimationFrame(paint)
    })
    observer.observe(transcriptRoot, { childList: true, subtree: true, characterData: true })
    return () => {
      observer.disconnect()
      if (frame !== 0) cancelAnimationFrame(frame)
      clearSearchHighlights(highlights)
    }
  }, [open, term, hits, current, transcriptRoot])

  const value: ConversationSearchContextValue = {
    open,
    query: search.query,
    count: hits.length,
    position: search.position,
    searched: term !== '',
    bindInput,
    bindButton,
    setQuery: search.setQuery,
    openSearch,
    close,
    next: search.next,
    prev: search.prev,
    onInputKeyDown
  }

  return (
    <TranscriptNavigatorContext.Provider value={registry}>
      <ConversationNavigateContext.Provider value={navigateTo}>
        <ConversationSearchContext.Provider value={value}>
          {children}
        </ConversationSearchContext.Provider>
      </ConversationNavigateContext.Provider>
    </TranscriptNavigatorContext.Provider>
  )
}
