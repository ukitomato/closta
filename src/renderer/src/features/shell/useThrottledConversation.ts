import { useEffect, useRef, useState } from 'react'

import type { CenterConversation } from '@/features/chat/center-conversation'

/**
 * 中央の会話の公開値を、前縁と後縁で `intervalMs` に 1 回までに間引く (O-9 data-model §6 / research R-12)。
 * 前縁: 最後に出してから `intervalMs` 以上たっていれば即時に出す。後縁: 続く更新は最新の値 1 つにまとめ、間隔が空いたら出す。
 * 会話が替わる (`conversationKey` が違う・無くなる) ときは間引かず即時に出す (前の会話の行を残さない)。
 * `now` は出した時点の時計 (行の時刻の書式の「今日」を、描画のたびに読まないため)。
 */
export interface ThrottledConversation {
  readonly value: CenterConversation | null
  readonly now: number
}

export function useThrottledConversation(
  value: CenterConversation | null,
  intervalMs: number
): ThrottledConversation {
  const [shown, setShown] = useState<ThrottledConversation>(() => ({ value, now: Date.now() }))
  const lastEmitRef = useRef(0)
  const shownKeyRef = useRef<string | null>(value?.conversationKey ?? null)
  const latestRef = useRef(value)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    latestRef.current = value
    const emit = (next: CenterConversation | null): void => {
      const now = Date.now()
      lastEmitRef.current = now
      shownKeyRef.current = next?.conversationKey ?? null
      setShown({ value: next, now })
    }
    const key = value?.conversationKey ?? null
    const elapsed = Date.now() - lastEmitRef.current
    if (key !== shownKeyRef.current || elapsed >= intervalMs) {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
      emit(value)
      return
    }
    if (timerRef.current === null) {
      timerRef.current = setTimeout(() => {
        timerRef.current = null
        emit(latestRef.current)
      }, intervalMs - elapsed)
    }
  }, [value, intervalMs])

  useEffect(
    () => () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current)
    },
    []
  )

  return shown
}
