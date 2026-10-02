import { describe, expect, it, vi } from 'vitest'

import { assessReachability } from '@domain/provider/reachability'
import type { DerivedLaunchEnv, ProviderProfile } from '@domain/provider/types'
import { fixedCapabilities } from '@domain/runtime/capabilities'
import type { WslRuntimeDescriptor } from '@domain/runtime/descriptor'
import { wslNamespace } from '@domain/runtime/namespace'
import { makeRuntimePath } from '@domain/runtime/path-types'
import { createVerifiedRunning } from '@domain/runtime/verified-running'
import type { SessionLaunchConfig } from '@domain/session/launch-config'
import type * as launchResolution from '@domain/session/launch-resolution'
import type { LaunchBlocker, ProviderFact } from '@domain/session/launch-resolution'
import type { WorkspaceFolder } from '@domain/workspace/folder'

import { buildRuntimeLaunchSpec, composeLaunchEnv } from '../infra/runtime/launch-spec'
import { createPrepareLaunch, type LaunchPreparationDeps } from './launch-preparation'

/**
 * main の facts は実行状態を `running: true` で渡す (実行中確認は evaluateLaunch が正) ため、
 * `runtime-stopped` blocker は入力からは作れない。理由キーの対応付けだけを測るために blocker を差し替える。
 */
const axesOverride = vi.hoisted(() => ({ blockers: null as readonly LaunchBlocker[] | null }))
vi.mock('@domain/session/launch-resolution', async (importOriginal) => {
  const actual = await importOriginal<typeof launchResolution>()
  return {
    ...actual,
    resolveLaunchAxes: (...args: Parameters<typeof actual.resolveLaunchAxes>) => {
      const r = actual.resolveLaunchAxes(...args)
      return axesOverride.blockers === null ? r : { ...r, blockers: axesOverride.blockers }
    }
  }
})

/**
 * X-4 — main の起動ゲート (SC-002 の「main 起動ゲートの単体」/ SC-007 の「fork env に導出キーが 0」/
 * SC-009 の「X-1 の launch を再利用し --exec 形」)。
 */

const NOW = 1_000_000
const runtime: WslRuntimeDescriptor = {
  id: wslNamespace('Ubuntu'),
  kind: 'wsl',
  state: 'running',
  isDefault: false,
  capabilities: fixedCapabilities(NOW),
  detectedAt: NOW,
  distroName: 'Ubuntu',
  wslVersion: 2,
  pathMapping: null,
  claudePath: '/home/u/.local/bin/claude'
}

function folder(): WorkspaceFolder {
  const rp = makeRuntimePath(wslNamespace('Ubuntu'), '/home/u/proj')
  if (!rp.ok) throw new Error('bad path')
  return {
    id: 'f1',
    location: { kind: 'wsl', distroName: 'Ubuntu' },
    path: rp.path,
    displayName: 'proj',
    registeredAt: NOW
  }
}

const baseEnv = { SystemRoot: 'C:\\Windows', TMP: 'C:\\Temp', WSL_UTF8: '1' }

const catalog: ProviderFact = {
  id: 'p1',
  reachable: true,
  models: [
    {
      id: 'sonnet',
      displayName: 'Sonnet',
      inferenceProfileId: 'us.anthropic.claude-sonnet-4-5-v1:0',
      supportedEffortLevels: ['high']
    }
  ]
}

const derived: DerivedLaunchEnv = {
  env: { ...baseEnv, ANTHROPIC_API_KEY: 'sk-test' },
  forwardKeys: ['ANTHROPIC_API_KEY'],
  settings: { apiKeyHelper: '/opt/h.sh' }
}

function deps(over: Partial<LaunchPreparationDeps> = {}): LaunchPreparationDeps {
  return {
    folders: () => [folder()],
    runtimes: () => [runtime],
    verifyRunning: async (id) => createVerifiedRunning(id, NOW),
    providerFacts: async () => [catalog],
    deriveEnv: async () => derived,
    baseEnv: () => baseEnv,
    resolveCwd: (f) => f.path.value,
    composeLaunchEnv,
    buildRuntimeLaunchSpec,
    now: () => NOW,
    logRejection: vi.fn(),
    ...over
  }
}

const config = (over: Partial<SessionLaunchConfig> = {}): SessionLaunchConfig => ({
  folderId: 'f1',
  runtimeId: 'wsl:Ubuntu',
  providerId: 'p1',
  modelId: 'sonnet',
  effort: 'high',
  permissionMode: 'plan',
  ...over
})

