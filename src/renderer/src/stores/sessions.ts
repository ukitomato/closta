import { create } from 'zustand'

import type { SessionIndexDTO } from '@domain/session/dto'

/**
 * セッション一覧の状態 (FE-040)。
 *
 * **選択 ID をここに一元化する** — component local state に持たない。
 * assistant-ui の `ExternalStoreThreadListAdapter` は
 * 「`threadId` と外部ストアの選択 ID を同期させること。
 * **component local state ではなくストアか共有コンテキストに集約すること**」を
 * 契約として要求している。分かれると、選択した行と表示中の会話が食い違う。
 *
 * **取得の状態を 3 つに分ける。** `loading` (取得中) / `failed` (呼び出しが落ちた) /
 * `index` (結果)。1 つに潰すと「取得中」と「0 件」が区別できず、
 * 空状態の文言を出し分けられない。
 *
 * **業務データの正本はここではない。** 正本は Claude Code 側にあり (Principle X)、
 * main 側のキャッシュを写しているだけである。取得時刻 (`index.fetchedAt`) を
 * 必ず画面に出すのはそのためである (FR-034)。
 */

interface SessionsState {
  readonly index: SessionIndexDTO | null
  readonly loading: boolean
  readonly failed: boolean
  /**
   * 選択中の行。**`(targetKey, sessionId)` の組**である
   * (`domain` の `sessionRowKey()`)。`sessionId` だけでは
   * 同一 UUID が 2 つの config ディレクトリにある場合に一意でない。
   */
  readonly selectedRowKey: string | null
  /**
   * 行を選ぶたびに増える通知の値 (O-7 / data-model §1)。同じ行を選び直しても上がるので、
   * シェルはこれで「過去の側が選ばれた」を受けて中央を過去の会話に切り替える。
   */
  readonly selectionSeq: number
  setIndex: (index: SessionIndexDTO) => void
  setLoading: (loading: boolean) => void
  setFailed: (failed: boolean) => void
  select: (rowKey: string | null) => void
}

export const useSessionsStore = create<SessionsState>((set) => ({
  index: null,
  loading: false,
  failed: false,
  selectedRowKey: null,
  selectionSeq: 0,
  setIndex: (index) => set({ index, failed: false, loading: false }),
  setLoading: (loading) => set({ loading }),
  setFailed: (failed) => set({ failed, loading: false }),
  select: (selectedRowKey) =>
    set((s) => ({
      selectedRowKey,
      selectionSeq: selectedRowKey === null ? s.selectionSeq : s.selectionSeq + 1
    }))
}))
