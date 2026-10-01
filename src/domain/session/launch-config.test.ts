import { describe, expect, it } from 'vitest'

import {
  assertSafePermissionMode,
  isSafePermissionMode,
  isValidLaunchConfig,
  isValidPresetName,
  normalizePresetName
} from './launch-config'

const valid = {
  folderId: 'f1',
  runtimeId: 'wsl:Ubuntu',
  providerId: 'p1',
  modelId: 'claude-sonnet-4-5[1m]',
  effort: 'high',
  permissionMode: 'plan'
}

describe('SafePermissionMode (AD-041 (a))', () => {
  it('安全 3 値だけを通す', () => {
    for (const m of ['default', 'plan', 'dontAsk']) expect(isSafePermissionMode(m)).toBe(true)
    for (const m of ['acceptEdits', 'auto', 'bypass' + 'Permissions', '', 'DEFAULT']) {
      expect(isSafePermissionMode(m)).toBe(false)
      expect(() => assertSafePermissionMode(m)).toThrow(/AD-041/)
    }
  })
})

describe('isValidLaunchConfig (IPC / preset-record / decoder の共有述語)', () => {
  it('形の正しい設定を通し、既定は null で表す', () => {
    expect(isValidLaunchConfig(valid)).toBe(true)
    expect(isValidLaunchConfig({ ...valid, providerId: null, modelId: null, effort: null })).toBe(
      true
    )
  })

  it.each([
    ['未知キー', { ...valid, settings: {} }],
    ['folderId 欠落', { ...valid, folderId: undefined }],
    ['runtimeId 空', { ...valid, runtimeId: '' }],
    ['providerId 制御文字', { ...valid, providerId: 'a\u0000b' }],
    ['modelId メタ文字', { ...valid, modelId: 'x;rm' }],
    ['effort enum 外', { ...valid, effort: 'ultra' }],
    ['昇格モード', { ...valid, permissionMode: 'acceptEdits' }],
    ['既定を文字列で表す', { ...valid, effort: 'default' }]
  ])('%s は拒否', (_l, value) => {
    expect(isValidLaunchConfig(value)).toBe(false)
  })
})

describe('プリセット名 (FR-009)', () => {
  it('trim + NFC で正規化し、日本語を許す', () => {
    expect(normalizePresetName('  業務用 Bedrock  ')).toBe('業務用 Bedrock')
    // 濁点の結合文字 (NFD) は NFC に揃う。
    expect(normalizePresetName('ガ')).toBe('ガ')
    expect(isValidPresetName('業務用')).toBe(true)
  })

  it('空・空白のみ・制御文字・長すぎは拒否', () => {
    for (const n of ['', '   ', 'a\u0001b', 'a'.repeat(256), 1]) {
      expect(isValidPresetName(n)).toBe(false)
    }
  })
})
