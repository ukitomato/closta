import { describe, expect, it } from 'vitest'

import type { AutoModeStatus } from '@domain/runtime/capabilities'

import { PERMISSION_MODE_NAMES } from '@/features/chat/labels'

import { AUTO_MODE_BANNER_LABELS, UNSAFE_MODE_BANNER_LABELS } from './labels'

describe('labels — Auto の帯 (026 / data-model §9)', () => {
  it('autoModeBanner / autoModeRevert は名前を含む・空でない', () => {
    const name = PERMISSION_MODE_NAMES.auto
    expect(AUTO_MODE_BANNER_LABELS.autoModeBanner(name)).toContain(name)
    expect(AUTO_MODE_BANNER_LABELS.autoModeRevert.length).toBeGreaterThan(0)
  })

  it('隔離の文は 3 つの状態すべてで定義され、どれも隔離されていないと読める (U-6 / FR-008)', () => {
    const statuses: readonly AutoModeStatus[] = ['unavailable', 'allowed', 'undetermined']
    for (const s of statuses) {
      const text = AUTO_MODE_BANNER_LABELS.autoModeIsolation(s)
      expect(text).toMatch(/隔離されていません|隔離がありません/)
    }
  })

  it('allowed の文は UNSAFE_MODE_BANNER_LABELS の文と違う', () => {
    const allowed = AUTO_MODE_BANNER_LABELS.autoModeIsolation('allowed')
    expect(allowed).not.toBe(UNSAFE_MODE_BANNER_LABELS.unsafeModeIsolationUnverified)
    expect(allowed).not.toBe(UNSAFE_MODE_BANNER_LABELS.unsafeModeNoIsolation)
  })
})
