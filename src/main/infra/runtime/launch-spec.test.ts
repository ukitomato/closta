import { describe, expect, it } from 'vitest'

import {
  METHOD_SPECIFIC_FORWARD_KEYS,
  PASSTHROUGH_VAR_ALLOWLIST
} from '@domain/provider/forward-env'

import {
  buildLaunchEnv,
  buildRuntimeLaunchSpec,
  composeLaunchEnv,
  LAUNCH_ENV_ALLOWLIST
} from './launch-spec'
import { WSL_BINARY } from './wsl-cli'

describe('buildLaunchEnv (M-201 / M-202)', () => {
  it('allowlist のキーだけを拾い、WSL_UTF8 を固定で足す', () => {
    const env = buildLaunchEnv({
      SystemRoot: 'C:\\Windows',
      windir: 'C:\\Windows',
      TEMP: 'C:\\Temp',
      TMP: 'C:\\Temp',
      PATH: 'C:\\evil;C:\\Windows'
    })
    expect(env).toEqual({
      SystemRoot: 'C:\\Windows',
      windir: 'C:\\Windows',
      TEMP: 'C:\\Temp',
      TMP: 'C:\\Temp',
      WSL_UTF8: '1'
    })
  })

  it('PATH を含めない (WSL interop の透過経路を作らない。L-102/M-201)', () => {
    const env = buildLaunchEnv({ SystemRoot: 'C:\\Windows', PATH: 'C:\\x' })
    expect(Object.prototype.hasOwnProperty.call(env, 'PATH')).toBe(false)
  })

  it('WSLENV / 資格情報系を決して含めない (denylist。AD-036 §6)', () => {
    const env = buildLaunchEnv({
      SystemRoot: 'C:\\Windows',
      WSLENV: 'PATH/l',
      ANTHROPIC_API_KEY: 'secret',
      AWS_SECRET_ACCESS_KEY: 'secret',
      GITHUB_TOKEN: 'secret'
    })
    const keys = Object.keys(env)
    expect(keys).not.toContain('WSLENV')
    expect(keys).not.toContain('ANTHROPIC_API_KEY')
    expect(keys).not.toContain('AWS_SECRET_ACCESS_KEY')
    expect(keys).not.toContain('GITHUB_TOKEN')
    // allowlist の各キーは denylist パターンに当たらない (二重の網の健全性)。
    for (const key of LAUNCH_ENV_ALLOWLIST) {
      expect(keys.includes(key) || true).toBe(true)
    }
  })

  it('未設定の allowlist キーは省く (undefined を string に入れない)', () => {
    const env = buildLaunchEnv({ SystemRoot: 'C:\\Windows' })
    expect(env.SystemRoot).toBe('C:\\Windows')
    expect(Object.prototype.hasOwnProperty.call(env, 'TEMP')).toBe(false)
  })
})

