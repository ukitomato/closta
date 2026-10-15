import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'

import type { ToolCallMessagePartProps, ToolCallMessagePartStatus } from '@assistant-ui/react'

import { MCP_TOOL_LABELS, TOOL_RESULT_LABELS } from '@/features/chat/labels'
import { LiveProgressContext, type LiveProgressSource } from '@/features/chat/transcript-context'
import { setToolResultContext } from '@/test-support/tool-result-mock'

import { McpToolCall } from './mcp-tool-call.aui'
import { ToolFallback } from './tool-fallback.aui'

vi.mock('@/features/chat/transcript-context', async (importOriginal) =>
  (await import('@/test-support/tool-result-mock')).withToolResultMock(await importOriginal())
)

beforeEach(() => {
  setToolResultContext({})
})

/**
 * O-5 FE-012 — MCP の tool の表示 (015 spec US-1 AC1〜AC5 / AC9。data-model §1)。
 * 過去ログ (購読元が無い) と実行中 (購読元が構成のサーバー名を返す) の両方で、同じ部品・同じ見出しの構造になる。
 */

const AXE_RULES = { rules: { 'color-contrast': { enabled: false } } }

function partProps(over: Partial<ToolCallMessagePartProps> = {}): ToolCallMessagePartProps {
  return {
    type: 'tool-call',
    toolCallId: 'toolu_1',
    toolName: 'mcp__a__b',
    args: { q: 'x' },
    argsText: '{\n  "q": "x"\n}',
    result: 'ok',
    isError: false,
    status: { type: 'complete' },
    addResult: () => {},
    resume: () => {},
    ...over
  } as unknown as ToolCallMessagePartProps
}

function liveSource(names: readonly string[], elapsed: number | null = null): LiveProgressSource {
  return {
    toolElapsed: () => elapsed,
    thinkingTokens: () => null,
    mcpServerNames: () => names,
    subscribe: () => () => {}
  }
}

function renderLive(
  props: ToolCallMessagePartProps,
  names: readonly string[],
  elapsed: number | null = null
): ReturnType<typeof render> {
  return render(
    <LiveProgressContext.Provider value={liveSource(names, elapsed)}>
      <McpToolCall {...props} />
    </LiveProgressContext.Provider>
  )
}

const slot = (root: ParentNode, name: string): HTMLElement | null =>
  root.querySelector<HTMLElement>(`[data-slot="${name}"]`)

/** 見出しの構造 (data-slot の並び)。推定の印は除く。 */
function structureOf(root: HTMLElement): string[] {
  return Array.from(root.querySelectorAll<HTMLElement>('[data-slot]'))
    .map((el) => el.dataset.slot ?? '')
    .filter((name) => name !== 'mcp-tool-call-inferred')
}

