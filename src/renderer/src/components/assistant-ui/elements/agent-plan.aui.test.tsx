import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'

import type { ToolCallMessagePartProps } from '@assistant-ui/react'

import { setToolResultContext } from '@/test-support/tool-result-mock'

import { AgentPlan } from './agent-plan.aui'

vi.mock('@/features/chat/transcript-context', async (importOriginal) =>
  (await import('@/test-support/tool-result-mock')).withToolResultMock(await importOriginal())
)

/** O-6 FE-023 — Agent plan を markdown で描く (016 spec US-2 AC6 / SC-002。data-model §2「Agent plan」)。 */

const AXE_RULES = { rules: { 'color-contrast': { enabled: false } } }

function part(plan: string, over: Partial<ToolCallMessagePartProps> = {}): ToolCallMessagePartProps {
  const args = { plan }
  return {
    type: 'tool-call',
    toolCallId: 'toolu_1',
    toolName: 'ExitPlanMode',
    args,
    argsText: JSON.stringify(args),
    result: 'approved',
    isError: false,
    status: { type: 'complete' },
    addResult: () => {},
    resume: () => {},
    ...over
  } as unknown as ToolCallMessagePartProps
}

const slot = (root: ParentNode, name: string): HTMLElement | null =>
  root.querySelector<HTMLElement>(`[data-slot="${name}"]`)

beforeEach(() => setToolResultContext({}))

describe('Agent plan の markdown', () => {
  it('見出し・強調・リストを描く', async () => {
    const { container } = render(<AgentPlan {...part('# 概要\n\n**重要** な手順\n\n- 一\n- 二')} />)
    expect(await screen.findByRole('heading', { name: '概要' })).toBeInTheDocument()
    expect(container.querySelector('h1')).not.toBeNull()
    expect(container.querySelector('strong')?.textContent).toBe('重要')
    expect(container.querySelectorAll('li')).toHaveLength(2)
    expect((await axe(container, AXE_RULES)).violations).toEqual([])
  })

  it('XSS の fixture: 生 HTML を要素にせず javascript: を除去し、リモート画像・svg を描かない', async () => {
    const { container } = render(
      <AgentPlan
        {...part(
          [
            '[危険](javascript:alert(1))',
            '<script>window.__pwned=1</script>',
            '<img src=x onerror="window.__pwned=1">',
            '[f](file:///etc/passwd)',
            '[v](vbscript:msgbox(1))',
            '[d](data:text/html,<b>x</b>)',
            '![remote](https://example.com/x.png)',
            '![svg](data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=)',
            '[ok](https://example.com/a)',
            '[rel](./docs/a.md)'
          ].join('\n\n')
        )}
      />
    )
    const ok = await screen.findByText('ok')
    expect(ok.getAttribute('href')).toBe('https://example.com/a')
    expect(screen.getByText('rel').getAttribute('href')).toBe('./docs/a.md')
    expect(container.querySelector('script')).toBeNull()
    expect(container.querySelector('img[src^="http"], img[src^="data:"]')).toBeNull()
    expect((window as unknown as { __pwned?: number }).__pwned).toBeUndefined()
    for (const a of Array.from(container.querySelectorAll('a'))) {
      expect(a.getAttribute('href') ?? '').not.toMatch(/^(javascript|file|vbscript|data):/i)
    }
  })

  it('コメント・生 HTML があると印が出て、「原文」で見える', async () => {
    const { container } = render(<AgentPlan {...part('手順\n\n<!-- hidden -->\n\n<div>x</div>')} />)
    await waitFor(() => expect(container.querySelector('.aui-md-p')).not.toBeNull(), { timeout: 5000 })
    expect(slot(container, 'agent-plan-hidden-mark')?.textContent).toBe(
      '表示されない部分があります。原文で確かめてください'
    )
    const toggle = slot(container, 'agent-plan-raw-toggle') as HTMLElement
    expect(toggle.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-pressed')).toBe('true')
    expect(slot(container, 'agent-plan-raw')?.textContent).toContain('<!-- hidden -->')
    expect(slot(container, 'agent-plan-markdown')).toBeNull()
  })

  it('生 HTML が無ければ印は出ない', async () => {
    const { container } = render(<AgentPlan {...part('手順 a < b')} />)
    await screen.findByText(/手順/)
    expect(slot(container, 'agent-plan-hidden-mark')).toBeNull()
  })

  it('入力が読めなければ ToolFallback。エラーの結果は印と本文', () => {
    const bad = render(<AgentPlan {...part('x', { argsText: '{broken' })} />)
    expect(slot(bad.container, 'tool-fallback-root')).not.toBeNull()
    bad.unmount()
    const err = render(<AgentPlan {...part('x', { result: 'rejected', isError: true })} />)
    expect(slot(err.container, 'tool-result-error')).not.toBeNull()
    expect(slot(err.container, 'tool-result-error-text')?.textContent).toBe('rejected')
  })
})

/* ── 固定テスト: markdown の描画口を増やさない ─────────────────────────── */

// renderer の src のテスト以外のソース (キーは本ファイルからの相対パス。`../../../` が src/renderer/src)。
const SOURCES = import.meta.glob<string>('../../../**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true
})

function importers(pattern: RegExp): string[] {
  return Object.entries(SOURCES)
    .filter(([key, source]) => !/\.test\.(ts|tsx)$/.test(key) && pattern.test(source))
    .map(([key]) => key.split('/').pop() ?? key)
    .sort()
}

describe('markdown の描画口 (固定テスト)', () => {
  it('@assistant-ui/react-markdown の import は markdown-text.tsx だけ', () => {
    expect(importers(/from\s+['"]@assistant-ui\/react-markdown['"]/)).toEqual([
      'markdown-text.tsx'
    ])
  })

  it('TextMessagePartProvider は markdown-body.tsx だけが import する (O-11 FE-030)', () => {
    expect(
      importers(
        /import\s*\{[^}]*\bTextMessagePartProvider\b[^}]*\}\s*from\s*['"]@assistant-ui\/react['"]/
      )
    ).toEqual(['markdown-body.tsx'])
  })
})
