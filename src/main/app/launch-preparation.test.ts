import { describe, expect, it, vi } from 'vitest'

import { assessReachability } from '@domain/provider/reachability'
import type { DerivedLaunchEnv, ProviderProfile } from '@domain/provider/types'
import { fixedCapabilities } from '@domain/runtime/capabilities'
import type { Win32RuntimeDescriptor, WslRuntimeDescriptor } from '@domain/runtime/descriptor'
import { wslNamespace } from '@domain/runtime/namespace'
import { makeHostPath, makeRuntimePath } from '@domain/runtime/path-types'
import { createVerifiedRunning } from '@domain/runtime/verified-running'
import { isWin32LaunchSpec } from '@domain/session/agent-session'
import { DEFAULT_EXTRA_AXES, type SessionLaunchConfig } from '@domain/session/launch-config'
import type * as launchResolution from '@domain/session/launch-resolution'
import type { LaunchBlocker, ProviderFact } from '@domain/session/launch-resolution'
import type { WorkspaceFolder } from '@domain/workspace/folder'
import { createWin32 } from '@domain/workspace/__fixtures__/runtime'

import { buildRuntimeLaunchSpec, composeLaunchEnv } from '../infra/runtime/launch-spec'
import { buildWin32LaunchSpec, composeWin32LaunchEnv } from '../infra/runtime/win32-launch'
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
    win32BaseEnv: () => ({ SystemRoot: 'C:\\Windows' }),
    composeWin32LaunchEnv,
    buildWin32LaunchSpec,
    win32ClaudeIsFile: async () => true,
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
  ...DEFAULT_EXTRA_AXES,
  sessionName: null,
  ...over
})

