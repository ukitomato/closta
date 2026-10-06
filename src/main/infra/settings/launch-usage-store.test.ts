import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'

import { makeHostPath, type HostPath } from '@domain/runtime/path-types'
import {
  parseLocalDayKey,
  type LaunchDayCounts,
  type LaunchUsage,
  type LocalDayKey
} from '@domain/session/launch-usage'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createLaunchUsageStore } from './launch-usage-store'

/**
 * 起動の利用記録の store (O-3 BE-041 / spec FR-011・FR-012 / SC-005 / 012 data-model §4「読み込みの結果」)。
 * preset-store.test.ts と同じく `os.tmpdir()` は使わずリポジトリ配下の一時ディレクトリを使い
 * (Principle II の許可外で `os` を import しない)、失敗の経路は fs の操作を差し替えて起こす。
 */

const TEMP_ROOT = 'tests/.tmp'
let dir: HostPath

beforeEach(async () => {
  await mkdir(TEMP_ROOT, { recursive: true })
  const raw = await mkdtemp(`${TEMP_ROOT}/launch-usage-`)
  const absolute = makeHostPath(`${process.cwd()}\\${raw.split('/').join('\\')}`)
  if (!absolute.ok) throw new Error('一時ディレクトリのパスを解釈できない')
  dir = absolute.path
})

afterEach(async () => {
  await rm(dir.value, { recursive: true, force: true })
})

/** 退避ファイル名に使う固定時刻 (注入)。 */
const STAMP = 1_700_000_000_000
const now = (): number => STAMP

const file = (): string => `${dir.value}\\launch-usage.json`
const bakFile = (): string => `${dir.value}\\launch-usage.json.${STAMP}.bak`

async function writeRaw(raw: string): Promise<void> {
  await mkdir(dir.value, { recursive: true })
  await writeFile(file(), raw, 'utf8')
}

async function names(): Promise<string[]> {
  return readdir(dir.value)
}

function key(value: string): LocalDayKey {
  const parsed = parseLocalDayKey(value)
  if (parsed === null) throw new Error(`bad day ${value}`)
  return parsed
}

function usageOf(entries: Record<string, LaunchDayCounts>): LaunchUsage {
  return { days: new Map(Object.entries(entries).map(([k, v]) => [key(k), v])) }
}

/** 退避の書き込みだけを失敗させる fs (一時ファイルの書き込みは通す)。 */
function failingBackup(code = 'ENOSPC'): {
  writeFile: (path: string, data: string, encoding: 'utf8') => Promise<void>
} {
  return {
    writeFile: async (path, data, encoding) => {
      if (path.endsWith('.bak')) throw Object.assign(new Error(`disk full ${path}`), { code })
      await writeFile(path, data, encoding)
    }
  }
}

/** JSON の中に現れるキーをすべて集める (日付の鍵は 1 つの印にまとめる)。 */
function keysOf(value: unknown, into = new Set<string>()): Set<string> {
  if (typeof value !== 'object' || value === null) return into
  for (const [k, child] of Object.entries(value)) {
    into.add(parseLocalDayKey(k) === null ? k : '<day>')
    keysOf(child, into)
  }
  return into
}