describe('McpToolCall の見出しと中身 (US-1 AC1〜AC5)', () => {
  it('過去ログと実行中で同じ部品・同じ見出しの構造。違うのは推定の印だけ (AC5)', () => {
    const past = render(<McpToolCall {...partProps()} />)
    const pastRoot = slot(past.container, 'aui_mcp-tool-call')!
    expect(slot(pastRoot, 'mcp-tool-call-server')).toHaveTextContent('a')
    expect(slot(pastRoot, 'mcp-tool-call-tool')).toHaveTextContent('b')
    expect(slot(pastRoot, 'mcp-tool-call-inferred')).toHaveTextContent(
      MCP_TOOL_LABELS.serverInferred
    )
    const pastStructure = structureOf(pastRoot)
    past.unmount()

    const live = renderLive(partProps(), ['a'])
    const liveRoot = slot(live.container, 'aui_mcp-tool-call')!
    expect(slot(liveRoot, 'mcp-tool-call-server')).toHaveTextContent('a')
    expect(slot(liveRoot, 'mcp-tool-call-tool')).toHaveTextContent('b')
    expect(slot(liveRoot, 'mcp-tool-call-inferred')).toBeNull()
    expect(structureOf(liveRoot)).toEqual(pastStructure)
  })

  it('見出しにサーバー名と tool 名が分かれて出て、入力の値を見出しに出さない (AC1)', () => {
    const { container } = renderLive(
      partProps({
        toolName: 'mcp__github__create_issue',
        argsText: '{"title":"秘密のタイトル"}'
      }),
      ['github']
    )
    expect(slot(container, 'mcp-tool-call-server')).toHaveTextContent('github')
    expect(slot(container, 'mcp-tool-call-tool')).toHaveTextContent('create_issue')
    expect(slot(container, 'mcp-tool-call-trigger')).not.toHaveTextContent('秘密のタイトル')
  })

  it('入力は閉じた中身 (AC1)', () => {
    const { container } = render(<McpToolCall {...partProps()} />)
    expect(slot(container, 'mcp-tool-call-trigger')).toHaveAttribute('aria-expanded', 'false')
  })

  it('結果は平文で、markdown の強調にならない (AC2)', () => {
    const { container } = render(<McpToolCall {...partProps({ result: '**x** <b>y</b>' })} />)
    const result = slot(container, 'mcp-tool-call-result')!
    expect(result).toHaveTextContent(MCP_TOOL_LABELS.result)
    expect(result.querySelector('pre')).toHaveTextContent('**x** <b>y</b>')
    expect(result.querySelector('strong, b, em')).toBeNull()
  })

  it('エラーの印と切り詰めの印が出る (AC2)', () => {
    const { container } = render(
      <McpToolCall
        {...partProps({ isError: true, result: 'boom', args: { __truncated: true } })}
      />
    )
    expect(slot(container, 'tool-result-error')).toHaveTextContent(TOOL_RESULT_LABELS.failed)
    expect(slot(container, 'tool-result-truncated')).toHaveTextContent(TOOL_RESULT_LABELS.truncated)
  })

  it('resource の tool の見出しにサーバー名と URI の要約が出る (AC3)', () => {
    const { container } = renderLive(
      partProps({
        toolName: 'ReadMcpResourceTool',
        argsText: JSON.stringify({
          server: 'github',
          uri: 'https://u:p@api.github.com/repos/x/readme.md?token=abc#h'
        })
      }),
      []
    )
    expect(slot(container, 'aui_mcp-tool-call')).toHaveAttribute('data-mcp-kind', 'mcp-builtin')
    expect(slot(container, 'mcp-tool-call-server')).toHaveTextContent('github')
    expect(slot(container, 'mcp-tool-call-tool')).toHaveTextContent('ReadMcpResourceTool')
    expect(slot(container, 'mcp-tool-call-uri')).toHaveTextContent(
      'https://api.github.com/…/readme.md'
    )
    const trigger = slot(container, 'mcp-tool-call-trigger')!
    expect(trigger.textContent).not.toMatch(/u:p|token|abc/)
    expect(slot(container, 'mcp-tool-call-inferred')).toBeNull()
  })

  it('mcp__a__b__c は 2 つ以上の前方一致で最長の a__b › c と推定の印 (AC4)', () => {
    const { container } = renderLive(partProps({ toolName: 'mcp__a__b__c' }), ['a', 'a__b'])
    expect(slot(container, 'mcp-tool-call-server')).toHaveTextContent('a__b')
    expect(slot(container, 'mcp-tool-call-tool')).toHaveTextContent(/^c$/)
    expect(slot(container, 'mcp-tool-call-inferred')).not.toBeNull()
  })

  it('分けられない名前 (mcp__x) は全体を 1 つの tool 名として MCP の表示で出す (Edge Cases)', () => {
    const { container } = render(<McpToolCall {...partProps({ toolName: 'mcp__x' })} />)
    expect(slot(container, 'aui_mcp-tool-call')).not.toBeNull()
    expect(slot(container, 'mcp-tool-call-server')).toBeNull()
    expect(slot(container, 'mcp-tool-call-tool')).toHaveTextContent('mcp__x')
  })

  it('vitest-axe の違反 0', async () => {
    const { container } = renderLive(
      partProps({ isError: true, result: 'boom', args: { __truncated: true } }),
      ['a']
    )
    expect((await axe(container, AXE_RULES)).violations).toEqual([])
  })
})

