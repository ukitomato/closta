import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { ToolCallMessagePartProps } from '@assistant-ui/react'

import { ToolDisplay } from './tool-registry.aui'

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
    'Read',
    'Grep'
  ])('%s', (name) => {
    expect(displayedSlot(name)).toBe('tool-fallback-root')
  })
})
