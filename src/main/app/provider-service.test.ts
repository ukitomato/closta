import { fixedCapabilities } from '@domain/runtime/capabilities'
import type { RuntimeDescriptor, Win32RuntimeDescriptor } from '@domain/runtime/descriptor'
import { uncNamespace } from '@domain/runtime/namespace'
import { makeHostPath, makeWslUncPath } from '@domain/runtime/path-types'
import type { ProviderProfile } from '@domain/provider/types'
import { describe, expect, it } from 'vitest'

import type { SecretStore } from '../infra/secrets/safe-storage'
import type { ProviderStore } from '../infra/settings/provider-store'
import { createProviderService, type ProviderServiceDeps } from './provider-service'

const win32: Win32RuntimeDescriptor = {
  id: 'host',
  kind: 'win32',
  state: 'running',
  isDefault: true,
  capabilities: fixedCapabilities(0),
  detectedAt: 0
}

function fakeStore(initial: ProviderProfile[] = []): ProviderStore & { saved: ProviderProfile[] } {
  let profiles = [...initial]
  return {
    saved: profiles,
    async load() {
      return { profiles, skipped: 0, reasonKeys: [], backupPath: null }
    },
    async save(next) {
      profiles = [...next]
      this.saved = profiles
    }
  }
}

function fakeSecrets(available = true): SecretStore {
  return {
    isAvailable: () => available,
    seal: (plain) => (available ? `sealed(${plain})` : null),
    open: (sealed) => sealed.replace(/^sealed\(|\)$/g, '')
  }
}

function deps(over: Partial<ProviderServiceDeps> = {}): ProviderServiceDeps {
  return {
    store: fakeStore(),
    secrets: fakeSecrets(),
    detect: async () => [],
    runtimes: () => [win32 as RuntimeDescriptor],
    resolveConfigDirRuntimePath: () => null,
    curatedBaseEnv: () => ({ PATH: '/usr/bin' }),
    isDeniedEnvKey: (k) => /^(WSLENV|.*(API_?KEY|TOKEN|SECRET)|AWS_.*)$/i.test(k),
    newId: () => 'id-1',
    ...over
  }
}

const models = { models: [{ id: 'claude-opus-4-8', displayName: 'Opus' }] }

