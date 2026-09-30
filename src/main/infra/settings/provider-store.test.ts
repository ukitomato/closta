import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'

import type { ProviderProfile } from '@domain/provider/types'
import { uncNamespace } from '@domain/runtime/namespace'
import { makeHostPath, makeWslUncPath, type HostPath } from '@domain/runtime/path-types'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { fromProviderRecord, SCHEMA_VERSION } from './provider-record'
import { createProviderStore } from './provider-store'

/**
 * provider ストアの永続化テスト (BE-004 / SC-002)。folder-store.test.ts と同じく `os.tmpdir()` は使わず
 * リポジトリ配下の一時ディレクトリを使う (Principle II の許可外で `os` を import しないため)。
 */

const TEMP_ROOT = 'tests/.tmp'
let dir: HostPath

beforeEach(async () => {
  await mkdir(TEMP_ROOT, { recursive: true })
  const raw = await mkdtemp(`${TEMP_ROOT}/provider-`)
  const absolute = makeHostPath(`${process.cwd()}\\${raw.split('/').join('\\')}`)
  if (!absolute.ok) throw new Error('一時ディレクトリのパスを解釈できない')
  dir = absolute.path
})

afterEach(async () => {
  await rm(dir.value, { recursive: true, force: true })
})

const hostConfig = (() => {
  const r = makeHostPath('C:\\Users\\y\\.claude')
  if (!r.ok) throw new Error('bad')
  return r.path
})()

/** 退避ファイル名に使う固定時刻 (注入。DB-H-001)。 */
const STAMP = 1_700_000_000_000
const now = (): number => STAMP

function profile(over: Partial<ProviderProfile> = {}): ProviderProfile {
  return {
    id: 'p1',
    displayName: 'Prod',
    backend: 'anthropic',
    configDir: hostConfig,
    credential: { source: 'api-key', secretRefKey: 'sealed-ciphertext-base64' },
    models: { models: [{ id: 'claude-opus-4-8', displayName: 'Opus' }] },
    ...over
  }
}

