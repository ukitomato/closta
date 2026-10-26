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

import type { TranscriptMessageDTO, TranscriptPartDTO } from '@domain/session/transcript-dto'
import { toThreadMessage } from '@/features/chat/convert'
import { ToolResultThreadContext } from '@/features/chat/transcript-context'

import { Subagent } from './subagent.aui'
import { ToolDisplay } from './tool-registry.aui'

/**
 * O-11 FE-031 — 入れ子の描画 (data-model §3.3 / US-3 AC1〜AC3 / AC5 / AC6)。`useToolResultState` は mock せず本物を通す。
 * FE-001 (`nested-render.fe001.test.tsx`) の確認を引き継ぐ: 親の `Agent` の表示 (registry の `ToolDisplay`) の中で、
 * 入れ子の tool-call が props だけで描ける。
 */

const AXE_RULES = { rules: { 'color-contrast': { enabled: false } } }

type ToolCallPart = Extract<TranscriptPartDTO, { type: 'tool-call' }>

function call(
  id: string,
  name: string,
  args: Record<string, unknown>,
  over: Partial<ToolCallPart> = {}
): ToolCallPart {
  return {
    type: 'tool-call',
    toolCallId: id,
    toolName: name,
    argsText: JSON.stringify(args),
    result: null,
    isError: false,
    truncated: false,
    children: [],
    ...over
  }
}

function message(id: string, ...parts: TranscriptPartDTO[]): TranscriptMessageDTO {
  return { id, role: 'assistant', parts, createdAt: null }
}

const AGENT_ARGS = { description: '調べる', prompt: 'find', subagent_type: 'Explore' }