describe('createLaunchUsageStore — 読み込みの結果 (data-model §4 の表)', () => {
  it('save → load でラウンドトリップする', async () => {
    const store = createLaunchUsageStore(dir, now)
    const usage = usageOf({
      '2026-10-03': { preset: 1, manual: 2 },
      '2026-10-04': { preset: 3, manual: 0 }
    })
    await store.save(usage)
    expect(await store.load()).toEqual({ kind: 'loaded', usage, reasonKeys: [], skippedDays: 0 })
  })

  it('未作成 (ENOENT) は空で、退避しない', async () => {
    const result = await createLaunchUsageStore(dir, now).load()
    expect(result).toEqual({
      kind: 'loaded',
      usage: { days: new Map() },
      reasonKeys: [],
      skippedDays: 0
    })
    expect(await names()).toEqual([])
  })

  it.each([
    ['parse の失敗', '{ this is not json'],
    ['最上位が配列', JSON.stringify([{ schemaVersion: 1, days: {} }])],
    ['最上位が数値', '1'],
    ['最上位が null', 'null'],
    ['days が無い', JSON.stringify({ schemaVersion: 1 })],
    ['days が配列', JSON.stringify({ schemaVersion: 1, days: [] })],
    ['days が文字列', JSON.stringify({ schemaVersion: 1, days: '2026-10-04' })],
    ['版が欠けている', JSON.stringify({ days: { '2026-10-04': { preset: 1, manual: 0 } } })],
    ['版が文字列', JSON.stringify({ schemaVersion: '1', days: {} })],
    ['版が 0', JSON.stringify({ schemaVersion: 0, days: {} })],
    ['版が負', JSON.stringify({ schemaVersion: -1, days: {} })]
  ])('最上位の形の崩れは退避して空から始める (%s)', async (_label, raw) => {
    await writeRaw(raw)
    const result = await createLaunchUsageStore(dir, now).load()
    expect(result).toEqual({
      kind: 'loaded',
      usage: { days: new Map() },
      reasonKeys: ['parse-failed'],
      skippedDays: 0
    })
    expect(await readFile(bakFile(), 'utf8')).toBe(raw)
  })

  it('日単位の不正はその日だけ飛ばして残りを読み、退避する', async () => {
    const raw = JSON.stringify({
      schemaVersion: 1,
      days: {
        '2026-10-01': { preset: 1, manual: 1 },
        '2026-13-45': { preset: 9, manual: 9 }, // 暦日でない
        '2026-10-02': { preset: 1, manual: 0, sessionId: 'x' }, // 値のキーが外
        '2026-10-03': { preset: -1, manual: 0 }, // 回数が不正
        '2026-10-04': { preset: 2, manual: 3 }
      }
    })
    await writeRaw(raw)
    const result = await createLaunchUsageStore(dir, now).load()
    expect(result).toEqual({
      kind: 'loaded',
      usage: usageOf({
        '2026-10-01': { preset: 1, manual: 1 },
        '2026-10-04': { preset: 2, manual: 3 }
      }),
      reasonKeys: ['invalid-day'],
      skippedDays: 3
    })
    expect(await readFile(bakFile(), 'utf8')).toBe(raw)
  })

  it('将来版は退避して newer-version を返し、原文を書き換えない', async () => {
    const future = JSON.stringify({ schemaVersion: 2, days: {}, perPreset: { a: 1 } })
    await writeRaw(future)
    const result = await createLaunchUsageStore(dir, now).load()
    expect(result).toEqual({ kind: 'newer-version' })
    expect(await readFile(bakFile(), 'utf8')).toBe(future)
    expect(await readFile(file(), 'utf8')).toBe(future)
  })

  it('読めない (ENOENT 以外) は read-failed を返し、errno のコードだけを持つ。退避しない', async () => {
    await writeRaw(JSON.stringify({ schemaVersion: 1, days: {} }))
    const busy = Object.assign(new Error(`EBUSY: resource busy, open '${file()}'`), {
      code: 'EBUSY'
    })
    const store = createLaunchUsageStore(dir, now, { readFile: () => Promise.reject(busy) })
    expect(await store.load()).toEqual({
      kind: 'read-failed',
      reasonKey: 'read-failed',
      errorCode: 'EBUSY'
    })
    expect(await names()).toEqual(['launch-usage.json'])
  })

  it('対象がディレクトリ (EISDIR) でも空として扱わない', async () => {
    await mkdir(file(), { recursive: true })
    const result = await createLaunchUsageStore(dir, now).load()
    expect(result).toMatchObject({ kind: 'read-failed', reasonKey: 'read-failed' })
  })

  it.each([
    ['最上位の形の崩れ', '{ broken'],
    [
      '日単位の不正',
      JSON.stringify({ schemaVersion: 1, days: { 'x-y-z': { preset: 1, manual: 1 } } })
    ],
    ['将来版', JSON.stringify({ schemaVersion: 3, days: {} })]
  ])('退避の書き込みに失敗したら読み込みを失敗として扱い、原文を残す (%s)', async (_label, raw) => {
    await writeRaw(raw)
    const result = await createLaunchUsageStore(dir, now, failingBackup()).load()
    expect(result).toEqual({
      kind: 'read-failed',
      reasonKey: 'backup-failed',
      errorCode: 'ENOSPC'
    })
    expect(await readFile(file(), 'utf8')).toBe(raw)
    expect((await names()).filter((n) => n.endsWith('.bak'))).toEqual([])
  })
})

