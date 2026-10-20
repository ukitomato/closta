import { describe, expect, it } from 'vitest'

import type { HostPath } from '@domain/runtime/path-types'

import { createWin32ClaudeLocator } from './win32-claude'

/** 偽のファイルシステムで locator を回す (X-8 BE-020 / data-model §2 / SC-002)。 */
function setup(options: {
  files?: readonly string[]
  env?: Record<string, string | undefined>
  override?: string | null
}): { locate: ReturnType<typeof createWin32ClaudeLocator>; calls: string[] } {
  const files = new Set((options.files ?? []).map((f) => f.toLowerCase()))
  const calls: string[] = []
  const locate = createWin32ClaudeLocator({
    isFile: async (path: HostPath) => {
      calls.push(path.value)
      return files.has(path.value.toLowerCase())
    },
    env: () => options.env ?? {},
    override: async () => options.override ?? null
  })
  return { locate, calls }
}

const KNOWN = 'C:\\Users\\u\\.local\\bin\\claude.exe'
const ENV = { USERPROFILE: 'C:\\Users\\u', PATH: '' }

describe('createWin32ClaudeLocator', () => {
  it('既知の場所で found', async () => {
    const { locate } = setup({ files: [KNOWN], env: ENV })
    const r = await locate()
    expect(r.status).toBe('found')
    if (r.status === 'found') {
      expect(r.path.value).toBe(KNOWN)
      expect(r.overridden).toBe(false)
    }
  })

  it('PATH の 2 つ目の要素で found', async () => {
    const { locate } = setup({
      files: ['D:\\b\\claude.exe'],
      env: { ...ENV, PATH: 'C:\\a;D:\\b' }
    })
    const r = await locate()
    expect(r.status).toBe('found')
    if (r.status === 'found') expect(r.path.value).toBe('D:\\b\\claude.exe')
  })

  it('先の要素の shim より後の要素の .exe を採る', async () => {
    const { locate } = setup({
      files: ['C:\\a\\claude.cmd', 'D:\\b\\claude.exe'],
      env: { ...ENV, PATH: 'C:\\a;D:\\b' }
    })
    expect((await locate()).status).toBe('found')
  })

  it.each(['claude.cmd', 'claude.bat', 'claude.ps1'])('%s だけで shim-only', async (name) => {
    const { locate } = setup({ files: [`C:\\a\\${name}`], env: { ...ENV, PATH: 'C:\\a' } })
    expect(await locate()).toEqual({ status: 'shim-only', overridden: false })
  })

  it('何も無くて not-found', async () => {
    const { locate } = setup({ env: { ...ENV, PATH: 'C:\\a' } })
    expect(await locate()).toEqual({ status: 'not-found', overridden: false })
  })

  it('上書きが exe で在れば found (overridden)', async () => {
    const path = 'E:\\tools\\claude.exe'
    const { locate } = setup({ files: [path], env: ENV, override: path })
    const r = await locate()
    expect(r.status).toBe('found')
    if (r.status === 'found') expect(r.overridden).toBe(true)
  })

  it.each([
    ['在らない', 'E:\\tools\\claude.exe', []],
    ['.cmd', 'E:\\tools\\claude.cmd', ['E:\\tools\\claude.cmd']],
    ['UNC (wsl$)', '\\\\wsl$\\Ubuntu\\usr\\bin\\claude', ['\\\\wsl$\\Ubuntu\\usr\\bin\\claude']],
    ['相対', 'claude.exe', []]
  ])('上書きが %s で override-invalid、既知の場所と PATH を見ない', async (_n, override, files) => {
    const { locate, calls } = setup({
      files: [...files, KNOWN, 'C:\\a\\claude.exe'],
      env: { ...ENV, PATH: 'C:\\a' },
      override
    })
    expect(await locate()).toEqual({ status: 'override-invalid', overridden: true })
    expect(calls.every((c) => c.toLowerCase() === override.toLowerCase())).toBe(true)
  })

  it('USERPROFILE が無い・相対でも PATH を見る', async () => {
    for (const profile of [undefined, 'Users\\u']) {
      const { locate } = setup({
        files: ['C:\\a\\claude.exe'],
        env: { USERPROFILE: profile, PATH: 'C:\\a' }
      })
      expect((await locate()).status).toBe('found')
    }
  })

  it('PATH の空・引用符・UNC・相対の要素を扱う', async () => {
    const { locate, calls } = setup({
      files: ['C:\\q r\\claude.exe'],
      env: { ...ENV, PATH: ';;  ;rel;\\\\srv\\share;" C:\\q r "' }
    })
    const r = await locate()
    expect(r.status).toBe('found')
    expect(calls.some((c) => c.startsWith('\\\\') || c.startsWith('rel'))).toBe(false)
  })

  it('65 個目以降の要素を見ず、isFile は最大 258 回', async () => {
    const dirs = Array.from({ length: 70 }, (_v, i) => `C:\\d${i}`)
    const { locate, calls } = setup({
      files: ['C:\\d64\\claude.exe'],
      env: { USERPROFILE: 'C:\\Users\\u', PATH: dirs.join(';') }
    })
    expect(await locate()).toEqual({ status: 'not-found', overridden: false })
    expect(calls.length).toBeLessThanOrEqual(258)
    expect(calls.some((c) => c.startsWith('C:\\d64\\'))).toBe(false)
    expect(calls.some((c) => c.startsWith('C:\\d63\\'))).toBe(true)
  })
})
