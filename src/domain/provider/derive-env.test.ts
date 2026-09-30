import { wslNamespace } from '@domain/runtime/namespace'
import { makeRuntimePath } from '@domain/runtime/path-types'
import { describe, expect, it } from 'vitest'

import { deriveLaunchEnv } from './derive-env'
import type { CredentialRef, ProviderProfile } from './types'

/** X-1 `LAUNCH_ENV_DENY_PATTERN` と同等 (テスト用に注入する denylist 述語)。 */
const isDenied = (k: string): boolean =>
  /^(WSLENV|.*(API_?KEY|TOKEN|SECRET|PASSWORD)|AWS_.*)$/i.test(k)

const base = { SystemRoot: 'C:\\Windows', WSL_UTF8: '1' }

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

describe('deriveLaunchEnv', () => {
  it('curated base を spread する (置換なので継承に頼らない)', () => {
    const { env } = deriveLaunchEnv({
      profile: profile({ source: 'env-passthrough', varNames: [] }),
      resolved: {},
      curatedBase: base,
      isDeniedEnvKey: isDenied
    })
    expect(env.SystemRoot).toBe('C:\\Windows')
    expect(env.WSL_UTF8).toBe('1')
  })

  it('extraEnv の denylist KEY (WSLENV/資格情報) を導出時に除外する (security H-101)', () => {
    const { env } = deriveLaunchEnv({
      profile: profile(
        { source: 'env-passthrough', varNames: [] },
        { extraEnv: { WSLENV: 'x', AWS_SECRET_ACCESS_KEY: 'y', MY_FLAG: 'ok' } }
      ),
      resolved: {},
      curatedBase: base,
      isDeniedEnvKey: isDenied
    })
    expect(env.WSLENV).toBeUndefined()
    expect(env.AWS_SECRET_ACCESS_KEY).toBeUndefined()
    expect(env.MY_FLAG).toBe('ok') // 無害キーは通る
  })

  it('api-key は ANTHROPIC_API_KEY を実名 curated 注入する (resolved から)', () => {
    const { env, settings } = deriveLaunchEnv({
      profile: profile({ source: 'api-key', secretRefKey: 'ref-1' }),
      resolved: { apiKeyValue: 'sk-test' },
      curatedBase: base,
      isDeniedEnvKey: isDenied
    })
    expect(env.ANTHROPIC_API_KEY).toBe('sk-test')
    expect(settings).toBeUndefined()
  })

  it('api-key-helper は HelperSettings を返す (env に秘密を載せない)', () => {
    const { env, settings } = deriveLaunchEnv({
      profile: profile({ source: 'api-key-helper', helperPath: '/opt/helper.sh' }),
      resolved: {},
      curatedBase: base,
      isDeniedEnvKey: isDenied
    })
    expect(settings).toEqual({ apiKeyHelper: '/opt/helper.sh' })
    expect(env.ANTHROPIC_API_KEY).toBeUndefined()
  })

  it('aws-assume-role は awsCredentialExport helper パスを settings で渡し、AWS 一時資格を env に注入しない (R-02 / H-L-201)', () => {
    const { env, settings } = deriveLaunchEnv({
      profile: profile({ source: 'aws-assume-role', helperPath: '/opt/assume.sh' }),
      resolved: { awsCredentialExportPath: '/opt/assume.sh' },
      curatedBase: base,
      isDeniedEnvKey: isDenied
    })
    expect(settings).toEqual({ awsCredentialExport: '/opt/assume.sh' })
    // R-02: アプリは一時資格の実体を持たず env に実名注入しない (廃案 direct-AssumeRole の再導入を塞ぐ)。
    expect(env.AWS_ACCESS_KEY_ID).toBeUndefined()
    expect(env.AWS_SECRET_ACCESS_KEY).toBeUndefined()
    expect(env.AWS_SESSION_TOKEN).toBeUndefined()
  })

  it('aws-profile は AWS_PROFILE + Bedrock フラグを実名注入する', () => {
    const { env } = deriveLaunchEnv({
      profile: profile(
        { source: 'aws-profile', profileName: 'prod', region: 'us-east-1' },
        { backend: 'bedrock' }
      ),
      resolved: {},
      curatedBase: base,
      isDeniedEnvKey: isDenied
    })
    expect(env.AWS_PROFILE).toBe('prod')
    expect(env.AWS_REGION).toBe('us-east-1')
    expect(env.CLAUDE_CODE_USE_BEDROCK).toBe('1')
  })

  it('config-dir は resolved の RuntimePath 値を CLAUDE_CONFIG_DIR に注入する (素の HostPath 不可。H-02)', () => {
    const rt = makeRuntimePath(wslNamespace('Ubuntu'), '/home/y/.claude')
    if (!rt.ok) throw new Error('bad runtime path')
    const { env } = deriveLaunchEnv({
      profile: profile({ source: 'config-dir' }),
      resolved: { configDirRuntimePath: rt.path },
      curatedBase: base,
      isDeniedEnvKey: isDenied
    })
    expect(env.CLAUDE_CONFIG_DIR).toBe('/home/y/.claude')
  })

  it('extraEnv 経由の CLAUDE_CONFIG_DIR は導出が締め出す (RuntimePath 変換を迂回させない。PB-H-001)', () => {
    // config-dir 以外の source。素通しすると素の HostPath が env に残り、WSL 内 claude が POSIX 解釈できない。
    const { env } = deriveLaunchEnv({
      profile: profile(
        { source: 'env-passthrough', varNames: [] },
        { extraEnv: { CLAUDE_CONFIG_DIR: 'C:\\Users\\y\\.claude', MY_FLAG: 'ok' } }
      ),
      resolved: {},
      curatedBase: base,
      isDeniedEnvKey: isDenied
    })
    expect(env.CLAUDE_CONFIG_DIR).toBeUndefined() // extraEnv からは載らない
    expect(env.MY_FLAG).toBe('ok') // 無害キーは通る (締め出しは CLAUDE_CONFIG_DIR に限る)
  })

  it('config-dir で resolved 未解決でも extraEnv の CLAUDE_CONFIG_DIR で backfill されない (PB-H-001)', () => {
    // composition stub が configDirRuntimePath=null を返す経路。extraEnv が素の HostPath を埋め戻せない。
    const { env } = deriveLaunchEnv({
      profile: profile(
        { source: 'config-dir' },
        { extraEnv: { CLAUDE_CONFIG_DIR: 'C:\\Users\\y\\.claude' } }
      ),
      resolved: {},
      curatedBase: base,
      isDeniedEnvKey: isDenied
    })
    expect(env.CLAUDE_CONFIG_DIR).toBeUndefined()
  })
})
