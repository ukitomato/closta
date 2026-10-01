import { afterEach, describe, expect, it, vi } from 'vitest'

import { makeHostPath } from '@domain/runtime/path-types'
import { MAX_PRESETS, type SessionLaunchConfig } from '@domain/session/launch-config'
import type { Preset } from '@domain/session/preset'

import type { PresetLoadIssue, PresetStore } from '../infra/settings/preset-store'
import { createPresetService, type PresetService } from './preset-service'

afterEach(() => {
  vi.restoreAllMocks()
})

/** X-4 BE-012 / FR-009 — 同名上書き確認・件数上限・削除。 */

const config: SessionLaunchConfig = {
  folderId: 'f1',
  runtimeId: 'wsl:Ubuntu',
  providerId: null,
  modelId: null,
  effort: null,
  permissionMode: 'default'
}

function fakeStore(
  initial: Preset[] = [],
  reasonKeys: readonly PresetLoadIssue[] = []
): PresetStore & { saves: number } {
  let presets = [...initial]
  const store = {
    saves: 0,
    async load() {
      return { presets, skipped: 0, reasonKeys, backupPath: null }
    },
    async save(next: readonly Preset[]) {
      presets = [...next]
      store.saves += 1
    }
  }
  return store
}

function service(store: PresetStore): PresetService {
  let t = 0
  let seq = 0
  return createPresetService({ store, now: () => (t += 10), newId: () => `id-${(seq += 1)}` })
}