function agentRoot(children: TranscriptMessageDTO[], over: Partial<ToolCallPart> = {}): ThreadMessageLike {
  return toThreadMessage(
    message('root', call('agent1', 'Agent', AGENT_ARGS, { children, result: 'done', ...over }))
  )
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

const slots = (root: ParentNode, name: string): HTMLElement[] =>
  Array.from(root.querySelectorAll<HTMLElement>(`[data-slot="${name}"]`))

/** 親の Subagent は既定で畳まれない (本体が DOM にある)。入れ子の表示を探す。 */
async function renderAgent(
  children: TranscriptMessageDTO[],
  context: { live: boolean; runState: 'running' | 'done' | null } = { live: false, runState: null },
  over: Partial<ToolCallPart> = {}
): Promise<{ container: HTMLElement; subagent: HTMLElement }> {
  const { container, findAllByText } = render(
    <ToolResultThreadContext.Provider value={context}>
      <Thread messages={[agentRoot(children, over)]} />
    </ToolResultThreadContext.Provider>
  )
  await findAllByText('サブエージェント')
  return { container, subagent: slots(container, 'aui_subagent')[0] as HTMLElement }
}

describe('Subagent の入れ子 (O-11 FE-031)', () => {
  it('入れ子の Read / Bash / Edit が主ループと同じ専用の表示になる (axe 違反 0)', async () => {
    const { container, subagent } = await renderAgent([
      message(
        'c1',
        call('r1', 'Read', { file_path: '/a/b.ts' }, { result: 'body' }),
        call('b1', 'Bash', { command: 'ls -la' }, { result: 'out' }),
        call('e1', 'Edit', { file_path: '/a/b.ts', old_string: 'a', new_string: 'b' }, { result: 'ok' })
      )
    ])
    expect(slots(subagent, 'aui_file-tool')).toHaveLength(1)
    expect(slots(subagent, 'aui_terminal-block')).toHaveLength(1)
    expect(slots(subagent, 'aui_code-diff')).toHaveLength(1)
    expect((await axe(container, AXE_RULES)).violations).toEqual([])
  })

  it('MCP と知らない tool は ToolFallback になる', async () => {
    const { subagent } = await renderAgent([
      message(
        'c1',
        call('m1', 'mcp__github__create_issue', { title: 't' }, { result: 'ok' }),
        call('u1', 'SomethingUnknown', { x: 1 }, { result: 'ok' })
      )
    ])
    expect(subagent.querySelector('[data-slot^="aui_mcp"]')).not.toBeNull()
    expect(subagent.textContent).toContain('SomethingUnknown')
    expect(slots(subagent, 'tool-fallback-root').length).toBeGreaterThan(0)
  })

  it('入れ子の server-tool-call と知らないブロックの印が主ループと同じ DOM になる (O-12 FE-031)', async () => {
    const { container, subagent } = await renderAgent([
      message(
        'c1',
        {
          type: 'server-tool-call',
          toolCallId: 'srv_1',
          toolName: 'web_search',
          argsText: JSON.stringify({ query: 'q' }),
          truncated: false,
          result: { kind: 'web-search', sources: [{ title: 'T', url: 'https://e.com/a' }], omitted: 0 }
        },
        { type: 'unsupported-block', blockType: 'mcp_tool_use' }
      )
    ])
    expect(slots(subagent, 'aui_server-tool-call')).toHaveLength(1)
    expect(slots(subagent, 'unsupported-block-mark')[0]?.textContent).toBe(
      '表示に対応していないブロック (mcp_tool_use)'
    )
    expect((await axe(container, AXE_RULES)).violations).toEqual([])
  })

  it('入れ子の text は markdown で描かれ、XSS の fixture は無害', async () => {
    const { container, subagent } = await renderAgent([
      message(
        'c1',
        {
          type: 'text',
          text: [
            '# 見出し',
            '[危険](javascript:alert(1))',
            '<script>window.__pwned=1</script>',
            '<img src=x onerror="window.__pwned=1">',
            '![remote](https://example.com/x.png)'
          ].join('\n\n')
        }
      )
    ])
    await new Promise<void>((resolve) => {
      const tick = (): void => {
        if (subagent.querySelector('h1') !== null) resolve()
        else setTimeout(tick, 50)
      }
      tick()
    })
    expect(subagent.querySelector('h1')?.textContent).toBe('見出し')
    expect(container.querySelector('script')).toBeNull()
    expect(container.querySelector('img[src^="http"]')).toBeNull()
    expect((window as unknown as { __pwned?: number }).__pwned).toBeUndefined()
    for (const a of Array.from(subagent.querySelectorAll('a'))) {
      expect(a.getAttribute('href') ?? '').not.toMatch(/^javascript:/i)
    }
  })

  it('thinking は Reasoning の表示、divider は TranscriptBoundary (数を省いた文言)', async () => {
    const { subagent } = await renderAgent([
      message(
        'c1',
        { type: 'reasoning', text: '考え中' },
        { type: 'divider', label: 'コンテキストを圧縮' }
      )
    ])
    expect(subagent.querySelector('[data-slot="reasoning-trigger"], [data-slot^="reasoning"]')).not.toBeNull()
    const boundary = slots(subagent, 'aui_transcript-boundary')[0] as HTMLElement
    expect(boundary).toBeDefined()
    expect(boundary.dataset.category).toBe('compact-boundary')
    expect(boundary.textContent).not.toMatch(/\d/)
  })

  it('深さ 4 から先は簡易な描画 (省略の案内)。最上位の Agent の外では registry の振り分けを使わない', async () => {
    let chain: TranscriptMessageDTO[] = [message('leaf', { type: 'text', text: 'deepest' })]
    for (let depth = 5; depth >= 1; depth--) {
      chain = [message(`c${depth}`, call(`agent${depth + 1}`, 'Agent', AGENT_ARGS, { children: chain }))]
    }
    const { subagent } = await renderAgent(chain)
    expect(subagent.textContent).toMatch(/省略/)
    expect(subagent.textContent).not.toContain('deepest')
  })

  it('registry の Provider の外で Subagent を描くと簡易な描画 (専用の表示にならない)', async () => {
    const root = agentRoot([
      message('c1', call('r1', 'Read', { file_path: '/a/b.ts' }, { result: 'body' }))
    ])
    // Provider を置かない Subagent を直接の Override にする。
    function Bare(): React.JSX.Element {
      const runtime = useExternalStoreRuntime({
        messages: [root],
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
                  <MessagePrimitive.Parts components={{ tools: { Override: Subagent } }} />
                </MessagePrimitive.Root>
              )}
            </ThreadPrimitive.Messages>
          </ThreadPrimitive.Root>
        </AssistantRuntimeProvider>
      )
    }
    const { container, findAllByText } = render(<Bare />)
    await findAllByText('サブエージェント')
    expect(slots(container, 'aui_file-tool')).toHaveLength(0)
    expect(container.textContent).toContain('Read')
    expect(container.textContent).toContain('body')
  })

  it('結果待ち・結果不明の印: 実行中の context では running、過去ログでは unknown。経過時間は出ない', async () => {
    const children = [message('c1', call('r1', 'Read', { file_path: '/a/b.ts' }))]
    const live = await renderAgent(children, { live: true, runState: 'running' }, { result: null })
    const liveStates = slots(live.subagent, 'tool-result-state')
    expect(liveStates.some((el) => el.dataset.state === 'running')).toBe(true)
    expect(slots(live.container, 'tool-result-elapsed')).toHaveLength(0)
    live.container.remove()

    const past = await renderAgent(children, { live: false, runState: null }, { result: null })
    const pastStates = slots(past.subagent, 'tool-result-state')
    expect(pastStates.length).toBeGreaterThan(0)
    expect(pastStates.every((el) => el.dataset.state === 'unknown')).toBe(true)
  })

  it('実行中と過去ログで同じ children は同じ DOM の構造になる', async () => {
    const children = [
      message(
        'c1',
        { type: 'text', text: 'hello' },
        call('r1', 'Read', { file_path: '/a/b.ts' }, { result: 'body' })
      )
    ]
    const shape = (root: HTMLElement): string[] =>
      Array.from(root.querySelectorAll<HTMLElement>('[data-slot]')).map((el) => el.dataset.slot ?? '')
    const live = await renderAgent(children, { live: true, runState: 'done' })
    const liveShape = shape(live.subagent)
    live.container.remove()
    const past = await renderAgent(children, { live: false, runState: null })
    expect(shape(past.subagent)).toEqual(liveShape)
  })

  it('truncated の親 (最上位の Agent と入れ子の tool-call) に切り詰めの印が出る (U-10)', async () => {
    const { subagent } = await renderAgent(
      [message('c1', call('r1', 'Read', { file_path: '/a/b.ts' }, { result: 'body', truncated: true }))],
      { live: false, runState: null },
      { truncated: true }
    )
    expect(slots(subagent, 'tool-result-truncated').length).toBeGreaterThanOrEqual(2)
  })
})
