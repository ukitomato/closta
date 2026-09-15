import { useState } from 'react'

import { EmptyState } from '@/components/assistant-ui/elements/empty-state'
import { ErrorState } from '@/components/assistant-ui/elements/error-state'
import { GenerationLoader } from '@/components/assistant-ui/elements/loading-state'
import { mono, paper } from '@/components/assistant-ui/elements/surfaces'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import { shouldSuggestUnregister } from '@domain/workspace/folder'
import type { LocationDTO, WorkspaceFolderDTO } from '@domain/workspace/dto'

import { useRuntimes } from '../runtime-list/useRuntimes'
import {
  BLOCKED_LABELS,
  BROWSE_ERROR_LABELS,
  REACHABILITY_LABELS,
  REGISTER_ERROR_LABELS,
  RESOLUTION_STEP_LABELS,
  RESTORE_ISSUE_LABELS,
  UNREACHABLE_LABELS,
  locationLabel
} from './labels'
import { useFolders } from './useFolders'

/**
 * 作業フォルダの登録と一覧 (FE-020 / FE-021 / FE-022)。
 *
 * - **停止中ディストロを選んだら起動と再検出の導線**を出し、黙って起動しない (FR-018)
 * - **main が返すパスをそのまま使い、renderer でパス文字列を連結しない** (FR-025)
 * - **解除操作は全エントリに出し、解除を「勧める」表示は「使えない」のときだけ** (FR-017)
 * - **復元できなかった件数と理由を提示する** (FR-019)
 */

function isKnownError(key: string): key is keyof typeof BROWSE_ERROR_LABELS {
  return key in BROWSE_ERROR_LABELS
}

function isRegisterError(key: string): key is keyof typeof REGISTER_ERROR_LABELS {
  return key in REGISTER_ERROR_LABELS
}

/** 参照キーを訳す。**未知のキーは生で出さず、その旨だけを出す** (FR-047)。 */
function errorText(key: string | null): string | null {
  if (key === null) return null
  if (isKnownError(key)) return BROWSE_ERROR_LABELS[key]
  if (isRegisterError(key)) return REGISTER_ERROR_LABELS[key]
  return '処理できませんでした'
}

function ReachabilityBadge({ folder }: { folder: WorkspaceFolderDTO }): React.JSX.Element {
  const tone =
    folder.reachability === 'reachable'
      ? 'text-emerald-600 dark:text-emerald-400'
      : folder.reachability === 'blocked'
        ? 'text-amber-600 dark:text-amber-400'
        : 'text-red-600 dark:text-red-400'

  return (
    <span className={cn('text-xs font-medium', tone)}>
      {REACHABILITY_LABELS[folder.reachability]}
    </span>
  )
}

function FolderCard({
  folder,
  onUnregister
}: {
  folder: WorkspaceFolderDTO
  onUnregister: (id: string) => void
}): React.JSX.Element {
  /*
   * **解除を「勧める」かどうかだけを `reachability` で分ける** (FR-017 の 2 層)。
   * 操作自体は全エントリに出す — 越境の案内が旧エントリの解除を含むため、
   * 制限すると案内が実行不能な指示になる。
   */
  const suggestUnregister = shouldSuggestUnregister(folder.reachability)

  return (
    <li className={cn(paper, 'rounded-xl px-4 py-3')}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium">{folder.displayName}</p>
          <p className={cn(mono, 'text-muted-foreground break-all')}>{folder.path.value}</p>
          <p className="text-muted-foreground mt-1 text-xs">{locationLabel(folder.location)}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <ReachabilityBadge folder={folder} />
          <Button
            variant={suggestUnregister ? 'destructive' : 'outline'}
            size="sm"
            onClick={() => onUnregister(folder.id)}
          >
            登録を解除
          </Button>
        </div>
      </div>

      {folder.unreachableReason !== null ? (
        <p className="border-border/60 mt-3 border-t pt-3 text-sm">
          {UNREACHABLE_LABELS[folder.unreachableReason]}
          {suggestUnregister ? (
            <span className="text-muted-foreground"> — 登録の解除をおすすめします。</span>
          ) : null}
        </p>
      ) : null}

      {folder.blockedReason !== null ? (
        <div className="border-border/60 mt-3 border-t pt-3 text-sm">
          <p>{BLOCKED_LABELS[folder.blockedReason]}</p>
          {folder.resolutionSteps.length > 0 ? (
            <ol className="text-muted-foreground mt-1 list-decimal pl-5 text-xs">
              {folder.resolutionSteps.map((step) => (
                <li key={step}>{RESOLUTION_STEP_LABELS[step]}</li>
              ))}
            </ol>
          ) : null}
        </div>
      ) : null}
    </li>
  )
}

