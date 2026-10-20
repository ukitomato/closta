import { describe, expect, it } from 'vitest'

import { WIN32_LAUNCH_SPEC_FIXTURE } from '@domain/session/__fixtures__/win32-launch-spec'
import { WIN32_TREE_STOP_ARGS, WIN32_TREE_STOP_COMMAND_NAME } from '@domain/session/agent-session'

import {
  WIN32_LAUNCH_ENV_ALLOWLIST,
  WIN32_PROVIDER_OVERRIDABLE_KEYS,
  WIN32_TRANSPORT_KEYS,
  buildWin32LaunchEnv,
  buildWin32LaunchSpec,
  composeWin32LaunchEnv,
  isWin32ForbiddenKey
} from './win32-launch'

describe('WIN32_LAUNCH_ENV_ALLOWLIST (pin。集合を変えるには ADR が要る (AD-058))', () => {
  it('data-model §6.1 の 30 キーと一致する', () => {
    expect([...WIN32_LAUNCH_ENV_ALLOWLIST].sort()).toEqual(
      [
        'PATH',
        'PATHEXT',
        'ComSpec',
        'SystemRoot',
        'SystemDrive',
        'windir',
        'OS',
        'NUMBER_OF_PROCESSORS',
        'PROCESSOR_ARCHITECTURE',
        'TEMP',
        'TMP',
        'USERPROFILE',
        'USERNAME',
        'USERDOMAIN',
        'HOMEDRIVE',
        'HOMEPATH',
        'APPDATA',
        'LOCALAPPDATA',
        'ProgramData',
        'ProgramFiles',
        'ProgramFiles(x86)',
        'ProgramW6432',
        'CommonProgramFiles',
        'CommonProgramFiles(x86)',
        'CommonProgramW6432',
        'CLAUDE_CODE_GIT_BASH_PATH',
        'HTTP_PROXY',
        'HTTPS_PROXY',
        'NO_PROXY',
        'NODE_EXTRA_CA_CERTS'
      ].sort()
    )
    expect(WIN32_LAUNCH_ENV_ALLOWLIST).toHaveLength(30)
  })

  it('WIN32_PROVIDER_OVERRIDABLE_KEYS は proxy の 3 キーで、許可リストの部分集合・NODE_EXTRA_CA_CERTS を含まない', () => {
    expect([...WIN32_PROVIDER_OVERRIDABLE_KEYS]).toEqual(['HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY'])
    for (const key of WIN32_PROVIDER_OVERRIDABLE_KEYS) {
      expect((WIN32_LAUNCH_ENV_ALLOWLIST as readonly string[]).includes(key)).toBe(true)
    }
    expect(
      (WIN32_PROVIDER_OVERRIDABLE_KEYS as readonly string[]).includes('NODE_EXTRA_CA_CERTS')
    ).toBe(false)
    expect(WIN32_TRANSPORT_KEYS).toHaveLength(27)
    expect(WIN32_TRANSPORT_KEYS.includes('NODE_EXTRA_CA_CERTS')).toBe(true)
  })
})

describe('buildWin32LaunchEnv', () => {
  it('許可リストの外のキー・denylist のキー・WSLENV / WSL_UTF8 が 0 件で、Path は PATH の綴りで出る', () => {
    const env = buildWin32LaunchEnv({
      Path: 'C:\\x',
      CLOSTA_PROBE: '1',
      ANTHROPIC_API_KEY: 'k',
      AWS_SECRET_ACCESS_KEY: 's',
      WSLENV: 'a',
      WSL_UTF8: '1',
      SystemRoot: 'C:\\WINDOWS',
      HTTPS_PROXY: 'http://p:8080'
    })
    expect(env).toEqual({
      PATH: 'C:\\x',
      SystemRoot: 'C:\\WINDOWS',
      HTTPS_PROXY: 'http://p:8080'
    })
  })

  it('小文字の path でも PATH の綴りで出る', () => {
    expect(buildWin32LaunchEnv({ path: 'C:\\y' })).toEqual({ PATH: 'C:\\y' })
  })

  it('値が undefined のキーは入れない', () => {
    expect(buildWin32LaunchEnv({ PATH: undefined })).toEqual({})
  })
})

