import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'

import { makeHostPath, type HostPath } from '@domain/runtime/path-types'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createRuntimeSettingsStore } from './runtime-settings-store'

/** ランタイムの設定の store (X-8 BE-021 / data-model §3)。launch-usage-store.test.ts と同じ構え。 */

const TEMP_ROOT = 'tests/.tmp'
let dir: HostPath

beforeEach(async () => {
  await mkdir(TEMP_ROOT, { recursive: true })
  const raw = await mkdtemp(`${TEMP_ROOT}/runtime-settings-`)
  const absolute = makeHostPath(`${process.cwd()}\\${raw.split('/').join('\\')}`)
  if (!absolute.ok) throw new Error('一時ディレクトリのパスを解釈できない')
  dir = absolute.path
})

afterEach(async () => {
  await rm(dir.value, { recursive: true, force: true })
})

const STAMP = 1_700_000_000_000
const now = (): number => STAMP
const file = (): string => `${dir.value}\\runtime-settings.json`
const CLAUDE = 'C:\\Users\\u\\.local\\bin\\claude.exe'

async function writeRaw(raw: string): Promise<void> {
  await writeFile(file(), raw, 'utf8')
}
const names = (): Promise<string[]> => readdir(dir.value)
const hasBak = async (): Promise<boolean> => (await names()).some((n) => n.endsWith('.bak'))

describe('runtime-settings-store load', () => {
  it('ENOENT は指定なし', async () => {
    const r = await createRuntimeSettingsStore(dir, now).load()
    expect(r).toEqual({ kind: 'loaded', win32ClaudePath: null, reasonKeys: [] })
  })

  it.each([
    ['JSON でない', 'not json'],
    ['最上位が配列', '[]'],
    ['版が欠ける', '{"win32ClaudePath":null}'],
    ['版が 0', '{"schemaVersion":0,"win32ClaudePath":null}'],
    ['版が文字列', '{"schemaVersion":"1","win32ClaudePath":null}'],
    ['パスが数', '{"schemaVersion":1,"win32ClaudePath":5}'],
    ['パスが長すぎ', `{"schemaVersion":1,"win32ClaudePath":"${'a'.repeat(5000)}"}`],
    ['パスに制御文字', '{"schemaVersion":1,"win32ClaudePath":"C:\\\\a\\u0001"}']
  ])('%s は退避して指定なし (parse-failed)', async (_n, raw) => {
    await writeRaw(raw)
    const r = await createRuntimeSettingsStore(dir, now).load()
    expect(r).toEqual({ kind: 'loaded', win32ClaudePath: null, reasonKeys: ['parse-failed'] })
    expect(await hasBak()).toBe(true)
  })

  it('将来版は退避して newer-version', async () => {
    await writeRaw('{"schemaVersion":2,"win32ClaudePath":null}')
    const r = await createRuntimeSettingsStore(dir, now).load()
    expect(r).toEqual({ kind: 'newer-version' })
    expect(await hasBak()).toBe(true)
  })

  it('ENOENT 以外の読み込みの失敗は退避しない', async () => {
    const store = createRuntimeSettingsStore(dir, now, {
      readFile: async (path) => {
        throw Object.assign(new Error(`busy ${path}`), { code: 'EBUSY' })
      }
    })
    const r = await store.load()
    expect(r).toEqual({ kind: 'read-failed', reasonKey: 'read-failed', errorCode: 'EBUSY' })
    expect(JSON.stringify(r)).not.toContain('runtime-settings')
    expect(await hasBak()).toBe(false)
  })
})

describe('runtime-settings-store save', () => {
  it('保存して読み戻せる。中身のキーは 2 つだけ', async () => {
    const store = createRuntimeSettingsStore(dir, now)
    await store.saveWin32ClaudePath(CLAUDE)
    expect(await store.load()).toEqual({
      kind: 'loaded',
      win32ClaudePath: CLAUDE,
      reasonKeys: []
    })
    const json = JSON.parse(await readFile(file(), 'utf8')) as Record<string, unknown>
    expect(Object.keys(json).sort()).toEqual(['schemaVersion', 'win32ClaudePath'])
    expect((await names()).filter((n) => n.endsWith('.tmp'))).toEqual([])
  })

  it('null を保存すると指定なしに戻る', async () => {
    const store = createRuntimeSettingsStore(dir, now)
    await store.saveWin32ClaudePath(CLAUDE)
    await store.saveWin32ClaudePath(null)
    expect(await store.load()).toEqual({ kind: 'loaded', win32ClaudePath: null, reasonKeys: [] })
  })

  it('将来版のファイルは上書きせず throw する', async () => {
    const raw = '{"schemaVersion":2,"win32ClaudePath":null,"future":true}'
    await writeRaw(raw)
    const store = createRuntimeSettingsStore(dir, now)
    await expect(store.saveWin32ClaudePath(CLAUDE)).rejects.toThrow()
    await expect(store.saveWin32ClaudePath(null)).rejects.toThrow()
    expect(await readFile(file(), 'utf8')).toBe(raw)
  })

  it('壊れたファイルは保存で置き換わる', async () => {
    await writeRaw('not json')
    const store = createRuntimeSettingsStore(dir, now)
    await store.saveWin32ClaudePath(CLAUDE)
    expect((await store.load()).kind).toBe('loaded')
  })

  it('書き込みの失敗は throw し一時ファイルを残さない', async () => {
    const store = createRuntimeSettingsStore(dir, now, {
      rename: async () => {
        throw Object.assign(new Error('EPERM'), { code: 'EPERM' })
      }
    })
    await expect(store.saveWin32ClaudePath(CLAUDE)).rejects.toThrow()
    expect((await names()).filter((n) => n.endsWith('.tmp'))).toEqual([])
  })
})
