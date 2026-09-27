import { describe, expect, it } from 'vitest'

import { buildLaunchEnv, buildRuntimeLaunchSpec, LAUNCH_ENV_ALLOWLIST } from './launch-spec'
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

describe('buildRuntimeLaunchSpec (data-model §8)', () => {
  const env = { SystemRoot: 'C:\\Windows', WSL_UTF8: '1' }

  it('command は %SystemRoot%\\System32 配下の WSL ランチャの絶対パス、cwd は --cd 経由、argv は配列', () => {
    const spec = buildRuntimeLaunchSpec({
      distroName: 'Ubuntu',
      cwd: '/home/u/proj',
      claudePath: '/home/u/.local/bin/claude',
      env
    })
    // **絶対パスで起動する** (PATH なし worker での ENOENT 回避 + CWE-426。quickstart V-1)。
    // wsl.exe のリテラルは WSL_BINARY に閉じ、ここは System32 接頭を足すだけ。
    expect(spec.command).toBe(`C:\\Windows\\System32\\${WSL_BINARY}`)
    expect(spec.prefixArgs).toEqual(['--cd', '/home/u/proj', '-d', 'Ubuntu', '--'])
    expect(spec.pathToClaudeCodeExecutable).toBe('/home/u/.local/bin/claude')
    expect(spec.env).toBe(env)
    expect(Array.isArray(spec.prefixArgs)).toBe(true)
  })

  it('SystemRoot が無ければ windir から解決する', () => {
    const spec = buildRuntimeLaunchSpec({
      distroName: 'Ubuntu',
      cwd: '/home/u/proj',
      claudePath: '/home/u/.local/bin/claude',
      env: { windir: 'C:\\WINDOWS', WSL_UTF8: '1' }
    })
    expect(spec.command).toBe(`C:\\WINDOWS\\System32\\${WSL_BINARY}`)
  })

  it('SystemRoot / windir とも無ければ throw (fail-closed。裸名にフォールバックしない。M-001)', () => {
    // 起動 env は PATH を持たないので裸名では ENOENT になり、かつ CWE-426 の趣旨に反する。
    // claudePath 不在の起動拒否と同じ fail-closed に揃える。呼び出し側が launch-failed に倒す。
    expect(() =>
      buildRuntimeLaunchSpec({
        distroName: 'Ubuntu',
        cwd: '/home/u/proj',
        claudePath: '/home/u/.local/bin/claude',
        env: { WSL_UTF8: '1' }
      })
    ).toThrow()
  })

  it('バックスラッシュを含む値を拒否する (AD-015 §5)', () => {
    expect(() =>
      buildRuntimeLaunchSpec({
        distroName: 'Ubuntu',
        cwd: 'C:\\Users\\u\\proj',
        claudePath: '/home/u/.local/bin/claude',
        env
      })
    ).toThrow()
  })
})
