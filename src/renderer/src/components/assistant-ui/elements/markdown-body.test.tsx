import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { axe } from 'vitest-axe'

import { MarkdownBody } from './markdown-body'

/** O-11 FE-030 — markdown の本文の共有の部品 (data-model §3.3 / §5)。 */

const AXE_RULES = { rules: { 'color-contrast': { enabled: false } } }

describe('MarkdownBody', () => {
  it('見出し・強調・リストを描く (axe 違反 0)', async () => {
    const { container } = render(<MarkdownBody text={'# 概要\n\n**重要** な手順\n\n- 一\n- 二'} />)
    expect(await screen.findByRole('heading', { name: '概要' })).toBeInTheDocument()
    expect(container.querySelector('strong')?.textContent).toBe('重要')
    expect(container.querySelectorAll('li')).toHaveLength(2)
    expect((await axe(container, AXE_RULES)).violations).toEqual([])
  })

  it('XSS の fixture: 生 HTML を要素にせず javascript: を除去し、リモート画像・svg を描かない', async () => {
    const { container } = render(
      <MarkdownBody
        text={[
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
        ].join('\n\n')}
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
})
