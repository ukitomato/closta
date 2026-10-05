import { useCallback, useEffect, useState } from 'react'

import { EmptyState } from '@/components/assistant-ui/elements/empty-state'
import { ErrorState } from '@/components/assistant-ui/elements/error-state'
import { GenerationLoader } from '@/components/assistant-ui/elements/loading-state'
import { mono, paper } from '@/components/assistant-ui/elements/surfaces'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import { CAPABILITY_KEY } from '@domain/capability'
import type { FolderRuntimeResolutionDTO, WorkspaceFolderDTO } from '@domain/workspace/dto'
import type { RuntimeDescriptorDTO } from '@domain/runtime/dto'

import { useRuntimes } from '../runtime-list/useRuntimes'
import { useFolders } from '../workspace-folders/useFolders'
import {
  BLOCKED_LABELS,
  BOUNDARY_LABELS,
  CROSS_STEP_LABELS,
  RESOLUTION_STEP_LABELS,
  UNREACHABLE_LABELS,
  locationLabel
} from '../workspace-folders/labels'
import { runtimeTitle } from '../runtime-list/labels'

/**
 * 組み合わせの解決 (FE-030 / FE-031)。
 *
 * - **「到達不可」は選択肢に出さず、「一時的に解決不能」は出して解消手順を示す** (FR-028)
 * - **解消手順を実行した結果「到達不可」に確定した組み合わせは、消すと同時に理由を示す** —
 *   黙って消すと、利用者は環境操作をしたうえで理由も次の操作も無い状態に着く
 * - **越境でも選択可能にする** (FR-030 / AD-016 §2)
 * - **選択肢が 0 件のときは理由と次の操作を示す** (到達可能なランタイム 0 件 / 登録フォルダ 0 件)
 */

interface Pair {
  readonly folder: WorkspaceFolderDTO
  readonly runtime: RuntimeDescriptorDTO
  readonly resolution: FolderRuntimeResolutionDTO
}

function capability(): typeof window.closta {
  return window[CAPABILITY_KEY]
}

function BoundaryBadge({ pair }: { pair: Pair }): React.JSX.Element {
  const cross = pair.resolution.boundary === 'cross'
  return (
    <span
      className={cn(
        'rounded-full px-2 py-0.5 text-xs font-medium',
        cross
          ? 'bg-amber-500/15 text-amber-800 dark:text-amber-300'
          : 'bg-foreground/[0.06] text-muted-foreground'
      )}
    >
      {BOUNDARY_LABELS[pair.resolution.boundary]}
    </span>
  )
}

/** 越境の案内 (FE-031)。**3 要素をすべて出す** (FR-031)。 */
function CrossRecommendation({ pair }: { pair: Pair }): React.JSX.Element | null {
  /*
   * **判定は `boundary` で行う。** `recommendation !== null` を条件にすると、
   * `boundary: 'cross'` かつ `recommendation: null` の値が来たときに
   * **バッジだけ出て案内が 1 つも出ない**。
   * SC-006 は「越境と判定された組み合わせについて、**例外なく**」と要求している。
   */
  if (pair.resolution.boundary !== 'cross') return null

  const recommendation = pair.resolution.recommendation
  if (recommendation === null) {
    // 黙って落とさない。案内が取れないこと自体を示す。
    return (
      <div className="border-border/60 mt-3 border-t pt-3 text-sm" role="alert">
        <p>ファイルシステムをまたぐ組み合わせですが、案内を取得できませんでした。</p>
        <p className="text-muted-foreground mt-1 text-xs">再判定を試してください。</p>
      </div>
    )
  }

  return (
    <div className="border-border/60 mt-3 border-t pt-3 text-sm">
      <p>{recommendation.impact}</p>
      <p className="text-muted-foreground mt-1 text-xs">
        推奨の配置先:
        <span className={cn(mono, 'ml-1 break-all')}>{recommendation.suggestedLocation.value}</span>
      </p>
      <ol className="text-muted-foreground mt-1 list-decimal pl-5 text-xs">
        {recommendation.steps.map((step) => (
          <li key={step}>{CROSS_STEP_LABELS[step]}</li>
        ))}
      </ol>
      {/* **越境でも選択できる。** 選択不可にしてはならない (FR-030)。 */}
      <p className="mt-2 text-xs">この組み合わせはこのまま選べます。</p>
    </div>
  )
}

