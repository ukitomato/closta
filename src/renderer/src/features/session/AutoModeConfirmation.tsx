import { useEffect, useId, useRef } from 'react'

import type { AutoModeStatus } from '@domain/runtime/capabilities'

import { Button } from '@/components/ui/button'
import { PERMISSION_MODE_NAMES } from '@/features/chat/labels'

import { AUTO_MODE_CONFIRMATION_LABELS } from './labels'

/**
 * **Auto の確認** (026 / data-model §6.1 / AD-066)。その場の `role="alertdialog"` (入れ子の modal にしない)。
 *
 * | 規則 | 根拠 |
 * |---|---|
 * | 入力は `autoModeStatus` (表示用。本文の 1 文目を選ぶ) と `onAccept` / `onCancel` だけ。出すかの判定は呼び出し側 (`requiresAutoModeConfirmation`) | data-model §6.1 |
 * | 開いたら**取り消し**に焦点 (Enter の 1 打で承諾にならない) | spec FR-008 |
 * | Escape は取り消し。外側の Dialog (Radix は document の capture で Escape を聞く) より先に window の capture で止める | Principle XIII |
 * | IME の変換中の Escape は取り消さない | Principle VIII |
 */
export function AutoModeConfirmation({
  autoModeStatus,
  onAccept,
  onCancel
}: {
  readonly autoModeStatus: AutoModeStatus
  readonly onAccept: () => void
  readonly onCancel: () => void
}): React.JSX.Element {
  const headingId = useId()
  const bodyId = useId()
  const cancelRef = useRef<HTMLButtonElement>(null)
  const name = PERMISSION_MODE_NAMES.auto

  useEffect(() => {
    cancelRef.current?.focus()
  }, [])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape' || e.isComposing) return
      // 外側の Dialog の Escape (document の capture) に届く前に止める。
      e.stopPropagation()
      e.preventDefault()
      onCancel()
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [onCancel])

  return (
    <div
      role="alertdialog"
      aria-labelledby={headingId}
      aria-describedby={bodyId}
      data-testid="auto-mode-confirmation"
      className="flex flex-col gap-2 rounded-md border p-3 text-sm"
    >
      <p id={headingId} className="font-medium">
        {AUTO_MODE_CONFIRMATION_LABELS.heading(name)}
      </p>
      <p id={bodyId}>{AUTO_MODE_CONFIRMATION_LABELS.body(autoModeStatus)}</p>
      <div className="flex gap-2">
        <Button type="button" size="sm" onClick={onAccept}>
          {AUTO_MODE_CONFIRMATION_LABELS.accept(name)}
        </Button>
        <Button ref={cancelRef} type="button" size="sm" variant="ghost" onClick={onCancel}>
          {AUTO_MODE_CONFIRMATION_LABELS.cancel}
        </Button>
      </div>
    </div>
  )
}
