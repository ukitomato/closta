import type { ComponentProps } from 'react'
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
import { toThreadMessage } from '@/features/chat/convert'
import { ToolResultThreadContext } from '@/features/chat/transcript-context'

import { ToolDisplay } from './tool-registry.aui'
import { DocumentFile } from './thread.aui'

/** O-12 FE-020 — File element (SC-002 / US-2 AC3)。名前と種類だけ。英語の既定とダウンロード・大きさを出さない。 */

const AXE_RULES = { rules: { 'color-contrast': { enabled: false } } }

type FileMediaType = 'application/pdf' | 'text/plain' | ''

function filePartProps(filename: string, mediaType: FileMediaType): ComponentProps<typeof DocumentFile> {
  const msg: TranscriptMessageDTO = {
    id: 'u',
    role: 'user',
    parts: [{ type: 'file', filename, mediaType }],
    createdAt: null
  }
  const content = toThreadMessage(msg).content
  if (typeof content === 'string') throw new Error('unexpected')
  return content[0] as unknown as ComponentProps<typeof DocumentFile>
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
              <MessagePrimitive.Parts components={{ tools: { Override: ToolDisplay } }} />
            </MessagePrimitive.Root>
          )}
        </ThreadPrimitive.Messages>
      </ThreadPrimitive.Root>
    </AssistantRuntimeProvider>
  )
}

describe('DocumentFile (FE-020)', () => {
  it('名前と種類 (PDF) が出てリンクと大きさは出ない', async () => {
    const { container } = render(<DocumentFile {...filePartProps('report.pdf', 'application/pdf')} />)
    const text = container.textContent ?? ''
    expect(text).toContain('report.pdf')
    expect(text).toContain('PDF')
    expect(container.querySelectorAll('a')).toHaveLength(0)
    expect(container.querySelectorAll('[data-slot="file-size"]')).toHaveLength(0)
    expect(text).not.toContain('Download')
    expect((await axe(container, AXE_RULES)).violations).toEqual([])
  })

  it('名前が空なら「名前のない文書」で、英語の既定が出ない', () => {
    const { container } = render(<DocumentFile {...filePartProps('', '')} />)
    const text = container.textContent ?? ''
    expect(text).toContain('名前のない文書')
    expect(text).toContain('文書')
    expect(text).not.toContain('Unnamed file')
    expect(text).not.toContain('Download')
  })

  it('text/plain は「テキスト」', () => {
    const { container } = render(<DocumentFile {...filePartProps('a.txt', 'text/plain')} />)
    expect(container.textContent).toContain('テキスト')
  })

  it('入れ子 (subagent) でも名前と種類が出る', async () => {
    const root = toThreadMessage({
      id: 'root',
      role: 'assistant',
      createdAt: null,
      parts: [
        {
          type: 'tool-call',
          toolCallId: 'agent1',
          toolName: 'Agent',
          argsText: JSON.stringify({ description: '調べる', prompt: 'find', subagent_type: 'Explore' }),
          result: 'done',
          isError: false,
          truncated: false,
          children: [
            {
              id: 'c',
              role: 'user',
              parts: [{ type: 'file', filename: 'n.pdf', mediaType: 'application/pdf' }],
              createdAt: null
            }
          ]
        }
      ]
    })
    const { container, findAllByText } = render(
      <ToolResultThreadContext.Provider value={{ live: false, runState: null }}>
        <Thread messages={[root]} />
      </ToolResultThreadContext.Provider>
    )
    await findAllByText('サブエージェント')
    const text = container.textContent ?? ''
    expect(text).toContain('n.pdf')
    expect(text).toContain('PDF')
    expect((await axe(container, AXE_RULES)).violations).toEqual([])
  })
})
