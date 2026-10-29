import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import {
  AssistantRuntimeProvider,
  useExternalStoreRuntime,
  type ThreadMessageLike
} from '@assistant-ui/react'

import { Thread } from '@/components/assistant-ui/elements/thread.aui'

import { ComposerExtensionsContext, type ComposerExtensions } from './composer-extensions-context'
import { COMPOSER_LABELS } from './labels'

/**
 * 025 FE-011 — composer の `settings` の口 (data-model §6.1)。左の群 (添付の右) に描き、渡さなければ何も描かない。
 * 入力欄の属性 (`onKeyDown` を上書きしない。AD-037) は変えない。
 */

function Harness({ extensions }: { readonly extensions: ComposerExtensions }): React.JSX.Element {
  const runtime = useExternalStoreRuntime({
    messages: [] as ThreadMessageLike[],
    convertMessage: (m) => m,
    onNew: async () => {}
  })
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ComposerExtensionsContext.Provider value={extensions}>
        <Thread />
      </ComposerExtensionsContext.Provider>
    </AssistantRuntimeProvider>
  )
}

const input = (): HTMLElement =>
  screen.getByRole('textbox', { name: COMPOSER_LABELS.composerInput })

describe('ComposerExtensions.settings (FE-011)', () => {
  it('settings を渡すと composer の左の群に描かれる', () => {
    const { container } = render(
      <Harness extensions={{ commands: null, settings: <button type="button">設定の口</button> }} />
    )
    const group = screen.getByTestId('composer-settings-group')
    expect(group).toContainElement(screen.getByRole('button', { name: '設定の口' }))
    expect(container.querySelector('.aui-composer-root')).toContainElement(group)
  })

  it('settings を渡さないと何も描かない', () => {
    render(<Harness extensions={{ commands: null }} />)
    const group = screen.getByTestId('composer-settings-group')
    // 左の群には添付のボタンだけがある (設定の口は無い)。
    expect(group.querySelectorAll('select, [data-testid="composer-live-settings"]')).toHaveLength(0)
  })

  it('入力欄の属性が settings の有無で変わらない (onKeyDown を上書きしない)', () => {
    const { unmount } = render(<Harness extensions={{ commands: null }} />)
    const before = input().outerHTML
    unmount()
    render(<Harness extensions={{ commands: null, settings: <span>x</span> }} />)
    expect(input().outerHTML).toBe(before)
  })
})
