import { describe, expect, it } from 'vitest'

import { pathTail } from './path-tail'

/** O-6 FE-020 — 表示用のパスの末尾 (016 data-model §2)。 */
describe('pathTail', () => {
  it('/ と \\ の両方で区切った最後の要素', () => {
    expect(pathTail('/home/u/a.ts')).toBe('a.ts')
    expect(pathTail('C:\\dev\\b.tsx')).toBe('b.tsx')
    expect(pathTail('a.ts')).toBe('a.ts')
    expect(pathTail('//wsl.localhost/Ubuntu/home/u/c.md')).toBe('c.md')
  })

  it('末尾の区切りを除いてから切る', () => {
    expect(pathTail('./bin/')).toBe('bin')
    expect(pathTail('C:\\dev\\proj\\')).toBe('proj')
    expect(pathTail('/a/b//')).toBe('b')
  })

  it('残りが空なら元の文字列', () => {
    expect(pathTail('/')).toBe('/')
    expect(pathTail('\\\\')).toBe('\\\\')
    expect(pathTail('')).toBe('')
  })
})
