import { describe, expect, it } from 'vitest'

import type { RuntimeDescriptorDTO } from '@domain/runtime/dto'

import {
  buildLaunchRuntimeFacts,
  buildLaunchRuntimeOptions,
  orderLaunchRuntimes,
  unusableWin32Status
} from './launch-runtime-options'

const capabilities: RuntimeDescriptorDTO['capabilities'] = {
  probeState: 'done',
  sandboxKind: 'none',
  seccompStatus: 'unknown',
  missingDependencies: [],
  probedAt: 0,
  autoModeAllowed: false,
  autoModeStatus: 'unavailable'
}

const wsl = (distro: string, state: 'running' | 'stopped' = 'running'): RuntimeDescriptorDTO => ({
  id: `wsl:${distro}`,
  kind: 'wsl',
  distroName: distro,
  wslVersion: 2,
  state,
  isDefault: false,
  capabilities,
  hasPathMapping: true,
  detectedAt: 0,
  claudeStatus: null,
  claudeOverridden: false
})

const win32 = (
  claudeStatus: NonNullable<RuntimeDescriptorDTO['claudeStatus']>
): RuntimeDescriptorDTO => ({
  ...wsl('x'),
  id: 'host',
  kind: 'win32',
  distroName: null,
  wslVersion: null,
  hasPathMapping: false,
  claudeStatus,
  claudeOverridden: false
})

describe('launch-runtime-options (X-8 / data-model §10.1)', () => {
  it('Win32 が先頭で、WSL の並びは今のまま', () => {
    const list = [wsl('Ubuntu'), win32('found'), wsl('Debian', 'stopped')]
    expect(orderLaunchRuntimes(list).map((r) => r.id)).toEqual(['host', 'wsl:Ubuntu', 'wsl:Debian'])
    expect(buildLaunchRuntimeOptions(list)).toEqual([
      { id: 'host', label: 'Windows (ホスト)', disabled: false },
      { id: 'wsl:Ubuntu', label: 'Ubuntu', disabled: false },
      { id: 'wsl:Debian', label: 'Debian（停止中）', disabled: false }
    ])
  })

  it.each([
    ['not-found', 'claude.exe なし'],
    ['shim-only', 'npm 版のみ'],
    ['override-invalid', '指定が無効']
  ] as const)('%s の Win32 は無効で短いラベルを添える', (status, label) => {
    expect(buildLaunchRuntimeOptions([win32(status)])).toEqual([
      { id: 'host', label: `Windows (ホスト) (${label})`, disabled: true }
    ])
    expect(unusableWin32Status([win32(status)])).toBe(status)
  })

  it('facts に Win32 が入るのは found のときだけ', () => {
    expect(buildLaunchRuntimeFacts([win32('found'), wsl('Ubuntu')])).toEqual([
      { id: 'host', distroName: null, running: true },
      { id: 'wsl:Ubuntu', distroName: 'Ubuntu', running: true }
    ])
    for (const status of ['not-found', 'shim-only', 'override-invalid'] as const) {
      expect(buildLaunchRuntimeFacts([win32(status)])).toEqual([])
    }
    expect(unusableWin32Status([win32('found'), wsl('Ubuntu')])).toBeNull()
    expect(unusableWin32Status([wsl('Ubuntu')])).toBeNull()
  })

  it('distro 名が分からない WSL は facts に入れない', () => {
    expect(buildLaunchRuntimeFacts([{ ...wsl('A'), distroName: null }])).toEqual([])
  })
})
