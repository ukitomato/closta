import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ToolCallMessagePartProps } from '@assistant-ui/react'

import { setToolResultContext } from '@/test-support/tool-result-mock'

import { ToolDisplay } from './tool-registry.aui'

vi.mock('@/features/chat/transcript-context', async (importOriginal) =>
  (await import('@/test-support/tool-result-mock')).withToolResultMock(await importOriginal())
)

beforeEach(() => setToolResultContext({}))

/**
 * O-5 FE-012 — tool の表示の振り分けの 2 段 (015 spec FR-003 / SC-001。AD-048 Decision 5)。
 * (1) 完全一致の表 (`Object.hasOwn`) → (2) `mcp__` の接頭辞で McpToolCall → (3) ToolFallback。
 */

function partProps(toolName: string, args: unknown = {}): ToolCallMessagePartProps {
  return {
    type: 'tool-call',
    toolCallId: 'toolu_1',
    toolName,
    args,
    argsText: JSON.stringify(args),
    result: 'ok',
    isError: false,
    status: { type: 'complete' },
    addResult: () => {},
    resume: () => {}
  } as unknown as ToolCallMessagePartProps
}

function displayedSlot(toolName: string, args: unknown = {}): string {
  const { container, unmount } = render(<ToolDisplay {...partProps(toolName, args)} />)
  const el = container.querySelector<HTMLElement>(
    '[data-slot^="aui_"], [data-slot="tool-fallback-root"]'
  )
  const name = el?.dataset.slot ?? '(none)'
  unmount()
  return name
}

describe('振り分けの回帰: 既存の 8 つの名前が同じ部品に行く', () => {
  it.each([
    ['Bash', { command: 'ls' }, 'aui_terminal-block'],
    ['Edit', { file_path: 'a.ts', old_string: 'a', new_string: 'b' }, 'aui_code-diff'],
    ['Write', { file_path: 'a.ts', content: 'x' }, 'aui_code-diff'],
    [
      'MultiEdit',
      { file_path: 'a.ts', edits: [{ old_string: 'a', new_string: 'b' }] },
      'aui_code-diff'
    ],
    ['TodoWrite', { todos: [{ content: 'A', status: 'pending' }] }, 'aui_todo-list'],
    ['Task', { subagent_type: 'x', prompt: 'p' }, 'aui_subagent'],
    ['Agent', { description: 'd', prompt: 'p' }, 'aui_subagent'],
    ['ExitPlanMode', { plan: '計画' }, 'aui_agent-plan']
  ])('%s → %s', (name, args, expected) => {
    expect(displayedSlot(name, args)).toBe(expected)
  })
})

describe('MCP の tool は McpToolCall に行く (FR-003)', () => {
  it.each([
    'mcp__github__create_issue',
    'mcp__a__b__c',
    'mcp__x',
    'ListMcpResourcesTool',
    'ReadMcpResourceTool',
    'ReadMcpResourceDir',
    'RefreshMcpTools'
  ])('%s', (name) => {
    expect(displayedSlot(name)).toBe('aui_mcp-tool-call')
  })
})

describe('AskUserQuestion は読み取り専用の表示に行く (FR-005)', () => {
  it('完全一致の表から引く', () => {
    expect(
      displayedSlot('AskUserQuestion', {
        questions: [
          {
            question: 'どれ?',
            header: 'H',
            options: [
              { label: 'A', description: '' },
              { label: 'B', description: '' }
            ],
            multiSelect: false
          }
        ]
      })
    ).toBe('aui_ask-user-question')
  })
})

describe('非 MCP の名前と prototype のキーは ToolFallback に落ちる (SC-001)', () => {
  it.each([
    'mcp_x',
    'MCP__a__b',
    'xmcp__a__b',
    'constructor',
    '__proto__',
    'toString',
    'hasOwnProperty',
    'Search',
    'read',
    'TaskStop'
  ])('%s', (name) => {
    expect(displayedSlot(name)).toBe('tool-fallback-root')
  })
})

/** O-6 FE-023 — ファイル・検索・Web・計画の 9 tool は専用の表示に行く (016 plan「tool の専用表示」)。 */
describe('9 つの tool は入力が正しければ ToolFallback に落ちない (US-2 / SC-002)', () => {
  it.each([
    ['Read', { file_path: '/a/b.ts' }, 'aui_file-tool'],
    ['Glob', { pattern: '**/*.ts' }, 'aui_file-tool'],
    ['Grep', { pattern: 'x' }, 'aui_file-tool'],
    ['WebFetch', { url: 'https://example.com', prompt: 'p' }, 'aui_web-tool'],
    ['WebSearch', { query: 'q' }, 'aui_web-tool'],
    ['TaskCreate', { subject: 's', description: 'd' }, 'aui_task-tool'],
    ['TaskGet', { taskId: '1' }, 'aui_task-tool'],
    ['TaskUpdate', { taskId: '1', status: 'completed' }, 'aui_task-tool'],
    ['TaskList', {}, 'aui_task-tool']
  ])('%s → %s', (name, args, expected) => {
    expect(displayedSlot(name, args)).toBe(expected)
  })

  it('過去ログ (live: false) でも実行中 (live: true・結果待ち) でも同じ表示に行く', () => {
    setToolResultContext({ live: true, runState: 'running', latestTurn: true })
    const { container, unmount } = render(
      <ToolDisplay {...{ ...partProps('Read', { file_path: '/a' }), result: undefined }} />
    )
    expect(container.querySelector('[data-slot="aui_file-tool"]')).not.toBeNull()
    unmount()
  })

  it('入力が読めなければ ToolFallback に退避する', () => {
    expect(displayedSlot('Read', {})).toBe('tool-fallback-root')
    expect(displayedSlot('WebFetch', {})).toBe('tool-fallback-root')
    expect(displayedSlot('TaskUpdate', {})).toBe('tool-fallback-root')
  })

  it('Task は Subagent のまま', () => {
    expect(displayedSlot('Task', { description: 'd', prompt: 'p' })).toBe('aui_subagent')
  })
})
