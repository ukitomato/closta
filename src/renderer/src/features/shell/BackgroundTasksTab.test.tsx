import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { axe } from 'vitest-axe'

import type { SessionEvent } from '@domain/session/agent-session'
import type { BackgroundTaskEntry } from '@domain/session/meter'

import { taskTypeLabel } from '@/features/chat/labels'
import {
  A,
  registerAppShellHooks,
  selectPast,
  selectRunning,
  setup
} from '@/test-support/app-shell-harness'

import { BACKGROUND_TASKS_LABELS, SHELL_LABELS } from './labels'

/**
 * O-11 FE-022 — 右のペインの「背景の task」のタブ (019 spec FR-006 / US-2 AC3〜AC5。data-model §2.5)。
 * 値は port → decoder → 稼働中のストアの経路で届ける (`h.emit`)。
 */

registerAppShellHooks()

const AXE_RULES = { rules: { 'color-contrast': { enabled: false } } }

const tasks = (...list: readonly BackgroundTaskEntry[]): SessionEvent => ({
  kind: 'meter',
  meter: { type: 'background-tasks', tasks: list }
})

const taskRow = (id: string, name: string, detail = 'local_bash'): SessionEvent => ({
  kind: 'message',
  message: {
    id: `task:${id}`,
    role: 'system',
    parts: [
      {
        type: 'system-event',
        category: 'backgrounded-task',
        opens: true,
        name,
        detail,
        status: 'running'
      }
    ],
    createdAt: 1
  }
})

async function openTab(): Promise<HTMLElement> {
  await userEvent.click(screen.getByRole('button', { name: SHELL_LABELS.expandPanel }))
  await userEvent.click(screen.getByRole('tab', { name: SHELL_LABELS.backgroundTasksTab }))
  return screen.getByRole('tabpanel')
}

const items = (panel: HTMLElement): string[] =>
  within(panel)
    .queryAllByTestId('background-task')
    .map((el) => el.textContent ?? '')

describe('背景の task のタブ (US-2 AC3〜AC5)', () => {
  it('一覧は置き換わり (前の一覧が残らない)、件数が見出しに出る', async () => {
    const h = await setup({ ids: [A] })
    await selectRunning(0)
    h.emit(
      A,
      tasks({ taskId: 'a', taskType: 'local_bash' }, { taskId: 'b', taskType: 'local_agent' })
    )
    const panel = await openTab()
    expect(within(panel).getByTestId('background-tasks-heading')).toHaveTextContent(
      BACKGROUND_TASKS_LABELS.heading('2')
    )
    expect(items(panel)).toEqual([taskTypeLabel('local_bash'), taskTypeLabel('local_agent')])
    h.emit(A, tasks({ taskId: 'c', taskType: 'mcp_task' }))
    expect(items(panel)).toEqual([taskTypeLabel('mcp_task')])
    expect(within(panel).getByTestId('background-tasks-heading')).toHaveTextContent(
      BACKGROUND_TASKS_LABELS.heading('1')
    )
  })

  it('起動直後は空から始まり (US-2 AC4)、0 件は空の旨', async () => {
    const h = await setup({ ids: [A] })
    await selectRunning(0)
    const panel = await openTab()
    expect(within(panel).getByTestId('background-tasks-heading')).toHaveTextContent(
      BACKGROUND_TASKS_LABELS.heading('0')
    )
    expect(within(panel).queryByTestId('background-tasks-awaiting')).toBeNull()
    expect(within(panel).getByTestId('background-tasks-empty')).toBeInTheDocument()
    h.emit(A, tasks())
    expect(within(panel).getByTestId('background-tasks-empty')).toHaveTextContent(
      BACKGROUND_TASKS_LABELS.empty
    )
    expect(items(panel)).toEqual([])
  })

  it('transcript に行のある task は名前も出し、無い task は種類だけ。未知の種類は other のラベル', async () => {
    const h = await setup({ ids: [A] })
    await selectRunning(0)
    h.emit(A, taskRow('a', 'npm'))
    h.emit(
      A,
      tasks(
        { taskId: 'a', taskType: 'local_bash' },
        { taskId: 'b', taskType: 'local_bash' },
        { taskId: 'c', taskType: 'other' }
      )
    )
    const panel = await openTab()
    expect(items(panel)).toEqual([
      `${taskTypeLabel('local_bash')}「npm」`,
      taskTypeLabel('local_bash'),
      'その他の task'
    ])
  })

  it('description の目印が DOM に 0 件。操作のボタンを持たない', async () => {
    const h = await setup({ ids: [A] })
    await selectRunning(0)
    h.emit(A, tasks({ taskId: 'a', taskType: 'local_bash', description: 'LEAK-DESC' } as never))
    const panel = await openTab()
    expect(document.body.textContent).not.toContain('LEAK-DESC')
    expect(within(panel).queryAllByRole('button')).toEqual([])
  })

  it('終了・失敗したセッションは一覧を出さず「セッションは動いていません」', async () => {
    const h = await setup({ ids: [A] })
    await selectRunning(0)
    h.emit(A, tasks({ taskId: 'a', taskType: 'local_bash' }))
    const panel = await openTab()
    expect(items(panel)).toHaveLength(1)
    h.push([{ sessionId: A, state: 'error', reasonKey: 'provider-error', claudeAlive: false }])
    expect(within(panel).getByTestId('background-tasks-not-running')).toHaveTextContent(
      BACKGROUND_TASKS_LABELS.notRunning
    )
    expect(items(panel)).toEqual([])
  })

  it('未選択・過去のセッションは「セッションは動いていません」', async () => {
    await setup({ ids: [A] })
    const panel = await openTab()
    expect(within(panel).getByTestId('background-tasks-not-running')).toBeInTheDocument()
    await selectPast(0)
    expect(
      within(screen.getByRole('tabpanel')).getByTestId('background-tasks-not-running')
    ).toBeInTheDocument()
  })

  it('vitest-axe の違反 0 (一覧・空・動いていない)', async () => {
    const h = await setup({ ids: [A] })
    const panel0 = await openTab()
    expect((await axe(panel0, AXE_RULES)).violations).toEqual([])
    await selectRunning(0)
    h.emit(A, taskRow('a', 'npm'))
    h.emit(
      A,
      tasks({ taskId: 'a', taskType: 'local_bash' }, { taskId: 'b', taskType: 'local_agent' })
    )
    expect((await axe(screen.getByTestId('right-panel'), AXE_RULES)).violations).toEqual([])
    h.emit(A, tasks())
    expect((await axe(screen.getByTestId('right-panel'), AXE_RULES)).violations).toEqual([])
  })
})
