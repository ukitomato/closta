import { createContext, useContext } from 'react'

import { useUiStore, type TranscriptDensity } from '@/stores/ui'

/**
 * transcript の element (`thread.aui.tsx`。過去ログと実行中で共有) に画面から渡す表示の前提 (O-2)。
 */

/**
 * **記録にこれ以上の終わりが来ないか** (FR-009 / US-2 AC6 / data-model §2「結果不明」)。
 * - 実行中: セッションが終了済み・失敗のとき true (`SessionScreen` が store のセッションの状態から渡す)
 * - 過去ログ: 常に true (`ChatScreen`)。過去ログを開いた時点でまだ動いている task も同じ (記録に結果が無いことは事実)
 *
 * true のとき、終わりを表さない状態のシステムイベントの行は「結果不明 (記録に終わりが無い)」で描く (DTO は変えない)。
 */
export const TranscriptSettledContext = createContext<boolean>(false)

export function useTranscriptSettled(): boolean {
  return useContext(TranscriptSettledContext)
}

/** transcript の情報密度 (FR-012。`stores/ui` の値。監視ビューの行の密度とは別)。 */
export function useTranscriptDensity(): TranscriptDensity {
  return useUiStore((s) => s.transcriptDensity)
}