export function WorkspaceFoldersScreen(): React.JSX.Element {
  const folders = useFolders()
  const runtimes = useRuntimes()
  const [displayName, setDisplayName] = useState('')

  if (folders.failed) {
    return (
      <ErrorState
        title="登録フォルダを読み込めませんでした"
        detail="アプリの再起動を試してください。"
        retrying={false}
        onRetry={folders.refresh}
      />
    )
  }

  const wslRuntimes = (runtimes.list?.runtimes ?? []).filter((runtime) => runtime.kind === 'wsl')
  const browseResult = folders.browse?.result
  const entries = browseResult?.ok === true ? browseResult.entries : []
  const cwd = browseResult?.ok === true ? browseResult.cwd : null
  const parent = browseResult?.ok === true ? browseResult.parent : null

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium">作業フォルダ</h2>
      </div>

      {/* ── 所在の選択 (FE-020) ─────────────────────────────────────── */}
      <div className={cn(paper, 'flex flex-col gap-3 rounded-xl px-4 py-3')}>
        <p className="text-sm font-medium">所在を選んで登録する</p>
        <p className="text-muted-foreground text-xs">
          所在は登録時に選びます。パス文字列から推測しません。
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              // 所在 `windows` の入口は**ネイティブダイアログだけ**である。
              const draft = await folders.pickHostFolder()
              if (draft !== null) await folders.register(draft)
            }}
          >
            Windows のフォルダを選ぶ…
          </Button>

          {wslRuntimes.map((runtime) => {
            const stopped = runtime.state === 'stopped'
            const location: LocationDTO = {
              kind: 'wsl',
              distroName: runtime.distroName ?? ''
            }
            return (
              <Button
                key={runtime.id}
                variant="outline"
                size="sm"
                onClick={() => {
                  // **停止中でも黙って起動しない** (FR-018)。導線だけを出す。
                  if (!stopped) void folders.beginBrowse(location)
                }}
                disabled={stopped}
              >
                {locationLabel(location)}
                {stopped ? ' (停止中)' : ''}
              </Button>
            )
          })}
        </div>

        {wslRuntimes.some((runtime) => runtime.state === 'stopped') ? (
          <div className="border-border/60 border-t pt-3 text-sm">
            <p>停止中のディストロは辿れません。次の手順で使えるようになります。</p>
            <ol className="text-muted-foreground mt-1 list-decimal pl-5 text-xs">
              <li>{RESOLUTION_STEP_LABELS['start-distro']}</li>
              <li>{RESOLUTION_STEP_LABELS['rescan-runtimes']}</li>
            </ol>
            <Button
              className="mt-2"
              variant="outline"
              size="sm"
              onClick={runtimes.refresh}
              disabled={runtimes.refreshing}
            >
              {runtimes.refreshing ? '再検出中…' : 'ランタイムを再検出'}
            </Button>
          </div>
        ) : null}
      </div>

      {/* ── フォルダブラウザ (FE-021) ───────────────────────────────── */}
      {folders.browse !== null ? (
        <div className={cn(paper, 'flex flex-col gap-3 rounded-xl px-4 py-3')}>
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium">{locationLabel(folders.browse.location)} を辿る</p>
            <Button variant="ghost" size="sm" onClick={folders.closeBrowse}>
              閉じる
            </Button>
          </div>

          <p className={cn(mono, 'text-muted-foreground break-all')}>{cwd?.value ?? '—'}</p>

          {folders.browse.loading ? (
            <GenerationLoader variant="dots" label="読み込み中" tick={0} />
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void folders.move({ kind: 'root' })}
                >
                  ルートへ
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={parent === null || cwd === null}
                  onClick={() => {
                    // **main が返したパスをそのまま渡す。** 文字列を組み立てない。
                    if (cwd !== null) void folders.move({ kind: 'parent', of: cwd })
                  }}
                >
                  親へ
                </Button>
              </div>

              {/*
                **Principle XIII の照合結果 (AD-024 #11)。**
                候補として registry の `file-tree` element を実名で照合した。
                不適合の理由は「**選択のコールバックを持たない表示専用の element** であり、
                `nodes` (path / depth / additions / deletions) は差分一覧の形をしていて
                階層移動の入力にならない」ことである。
                自作するのはこの 1 点のためであり、体裁は `surfaces` のトークンに揃える。
              */}
              <ul className="flex flex-col">
                {entries.length === 0 ? (
                  <li className="text-muted-foreground px-1 py-2 text-sm">
                    このフォルダには項目がありません。
                  </li>
                ) : null}
                {entries.map((entry) => (
                  <li key={entry.path.value}>
                    <button
                      type="button"
                      className={cn(
                        'hover:bg-foreground/[0.04] flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-sm',
                        entry.isDirectory ? '' : 'text-muted-foreground'
                      )}
                      disabled={!entry.isDirectory}
                      onClick={() => {
                        // **合成は main 側**。名前だけを渡す (FR-025)。
                        if (cwd !== null)
                          void folders.move({ kind: 'child', of: cwd, name: entry.name })
                      }}
                    >
                      <span aria-hidden>{entry.isDirectory ? '📁' : '📄'}</span>
                      <span className="min-w-0 break-all">{entry.name}</span>
                    </button>
                  </li>
                ))}
              </ul>

              <div className="border-border/60 flex flex-wrap items-center gap-2 border-t pt-3">
                <input
                  className="bg-background border-border/60 min-w-0 flex-1 rounded-md border px-2 py-1 text-sm"
                  placeholder="表示名 (未入力ならフォルダ名)"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                />
                <Button
                  size="sm"
                  disabled={cwd === null}
                  onClick={async () => {
                    if (cwd === null) return
                    const fallback = cwd.value.split('/').filter(Boolean).pop() ?? cwd.value
                    await folders.register({
                      location: folders.browse!.location,
                      path: cwd,
                      displayName: displayName.length > 0 ? displayName : fallback
                    })
                    setDisplayName('')
                  }}
                >
                  ここを登録する
                </Button>
              </div>
            </>
          )}
        </div>
      ) : null}

      {errorText(folders.lastError) !== null ? (
        <p className={cn(paper, 'rounded-xl px-4 py-3 text-sm')}>{errorText(folders.lastError)}</p>
      ) : null}

      {/* ── 一覧 (FE-022) ───────────────────────────────────────────── */}
      {folders.list === null ? (
        <GenerationLoader variant="dots" label="登録フォルダを読み込み中" tick={0} />
      ) : folders.list.folders.length === 0 ? (
        <EmptyState>
          <p className="text-sm">
            まだ登録がありません。上の「所在を選んで登録する」から追加してください。
          </p>
        </EmptyState>
      ) : (
        <ul className="flex flex-col gap-3">
          {folders.list.folders.map((folder) => (
            <FolderCard key={folder.id} folder={folder} onUnregister={folders.unregister} />
          ))}
        </ul>
      )}

      {/* **復元できなかった件数と理由を提示する** (FR-019 / SC-013)。 */}
      {folders.list !== null && folders.list.restoreIssues.skipped > 0 ? (
        <div className={cn(paper, 'rounded-xl px-4 py-3')}>
          <p className="text-sm font-medium">
            復元できなかった登録が {folders.list.restoreIssues.skipped} 件あります
          </p>
          <ul className="mt-2 list-disc pl-5 text-sm">
            {folders.list.restoreIssues.reasonKeys.map((key) => (
              <li key={key}>{RESTORE_ISSUE_LABELS[key]}</li>
            ))}
          </ul>
          {folders.list.restoreIssues.backupPath !== null ? (
            <p className="text-muted-foreground mt-2 text-xs">
              元のファイルは
              <span className={cn(mono, 'mx-1 break-all')}>
                {folders.list.restoreIssues.backupPath.value}
              </span>
              に退避しました。
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
