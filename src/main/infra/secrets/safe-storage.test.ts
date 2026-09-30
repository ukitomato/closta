import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockSafeStorage } = vi.hoisted(() => ({
  mockSafeStorage: {
    isEncryptionAvailable: vi.fn<() => boolean>(),
    encryptString: vi.fn<(s: string) => Buffer>(),
    decryptString: vi.fn<(b: Buffer) => string>()
  }
}))

vi.mock('electron', () => ({ safeStorage: mockSafeStorage }))

const { createSecretStore } = await import('./safe-storage')

describe('createSecretStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('safeStorage 利用不可なら seal は null を返す (平文で保持しない。M-03)', () => {
    mockSafeStorage.isEncryptionAvailable.mockReturnValue(false)
    const store = createSecretStore()
    expect(store.isAvailable()).toBe(false)
    expect(store.seal('sk-secret')).toBeNull()
    expect(mockSafeStorage.encryptString).not.toHaveBeenCalled()
  })

  it('利用可能なら seal は base64 ciphertext を返す (平文でない参照値)', () => {
    mockSafeStorage.isEncryptionAvailable.mockReturnValue(true)
    mockSafeStorage.encryptString.mockReturnValue(Buffer.from('cipher-bytes'))
    const sealed = createSecretStore().seal('sk-secret')
    expect(sealed).toBe(Buffer.from('cipher-bytes').toString('base64'))
    expect(sealed).not.toContain('sk-secret')
  })

  it('open は参照値を復号して秘密値に戻す', () => {
    mockSafeStorage.decryptString.mockReturnValue('sk-secret')
    const sealed = Buffer.from('cipher-bytes').toString('base64')
    expect(createSecretStore().open(sealed)).toBe('sk-secret')
    expect(mockSafeStorage.decryptString).toHaveBeenCalledWith(Buffer.from('cipher-bytes'))
  })
})
