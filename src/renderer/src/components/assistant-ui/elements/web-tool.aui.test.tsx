import { fireEvent, render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'

import type { ToolCallMessagePartProps } from '@assistant-ui/react'

import { setToolResultContext } from '@/test-support/tool-result-mock'

import { WebTool } from './web-tool.aui'

vi.mock('@/features/chat/transcript-context', async (importOriginal) =>
  (await import('@/test-support/tool-result-mock')).withToolResultMock(await importOriginal())
)

/** O-6 FE-021 — Web の表示 (016 spec US-2 AC3 / AC4 / AC7)。 */

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

const heading = (root: ParentNode): string => slot(root, 'tool-display-heading')?.textContent ?? ''

function open(root: ParentNode): void {
  fireEvent.click(slot(root, 'tool-display-trigger') as HTMLElement)
}

beforeEach(() => setToolResultContext({}))

describe('WebFetch', () => {
  it('見出しは host だけ。パス・クエリ・資格情報・フラグメントが 0 件', async () => {
    const url = 'https://user:pw@example.com/a/b?q=1&token=zzz#frag'
    const { container } = render(<WebTool {...part('WebFetch', { url, prompt: '要約して' })} />)
    expect(heading(container)).toBe('example.com')
    for (const secret of ['user', 'pw', '/a/b', 'q=1', 'zzz', 'frag']) {
      expect(heading(container)).not.toContain(secret)
    }
    expect(slot(container, 'tool-display-heading')?.closest('a')).toBeNull()
    expect((await axe(container, AXE_RULES)).violations).toEqual([])
  })

  it.each([
    'https://hooks.slack.com/services/T0/B0/XXXX',
    'https://discord.com/api/webhooks/1/abc'
  ])('webhook の形の URL は見出しにも中身にも秘密の要素が出ない: %s', (url) => {
    const { container } = render(
      <WebTool {...part('WebFetch', { url }, { result: 'ok' })} />
    )
    open(container)
    const text = container.textContent ?? ''
    expect(text).not.toContain('XXXX')
    expect(text).not.toContain('/abc')
    expect(slot(container, 'web-tool-url')?.textContent).toContain('•••')
  })

  it.each([
    'user:pass@host/p',
    'javascript:alert(1)',
    'data:text/html,x',
    `https://${'a'.repeat(257)}.example/`
  ])('読めない・http(s) でない・長すぎる host は「URL」: %s', (url) => {
    const { container } = render(<WebTool {...part('WebFetch', { url })} />)
    expect(heading(container)).toBe('URL')
  })

  it('中身: 伏せ字を通した URL・prompt・結果の text。結果は markdown にしない。URL はリンクにしない', () => {
    const { container } = render(
      <WebTool
        {...part(
          'WebFetch',
          { url: 'https://example.com/x?access_token=abc123', prompt: '概要' },
          { result: '**bold** text' }
        )}
      />
    )
    expect(slot(container, 'tool-display-trigger')?.getAttribute('aria-expanded')).toBe('false')
    open(container)
    expect(slot(container, 'web-tool-url')?.textContent).not.toContain('abc123')
    expect(slot(container, 'web-tool-prompt')?.textContent).toContain('概要')
    expect(slot(container, 'tool-display-result-text')?.textContent).toBe('**bold** text')
    expect(container.querySelector('strong, a')).toBeNull()
  })

  it('エラー・空の結果', () => {
    const err = render(<WebTool {...part('WebFetch', { url: 'https://e.com' }, { result: '404', isError: true })} />)
    expect(slot(err.container, 'tool-result-error')).not.toBeNull()
    expect(slot(err.container, 'tool-result-error-text')?.textContent).toBe('404')
    err.unmount()
    const empty = render(<WebTool {...part('WebFetch', { url: 'https://e.com' }, { result: '' })} />)
    open(empty.container)
    expect(slot(empty.container, 'tool-display-empty')).not.toBeNull()
  })
})

describe('WebSearch', () => {
  it('query に伏せ字・ドメインの制限の件数。結果は text のまま', () => {
    const { container } = render(
      <WebTool
        {...part(
          'WebSearch',
          { query: 'docs password=hunter2', allowed_domains: ['a.com'], blocked_domains: ['b.com', 'c.com'] },
          { result: 'Sources:\n- [x](https://x.com)' }
        )}
      />
    )
    expect(heading(container)).not.toContain('hunter2')
    expect(heading(container)).toContain('ドメイン制限 3 件')
    open(container)
    expect(slot(container, 'tool-display-result-text')?.textContent).toContain('Sources:')
    expect(container.querySelector('a')).toBeNull()
  })

  it('入力が読めなければ ToolFallback', () => {
    const { container } = render(<WebTool {...part('WebSearch', {}, { argsText: '[]' })} />)
    expect(slot(container, 'aui_web-tool')).toBeNull()
    expect(slot(container, 'tool-fallback-root')).not.toBeNull()
  })
})