describe('McpToolCall の状態の印は ToolFallback と同じ (US-1 AC9 / data-model §1「状態の印」)', () => {
  const cases: readonly {
    readonly name: string
    readonly status: ToolCallMessagePartStatus
    readonly ctx: Parameters<typeof setToolResultContext>[0]
    readonly result: unknown
    readonly isError: boolean
  }[] = [
    {
      name: '結果待ち',
      status: { type: 'running' },
      ctx: { live: true, runState: 'running' },
      result: undefined,
      isError: false
    },
    {
      name: '承認待ち',
      status: { type: 'requires-action', reason: 'interrupt' },
      ctx: { live: true, runState: 'awaiting_permission' },
      result: undefined,
      isError: false
    },
    {
      name: '結果不明',
      status: { type: 'incomplete', reason: 'cancelled' },
      ctx: { live: false },
      result: undefined,
      isError: false
    },
    {
      name: 'incomplete のエラー',
      status: { type: 'incomplete', reason: 'error', error: 'boom' },
      ctx: { live: false },
      result: 'boom',
      isError: true
    }
  ]

  it.each(cases)('$name: 状態のアイコン・中断の印・経過時間が ToolFallback と同じ', (c) => {
    setToolResultContext(c.ctx)
    const props = partProps({ status: c.status, result: c.result, isError: c.isError })
    const fallback = render(
      <LiveProgressContext.Provider value={liveSource(['a'], 7)}>
        <ToolFallback {...props} toolName="Read" />
      </LiveProgressContext.Provider>
    )
    const fbIcon = slot(fallback.container, 'tool-fallback-trigger-icon')!.outerHTML
    const fbCancelled = slot(fallback.container, 'tool-fallback-trigger-label')!.classList.contains(
      'line-through'
    )
    const fbElapsed = slot(fallback.container, 'tool-result-elapsed')?.textContent ?? null
    const fbError = slot(fallback.container, 'tool-result-error') !== null
    fallback.unmount()

    const mcp = renderLive(props, ['a'], 7)
    expect(slot(mcp.container, 'tool-fallback-trigger-icon')!.outerHTML).toBe(fbIcon)
    expect(
      slot(mcp.container, 'mcp-tool-call-heading')!.classList.contains('line-through')
    ).toBe(fbCancelled)
    expect(slot(mcp.container, 'tool-result-elapsed')?.textContent ?? null).toBe(fbElapsed)
    expect(slot(mcp.container, 'tool-result-error') !== null).toBe(fbError)
  })

  it('結果待ちで経過時間が出る (実行中)', () => {
    setToolResultContext({ live: true, runState: 'running' })
    renderLive(partProps({ status: { type: 'running' }, result: undefined }), ['a'], 12)
    expect(screen.getByText(TOOL_RESULT_LABELS.toolElapsed(12))).toBeInTheDocument()
  })

  it('結果不明は印が出て、経過時間と取り消し線は出ない (US-3 AC1)', () => {
    setToolResultContext({ live: false })
    const { container } = render(<McpToolCall {...partProps({ result: undefined })} />)
    expect(slot(container, 'tool-result-state')).toHaveTextContent(TOOL_RESULT_LABELS.unknown)
    expect(slot(container, 'mcp-tool-call-heading')).not.toHaveClass('line-through')
    expect(slot(container, 'tool-result-elapsed')).toBeNull()
  })

  it('requires-action で中身が開く', () => {
    const { container } = render(
      <McpToolCall
        {...partProps({ status: { type: 'requires-action', reason: 'interrupt' }, result: undefined })}
      />
    )
    expect(slot(container, 'mcp-tool-call-trigger')).toHaveAttribute('aria-expanded', 'true')
  })
})
