import { createContext, useContext, useSyncExternalStore } from 'react'

import type { ThreadMessageLike } from '@assistant-ui/react'

import type { Turn } from './turns'

/**
 * **中央の会話の公開口** (O-9 data-model §6)。中央が出している会話の `messages` / `turns` / 移動の口を、右のペイン
 * (会話の地図) へ渡す。形は `createTranscriptNavigatorRegistry` (`transcript-context.ts`) と同じ (publish / clear / subscribe)。
 * 地図は中央の値を読むだけで、過去ログを取得し直さない (AD-034)。永続化しない (Principle X)。
 */

/** 移動の口 (`ConversationSearchProvider` の `navigateTo`。O-3 と同じ経路。research R-07)。 */
export type NavigateTo = (messageId: string) => void

export interface CenterConversation {
  /** 稼働中は `sessionId`、過去は `selectedRowKey`。 */
  readonly conversationKey: string
  /** `deriveTurns` に渡したのと同じ列。 */
  readonly messages: readonly ThreadMessageLike[]
  readonly turns: readonly Turn[]
  readonly navigateTo: NavigateTo
}

export interface CenterConversationStore {
  publish(value: CenterConversation): void
  /** `conversationKey` が今の公開と同じときだけ外す (切り替えの順で後から出した値を消さない。RK-09)。 */
  clear(conversationKey: string): void
  current(): CenterConversation | null
  subscribe(listener: () => void): () => void
}

export function createCenterConversationStore(): CenterConversationStore {
  let current: CenterConversation | null = null
  const listeners = new Set<() => void>()
  const notify = (): void => {
    for (const listener of Array.from(listeners)) listener()
  }
  return {
    publish(value) {
      if (current === value) return
      current = value
      notify()
    },
    clear(conversationKey) {
      if (current === null || current.conversationKey !== conversationKey) return
      current = null
      notify()
    },
    current: () => current,
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    }
  }
}

/** シェル (`ShellLayout`) が 1 つ作って配る公開口。provider の外 (単体の画面・テスト) では null で、publish しない。 */
export const CenterConversationContext = createContext<CenterConversationStore | null>(null)

const noopUnsubscribe = (): void => {}
const subscribeNothing = (): (() => void) => noopUnsubscribe
const currentNothing = (): null => null

/** 中央の会話の今の公開値 (無ければ null)。 */
export function useCenterConversation(): CenterConversation | null {
  const store = useContext(CenterConversationContext)
  return useSyncExternalStore(
    store === null ? subscribeNothing : store.subscribe,
    store === null ? currentNothing : store.current
  )
}

/**
 * 中央の移動の口 (`ConversationSearchProvider` が配る)。provider の外では何もしない関数。
 */
export const ConversationNavigateContext = createContext<NavigateTo>(() => {})

export function useConversationNavigate(): NavigateTo {
  return useContext(ConversationNavigateContext)
}
