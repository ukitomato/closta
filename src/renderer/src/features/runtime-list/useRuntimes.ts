import { useCallback, useEffect, useState } from 'react'

import { CAPABILITY_KEY } from '@domain/capability'
import type { RuntimeListDTO } from '@domain/runtime/dto'

/**
 * ランタイム一覧の取得と通知の購読 (FE-010 / FE-011)。
 *
 * **再検出は利用者の明示操作に限る** (FR-010)。ここにポーリングを置かない。
 * 判定の進行は main からの通知で届く。
 */

export type LoadState = 'loading' | 'ready' | 'failed'

export interface RuntimesView {
  readonly list: RuntimeListDTO | null
  readonly loadState: LoadState
  /** 再検出中か。二重押しを防ぐために使う。 */
  readonly refreshing: boolean
  /**
   * 再検出。**完了を待てる形にする。**
   *
   * 組み合わせ画面の解消手順は「ディストロを起動する → ランタイムを再検出する」であり、
   * 再検出の**後に**解決を取り直す必要がある。fire-and-forget にすると、
   * 手順どおり押しても古い検出結果で解決してしまう (SF-009)。
   */
  refresh(): Promise<void>
  reprobe(runtimeId: string): void
}

/**
 * capability を取り出す。
 *
 * **`window.closta` を直接参照する箇所をここ 1 つに集める。**
 * 各画面で参照すると、テストでのスタブ差し替え点が散る。
 */
function capability(): typeof window.closta {
  return window[CAPABILITY_KEY]
}

export function useRuntimes(): RuntimesView {
  const [list, setList] = useState<RuntimeListDTO | null>(null)
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    let active = true

    capability()
      .listRuntimes()
      .then((next) => {
        if (!active) return
        setList(next)
        setLoadState('ready')
      })
      .catch(() => {
        if (!active) return
        setLoadState('failed')
      })

    // **購読解除は返る関数で行う。** renderer からコールバックを main に渡さない。
    const unsubscribe = capability().onRuntimesChanged((next) => {
      if (!active) return
      setList(next)
      setLoadState('ready')
    })

    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  const refresh = useCallback(async (): Promise<void> => {
    setRefreshing(true)
    try {
      const next = await capability().refreshRuntimes()
      setList(next)
      setLoadState('ready')
    } catch {
      setLoadState('failed')
      // **呼び出し側へ伝える。** 握り潰すと、待っている側が成功と区別できない。
      throw new Error('refreshRuntimes に失敗した')
    } finally {
      setRefreshing(false)
    }
  }, [])

  const reprobe = useCallback((runtimeId: string) => {
    /*
     * 単発の再判定。結果は通知でも届くが、**停止中だった場合は
     * `distro-not-running` が戻り値でしか分からない**ので一覧を取り直す。
     */
    capability()
      .probeRuntime(runtimeId)
      .then(() => capability().listRuntimes())
      .then(setList)
      .catch(() => setLoadState('failed'))
  }, [])

  return { list, loadState, refreshing, refresh, reprobe }
}
