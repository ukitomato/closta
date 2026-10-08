import { useEffect, useState } from 'react'

import { useUiStore, watchedIdOf } from '@/stores/ui'

import { attentionAnnouncement } from './labels'
import { useRunningSessionStoreApi } from './running-session-context'
import { attentionTransitions, viewOf } from './session-view'

/**
 * 承認待ち・失敗を支援技術に 1 回だけ知らせる live region (O-1 / FR-004 / research R-05)。**App の寿命で 1 つだけ**置く。
 *
 * | 規則 | 根拠 |
 * |---|---|
 * | 対象は**見ていないセッション** — `watchedIdOf` (定義は `stores/ui.ts` = 013 data-model §1) 以外。過去の会話・設定・起動ダイアログを開いている間は、選ばれていたものも通知する | FR-004 / design-gate R2 po H-101 / O-7 FR-006・pr-gate R2 architecture M-102 |
 * | 承認待ち・失敗に**入った**ときだけ。同じ更新の複数の遷移は 1 つの文 (ストアが `statusSince` の変化を 1 回の `setState` にまとめる) | FR-004 / data-model §1 |
 * | 文は作業フォルダの表示名 (起動時に写した `folderLabel`) と固定の文言だけ。**会話由来の文字列を入れない**。IPC を持たない。導出 (`attentionTransitions`) は名前の組までを返し、文はここで `attentionAnnouncement` が組む | FR-004 / design-gate R2 architecture M-101 / O-4 FR-018 (2) |
 * | 失敗の文には、監視ビューの行と同じ理由 (`viewOf` の `failureReason`) の短い理由を添える。理由が無い・汎用の `provider-error` は理由を添えない | 014 spec US-1 AC5 / data-model §5 |
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
        const transitions = attentionTransitions(
          prev.statusSince,
          next.statusSince,
          watchedId,
          (id) => next.sessions[id]?.folderLabel ?? null,
          (id) => viewOf(next, id).failureReason
        )
        if (transitions === null) return
        const text = attentionAnnouncement(transitions.awaiting, transitions.failed)
        setMessage((m) => ({ seq: (m?.seq ?? 0) + 1, text }))
      }),
    [store]
  )

  return (
    <div role="status" aria-live="polite" className="sr-only" data-testid="session-announcer">
      {message !== null && <span key={message.seq}>{message.text}</span>}
    </div>
  )
}
