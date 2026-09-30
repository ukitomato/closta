import { describe, expect, it } from 'vitest'

import { looksLikeSecret, scanExtraEnvForSecrets } from './secret-scan'

describe('looksLikeSecret', () => {
  it('既知プロバイダのキー接頭辞を秘密とみなす', () => {
    expect(looksLikeSecret('sk-ant-api03-abcdefghijklmnop')).toBe(true)
    expect(looksLikeSecret('AIzaSyA1234567890abcdefgh')).toBe(true)
    expect(looksLikeSecret('ghp_abcdefghijklmnopqrstuvwx')).toBe(true)
    expect(looksLikeSecret('glpat-abcdefghijklmnopqrst')).toBe(true)
    expect(looksLikeSecret('xoxb-1234567890-abcdefghij')).toBe(true)
    expect(looksLikeSecret('AKIAIOSFODNN7EXAMPLE')).toBe(true)
    expect(looksLikeSecret('Bearer abcdefghijklmnopqrstuvwx')).toBe(true)
  })

  it('高エントロピーな長い blob を秘密とみなす', () => {
    expect(looksLikeSecret('a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8s9T0uvwx')).toBe(true)
  })

  it('無害な値 (パス・短い値・フラグ) は秘密とみなさない', () => {
    expect(looksLikeSecret('/home/y/.claude')).toBe(false)
    expect(looksLikeSecret('us-east-1')).toBe(false)
    expect(looksLikeSecret('1')).toBe(false)
    expect(looksLikeSecret('production')).toBe(false)
  })
})

describe('scanExtraEnvForSecrets', () => {
  it('無害キー名の下の秘密値を持つ KEY を列挙する (H-09)', () => {
    const offending = scanExtraEnvForSecrets({
      MY_TOKEN_HOLDER: 'sk-ant-api03-abcdefghijklmnop',
      REGION: 'us-east-1',
      FLAG: '1'
    })
    expect(offending).toEqual(['MY_TOKEN_HOLDER'])
  })

  it('秘密が無ければ空配列', () => {
    expect(scanExtraEnvForSecrets({ REGION: 'us-east-1' })).toEqual([])
    expect(scanExtraEnvForSecrets(undefined)).toEqual([])
  })
})
