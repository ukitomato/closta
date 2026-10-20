import { fixedCapabilities } from '@domain/runtime/capabilities'
import type { Win32RuntimeDescriptor, WslRuntimeDescriptor } from '@domain/runtime/descriptor'
import { uncNamespace, wslNamespace } from '@domain/runtime/namespace'
import { makePathMapping, type PathMapping } from '@domain/runtime/path-mapping'
import { makeHostPath, makeWslUncPath } from '@domain/runtime/path-types'
import { describe, expect, it } from 'vitest'

import { classifyHelperPath, resolveConfigDirPath } from './helper-path'

function mapping(distro: string): PathMapping {
  const r = makePathMapping(
    'host',
    wslNamespace(distro),
    [{ fromPrefix: 'C:\\', toPrefix: '/mnt/c' }],
    0
  )
  if (!r.ok) throw new Error('bad mapping')
  return r.mapping
}

const win32: Win32RuntimeDescriptor = {
  id: 'host',
  kind: 'win32',
  state: 'running',
  isDefault: true,
  capabilities: fixedCapabilities(0),
  detectedAt: 0,
  claudePath: null,
  claudeStatus: 'not-found',
  claudeOverridden: false
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
    pathMapping: opts.mapping === undefined ? mapping(distro) : opts.mapping,
    isDefault: false,
    capabilities: fixedCapabilities(0),
    detectedAt: 0
  }
}

describe('classifyHelperPath (FR-014)', () => {
  it('POSIX 絶対パスは選択ランタイムの RuntimePath になる', () => {
    const r = classifyHelperPath('/opt/helper.sh', wsl('Ubuntu'))
    expect(r.ok && r.path.value).toBe('/opt/helper.sh')
    expect(r.ok && r.path.namespace).toBe('wsl:Ubuntu')
  })

  it('HostPath は PathMapping で変換する', () => {
    const r = classifyHelperPath('C:\\tools\\h.sh', wsl('Ubuntu'))
    expect(r.ok && r.path.value).toBe('/mnt/c/tools/h.sh')
  })

  it('mapping 未取得 / 停止中は blocked', () => {
    expect(classifyHelperPath('C:\\tools\\h.sh', wsl('Ubuntu', { mapping: null }))).toEqual({
      ok: false,
      reason: 'blocked'
    })
    expect(classifyHelperPath('C:\\tools\\h.sh', wsl('Ubuntu', { state: 'stopped' }))).toEqual({
      ok: false,
      reason: 'blocked'
    })
  })

  it('POSIX 絶対パスも停止中は blocked (HostPath 分岐・resolveConfigDirPath と対称。pr-gate R1 PB L-302)', () => {
    expect(classifyHelperPath('/opt/helper.sh', wsl('Ubuntu', { state: 'stopped' }))).toEqual({
      ok: false,
      reason: 'blocked'
    })
  })

  it.each([
    '\\\\wsl.localhost\\Ubuntu\\opt\\h.sh',
    'relative/h.sh',
    '//double',
    '/opt/has space.sh',
    '/opt/$(id).sh',
    "/opt/o'brien.sh",
    'C:\\Program Files\\h.sh'
  ])('%j は unreachable', (raw) => {
    expect(classifyHelperPath(raw, wsl('Ubuntu'))).toEqual({ ok: false, reason: 'unreachable' })
  })
})

describe('resolveConfigDirPath (FR-012)', () => {
  it('host configDir は fromHost で変換する', () => {
    const host = makeHostPath('C:\\Users\\y\\.claude')
    if (!host.ok) throw new Error('bad host')
    const r = resolveConfigDirPath(host.path, wsl('Ubuntu'))
    expect(r.ok && r.path.value).toBe('/mnt/c/Users/y/.claude')
  })

  it('UNC configDir は同一 distro のときだけ fromUnc で変換する', () => {
    const unc = makeWslUncPath(
      uncNamespace('Ubuntu'),
      '\\\\wsl.localhost\\Ubuntu\\home\\y\\.claude'
    )
    if (!unc.ok) throw new Error('bad unc')
    const same = resolveConfigDirPath(unc.path, wsl('Ubuntu'))
    expect(same.ok && same.path.value).toBe('/home/y/.claude')
    expect(resolveConfigDirPath(unc.path, wsl('Debian'))).toEqual({
      ok: false,
      reason: 'unreachable'
    })
  })

  it('win32 はホストの configDir を HostPath のまま ok にし、UNC は unreachable (X-8 §8)', () => {
    const host = makeHostPath('C:\\Users\\y\\.claude')
    if (!host.ok) throw new Error('bad host')
    const ok = resolveConfigDirPath(host.path, win32)
    expect(ok.ok && ok.path.value).toBe('C:\\Users\\y\\.claude')
    expect(ok.ok && ok.path.namespace).toBe('host')
    const unc = makeWslUncPath(
      uncNamespace('Ubuntu'),
      '\\\\wsl.localhost\\Ubuntu\\home\\y\\.claude'
    )
    if (!unc.ok) throw new Error('bad unc')
    expect(resolveConfigDirPath(unc.path, win32)).toEqual({ ok: false, reason: 'unreachable' })
  })

  it('停止中は blocked、mapping 未取得の host は blocked', () => {
    const host = makeHostPath('C:\\Users\\y\\.claude')
    if (!host.ok) throw new Error('bad host')
    expect(resolveConfigDirPath(host.path, wsl('Ubuntu', { state: 'stopped' }))).toEqual({
      ok: false,
      reason: 'blocked'
    })
    expect(resolveConfigDirPath(host.path, wsl('Ubuntu', { mapping: null }))).toEqual({
      ok: false,
      reason: 'blocked'
    })
  })
})
