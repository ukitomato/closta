import { makeForbiddenForwardKey } from '@domain/provider/forward-env'
import { fixedCapabilities } from '@domain/runtime/capabilities'
import type {
  RuntimeDescriptor,
  Win32RuntimeDescriptor,
  WslRuntimeDescriptor
} from '@domain/runtime/descriptor'
import { uncNamespace, wslNamespace } from '@domain/runtime/namespace'
import { makePathMapping } from '@domain/runtime/path-mapping'
import { makeHostPath, makeWslUncPath } from '@domain/runtime/path-types'
import type { ProviderProfile } from '@domain/provider/types'
import { describe, expect, it, vi } from 'vitest'

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
    curatedBaseEnv: () => ({ PATH: '/usr/bin' }),
    isDeniedEnvKey: (k) => /^(WSLENV|.*(API_?KEY|TOKEN|SECRET)|AWS_.*)$/i.test(k),
    isForbiddenForwardKey: makeForbiddenForwardKey([
      'SystemRoot',
      'windir',
      'TEMP',
      'TMP',
      'WSL_UTF8',
      'WSLENV'
    ]),
    parentEnv: () => ({}),
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
      modelCount: 1,
      models: models.models // X-4: カタログは秘密でないので DTO に含める
    })
    expect(JSON.stringify(list)).not.toContain('sk-plain') // 平文が DTO に出ない
    expect(JSON.stringify(list)).not.toContain('sealed(') // 参照値も DTO に出ない
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
    // host configDir は win32 で reachable。だが X-4 の起動は WSL 限定で、resolveConfigDirPath は win32 を解決しない。
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

  it('load で退避したら件数・理由キー・退避先だけを 1 回 warn し、件数を loadIssues で返す (M-301 / M-03)', async () => {
    const backup = makeHostPath('C:\\u\\providers.json.1.bak')
    if (!backup.ok) throw new Error('bad backup path')
    const secretName = 'Prod-Secret-Name'
    const store: ProviderStore = {
      async load() {
        return {
          profiles: [
            {
              id: 'kept',
              displayName: secretName,
              backend: 'anthropic',
              credential: { source: 'config-dir' },
              models: { models: [] },
              extraEnv: { MY_FLAG: 'value-must-not-leak' }
            }
          ],
          skipped: 2,
          reasonKeys: ['invalid-record', 'secret-in-extraenv'],
          backupPath: backup.path
        }
      },
      save: () => Promise.resolve()
    }
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const svc = createProviderService(deps({ store }))
      await svc.list()
      await svc.list() // 2 回目は load しない (warn も 1 回だけ)
      expect(await svc.loadIssues()).toEqual({
        skippedOnLoad: 2,
        wholeFileUnreadable: false,
        storeNewerVersion: false
      })
      expect(warn).toHaveBeenCalledTimes(1)
      const line = String(warn.mock.calls[0][0])
      expect(line).toBe(
        '[provider-store] skipped=2 reasons=invalid-record,secret-in-extraenv backup=C:\\u\\providers.json.1.bak'
      )
      expect(line).not.toContain(secretName)
      expect(line).not.toContain('value-must-not-leak')
    } finally {
      warn.mockRestore()
    }
  })

  it('退避が無ければ warn せず、loadIssues は 0 (M-301)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const svc = createProviderService(deps())
      expect(await svc.loadIssues()).toEqual({
        skippedOnLoad: 0,
        wholeFileUnreadable: false,
        storeNewerVersion: false
      })
      expect(warn).not.toHaveBeenCalled()
    } finally {
      warn.mockRestore()
    }
  })

  it.each([
    ['parse-failed', false],
    ['schema-version-unknown', true]
  ] as const)(
    'ファイル単位の失敗 (%s) は wholeFileUnreadable=true にする (skipped=1 は件数ではない。pr-gate R2 database M-401)',
    async (reasonKey, newer) => {
      const backup = makeHostPath('C:\\u\\providers.json.1.bak')
      if (!backup.ok) throw new Error('bad backup path')
      const store: ProviderStore = {
        async load() {
          return { profiles: [], skipped: 1, reasonKeys: [reasonKey], backupPath: backup.path }
        },
        save: () => Promise.resolve()
      }
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      try {
        const svc = createProviderService(deps({ store }))
        expect(await svc.loadIssues()).toEqual({
          skippedOnLoad: 1,
          wholeFileUnreadable: true,
          storeNewerVersion: newer
        })
        // mutation を止めるのは将来版だけ。parse-failed (版の欠落・非数値・配列 root など) では
        // 登録を続けられる (pr-gate R3 database M-501)。
        const result = await svc.register({
          displayName: 'X',
          backend: 'anthropic',
          credential: { source: 'aws-profile', profileName: 'prod' },
          models
        })
        expect(result.ok).toBe(!newer)
        if (!result.ok) expect(result.reason).toBe('store-newer-version')
      } finally {
        warn.mockRestore()
      }
    }
  )
})

