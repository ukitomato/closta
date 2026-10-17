import { createContext, useContext } from 'react'

/**
 * 中央に出している会話のターンの所要時間 (O-9 data-model §2「中央への所要時間の渡し方」)。
 * 始まりのメッセージの id → 所要時間 (ms)。値のあるターンだけ。provider の外では空。
 */
export type TurnDurations = ReadonlyMap<string, number>

export const EMPTY_TURN_DURATIONS: TurnDurations = new Map()

export const TurnDurationsContext = createContext<TurnDurations>(EMPTY_TURN_DURATIONS)

/** そのメッセージがターンの始まりで、所要時間が分かっているときの値 (ms)。それ以外は `null`。 */
export function useTurnDuration(messageId: string | undefined): number | null {
  const durations = useContext(TurnDurationsContext)
  if (messageId === undefined) return null
  return durations.get(messageId) ?? null
}
