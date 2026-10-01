import { wslNamespace } from '@domain/runtime/namespace'
import { makeRuntimePath, type RuntimePath } from '@domain/runtime/path-types'
import { describe, expect, it } from 'vitest'

import { deriveLaunchEnv, type DeriveLaunchEnvInput } from './derive-env'
import { makeForbiddenForwardKey } from './forward-env'
import type { CredentialRef, DerivedLaunchEnv, ProviderProfile } from './types'

/** X-1 `LAUNCH_ENV_DENY_PATTERN` と同等 (テスト用に注入する denylist 述語)。 */
const isDenied = (k: string): boolean =>
  /^(WSLENV|.*(API_?KEY|TOKEN|SECRET|PASSWORD)|AWS_.*)$/i.test(k)

/** infra の transport キー (`LAUNCH_ENV_ALLOWLIST` ∪ WSL_UTF8 / WSLENV) と同等。 */
const isForbidden = makeForbiddenForwardKey([
  'SystemRoot',
  'windir',
  'TEMP',
  'TMP',
  'WSL_UTF8',
  'WSLENV'
])

const base = { SystemRoot: 'C:\\Windows', TMP: 'C:\\Temp', WSL_UTF8: '1' }

function rtp(value: string): RuntimePath {
  const r = makeRuntimePath(wslNamespace('Ubuntu'), value)
  if (!r.ok) throw new Error('bad runtime path')
  return r.path
}

function profile(credential: CredentialRef, over: Partial<ProviderProfile> = {}): ProviderProfile {
  return {
    id: 'p1',
    displayName: 'P1',
    backend: 'anthropic',
    credential,
    models: { models: [] },
    ...over
  }
}

function derive(
  input: Partial<DeriveLaunchEnvInput> & { profile: ProviderProfile }
): DerivedLaunchEnv {
  const r = deriveLaunchEnv({
    resolved: {},
    curatedBase: base,
    isDeniedEnvKey: isDenied,
    isForbiddenForwardKey: isForbidden,
    ...input
  })
  if (r === null) throw new Error('derive returned null')
  return r
}