describe('composeWin32LaunchEnv (data-model §6.2)', () => {
  const base = {
    PATH: 'C:\\host',
    SystemRoot: 'C:\\WINDOWS',
    HTTPS_PROXY: 'http://host:1',
    NODE_EXTRA_CA_CERTS: 'C:\\ca.pem',
    USERNAME: 'u'
  }

  it('forwardKeys の値だけが重なり、derived.env の残りは入らない', () => {
    const env = composeWin32LaunchEnv(base, {
      env: { CLAUDE_CONFIG_DIR: 'C:\\cfg', SystemRoot: 'EVIL', TEMP: 'EVIL' },
      forwardKeys: ['CLAUDE_CONFIG_DIR']
    })
    expect(env).toEqual({ ...base, CLAUDE_CONFIG_DIR: 'C:\\cfg' })
  })

  it('上書きしてよいキー (proxy) は Provider の値がホストの値に勝つ', () => {
    const env = composeWin32LaunchEnv(base, {
      env: { HTTPS_PROXY: 'http://provider:2' },
      forwardKeys: ['HTTPS_PROXY']
    })
    expect(env.HTTPS_PROXY).toBe('http://provider:2')
  })

  it.each(['PATH', 'SystemRoot', 'USERNAME', 'NUMBER_OF_PROCESSORS', 'NODE_EXTRA_CA_CERTS'])(
    'Win32 の transport のキー %s を Provider から上書きすると throw し、ホストの値は消えない',
    (key) => {
      expect(() =>
        composeWin32LaunchEnv(base, { env: { [key]: '/posix/value' }, forwardKeys: [key] })
      ).toThrow()
      expect(base.NODE_EXTRA_CA_CERTS).toBe('C:\\ca.pem')
    }
  )

  it('名前の形の外れ・値が文字列でない・制御文字で throw する', () => {
    expect(() =>
      composeWin32LaunchEnv(base, { env: { 'bad key': 'v' }, forwardKeys: ['bad key'] })
    ).toThrow()
    expect(() => composeWin32LaunchEnv(base, { env: {}, forwardKeys: ['FOO_BAR'] })).toThrow()
    expect(() =>
      composeWin32LaunchEnv(base, { env: { FOO_BAR: 'a\u0000b' }, forwardKeys: ['FOO_BAR'] })
    ).toThrow()
  })

  it('結果に WSLENV / WSL_UTF8 が 0 件', () => {
    const env = composeWin32LaunchEnv(base, {
      env: { FOO_BAR: 'x', WSLENV: 'a', WSL_UTF8: '1' },
      forwardKeys: ['FOO_BAR']
    })
    expect('WSLENV' in env).toBe(false)
    expect('WSL_UTF8' in env).toBe(false)
  })

  it('isWin32ForbiddenKey は transport のキーを禁止し、proxy のキーを禁止しない', () => {
    expect(isWin32ForbiddenKey('USERNAME')).toBe(true)
    expect(isWin32ForbiddenKey('NODE_EXTRA_CA_CERTS')).toBe(true)
    expect(isWin32ForbiddenKey('HTTPS_PROXY')).toBe(false)
    expect(isWin32ForbiddenKey('FOO_BAR')).toBe(false)
  })
})

describe('buildWin32LaunchSpec (data-model §5.1)', () => {
  const params = {
    cwd: 'C:\\dev\\closta',
    claudePath: 'C:\\Users\\u\\.local\\bin\\claude.exe',
    baseEnv: { SystemRoot: 'C:\\WINDOWS', windir: 'C:\\WINDOWS' },
    launchEnv: WIN32_LAUNCH_SPEC_FIXTURE.env
  }

  it('同じ入力で組んだ値が正規の fixture と一致する (build → decode の往復の片側)', () => {
    expect(buildWin32LaunchSpec(params)).toEqual(WIN32_LAUNCH_SPEC_FIXTURE)
  })

  it('stop の値は domain の定数から組まれ、windowsHide は true', () => {
    const spec = buildWin32LaunchSpec(params)
    expect(spec.stop.argsBeforePid).toEqual([...WIN32_TREE_STOP_ARGS])
    expect(spec.stop.command.toLowerCase().endsWith(WIN32_TREE_STOP_COMMAND_NAME)).toBe(true)
    expect(spec.windowsHide).toBe(true)
    expect(spec.command).toBe(spec.pathToClaudeCodeExecutable)
    expect(spec.kind).toBe('win32')
  })

  it('SystemRoot が無く windir で組める。stop.env は SystemRoot / windir だけ', () => {
    const spec = buildWin32LaunchSpec({
      ...params,
      baseEnv: { windir: 'C:\\WINDOWS', PATH: 'C:\\x' }
    })
    expect(spec.stop.command).toBe('C:\\WINDOWS\\System32\\taskkill.exe')
    expect(spec.stop.env).toEqual({ windir: 'C:\\WINDOWS' })
  })

  it('SystemRoot / windir が両方無い・相対で throw する (裸名にしない)', () => {
    expect(() => buildWin32LaunchSpec({ ...params, baseEnv: {} })).toThrow()
    expect(() => buildWin32LaunchSpec({ ...params, baseEnv: { SystemRoot: 'WINDOWS' } })).toThrow()
  })

  it('claudePath が shim・cwd が HostPath でないと throw し、メッセージに値を入れない', () => {
    expect(() => buildWin32LaunchSpec({ ...params, claudePath: 'C:\\a\\claude.cmd' })).toThrow(
      /^(?!.*claude\.cmd)/
    )
    expect(() => buildWin32LaunchSpec({ ...params, cwd: 'relative' })).toThrow(/^(?!.*relative)/)
  })
})
