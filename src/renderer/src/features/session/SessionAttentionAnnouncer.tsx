import { useEffect, useState } from 'react'

import { useUiStore, watchedIdOf } from '@/stores/ui'

import { useRunningSessionStoreApi } from './running-session-context'
import { announcements } from './session-view'

/**
 * 承認待ち・失敗を支援技術に 1 回だけ知らせる live region (O-1 / FR-004 / research R-05)。**App の寿命で 1 つだけ**置く。
 *
 * | 規則 | 根拠 |
 * |---|---|
 * | 対象は**見ていないセッション** — `watchedIdOf` (中央に稼働中の会話を出していて、設定のダイアログを開いていないときの選択中) 以外。過去の会話や設定を開いている間は、選ばれていたものも通知する | FR-004 / design-gate R2 po H-101 / O-7 FR-006 |
 * | 承認待ち・失敗に**入った**ときだけ。同じ更新の複数の遷移は 1 つの文 (ストアが `statusSince` の変化を 1 回の `setState` にまとめる) | FR-004 / data-model §1 |
 * | 文は作業フォルダの表示名 (起動時に写した `folderLabel`) と固定の文言だけ。**会話由来の文字列を入れない**。IPC を持たない | FR-004 / design-gate R2 architecture M-101 |
 * | 同じ文が続いても読まれるよう、書き込みのたびに要素を入れ替える | research R-05 |
 */
export function SessionAttentionAnnouncer(): React.JSX.Element {
  const store = useRunningSessionStoreApi()
  const [message, setMessage] = useState<{ readonly seq: number; readonly text: string } | null>(
    null
  )

  useEffect(
    () =>
      store.subscribe((next, prev) => {
        if (next.statusSince === prev.statusSince) return
        const watchedId = watchedIdOf(useUiStore.getState(), next.selectedId)
        const text = announcements(
          prev.statusSince,
          next.statusSince,
          watchedId,
          (id) => next.sessions[id]?.folderLabel ?? null
        )
        if (text !== null) setMessage((m) => ({ seq: (m?.seq ?? 0) + 1, text }))
      }),
    [store]
  )

  return (
    <div role="status" aria-live="polite" className="sr-only" data-testid="session-announcer">
      {message !== null && <span key={message.seq}>{message.text}</span>}
    </div>
  )
}
