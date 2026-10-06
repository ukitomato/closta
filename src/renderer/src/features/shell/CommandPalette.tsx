import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react'

import {
  CommandPalette as CommandPaletteView,
  type PaletteCommand
} from '@/components/assistant-ui/elements/command-palette'
import { EmptyState } from '@/components/assistant-ui/elements/empty-state'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { createPastSearchIndexer } from '@/features/search/session-search'
import { buildSessionRows } from '@/features/session-list/rows'
import {
  useRunningSessionStore,
  useRunningSessionStoreApi
} from '@/features/session/running-session-context'
import { useRunningSessionsView } from '@/features/session/running-sessions-view'
import { useSessionsStore } from '@/stores/sessions'
import { useUiStore, type UiState } from '@/stores/ui'

import { centerShownOf } from './center-shown'
import { PALETTE_LABELS } from './labels'
import {
  buildPaletteCandidates,
  createPaletteEffects,
  runPaletteAction,
  type PaletteAction,
  type PaletteCandidate
} from './palette-commands'
import { useDialogReturnFocus } from './useDialogReturnFocus'

const isPaletteOpen = (s: UiState): boolean => s.paletteOpen

/** IME の変換中のキーか (Principle VIII / AD-037 の `isComposing` / 229)。 */
function isComposingKey(event: KeyboardEvent): boolean {
  return event.isComposing || event.keyCode === 229
}

/** Ctrl+K (ほかの修飾キーなし)。 */
function isPaletteShortcut(event: KeyboardEvent): boolean {
  return (
    event.ctrlKey &&
    !event.altKey &&
    !event.shiftKey &&
    !event.metaKey &&
    (event.key === 'k' || event.key === 'K')
  )
}

/** モーダルのダイアログ (`aria-modal="true"`。起動・設定・確認・画像と palette 自身) が開いているか。 */
function modalDialogOpen(): boolean {
  return document.querySelector('[aria-modal="true"]') !== null
}

/**
 * **Command palette** (O-3 / spec FR-006 / FR-007 / 012 data-model §3)。シェルの部品で、`AppShell` の `ShellLayout`
 * (`RunningSessionsProvider` の内側) に置く。
 *
 * | 規則 | 根拠 |
 * |---|---|
 * | Ctrl+K は `window` の keydown (capture)。変換中 (`isComposing` / 229)・`[aria-modal="true"]` の要素が開いている間 (palette 自身を含む) は何もしない (`preventDefault` もしない)。受けたときだけ `preventDefault` | data-model §3「開閉・キー・フォーカス」/ Principle VIII |
 * | モーダルのダイアログ (Radix の Dialog。名前は `paletteTitle`)。入力は combobox、候補は listbox / option。↑↓ で選び、Enter で閉じて実行する。Esc と外の押下で閉じる (捨てる入力が無い)。↑↓ / Enter / Esc は変換中は何もしない | spec FR-006 |
 * | 候補の DOM の id は element が `useId()` と添字で作り、現在の候補は添字で持つ。外部の値 (`rowKey` など) を id・IDREF・セレクタに入れない。語が変わったら先頭に戻す | data-model §2「外部由来の値と DOM の id・セレクタ」/ §3 |
 * | **操作は閉じる前には実行しない。** Enter で操作を覚えて閉じ、`onCloseAutoFocus` (内容が外れた後) で「開く前の要素へ戻す (`useDialogReturnFocus`。消えていればサイドバーの「新規起動」) → 実行 → 操作ごとの行き先」の順に行う | data-model §3「閉じた後のフォーカス」 |
 * | セッションの候補は session のストアの選択の操作だけを呼ぶ (focus は `useShellFocus` が書く)。行き先は中央 (`focusCenter`。スキップリンクと共有) | spec FR-007 / data-model §3 |
 * | 開いている間は `paletteOpen` で「見ているセッション」を null にする (`watchedIdOf`) | spec FR-006 |
 */
export function CommandPalette({
  focusCenter
}: {
  /** 中央 (`main`) へフォーカスを移す (`AppShell` のスキップリンクと同じ操作)。 */
  readonly focusCenter: () => void
}): React.JSX.Element {
  const open = useUiStore((s) => s.paletteOpen)
  const setPaletteOpen = useUiStore((s) => s.setPaletteOpen)
  const running = useRunningSessionStoreApi()
  const returnFocus = useDialogReturnFocus(isPaletteOpen, 'new-session')
  /** Enter で選んだ操作。閉じた後 (`onCloseAutoFocus`) に実行する。 */
  const pendingRef = useRef<PaletteAction | null>(null)

  const onShortcut = useEffectEvent((event: KeyboardEvent) => {
    if (isComposingKey(event) || !isPaletteShortcut(event)) return
    if (useUiStore.getState().paletteOpen || modalDialogOpen()) return
    event.preventDefault()
    setPaletteOpen(true)
  })
  useEffect(() => {
    const listener = (event: KeyboardEvent): void => onShortcut(event)
    window.addEventListener('keydown', listener, true)
    return () => window.removeEventListener('keydown', listener, true)
  }, [])

  const onCloseAutoFocus = (event: Event): void => {
    // 1. 開く前の要素へ戻す (消えていればサイドバーの「新規起動」)。
    returnFocus(event)
    const action = pendingRef.current
    pendingRef.current = null
    if (action === null) return
    // 2. 覚えた操作を実行する。起動・設定のダイアログは 1 の後に開くので、そのダイアログは 1 の要素を「開いた元」として覚える。
    runPaletteAction(action, createPaletteEffects(running))
    // 3. 操作ごとの行き先。セッションの候補は中央へ (選択で中央の中身が入れ替わり、1 の要素が消えうる)。ほかは
    //    開いたダイアログ・検索のバー・畳んだ面の `useFocusRescue` が決めるか、1 のまま。
    if (action.kind === 'running' || action.kind === 'past') focusCenter()
  }

  const onRun = useCallback(
    (action: PaletteAction) => {
      pendingRef.current = action
      setPaletteOpen(false)
    },
    [setPaletteOpen]
  )

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setPaletteOpen(false)
      }}
    >
      <DialogContent
        showCloseButton={false}
        aria-describedby={undefined}
        className="top-[15%] translate-y-0 gap-0 border-0 bg-transparent p-0 shadow-none sm:max-w-lg"
        onEscapeKeyDown={(event) => {
          /*
           * 変換中の Esc は取り消しに任せる。Chromium は変換中のキーを `Process` / 229 で渡すので、Radix はふつう Esc と
           * 見ない。Esc と見た場合に閉じるのを止める口は `preventDefault` だけで、止めなければ Radix 自身が
           * `preventDefault` してから閉じる (どちらでも既定の動作は止まる。閉じないほうを選ぶ)。
           */
          if (isComposingKey(event)) event.preventDefault()
        }}
        onCloseAutoFocus={onCloseAutoFocus}
        data-testid="command-palette"
      >
        <DialogTitle className="sr-only">{PALETTE_LABELS.paletteTitle}</DialogTitle>
        {/* 中身は開いている間だけマウントされる (Radix)。開くたびに語と現在の候補が空から始まる。 */}
        <PaletteBody onRun={onRun} />
      </DialogContent>
    </Dialog>
  )
}

