import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'

import type { ToolCallMessagePartProps } from '@assistant-ui/react'

import { setToolResultContext } from '@/test-support/tool-result-mock'

import { AgentPlan } from './agent-plan.aui'
import { CodeDiff } from './code-diff.aui'
import { FileTool } from './file-tool.aui'
import { Subagent } from './subagent.aui'
import { TaskTool } from './task-tool.aui'
import { TerminalBlock } from './terminal-block.aui'
import { TodoList } from './todo-list.aui'
import { ToolFallback } from './tool-fallback.aui'
import { WebTool } from './web-tool.aui'

/**
 * O-6 FE-030 — すべての tool の表示で結果待ち / 結果不明 / 結果は別に表示の印が出る (016 spec US-3 AC1 / AC2 / AC4。SC-003)。
 */

vi.mock('@/features/chat/transcript-context', async (importOriginal) =>
  (await import('@/test-support/tool-result-mock')).withToolResultMock(await importOriginal())
)

const AXE_RULES = { rules: { 'color-contrast': { enabled: false } } }

function part(
  toolName: string,
  args: Record<string, unknown>,
  over: Partial<ToolCallMessagePartProps> = {}
): ToolCallMessagePartProps {
  return {
    type: 'tool-call',
    toolCallId: 'toolu_1',
    toolName,
    args,
    argsText: JSON.stringify(args),
    result: undefined,
    isError: false,
    status: { type: 'complete' },
    addResult: () => {},
    resume: () => {},
    ...over
  } as unknown as ToolCallMessagePartProps
}

const DISPLAYS: readonly {
  readonly name: string
  readonly render: (over: Partial<ToolCallMessagePartProps>) => React.JSX.Element
}[] = [
  { name: 'TerminalBlock', render: (o) => <TerminalBlock {...part('Bash', { command: 'ls' }, o)} /> },
  {
    name: 'CodeDiff',
    render: (o) => (
      <CodeDiff {...part('Edit', { file_path: '/a', old_string: 'a', new_string: 'b' }, o)} />
    )
  },
  { name: 'TodoList', render: (o) => <TodoList {...part('TodoWrite', { todos: [] }, o)} /> },
  {
    name: 'Subagent',
    render: (o) => <Subagent {...part('Agent', { description: 'd', prompt: 'p' }, o)} />
  },
  { name: 'AgentPlan', render: (o) => <AgentPlan {...part('ExitPlanMode', { plan: '計画' }, o)} /> },
  { name: 'FileTool', render: (o) => <FileTool {...part('Read', { file_path: '/a' }, o)} /> },
  { name: 'WebTool', render: (o) => <WebTool {...part('WebFetch', { url: 'https://e.com' }, o)} /> },
  { name: 'TaskTool', render: (o) => <TaskTool {...part('TaskGet', { taskId: '1' }, o)} /> },
  { name: 'ToolFallback', render: (o) => <ToolFallback {...part('NotebookEdit', { a: 1 }, o)} /> }
]

const stateMark = (root: ParentNode): HTMLElement | null =>
  root.querySelector<HTMLElement>('[data-slot="tool-result-state"]')

beforeEach(() => {
  setToolResultContext({})
})

describe.each(DISPLAYS)('$name の結果の状態の印', (d) => {
  it('応答中は「結果待ち」(動く印。aria-busy)、結果が届けば消える', () => {
    setToolResultContext({ live: true, runState: 'running' })
    const waiting = render(d.render({}))
    expect(stateMark(waiting.container)).toHaveTextContent('結果待ち')
    expect(stateMark(waiting.container)).toHaveAttribute('aria-busy', 'true')
    expect(waiting.container.querySelector('[data-slot="tool-result-spinner"]')).not.toBeNull()
    waiting.unmount()
    const done = render(d.render({ result: 'ok' }))
    expect(stateMark(done.container)).toBeNull()
  })

  it('承認待ちは「結果待ち」(動かない。aria-busy なし)', () => {
    setToolResultContext({ live: true, runState: 'awaiting_permission' })
    const { container } = render(d.render({}))
    expect(stateMark(container)).toHaveTextContent('結果待ち')
    expect(stateMark(container)).not.toHaveAttribute('aria-busy')
    expect(container.querySelector('[data-slot="tool-result-spinner"]')).toBeNull()
  })

  it('応答が終わった後・過去ログ・前のターンは「結果不明」', () => {
    for (const ctx of [
      { live: true, runState: 'idle' as const },
      { live: false },
      { live: true, runState: 'running' as const, latestTurn: false }
    ]) {
      setToolResultContext(ctx)
      const { container, unmount } = render(d.render({}))
      expect(stateMark(container)).toHaveTextContent('結果不明')
      unmount()
    }
  })

  it('結果が別のメッセージにあるときは「結果は別に表示」', () => {
    setToolResultContext({ live: true, runState: 'running', orphanResult: true })
    const { container } = render(d.render({}))
    expect(stateMark(container)).toHaveTextContent('結果は別に表示')
  })

  it('vitest-axe の違反 0 (結果不明)', async () => {
    setToolResultContext({ live: false })
    const { container } = render(d.render({}))
    expect((await axe(container, AXE_RULES)).violations).toEqual([])
  })
})

describe('ToolFallback の見出し (US-3 AC4)', () => {
  it('「{tool 名} を実行」で、英語の見出しを出さない', () => {
    const { container } = render(<ToolFallback {...part('NotebookEdit', { a: 1 })} />)
    const label = container.querySelector('[data-slot="tool-fallback-trigger-label"]')
    expect(label?.textContent).toBe('NotebookEdit を実行')
    expect(container.textContent).not.toMatch(/Used tool|Cancelled tool/)
  })
})
