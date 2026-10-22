import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import {
  AssistantRuntimeProvider,
  MessagePrimitive,
  ThreadPrimitive,
  useExternalStoreRuntime,
  type DataMessagePartComponent,
  type ThreadMessageLike
} from '@assistant-ui/react'

/**
 * FE-002 (O-12 / plan RK-04) — user ロールのメッセージの data part (名前 `unsupported-block`) が
 * `MessagePrimitive.Parts` の `data.by_name` で例外なく描けるかの確認。FE-031 の component テストへ引き継ぐ。
 * UserMessage の Parts (`thread.aui.tsx`) と同じく `Text` だけを持つ user の吹き出しに data の部品を足した形で再現する。
 */

const Mark: DataMessagePartComponent = (part) => (
  <span data-testid="mark">{String((part.data as { blockType?: string }).blockType ?? '')}</span>
)

const MESSAGES: ThreadMessageLike[] = [
  {
    id: 'u1',
    role: 'user',
    content: [
      { type: 'text', text: '本文' },
      { type: 'data', name: 'unsupported-block', data: { blockType: 'search_result' } }
    ] as unknown as ThreadMessageLike['content']
  }
]

function Thread(): React.JSX.Element {
  const runtime = useExternalStoreRuntime({
    messages: MESSAGES,
    isRunning: false,
    convertMessage: (m) => m,
    onNew: async () => {}
  })
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ThreadPrimitive.Root>
        <ThreadPrimitive.Messages>
          {() => (
            <MessagePrimitive.Root data-role="user">
              <MessagePrimitive.Parts
                components={{
                  Text: () => <p data-testid="text">本文</p>,
                  data: { by_name: { 'unsupported-block': Mark } }
                }}
              />
            </MessagePrimitive.Root>
          )}
        </ThreadPrimitive.Messages>
      </ThreadPrimitive.Root>
    </AssistantRuntimeProvider>
  )
}

describe('user ロールの data part (FE-002)', () => {
  it('unsupported-block の data part が例外なく描ける', async () => {
    const { findByTestId } = render(<Thread />)
    expect((await findByTestId('text')).textContent).toBe('本文')
    expect((await findByTestId('mark')).textContent).toBe('search_result')
  })
})