describe('provider-service の X-4 配線 (FR-012 / FR-013 / FR-014)', () => {
  function ubuntu(): WslRuntimeDescriptor {
    const m = makePathMapping(
      'host',
      wslNamespace('Ubuntu'),
      [{ fromPrefix: 'C:\\', toPrefix: '/mnt/c' }],
      0
    )
    if (!m.ok) throw new Error('bad mapping')
    return {
      id: wslNamespace('Ubuntu'),
      kind: 'wsl',
      distroName: 'Ubuntu',
      state: 'running',
      wslVersion: 2,
      pathMapping: m.mapping,
      isDefault: false,
      capabilities: fixedCapabilities(0),
      detectedAt: 0
    }
  }
  const base = {
    id: 'p1',
    displayName: 'P',
    backend: 'anthropic' as const,
    models: { models: [] }
  }

  it('host configDir は選択ランタイムの RuntimePath で CLAUDE_CONFIG_DIR に注入される (転送キーに載る)', async () => {
    const host = makeHostPath('C:\\Users\\y\\.claude')
    if (!host.ok) throw new Error('bad host')
    const svc = createProviderService(
      deps({
        store: fakeStore([{ ...base, credential: { source: 'config-dir' }, configDir: host.path }]),
        runtimes: () => [ubuntu()]
      })
    )
    const derived = await svc.deriveEnv('p1', 'wsl:Ubuntu')
    expect(derived?.env.CLAUDE_CONFIG_DIR).toBe('/mnt/c/Users/y/.claude')
    expect(derived?.forwardKeys).toEqual(['CLAUDE_CONFIG_DIR'])
  })

  it('helper 系は分類済み RuntimePath を settings に載せ、分類不能なら null', async () => {
    const ok = createProviderService(
      deps({
        store: fakeStore([
          { ...base, credential: { source: 'api-key-helper', helperPath: 'C:\\tools\\h.sh' } }
        ]),
        runtimes: () => [ubuntu()]
      })
    )
    expect((await ok.deriveEnv('p1', 'wsl:Ubuntu'))?.settings).toEqual({
      apiKeyHelper: '/mnt/c/tools/h.sh'
    })

    const ng = createProviderService(
      deps({
        store: fakeStore([
          {
            ...base,
            credential: { source: 'api-key-helper', helperPath: 'C:\\Program Files\\h.sh' }
          }
        ]),
        runtimes: () => [ubuntu()]
      })
    )
    expect(await ng.deriveEnv('p1', 'wsl:Ubuntu')).toBeNull()
  })

  it('env-passthrough は varNames の値を親 env から取り、転送キーに載せる', async () => {
    const svc = createProviderService(
      deps({
        store: fakeStore([
          { ...base, credential: { source: 'env-passthrough', varNames: ['ANTHROPIC_API_KEY'] } }
        ]),
        runtimes: () => [ubuntu()],
        parentEnv: () => ({ ANTHROPIC_API_KEY: 'sk-parent', GH_TOKEN: 'ghp_x' })
      })
    )
    const derived = await svc.deriveEnv('p1', 'wsl:Ubuntu')
    expect(derived?.env.ANTHROPIC_API_KEY).toBe('sk-parent')
    expect(derived?.env.GH_TOKEN).toBeUndefined() // varNames 以外は読まない
    expect(derived?.forwardKeys).toEqual(['ANTHROPIC_API_KEY'])
  })

  it('providerFacts は到達可能性とカタログを返し、summary は models を含む', async () => {
    const catalog = {
      models: [{ id: 'm1', displayName: 'M1', supportedEffortLevels: ['low' as const] }]
    }
    const svc = createProviderService(
      deps({
        store: fakeStore([
          {
            ...base,
            credential: { source: 'api-key-helper', helperPath: '/opt/h.sh' },
            models: catalog
          }
        ]),
        runtimes: () => [ubuntu()]
      })
    )
    expect(await svc.providerFacts('wsl:Ubuntu')).toEqual([
      { id: 'p1', reachable: true, models: catalog.models }
    ])
    expect(await svc.providerFacts('wsl:Unknown')).toEqual([])
    expect((await svc.list())[0].models).toEqual(catalog.models)
  })
})
