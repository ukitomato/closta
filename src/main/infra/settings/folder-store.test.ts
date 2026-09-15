import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { makeHostPath } from '@domain/runtime/path-types'
import type { HostPath } from '@domain/runtime/path-types'

import { createFolderStore } from './folder-store'
import { SCHEMA_VERSION } from './folder-record'

/**
 * 永続化の復元テスト (BE-041 / SC-013 / contracts/workspace-store.md)。
 *
 * **起動失敗 0 件**が要件である。どの壊れ方でも例外を投げず、
 * 読めた分を復元して件数・理由・退避先を返す。
 *
 * 一時ディレクトリを使う。`app` を起動しないので `electron` は要らない
 * (ユーザデータのパスを引数で受け取る設計の帰結)。
 *
 * **`node:os` の `tmpdir()` は使わない。** `os` は Principle II の許可ディレクトリ
 * (`src/main/infra/runtime/`) の外では禁止されており、テストのために規則を緩めるのは
 * 本末転倒である (`os.platform()` を隠せる抜け道を作ることになる)。
 * リポジトリ配下に一時ディレクトリを作り、後始末する。
 */

/** 一時ディレクトリの置き場。`.gitignore` の対象に入れてある。 */
const TEMP_ROOT = 'tests/.tmp'

const NOW = 1_700_000_000_000

let dir: HostPath

beforeEach(async () => {
  await mkdir(TEMP_ROOT, { recursive: true })
  const raw = await mkdtemp(`${TEMP_ROOT}/store-`)
  // `mkdtemp` は相対パスを返すので絶対パスへ直す。
  const absolute = makeHostPath(`${process.cwd()}\\${raw.split('/').join('\\')}`)
  if (!absolute.ok) throw new Error('一時ディレクトリのパスを解釈できない')
  dir = absolute.path
})

afterEach(async () => {
  await rm(dir.value, { recursive: true, force: true })
})

function store(): ReturnType<typeof createFolderStore> {
  return createFolderStore(dir, () => NOW)
}

async function writeRaw(content: string): Promise<void> {
  await writeFile(`${dir.value}\\workspace-folders.json`, content, 'utf8')
}

function validRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'wf_0123456789ab',
    location: { kind: 'wsl', distroName: 'Ubuntu-26.04' },
    path: { namespace: 'wsl:Ubuntu-26.04', value: '/home/u/repo' },
    displayName: 'repo',
    registeredAt: NOW,
    ...overrides
  }
}

async function writeFolders(records: readonly unknown[]): Promise<void> {
  await writeRaw(JSON.stringify({ schemaVersion: SCHEMA_VERSION, folders: records }))
}

async function backupCount(): Promise<number> {
  const names = await readdir(dir.value)
  return names.filter((name) => name.endsWith('.bak')).length
}

describe('未作成', () => {
  it('ファイルが無いのは「空」であって失敗ではない', async () => {
    const result = await store().load()
    expect(result.folders).toEqual([])
    expect(result.issues).toEqual({ skipped: 0, reasonKeys: [], backupPath: null })
    expect(await backupCount()).toBe(0)
  })
})

describe('正常な復元', () => {
  it('所在 wsl / windows の両方を復元する', async () => {
    await writeFolders([
      validRecord(),
      {
        id: 'wf_bbbbbbbbbbbb',
        location: { kind: 'windows' },
        path: { namespace: 'host', value: 'C:\\dev\\x' },
        displayName: 'x',
        registeredAt: NOW
      }
    ])

    const result = await store().load()
    expect(result.folders).toHaveLength(2)
    expect(result.issues.skipped).toBe(0)
    expect(result.folders[0].location).toEqual({ kind: 'wsl', distroName: 'Ubuntu-26.04' })
    expect(result.folders[1].location).toEqual({ kind: 'windows' })
  })

  it('空白・日本語・非 ASCII を含むパスを 100% 復元する (SC-013)', async () => {
    const values = ['/home/u/my project', '/home/u/開発/プロジェクト', '/home/u/café-ñ']
    await writeFolders(
      values.map((value, index) => ({
        id: `wf_00000000000${index}`,
        location: { kind: 'wsl', distroName: 'Ubuntu-26.04' },
        path: { namespace: 'wsl:Ubuntu-26.04', value },
        displayName: `f${index}`,
        registeredAt: NOW
      }))
    )

    const result = await store().load()
    expect(result.folders.map((f) => f.path.value)).toEqual(values)
    expect(result.issues.skipped).toBe(0)
  })
})

