import { useContext, useEffect, useMemo, useState } from 'react'

import type { ThreadMessageLike } from '@assistant-ui/react'

import { CenterConversationContext, useConversationNavigate } from './center-conversation'
import { TurnDurationsContext, type TurnDurations } from './conversation-time-context'
import { deriveTurns } from './turns'

/**
 * **中央の会話の時間の provider** (O-9 FR-006 / data-model §2「中央への所要時間の渡し方」)。
 * `deriveTurns` を 1 回だけ走らせ、`始まりの id → 所要時間` の Map を context で配る。
 * 新しい Map が前の Map と同じ中身なら前の参照を返す (利用者のメッセージの再描画を、所要時間が変わったときだけにする。RK-10)。
 *
 * 同じ `turns` を中央の会話の公開口 (`center-conversation.ts`) にも publish する (地図のタブが読む)。
 */

function sameDurations(a: TurnDurations, b: TurnDurations): boolean {
  if (a.size !== b.size) return false
  for (const [id, ms] of a) if (b.get(id) !== ms) return false
  return true
}

export function ConversationTimeProvider({
  conversationKey,
  messages,
  lastTurnOpen,
  publish = true,
  children
}: {
  /** `false` のあいだは公開口へ publish しない (過去ログの loading / failed)。 */
  readonly publish?: boolean
  /** 稼働中は `sessionId`、過去は `selectedRowKey` (公開口の `conversationKey`)。 */
  readonly conversationKey: string
  /** 記録の順の全件 (検索の provider と同じ値。稼働中は窓で切る前)。 */
  readonly messages: readonly ThreadMessageLike[]
  /** 稼働中で runtime が busy か (過去ログは `false`)。 */
  readonly lastTurnOpen: boolean
  readonly children: React.ReactNode
}): React.JSX.Element {
  const turns = useMemo(() => deriveTurns(messages, lastTurnOpen), [messages, lastTurnOpen])
  const fresh = useMemo(() => {
    const map = new Map<string, number>()
    for (const turn of turns) {
      if (turn.durationMs !== null) map.set(turn.id, turn.durationMs)
    }
    return map
  }, [turns])
  const [stable, setStable] = useState<TurnDurations>(fresh)
  const value = sameDurations(stable, fresh) ? stable : fresh
  if (value !== stable) setStable(value)

  // 中央の会話の公開口へ publish (O-9 data-model §6)。unmount で、同じ `conversationKey` のときだけ消す (RK-09)。
  const store = useContext(CenterConversationContext)
  const navigateTo = useConversationNavigate()
  const published = useMemo(
    () => ({ conversationKey, messages, turns, navigateTo }),
    [conversationKey, messages, turns, navigateTo]
  )
  useEffect(() => {
    // 読み込み中・失敗のあいだは publish しない (空の messages を「ターンが無い」と読ませない。pr-gate H-001)。
    if (publish) store?.publish(published)
    else store?.clear(conversationKey)
  }, [store, published, publish, conversationKey])
  useEffect(() => {
    return () => store?.clear(conversationKey)
  }, [store, conversationKey])

  return <TurnDurationsContext.Provider value={value}>{children}</TurnDurationsContext.Provider>
}