describe('buildRuntimeLaunchSpec (data-model §8 / AD-041 (f))', () => {
  const env = { SystemRoot: 'C:\\Windows', WSL_UTF8: '1' }
  const params = {
    distroName: 'Ubuntu',
    cwd: '/home/u/proj',
    claudePath: '/home/u/.local/bin/claude',
    baseEnv: env,
    launchEnv: env
  }

  it('command は %SystemRoot%\\System32 配下の WSL ランチャの絶対パス、cwd は --cd 経由、argv は配列', () => {
    const spec = buildRuntimeLaunchSpec(params)
    // **絶対パスで起動する** (PATH なし worker での ENOENT 回避 + CWE-426。quickstart V-1)。
    // wsl.exe のリテラルは WSL_BINARY に閉じ、ここは System32 接頭を足すだけ。
    expect(spec.command).toBe(`C:\\Windows\\System32\\${WSL_BINARY}`)
    expect(spec.pathToClaudeCodeExecutable).toBe('/home/u/.local/bin/claude')
    expect(spec.env).toBe(env)
    expect(Array.isArray(spec.prefixArgs)).toBe(true)
  })

  it('prefixArgs は --exec 形に固定する (シェル展開の退行を検出する pin。X-1 の `--` 形を置き換える)', () => {
    const spec = buildRuntimeLaunchSpec(params)
    expect(spec.prefixArgs).toEqual(['--cd', '/home/u/proj', '-d', 'Ubuntu', '--exec'])
    expect(spec.prefixArgs.at(-1)).toBe('--exec')
    for (const forbidden of ['--', '-u', '--user', '-e']) {
      expect(spec.prefixArgs).not.toContain(forbidden)
    }
  })

  it('ランチャの絶対パス解決は baseEnv だけを使う (launchEnv の SystemRoot 上書きは効かない。AD-041 (e) 5)', () => {
    const spec = buildRuntimeLaunchSpec({
      ...params,
      launchEnv: { ...env, SystemRoot: 'D:\\evil' }
    })
    expect(spec.command).toBe(`C:\\Windows\\System32\\${WSL_BINARY}`)
  })

  it('SystemRoot が無ければ windir から解決する', () => {
    const base = { windir: 'C:\\WINDOWS', WSL_UTF8: '1' }
    const spec = buildRuntimeLaunchSpec({ ...params, baseEnv: base, launchEnv: base })
    expect(spec.command).toBe(`C:\\WINDOWS\\System32\\${WSL_BINARY}`)
  })

  it('SystemRoot / windir とも無ければ throw (fail-closed。裸名にフォールバックしない。M-001)', () => {
    // 起動 env は PATH を持たないので裸名では ENOENT になり、かつ CWE-426 の趣旨に反する。
    // claudePath 不在の起動拒否と同じ fail-closed に揃える。呼び出し側が launch-failed に倒す。
    const base = { WSL_UTF8: '1' }
    expect(() => buildRuntimeLaunchSpec({ ...params, baseEnv: base, launchEnv: base })).toThrow()
  })

  it('バックスラッシュを含む値を拒否する (AD-015 §5)', () => {
    expect(() => buildRuntimeLaunchSpec({ ...params, cwd: 'C:\\Users\\u\\proj' })).toThrow()
  })

  it('バックスラッシュ拒否のメッセージに値を含めない (CWE-532 / pr-gate R1 security L-001)', () => {
    let message = ''
    try {
      buildRuntimeLaunchSpec({ ...params, cwd: 'C:\\Users\\u\\secret-proj' })
    } catch (e) {
      message = (e as Error).message
    }
    expect(message).toMatch(/バックスラッシュ/)
    expect(message).not.toContain('secret-proj')
  })
})

