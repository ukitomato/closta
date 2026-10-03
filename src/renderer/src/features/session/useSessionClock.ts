import { useEffect } from 'react'
import { useStore } from 'zustand'
import { createStore } from 'zustand/vanilla'

/**
 * 監視ビューの経過時間の時計 (O-1 / FR-005 / research R-03)。
 *
 * | 規則 | 根拠 |
 * |---|---|
 * | 1 秒ごとの時計を**アプリに 1 つだけ**持つ (行ごとに `setInterval` を持たない) | research R-03 |
 * | context ではなく小さな store に置き、読む側は selector で**表記の文字列**を選ぶ。表記が変わらなければ再描画しない。時計を読むのは経過時間の表示だけで、行の本体は時計を購読しない | research R-03 / SC-006 |
 * | 動くのは一覧がマウントされている間だけ (セッション画面以外では止める) | plan renderer 節 |
 */

export const SESSION_CLOCK_INTERVAL_MS = 1_000

const clockStore = createStore<{ readonly now: number }>(() => ({ now: Date.now() }))

let users = 0
let timer: ReturnType<typeof setInterval> | null = null

/** 時計を動かす。一覧のルートで呼ぶ (複数の呼び出しがあっても時計は 1 つ)。 */
export function useSessionClockTicking(): void {
  useEffect(() => {
    users += 1
    if (users === 1) {
      clockStore.setState({ now: Date.now() })
      timer = setInterval(() => clockStore.setState({ now: Date.now() }), SESSION_CLOCK_INTERVAL_MS)
    }
    return () => {
      users -= 1
      if (users === 0 && timer !== null) {
        clearInterval(timer)
        timer = null
      }
    }
  }, [])
}

/** 時計の現在時刻から値を選ぶ。**プリミティブ (表記の文字列) を返す selector** にすること。 */
export function useSessionClock<T>(selector: (now: number) => T): T {
  return useStore(clockStore, (s) => selector(s.now))
}
