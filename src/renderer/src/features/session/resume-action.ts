import { useCallback } from 'react'

import type { SessionRunState } from '@domain/session/run-state'

import { useUiStore } from '@/stores/ui'

import { useRunningSessionStoreApi } from './running-session-context'

/**
 * **稼働中の行の「再開」「やり直す」の出し分けと実行** (X-9 / FE-020 / data-model §9.1・§9.2・§9.5)。
 *
 * 出し分けは純関数 `resumeActionFor` が行う (行・`EndNotice`・`FailureBanner` の 3 か所が同じ関数を通る)。
 * 自動で再開する経路は作らない (FR-009) — 利用者が押したときだけ `useRowActionRunner` が動く。
 */

export type RowResumeAction = 'resume' | 'retry'

/**
 * | 行の状態 | `claudeAlive` | 会話の id | 操作 |
 * |---|---|---|---|
 * | 動いている・中断済み・承認待ち・応答待ち | true | どちらでも | なし |
 * | 終了済み | false | あり / なし | `resume` / なし |
 * | 失敗 | false | あり / なし | `resume` / `retry` |
 * | 失敗で `claudeAlive` が true (終わりの通知の前) | true | どちらでも | なし |
 */
export function resumeActionFor(row: {
  readonly runState: SessionRunState
  /** `claudeAlive === false` (`SessionView.ended`)。 */
  readonly ended: boolean
  /** 会話の id を持つ (main が `sessionResumable` で知らせた真偽。値は持たない)。 */
  readonly resumable: boolean
}): RowResumeAction | null {
  if (!row.ended) return null
  if (row.resumable) return 'resume'
  return row.runState === 'error' ? 'retry' : null
}

/** 操作を実行する関数を返す。「再開」は再開の形の起動ダイアログを、「やり直す」は新規起動の形のダイアログを開く。 */
export function useRowActionRunner(): (sessionId: string, action: RowResumeAction) => void {
  const store = useRunningSessionStoreApi()
  const setLaunchOpen = useUiStore((s) => s.setLaunchOpen)
  return useCallback(
    (sessionId, action) => {
      const session = store.getState().sessions[sessionId]
      if (session === undefined) return
      if (action === 'resume') {
        const { config } = session
        store.openResume({
          source: { kind: 'live', sessionId },
          fixed: {
            folderId: config.folderId,
            runtimeId: config.runtimeId,
            providerId: config.providerId
          },
          initial: {
            modelId: config.modelId,
            effort: config.effort,
            permissionMode: config.permissionMode
          },
          initialOrigin: session.launchOrigin,
          replaces: sessionId
        })
      } else {
        // 今の「失敗した行を閉じる」と同じ遷移 (前回の設定と理由が起動ダイアログへ戻る)。開くことだけを足す。
        store.close(sessionId)
      }
      setLaunchOpen(true)
    },
    [store, setLaunchOpen]
  )
}