describe('createProviderStore', () => {
  it('save → load でラウンドトリップする', async () => {
    const store = createProviderStore(dir, now)
    const p = profile()
    await store.save([p])
    const { profiles, skipped, backupPath } = await store.load()
    expect(skipped).toBe(0)
    expect(backupPath).toBeNull() // 正常 load は退避しない
    expect(profiles).toHaveLength(1)
    expect(profiles[0].id).toBe('p1')
    expect(profiles[0].configDir?.value).toBe('C:\\Users\\y\\.claude')
    expect(profiles[0].credential).toEqual({
      source: 'api-key',
      secretRefKey: 'sealed-ciphertext-base64'
    })
  })

  it('未作成は空 (起動を失敗させない)', async () => {
    const { profiles, skipped, backupPath } = await createProviderStore(dir, now).load()
    expect(profiles).toEqual([])
    expect(skipped).toBe(0)
    expect(backupPath).toBeNull()
  })

  it('同一 backend 複数登録を id で識別する', async () => {
    const store = createProviderStore(dir, now)
    await store.save([
      profile({
        id: 'bedrock-prod',
        displayName: '本番',
        backend: 'bedrock',
        credential: { source: 'aws-profile', profileName: 'prod' },
        configDir: undefined
      }),
      profile({
        id: 'bedrock-stg',
        displayName: '検証',
        backend: 'bedrock',
        credential: { source: 'aws-profile', profileName: 'stg' },
        configDir: undefined
      })
    ])
    const { profiles } = await store.load()
    expect(profiles.map((p) => p.id).sort()).toEqual(['bedrock-prod', 'bedrock-stg'])
  })

  it('extraEnv に秘密らしい値を持つレコードは load でスキップする (H-09 / SC-002)', async () => {
    // ストアを介さず直接不正レコードを書き込む (登録経路の外から混入した想定)。
    const bad = {
      schemaVersion: SCHEMA_VERSION,
      providers: [
        {
          ...fromProviderRecord(profile({ configDir: undefined })),
          extraEnv: { MY_HOLDER: 'sk-ant-api03-abcdefghijklmnop' }
        }
      ]
    }
    await mkdir(dir.value, { recursive: true })
    await import('node:fs/promises').then((fs) =>
      fs.writeFile(`${dir.value}\\providers.json`, JSON.stringify(bad), 'utf8')
    )
    const { profiles, skipped, reasonKeys } = await createProviderStore(dir, now).load()
    expect(profiles).toHaveLength(0)
    expect(skipped).toBe(1)
    expect(reasonKeys).toContain('secret-in-extraenv')
  })

  it('保存 JSON に平文秘密が現れない (参照値のみ)', async () => {
    const store = createProviderStore(dir, now)
    await store.save([profile()])
    const raw = await readFile(`${dir.value}\\providers.json`, 'utf8')
    // secretRefKey (参照値) は現れるが、それは safeStorage 暗号化済みの ciphertext であり平文ではない。
    expect(raw).toContain('secretRefKey')
    expect(raw).not.toContain('sk-ant') // 平文 API キー形は現れない
  })

  it('parse 失敗時は退避してから空を返す (原文を復旧不能にしない。DB-H-001)', async () => {
    const broken = '{ this is not json'
    await mkdir(dir.value, { recursive: true })
    await writeFile(`${dir.value}\\providers.json`, broken, 'utf8')
    const { profiles, skipped, reasonKeys, backupPath } = await createProviderStore(dir, now).load()
    expect(profiles).toEqual([])
    expect(skipped).toBe(1)
    expect(reasonKeys).toContain('parse-failed')
    expect(backupPath).not.toBeNull()
    // 退避先に原文が保全されている — 次の save が上書きしても .bak から復旧できる (data-loss 回帰の核)。
    const bak = await readFile(`${dir.value}\\providers.json.${STAMP}.bak`, 'utf8')
    expect(bak).toBe(broken)
  })

  it('未知の schemaVersion は退避して全件破棄しない (将来版を旧版で開く。DB-M-001)', async () => {
    const future = JSON.stringify({
      schemaVersion: SCHEMA_VERSION + 1,
      providers: [fromProviderRecord(profile({ configDir: undefined }))]
    })
    await mkdir(dir.value, { recursive: true })
    await writeFile(`${dir.value}\\providers.json`, future, 'utf8')
    const { profiles, reasonKeys, backupPath } = await createProviderStore(dir, now).load()
    expect(profiles).toEqual([])
    expect(reasonKeys).toContain('schema-version-unknown')
    expect(backupPath).not.toBeNull()
    // 将来版の中身がそのまま退避される (旧版が黙って上書きしない)。
    const bak = await readFile(`${dir.value}\\providers.json.${STAMP}.bak`, 'utf8')
    expect(bak).toBe(future)
  })

  it('一部レコードが壊れても読めた分は復元し、退避する (skipped>0。DB-M-004)', async () => {
    const good = fromProviderRecord(profile({ id: 'ok', configDir: undefined }))
    const mixed = JSON.stringify({
      schemaVersion: SCHEMA_VERSION,
      providers: [good, { id: 'x' /* 必須欠落で invalid */ }]
    })
    await mkdir(dir.value, { recursive: true })
    await writeFile(`${dir.value}\\providers.json`, mixed, 'utf8')
    const { profiles, skipped, backupPath } = await createProviderStore(dir, now).load()
    expect(profiles.map((p) => p.id)).toEqual(['ok']) // 読めた分は復元
    expect(skipped).toBe(1)
    expect(backupPath).not.toBeNull() // 一部でも落ちたら退避
  })

  it('unc configDir が save→load で名前空間ごと保存される (PB-P-L03 / DB-P3-M01 の永続 read 境界)', async () => {
    const unc = makeWslUncPath(
      uncNamespace('Ubuntu'),
      '\\\\wsl.localhost\\Ubuntu\\home\\y\\.claude'
    )
    if (!unc.ok) throw new Error('bad unc path')
    const store = createProviderStore(dir, now)
    await store.save([profile({ id: 'wsl-cfg', configDir: unc.path })])
    const { profiles } = await store.load()
    // toConfigDir の unc 分岐 (namespace 種別検証 + makeWslUncPath 再 brand) を実シリアライズ経路で固定。
    expect(profiles[0].configDir?.namespace).toBe('unc:Ubuntu')
    expect(profiles[0].configDir?.value).toBe('\\\\wsl.localhost\\Ubuntu\\home\\y\\.claude')
  })

  it('永続レコードの configDir namespace が不正なら load で invalid-path として skip する (PB-P-L03 read 境界)', async () => {
    // `wsl:Ubuntu` は RuntimePath 名前空間で configDir (HostPath|WslUncPath) には不正。手編集混入を想定。
    const bad = {
      schemaVersion: SCHEMA_VERSION,
      providers: [
        {
          ...fromProviderRecord(profile({ configDir: undefined })),
          configDir: {
            namespace: 'wsl:Ubuntu',
            value: '\\\\wsl.localhost\\Ubuntu\\home\\y\\.claude'
          }
        }
      ]
    }
    await mkdir(dir.value, { recursive: true })
    await writeFile(`${dir.value}\\providers.json`, JSON.stringify(bad), 'utf8')
    const { profiles, skipped, reasonKeys } = await createProviderStore(dir, now).load()
    expect(profiles).toHaveLength(0)
    expect(skipped).toBe(1)
    expect(reasonKeys).toContain('invalid-path')
  })

  it('Bedrock モデルの inference profile ID が round-trip で保持される (pin。SC-007)', async () => {
    const store = createProviderStore(dir, now)
    await store.save([
      profile({
        id: 'bedrock',
        backend: 'bedrock',
        credential: { source: 'aws-profile', profileName: 'prod' },
        configDir: undefined,
        models: {
          models: [
            {
              id: 'claude-opus-4-8',
              displayName: 'Opus',
              inferenceProfileId: 'us.anthropic.claude-opus-4-8-v1:0'
            }
          ]
        }
      })
    ])
    const { profiles } = await store.load()
    // pin (inference profile ID) が save→load で失われない (alias に退化しない)。
    expect(profiles[0].models.models[0].inferenceProfileId).toBe(
      'us.anthropic.claude-opus-4-8-v1:0'
    )
  })
})
