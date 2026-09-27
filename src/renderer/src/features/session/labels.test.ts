import { describe, expect, it } from 'vitest'

import type { LaunchFailureReason } from '@domain/session/agent-session'

import { isReloginFailure, launchFailureLabel, launchRejectLabel, runStateLabel } from './labels'

/**
 * V-11 (provider-error) の UI 側検証 (実機 logout の代替。非破壊)。
 * 「認証エラーが理由つきで示され、再ログイン導線が出る」ことをラベル純関数で固める。
 */
describe('labels — V-11 provider-error の理由表示と再ログイン導線', () => {
  it('provider-error は再ログイン導線を出す (他は再起動導線)', () => {
    expect(isReloginFailure('provider-error')).toBe(true)
    expect(isReloginFailure('stream-protocol-error')).toBe(false)
    expect(isReloginFailure('process-crashed')).toBe(false)
    expect(isReloginFailure('launch-failed')).toBe(false)
    expect(isReloginFailure(null)).toBe(false)
  })

  it('provider-error の訳文は認証/接続を案内する (空でない)', () => {
    const label = launchFailureLabel('provider-error')
    expect(label.length).toBeGreaterThan(0)
    expect(label).toContain('認証')
  })

  it('全 LaunchFailureReason に非空の訳文がある (黙って空表示にならない)', () => {
    const reasons: LaunchFailureReason[] = [
      'distro-not-running',
      'not-verified-running',
      'distro-mismatch',
      'claude-not-found',
      'launch-failed',
      'process-crashed',
      'stream-protocol-error',
      'provider-error',
      'interrupt-unavailable'
    ]
    for (const r of reasons) {
      expect(launchFailureLabel(r).length).toBeGreaterThan(0)
    }
  })

  it('調停由来 (session-active / unknown-target) も訳文を持つ', () => {
    expect(launchRejectLabel('session-active').length).toBeGreaterThan(0)
    expect(launchRejectLabel('unknown-target').length).toBeGreaterThan(0)
  })

  it('runState ラベルは launching と running を区別する', () => {
    expect(runStateLabel('launching')).not.toBe(runStateLabel('running'))
  })
})
