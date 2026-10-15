import { describe, expect, it } from 'vitest'

import { looksLikeSecret } from '../provider/secret-scan'
import { redactSecrets } from './secret-redaction'

describe('redactSecrets (016 data-model §1)', () => {
  const MASK = '•••'

  const redacted: ReadonlyArray<readonly [string, string]> = [
    ['{"api_key":"abc123def"}', 'abc123def'],
    ["'password': 'hunter2'", 'hunter2'],
    ['GITHUB_TOKEN=abc', 'abc'],
    ['AWS_SECRET_ACCESS_KEY=abc', 'abc'],
    ['run --password hunter2 now', 'hunter2'],
    ['mysql -u root -phunter2', 'hunter2'],
    ['key sk_live_abcdefghijklmnop1234', 'abcdefghijklmnop1234'],
    ['npm_abcdefghijklmnop1234', 'abcdefghijklmnop1234'],
    [
      '-----BEGIN RSA PRIVATE KEY-----\nMIIBOgIBAAJBAK\n-----END RSA PRIVATE KEY-----',
      'MIIBOgIBAAJBAK'
    ],
    ['Cookie: sid=abcdef123456', 'abcdef123456'],
    ['https://u:p@h/x', 'u:p'],
    ['https://h/x?access_token=zzz999&a=1', 'zzz999'],
    ['https://hooks.slack.com/services/T0/B0/XXXX', 'T0/B0/XXXX'],
    ['https://example.com/api/webhooks/1/abc', '1/abc']
  ]

  it.each(redacted)('伏せる: %s', (input, secret) => {
    const out = redactSecrets(input)
    expect(out).toContain(MASK)
    expect(out).not.toContain(secret)
  })

  const unchanged = [
    'task-runner',
    'disk-usage',
    'risk-free',
    'Basic usage',
    'find . -path ./x -prune',
    'gcc -pthread',
    'max_tokens: 4096',
    'monkey=1',
    '普通の文 (括弧) と "引用符" を含む'
  ]

  it.each(unchanged)('変えない: %s', (input) => {
    expect(redactSecrets(input)).toBe(input)
  })

  it('伏せすぎを受け入れる', () => {
    expect(redactSecrets('password: is required')).toBe(`password: ${MASK} required`)
    expect(redactSecrets('PWD=/home/u')).toBe(`PWD=${MASK}`)
  })

  it('Bearer / Basic / 既知のトークン / 周りの文を残す', () => {
    expect(redactSecrets('Bearer abcdefgh12345678')).toBe(`Bearer ${MASK}`)
    expect(redactSecrets('Basic dXNlcjpwYXNz1')).toBe(`Basic ${MASK}`)
    expect(redactSecrets('see AKIAABCDEFGHIJKLMNOP ok')).toBe(`see ${MASK} ok`)
    expect(redactSecrets('jwt eyJhbGciOiJIUzI1.eyJzdWIiOiIxMjM0.sig_abc')).toBe(`jwt ${MASK}`)
    expect(redactSecrets('x ?token=abc y')).toBe(`x ?token=${MASK} y`)
  })

  it('M-001: `-` / `_` の直後の既知のトークンも伏せる', () => {
    for (const input of [
      'foo-sk-abcdefghijklmnop1234',
      'x_ghp_abcdefghijklmnopqrstuv',
      'foo-AKIAABCDEFGHIJKLMNOP',
      'a_npm_abcdefghijklmnop1234'
    ]) {
      const out = redactSecrets(input)
      expect(out).toContain(MASK)
      expect(out).not.toMatch(/abcdefghijklmnop|ABCDEFGHIJKLMNOP/)
    }
  })

  it('M-002: `-` / `_` の直後の JWT も伏せ、英数字の直後は伏せない', () => {
    const jwt = 'eyJhbGciOiJIUzI1.eyJzdWIiOiIxMjM0.sig_abc'
    expect(redactSecrets(`foo-${jwt}`)).toBe(`foo-${MASK}`)
    expect(redactSecrets(`x_${jwt}`)).toBe(`x_${MASK}`)
    expect(redactSecrets(`a ${jwt} b`)).toBe(`a ${MASK} b`)
    expect(redactSecrets(`ab${jwt}`)).toBe(`ab${jwt}`)
  })

  it('空文字と伏せる対象の無い文字列は同じ文字列', () => {
    expect(redactSecrets('')).toBe('')
    expect(redactSecrets('hello world')).toBe('hello world')
  })

  it('secret-scan の接頭辞の集合を含む (正本の固定)', () => {
    const samples = [
      'sk-abcdefghijklmnopqrstuv',
      'AIzaabcdefghijklmnopqrstuv',
      'ghp_abcdefghijklmnopqrstuv',
      'glpat-abcdefghijklmnopqrstuv',
      'xoxb-1234567890abc',
      'AKIAABCDEFGHIJKLMNOP',
      'ASIAABCDEFGHIJKLMNOP',
      'Bearer abcdefghijklmnopqrstuv',
      '-----BEGIN PRIVATE KEY-----'
    ]
    for (const sample of samples) {
      expect(looksLikeSecret(sample)).toBe(true)
      expect(redactSecrets(sample)).toContain(MASK)
    }
  })

  it('計算量: 4 KB の敵対的な入力が 50 ms 以内', () => {
    const inputs = [
      `a://${'a'.repeat(4_000)}`,
      'token'.repeat(800),
      'mysql '.repeat(680),
      `Authorization: ${'a '.repeat(2_000)}`,
      'Bearer '.repeat(580)
    ]
    for (const input of inputs) {
      const start = performance.now()
      redactSecrets(input)
      expect(performance.now() - start).toBeLessThan(50)
    }
  })

  it('計算量: 200 KB の敵対的な入力が 500 ms 以内', () => {
    const inputs = [
      `eyJ${'-'.repeat(200_000)}`,
      '-eyJaaaaaaaa'.repeat(16_000),
      `x${'_-'.repeat(100_000)}`,
      'mysql '.repeat(33_000),
      `mysql ${'a '.repeat(100_000)}`,
      'token'.repeat(40_000),
      'Bearer '.repeat(28_000)
    ]
    for (const input of inputs) {
      const start = performance.now()
      redactSecrets(input)
      expect(performance.now() - start).toBeLessThan(500)
    }
  })
})