describe('createProviderService', () => {
  it('api-key 登録で秘密を seal し、参照値のみ保持する (list に秘密が出ない)', async () => {
    const store = fakeStore()
    const svc = createProviderService(deps({ store }))
    const result = await svc.register({
      displayName: 'Prod',
      backend: 'anthropic',
      credential: { source: 'api-key', secret: 'sk-plain' },
      models
    })
    expect(result.ok).toBe(true)
    const saved = store.saved[0]
    expect(saved.credential).toEqual({ source: 'api-key', secretRefKey: 'sealed(sk-plain)' })
    const list = await svc.list()
    expect(list[0]).toEqual({
      id: 'id-1',
      displayName: 'Prod',
      backend: 'anthropic',
      source: 'api-key',
      modelCount: 1
    })
    expect(JSON.stringify(list)).not.toContain('sk-plain') // 平文が DTO に出ない
  })

  it('safeStorage 利用不可なら api-key 登録を拒否する (平文で持たない。M-03)', async () => {
    const svc = createProviderService(deps({ secrets: fakeSecrets(false) }))
    const result = await svc.register({
      displayName: 'X',
      backend: 'anthropic',
      credential: { source: 'api-key', secret: 'sk-plain' },
      models
    })
    expect(result).toEqual({ ok: false, reason: 'safestorage-unavailable' })
  })

  it('extraEnv に秘密らしい値があれば登録を拒否する (H-09)', async () => {
    const svc = createProviderService(deps())
    const result = await svc.register({
      displayName: 'X',
      backend: 'anthropic',
      credential: { source: 'aws-profile', profileName: 'prod' },
      models,
      extraEnv: { MY_HOLDER: 'sk-ant-api03-abcdefghijklmnop' }
    })
    expect(result).toEqual({ ok: false, reason: 'secret-in-extraenv' })
  })

  it('deriveEnv は参照値を open して ANTHROPIC_API_KEY を注入する', async () => {
    const store = fakeStore([
      {
        id: 'p1',
        displayName: 'P',
        backend: 'anthropic',
        credential: { source: 'api-key', secretRefKey: 'sealed(sk-real)' },
        models
      }
    ])
    const svc = createProviderService(deps({ store }))
    const derived = await svc.deriveEnv('p1', 'host')
    expect(derived?.env.ANTHROPIC_API_KEY).toBe('sk-real')
    expect(derived?.env.PATH).toBe('/usr/bin') // curated base を spread
  })

  it('到達不可な Provider には env を導出せず null を返す (PB-H-002 / SC-004)', async () => {
    // WSL 内 config dir を持つ config-dir Provider。既定 runtimes は win32 = WSL 内に到達できない。
    const unc = makeWslUncPath(
      uncNamespace('Ubuntu'),
      '\\\\wsl.localhost\\Ubuntu\\home\\y\\.claude'
    )
    if (!unc.ok) throw new Error('bad unc path')
    const store = fakeStore([
      {
        id: 'p1',
        displayName: 'P',
        backend: 'anthropic',
        credential: { source: 'config-dir' },
        configDir: unc.path,
        models
      }
    ])
    const svc = createProviderService(deps({ store }))
    // deriveEnv 自身が到達可能性を強制し、config-dir の沈黙フォールバックを断つ。
    expect(await svc.deriveEnv('p1', 'host')).toBeNull()
  })

  it('config-dir 方式で RuntimePath 未解決なら deriveEnv は fail-closed で null (PB-P-M01)', async () => {
    const hostCfg = makeHostPath('C:\\Users\\y\\.claude')
    if (!hostCfg.ok) throw new Error('bad host path')
    const store = fakeStore([
      {
        id: 'p1',
        displayName: 'P',
        backend: 'anthropic',
        credential: { source: 'config-dir' },
        configDir: hostCfg.path,
        models
      }
    ])
    // host configDir は win32 で reachable。だが既定 resolveConfigDirRuntimePath は null (X-4 が実解決を供給)。
    // reachable でも変換不能 → CLAUDE_CONFIG_DIR を欠く env を作らず null に倒す。
    const svc = createProviderService(deps({ store }))
    expect(await svc.deriveEnv('p1', 'host')).toBeNull()
  })

  it('update は表示名/モデルを差し替える (認証方式は変えない)', async () => {
    const store = fakeStore([
      {
        id: 'p1',
        displayName: 'Old',
        backend: 'anthropic',
        credential: { source: 'config-dir' },
        models
      }
    ])
    const svc = createProviderService(deps({ store }))
    const result = await svc.update('p1', { displayName: 'New' })
    expect(result.ok).toBe(true)
    expect(store.saved[0].displayName).toBe('New')
    expect(store.saved[0].credential).toEqual({ source: 'config-dir' }) // 認証方式は不変
    expect(await svc.update('nope', { displayName: 'X' })).toEqual({
      ok: false,
      reason: 'not-found'
    })
  })

  it('update の extraEnv に秘密らしい値があれば拒否する (H-09)', async () => {
    const store = fakeStore([
      {
        id: 'p1',
        displayName: 'P',
        backend: 'anthropic',
        credential: { source: 'config-dir' },
        models
      }
    ])
    const svc = createProviderService(deps({ store }))
    const result = await svc.update('p1', { extraEnv: { HOLD: 'sk-ant-api03-abcdefghijklmnop' } })
    expect(result).toEqual({ ok: false, reason: 'secret-in-extraenv' })
  })

  it('remove は profile を落とす (参照値も一緒に解放)', async () => {
    const store = fakeStore([
      {
        id: 'p1',
        displayName: 'P',
        backend: 'anthropic',
        credential: { source: 'config-dir' },
        models
      }
    ])
    const svc = createProviderService(deps({ store }))
    expect(await svc.remove('p1')).toEqual({ ok: true })
    expect(await svc.list()).toEqual([])
    expect(await svc.remove('nope')).toEqual({ ok: false })
  })

  it('providers.json が将来版なら mutation を拒否する (上書きで新版データを失わない。DB-P-M01)', async () => {
    // load が schema-version-unknown を報告 (将来版を旧版アプリで開いた)。profiles は空。
    const newerStore: ProviderStore = {
      async load() {
        return {
          profiles: [],
          skipped: 1,
          reasonKeys: ['schema-version-unknown'],
          backupPath: null
        }
      },
      async save() {
        throw new Error('将来版を上書きしてはならない')
      }
    }
    const svc = createProviderService(deps({ store: newerStore }))
    const reg = await svc.register({
      displayName: 'X',
      backend: 'anthropic',
      credential: { source: 'config-dir' },
      models
    })
    expect(reg).toEqual({ ok: false, reason: 'store-newer-version' })
    expect(await svc.update('p1', { displayName: 'Y' })).toEqual({
      ok: false,
      reason: 'store-newer-version'
    })
    expect(await svc.remove('p1')).toEqual({ ok: false })
    // save は一度も呼ばれていない (throw していない = 上書きしていない)。
  })
})
