import { describe, expect, it } from 'vitest'

import { webFetchHeading } from './web-tool-heading'

/** O-6 FE-021 — WebFetch の見出しは host だけ (016 data-model §2)。 */
describe('webFetchHeading', () => {
  it('http(s) のときだけ host。パス・クエリ・資格情報・フラグメントを出さない', () => {
    expect(webFetchHeading('https://example.com/a/b?token=abc#frag')).toBe('example.com')
    expect(webFetchHeading('http://user:pass@example.com:8080/p')).toBe('example.com:8080')
    expect(webFetchHeading('https://hooks.slack.com/services/T0/B0/XXXX')).toBe('hooks.slack.com')
    expect(webFetchHeading('https://discord.com/api/webhooks/1/abc')).toBe('discord.com')
  })

  it('読めない・http(s) でない・scheme が無い・長すぎる host は「URL」', () => {
    for (const bad of [
      'user:pass@host/p',
      'javascript:alert(1)',
      'data:text/html,<b>x</b>',
      'file:///etc/passwd',
      'not a url',
      '',
      `https://${'a'.repeat(257)}.com/`
    ]) {
      expect(webFetchHeading(bad)).toBe('URL')
    }
  })
})
