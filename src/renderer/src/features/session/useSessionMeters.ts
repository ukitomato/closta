import { useStore } from 'zustand'

import { useRunningSessionStoreApi } from './running-session-context'
import { EMPTY_SESSION_METERS, type SessionMeters } from './running-session-types'

export type { RateLimitMeter, SessionMeters, TurnMeter } from './running-session-types'

/**
 * 稼働中のセッション 1 本の計量を selector で読む (O-4 / 014 data-model §2「renderer の保持」)。
 *
 * | 規則 | 根拠 |
 * |---|---|
 * | 1 セッションの値だけを selector で選ぶ — 他のセッションの計量の更新で描き直さない | 014 spec US-2 AC5 / US-3 AC4 |
 * | 値がまだ無い・閉じた・`sessionId` が null (過去の会話・未選択) なら空の計量 (`EMPTY_SESSION_METERS`) を渡す | 014 data-model §4 |
 * | selector は保持している値 (数・列挙・保持している object の参照) を返す。呼ぶたびに新しい object を組まない (購読が毎回変わったと見なす) | zustand の `useStore` |
 */
export function useSessionMeters<T>(
  sessionId: string | null,
  selector: (meters: SessionMeters) => T
): T {
  const store = useRunningSessionStoreApi()
  return useStore(store, (s) =>
    selector((sessionId === null ? undefined : s.meters[sessionId]) ?? EMPTY_SESSION_METERS)
  )
}
