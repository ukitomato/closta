import { useMemo } from 'react'

import type { ExternalStoreThreadListAdapter } from '@assistant-ui/react'
import { useShallow } from 'zustand/react/shallow'

import { useRunningSessionStore, useRunningSessionStoreApi } from './running-session-context'

/**
 * **稼働中セッションの `ExternalStoreThreadListAdapter`** (X-5 / FE-011 / Principle XIII)。R-2 の
 * `runtime/thread-list-adapter.ts` と同じ契約で、稼働中セッションを assistant-ui の thread として並べる。
 *
 * | 配線 | 意味 |
 * |---|---|
 * | `threadId` | store の `selectedId` と同期させる (食い違うと選択した行と表示中の会話がずれる) |
 * | `onSwitchToThread` | 表示を切り替える (kill しない。FR-008) |
 * | `onSwitchToNewThread` | 選択を外す (assistant-ui の契約上の口。新規起動はシェルのサイドバーのボタンが起動ダイアログを開く。O-7) |
 *
 * **書き込み操作 (`onRename` / `onArchive` / `onDelete`) は配線しない。** 「閉じる」は一覧と renderer の保持から外す
 * だけで、正本 (Claude Code 側の transcript) を消さない (Principle X)。行の中の操作として `RunningSessionList` が持つ。
 *
 * 表題の材料はフォルダ id だけを選ぶ — 本文の更新で `threads` を作り直さない (SC-003)。
 */
export function useRunningThreadList(
  folderName: (folderId: string) => string
): ExternalStoreThreadListAdapter {
  const store = useRunningSessionStoreApi()
  const selectedId = useRunningSessionStore((s) => s.selectedId)
  const order = useRunningSessionStore((s) => s.order)
  const folderIds = useRunningSessionStore(
    useShallow((s) => s.order.map((id) => s.sessions[id]?.config.folderId ?? ''))
  )

  // 付けた名前 (023 / FR-012)。無ければフォルダの表示名。名前の変更でだけ変わる値を選ぶ。
  const names = useRunningSessionStore(
    useShallow((s) => s.order.map((id) => s.sessions[id]?.name ?? null))
  )

  const threads = useMemo(
    () =>
      order.map((id, i) => ({
        status: 'regular' as const,
        id,
        title: names[i] ?? folderName(folderIds[i] ?? '')
      })),
    [order, folderIds, names, folderName]
  )

  return useMemo(
    () => ({
      threadId: selectedId ?? undefined,
      threads,
      onSwitchToThread: (id: string) => store.select(id),
      onSwitchToNewThread: () => store.select(null)
    }),
    [selectedId, threads, store]
  )
}