const KIND_LABELS: Record<PaletteCandidate['kind'], string | null> = {
  action: null,
  running: PALETTE_LABELS.paletteKindRunning,
  past: PALETTE_LABELS.paletteKindPast
}

const VIEW_LABELS = {
  input: PALETTE_LABELS.paletteInput,
  placeholder: PALETTE_LABELS.paletteInput,
  list: PALETTE_LABELS.paletteTitle
}

function PaletteBody({
  onRun
}: {
  readonly onRun: (action: PaletteAction) => void
}): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const candidates = usePaletteCandidates(query)
  const commands = useMemo<readonly PaletteCommand[]>(
    () =>
      candidates.map((candidate) => ({
        id: candidate.id,
        label: candidate.label,
        group:
          candidate.kind === 'action'
            ? PALETTE_LABELS.paletteGroupActions
            : PALETTE_LABELS.paletteGroupSessions,
        detail: candidate.detail,
        kind: KIND_LABELS[candidate.kind]
      })),
    [candidates]
  )

  return (
    <CommandPaletteView
      className="max-w-none shadow-lg"
      commands={commands}
      query={query}
      activeIndex={activeIndex}
      labels={VIEW_LABELS}
      empty={
        <EmptyState className="max-w-none items-start gap-1 px-2 py-3" data-testid="palette-empty">
          <p className="text-sm">{PALETTE_LABELS.paletteNone}</p>
          <p className="text-muted-foreground text-xs">{PALETTE_LABELS.paletteNoneHint}</p>
        </EmptyState>
      }
      onQueryChange={(next) => {
        setQuery(next)
        // 語が変わったら先頭に戻す (data-model §3)。
        setActiveIndex(0)
      }}
      onActiveChange={setActiveIndex}
      onRun={(index) => {
        const candidate = candidates[index]
        if (candidate !== undefined) onRun(candidate.action)
      }}
    />
  )
}

/** 候補 (data-model §3)。面の状態・稼働中のストア・過去の一覧の索引から組み立てる。 */
function usePaletteCandidates(query: string): readonly PaletteCandidate[] {
  const sidebarCollapsed = useUiStore((s) => s.sidebarCollapsed)
  const panelCollapsed = useUiStore((s) => s.panel.collapsed)
  const focus = useUiStore((s) => s.focus)
  const transcriptDensity = useUiStore((s) => s.transcriptDensity)
  const view = useRunningSessionsView()
  const order = useRunningSessionStore((s) => s.order)
  const sessions = useRunningSessionStore((s) => s.sessions)
  const index = useSessionsStore((s) => s.index)

  const conversationShown = centerShownOf(focus, view.live !== null) !== 'none'
  const rows = useMemo(() => buildSessionRows(index), [index])
  // 過去の行のグループの見出しは、登録フォルダの表示名を `RunningSessionsProvider` が読み込み済みの一覧から引く
  // (開くたびに一覧を取り直さない)。引けなければ `null` (`groupLabelOf` が種別名にする)。
  const folders = view.folders
  const folderNameOf = useCallback(
    (folderId: string): string | null =>
      folders?.folders.find((folder) => folder.id === folderId)?.displayName ?? null,
    [folders]
  )
  // 行ごとの正規化したフィールドは、索引とフォルダの表示名が変わったときだけ作り直す (012 data-model §1)。
  const [indexer] = useState(() => createPastSearchIndexer())
  const pastIndex = indexer(rows, folderNameOf)
  const { folderName, runtimeName } = view

  return useMemo(
    () =>
      buildPaletteCandidates(
        query,
        { sidebarCollapsed, panelCollapsed, conversationShown, transcriptDensity },
        { order, sessions, names: { folderName, runtimeName } },
        { view: rows, index: pastIndex, folderNameOf }
      ),
    [
      query,
      sidebarCollapsed,
      panelCollapsed,
      conversationShown,
      transcriptDensity,
      order,
      sessions,
      folderName,
      runtimeName,
      rows,
      pastIndex,
      folderNameOf
    ]
  )
}
