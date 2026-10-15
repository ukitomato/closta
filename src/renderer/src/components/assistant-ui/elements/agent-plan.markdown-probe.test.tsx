import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TextMessagePartProvider } from '@assistant-ui/react'

import { MarkdownText } from '@/components/markdown-text'

/**
 * FE-001 (O-6 / research R-06 / plan RK-06) — `TextMessagePartProvider` の中で `MarkdownText` が計画の文字列を描け、
 * `safeUrlTransform` が効くことの確認。FE-023 (Agent plan を markdown で描く) の固定テストへ引き継ぐ。
 */
function renderPlan(plan: string) {
  return render(
    <TextMessagePartProvider text={plan} isRunning={false}>
      <MarkdownText />
    </TextMessagePartProvider>
  )
}

describe('provider の中で MarkdownText が描ける (FE-001)', () => {
  it('見出し・強調・リストを描く', async () => {
    const { container } = renderPlan('# 計画\n\n**重要** な手順\n\n- 一つ目\n- 二つ目')

    expect(await screen.findByText('計画')).toBeInTheDocument()
    expect(container.querySelector('h1')).not.toBeNull()
    expect(container.querySelector('strong')?.textContent).toBe('重要')
    expect(container.querySelectorAll('li')).toHaveLength(2)
  })

  it('ChatScreen の XSS fixture を当てても生 HTML を要素にせず javascript: を除去する', async () => {
    const { container } = renderPlan(
      [
        '[危険リンク](javascript:alert(1))',
        '',
        '<script>window.__pwned=1</script>',
        '',
        '<img src=x onerror="window.__pwned=1">'
      ].join('\n')
    )

    const link = await screen.findByText('危険リンク')
    expect(link.tagName).toBe('A')
    expect(link.getAttribute('href') ?? '').not.toContain('javascript')
    expect(container.querySelector('script')).toBeNull()
    expect(container.querySelector('img')).toBeNull()
    expect((window as unknown as { __pwned?: number }).__pwned).toBeUndefined()
  })

  it('file: / vbscript: / data: のリンクと、リモート画像・svg 画像を描かない', async () => {
    const { container } = renderPlan(
      [
        '[f](file:///etc/passwd)',
        '[v](vbscript:msgbox(1))',
        '[d](data:text/html,<b>x</b>)',
        '![remote](https://example.com/x.png)',
        '![svg](data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=)',
        '[ok](https://example.com/a)'
      ].join('\n\n')
    )

    const ok = await screen.findByText('ok')
    expect(ok.getAttribute('href')).toBe('https://example.com/a')
    for (const label of ['f', 'v', 'd']) {
      const a = screen.queryByText(label)
      const href = a?.getAttribute('href') ?? ''
      expect(href).not.toMatch(/^(file|vbscript|data):/i)
    }
    expect(container.querySelector('img[src^="http"]')).toBeNull()
    expect(container.querySelector('img[src^="data:"]')).toBeNull()
  })
})
