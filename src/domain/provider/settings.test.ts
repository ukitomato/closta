import { describe, expect, it } from 'vitest'

import { assertHelperSettings, isHelperSettings, type HelperSettings } from './settings'

/**
 * C-001 / AD-040 の gate: `settings` は `{apiKeyHelper, awsCredentialExport}` の 2 キー限定に閉じ、
 * 昇格キー (`permissions`/`permissionMode`/`env`) を型でも実行時でも持たせない。
 */
describe('isHelperSettings', () => {
  it('空オブジェクト・helper 2 キーのみを受理する', () => {
    expect(isHelperSettings({})).toBe(true)
    expect(isHelperSettings({ apiKeyHelper: '/path/to/helper' })).toBe(true)
    expect(isHelperSettings({ awsCredentialExport: '/path/to/exp' })).toBe(true)
    expect(isHelperSettings({ apiKeyHelper: '/a', awsCredentialExport: '/b' })).toBe(true)
  })

  it('昇格キーが混じると拒否する (permissions/permissionMode/env)', () => {
    expect(isHelperSettings({ permissionMode: 'bypassPermissions' })).toBe(false)
    expect(isHelperSettings({ apiKeyHelper: '/a', permissions: {} })).toBe(false)
    expect(isHelperSettings({ apiKeyHelper: '/a', env: { X: '1' } })).toBe(false)
    expect(isHelperSettings({ allowedTools: ['*'] })).toBe(false)
  })

  it('非文字列の値・非オブジェクトを拒否する', () => {
    expect(isHelperSettings({ apiKeyHelper: 123 })).toBe(false)
    expect(isHelperSettings(null)).toBe(false)
    expect(isHelperSettings('settings')).toBe(false)
  })
})

describe('assertHelperSettings', () => {
  it('undefined はそのまま通す (helper 委譲なし)', () => {
    expect(assertHelperSettings(undefined)).toBeUndefined()
  })

  it('helper 2 キー限定はそのまま返す', () => {
    const s: HelperSettings = { apiKeyHelper: '/a' }
    expect(assertHelperSettings(s)).toBe(s)
  })

  it('昇格キー混入 (変数形でも) を throw で締め出す', () => {
    // 境界通過後は型保証が消えるため、実行時に許可リスト外キーを検出する。
    const tainted = {
      apiKeyHelper: '/a',
      permissionMode: 'bypassPermissions'
    } as unknown as HelperSettings
    expect(() => assertHelperSettings(tainted)).toThrow(/AD-040/)
  })
})
