import { describe, expect, it } from 'vitest'

import { wslNamespace, type WslNamespaceId } from '@domain/runtime/namespace'
import {
  makeHostPath,
  makeRuntimePath,
  type HostPath,
  type RuntimePath
} from '@domain/runtime/path-types'

import {
  CLAUDE_CONFIG_DIR_ENV,
  CONFIG_DIR_NAME,
  ENUMERATION_ENV_ALLOWLIST,
  buildEnumerationEnv,
  configDirEnvValue,
  hostConfigDir,
  runtimeConfigDir
} from './config-dir'

/** BE-025c — config ディレクトリの組み立てと環境変数 (FR-050 / SC-016)。 */

const UBUNTU: WslNamespaceId = wslNamespace('Ubuntu')

function host(value: string): HostPath {
  const result = makeHostPath(value)
  if (!result.ok) throw new Error(`テストの前提が壊れている: ${value}`)
  return result.path
}

function runtime(value: string): RuntimePath {
  const result = makeRuntimePath(UBUNTU, value)
  if (!result.ok) throw new Error(`テストの前提が壊れている: ${value}`)
  return result.path
}

describe('hostConfigDir / runtimeConfigDir', () => {
  it('ホームの下に config ディレクトリを組み立てる', () => {
    const result = hostConfigDir(host('C:\\Users\\y'))

    expect(result).toMatchObject({ ok: true })
    expect(result.ok && result.path.value).toBe(`C:\\Users\\y\\${CONFIG_DIR_NAME}`)
  })

  it('ランタイム名前空間でも同じ名前を使う', () => {
    const result = runtimeConfigDir(runtime('/home/y'))

    expect(result.ok && result.path.value).toBe(`/home/y/${CONFIG_DIR_NAME}`)
    expect(result.ok && result.path.namespace).toBe(UBUNTU)
  })

  it('ドライブルートでも組み立てられる', () => {
    expect(hostConfigDir(host('C:\\')).ok).toBe(true)
  })
})

describe('configDirEnvValue', () => {
  it('ホストの値はそのまま渡す', () => {
    const result = configDirEnvValue(host('C:\\Users\\y\\.claude'))

    expect(result).toEqual({ ok: true, path: 'C:\\Users\\y\\.claude' })
  })

  it('ランタイムの値は UNC 形式に変換して渡す', () => {
    const result = configDirEnvValue(runtime('/home/y/.claude'))

    expect(result).toEqual({ ok: true, path: '\\\\wsl.localhost\\Ubuntu\\home\\y\\.claude' })
  })

  it('所在の判別は名前空間の値で行う (文字列リテラルの条件を持たない)', () => {
    const asHost = configDirEnvValue(host('C:\\Users\\y\\.claude'))
    const asRuntime = configDirEnvValue(runtime('/home/y/.claude'))

    expect(asHost.ok && asHost.path.startsWith('C:')).toBe(true)
    expect(asRuntime.ok && asRuntime.path.startsWith('\\\\')).toBe(true)
  })
})

describe('buildEnumerationEnv', () => {
  it('許可リスト外のキーを 0 件にする (SC-016)', () => {
    const env = buildEnumerationEnv('C:\\x\\.claude', {
      SystemRoot: 'C:\\Windows',
      ANTHROPIC_API_KEY: 'secret',
      AWS_SECRET_ACCESS_KEY: 'secret',
      PATH: 'C:\\bin',
      HOME: 'C:\\Users\\y'
    })

    const unexpected = Object.keys(env).filter(
      (key) => key !== CLAUDE_CONFIG_DIR_ENV && !ENUMERATION_ENV_ALLOWLIST.includes(key)
    )

    expect(unexpected).toEqual([])
    expect(env).not.toHaveProperty('ANTHROPIC_API_KEY')
    expect(env).not.toHaveProperty('PATH')
  })

  it('config ディレクトリを必ず載せる', () => {
    const env = buildEnumerationEnv('C:\\x\\.claude', {})

    expect(env[CLAUDE_CONFIG_DIR_ENV]).toBe('C:\\x\\.claude')
  })

  it('親環境が同名のキーを持っていても上書きされない', () => {
    const env = buildEnumerationEnv('C:\\correct\\.claude', {
      CLAUDE_CONFIG_DIR: 'C:\\wrong\\.claude'
    })

    expect(env[CLAUDE_CONFIG_DIR_ENV]).toBe('C:\\correct\\.claude')
  })

  it('親環境のキーの大小を無視して拾い、許可リストの綴りに正規化する', () => {
    const env = buildEnumerationEnv('C:\\x\\.claude', { Temp: 'C:\\Temp', SYSTEMROOT: 'C:\\W' })

    expect(env.TEMP).toBe('C:\\Temp')
    expect(env.SystemRoot).toBe('C:\\W')
    expect(env).not.toHaveProperty('Temp')
    expect(env).not.toHaveProperty('SYSTEMROOT')
  })

  it('値が未定義のキーを載せない', () => {
    const env = buildEnumerationEnv('C:\\x\\.claude', { TEMP: undefined })

    expect(env).not.toHaveProperty('TEMP')
  })

  it('親環境が空でも config ディレクトリだけで成立する', () => {
    expect(Object.keys(buildEnumerationEnv('C:\\x\\.claude', {}))).toEqual([CLAUDE_CONFIG_DIR_ENV])
  })
})
