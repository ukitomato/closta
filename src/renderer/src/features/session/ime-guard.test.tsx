import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import {
  AssistantRuntimeProvider,
  ComposerPrimitive,
  useExternalStoreRuntime,
  type AppendMessage,
  type ThreadMessageLike
} from '@assistant-ui/react'

/**
 * X-2 / FR-001 / SC-001 / T007 — **IME 変換確定の Enter が送信にならない（既存ガード非破壊）**。
 *
 * assistant-ui の `ComposerPrimitive.Input` は keydown の `nativeEvent.isComposing` で確定 Enter を
 * ガードする (AD-037 §1)。本 feature は `onKeyDown` で preventDefault せず・`submitMode` を既定のまま・
 * `Input` を差し替えないため、このガードが保たれることを確認する。**送信経路 = `onNew`** で計測する
 * (偽の緑を避けるため、確定後の Enter では onNew が呼ばれることも assert する)。
 *
 * 実機 electron での確定 Enter の isComposing タイミング目視は quickstart (人間 deferred)。E2E (Playwright/CDP) は
 * running+queue 有効状態を含めて別途固定する (T006)。
 */

function GuardHarness({
  onNew
}: {
  readonly onNew: (m: AppendMessage) => Promise<void>
}): React.JSX.Element {
  const runtime = useExternalStoreRuntime({
    messages: [] as ThreadMessageLike[],
    convertMessage: (m) => m,
    onNew
  })
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ComposerPrimitive.Root>
        <ComposerPrimitive.Input aria-label="composer" />
      </ComposerPrimitive.Root>
    </AssistantRuntimeProvider>
  )
}

describe('IME ガード非破壊 (FR-001 / SC-001 / T007)', () => {
  it('変換中 (isComposing) の Enter は送信にならない / 確定後の Enter で送信される', async () => {
    const onNew = vi.fn(async () => {})
    render(<GuardHarness onNew={onNew} />)
    const input = screen.getByRole('textbox', { name: 'composer' })

    await userEvent.type(input, 'あ')

    // 変換確定の Enter (keyCode 229 / isComposing) — 送信経路に届かない。
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter', keyCode: 229, isComposing: true })
    expect(onNew).not.toHaveBeenCalled()

    // 確定後の 2 度目の Enter — 送信される (ガードが「常に握りつぶす」偽の緑でないことの担保)。
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter', isComposing: false })
    await waitFor(() => expect(onNew).toHaveBeenCalledTimes(1))
  })
})
