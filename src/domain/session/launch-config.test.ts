import { describe, expect, it } from 'vitest'

import {
  assertSafePermissionMode,
  DEFAULT_EXTRA_AXES,
  isSafePermissionMode,
  isValidAdditionalDirectoryIds,
  isValidLaunchConfig,
  isValidLaunchSessionName,
  isValidMaxBudgetUsd,
  isValidMaxTurns,
  isValidPresetConfig,
  isValidPresetConfigV1,
  isValidPresetName,
  LAUNCH_CONFIG_KEYS,
  normalizePresetName,
  PRESET_CONFIG_KEYS,
  PRESET_CONFIG_KEYS_V1,
  toPresetConfig
} from './launch-config'

const valid = {
  folderId: 'f1',
  runtimeId: 'wsl:Ubuntu',
  providerId: 'p1',
  modelId: 'claude-sonnet-4-5[1m]',
  effort: 'high',
  permissionMode: 'plan',
  ...DEFAULT_EXTRA_AXES,
  sessionName: null
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
    ['既定を文字列で表す', { ...valid, effort: 'default' }],
    ['追加ディレクトリのキーの欠け', { ...valid, additionalDirectoryIds: undefined }],
    ['maxTurns のキーの欠け', { ...valid, maxTurns: undefined }],
    ['maxBudgetUsd のキーの欠け', { ...valid, maxBudgetUsd: undefined }],
    ['sessionName のキーの欠け', { ...valid, sessionName: undefined }]
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

describe('キー集合の pin (AD-064。集合を変えるには ADR が要る)', () => {
  it('LAUNCH_CONFIG_KEYS は 10・PRESET_CONFIG_KEYS は 9・PRESET_CONFIG_KEYS_V1 は 6', () => {
    expect([...LAUNCH_CONFIG_KEYS]).toEqual([
      'folderId',
      'runtimeId',
      'providerId',
      'modelId',
      'effort',
      'permissionMode',
      'additionalDirectoryIds',
      'maxTurns',
      'maxBudgetUsd',
      'sessionName'
    ])
    expect([...PRESET_CONFIG_KEYS]).toEqual(LAUNCH_CONFIG_KEYS.filter((k) => k !== 'sessionName'))
    expect(PRESET_CONFIG_KEYS).toHaveLength(9)
    expect([...PRESET_CONFIG_KEYS_V1]).toEqual([
      'folderId',
      'runtimeId',
      'providerId',
      'modelId',
      'effort',
      'permissionMode'
    ])
  })
})

describe('isValidAdditionalDirectoryIds', () => {
  const ids = (n: number): string[] => Array.from({ length: n }, (_, i) => `d${i}`)
  it('0 / 10 件で通り 11 件で落ちる', () => {
    expect(isValidAdditionalDirectoryIds([], 'f1')).toBe(true)
    expect(isValidAdditionalDirectoryIds(ids(10), 'f1')).toBe(true)
    expect(isValidAdditionalDirectoryIds(ids(11), 'f1')).toBe(false)
  })
  it('重複・作業フォルダと同じ id・id の形の外・配列でない値で落ちる', () => {
    expect(isValidAdditionalDirectoryIds(['a', 'a'], 'f1')).toBe(false)
    expect(isValidAdditionalDirectoryIds(['f1'], 'f1')).toBe(false)
    expect(isValidAdditionalDirectoryIds([''], 'f1')).toBe(false)
    expect(isValidAdditionalDirectoryIds(['a\u0000b'], 'f1')).toBe(false)
    expect(isValidAdditionalDirectoryIds([1], 'f1')).toBe(false)
    expect(isValidAdditionalDirectoryIds('a', 'f1')).toBe(false)
    expect(isValidAdditionalDirectoryIds(null, 'f1')).toBe(false)
  })
})

describe('isValidMaxTurns', () => {
  it.each([null, 1, 1000, 30])('%s は通る', (v) => {
    expect(isValidMaxTurns(v)).toBe(true)
  })
  it.each([0, 1001, 1.5, NaN, Infinity, -1, '30', undefined, {}])('%s は落ちる', (v) => {
    expect(isValidMaxTurns(v)).toBe(false)
  })
})

describe('isValidMaxBudgetUsd', () => {
  it.each([null, 0.01, 0.07, 2, 1000, 2.5])('%s は通る', (v) => {
    expect(isValidMaxBudgetUsd(v)).toBe(true)
  })
  it.each([0, 1000.01, 0.005, -1, 1.234, NaN, Infinity, '2', undefined])('%s は落ちる', (v) => {
    expect(isValidMaxBudgetUsd(v)).toBe(false)
  })
})

describe('isValidLaunchSessionName (023 FR-009 と同じ制限)', () => {
  it('null と trim 後に変わらない名前を通す', () => {
    expect(isValidLaunchSessionName(null)).toBe(true)
    expect(isValidLaunchSessionName('ログインの API 修正')).toBe(true)
    expect(isValidLaunchSessionName('a'.repeat(100))).toBe(true)
    expect(isValidLaunchSessionName('😀'.repeat(100))).toBe(true)
  })
  it.each([
    '',
    '   ',
    ' a',
    'a ',
    'a'.repeat(101),
    '😀'.repeat(101),
    'a\nb',
    'a\u0000b',
    'a\u2028b',
    'a\u2029b',
    1,
    undefined
  ])('%j は落ちる', (v) => {
    expect(isValidLaunchSessionName(v)).toBe(false)
  })
})

describe('isValidPresetConfig / isValidPresetConfigV1 / toPresetConfig', () => {
  const { sessionName: _n, ...preset } = valid
  void _n
  it('9 キーを通し、sessionName のキーを持つ値は拒否する', () => {
    expect(isValidPresetConfig(preset)).toBe(true)
    expect(isValidPresetConfig(valid)).toBe(false)
    expect(isValidPresetConfig({ ...preset, sessionName: null })).toBe(false)
  })
  it('版 1 は前 6 軸の 6 キーだけを通す', () => {
    const { additionalDirectoryIds: _a, maxTurns: _t, maxBudgetUsd: _b, ...v1 } = preset
    void _a
    void _t
    void _b
    expect(isValidPresetConfigV1(v1)).toBe(true)
    expect(isValidPresetConfigV1(preset)).toBe(false)
    expect(isValidPresetConfigV1({ ...v1, effort: 'ultra' })).toBe(false)
  })
  it('toPresetConfig は sessionName を除いた新しい object を返し、元を変えない', () => {
    const config = { ...valid, sessionName: 'n' } as Parameters<typeof toPresetConfig>[0]
    const out = toPresetConfig(config)
    expect('sessionName' in out).toBe(false)
    expect(out).not.toBe(config)
    expect(config.sessionName).toBe('n')
    expect(isValidPresetConfig(out)).toBe(true)
  })
})
