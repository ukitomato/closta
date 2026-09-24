import { describe, expect, it } from 'vitest'

import { safeUrlTransform } from './safe-url'

/**
 * FE-035 — markdown URL allowlist の決定的検査 (FR-020 / contracts C-7 / SC-008)。
 *
 * jsdom で navigation を走らせず、`urlTransform` の返り値そのものを固定する。
 * href の inert (jsdom 実描画) 側は `ChatScreen.test.tsx` (FE-034) が担う。
 */

const asHref = (url: string): string => safeUrlTransform(url, 'href')
const asSrc = (url: string): string => safeUrlTransform(url, 'src')

describe('safeUrlTransform — 危険スキームの除去 (FR-020)', () => {
  it.each([
    'javascript:alert(1)',
    'JavaScript:alert(1)',
    '  javascript:alert(1)',
    '\tjavascript:alert(1)',
    'vbscript:msgbox(1)',
    'file:///etc/passwd',
    'data:text/html,<script>alert(1)</script>',
    'data:application/javascript,alert(1)',
    'chrome://settings'
  ])('%s は href でも空文字に落とす', (url) => {
    expect(asHref(url)).toBe('')
  })

  it.each(['javascript:alert(1)', 'vbscript:x', 'file:///c:/x', 'data:text/html,x'])(
    '%s は src でも空文字に落とす',
    (url) => {
      expect(asSrc(url)).toBe('')
    }
  )
})

describe('safeUrlTransform — a の href (contracts C-7)', () => {
  it.each([
    'https://example.com/a',
    'http://example.com/a',
    '/relative/path',
    './rel',
    '#anchor',
    '?q=1',
    'data:image/png;base64,AAAA',
    'data:image/jpeg;base64,AAAA',
    'data:image/gif;base64,AAAA',
    'data:image/webp;base64,AAAA'
  ])('%s は href で保持する', (url) => {
    expect(asHref(url)).toBe(url)
  })
})

describe('safeUrlTransform — img の src (CSP img-src self data: と一致)', () => {
  it.each(['data:image/png;base64,AAAA', '/local.png', './x.png', 'relative.png'])(
    '%s は src で保持する',
    (url) => {
      expect(asSrc(url)).toBe(url)
    }
  )

  it.each(['https://cdn.example.com/x.png', 'http://cdn.example.com/x.png'])(
    'http(s) リモート画像 %s は src で除外する',
    (url) => {
      expect(asSrc(url)).toBe('')
    }
  )
})

describe('safeUrlTransform — data: は画像 MIME のみ', () => {
  it('data:image/svg+xml は許可しない (script 面が残る)', () => {
    expect(asHref('data:image/svg+xml,<svg onload=alert(1)>')).toBe('')
    expect(asSrc('data:image/svg+xml;base64,AAAA')).toBe('')
  })
})
