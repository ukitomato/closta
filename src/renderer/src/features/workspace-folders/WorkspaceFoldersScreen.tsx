import { useEffect, useRef, useState } from 'react'

import { EmptyState } from '@/components/assistant-ui/elements/empty-state'
import { ErrorState } from '@/components/assistant-ui/elements/error-state'
import { GenerationLoader } from '@/components/assistant-ui/elements/loading-state'
import { mono, paper } from '@/components/assistant-ui/elements/surfaces'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { useUiStore } from '@/stores/ui'

import { shouldSuggestUnregister } from '@domain/workspace/folder'
import type {
  LocationDTO,
  RegisterFolderResult,
  WorkspaceFolderDTO,
  WorkspaceFolderDraftDTO
} from '@domain/workspace/dto'

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
  /*
   * **light 既定で WCAG 1.4.3 (AA) を満たす段を使う。**
   *
   * 12px の文字には 4.5:1 が要る。白背景に対して
   * `amber-600` は約 2.9:1、`emerald-600` は約 3.7:1 で不足していた。
   * 既定テーマは light なので、**起動直後に見える状態が不適合**だった。
   *
   * しかも最悪値だったのが `blocked` (= 利用者が取るべき操作がある状態) で、
   * FR-017 が分けたがっている「解除を勧める / 勧めない」の区別が視覚的に潰れていた。
   *
   * **色だけに依っているわけではない** — `REACHABILITY_LABELS` が 3 値すべてに
   * 日本語テキストを与えており 1.4.1 は満たす。問題は「その色が読めない」ことだった。
   * 独自トークンは足さず、既存パレットの段を選び直すだけにしてある (Principle XIII)。
   */
  const tone =
    folder.reachability === 'reachable'
      ? 'text-emerald-700 dark:text-emerald-400'
      : folder.reachability === 'blocked'
        ? 'text-amber-800 dark:text-amber-400'
        : 'text-red-700 dark:text-red-400'

  return (
    <span className={cn('text-xs font-medium', tone)}>
      {REACHABILITY_LABELS[folder.reachability]}
    </span>
  )
}

