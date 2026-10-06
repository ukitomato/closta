import { useEffect, useState } from 'react'

import { CAPABILITY_KEY } from '@domain/capability'
import { isLaunchCount, type LaunchUsageSummaryDTO } from '@domain/session/launch-usage'

/**
 * プリセットの欄の起動の利用記録 (O-3 / 012 spec FR-013 / data-model §4「表示」)。**`window.closta` を直接参照する
 * 箇所をここ 1 つに集める** (usePresets と同型)。
 *
 * - 欄を描いたとき (起動ダイアログを開いたとき) に `getLaunchUsage()` を 1 回呼ぶ
 * - 集計済みの 2 つの回数だけを受ける (日ごとの記録は main から来ない)
 * - invoke の失敗 (reject・同期の例外) と、形の合わない値は「読めない」として描く
 */

function capability(): typeof window.closta {
  return window[CAPABILITY_KEY]
}

export type LaunchUsageView =
  | { readonly status: 'loading' }
  | { readonly status: 'ok'; readonly preset: number; readonly manual: number }
  | { readonly status: 'unreadable' }

function toView(summary: LaunchUsageSummaryDTO | null | undefined): LaunchUsageView {
  if (summary?.status === 'ok' && isLaunchCount(summary.preset) && isLaunchCount(summary.manual)) {
    return { status: 'ok', preset: summary.preset, manual: summary.manual }
  }
  return { status: 'unreadable' }
}

export function useLaunchUsage(): LaunchUsageView {
  const [view, setView] = useState<LaunchUsageView>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    // 同期に投げても reject と同じ扱いにする (capability の契約は「すべて非同期」だが、欄の表示を例外で壊さない)。
    void Promise.resolve()
      .then(() => capability().getLaunchUsage())
      .then(
        (summary) => {
          if (!cancelled) setView(toView(summary))
        },
        () => {
          if (!cancelled) setView({ status: 'unreadable' })
        }
      )
    return () => {
      cancelled = true
    }
  }, [])

  return view
}