describe('壊れ方ごとの扱い', () => {
  it('JSON 破損 — 退避して parse-failed を返す', async () => {
    await writeRaw('{ this is not json')

    const result = await store().load()
    expect(result.folders).toEqual([])
    expect(result.issues.reasonKeys).toEqual(['parse-failed'])
    expect(result.issues.backupPath).not.toBeNull()
    expect(await backupCount()).toBe(1)
  })

  it('スキーマ版不一致 — 退避して schema-version-unknown を返す', async () => {
    await writeRaw(JSON.stringify({ schemaVersion: 99, folders: [validRecord()] }))

    const result = await store().load()
    expect(result.folders).toEqual([])
    expect(result.issues.reasonKeys).toEqual(['schema-version-unknown'])
    // **将来バージョンを旧バージョンで開いたとき、退避せずに上書きすると全件を失う。**
    expect(await backupCount()).toBe(1)
  })

  it('所在の種別は一致するがディストロ名が異なる — namespace-mismatch', async () => {
    await writeFolders([validRecord({ path: { namespace: 'wsl:Debian', value: '/home/u/repo' } })])

    const result = await store().load()
    expect(result.folders).toEqual([])
    expect(result.issues.reasonKeys).toEqual(['namespace-mismatch'])
  })

  it('id 重複 — 2 件目を invalid-record として落とす', async () => {
    await writeFolders([
      validRecord(),
      validRecord({ path: { namespace: 'wsl:Ubuntu-26.04', value: '/home/u/other' } })
    ])

    const result = await store().load()
    expect(result.folders).toHaveLength(1)
    expect(result.issues.skipped).toBe(1)
    expect(result.issues.reasonKeys).toEqual(['invalid-record'])
  })

  it('制御文字を含む displayName — invalid-record', async () => {
    await writeFolders([validRecord({ displayName: 'bad\u0007name' })])
    const result = await store().load()
    expect(result.issues.reasonKeys).toEqual(['invalid-record'])
  })

  it('長さ超過の displayName — invalid-record', async () => {
    await writeFolders([validRecord({ displayName: 'x'.repeat(256) })])
    const result = await store().load()
    expect(result.issues.reasonKeys).toEqual(['invalid-record'])
  })

  it('バックスラッシュを含む POSIX パス値 — invalid-path', async () => {
    await writeFolders([
      validRecord({ path: { namespace: 'wsl:Ubuntu-26.04', value: '/home/u/a\\b' } })
    ])
    const result = await store().load()
    expect(result.issues.reasonKeys).toEqual(['invalid-path'])
  })

  it('文字種制約を満たさない location.distroName — invalid-record', async () => {
    await writeFolders([
      validRecord({
        location: { kind: 'wsl', distroName: 'bad:name' },
        path: { namespace: 'wsl:bad:name', value: '/home/u/repo' }
      })
    ])
    const result = await store().load()
    expect(result.issues.reasonKeys).toEqual(['invalid-record'])
  })

  it('未知のキーを含むレコード — invalid-record (allow-list)', async () => {
    await writeFolders([validRecord({ secretToken: 'x' })])
    const result = await store().load()
    expect(result.issues.reasonKeys).toEqual(['invalid-record'])
  })

  it('registeredAt が数値でない — invalid-record', async () => {
    await writeFolders([validRecord({ registeredAt: 'yesterday' })])
    const result = await store().load()
    expect(result.issues.reasonKeys).toEqual(['invalid-record'])
  })

  it('一部だけ壊れていたら**読めた分を復元し**退避する', async () => {
    await writeFolders([
      validRecord(),
      validRecord({ id: 'wf_cccccccccccc', displayName: '' }),
      {
        id: 'wf_dddddddddddd',
        location: { kind: 'windows' },
        path: { namespace: 'host', value: 'C:\\dev\\y' },
        displayName: 'y',
        registeredAt: NOW
      }
    ])

    const result = await store().load()
    expect(result.folders.map((f) => f.id)).toEqual(['wf_0123456789ab', 'wf_dddddddddddd'])
    expect(result.issues.skipped).toBe(1)
    expect(result.issues.backupPath).not.toBeNull()
    expect(await backupCount()).toBe(1)
  })

  it('どの壊れ方でも例外を投げない (起動失敗 0 件)', async () => {
    const broken = [
      '{',
      'null',
      '[]',
      JSON.stringify({ folders: [] }),
      JSON.stringify({ schemaVersion: SCHEMA_VERSION }),
      JSON.stringify({ schemaVersion: SCHEMA_VERSION, folders: 'not-an-array' }),
      JSON.stringify({ schemaVersion: SCHEMA_VERSION, folders: [null, 1, 'x'] })
    ]
    for (const content of broken) {
      await writeRaw(content)
      await expect(store().load()).resolves.toBeDefined()
    }
  })
})

describe('書き込み', () => {
  it('schemaVersion を出力し、allow-list のキーだけを書く', async () => {
    await writeFolders([validRecord()])
    const loaded = await store().load()
    await store().save(loaded.folders)

    const raw = await readFile(`${dir.value}\\workspace-folders.json`, 'utf8')
    const parsed = JSON.parse(raw) as {
      schemaVersion: number
      folders: Record<string, unknown>[]
    }

    expect(parsed.schemaVersion).toBe(SCHEMA_VERSION)
    expect(Object.keys(parsed.folders[0]).sort()).toEqual([
      'displayName',
      'id',
      'location',
      'path',
      'registeredAt'
    ])
    // **`reachability` を保存しない** — 起動時に判定し直す実行時の値である。
    expect(parsed.folders[0].reachability).toBeUndefined()
  })

  it('未知のキーが書き戻しで増殖しない', async () => {
    // 未知のキーを含むレコードは復元されないので、書き戻しても現れない。
    await writeFolders([validRecord({ secretToken: 'x' }), validRecord({ id: 'wf_eeeeeeeeeeee' })])
    const loaded = await store().load()
    await store().save(loaded.folders)

    const raw = await readFile(`${dir.value}\\workspace-folders.json`, 'utf8')
    expect(raw).not.toContain('secretToken')
  })

  it('書き込み後に読み戻して一致する (往復)', async () => {
    await writeFolders([validRecord()])
    const first = await store().load()
    await store().save(first.folders)
    const second = await store().load()

    expect(second.folders).toEqual(first.folders)
    expect(second.issues.skipped).toBe(0)
  })
})