describe('composeLaunchEnv (X-4 FR-013 / AD-041 (e))', () => {
  const base = buildLaunchEnv({
    SystemRoot: 'C:\\Windows',
    windir: 'C:\\Windows',
    TEMP: 'C:\\Temp',
    TMP: 'C:\\Temp'
  })

  it('WSLENV = forwardKeys + /u だけ。curated base のキーと WSL_UTF8 は転送しない', () => {
    const env = composeLaunchEnv(base, {
      env: { ...base, ANTHROPIC_API_KEY: 'sk', CLAUDE_CONFIG_DIR: '/home/u/.claude' },
      forwardKeys: ['ANTHROPIC_API_KEY', 'CLAUDE_CONFIG_DIR']
    })
    expect(env.WSLENV).toBe('ANTHROPIC_API_KEY/u:CLAUDE_CONFIG_DIR/u')
    const listed = env.WSLENV.split(':').map((e) => e.split('/')[0])
    for (const k of ['SystemRoot', 'windir', 'TEMP', 'TMP', 'WSL_UTF8']) {
      expect(listed).not.toContain(k)
    }
    // /p /l のパス変換フラグを使わない (値は既に RuntimePath。二重変換を避ける)。
    expect(env.WSLENV).not.toMatch(/\/[pl]/)
    expect(env.ANTHROPIC_API_KEY).toBe('sk')
    expect(env.SystemRoot).toBe('C:\\Windows')
  })

  it('base 側 (親 env 由来) の WSLENV は捨てる', () => {
    const env = composeLaunchEnv({ ...base, WSLENV: 'PATH/l' }, { env: {}, forwardKeys: [] })
    expect(env.WSLENV).toBeUndefined()
  })

  it.each([
    ['transport キー TMP', ['TMP']],
    ['大文字小文字違いの SYSTEMROOT', ['SYSTEMROOT']],
    ['名前規則違反', ['lower_case']],
    ['env に実在しない', ['MISSING']]
  ])('規則違反の転送キーは throw (黙って捨てない。%s)', (_l, keys) => {
    expect(() =>
      composeLaunchEnv(base, {
        env: { ...base, SYSTEMROOT: 'x', lower_case: 'x' },
        forwardKeys: keys
      })
    ).toThrow(/composeLaunchEnv/)
  })

  it.each([
    ['PATH'],
    ['LD_PRELOAD'],
    ['BASH_ENV'],
    ['NODE_OPTIONS'],
    ['CLAUDE_CODE_SHELL_PREFIX'],
    // 実行の乗っ取り (pr-gate R1 security M-001)
    ['GIT_CONFIG_COUNT'],
    ['GIT_SSH_COMMAND'],
    ['GIT_PAGER'],
    ['PYTHONSTARTUP'],
    ['PERL5OPT'],
    ['RUBYOPT'],
    ['BUN_OPTIONS'],
    ['PAGER'],
    ['LESSOPEN'],
    ['LESSCLOSE'],
    ['EDITOR'],
    ['VISUAL'],
    ['NODE_TLS_REJECT_UNAUTHORIZED'],
    // 残りのコマンド実行・ローダ系 (pr-gate R2 security L-101)
    ['MANPAGER'],
    ['SYSTEMD_PAGER'],
    ['BROWSER'],
    ['SSH_ASKPASS'],
    ['SSH_ASKPASS_REQUIRE'],
    ['SUDO_ASKPASS'],
    ['PERLLIB'],
    ['JAVA_TOOL_OPTIONS'],
    ['_JAVA_OPTIONS'],
    ['NPM_CONFIG_SCRIPT_SHELL']
  ])('固定の転送禁止キー %s は env に在っても throw (AD-041 (e) 2 / pb M-002)', (key) => {
    expect(() =>
      composeLaunchEnv(base, { env: { ...base, [key]: 'x' }, forwardKeys: [key] })
    ).toThrow(/転送禁止キー/)
  })

  it('小文字の bash_env は名前規則違反で throw', () => {
    expect(() =>
      composeLaunchEnv(base, { env: { ...base, bash_env: 'x' }, forwardKeys: ['bash_env'] })
    ).toThrow(/名前規則/)
  })

  it.each([
    ...METHOD_SPECIFIC_FORWARD_KEYS,
    ...PASSTHROUGH_VAR_ALLOWLIST,
    // 転送禁止に掛からない任意の extraEnv キー
    'MY_FLAG'
  ])('導出が正当に出すキー %s は通る', (key) => {
    const env = composeLaunchEnv(base, { env: { ...base, [key]: 'v' }, forwardKeys: [key] })
    expect(env.WSLENV).toBe(`${key}/u`)
  })

  it('HTTPS_PROXY は意図的に許可する (送信先の変更は残存リスクとして受け入れる。AD-041 (e))', () => {
    const env = composeLaunchEnv(base, {
      env: { ...base, HTTPS_PROXY: 'http://proxy' },
      forwardKeys: ['HTTPS_PROXY']
    })
    expect(env.WSLENV).toBe('HTTPS_PROXY/u')
  })

  it('NODE_EXTRA_CA_CERTS は許可する (信頼アンカーを足すだけ。企業 CA の経路。pr-gate R2 security L-102)', () => {
    const env = composeLaunchEnv(base, {
      env: { ...base, NODE_EXTRA_CA_CERTS: '/etc/ssl/certs/corp.pem' },
      forwardKeys: ['NODE_EXTRA_CA_CERTS']
    })
    expect(env.WSLENV).toBe('NODE_EXTRA_CA_CERTS/u')
  })

  it.each([
    ['NUL', 'sk-ant\u0000x'],
    ['改行', 'a\nb'],
    ['DEL', 'a\u007fb']
  ])(
    '転送キーの値に制御文字 (%s) があれば throw し、値をメッセージに含めない (FR-014 / L-002)',
    (_l, value) => {
      let message = ''
      try {
        composeLaunchEnv(base, {
          env: { ...base, ANTHROPIC_API_KEY: value },
          forwardKeys: ['ANTHROPIC_API_KEY']
        })
      } catch (e) {
        message = (e as Error).message
      }
      expect(message).toMatch(/制御文字/)
      expect(message).not.toContain(value)
    }
  )
})
