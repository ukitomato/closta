import { SearchIcon } from 'lucide-react'

import { ConversationSearch } from '@/components/assistant-ui/elements/conversation-search'
import { EmptyState } from '@/components/assistant-ui/elements/empty-state'
import { Button } from '@/components/ui/button'

import { CONVERSATION_SEARCH_LABELS } from './labels'
import { useConversationSearchContext } from './useConversationSearch'

/**
 * 会話内検索の検索のバーと、中央のヘッダの検索のボタン (O-3 / spec FR-003 / FR-008 / 012 data-model §2・§5)。
 * どちらも `ConversationSearchProvider` の内側でだけ描く (外では何も描かない)。
 *
 * - 見た目は registry の element `conversation-search` (Principle XIII。SH-003 で採り、文言・閉じる・フォーカスの口を足した)
 * - 文言は `CONVERSATION_SEARCH_LABELS` (AD-045 Decision 2)。位置の文は `{i} / {n} 件`
 * - 間引いた後の語で一致が 0 なら、なぜ空かと次の操作を `EmptyState` で示す (FR-008)
 */

const SEARCH_LABELS = {
  input: CONVERSATION_SEARCH_LABELS.searchOpen,
  placeholder: CONVERSATION_SEARCH_LABELS.searchPlaceholder,
  previous: CONVERSATION_SEARCH_LABELS.searchPrev,
  next: CONVERSATION_SEARCH_LABELS.searchNext,
  close: CONVERSATION_SEARCH_LABELS.searchClose
}

/** 中央のヘッダの下に出す検索のバー。閉じている間は描かない。 */
export function ConversationSearchBar(): React.JSX.Element | null {
  const search = useConversationSearchContext()
  if (search === null || !search.open) return null
  const status = search.searched
    ? CONVERSATION_SEARCH_LABELS.searchPosition(search.position, search.count)
    : ''
  return (
    <div
      className="border-border flex shrink-0 flex-col gap-2 border-b px-4 py-2"
      data-testid="conversation-search"
    >
      <ConversationSearch
        className="max-w-md"
        query={search.query}
        status={status}
        labels={SEARCH_LABELS}
        onQueryChange={search.setQuery}
        onStep={(delta) => (delta < 0 ? search.prev() : search.next())}
        onClose={search.close}
        inputRef={search.bindInput}
        onInputKeyDown={search.onInputKeyDown}
      />
      {search.searched && search.count === 0 && (
        <EmptyState
          className="max-w-none items-start gap-1"
          data-testid="conversation-search-empty"
        >
          <p className="text-sm">{CONVERSATION_SEARCH_LABELS.searchNone}</p>
          <p className="text-muted-foreground text-xs">
            {CONVERSATION_SEARCH_LABELS.searchNoneHint}
          </p>
        </EmptyState>
      )}
    </div>
  )
}

/** 中央のヘッダの検索のボタン。押すと検索のバーを開く (開いていれば入力欄へフォーカスを移すだけ)。 */
export function ConversationSearchButton(): React.JSX.Element | null {
  const search = useConversationSearchContext()
  if (search === null) return null
  const { bindButton, openSearch } = search
  return (
    <Button
      ref={bindButton}
      type="button"
      size="icon-xs"
      variant="ghost"
      aria-label={CONVERSATION_SEARCH_LABELS.searchOpen}
      title={CONVERSATION_SEARCH_LABELS.searchOpen}
      aria-keyshortcuts="Control+F"
      onClick={openSearch}
    >
      <SearchIcon aria-hidden />
    </Button>
  )
}
