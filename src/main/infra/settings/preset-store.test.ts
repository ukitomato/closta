import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'

import { makeHostPath, type HostPath } from '@domain/runtime/path-types'
import { MAX_PRESETS } from '@domain/session/launch-config'
import type { Preset } from '@domain/session/preset'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { fromPresetRecord, PRESET_SCHEMA_VERSION } from './preset-record'
import { createPresetStore } from './preset-store'

/**
 * preset ストアの永続化テスト (X-4 BE-011 / FR-009)。provider-store.test.ts と同じく `os.tmpdir()` は使わず
 * リポジトリ配下の一時ディレクトリを使う (Principle II の許可外で `os` を import しないため)。
 */

const TEMP_ROOT = 'tests/.tmp'
let dir: HostPath

beforeEach(async () => {
  await mkdir(TEMP_ROOT, { recursive: true })
  const raw = await mkdtemp(`${TEMP_ROOT}/preset-`)
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

function preset(over: Partial<Preset> = {}): Preset {
  return {
    id: 'preset-1',
    name: '業務用',
    config: {
      folderId: 'f1',
      runtimeId: 'wsl:Ubuntu',
      providerId: 'p1',
      modelId: 'claude-sonnet-4-5',
      effort: 'high',
      permissionMode: 'default'
    },
    updatedAt: 1000,
    ...over
  }
}

const file = (): string => `${dir.value}\\presets.json`
const bakFile = (): string => `${dir.value}\\presets.json.${STAMP}.bak`

async function writeRaw(raw: string): Promise<void> {
  await mkdir(dir.value, { recursive: true })
  await writeFile(file(), raw, 'utf8')
}

describe('createPresetStore', () => {
  it('save → load でラウンドトリップする', async () => {
    const store = createPresetStore(dir, now)
    const p = preset()
    await store.save([p])
    const result = await store.load()
    expect(result).toEqual({ presets: [p], skipped: 0, reasonKeys: [], backupPath: null })
  })

  it('未作成 (ENOENT) は空で、退避しない', async () => {
    const result = await createPresetStore(dir, now).load()
    expect(result).toEqual({ presets: [], skipped: 0, reasonKeys: [], backupPath: null })
  })

  it('未作成以外の読み取り失敗は read-failed を返し、空として扱わない (MF-001 / DB-4)', async () => {
    // 対象パスをディレクトリにして EISDIR を起こす (EBUSY / EPERM と同じ「中身を知らない」経路)。
    await mkdir(file(), { recursive: true })
    const result = await createPresetStore(dir, now).load()
    expect(result.presets).toEqual([])
    expect(result.reasonKeys).toEqual(['read-failed'])
    expect(result.backupPath).toBeNull()
    // errno のコードだけを持つ (パスやメッセージは持たない。DB M-101)。
    expect(result.errorCode).toBe('EISDIR')
  })

  it('parse 失敗時は退避してから空を返す (原文を復旧不能にしない)', async () => {
    const broken = '{ this is not json'
    await writeRaw(broken)
    const result = await createPresetStore(dir, now).load()
    expect(result.presets).toEqual([])
    expect(result.skipped).toBe(1)
    expect(result.reasonKeys).toEqual(['parse-failed'])
    expect(result.backupPath).not.toBeNull()
    expect(await readFile(bakFile(), 'utf8')).toBe(broken)
  })

  it.each([
    ['presets がオブジェクト', { schemaVersion: PRESET_SCHEMA_VERSION, presets: { a: 1 } }],
    ['presets キーが無い', { schemaVersion: PRESET_SCHEMA_VERSION }]
  ])(
    'presets が配列でない root は parse-failed として退避する: %s (DB M-002)',
    async (_l, root) => {
      const raw = JSON.stringify(root)
      await writeRaw(raw)
      const result = await createPresetStore(dir, now).load()
      expect(result.presets).toEqual([])
      expect(result.reasonKeys).toEqual(['parse-failed'])
      expect(result.backupPath).not.toBeNull()
      expect(await readFile(bakFile(), 'utf8')).toBe(raw)
    }
  )

  it('未知の schemaVersion は退避する (将来版を旧版で開く)', async () => {
    const future = JSON.stringify({
      schemaVersion: PRESET_SCHEMA_VERSION + 1,
      presets: [fromPresetRecord(preset())]
    })
    await writeRaw(future)
    const result = await createPresetStore(dir, now).load()
    expect(result.presets).toEqual([])
    expect(result.reasonKeys).toEqual(['schema-version-unknown'])
    expect(result.backupPath).not.toBeNull()
    expect(await readFile(bakFile(), 'utf8')).toBe(future)
  })

  it.each([
    ['schemaVersion が無い', JSON.stringify({ presets: [] })],
    [
      'schemaVersion が文字列',
      JSON.stringify({ schemaVersion: String(PRESET_SCHEMA_VERSION), presets: [] })
    ],
    ['schemaVersion が 0', JSON.stringify({ schemaVersion: 0, presets: [] })],
    ['schemaVersion が負', JSON.stringify({ schemaVersion: -1, presets: [] })],
    ['root が配列', JSON.stringify([{ schemaVersion: PRESET_SCHEMA_VERSION, presets: [] }])]
  ])(
    '将来版でない不正な schemaVersion / root は parse-failed として退避する: %s (DB L-101)',
    async (_l, raw) => {
      await writeRaw(raw)
      const result = await createPresetStore(dir, now).load()
      expect(result.presets).toEqual([])
      expect(result.reasonKeys).toEqual(['parse-failed'])
      expect(result.backupPath).not.toBeNull()
      expect(await readFile(bakFile(), 'utf8')).toBe(raw)
    }
  )

  it('一部レコードが壊れても読めた分は復元し、退避する (invalid-record)', async () => {
    const raw = JSON.stringify({
      schemaVersion: PRESET_SCHEMA_VERSION,
      presets: [fromPresetRecord(preset({ id: 'ok' })), { id: 'x' /* 必須欠落 */ }]
    })
    await writeRaw(raw)
    const result = await createPresetStore(dir, now).load()
    expect(result.presets.map((p) => p.id)).toEqual(['ok'])
    expect(result.skipped).toBe(1)
    expect(result.reasonKeys).toEqual(['invalid-record'])
    expect(await readFile(bakFile(), 'utf8')).toBe(raw)
  })

  it('重複 id と正規化後の重複名は後ろを読み飛ばして退避する', async () => {
    const raw = JSON.stringify({
      schemaVersion: PRESET_SCHEMA_VERSION,
      presets: [
        fromPresetRecord(preset({ id: 'a', name: 'A' })),
        fromPresetRecord(preset({ id: 'a', name: 'B' })), // 重複 id
        { ...fromPresetRecord(preset({ id: 'c' })), name: ' A ' } // 正規化後に 'A' と重複
      ]
    })
    await writeRaw(raw)
    const result = await createPresetStore(dir, now).load()
    expect(result.presets.map((p) => p.id)).toEqual(['a'])
    expect(result.skipped).toBe(2)
    expect(result.reasonKeys).toEqual(['invalid-record'])
    expect(result.backupPath).not.toBeNull()
  })

  it(`上限 ${MAX_PRESETS} 件を超えた分は読まずに退避する`, async () => {
    const records = Array.from({ length: MAX_PRESETS + 1 }, (_, i) =>
      fromPresetRecord(preset({ id: `p${i}`, name: `n${i}` }))
    )
    const raw = JSON.stringify({ schemaVersion: PRESET_SCHEMA_VERSION, presets: records })
    await writeRaw(raw)
    const result = await createPresetStore(dir, now).load()
    expect(result.presets).toHaveLength(MAX_PRESETS)
    expect(result.skipped).toBe(1)
    expect(result.backupPath).not.toBeNull()
    expect(await readFile(bakFile(), 'utf8')).toBe(raw)
  })

  it('保存 JSON は schemaVersion 付きで、一時ファイルを残さない', async () => {
    const store = createPresetStore(dir, now)
    await store.save([preset()])
    await store.save([preset({ name: '別名' })])
    const saved = JSON.parse(await readFile(file(), 'utf8')) as Record<string, unknown>
    expect(saved.schemaVersion).toBe(PRESET_SCHEMA_VERSION)
    expect((await store.load()).presets.map((p) => p.name)).toEqual(['別名'])
    expect((await readdir(dir.value)).filter((n) => n.endsWith('.tmp'))).toEqual([])
  })

  it('rename が失敗したら一時ファイルを消してから失敗を返す (DB L-102)', async () => {
    const failure = Object.assign(new Error('rename failed'), { code: 'EPERM' })
    const store = createPresetStore(dir, now, { rename: () => Promise.reject(failure) })
    await expect(store.save([preset()])).rejects.toBe(failure)
    const names = await readdir(dir.value)
    expect(names.filter((n) => n.endsWith('.tmp'))).toEqual([])
    expect(names).not.toContain('presets.json')
  })

  it('一時ファイルの書き込みが途中で失敗しても一時ファイルを消して元のエラーを返す (pr-gate R1 database L-201)', async () => {
    const failure = Object.assign(new Error('disk full'), { code: 'ENOSPC' })
    const store = createPresetStore(dir, now, {
      rename: () => Promise.reject(new Error('rename は呼ばれない')),
      // 途中まで書けた temp を残してから失敗する (ENOSPC の再現)。
      writeFile: async (path, data) => {
        await writeFile(path, data.slice(0, 5), 'utf8')
        throw failure
      }
    })
    await expect(store.save([preset()])).rejects.toBe(failure)
    const names = await readdir(dir.value)
    expect(names.filter((n) => n.endsWith('.tmp'))).toEqual([])
    expect(names).not.toContain('presets.json')
  })

  it('後始末 (rm) が失敗しても元のエラーを隠さない (L-201)', async () => {
    const failure = Object.assign(new Error('rename failed'), { code: 'EBUSY' })
    const store = createPresetStore(dir, now, {
      rename: () => Promise.reject(failure),
      rm: () => Promise.reject(new Error('rm failed'))
    })
    await expect(store.save([preset()])).rejects.toBe(failure)
  })
})