describe('deriveLaunchEnv', () => {
  it('curated base を spread する (置換なので継承に頼らない)', () => {
    const { env } = derive({ profile: profile({ source: 'env-passthrough', varNames: [] }) })
    expect(env.SystemRoot).toBe('C:\\Windows')
    expect(env.WSL_UTF8).toBe('1')
  })

  it('curated base のキーと WSL_UTF8 は forwardKeys に入らない (AD-041 (e) / design-gate R2 C-101)', () => {
    const { forwardKeys } = derive({
      profile: profile({ source: 'api-key', secretRefKey: 'ref-1' }),
      resolved: { apiKeyValue: 'sk-test' }
    })
    expect(forwardKeys).toEqual(['ANTHROPIC_API_KEY'])
    for (const k of ['SystemRoot', 'windir', 'TEMP', 'TMP', 'WSL_UTF8']) {
      expect(forwardKeys).not.toContain(k)
    }
  })

  it('extraEnv の denylist KEY (WSLENV/資格情報) を導出時に除外する (security H-101)', () => {
    const { env, forwardKeys } = derive({
      profile: profile(
        { source: 'env-passthrough', varNames: [] },
        { extraEnv: { WSLENV: 'x', AWS_SECRET_ACCESS_KEY: 'y', MY_FLAG: 'ok' } }
      )
    })
    expect(env.WSLENV).toBeUndefined()
    expect(env.AWS_SECRET_ACCESS_KEY).toBeUndefined()
    expect(env.MY_FLAG).toBe('ok') // 無害キーは通る
    expect(forwardKeys).toEqual(['MY_FLAG'])
  })

  it.each([
    ['CLAUDE_CODE_SHELL_PREFIX', 'evil'],
    ['CLAUDE_CODE_USE_BEDROCK', '1'],
    ['TMPDIR', '/tmp/x'],
    ['PATH', '/x'],
    ['NODE_OPTIONS', '--require x'],
    ['LD_PRELOAD', 'x.so'],
    ['SYSTEMROOT', 'C:\\evil'],
    ['GIT_SSH_COMMAND', 'x'],
    ['PAGER', 'x'],
    ['lower_case', 'x'],
    ['MY_DIR', 'C:\\Users\\y']
  ])(
    'extraEnv の転送禁止キー / 名前規則違反 / Windows パス値は捨てずに null (起動拒否。FR-013 / L-004): %s',
    (key, value) => {
      const r = deriveLaunchEnv({
        profile: profile(
          { source: 'env-passthrough', varNames: [] },
          { extraEnv: { [key]: value, ANTHROPIC_BASE_URL: 'https://proxy.example' } }
        ),
        resolved: {},
        curatedBase: base,
        isDeniedEnvKey: isDenied,
        isForbiddenForwardKey: isForbidden
      })
      expect(r).toBeNull()
    }
  )

  it('extraEnv の実名許可キー (ANTHROPIC_BASE_URL) は転送する (AD-041 (e) 3)', () => {
    const { forwardKeys } = derive({
      profile: profile(
        { source: 'env-passthrough', varNames: [] },
        { extraEnv: { ANTHROPIC_BASE_URL: 'https://proxy.example' } }
      )
    })
    expect(forwardKeys).toEqual(['ANTHROPIC_BASE_URL'])
  })

  it('api-key は ANTHROPIC_API_KEY を実名 curated 注入する (resolved から)', () => {
    const { env, settings } = derive({
      profile: profile({ source: 'api-key', secretRefKey: 'ref-1' }),
      resolved: { apiKeyValue: 'sk-test' }
    })
    expect(env.ANTHROPIC_API_KEY).toBe('sk-test')
    expect(settings).toBeUndefined()
  })

  it('api-key-helper は分類済み RuntimePath を HelperSettings で返す (env に秘密を載せない)', () => {
    const { env, settings } = derive({
      profile: profile({ source: 'api-key-helper', helperPath: '/opt/helper.sh' }),
      resolved: { helperRuntimePath: rtp('/opt/helper.sh') }
    })
    expect(settings).toEqual({ apiKeyHelper: '/opt/helper.sh' })
    expect(env.ANTHROPIC_API_KEY).toBeUndefined()
  })

  it('helper 系で分類済みパスが無ければ null (素の helperPath へ fallback しない。FR-014)', () => {
    for (const source of ['api-key-helper', 'aws-credential-export', 'aws-assume-role'] as const) {
      const r = deriveLaunchEnv({
        profile: profile({ source, helperPath: 'C:\\helper.sh' }),
        resolved: {},
        curatedBase: base,
        isDeniedEnvKey: isDenied,
        isForbiddenForwardKey: isForbidden
      })
      expect(r).toBeNull()
    }
  })

  it('aws-assume-role は awsCredentialExport helper パスを settings で渡し、AWS 一時資格を env に注入しない (R-02 / H-L-201)', () => {
    const { env, settings } = derive({
      profile: profile({ source: 'aws-assume-role', helperPath: '/opt/assume.sh' }),
      resolved: { helperRuntimePath: rtp('/opt/assume.sh') }
    })
    expect(settings).toEqual({ awsCredentialExport: '/opt/assume.sh' })
    expect(env.AWS_ACCESS_KEY_ID).toBeUndefined()
    expect(env.AWS_SECRET_ACCESS_KEY).toBeUndefined()
    expect(env.AWS_SESSION_TOKEN).toBeUndefined()
  })

  it('aws-profile は AWS_PROFILE + Bedrock フラグを実名注入し、転送キーに載せる', () => {
    const { env, forwardKeys } = derive({
      profile: profile(
        { source: 'aws-profile', profileName: 'prod', region: 'us-east-1' },
        { backend: 'bedrock' }
      )
    })
    expect(env.AWS_PROFILE).toBe('prod')
    expect(env.AWS_REGION).toBe('us-east-1')
    expect(env.CLAUDE_CODE_USE_BEDROCK).toBe('1')
    expect(forwardKeys).toEqual(['AWS_PROFILE', 'AWS_REGION', 'CLAUDE_CODE_USE_BEDROCK'])
  })

  it('config-dir は resolved の RuntimePath 値を CLAUDE_CONFIG_DIR に注入する (素の HostPath 不可。H-02)', () => {
    const { env, forwardKeys } = derive({
      profile: profile({ source: 'config-dir' }),
      resolved: { configDirRuntimePath: rtp('/home/y/.claude') }
    })
    expect(env.CLAUDE_CONFIG_DIR).toBe('/home/y/.claude')
    expect(forwardKeys).toEqual(['CLAUDE_CONFIG_DIR'])
  })

  it('extraEnv 経由の CLAUDE_CONFIG_DIR は導出が締め出す (RuntimePath 変換を迂回させない。PB-H-001)', () => {
    const { env } = derive({
      profile: profile(
        { source: 'env-passthrough', varNames: [] },
        { extraEnv: { CLAUDE_CONFIG_DIR: 'C:\\Users\\y\\.claude', MY_FLAG: 'ok' } }
      ),
      // 何も禁じない述語を注入しても、導出が制御するキーは締め出す。
      isForbiddenForwardKey: () => false
    })
    expect(env.CLAUDE_CONFIG_DIR).toBeUndefined() // 転送禁止述語の中身に依らず締め出す
    expect(env.MY_FLAG).toBe('ok')
  })

  it('config-dir で resolved 未解決でも extraEnv の CLAUDE_CONFIG_DIR で backfill されない (PB-H-001)', () => {
    const { env } = derive({
      profile: profile(
        { source: 'config-dir' },
        { extraEnv: { CLAUDE_CONFIG_DIR: 'C:\\Users\\y\\.claude' } }
      )
    })
    expect(env.CLAUDE_CONFIG_DIR).toBeUndefined()
  })

  it('env-passthrough は allowlist の varNames を process.env 由来の値で転送する (AD-041 (e) 4)', () => {
    const { env, forwardKeys } = derive({
      profile: profile({
        source: 'env-passthrough',
        varNames: ['ANTHROPIC_API_KEY', 'AWS_REGION']
      }),
      resolved: { passthroughValues: { ANTHROPIC_API_KEY: 'sk-parent' } }
    })
    expect(env.ANTHROPIC_API_KEY).toBe('sk-parent')
    // 親 env に無い変数は渡さない。
    expect(env.AWS_REGION).toBeUndefined()
    expect(forwardKeys).toEqual(['ANTHROPIC_API_KEY'])
  })

  it('env-passthrough の allowlist 外の varName は null (PATH / CLAUDE_CONFIG_DIR / 任意の秘密)', () => {
    for (const name of ['PATH', 'CLAUDE_CONFIG_DIR', 'GH_TOKEN']) {
      const r = deriveLaunchEnv({
        profile: profile({ source: 'env-passthrough', varNames: ['ANTHROPIC_API_KEY', name] }),
        resolved: { passthroughValues: { ANTHROPIC_API_KEY: 'sk', [name]: 'v' } },
        curatedBase: base,
        isDeniedEnvKey: isDenied,
        isForbiddenForwardKey: isForbidden
      })
      expect(r).toBeNull()
    }
  })

  it('env-passthrough の値が Windows パスなら null (/u 転送は変換しない。design-gate R3 M-304)', () => {
    const r = deriveLaunchEnv({
      profile: profile({ source: 'env-passthrough', varNames: ['ANTHROPIC_BASE_URL'] }),
      resolved: { passthroughValues: { ANTHROPIC_BASE_URL: 'C:\\x' } },
      curatedBase: base,
      isDeniedEnvKey: isDenied,
      isForbiddenForwardKey: isForbidden
    })
    expect(r).toBeNull()
  })
})
