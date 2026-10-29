import { useMemo, useRef, useState } from 'react'

import { CAPABILITY_KEY } from '@domain/capability'
import type { ResumeUnavailableReason } from '@domain/session/resume'

import {
  CommandPalette as CommandPaletteView,
  type PaletteCommand
} from '@/components/assistant-ui/elements/command-palette'
import { EmptyState } from '@/components/assistant-ui/elements/empty-state'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { matchesAllTerms, toTerms } from '@/features/search/text-search'
import { useSessionsStore } from '@/stores/sessions'
import { useUiStore } from '@/stores/ui'

import { RESUME_PICKER_LABELS, RESUME_UNAVAILABLE_LABELS } from './labels'
import { startPastResume } from './past-resume'
import { resumePickerRows } from './resume-picker-rows'
import { useRunningSessionStoreApi } from './running-session-context'

/**
 * **`/resume` の選ぶ画面** (O-13 / 025 data-model §7.3 / §7.4 / research R-10)。composer の `/resume` の送信で開き、
 * 同じフォルダの過去のセッションを選ぶと X-9 の再開の流れ (再開の形の起動ダイアログ) に進む。
 * Command palette (`features/shell/CommandPalette.tsx`) と同じ作り (Dialog + `CommandPalette` の表示) を写した。
 * 選ばずに閉じたら (Esc を含む) `onClosed` で composer の入力へフォーカスを戻す。
 */

export function ResumePickerDialog({
  folderId,
  onClose,
  returnFocus
}: {
  readonly folderId: string
  /** 閉じる (選ばずに閉じたときと、再開に進んだとき)。 */
  readonly onClose: () => void
  /** 選ばずに閉じたとき、composer の入力へフォーカスを戻す。 */
  readonly returnFocus: () => void
}): React.JSX.Element {
  const advancedRef = useRef(false)
  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      <DialogContent
        showCloseButton={false}
        aria-describedby={undefined}
        className="top-[15%] translate-y-0 gap-0 border-0 bg-transparent p-0 shadow-none sm:max-w-lg"
        onEscapeKeyDown={(event) => {
          // 変換中の Esc は取り消しに任せる (閉じない)。
          if (event.isComposing || event.keyCode === 229) event.preventDefault()
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          // 再開ダイアログに進んだときは、そのダイアログのフォーカスの規則 (021) に任せる。
          if (!advancedRef.current) returnFocus()
        }}
        data-testid="resume-picker"
      >
        <DialogTitle className="sr-only">{RESUME_PICKER_LABELS.title}</DialogTitle>
        <ResumePickerBody
          folderId={folderId}
          onAdvance={() => {
            advancedRef.current = true
            onClose()
          }}
        />
      </DialogContent>
    </Dialog>
  )
}

const VIEW_LABELS = {
  input: RESUME_PICKER_LABELS.search,
  placeholder: RESUME_PICKER_LABELS.search,
  list: RESUME_PICKER_LABELS.title
}

function ResumePickerBody({
  folderId,
  onAdvance
}: {
  readonly folderId: string
  readonly onAdvance: () => void
}): React.JSX.Element {
  const store = useRunningSessionStoreApi()
  const setLaunchOpen = useUiStore((s) => s.setLaunchOpen)
  const index = useSessionsStore((s) => s.index)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const [reason, setReason] = useState<ResumeUnavailableReason | null>(null)
  const [resolving, setResolving] = useState(false)

  const all = useMemo(() => resumePickerRows(index, folderId), [index, folderId])
  const rows = useMemo(() => {
    const terms = toTerms(query)
    return all.filter((row) => matchesAllTerms([row.title], terms))
  }, [all, query])
  const commands = useMemo<readonly PaletteCommand[]>(
    () =>
      rows.map((row) => ({
        id: `${row.targetKey}\u0000${row.sessionId}`,
        label: row.title,
        group: RESUME_PICKER_LABELS.title,
        detail: row.time === '' ? null : row.time
      })),
    [rows]
  )
  const loading = all.length === 0 && (index === null || !index.complete)

  const choose = (at: number): void => {
    const row = rows[at]
    if (row === undefined || resolving) return
    setResolving(true)
    setReason(null)
    window[CAPABILITY_KEY].resolvePastResume(row.targetKey, row.sessionId)
      .then((result) => {
        const failed = startPastResume(
          { store, setLaunchOpen },
          row.targetKey,
          row.sessionId,
          result
        )
        if (failed === null) onAdvance()
        else setReason(failed)
      })
      .catch(() => setReason('source-unknown'))
      .finally(() => setResolving(false))
  }

  return (
    <div className="flex flex-col">
      <CommandPaletteView
        className="max-w-none shadow-lg"
        commands={commands}
        query={query}
        activeIndex={activeIndex}
        labels={VIEW_LABELS}
        empty={
          <EmptyState
            className="max-w-none items-start gap-1 px-2 py-3"
            data-testid="resume-picker-empty"
          >
            <p className="text-sm">
              {loading ? RESUME_PICKER_LABELS.loading : RESUME_PICKER_LABELS.empty}
            </p>
          </EmptyState>
        }
        onQueryChange={(next) => {
          setQuery(next)
          setActiveIndex(0)
        }}
        onActiveChange={setActiveIndex}
        onRun={choose}
      />
      {reason !== null && (
        <p
          role="alert"
          className="bg-popover text-destructive mt-1 rounded-md px-3 py-2 text-sm"
          data-testid="resume-picker-reason"
        >
          {RESUME_UNAVAILABLE_LABELS[reason]}
        </p>
      )}
    </div>
  )
}
