import { fixedCapabilities } from '@domain/runtime/capabilities'
import type { Win32RuntimeDescriptor, WslRuntimeDescriptor } from '@domain/runtime/descriptor'
import { uncNamespace, wslNamespace } from '@domain/runtime/namespace'
import { makePathMapping, type PathMapping } from '@domain/runtime/path-mapping'
import {
  makeHostPath,
  makeWslUncPath,
  type HostPath,
  type WslUncPath
} from '@domain/runtime/path-types'
import { describe, expect, it } from 'vitest'

import { assessReachability } from './reachability'
import type { CredentialRef, ProviderProfile } from './types'

const win32: Win32RuntimeDescriptor = {
  id: 'host',
  kind: 'win32',
  state: 'running',
  isDefault: true,
  capabilities: fixedCapabilities(0),
  detectedAt: 0
}

function wsl(
  distro: string,
  opts: { state?: 'running' | 'stopped'; mapping?: PathMapping | null } = {}
): WslRuntimeDescriptor {
  return {
    id: wslNamespace(distro),
    kind: 'wsl',
    distroName: distro,
    state: opts.state ?? 'running',
    wslVersion: 2,
    pathMapping: opts.mapping ?? null,
    isDefault: false,
    capabilities: fixedCapabilities(0),
    detectedAt: 0
  }
}

function unwrapHost(raw: string): HostPath {
  const r = makeHostPath(raw)
  if (!r.ok) throw new Error(`bad host path: ${r.reason}`)
  return r.path
}

function unwrapUnc(distro: string, raw: string): WslUncPath {
  const r = makeWslUncPath(uncNamespace(distro), raw)
  if (!r.ok) throw new Error(`bad unc path: ${r.reason}`)
  return r.path
}

function profile(credential: CredentialRef, configDir?: HostPath | WslUncPath): ProviderProfile {
  return {
    id: 'p',
    displayName: 'P',
    backend: 'anthropic',
    credential,
    models: { models: [] },
    configDir
  }
}

/** ホスト→WSL の実マッピングを組む (fromHost が実変換できる形。ARCH-H-001)。 */
function mappingFor(
  distro: string,
  entries: readonly { fromPrefix: string; toPrefix: string }[] = [
    { fromPrefix: 'C:\\', toPrefix: '/mnt/c' }
  ]
): PathMapping {
  const r = makePathMapping('host', wslNamespace(distro), entries, 0)
  if (!r.ok) throw new Error(`bad mapping: ${r.reason}`)
  return r.mapping
}

describe('assessReachability', () => {
  it('config dir に依存しない方式は任意ランタイムから reachable', () => {
    const p = profile({ source: 'api-key', secretRefKey: 'r' })
    expect(assessReachability(p, win32)).toBe('reachable')
    expect(assessReachability(p, wsl('Ubuntu'))).toBe('reachable')
  })

  it('configDir 未指定の config-dir 方式は reachable (既定 config dir)', () => {
    expect(assessReachability(profile({ source: 'config-dir' }), wsl('Ubuntu'))).toBe('reachable')
  })

  it('ホスト config dir は win32 から reachable、WSL は mapping で実変換できるときだけ reachable (fail-closed。ARCH-H-001)', () => {
    const p = profile({ source: 'config-dir' }, unwrapHost('C:\\Users\\y\\.claude'))
    expect(assessReachability(p, win32)).toBe('reachable')
    // C:\ が /mnt/c にマップされていれば C:\Users\... は変換可能 → reachable
    expect(assessReachability(p, wsl('Ubuntu', { mapping: mappingFor('Ubuntu') }))).toBe(
      'reachable'
    )
    // マッピングが無ければ変換材料待ち → blocked
    expect(assessReachability(p, wsl('Ubuntu', { mapping: null }))).toBe('blocked')
    // **マッピングは在るが当該ドライブ (C:) を覆わない → 変換不可 → unreachable** (fail-closed の核)
    const dOnly = mappingFor('Ubuntu', [{ fromPrefix: 'D:\\', toPrefix: '/mnt/d' }])
    expect(assessReachability(p, wsl('Ubuntu', { mapping: dOnly }))).toBe('unreachable')
  })

  it('WSL 内 config dir は同一ディストロのみ reachable、win32/別 distro は unreachable', () => {
    const p = profile(
      { source: 'config-dir' },
      unwrapUnc('Ubuntu', '\\\\wsl.localhost\\Ubuntu\\home\\y\\.claude')
    )
    expect(assessReachability(p, wsl('Ubuntu'))).toBe('reachable')
    expect(assessReachability(p, wsl('Debian'))).toBe('unreachable')
    expect(assessReachability(p, win32)).toBe('unreachable')
  })

  it('停止中の WSL ランタイムは blocked', () => {
    const p = profile(
      { source: 'config-dir' },
      unwrapUnc('Ubuntu', '\\\\wsl.localhost\\Ubuntu\\home\\y\\.claude')
    )
    expect(assessReachability(p, wsl('Ubuntu', { state: 'stopped' }))).toBe('blocked')
  })

  it('ホスト config dir + 停止中 WSL は mapping があっても blocked (workspace より安全側の意図的差。C-M-101)', () => {
    // workspace エンジンは cached mapping があれば stopped でも reachable にするが、provider は config dir 到達
    // 用途では停止中ランタイムを選択肢から外す方が正しい (fail-closed 安全側)。この意図的差を固定する。
    const p = profile({ source: 'config-dir' }, unwrapHost('C:\\Users\\y\\.claude'))
    expect(
      assessReachability(p, wsl('Ubuntu', { state: 'stopped', mapping: mappingFor('Ubuntu') }))
    ).toBe('blocked')
  })
})
