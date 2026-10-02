import { describe, expect, it } from 'vitest'

import { decideNavigation } from './navigation-policy'

/**
 * X-5 / design-gate R3-H-02 の負例 (pr-gate R1 security M-001)。`will-navigate` が「許可 origin なら通す」形に
 * 戻ると、会話由来 markdown の相対リンク 1 クリックで文書が入れ替わり、全セッションが止まる。
 */

const ORIGINS = ['app://closta', 'http://localhost:5173']

describe('decideNavigation', () => {
  it('同一 origin の遷移 (相対リンクの解決後) も拒否し、外部ブラウザにも渡さない', () => {
    expect(decideNavigation('app://closta/index.html#x', ORIGINS)).toEqual({
      prevent: true,
      openExternal: false
    })
    expect(decideNavigation('http://localhost:5173/other', ORIGINS)).toEqual({
      prevent: true,
      openExternal: false
    })
  })

  it('配信元の外の http(s) は拒否したうえで OS の既定ブラウザへ委譲する', () => {
    expect(decideNavigation('https://example.com/docs', ORIGINS)).toEqual({
      prevent: true,
      openExternal: true
    })
  })

  it('file: / カスタム scheme / 解釈できない URL は拒否し、委譲もしない', () => {
    for (const url of [
      'file:///C:/Windows/System32/calc.exe',
      'smb://host/share',
      'vscode://x',
      'not a url'
    ]) {
      expect(decideNavigation(url, ORIGINS)).toEqual({ prevent: true, openExternal: false })
    }
  })
})
