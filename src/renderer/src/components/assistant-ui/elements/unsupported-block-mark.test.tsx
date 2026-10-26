import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { axe } from 'vitest-axe'

import {
  AssistantRuntimeProvider,
  MessagePrimitive,
  ThreadPrimitive,
  useExternalStoreRuntime,
  type ThreadMessageLike
} from '@assistant-ui/react'

import type { TranscriptMessageDTO } from '@domain/session/transcript-dto'
import { toThreadMessage, UNSUPPORTED_BLOCK_DATA_NAME } from '@/features/chat/convert'

import { UnsupportedBlockData, UnsupportedBlockMark } from './unsupported-block-mark'

/** O-12 FE-031 — 知らないブロックの印 (SC-004 / US-3 AC5 / AC6)。FE-002 の確認 (user の data part) を引き継ぐ。 */

const AXE_RULES = { rules: { 'color-contrast': { enabled: false } } }

function dto(role: 'assistant' | 'user', blockType: string): TranscriptMessageDTO {
  return {
    id: `${role}-1`,
    role,
    parts: [
      { type: 'text', text: '本文' },
      { type: 'unsupported-block', blockType }
    ],
    createdAt: null
  }
}

function Thread({ messages }: { messages: ThreadMessageLike[] }): React.JSX.Element {
  const runtime = useExternalStoreRuntime({
    messages,
    isRunning: false,
    convertMessage: (m) => m,
    onNew: async () => {}
  })
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ThreadPrimitive.Root>
        <ThreadPrimitive.Messages>
          {() => (
            <MessagePrimitive.Root>
              <MessagePrimitive.Parts
                components={{
                  Text: ({ text }) => <p data-testid="text">{text}</p>,
                  data: { by_name: { [UNSUPPORTED_BLOCK_DATA_NAME]: UnsupportedBlockData } }
                }}
              />
            </MessagePrimitive.Root>
          )}
        </ThreadPrimitive.Messages>
      </ThreadPrimitive.Root>
    </AssistantRuntimeProvider>
  )
}

describe('UnsupportedBlockMark', () => {
  it('種類あり / 空の文言', async () => {
    const { container, rerender } = render(<UnsupportedBlockMark blockType="mcp_tool_use" />)
    expect(container.textContent).toBe('表示に対応していないブロック (mcp_tool_use)')
    rerender(<UnsupportedBlockMark blockType="" />)
    expect(container.textContent).toBe('表示に対応していないブロック')
    expect((await axe(container, AXE_RULES)).violations).toEqual([])
  })

  it.each(['assistant', 'user'] as const)('%s のメッセージの data part として描ける', async (role) => {
    const { findByTestId, container } = render(
      <Thread messages={[toThreadMessage(dto(role, 'search_result'))]} />
    )
    expect((await findByTestId('text')).textContent).toBe('本文')
    expect(container.querySelector('[data-slot="unsupported-block-mark"]')?.textContent).toBe(
      '表示に対応していないブロック (search_result)'
    )
  })

  it('data の形が外れていても例外を投げず種類なしで出す', () => {
    const Data = UnsupportedBlockData as unknown as (p: { data: unknown }) => React.JSX.Element
    const { container } = render(<Data data={3} />)
    expect(container.textContent).toBe('表示に対応していないブロック')
  })
})
