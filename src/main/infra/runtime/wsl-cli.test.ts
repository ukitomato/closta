import { describe, expect, it } from 'vitest'

import { buildDetectionEnv, resolveWslBinary, WSL_BINARY } from './wsl-cli'

/**
 * 検出 spawn の env 構築と wsl.exe 絶対パス解決の純関数テスト。
 * env の透過遮断 (pr-gate security M-001/M-101) と CWE-426 (絶対パス起動) の回帰番人。
 */
describe('buildDetectionEnv (検出 env の allowlist。M-001/M-101/M-201)', () => {
  it('allowlist キーだけを拾い WSL_UTF8 を足す', () => {
    const env = buildDetectionEnv({
      SystemRoot: 'C:\\Windows',
      windir: 'C:\\Windows',
      TEMP: 'C:\\Temp',
      TMP: 'C:\\Temp'
    })
    expect(env).toEqual({
      SystemRoot: 'C:\\Windows',
      windir: 'C:\\Windows',
      TEMP: 'C:\\Temp',
      TMP: 'C:\\Temp',
      WSL_UTF8: '1'
    })
  })

  it('**PATH を含めない** — appendWindowsPath 経由の command -v 解決先汚染を断つ (M-101)', () => {
    const env = buildDetectionEnv({ SystemRoot: 'C:\\Windows', PATH: 'C:\\evil;C:\\Windows' })
    expect(Object.prototype.hasOwnProperty.call(env, 'PATH')).toBe(false)
  })

  it('**WSLENV を含めない** — host 秘密の WSL 透過を断つ (M-001)', () => {
    const env = buildDetectionEnv({ SystemRoot: 'C:\\Windows', WSLENV: 'ANTHROPIC_API_KEY/u' })
    expect(Object.prototype.hasOwnProperty.call(env, 'WSLENV')).toBe(false)
  })

  it('資格情報系の host env を透過しない (allowlist 外は全て落ちる)', () => {
    const env = buildDetectionEnv({
      SystemRoot: 'C:\\Windows',
      ANTHROPIC_API_KEY: 'secret',
      GITHUB_TOKEN: 'secret',
      AWS_SECRET_ACCESS_KEY: 'secret'
    })
    const keys = Object.keys(env)
    expect(keys).toEqual(['SystemRoot', 'WSL_UTF8'])
  })

  it('未設定の allowlist キーは省く (undefined を string に入れない)', () => {
    const env = buildDetectionEnv({ SystemRoot: 'C:\\Windows' })
    expect(Object.prototype.hasOwnProperty.call(env, 'TEMP')).toBe(false)
  })
})

describe('resolveWslBinary (WSL ランチャの絶対パス解決。CWE-426)', () => {
  it('SystemRoot から %SystemRoot%\\System32 配下の WSL ランチャ絶対パスを組む', () => {
    expect(resolveWslBinary('C:\\Windows')).toBe(`C:\\Windows\\System32\\${WSL_BINARY}`)
  })

  it('SystemRoot が未解決 (undefined/空) なら null (呼び出し側が fail-closed / fallback を選ぶ)', () => {
    expect(resolveWslBinary(undefined)).toBeNull()
    expect(resolveWslBinary('')).toBeNull()
  })
})
