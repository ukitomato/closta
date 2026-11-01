import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle
} from '@/components/ui/dialog'
import { PERMISSION_MODE_NAMES } from '@/features/chat/labels'

import { AutoModeConfirmation } from './AutoModeConfirmation'
import { AUTO_MODE_CONFIRMATION_LABELS } from './labels'

/** 026 FE-012 — Auto の確認の部品 (data-model §6.1)。 */

const NAME = PERMISSION_MODE_NAMES.auto

function setup(status: 'unavailable' | 'undetermined' | 'allowed' = 'unavailable'): {
  onAccept: ReturnType<typeof vi.fn>
  onCancel: ReturnType<typeof vi.fn>
} & ReturnType<typeof render> {
  const onAccept = vi.fn()
  const onCancel = vi.fn()
  const view = render(
    <AutoModeConfirmation autoModeStatus={status} onAccept={onAccept} onCancel={onCancel} />
  )
  return { onAccept, onCancel, ...view }
}

describe('AutoModeConfirmation (026 FE-012)', () => {
  it('alertdialog で、見出しと本文に関連づく。vitest-axe の違反 0', async () => {
    const { container } = setup()
    const dialog = screen.getByRole('alertdialog', {
      name: AUTO_MODE_CONFIRMATION_LABELS.heading(NAME)
    })
    expect(dialog).toHaveAccessibleDescription(AUTO_MODE_CONFIRMATION_LABELS.body('unavailable'))
    expect((await axe(container, { rules: { 'color-contrast': { enabled: false } } })).violations).toEqual([])
  })

  it('開いた時点で焦点が取り消しにあり、Enter を 1 回押しても onAccept は呼ばれない', async () => {
    const { onAccept, onCancel } = setup()
    const cancel = screen.getByRole('button', { name: AUTO_MODE_CONFIRMATION_LABELS.cancel })
    expect(cancel).toHaveFocus()
    await userEvent.keyboard('{Enter}')
    expect(onAccept).not.toHaveBeenCalled()
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('承諾で onAccept が 1 回', async () => {
    const { onAccept, onCancel } = setup()
    await userEvent.click(screen.getByRole('button', { name: AUTO_MODE_CONFIRMATION_LABELS.accept(NAME) }))
    expect(onAccept).toHaveBeenCalledTimes(1)
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('本文の 1 文目は unavailable とそれ以外で違う', () => {
    const a = setup('unavailable')
    expect(screen.getByRole('alertdialog')).toHaveTextContent('隔離がありません')
    a.unmount()
    setup('undetermined')
    expect(screen.getByRole('alertdialog')).toHaveTextContent('隔離されずに動きます')
    expect(screen.getByRole('alertdialog')).not.toHaveTextContent('隔離がありません')
  })

  it('Escape で onCancel が 1 回呼ばれ、外側の Dialog の onOpenChange は呼ばれない', async () => {
    const onOpenChange = vi.fn()
    const onAccept = vi.fn()
    const onCancel = vi.fn()
    render(
      <Dialog open onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogTitle>外側</DialogTitle>
          <DialogDescription>外側の説明</DialogDescription>
          <AutoModeConfirmation autoModeStatus="unavailable" onAccept={onAccept} onCancel={onCancel} />
        </DialogContent>
      </Dialog>
    )
    await userEvent.keyboard('{Escape}')
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onOpenChange).not.toHaveBeenCalled()
    expect(onAccept).not.toHaveBeenCalled()
  })
})