function FolderCard({
  folder,
  onUnregister,
  highlighted
}: {
  folder: WorkspaceFolderDTO
  onUnregister: (id: string) => void
  /** 重複登録で拒否されたときの既存エントリか (AC US-2-5)。 */
  highlighted: boolean
}): React.JSX.Element {
  /*
   * **解除を「勧める」かどうかだけを `reachability` で分ける** (FR-017 の 2 層)。
   * 操作自体は全エントリに出す — 越境の案内が旧エントリの解除を含むため、
   * 制限すると案内が実行不能な指示になる。
   */
  const suggestUnregister = shouldSuggestUnregister(folder.reachability)

  /*
   * **解除の前に確認する。**
   *
   * FR-017 が全エントリに解除操作を出すよう求めている以上、誤操作面も全エントリに開く。
   * しかも復元コストは到達可能性で非対称である —
   * `blocked` (所在ディストロが停止中) と `unreachable` のエントリは
   * 所在選択ボタン自体が押せないため、**誤って解除するとアプリ内で作り直せない**。
   * undo が無い以上、緩衝は確認以外に置き場が無い。
   */
  const [confirming, setConfirming] = useState(false)

  const cardRef = useRef<HTMLLIElement>(null)
  useEffect(() => {
    // 既存エントリとして示されたら、見える位置へ運ぶ。
    if (highlighted) cardRef.current?.scrollIntoView({ block: 'nearest' })
  }, [highlighted])

  return (
    <li
      ref={cardRef}
      className={cn(
        paper,
        'rounded-xl px-4 py-3',
        // **色だけに依らない。** 下に文言でも示す。
        highlighted && 'ring-primary/60 ring-2'
      )}
    >
      {highlighted ? (
        <p className="text-primary mb-2 text-xs font-medium">
          このフォルダは既に登録されています。こちらを使ってください。
        </p>
      ) : null}
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
            onClick={() => setConfirming(true)}
          >
            登録を解除
          </Button>

          <Dialog open={confirming} onOpenChange={setConfirming}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>登録を解除しますか</DialogTitle>
                {/*
                  **対象を名指す。** 「よろしいですか?」だけにしない —
                  一覧に複数あるとき、どれを消そうとしているのか分からない。
                */}
                <DialogDescription>
                  「{folder.displayName}」({folder.path.value}) の登録を解除します。
                  <br />
                  フォルダ自体は削除されません。
                  {suggestUnregister ? null : (
                    <>
                      <br />
                      このフォルダは今も使えます。解除すると登録し直しが必要になります。
                    </>
                  )}
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline" size="sm">
                    キャンセル
                  </Button>
                </DialogClose>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => {
                    setConfirming(false)
                    onUnregister(folder.id)
                  }}
                >
                  解除する
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
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

/**
 * セッション一覧から渡された登録の初期値 (FE-051 / FR-026 / FR-027)。
 *
 * **アプリが自動で登録しない。** 初期値を出して利用者の確定を待つ。
 * **実在確認もしない** — 任意パスの存在を問い合わせる経路を作らないためである。
 *
 * **パスは main が返した値をそのまま渡す** (FR-025)。
 * 表示名の既定値も main が組み立てたものを使う — renderer でパスを分解しない。
 */
function SeededDraft({
  onRegister
}: {
  onRegister: (draft: WorkspaceFolderDraftDTO) => Promise<RegisterFolderResult>
}): React.JSX.Element | null {
  const seed = useUiStore((s) => s.folderDraftSeed)
  const clearSeed = useUiStore((s) => s.clearFolderDraftSeed)
  const [name, setName] = useState('')
  const nameRef = useRef<HTMLInputElement>(null)

  /*
   * **受け取ったらフォーカスを移す** (code-gate iteration 1 / a11y H-006)。
   *
   * セッション一覧の「作業フォルダとして登録」は `seedFolderDraft` を呼ぶが、
   * その実装は `screen` も差し替える。押したボタンを含む画面全体が
   * アンマウントされるため、**フォーカスが `document.body` に落ちていた**。
   * 遷移先のこのブロックにも移らず、live region も無いので
   * **画面が変わったこと自体が通知されなかった**。
   *
   * FR-026 の登録導線は US-2 の中核であり、それを使った瞬間に
   * キーボード利用者が入力欄の位置を失うのは実用性の欠陥である。
   *
   * 次に操作すべき要素 (表示名) に直接移す。
   */
  useEffect(() => {
    if (seed === null) return
    nameRef.current?.focus()
  }, [seed])

  if (seed === null) return null

  const displayName = name.length > 0 ? name : seed.suggestedDisplayName

  return (
    <div className={cn(paper, 'flex flex-col gap-3 rounded-xl px-4 py-3')}>
      <p className="text-sm font-medium">セッション一覧から渡された作業ディレクトリ</p>
      <p className="text-muted-foreground text-xs">
        {seed.location.kind === 'wsl' ? seed.location.distroName : 'Windows'} — {seed.path.value}
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <label htmlFor="seeded-display-name" className="text-xs font-medium">
            表示名
          </label>
          <input
            ref={nameRef}
            className="bg-input border-border focus-visible:ring-ring min-w-0 rounded-md border px-2 py-1 text-sm focus-visible:ring-[3px] focus-visible:outline-none"
            id="seeded-display-name"
            aria-describedby="seeded-display-name-hint"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <p id="seeded-display-name-hint" className="text-muted-foreground text-xs">
            未入力なら「{seed.suggestedDisplayName}」を使います
          </p>
        </div>
        <Button
          size="sm"
          onClick={async () => {
            const result = await onRegister({
              location: seed.location,
              path: seed.path,
              displayName
            })
            if (result.ok) {
              setName('')
              clearSeed()
            }
          }}
        >
          この所在で登録する
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setName('')
            clearSeed()
          }}
        >
          やめる
        </Button>
      </div>
    </div>
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
        retryLabel="再試行"
        retryingLabel="再試行中"
        retrying={false}
        onRetry={folders.refresh}
      />
    )
  }

  const wslRuntimes = (runtimes.list?.runtimes ?? []).filter((runtime) => runtime.kind === 'wsl')
  /*
   * **直前に成功した結果から導く。**
   *
   * 失敗形 (`{ ok: false, error }`) は現在地を持たないので、
   * `result` から導くと期限切れの瞬間に現在地・親・項目がすべて消え、
   * 「閉じて開き直す」= ルートからやり直ししか残らなかった。
   * quickstart V-2 #9 は「同じ位置から続行できる」ことを条件にしている。
   */
  const lastOk = folders.browse?.lastOk ?? null
  const entries = lastOk?.entries ?? []
  const cwd = lastOk?.cwd ?? null
  const parent = lastOk?.parent ?? null

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        {/*
          **画面ごとに h1 を 1 つ置く** (code-gate iteration 1 / a11y M-005)。
          画面遷移は main の中身だけを差し替えるので、heading が画面の同一性を示す
          唯一の手がかりになる。起点レベルが画面ごとに違うと、
          遷移後にどこに居るか把握できない。見た目は変えない。
        */}
        <h1 className="text-lg font-medium">作業フォルダ</h1>
      </div>

      {/* ── セッション一覧から渡された初期値 (FE-051 / R-2) ────────── */}
      <SeededDraft onRegister={folders.register} />

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
                /*
                 * **`disabled` にしない。** `disabled` は要素をタブ順から外すので、
                 * キーボード利用者はボタンに一度も到達せず、
                 * 押せないことにも理由にも気付けない。
                 * 起動しない性質は下の `if (!stopped)` ガードが保つ (FR-018)。
                 */
                aria-disabled={stopped}
                aria-describedby={stopped ? 'wsl-stopped-help' : undefined}
                className={cn(stopped && 'opacity-50')}
              >
                {locationLabel(location)}
                {stopped ? ' (停止中)' : ''}
              </Button>
            )
          })}
        </div>

        {/*
          **再検出中は区画を保つ** (pr-gate Round 1 / a11y H-203)。
          `stopped` が無くなった瞬間に区画ごと unmount すると、
          押したボタン自身が DOM から消えてフォーカスが body に落ちる —
          同ファイル上部のコメントが記録した不具合と同じ形である。
        */}
        {wslRuntimes.some((runtime) => runtime.state === 'stopped') || runtimes.refreshing ? (
          <div id="wsl-stopped-help" className="border-border/60 border-t pt-3 text-sm">
            <p>停止中のディストロは辿れません。次の手順で使えるようになります。</p>
            <ol className="text-muted-foreground mt-1 list-decimal pl-5 text-xs">
              <li>{RESOLUTION_STEP_LABELS['start-distro']}</li>
              <li>{RESOLUTION_STEP_LABELS['rescan-runtimes']}</li>
            </ol>
            <Button
              className={cn('mt-2', runtimes.refreshing && '[&_svg]:opacity-50')}
              variant="outline"
              size="sm"
              /*
               * **`disabled` にしない** (pr-gate Round 1 / a11y H-203)。
               * 同ファイルの停止中ボタンは既に `aria-disabled` を採っており、
               * **同じ画面で方針を 2 つ持たない**。
               * 押した瞬間に自分が disabled になるとフォーカスが body に落ちる。
               */
              aria-disabled={runtimes.refreshing}
              onClick={() => {
                if (runtimes.refreshing) return
                void runtimes.refresh().catch(() => undefined)
              }}
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

          {/*
            **読み込み中も骨格を残す。**
            以前は `loading` 中にこのブロック全体を unmount していたため、
            押したボタン自身が DOM から消え、**フォーカスが body に落ちていた**。
            キーボード利用者は 1 階層下りるたびにヘッダから Tab で辿り直すことになる。
          */}
          <div
            aria-busy={folders.browse.loading}
            className={cn(folders.browse.loading && 'opacity-50')}
          >
            {folders.browse.loading ? (
              <GenerationLoader
                variant="dots"
                label="読み込み中"
                tick={0}
                role="status"
                aria-live="polite"
              />
            ) : null}
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

              <div className="border-border/60 flex flex-wrap items-end gap-2 border-t pt-3">
                {/*
                  **可視ラベルを置く。** 以前は `placeholder` だけで、
                  入力を始めた瞬間に手がかりが消えていた。
                  既定値の説明も placeholder に埋まっていたため、入力開始後は取得できなかった。
                  日本語入力で変換を挟むと視線が戻る前に消える点でも問題になる。
                */}
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <label htmlFor="folder-display-name" className="text-xs font-medium">
                    表示名
                  </label>
                  <input
                    className="bg-input border-border focus-visible:ring-ring min-w-0 rounded-md border px-2 py-1 text-sm focus-visible:ring-[3px] focus-visible:outline-none"
                    id="folder-display-name"
                    aria-describedby="folder-display-name-hint"
                    placeholder="表示名"
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                  />
                  <p id="folder-display-name-hint" className="text-muted-foreground text-xs">
                    未入力ならフォルダ名を使います
                  </p>
                </div>
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
          </div>
        </div>
      ) : null}

      {/*
        **常時マウントして中身だけ差し替える。**
        エラー時に要素ごと新規 mount する形だと live region として機能せず、
        操作の失敗 (権限なし・重複・解除失敗) が支援技術に一切通知されなかった。
      */}
      <div role="status" aria-live="polite" className="empty:hidden">
        {errorText(folders.lastError) !== null ? (
          <p className={cn(paper, 'rounded-xl px-4 py-3 text-sm')}>
            {errorText(folders.lastError)}
          </p>
        ) : null}
      </div>

      {/* ── 一覧 (FE-022) ───────────────────────────────────────────── */}
      {folders.list === null ? (
        <GenerationLoader
          variant="dots"
          label="登録フォルダを読み込み中"
          tick={0}
          role="status"
          aria-live="polite"
        />
      ) : folders.list.folders.length === 0 ? (
        <EmptyState>
          <p className="text-sm">
            まだ登録がありません。上の「所在を選んで登録する」から追加してください。
          </p>
        </EmptyState>
      ) : (
        <ul className="flex flex-col gap-3">
          {folders.list.folders.map((folder) => (
            <FolderCard
              key={folder.id}
              folder={folder}
              onUnregister={folders.unregister}
              highlighted={folder.id === folders.duplicateOfId}
            />
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