describe('preset-service', () => {
  it('保存した名前は正規化され、一覧は更新日時の降順', async () => {
    const svc = service(fakeStore())
    await svc.save({ name: ' A ', config, overwrite: false })
    await svc.save({ name: 'B', config, overwrite: false })
    const list = await svc.list()
    expect(list.map((p) => p.name)).toEqual(['B', 'A'])
  })

  it('同名は上書き確認 (overwrite: false) で name-conflict、true で同じ id を更新する', async () => {
    const svc = service(fakeStore())
    const first = await svc.save({ name: '業務用', config, overwrite: false })
    // NFC 違いでも同名として扱う。
    expect(await svc.save({ name: '業務用 ', config, overwrite: false })).toEqual({
      ok: false,
      reason: 'name-conflict'
    })
    const updated = await svc.save({
      name: '業務用',
      config: { ...config, permissionMode: 'plan' },
      overwrite: true
    })
    expect(updated.ok && first.ok && updated.preset.id === first.preset.id).toBe(true)
    expect((await svc.list()).length).toBe(1)
  })

  it(`件数上限 ${MAX_PRESETS} 件: 100 件目は保存でき、101 件目は limit-reached`, async () => {
    const initial: Preset[] = Array.from({ length: MAX_PRESETS - 1 }, (_, i) => ({
      id: `p${i}`,
      name: `n${i}`,
      config,
      updatedAt: i
    }))
    const svc = service(fakeStore(initial))
    expect((await svc.save({ name: 'last', config, overwrite: false })).ok).toBe(true)
    expect(await svc.save({ name: 'over', config, overwrite: false })).toEqual({
      ok: false,
      reason: 'limit-reached'
    })
    // 上限でも同名の上書きはできる。
    expect((await svc.save({ name: 'last', config, overwrite: true })).ok).toBe(true)
  })

  it('remove は既知 id だけを消す', async () => {
    const svc = service(fakeStore([{ id: 'p1', name: 'n', config, updatedAt: 1 }]))
    expect(await svc.remove('nope')).toEqual({ ok: false })
    expect(await svc.remove('p1')).toEqual({ ok: true })
    expect(await svc.list()).toEqual([])
  })

  it('presets.json が将来版なら mutation を拒否する (上書きで新版データを失わない)', async () => {
    const store = fakeStore([], ['schema-version-unknown'])
    const svc = service(store)
    expect(await svc.save({ name: 'x', config, overwrite: false })).toEqual({
      ok: false,
      reason: 'store-newer-version'
    })
    expect(await svc.remove('x')).toEqual({ ok: false })
    expect(store.saves).toBe(0)
  })

  it('presets.json を読めなかった (未作成以外) なら mutation を拒否する (MF-001 / DB-4)', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const store = fakeStore([{ id: 'p1', name: 'n', config, updatedAt: 1 }], ['read-failed'])
    const svc = service(store)
    expect(await svc.save({ name: 'x', config, overwrite: false })).toEqual({
      ok: false,
      reason: 'store-read-failed'
    })
    expect(await svc.remove('p1')).toEqual({ ok: false })
    expect(store.saves).toBe(0)
  })

  it('読み取り失敗は確定させず、次の操作で読み直す', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    let fail = true
    const saved: Preset[] = [{ id: 'p1', name: 'n', config, updatedAt: 1 }]
    const store: PresetStore = {
      async load() {
        return fail
          ? { presets: [], skipped: 0, reasonKeys: ['read-failed'], backupPath: null }
          : { presets: saved, skipped: 0, reasonKeys: [], backupPath: null }
      },
      save: () => Promise.resolve()
    }
    const svc = service(store)
    await expect(svc.list()).rejects.toThrow()
    fail = false
    expect((await svc.list()).map((p) => p.id)).toEqual(['p1'])
    // 解消後は mutation も通る。
    expect(await svc.remove('p1')).toEqual({ ok: true })
  })

  it('読み取り失敗のとき list は reject し、message に値を含めない (DB M-101)', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const store = fakeStore(
      [{ id: 'p1', name: '秘密の名前', config, updatedAt: 1 }],
      ['read-failed']
    )
    const error = await service(store)
      .list()
      .then(
        () => null,
        (e: unknown) => e
      )
    expect(error).toBeInstanceOf(Error)
    const message = (error as Error).message
    expect(message).not.toContain('秘密の名前')
    expect(message).not.toContain('p1')
  })

  it('読み取り失敗は errno コードだけを warn に 1 回出す (DB M-101)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const store: PresetStore = {
      async load() {
        return {
          presets: [],
          skipped: 0,
          reasonKeys: ['read-failed'],
          backupPath: null,
          errorCode: 'EBUSY'
        }
      },
      save: () => Promise.resolve()
    }
    await expect(service(store).list()).rejects.toThrow()
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0]).toEqual(['[preset-store] read-failed code=EBUSY'])
  })

  it('store.save が失敗したら一覧は変わらない (永続化の成功後に差し替える。DB M-003)', async () => {
    const store: PresetStore = {
      async load() {
        return { presets: [], skipped: 0, reasonKeys: [], backupPath: null }
      },
      async save() {
        throw new Error('EBUSY')
      }
    }
    const svc = service(store)
    await expect(svc.save({ name: 'x', config, overwrite: false })).rejects.toThrow()
    expect(await svc.list()).toEqual([])
  })

  it('並行する save は直列化され、両方が残る (DB M-003)', async () => {
    const writes: (readonly Preset[])[] = []
    const store: PresetStore = {
      async load() {
        return { presets: [], skipped: 0, reasonKeys: [], backupPath: null }
      },
      async save(next) {
        // 書き込みに時間がかかる間に次の save が割り込まないことを見る。
        await new Promise((resolve) => setTimeout(resolve, 5))
        writes.push(next)
      }
    }
    const svc = service(store)
    const [a, b] = await Promise.all([
      svc.save({ name: 'A', config, overwrite: false }),
      svc.save({ name: 'B', config, overwrite: false })
    ])
    expect(a.ok && b.ok).toBe(true)
    expect(writes.at(-1)?.map((p) => p.name)).toEqual(['A', 'B'])
    expect((await svc.list()).map((p) => p.name).sort()).toEqual(['A', 'B'])
  })

  it('load で退避・skip があれば件数・理由キー・退避パスだけを warn に出す (DB M-005)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const bak = makeHostPath('C:\\data\\presets.json.1.bak')
    if (!bak.ok) throw new Error('bad path')
    const store: PresetStore = {
      async load() {
        return {
          presets: [{ id: 'p1', name: '秘密の名前', config, updatedAt: 1 }],
          skipped: 2,
          reasonKeys: ['invalid-record'],
          backupPath: bak.path
        }
      },
      save: () => Promise.resolve()
    }
    await service(store).list()
    expect(warn).toHaveBeenCalledTimes(1)
    const message = String(warn.mock.calls[0]?.[0])
    expect(message).toContain('[preset-store]')
    expect(message).toContain('skipped=2')
    expect(message).toContain('invalid-record')
    expect(message).toContain('presets.json.1.bak')
    expect(message).not.toContain('秘密の名前')
  })

  it('正常な load では warn を出さない', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await service(fakeStore()).list()
    expect(warn).not.toHaveBeenCalled()
  })
})
