import { useMemo } from 'react'

import type { ExternalStoreThreadListAdapter } from '@assistant-ui/react'

import type { SessionRow } from '@/features/session-list/rows'

/**
 * セッション一覧の `ExternalStoreThreadListAdapter` (FE-041)。
 *
 * **書き込み操作を配線しない。** adapter の各 `on*` は省略可であり、
 * 省略すると assistant-ui 側にその操作の経路ができない。
 *
 * | 省いたもの | 理由 |
 * |---|---|
 * | `onSwitchToNewThread` | R-2 はセッションを**作らない** (FR-003)。起動は X-1 |
 * | `onRename` | config ディレクトリへの**書き込み**になる (FR-013) |
 * | `onArchive` / `onUnarchive` | 同上 |
 * | `onDelete` | **正本を削除する** (Principle X / AD-007) |
 * | `archivedThreads` | 保存状態の概念が無い。**空配列も渡さない** — 渡すと UI に区画ができる |
 *
 * **`onSwitchToThread` だけを配線する。** 選択は読み取りであり、
 * 本文の取得 (R-3) の入口になる。
 *
 * **`threadId` と外部ストアの選択 ID を同期させる。** adapter の契約であり、
 * 食い違うと選択した行と表示中の会話がずれる。選択は Zustand ストアに
 * 一元化してある (`stores/sessions.ts`)。
 */

export interface ThreadListAdapterInput {
  readonly rows: readonly SessionRow[]
  readonly selectedRowKey: string | null
  readonly loading: boolean
  readonly titleOf: (row: SessionRow) => string
  readonly onSelect: (rowKey: string) => void
}

export function useSessionThreadListAdapter(
  input: ThreadListAdapterInput
): ExternalStoreThreadListAdapter {
  const { rows, selectedRowKey, loading, titleOf, onSelect } = input

  /*
   * **`threads` の順序が `rows` の順序と一致していなければならない。**
   * `ThreadListPrimitive.ItemByIndex` は位置で行を指すため、
   * ここで並べ替えると見出しと行の対応が崩れる (`rows.ts` の注記)。
   */
  const threads = useMemo(
    () =>
      rows.map((row) => ({
        status: 'regular' as const,
        id: row.rowKey,
        title: titleOf(row)
      })),
    [rows, titleOf]
  )

  return useMemo(
    () => ({
      threadId: selectedRowKey ?? undefined,
      isLoading: loading,
      threads,
      onSwitchToThread: onSelect
    }),
    [selectedRowKey, loading, threads, onSelect]
  )
}