describe('createPrepareLaunch', () => {
  it('有効な設定で X-1 の launch 入力を組む (--exec 形 / WSLENV / Bedrock は inference profile ID で pin)', async () => {
    const prep = await createPrepareLaunch(deps())(config())
    if (prep === null || !prep.ok) throw new Error('expected ok')
    expect(prep.spec.prefixArgs.at(-1)).toBe('--exec')
    expect(prep.spec.env.WSLENV).toBe('ANTHROPIC_API_KEY/u')
    expect(prep.spec.env.ANTHROPIC_API_KEY).toBe('sk-test')
    expect(prep.input.options).toEqual({
      permissionMode: 'plan',
      model: 'us.anthropic.claude-sonnet-4-5-v1:0',
      effort: 'high',
      settings: { apiKeyHelper: '/opt/h.sh' }
    })
  })

  it('起動前段の結果は fork env を持たない (fork env は接続の構築時に curated base を注入する。AD-041 (e) 6 / X-5 pr-gate R1 platform-boundary L-001)', async () => {
    const prep = await createPrepareLaunch(deps())(config())
    if (prep === null || !prep.ok) throw new Error('expected ok')
    expect('env' in prep).toBe(false)
  })

  it('既定 Provider は deriveEnv を呼ばず curated base だけで起動する', async () => {
    const deriveEnv = vi.fn(async () => derived)
    const prep = await createPrepareLaunch(deps({ deriveEnv }))(
      config({ providerId: null, modelId: null, effort: null })
    )
    if (prep === null || !prep.ok) throw new Error('expected ok')
    expect(deriveEnv).not.toHaveBeenCalled()
    expect(prep.spec.env.WSLENV).toBeUndefined()
    expect(prep.input.options).toEqual({ permissionMode: 'plan' })
  })

  it('Provider が到達不可 / 削除済みなら黙って既定で起動せず needs-confirmation', async () => {
    const logRejection = vi.fn()
    for (const facts of [[{ ...catalog, reachable: false }], []]) {
      const prep = await createPrepareLaunch(
        deps({ providerFacts: async () => facts, logRejection })
      )(config())
      expect(prep).toEqual({ ok: false, reason: 'needs-confirmation' })
    }
    expect(logRejection).toHaveBeenCalledWith('needs-confirmation')
  })

  it('カタログ外のモデル / 非対応の effort は invalid-config (renderer の善意に依存しない)', async () => {
    expect(await createPrepareLaunch(deps())(config({ modelId: 'other', effort: null }))).toEqual({
      ok: false,
      reason: 'invalid-config'
    })
    expect(await createPrepareLaunch(deps())(config({ effort: 'max' }))).toEqual({
      ok: false,
      reason: 'invalid-config'
    })
  })

  it('deriveEnv が null なら provider-unavailable', async () => {
    const prep = await createPrepareLaunch(deps({ deriveEnv: async () => null }))(config())
    expect(prep).toEqual({ ok: false, reason: 'provider-unavailable' })
  })

  it('転送キーの規則違反は invalid-config (composeLaunchEnv が throw)', async () => {
    const bad: DerivedLaunchEnv = { env: { ...baseEnv }, forwardKeys: ['TMP'] }
    const prep = await createPrepareLaunch(deps({ deriveEnv: async () => bad }))(config())
    expect(prep).toEqual({ ok: false, reason: 'invalid-config' })
  })

  it('未知の folder / runtime は null (unknown-target)', async () => {
    expect(await createPrepareLaunch(deps())(config({ folderId: 'nope' }))).toBeNull()
    expect(await createPrepareLaunch(deps())(config({ runtimeId: 'wsl:Nope' }))).toBeNull()
  })

  it('実行中確認が取れなければ X-1 のゲート理由で拒否する', async () => {
    const prep = await createPrepareLaunch(deps({ verifyRunning: async () => null }))(config())
    expect(prep).toEqual({ ok: false, reason: 'not-verified-running' })
  })

  it('起動後に Provider が削除されても、起動時に組んだ spec / options は変わらない (起動時スナップショット。spec Edge Case)', async () => {
    let facts: ProviderFact[] = [catalog]
    const d = deps({ providerFacts: async () => facts })
    const prep = await createPrepareLaunch(d)(config())
    if (prep === null || !prep.ok) throw new Error('expected ok')
    const envBefore = JSON.stringify(prep.spec.env)
    const optionsBefore = JSON.stringify(prep.input.options)
    facts = [] // Provider を削除
    // 次の起動には効く (確認を要する) が、既に組んだ起動入力は変わらない。
    expect(await createPrepareLaunch(d)(config())).toEqual({
      ok: false,
      reason: 'needs-confirmation'
    })
    expect(JSON.stringify(prep.spec.env)).toBe(envBefore)
    expect(JSON.stringify(prep.input.options)).toBe(optionsBefore)
  })

  it('deriveEnv の throw (safeStorage の復号失敗など) は provider-unavailable に正規化する (L-001)', async () => {
    const logRejection = vi.fn()
    const prep = await createPrepareLaunch(
      deps({
        logRejection,
        deriveEnv: async () => {
          throw new Error('decrypt failed: sk-leaked-value')
        }
      })
    )(config())
    expect(prep).toEqual({ ok: false, reason: 'provider-unavailable' })
    expect(logRejection).toHaveBeenCalledWith('provider-unavailable')
    expect(JSON.stringify(logRejection.mock.calls)).not.toContain('sk-leaked-value')
  })

  it('buildRuntimeLaunchSpec の throw (引数のバックスラッシュ / ランチャ解決不能) は launch-failed (L-001)', async () => {
    const logRejection = vi.fn()
    const backslash = await createPrepareLaunch(
      deps({ logRejection, resolveCwd: () => 'C:\\Users\\u\\secret-dir' })
    )(config())
    expect(backslash).toEqual({ ok: false, reason: 'launch-failed' })
    const noSystemRoot = await createPrepareLaunch(deps({ baseEnv: () => ({ WSL_UTF8: '1' }) }))(
      config({ providerId: null, modelId: null, effort: null })
    )
    expect(noSystemRoot).toEqual({ ok: false, reason: 'launch-failed' })
    expect(JSON.stringify(logRejection.mock.calls)).not.toContain('secret-dir')
  })

  it('main の再評価で runtime-stopped が残ったら distro-not-running (po L-003)', async () => {
    axesOverride.blockers = ['runtime-stopped']
    try {
      expect(await createPrepareLaunch(deps())(config())).toEqual({
        ok: false,
        reason: 'distro-not-running'
      })
      axesOverride.blockers = ['distro-mismatch']
      expect(await createPrepareLaunch(deps())(config())).toEqual({
        ok: false,
        reason: 'invalid-config'
      })
    } finally {
      axesOverride.blockers = null
    }
  })

  it('キャッシュが stopped で POSIX helper Provider が到達不可になっても、needs-confirmation ではなく distro-not-running (pr-gate R2 platform-boundary L-401)', async () => {
    const stopped: WslRuntimeDescriptor = { ...runtime, state: 'stopped' }
    const helperProfile: ProviderProfile = {
      id: 'p1',
      displayName: 'Helper',
      backend: 'anthropic',
      credential: { source: 'api-key-helper', helperPath: '/opt/h.sh' },
      models: { models: catalog.models }
    }
    // provider-service.providerFacts と同じく、キャッシュ上の descriptor で到達可能性を判定する。
    const providerFacts = async (): Promise<readonly ProviderFact[]> => [
      {
        id: helperProfile.id,
        reachable: assessReachability(helperProfile, stopped) === 'reachable',
        models: helperProfile.models.models
      }
    ]
    const verifyRunning = vi.fn(async (id: Parameters<LaunchPreparationDeps['verifyRunning']>[0]) =>
      createVerifiedRunning(id, NOW)
    )
    const logRejection = vi.fn()
    const prep = await createPrepareLaunch(
      deps({ runtimes: () => [stopped], providerFacts, verifyRunning, logRejection })
    )(config())
    expect(prep).toEqual({ ok: false, reason: 'distro-not-running' })
    expect(logRejection).toHaveBeenCalledWith('distro-not-running')
    expect(logRejection).not.toHaveBeenCalledWith('needs-confirmation')
  })

  it('キャッシュが stopped でも、削除済み Provider は needs-confirmation のまま (L-401 の対象は到達不可だけ)', async () => {
    const stopped: WslRuntimeDescriptor = { ...runtime, state: 'stopped' }
    const prep = await createPrepareLaunch(
      deps({ runtimes: () => [stopped], providerFacts: async () => [] })
    )(config())
    expect(prep).toEqual({ ok: false, reason: 'needs-confirmation' })
  })

  it('拒否理由の記録に値 (パス・モデル ID・秘密) を含めない', async () => {
    const logRejection = vi.fn()
    await createPrepareLaunch(deps({ logRejection, deriveEnv: async () => null }))(config())
    expect(logRejection).toHaveBeenCalledWith('provider-unavailable')
    expect(JSON.stringify(logRejection.mock.calls)).not.toContain('sonnet')
  })
})
