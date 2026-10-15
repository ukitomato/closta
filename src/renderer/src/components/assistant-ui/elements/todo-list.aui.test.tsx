import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ToolCallMessagePartProps } from '@assistant-ui/react'

import { setToolResultContext } from '@/test-support/tool-result-mock'

import { TodoList } from './todo-list.aui'

vi.mock('@/features/chat/transcript-context', async (importOriginal) =>
  (await import('@/test-support/tool-result-mock')).withToolResultMock(await importOriginal())
)

beforeEach(() => {
  setToolResultContext({})
})

/** O-6 FE-022 — TodoWrite のエラー (`isError`) の印 (011 pr-gate po H-001。2026-10-13 に承認)。 */

function part(over: Partial<ToolCallMessagePartProps> = {}): ToolCallMessagePartProps {
  const args = { todos: [{ content: 'やること', status: 'pending' }] }
  return {
    type: 'tool-call',
    toolCallId: 'toolu_1',
    toolName: 'TodoWrite',
    args,
    argsText: JSON.stringify(args),
    result: 'ok',
    isError: false,
    status: { type: 'complete' },
    addResult: () => {},
    resume: () => {},
    ...over
  } as unknown as ToolCallMessagePartProps
}

describe('TodoWrite のエラーの印', () => {
  it('isError で「エラー」の印と本文が出る', () => {
    const { container } = render(<TodoList {...part({ result: 'failed to write', isError: true })} />)
    expect(container.querySelector('[data-slot="tool-result-error"]')?.textContent).toBe('エラー')
    expect(container.querySelector('[data-slot="tool-result-error-text"]')?.textContent).toBe(
      'failed to write'
    )
  })

  it('エラーでなければ印は出ない', () => {
    const { container } = render(<TodoList {...part()} />)
    expect(container.querySelector('[data-slot="tool-result-error"]')).toBeNull()
  })

  it('結果待ち・結果不明の印が出る (US-3 AC1)', () => {
    setToolResultContext({ live: true, runState: 'running' })
    const pending = render(<TodoList {...part({ result: undefined })} />)
    expect(pending.container.querySelector('[data-slot="tool-result-state"]')?.textContent).toBe('結果待ち')
    pending.unmount()
    setToolResultContext({ live: false })
    const unknown = render(<TodoList {...part({ result: undefined })} />)
    expect(unknown.container.querySelector('[data-slot="tool-result-state"]')?.textContent).toBe('結果不明')
  })
})
