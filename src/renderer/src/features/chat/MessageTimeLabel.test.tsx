import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'

import type { ThreadMessageLike } from '@assistant-ui/react'

import type { TranscriptMessageDTO } from '@domain/session/transcript-dto'

import { useUiStore } from '@/stores/ui'

import { ConversationTimeProvider } from './ConversationTimeProvider'
import { toThreadMessage } from './convert'
import { formatMessageTimeFull } from './message-time'

/**
 * O-9 FE-012 — 中央の時刻と所要時間 (SC-002)。`useTranscript` は mock し、描画経路 (assistant-ui の Thread / 変換) は本物。
 */

const { view } = vi.hoisted(() => ({
  view: {
    messages: [] as readonly ThreadMessageLike[],
    status: 'ready' as 'idle' | 'loading' | 'ready' | 'empty' | 'failed',
    reasonKey: null as string | null,
    retry: (): void => {},
    hasSelection: true
  }
}))

vi.mock('./useTranscript', () => ({ useTranscript: () => view }))

import { ChatScreen } from './ChatScreen'

const AXE_RULES = { rules: { 'color-contrast': { enabled: false } } }
const T0 = new Date(2026, 9, 17, 10, 0, 0).getTime()

const dto = (
  id: string,
  role: 'user' | 'assistant',
  text: string,
  createdAt: number | null
): TranscriptMessageDTO => ({ id, role, parts: [{ type: 'text', text }], createdAt })

function renderConversation(
  dtos: readonly TranscriptMessageDTO[],
  lastTurnOpen = false
): ReturnType<typeof render> {
  view.messages = dtos.map(toThreadMessage)
  return render(
    <ConversationTimeProvider
      conversationKey="test"
      messages={view.messages}
      lastTurnOpen={lastTurnOpen}
    >
      <ChatScreen />
    </ConversationTimeProvider>
  )
}

const times = (c: HTMLElement): HTMLElement[] =>
  Array.from(c.querySelectorAll<HTMLElement>('[data-slot="message-time"]'))

beforeEach(() => {
  useUiStore.setState({ transcriptDensity: 'comfortable' })
  view.messages = []
  view.status = 'ready'
  view.hasSelection = true
})

describe('中央の時刻と所要時間 (O-9 FE-012)', () => {
  it('利用者と assistant に時刻、始まりの利用者に所要時間が出る。全体の書式は支援技術の名前', () => {
    const { container } = renderConversation([
      dto('u1', 'user', '質問', T0),
      dto('a1', 'assistant', '答え', T0 + 5_000),
      dto('u2', 'user', '次', T0 + 60_000)
    ])
    const labels = times(container)
    expect(labels).toHaveLength(3)
    expect(labels[0]).toHaveTextContent('所要 0:05')
    expect(labels[1]).not.toHaveTextContent('所要')
    expect(labels[2]).not.toHaveTextContent('所要')
    expect(labels[0]).toHaveTextContent(formatMessageTimeFull(T0))
    expect(container.querySelector('time')?.getAttribute('datetime')).toBe(
      new Date(T0).toISOString()
    )
  })

  it('timestamp の無い過去ログは時刻の要素を作らない', () => {
    const { container } = renderConversation([
      dto('u1', 'user', '質問', null),
      dto('a1', 'assistant', '答え', null)
    ])
    expect(times(container)).toHaveLength(0)
  })

  it('実行中の最後のターンに所要時間を出さない', () => {
    const { container } = renderConversation(
      [dto('u1', 'user', '質問', T0), dto('a1', 'assistant', '答え', T0 + 5_000)],
      true
    )
    expect(times(container)).toHaveLength(2)
    expect(container).not.toHaveTextContent('所要')
  })

  it('時計が戻っても負の所要時間を出さず、順は変わらない', () => {
    const { container } = renderConversation([
      dto('u1', 'user', '質問', T0),
      dto('a1', 'assistant', '答え', T0 - 5_000)
    ])
    expect(container).not.toHaveTextContent('所要')
    expect(times(container)).toHaveLength(2)
  })

  it('compact でも出る。axe の違反が無い', async () => {
    useUiStore.setState({ transcriptDensity: 'compact' })
    const { container } = renderConversation([
      dto('u1', 'user', '質問', T0),
      dto('a1', 'assistant', '答え', T0 + 5_000)
    ])
    expect(times(container)).toHaveLength(2)
    expect((await axe(container, AXE_RULES)).violations).toEqual([])
  })
})
