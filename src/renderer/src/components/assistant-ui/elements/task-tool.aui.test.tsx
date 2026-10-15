import { fireEvent, render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'

import type { ToolCallMessagePartProps } from '@assistant-ui/react'

import { setToolResultContext } from '@/test-support/tool-result-mock'

import { TaskTool } from './task-tool.aui'

vi.mock('@/features/chat/transcript-context', async (importOriginal) =>
  (await import('@/test-support/tool-result-mock')).withToolResultMock(await importOriginal())
)

/** O-6 FE-022 — 計画と進捗の表示 (016 spec US-2 AC5 / AC7)。 */

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

const slot = (root: ParentNode, name: string): HTMLElement | null =>
  root.querySelector<HTMLElement>(`[data-slot="${name}"]`)

function open(root: ParentNode): void {
  fireEvent.click(slot(root, 'tool-display-trigger') as HTMLElement)
}

beforeEach(() => setToolResultContext({}))

describe('TaskCreate', () => {
  it('追加した時点は未着手。結果の text にタスクの id が見える。呼び出しごとに描く', async () => {
    const { container } = render(
      <TaskTool
        {...part(
          'TaskCreate',
          { subject: '調査', description: 'd', activeForm: '調べている' },
          { result: 'Task #12 created successfully: 調査' }
        )}
      />
    )
    expect(slot(container, 'tool-display-heading')?.textContent).toBe('タスクを追加 · 調査')
    open(container)
    expect(slot(container, 'task-tool-item')?.dataset.status).toBe('pending')
    expect(slot(container, 'task-tool-status')?.textContent).toBe('追加した時点: 未着手')
    expect(slot(container, 'tool-display-result-text')?.textContent).toContain('#12')
    expect((await axe(container, AXE_RULES)).violations).toEqual([])
  })

  it('subject の見出しに伏せ字', () => {
    const { container } = render(<TaskTool {...part('TaskCreate', { subject: 'token=abc12345' })} />)
    expect(container.textContent).not.toContain('abc12345')
  })
})

describe('TaskUpdate', () => {
  it.each([
    ['pending', '未着手'],
    ['in_progress', '進行中'],
    ['completed', '完了'],
    ['deleted', '削除'],
    ['mystery', '不明'],
    ['__proto__', '不明'],
    ['constructor', '不明']
  ])('状態 %s → %s', (status, label) => {
    const { container } = render(
      <TaskTool {...part('TaskUpdate', { taskId: '3', subject: '直す', status })} />
    )
    open(container)
    expect(slot(container, 'task-tool-status')?.textContent).toBe(label)
  })

  it('subject の無い TaskUpdate は「タスク #{taskId}」', () => {
    const { container } = render(
      <TaskTool {...part('TaskUpdate', { taskId: '9', status: 'completed' })} />
    )
    expect(slot(container, 'tool-display-heading')?.textContent).toBe('タスクを更新 · タスク #9')
    open(container)
    expect(slot(container, 'task-tool-item')?.textContent).toContain('タスク #9')
  })

  it('status の無い TaskUpdate は項目を出さず見出しだけ', () => {
    const { container } = render(<TaskTool {...part('TaskUpdate', { taskId: '9', subject: 's' })} />)
    open(container)
    expect(slot(container, 'task-tool-item')).toBeNull()
    expect(slot(container, 'tool-display-heading')?.textContent).toBe('タスクを更新 · s')
  })
})

describe('TaskGet / TaskList', () => {
  it('見出しと結果の text', () => {
    const get = render(
      <TaskTool {...part('TaskGet', { taskId: '4' }, { result: 'Task #4: x' })} />
    )
    expect(slot(get.container, 'tool-display-heading')?.textContent).toBe('タスクを確認 タスク #4')
    open(get.container)
    expect(slot(get.container, 'tool-display-result-text')?.textContent).toBe('Task #4: x')
    get.unmount()
    const list = render(<TaskTool {...part('TaskList', {}, { result: '#1 a\n#2 b' })} />)
    expect(slot(list.container, 'tool-display-heading')?.textContent).toBe('タスクの一覧')
  })
})

describe('Task 系のエラーの印 (011 pr-gate po H-001)', () => {
  it('isError で「エラー」の印と本文が出る', () => {
    const { container } = render(
      <TaskTool {...part('TaskGet', { taskId: '4' }, { result: 'not found', isError: true })} />
    )
    expect(slot(container, 'tool-result-error')?.textContent).toBe('エラー')
    expect(slot(container, 'tool-result-error-text')?.textContent).toBe('not found')
  })
})
