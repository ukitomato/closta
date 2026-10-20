import { describe, expect, it } from 'vitest'

import { makeHostPath, type HostPath } from '@domain/runtime/path-types'

import { createWin32Descriptor } from './win32'
import type { Win32ClaudeLocation } from './win32-claude'

const host = (raw: string): HostPath => {
  const r = makeHostPath(raw)
  if (!r.ok) throw new Error('bad path')
  return r.path
}

describe('createWin32Descriptor (X-8 / data-model §1.2)', () => {
  it('found は claudePath を持ち、overridden を写す', () => {
    const claude: Win32ClaudeLocation = {
      status: 'found',
      path: host('C:\\a\\claude.exe'),
      overridden: true
    }
    const d = createWin32Descriptor(1, claude)
    expect(d).toMatchObject({
      claudePath: 'C:\\a\\claude.exe',
      claudeStatus: 'found',
      claudeOverridden: true
    })
  })

  it.each([
    [{ status: 'not-found', overridden: false }, false],
    [{ status: 'shim-only', overridden: false }, false],
    [{ status: 'override-invalid', overridden: true }, true]
  ] as const)('%j は claudePath: null', (claude, overridden) => {
    const d = createWin32Descriptor(1, claude)
    expect(d.claudePath).toBeNull()
    expect(d.claudeStatus).toBe(claude.status)
    expect(d.claudeOverridden).toBe(overridden)
  })
})
