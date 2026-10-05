import { useEffect } from 'react'

import { buildSessionRows, findRow } from '@/features/session-list/rows'
import { useRunningSessionStoreApi } from '@/features/session/running-session-context'
import { useSessionsStore } from '@/stores/sessions'
import { useUiStore } from '@/stores/ui'

/**
 * **中央の `focus` の書き手** (O-7 / data-model §1。シェルの 1 か所)。
 *
 * session のコンポーネントは面の状態 (`stores/ui.ts`) を書かない (例外は ui charter の「面の状態」)。ここが 2 つのストアの
 * 選択の変化を購読して決める:
 *
 * | きっかけ | focus |
 * |---|---|
 * | 稼働中の行の選択・承認待ちへの移動・起動の受け付け (`selectionSeq` が上がり `selectedId` が非 null) | `running` (起動の受け付けなら起動ダイアログも閉じる) |
 * | 過去の行の選択 (`selectionSeq` が上がり `selectedRowKey` が非 null) | `past` |
 * | 稼働中のセッションを閉じる (`selectedId` が null に変わる) | `focus === 'running'` なら `none` |
 * | 失敗したセッションを閉じる (同時に `launch.previousFailure` が立つ) | `focus === 'running'` なら `none`、かつ起動ダイアログを開く (X-4 US-1 AC7)。それ以外は面を動かさず、失敗の告知を消す (pr-gate R1 po H-001) |
 * | 一覧の再取得で過去の行が消える | `focus === 'past'` なら `none` |
 *
 * 同じ id を選び直したときも移すため、値の変化ではなく選択の操作の通知 (`selectionSeq`) で受ける。
 */
export function useShellFocus(): void {
  const running = useRunningSessionStoreApi()

  useEffect(
    () =>
      running.subscribe((next, prev) => {
        const ui = useUiStore.getState()
        if (next.selectionSeq !== prev.selectionSeq && next.selectedId !== null) {
          ui.setFocus('running')
          // 起動の受け付け: 選ばれた id が前の状態に無い (store.launch が行を足して選ぶ)。
          if (prev.sessions[next.selectedId] === undefined) ui.setLaunchOpen(false)
          return
        }
        if (prev.selectedId !== null && next.selectedId === null) {
          const failedClose = next.launch !== prev.launch && next.launch.previousFailure !== null
          if (ui.focus !== 'running') {
            // 中央に出していないセッションを閉じた (過去の会話や空の状態のまま、サイドバーの行の「閉じる」)。面は動かさず、
            // 起動ダイアログも開かない。失敗の告知は次に開いたときには古いので消す (pr-gate R1 po H-001 / ux M-004)。
            if (failedClose) running.dismissLaunchNotice()
            return
          }
          ui.setFocus('none')
          // 中央に出していた失敗したセッションを閉じた: 前回の設定と理由つきで起動ダイアログを開く (X-4 US-1 AC7)。
          if (failedClose) ui.setLaunchOpen(true)
        }
      }),
    [running]
  )

  useEffect(
    () =>
      useSessionsStore.subscribe((next, prev) => {
        const ui = useUiStore.getState()
        if (next.selectionSeq !== prev.selectionSeq && next.selectedRowKey !== null) {
          ui.setFocus('past')
          return
        }
        if (ui.focus !== 'past') return
        // 選択が外れた、または一覧の再取得で選んでいた行が消えた (`useTranscript` の `hasSelection` と同じ判定)。
        if (next.selectedRowKey === null) {
          ui.setFocus('none')
          return
        }
        if (next.index !== prev.index && next.index !== null) {
          if (findRow(buildSessionRows(next.index), next.selectedRowKey) === null)
            ui.setFocus('none')
        }
      }),
    []
  )
}
