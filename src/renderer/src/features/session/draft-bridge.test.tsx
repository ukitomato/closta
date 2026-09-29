import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import {
  AssistantRuntimeProvider,
  ComposerPrimitive,
  useExternalStoreRuntime,
  type ThreadMessageLike
} from '@assistant-ui/react'

import { DraftBridge } from './SessionScreen'
import type { LiveSession } from './useLiveSession'

/**
 * X-2 / FR-007 / SC-005 / T021 — DraftBridge が composer の下書きを feature state と同期する。
 * - 復元: 保持していた `session.draft` を空の composer に流し込む。
 * - 捕捉: composer への入力を `session.setDraft` に写す (メモリ内。境界/ログに出さない)。
 */

function fakeSession(over: Partial<LiveSession>): LiveSession {
  return { draft: '', setDraft: vi.fn(), ...over } as unknown as LiveSession
}

function Harness({ session }: { readonly session: LiveSession }): React.JSX.Element {
  const runtime = useExternalStoreRuntime({
    messages: [] as ThreadMessageLike[],
    convertMessage: (m) => m,
    onNew: async () => {}
  })
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <DraftBridge session={session} />
      <ComposerPrimitive.Input aria-label="composer" />
    </AssistantRuntimeProvider>
  )
}

describe('DraftBridge (FR-007 / SC-005 / T021)', () => {
  it('保持していた下書きを composer に復元する', async () => {
    render(<Harness session={fakeSession({ draft: '書きかけの指示' })} />)
    const input = screen.getByRole('textbox', { name: 'composer' }) as HTMLTextAreaElement
    await waitFor(() => expect(input.value).toBe('書きかけの指示'))
  })

  it('composer への入力を setDraft に写す (捕捉)', async () => {
    const setDraft = vi.fn()
    render(<Harness session={fakeSession({ setDraft })} />)
    const input = screen.getByRole('textbox', { name: 'composer' })
    await userEvent.type(input, 'あ')
    await waitFor(() => expect(setDraft).toHaveBeenCalledWith('あ'))
  })
})
