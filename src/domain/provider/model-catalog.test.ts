import { describe, expect, it } from 'vitest'

import {
  isValidEffortLevels,
  isValidModelCatalog,
  isValidModelEntry,
  isValidModelId,
  MAX_CATALOG_MODELS
} from './model-catalog'

describe('isValidModelId (文字種 allowlist。FR-017)', () => {
  it.each([
    'claude-sonnet-4-5',
    'claude-sonnet-4-5[1m]',
    'us.anthropic.claude-sonnet-4-5-20250929-v1:0',
    'arn:aws:bedrock:us-east-1:123456789012:inference-profile/abc',
    'model@2025'
  ])('%s は有効', (id) => expect(isValidModelId(id)).toBe(true))

  it.each([
    '',
    '-rf',
    'a b',
    'x;echo',
    'x$(id)',
    'x`id`',
    'x|y',
    "x'y",
    'x"y',
    'x\ny',
    'a'.repeat(129)
  ])('%j は無効', (id) => expect(isValidModelId(id)).toBe(false))
})

describe('isValidEffortLevels', () => {
  it('enum・重複なし・5 件以下', () => {
    expect(isValidEffortLevels([])).toBe(true)
    expect(isValidEffortLevels(['low', 'high'])).toBe(true)
    expect(isValidEffortLevels(['low', 'medium', 'high', 'xhigh', 'max'])).toBe(true)
    expect(isValidEffortLevels(['low', 'low'])).toBe(false)
    expect(isValidEffortLevels(['ultra'])).toBe(false)
    expect(isValidEffortLevels('low')).toBe(false)
  })
})

describe('isValidModelEntry / isValidModelCatalog', () => {
  it('許可キー以外を拒否し、supportedEffortLevels を検証する', () => {
    expect(isValidModelEntry({ id: 'm', displayName: 'M' })).toBe(true)
    expect(isValidModelEntry({ id: 'm', displayName: 'M', supportedEffortLevels: ['low'] })).toBe(
      true
    )
    expect(isValidModelEntry({ id: 'm', displayName: 'M', supportedEffortLevels: ['x'] })).toBe(
      false
    )
    expect(isValidModelEntry({ id: 'm', displayName: 'M', extra: 1 })).toBe(false)
    expect(isValidModelEntry({ id: 'm', displayName: '' })).toBe(false)
    expect(isValidModelEntry({ id: 'm', displayName: 'M', inferenceProfileId: 'a b' })).toBe(false)
  })

  it('重複 id と件数上限を拒否する', () => {
    expect(isValidModelCatalog({ models: [] })).toBe(true)
    expect(
      isValidModelCatalog({
        models: [
          { id: 'm', displayName: 'A' },
          { id: 'm', displayName: 'B' }
        ]
      })
    ).toBe(false)
    const many = Array.from({ length: MAX_CATALOG_MODELS + 1 }, (_, i) => ({
      id: `m${i}`,
      displayName: 'M'
    }))
    expect(isValidModelCatalog({ models: many })).toBe(false)
  })

  it('root の未知キーを拒否する (永続層へ持ち込ませない。pr-gate R1 database M-302)', () => {
    expect(isValidModelCatalog({ models: [], note: 'x' })).toBe(false)
    expect(isValidModelCatalog({ models: [{ id: 'm', displayName: 'M' }], extra: 1 })).toBe(false)
    expect(isValidModelCatalog([])).toBe(false)
  })
})
