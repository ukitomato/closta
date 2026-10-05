import { useCallback, useEffect } from 'react'

import { CAPABILITY_KEY } from '@domain/capability'
import type { SessionIndexDTO } from '@domain/session/dto'

import { useSessionsStore } from '@/stores/sessions'

/**
 * セッション一覧の取得と購読 (FE-042)。
 *
 * | 規則 | 根拠 |
 * |---|---|
 * | 初回は**先頭ページ**だけを取る。全件は明示操作 | FR-031 / FR-033 / R-06 |
 * | **`onFoldersChanged` では再列挙しない** | contracts ipc / data-model §7 |
 * | **自動ポーリングもファイル監視もしない** | FR-033 / R-10 |
 * | 取得時刻は DTO が運ぶ。renderer で作らない | FR-034 |
 *
 * **`onSessionsChanged` だけを購読する。** 登録フォルダやランタイムが変わったときの
 * 対応づけのやり直しは main 側が行い、その結果が同じ通知で届く。
 * renderer が `onFoldersChanged` を見て再列挙すると、
 * 登録操作 1 回ごとに UNC I/O を伴う子プロセスが飛ぶ。
 */

function capability(): typeof window.closta {
  return window[CAPABILITY_KEY]
}

export interface SessionsView {
  readonly index: SessionIndexDTO | null
  readonly loading: boolean
  readonly failed: boolean
  readonly selectedRowKey: string | null
  select(rowKey: string | null): void
  /** 利用者の明示操作。**全件を取り直して置き換える** (FR-035)。 */
  refresh(): Promise<void>
  /** 続きを取る (FR-038)。 */
  fetchMore(targetKey: string, offset: number): Promise<void>
  /**
   * ランタイムを再検出してから取り直す (FE-063)。
   *
   * **アプリはディストロを起動しない** (SC-005 / FR-007)。
   * 利用者が起動したあと、実行状態を取り直す手段を提供するだけである。
   */
  rediscover(): Promise<void>
}

export function useSessions(): SessionsView {
  const index = useSessionsStore((s) => s.index)
  const loading = useSessionsStore((s) => s.loading)
  const failed = useSessionsStore((s) => s.failed)
  const selectedRowKey = useSessionsStore((s) => s.selectedRowKey)
  const select = useSessionsStore((s) => s.select)
  const setIndex = useSessionsStore((s) => s.setIndex)
  const setLoading = useSessionsStore((s) => s.setLoading)
  const setFailed = useSessionsStore((s) => s.setFailed)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setIndex(await capability().listSessions())
    } catch {
      /*
       * **失敗を状態として持つ。** 例外を投げ直すと画面全体が落ちる。
       * 1 つの所在の失敗は main 側が行に落として返すので、
       * ここに来るのは IPC そのものが通らなかった場合である。
       */
      setFailed(true)
    }
  }, [setIndex, setLoading, setFailed])

  useEffect(() => {
    /*
     * **初回の取得はランタイムの一覧 (`listRuntimes`) が解決した後に行う** (FR-031 / O-7 FR-016)。
     * ランタイム検出より先に実行状態の確認が走ると、停止中・実行中の所在が「未検出」として並び、
     * 取り直すまで残る。O-7 で過去のセッションの区画はアプリの起動の直後からサイドバーにマウントされるので、
     * 「画面を開いたとき」ではなくランタイムの一覧の解決を待つ。失敗しても待ちを外して取得はする
     * (ランタイムの一覧の失敗は区画の取得を止める理由にならない)。
     *
     * **待っている間も「取得中」にする** (pr-gate R1 ux H-002 / po M-002)。待ちの間に `loading` が false だと、区画は
     * 「未取得」のまま止まって見え、押せる「全件を取り直す」が検出より先に列挙して FR-016 の順序を迂回する。
     */
    let active = true
    setLoading(true)
    void capability()
      .listRuntimes()
      .catch(() => undefined)
      .then(() => {
        if (active) void load()
      })
    // 初回の取得の前に main が配る「未取得の索引」(取得時刻 0。判定バッチの通知で再グループしたもの) は受けない。
    // 受けると取得中の表示が外れ、取得時刻 1970/01/01 が出る (pr-gate R1 platform-boundary L-004)。
    const unsubscribe = capability().onSessionsChanged((next) => {
      if (next.fetchedAt === 0) return
      setIndex(next)
    })
    return () => {
      active = false
      unsubscribe()
    }
  }, [load, setIndex, setLoading])

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      setIndex(await capability().refreshSessions())
    } catch {
      setFailed(true)
    }
  }, [setIndex, setLoading, setFailed])

  const fetchMore = useCallback(
    async (targetKey: string, offset: number) => {
      setLoading(true)
      try {
        setIndex(await capability().fetchMoreSessions(targetKey, offset))
      } catch {
        setFailed(true)
      }
    },
    [setIndex, setLoading, setFailed]
  )

  const rediscover = useCallback(async () => {
    setLoading(true)
    try {
      /*
       * **順序に意味がある。** 実行状態の取り直しを先に済ませないと、
       * 停止中として畳まれたままの所在が再列挙の対象にならない。
       */
      await capability().refreshRuntimes()
      setIndex(await capability().refreshSessions())
    } catch {
      setFailed(true)
    }
  }, [setIndex, setLoading, setFailed])

  return { index, loading, failed, selectedRowKey, select, refresh, fetchMore, rediscover }
}