function OptionCard({ pair }: { pair: Pair }): React.JSX.Element {
  const { resolution } = pair
  const blocked = resolution.reachability === 'blocked'

  return (
    <li className={cn(paper, 'rounded-xl px-4 py-3')} data-testid="resolution-option">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium">
            {pair.folder.displayName}
            <span className="text-muted-foreground"> × </span>
            {runtimeTitle(pair.runtime.kind, pair.runtime.distroName)}
          </p>
          <p className="text-muted-foreground mt-0.5 text-xs">
            {locationLabel(pair.folder.location)}
          </p>
          {resolution.runtimePath !== null ? (
            <p className={cn(mono, 'text-muted-foreground break-all')}>
              {resolution.runtimePath.value}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <BoundaryBadge pair={pair} />
          {/*
            **ここにボタンを置かない。** R-1 のスコープは組み合わせの**解決**までで、
            選択の永続化を要求する FR は無い (US-3 の AC 1〜6 はすべて
            「解決結果が示される / 選択肢に現れる」で閉じている)。
            `onClick` の無い `<Button>` を置くと、押しても無反応な対話要素になる。
          */}
          {blocked ? <span className="text-muted-foreground text-xs">今は使えません</span> : null}
        </div>
      </div>

      {blocked && resolution.blockedReason !== null ? (
        <div className="border-border/60 mt-3 border-t pt-3 text-sm">
          <p>{BLOCKED_LABELS[resolution.blockedReason]}</p>
          <ol className="text-muted-foreground mt-1 list-decimal pl-5 text-xs">
            {resolution.resolutionSteps.map((step) => (
              <li key={step}>{RESOLUTION_STEP_LABELS[step]}</li>
            ))}
          </ol>
        </div>
      ) : null}

      <CrossRecommendation pair={pair} />
    </li>
  )
}

export function ResolutionScreen(): React.JSX.Element {
  const runtimes = useRuntimes()
  const folders = useFolders()
  const [pairs, setPairs] = useState<readonly Pair[] | null>(null)
  /**
   * 解決が失敗したこと。
   *
   * **`pairs` の `null` と区別する。** 区別しないと「調べている最中」と
   * 「調べられなかった」が同じ表示になり、`GenerationLoader` が永久に出続ける (MF-002)。
   */
  const [failed, setFailed] = useState(false)

  /*
   * **依存は `list` そのものにする。**
   * `list?.folders ?? []` のような派生配列を依存に置くと、毎レンダーで
   * 新しい配列ができて `useEffect` が再発火し、`setPairs` → 再レンダーの
   * 無限ループになる (実測でテストが停止した)。
   */
  const folderData = folders.list
  const runtimeData = runtimes.list

  const folderList = folderData?.folders ?? []
  const runtimeList = runtimeData?.runtimes ?? []
  /** 判定する対がそもそも在るか。**在らないときは effect を回さない。** */
  const hasPairs = folderList.length > 0 && runtimeList.length > 0

  /**
   * 対ごとの解決を取る。**`setState` をここで呼ばない。**
   *
   * effect の本体で `setState` を呼ぶと連鎖レンダーになり、
   * `react-hooks` が error にする (React の「You Might Not Need an Effect」)。
   * 値を返し、**コールバックの中で** state を更新する。
   */
  const resolveAll = useCallback(async (): Promise<readonly Pair[]> => {
    const folders_ = folderData?.folders ?? []
    const runtimes_ = runtimeData?.runtimes ?? []
    if (folders_.length === 0 || runtimes_.length === 0) return []
    const results: Pair[] = []
    for (const folder of folders_) {
      for (const runtime of runtimes_) {
        // **変換は main 側で行う。** マッピングの中身は renderer に来ない (BE-053)。
        const resolution = await capability().resolveFolderRuntime(folder.id, runtime.id)
        if (resolution === null) continue
        results.push({ folder, runtime, resolution })
      }
    }
    return results
  }, [folderData, runtimeData])

  useEffect(() => {
    if (!hasPairs) return
    let active = true
    // **`setState` はコールバックの中だけ。**
    void resolveAll()
      .then((results) => {
        if (active) {
          setPairs(results)
          setFailed(false)
        }
      })
      /*
       * **`catch` を省かない。** IPC が reject すると `pairs` が `null` のままになり、
       * 「組み合わせを調べています」が**永久に出続ける** (MF-002)。
       * 他 2 画面は `ErrorState` を持つので、同じ失敗が画面ごとに別体験になっていた。
       */
      .catch(() => {
        if (active) setFailed(true)
      })
    return () => {
      active = false
    }
  }, [hasPairs, resolveAll])

  /**
   * 再判定。**ランタイムの再検出から行う。**
   *
   * `blocked` の解消手順は「ディストロを起動する → ランタイムを再検出する」である。
   * 解決の再計算だけでは main 側の検出キャッシュが更新されないので、
   * **手順どおり押しても同じ `blocked` が返り続けていた** (SF-009)。
   */
  const reevaluate = useCallback(() => {
    setFailed(false)
    setPairs(null)
    void runtimes
      .refresh()
      .then(() => resolveAll())
      .then(setPairs)
      .catch(() => setFailed(true))
  }, [runtimes, resolveAll])

  /*
   * **選択肢が 0 件のときは理由と次の操作を示す** (FR-028)。
   * 判定を回す前に決まるので、ここで描き切る。
   */
  if (!hasPairs) {
    return (
      <div className="flex flex-col gap-4">
        <h2 className="text-lg font-medium">フォルダとランタイムの組み合わせ</h2>
        <EmptyState>
          {folderList.length === 0 ? (
            <div className="text-sm">
              <p>登録された作業フォルダがありません。</p>
              <p className="text-muted-foreground mt-1 text-xs">
                設定の「作業フォルダ」で所在を選んで登録してください。
              </p>
            </div>
          ) : (
            <div className="text-sm">
              <p>利用できるランタイムがありません。</p>
              <p className="text-muted-foreground mt-1 text-xs">
                設定の「ランタイム」で再検出してください。
              </p>
            </div>
          )}
        </EmptyState>
      </div>
    )
  }

  if (failed) {
    return (
      <div className="flex flex-col gap-4">
        <h2 className="text-lg font-medium">フォルダとランタイムの組み合わせ</h2>
        <ErrorState
          title="組み合わせを判定できませんでした"
          detail="再判定を試してください。続く場合はアプリを再起動してください。"
          retrying={false}
          onRetry={reevaluate}
          retryLabel="再判定"
          retryingLabel="再判定中"
        />
      </div>
    )
  }

  if (pairs === null) {
    return <GenerationLoader variant="dots" label="組み合わせを調べています" tick={0} />
  }

  /*
   * **「到達不可」は選択肢に出さない。** ただし**消すと同時に理由を示す** (FR-028)。
   * `blocked` は選択肢に残して解消手順を示す。
   */
  const options = pairs.filter((pair) => pair.resolution.reachability !== 'unreachable')
  const excluded = pairs.filter((pair) => pair.resolution.reachability === 'unreachable')

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium">フォルダとランタイムの組み合わせ</h2>
        <Button variant="outline" size="sm" onClick={reevaluate}>
          ランタイムを再検出して再判定
        </Button>
      </div>

      {/* 対はあるが全部が到達不可だった場合。**下の枠に理由が並ぶ。** */}
      {options.length === 0 ? (
        <EmptyState>
          <div className="text-sm">
            <p>選べる組み合わせがありません。</p>
            <p className="text-muted-foreground mt-1 text-xs">
              下の「使えない組み合わせ」に理由があります。
            </p>
          </div>
        </EmptyState>
      ) : (
        <ul className="flex flex-col gap-3">
          {options.map((pair) => (
            <OptionCard key={`${pair.folder.id}:${pair.runtime.id}`} pair={pair} />
          ))}
        </ul>
      )}

      {/*
        **黙って消さない** (FR-028)。
        `blocked` から解消手順を実行した結果 `unreachable` に確定した組み合わせも、
        ここに理由つきで現れる。
      */}
      {excluded.length > 0 ? (
        <div className={cn(paper, 'rounded-xl px-4 py-3')} data-testid="resolution-excluded">
          <p className="text-sm font-medium">使えない組み合わせ</p>
          <ul className="mt-2 flex flex-col gap-2 text-sm">
            {excluded.map((pair) => (
              <li key={`${pair.folder.id}:${pair.runtime.id}`}>
                <span className="font-medium">
                  {pair.folder.displayName}
                  <span className="text-muted-foreground"> × </span>
                  {runtimeTitle(pair.runtime.kind, pair.runtime.distroName)}
                </span>
                {pair.resolution.unreachableReason !== null ? (
                  <span className="text-muted-foreground ml-2">
                    {UNREACHABLE_LABELS[pair.resolution.unreachableReason]}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
