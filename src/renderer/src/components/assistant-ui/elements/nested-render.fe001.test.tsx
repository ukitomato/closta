import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import {
  AssistantRuntimeProvider,
  MessagePrimitive,
  TextMessagePartProvider,
  ThreadPrimitive,
  useExternalStoreRuntime,
  type ThreadMessageLike,
  type ToolCallMessagePartProps
} from '@assistant-ui/react'

import { MarkdownText } from '@/components/markdown-text'
import { ToolResultThreadContext } from '@/features/chat/transcript-context'

import { Reasoning, ReasoningContent, ReasoningRoot, ReasoningText, ReasoningTrigger } from './reasoning.aui'
import { ToolDisplay } from './tool-registry.aui'

/**
 * FE-001 (O-11 / research R-10 / plan RK-05) — 入れ子 (message の part の context の外) で registry の表示・MCP の表示・
 * ToolFallback・Reasoning が props だけで描け、O-6 の `useToolResultState` が thread の context から値を引けることの確認。
 * `useToolResultState` は mock せず本物を通す。FE-031 の component テストへ引き継ぐ。
 *
 * 入れ子の tool-call は「親の `Agent` の part の component の中で、props だけで置いた `ToolDisplay`」で再現する
 * (part の context を作らない)。
 */

function nestedProps(
  toolName: string,
  args: Record<string, unknown>,
  over: Partial<ToolCallMessagePartProps> = {}
): ToolCallMessagePartProps {
  return {
    type: 'tool-call',
    toolCallId: `toolu_nested_${toolName}`,
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

const NESTED: readonly ToolCallMessagePartProps[] = [
  nestedProps('Read', { file_path: '/a/b.ts' }),
  nestedProps('Bash', { command: 'ls -la' }),
  nestedProps('Edit', { file_path: '/a/b.ts', old_string: 'a', new_string: 'b' }),
  nestedProps('mcp__github__create_issue', { title: 't' }),
  nestedProps('SomethingUnknown', { x: 1 })
]

function Host(): React.JSX.Element {
  return (
    <div data-testid="host">
      {NESTED.map((p) => (
        <ToolDisplay key={p.toolCallId} {...p} />
      ))}
      <ReasoningRoot defaultOpen>
        <ReasoningTrigger />
        <ReasoningContent>
          <ReasoningText>
            <TextMessagePartProvider text={'**考え中**'} isRunning={false}>
              <Reasoning type="reasoning" text="" status={{ type: 'complete' }} />
            </TextMessagePartProvider>
          </ReasoningText>
        </ReasoningContent>
      </ReasoningRoot>
      <TextMessagePartProvider text={'# 見出し'} isRunning={false}>
        <MarkdownText />
      </TextMessagePartProvider>
    </div>
  )
}

const MESSAGES: ThreadMessageLike[] = [
  {
    id: 'm1',
    role: 'assistant',
    content: [
      { type: 'tool-call', toolCallId: 'toolu_parent', toolName: 'Agent', args: {}, argsText: '{}' }
    ]
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
            <MessagePrimitive.Root>
              <MessagePrimitive.Parts components={{ tools: { Override: Host } }} />
            </MessagePrimitive.Root>
          )}
        </ThreadPrimitive.Messages>
      </ThreadPrimitive.Root>
    </AssistantRuntimeProvider>
  )
}

const slots = (root: ParentNode, name: string): HTMLElement[] =>
  Array.from(root.querySelectorAll<HTMLElement>(`[data-slot="${name}"]`))

describe('入れ子の中の描画 (FE-001)', () => {
  it('registry の専用表示・MCP・ToolFallback・Reasoning・markdown が例外なく描ける', async () => {
    const { container, findByText } = render(<Thread />)
    await findByText('見出し')
    const host = container.querySelector('[data-testid="host"]') as HTMLElement
    expect(host).not.toBeNull()
    expect(slots(host, 'aui_file-tool')).toHaveLength(1)
    expect(slots(host, 'aui_terminal-block')).toHaveLength(1)
    expect(slots(host, 'aui_code-diff')).toHaveLength(1)
    // 知らない tool は ToolFallback (他の表示も同じ枠を使うので root の数は問わない)
    expect(slots(host, 'tool-fallback-root').length).toBeGreaterThan(0)
    expect(host.textContent).toContain('SomethingUnknown')
    expect(host.querySelector('[data-slot^="aui_mcp"]')).not.toBeNull()
    expect(host.querySelector('strong')?.textContent).toBe('考え中')
    expect(host.querySelector('h1')?.textContent).toBe('見出し')
  })

  it('useToolResultState が thread の context (ToolResultThreadContext) から値を引ける (結果待ち → 印)', async () => {
    const { container, findByText } = render(
      <ToolResultThreadContext.Provider value={{ live: true, runState: 'running' }}>
        <Thread />
      </ToolResultThreadContext.Provider>
    )
    await findByText('見出し')
    const states = slots(container, 'tool-result-state')
    expect(states.length).toBeGreaterThan(0)
    expect(states.every((el) => el.dataset.state === 'running')).toBe(true)
  })

  it('過去ログの context では結果の無い入れ子の tool は結果不明', async () => {
    const { container, findByText } = render(
      <ToolResultThreadContext.Provider value={{ live: false, runState: null }}>
        <Thread />
      </ToolResultThreadContext.Provider>
    )
    await findByText('見出し')
    const states = slots(container, 'tool-result-state')
    expect(states.length).toBeGreaterThan(0)
    expect(states.every((el) => el.dataset.state === 'unknown')).toBe(true)
  })
})
