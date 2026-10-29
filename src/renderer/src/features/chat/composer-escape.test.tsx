import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import {
  AssistantRuntimeProvider,
  useExternalStoreRuntime,
  type ThreadMessageLike
} from '@assistant-ui/react'

import { Thread } from '@/components/assistant-ui/elements/thread.aui'

import { ComposerExtensionsContext, type ComposerExtensions } from './composer-extensions-context'
import { COMPOSER_LABELS } from './labels'

/**
 * 025 FE-030 — composer での Esc による停止 (FR-011〜FR-013 / research R-04)。
 * ライブラリの `cancelOnEscape` に任せ、変換中・実行中でないとき・composer の外では止めない。
 */

function Harness({
  isRunning,
  onCancel,
  extensions = { commands: null }
}: {
  readonly isRunning: boolean
  readonly onCancel: () => void
  readonly extensions?: ComposerExtensions
}): React.JSX.Element {
  const runtime = useExternalStoreRuntime({
    messages: [] as ThreadMessageLike[],
    isRunning,
    convertMessage: (m) => m,
    onNew: async () => {},
    onCancel: async () => {
      onCancel()
    }
  })
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ComposerExtensionsContext.Provider value={extensions}>
        <Thread />
      </ComposerExtensionsContext.Provider>
      <button type="button">外のボタン</button>
    </AssistantRuntimeProvider>
  )
}

const input = (): HTMLElement =>
  screen.getByRole('textbox', { name: COMPOSER_LABELS.composerInput })

describe('composer の Esc による停止 (FE-030)', () => {
  it('(a) 実行中に textarea で Esc を押すと 1 回止まる', () => {
    const onCancel = vi.fn()
    render(<Harness isRunning onCancel={onCancel} />)
    fireEvent.keyDown(input(), { key: 'Escape' })
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('(b) 変換中の Esc では止まらない', () => {
    const onCancel = vi.fn()
    render(<Harness isRunning onCancel={onCancel} />)
    fireEvent.compositionStart(input())
    fireEvent.keyDown(input(), { key: 'Escape', isComposing: true })
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('(c) 実行中でないとき止めず、入力が残る', () => {
    const onCancel = vi.fn()
    render(<Harness isRunning={false} onCancel={onCancel} />)
    fireEvent.change(input(), { target: { value: '下書き' } })
    fireEvent.keyDown(input(), { key: 'Escape' })
    expect(onCancel).not.toHaveBeenCalled()
    expect((input() as HTMLTextAreaElement).value).toBe('下書き')
  })

  it('(d) コマンドの候補が開いているときの Esc は候補を閉じるだけで止めない', async () => {
    const user = userEvent.setup()
    const onCancel = vi.fn()
    render(
      <Harness
        isRunning
        onCancel={onCancel}
        extensions={{ commands: [{ name: 'review', description: null, argumentHint: null }] }}
      />
    )
    await user.click(input())
    await user.keyboard('/re')
    await screen.findByRole('listbox', { name: COMPOSER_LABELS.commandCandidates })
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('(e) composer の外にフォーカスがあるとき止めない', () => {
    const onCancel = vi.fn()
    render(<Harness isRunning onCancel={onCancel} />)
    fireEvent.keyDown(screen.getByRole('button', { name: '外のボタン' }), { key: 'Escape' })
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('停止ボタンは outline で送信ボタン (default) と違う', () => {
    render(<Harness isRunning onCancel={() => {}} />)
    const stop = screen.getByRole('button', { name: COMPOSER_LABELS.stop })
    expect(stop.getAttribute('data-variant')).toBe('outline')
  })
})
