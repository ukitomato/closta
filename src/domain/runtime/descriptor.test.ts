import { describe, expect, it } from 'vitest'

import type { Win32ClaudeStatus } from './descriptor'

/** 集合を変えるには ADR が要る (AD-058)。 */
const STATUS_TABLE = {
  found: true,
  'not-found': true,
  'shim-only': true,
  'override-invalid': true
} as const satisfies Record<Win32ClaudeStatus, true>

describe('Win32ClaudeStatus (X-8 / AD-058)', () => {
  it('4 値に固定されている (集合を変えるには ADR が要る)', () => {
    expect(Object.keys(STATUS_TABLE).sort()).toEqual([
      'found',
      'not-found',
      'override-invalid',
      'shim-only'
    ])
  })
})