describe('createPrepareLaunch', () => {
  it('有効な設定で X-1 の launch 入力を組む (--exec 形 / WSLENV / Bedrock は inference profile ID で pin)', async () => {
    const prep = await createPrepareLaunch(deps())(config())
    if (prep === null || !prep.ok) throw new Error('expected ok')
    if (isWin32LaunchSpec(prep.spec)) throw new Error('expected wsl spec')
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
        reachable: assessReachability(helperProfile, stopped, () => false) === 'reachable',
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

/** X-8 (data-model §7): Win32Runtime の起動前段。 */
describe('createPrepareLaunch (Win32Runtime)', () => {
  const CLAUDE = 'C:\\Users\\u\\.local\\bin\\claude.exe'
  const hostBase = {
    SystemRoot: 'C:\\WINDOWS',
    windir: 'C:\\WINDOWS',
    PATH: 'C:\\WINDOWS\\system32'
  }
  const win32 = (over: Partial<Win32RuntimeDescriptor> = {}): Win32RuntimeDescriptor => ({
    ...createWin32(NOW, { claudePath: CLAUDE, claudeStatus: 'found', claudeOverridden: false }),
    ...over
  })
  const windowsFolder = (value = 'C:\\dev\\closta'): WorkspaceFolder => {
    const hp = makeHostPath(value)
    if (!hp.ok) throw new Error('bad path')
    return {
      id: 'f1',
      location: { kind: 'windows' },
      path: hp.path,
      displayName: 'proj',
      registeredAt: NOW
    }
  }
  const win32Config = (over: Partial<SessionLaunchConfig> = {}): SessionLaunchConfig =>
    config({ runtimeId: 'host', providerId: null, modelId: null, effort: null, ...over })
  const win32Deps = (over: Partial<LaunchPreparationDeps> = {}): LaunchPreparationDeps =>
    deps({
      folders: () => [windowsFolder()],
      runtimes: () => [win32()],
      win32BaseEnv: () => hostBase,
      win32ClaudeIsFile: async () => true,
      ...over
    })

  it('Windows の作業フォルダ × found で Win32LaunchSpec を組む (cwd・command・prefixArgs なし)', async () => {
    const prep = await createPrepareLaunch(win32Deps())(win32Config())
    if (prep === null || !prep.ok) throw new Error('expected ok')
    if (!isWin32LaunchSpec(prep.spec)) throw new Error('expected win32 spec')
    expect(prep.spec.cwd).toBe('C:\\dev\\closta')
    expect(prep.spec.command).toBe(CLAUDE)
    expect(prep.spec.pathToClaudeCodeExecutable).toBe(CLAUDE)
    expect('prefixArgs' in prep.spec).toBe(false)
    expect(prep.spec.windowsHide).toBe(true)
    expect('WSLENV' in prep.spec.env).toBe(false)
    expect(prep.input.runtime.kind).toBe('win32')
    expect('verified' in prep.input).toBe(false)
    expect(prep.input.options).toEqual({ permissionMode: 'plan' })
  })

  it('別のドライブの作業フォルダでも組める', async () => {
    const prep = await createPrepareLaunch(
      win32Deps({ folders: () => [windowsFolder('D:\\work\\p')] })
    )(win32Config())
    if (prep === null || !prep.ok || !isWin32LaunchSpec(prep.spec)) throw new Error('expected ok')
    expect(prep.spec.cwd).toBe('D:\\work\\p')
  })

  it('所在 WSL の作業フォルダ × Win32 は invalid-config (U-3)', async () => {
    const prep = await createPrepareLaunch(win32Deps({ folders: () => [folder()] }))(win32Config())
    expect(prep).toEqual({ ok: false, reason: 'invalid-config' })
  })

  it.each(['not-found', 'shim-only', 'override-invalid'] as const)(
    'claudeStatus が %s なら claude-not-found',
    async (claudeStatus) => {
      const prep = await createPrepareLaunch(
        win32Deps({
          runtimes: () => [
            win32({
              claudeStatus,
              claudePath: null,
              claudeOverridden: claudeStatus === 'override-invalid'
            })
          ]
        })
      )(win32Config())
      expect(prep).toEqual({ ok: false, reason: 'claude-not-found' })
    }
  )

  it('found でも起動の時点でファイルが無ければ claude-not-found', async () => {
    const prep = await createPrepareLaunch(win32Deps({ win32ClaudeIsFile: async () => false }))(
      win32Config()
    )
    expect(prep).toEqual({ ok: false, reason: 'claude-not-found' })
  })

  it('依存解決の blocker (未知のフォルダ指定) は invalid-config', async () => {
    axesOverride.blockers = ['runtime-missing']
    try {
      expect(await createPrepareLaunch(win32Deps())(win32Config())).toEqual({
        ok: false,
        reason: 'invalid-config'
      })
    } finally {
      axesOverride.blockers = null
    }
  })

  it('deriveEnv が null / throw で provider-unavailable', async () => {
    const withProvider = win32Config({ providerId: 'p1', modelId: 'sonnet', effort: 'high' })
    expect(
      await createPrepareLaunch(win32Deps({ deriveEnv: async () => null }))(withProvider)
    ).toEqual({ ok: false, reason: 'provider-unavailable' })
    expect(
      await createPrepareLaunch(
        win32Deps({
          deriveEnv: async () => {
            throw new Error('boom')
          }
        })
      )(withProvider)
    ).toEqual({ ok: false, reason: 'provider-unavailable' })
  })

  it('env 合成の throw は invalid-config、起動の値の組み立ての throw は launch-failed', async () => {
    const withProvider = win32Config({ providerId: 'p1', modelId: 'sonnet', effort: 'high' })
    expect(
      await createPrepareLaunch(
        win32Deps({
          composeWin32LaunchEnv: () => {
            throw new Error('x')
          }
        })
      )(withProvider)
    ).toEqual({ ok: false, reason: 'invalid-config' })
    expect(
      await createPrepareLaunch(win32Deps({ win32BaseEnv: () => ({}) }))(win32Config())
    ).toEqual({ ok: false, reason: 'launch-failed' })
  })

  it('Provider の forwardKeys の値が起動の env に届く (WSL の curated base は入らない)', async () => {
    const d: DerivedLaunchEnv = {
      env: { ...baseEnv, ANTHROPIC_API_KEY: 'sk-test' },
      forwardKeys: ['ANTHROPIC_API_KEY']
    }
    const prep = await createPrepareLaunch(win32Deps({ deriveEnv: async () => d }))(
      win32Config({ providerId: 'p1', modelId: 'sonnet', effort: 'high' })
    )
    if (prep === null || !prep.ok) throw new Error('expected ok')
    expect(prep.spec.env.ANTHROPIC_API_KEY).toBe('sk-test')
    expect('WSL_UTF8' in prep.spec.env).toBe(false)
    expect('WSLENV' in prep.spec.env).toBe(false)
  })

  describe('Provider の行 (US-4 / data-model §6.2 / §6.4)', () => {
    const withProvider = (): SessionLaunchConfig =>
      win32Config({ providerId: 'p1', modelId: 'sonnet', effort: 'high' })
    const prepareWith = (
      d: DerivedLaunchEnv,
      host: Record<string, string> = hostBase
    ): ReturnType<ReturnType<typeof createPrepareLaunch>> =>
      createPrepareLaunch(win32Deps({ deriveEnv: async () => d, win32BaseEnv: () => host }))(
        withProvider()
      )

    it('ホストの configDir の Provider は CLAUDE_CONFIG_DIR にその HostPath が入る', async () => {
      const dir = 'C:\\Users\\u\\.claude-alt'
      const prep = await prepareWith({
        env: { ...baseEnv, CLAUDE_CONFIG_DIR: dir },
        forwardKeys: ['CLAUDE_CONFIG_DIR']
      })
      if (prep === null || !prep.ok) throw new Error('expected ok')
      expect(prep.spec.env.CLAUDE_CONFIG_DIR).toBe(dir)
    })

    it('環境変数の方式の Provider は forwardKeys の値が届く', async () => {
      const prep = await prepareWith({
        env: { ...baseEnv, ANTHROPIC_API_KEY: 'sk-from-env' },
        forwardKeys: ['ANTHROPIC_API_KEY']
      })
      if (prep === null || !prep.ok) throw new Error('expected ok')
      expect(prep.spec.env.ANTHROPIC_API_KEY).toBe('sk-from-env')
    })

    it('extraEnv の HTTPS_PROXY は Provider の値がホストの値に勝つ', async () => {
      const prep = await prepareWith(
        { env: { ...baseEnv, HTTPS_PROXY: 'http://provider:1' }, forwardKeys: ['HTTPS_PROXY'] },
        { ...hostBase, HTTPS_PROXY: 'http://host:2' }
      )
      if (prep === null || !prep.ok) throw new Error('expected ok')
      expect(prep.spec.env.HTTPS_PROXY).toBe('http://provider:1')
    })

    it.each(['USERNAME', 'NUMBER_OF_PROCESSORS', 'NODE_EXTRA_CA_CERTS'])(
      'extraEnv の %s (Win32 の transport のキー) は invalid-config',
      async (key) => {
        const prep = await prepareWith(
          { env: { ...baseEnv, [key]: 'x' }, forwardKeys: [key] },
          { ...hostBase, [key]: 'host-value' }
        )
        expect(prep).toEqual({ ok: false, reason: 'invalid-config' })
      }
    )

    it('値に制御文字があれば invalid-config', async () => {
      const prep = await prepareWith({
        env: { ...baseEnv, FOO_BAR: 'a\u0001b' },
        forwardKeys: ['FOO_BAR']
      })
      expect(prep).toEqual({ ok: false, reason: 'invalid-config' })
    })

    it('env に WSLENV / WSL_UTF8 と許可リストの外のキーが無い', async () => {
      const prep = await prepareWith(
        {
          env: { ...baseEnv, ANTHROPIC_API_KEY: 'sk-x', WSLENV: 'A/u' },
          forwardKeys: ['ANTHROPIC_API_KEY']
        },
        { ...hostBase }
      )
      if (prep === null || !prep.ok) throw new Error('expected ok')
      expect(Object.keys(prep.spec.env).sort()).toEqual(
        ['ANTHROPIC_API_KEY', 'PATH', 'SystemRoot', 'windir'].sort()
      )
    })
  })

  it('拒否理由の記録にパス・env の値を含めない', async () => {
    const logRejection = vi.fn()
    await createPrepareLaunch(win32Deps({ logRejection, win32ClaudeIsFile: async () => false }))(
      win32Config()
    )
    expect(logRejection).toHaveBeenCalledWith('claude-not-found')
    expect(JSON.stringify(logRejection.mock.calls)).not.toContain('claude.exe')
  })

  it('WSL の起動は Win32 の依存を呼ばない (既存の経路が変わらない)', async () => {
    const win32ClaudeIsFile = vi.fn(async () => true)
    const prep = await createPrepareLaunch(deps({ win32ClaudeIsFile }))(config())
    expect(prep !== null && prep.ok).toBe(true)
    expect(win32ClaudeIsFile).not.toHaveBeenCalled()
  })
})

describe('resolveLaunchAxes の distro-mismatch (X-8 / data-model §7)', () => {
  const draft = {
    folderId: 'f1',
    runtimeId: 'r',
    providerId: null,
    modelId: null,
    effort: null,
    permissionMode: 'plan' as const,
    ...DEFAULT_EXTRA_AXES
  }
  it('distroName が null のランタイムの facts では出ない', async () => {
    const actual = await vi.importActual<typeof launchResolution>(
      '@domain/session/launch-resolution'
    )
    const result = actual.resolveLaunchAxes(draft, {
      folders: [{ id: 'f1', distroName: 'Ubuntu' }],
      runtimes: [{ id: 'r', distroName: null, running: true }],
      providers: []
    })
    expect(result.blockers).not.toContain('distro-mismatch')
  })

  it('WSL の facts では今どおり出る', async () => {
    const actual = await vi.importActual<typeof launchResolution>(
      '@domain/session/launch-resolution'
    )
    const result = actual.resolveLaunchAxes(draft, {
      folders: [{ id: 'f1', distroName: 'Ubuntu' }],
      runtimes: [{ id: 'r', distroName: 'Debian', running: true }],
      providers: []
    })
    expect(result.blockers).toContain('distro-mismatch')
  })
})

/** 024 data-model §4.3 (SC-003 の main の部分): 上限と名前の options。WSL と Win32 の両方。 */
describe('createPrepareLaunch (上限と名前の options。024)', () => {
  const CLAUDE = 'C:\\Users\\u\\.local\\bin\\claude.exe'
  const hostBase = {
    SystemRoot: 'C:\\WINDOWS',
    windir: 'C:\\WINDOWS',
    PATH: 'C:\\WINDOWS\\system32'
  }
  const winFolder = (): WorkspaceFolder => {
    const hp = makeHostPath('C:\\dev\\closta')
    if (!hp.ok) throw new Error('bad path')
    return {
      id: 'f1',
      location: { kind: 'windows' },
      path: hp.path,
      displayName: 'proj',
      registeredAt: NOW
    }
  }
  const win32Deps = (): LaunchPreparationDeps =>
    deps({
      folders: () => [winFolder()],
      runtimes: () => [
        createWin32(NOW, { claudePath: CLAUDE, claudeStatus: 'found', claudeOverridden: false })
      ],
      win32BaseEnv: () => hostBase,
      win32ClaudeIsFile: async () => true
    })
  const winConfig = (over: Partial<SessionLaunchConfig> = {}): SessionLaunchConfig =>
    config({ runtimeId: 'host', providerId: null, modelId: null, effort: null, ...over })

  const extraKeys = ['maxTurns', 'maxBudgetUsd', 'title']

  it('WSL: 上限と名前が null なら 3 キーが options に無い', async () => {
    const prep = await createPrepareLaunch(deps())(config())
    if (prep === null || !prep.ok) throw new Error('expected ok')
    for (const key of extraKeys) expect(key in prep.input.options).toBe(false)
  })

  it('WSL: 値があれば同じ値で載る', async () => {
    const prep = await createPrepareLaunch(deps())(
      config({ maxTurns: 30, maxBudgetUsd: 2.5, sessionName: 'ログインの API 修正' })
    )
    if (prep === null || !prep.ok) throw new Error('expected ok')
    expect(prep.input.options).toMatchObject({
      maxTurns: 30,
      maxBudgetUsd: 2.5,
      title: 'ログインの API 修正'
    })
  })

  it('Win32: 上限と名前が null なら 3 キーが options に無い', async () => {
    const prep = await createPrepareLaunch(win32Deps())(winConfig())
    if (prep === null || !prep.ok) throw new Error('expected ok')
    for (const key of extraKeys) expect(key in prep.input.options).toBe(false)
  })

  it('Win32: 値があれば同じ値で載る', async () => {
    const prep = await createPrepareLaunch(win32Deps())(
      winConfig({ maxTurns: 1, maxBudgetUsd: 0.01, sessionName: 'name' })
    )
    if (prep === null || !prep.ok) throw new Error('expected ok')
    expect(prep.input.options).toMatchObject({ maxTurns: 1, maxBudgetUsd: 0.01, title: 'name' })
  })

  it('名前も上限もログ (logRejection) に出ない', async () => {
    const logRejection = vi.fn()
    await createPrepareLaunch(deps({ logRejection, runtimes: () => [] }))(
      config({ sessionName: 'ひみつの名前', maxTurns: 777 })
    )
    await createPrepareLaunch(deps({ logRejection, verifyRunning: async () => null }))(
      config({ sessionName: 'ひみつの名前', maxTurns: 777 })
    )
    for (const call of logRejection.mock.calls) {
      expect(JSON.stringify(call)).not.toContain('ひみつ')
      expect(JSON.stringify(call)).not.toContain('777')
    }
  })
})