describe('createLaunchUsageStore — 書き込み', () => {
  it('書いたファイルのキーは版・日付・2 つの回数だけ (SC-005)', async () => {
    const smuggled = {
      preset: 1,
      manual: 0,
      presetName: '業務用',
      sessionId: '11111111-1111-4111-8111-111111111111'
    } as unknown as LaunchDayCounts
    const store = createLaunchUsageStore(dir, now)
    await store.save({ days: new Map([[key('2026-10-04'), smuggled]]) })
    const written = JSON.parse(await readFile(file(), 'utf8')) as unknown
    expect([...keysOf(written)].sort()).toEqual([
      '<day>',
      'days',
      'manual',
      'preset',
      'schemaVersion'
    ])
    expect(written).toEqual({ schemaVersion: 1, days: { '2026-10-04': { preset: 1, manual: 0 } } })
  })

  it('一時ファイルを残さない', async () => {
    const store = createLaunchUsageStore(dir, now)
    await store.save(usageOf({ '2026-10-04': { preset: 1, manual: 0 } }))
    await store.save(usageOf({ '2026-10-04': { preset: 2, manual: 0 } }))
    expect(await names()).toEqual(['launch-usage.json'])
    const loadedBack = await store.load()
    expect(loadedBack.kind === 'loaded' && loadedBack.usage.days.get(key('2026-10-04'))).toEqual({
      preset: 2,
      manual: 0
    })
  })

  it('rename が失敗したら一時ファイルを消してから失敗を返す', async () => {
    const failure = Object.assign(new Error('rename failed'), { code: 'EPERM' })
    const store = createLaunchUsageStore(dir, now, { rename: () => Promise.reject(failure) })
    await expect(store.save(usageOf({ '2026-10-04': { preset: 1, manual: 0 } }))).rejects.toBe(
      failure
    )
    expect(await names()).toEqual([])
  })

  it('一時ファイルの書き込みが途中で失敗しても一時ファイルを消して元のエラーを返す', async () => {
    const failure = Object.assign(new Error('disk full'), { code: 'ENOSPC' })
    const store = createLaunchUsageStore(dir, now, {
      rename: () => Promise.reject(new Error('rename は呼ばれない')),
      writeFile: async (path, data) => {
        await writeFile(path, data.slice(0, 5), 'utf8')
        throw failure
      }
    })
    await expect(store.save(usageOf({ '2026-10-04': { preset: 1, manual: 0 } }))).rejects.toBe(
      failure
    )
    expect(await names()).toEqual([])
  })

  it('後始末 (rm) が失敗しても元のエラーを隠さない', async () => {
    const failure = Object.assign(new Error('rename failed'), { code: 'EBUSY' })
    const store = createLaunchUsageStore(dir, now, {
      rename: () => Promise.reject(failure),
      rm: () => Promise.reject(new Error('rm failed'))
    })
    await expect(store.save(usageOf({ '2026-10-04': { preset: 1, manual: 0 } }))).rejects.toBe(
      failure
    )
  })
})
