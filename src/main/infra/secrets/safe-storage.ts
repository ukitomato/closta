import { safeStorage } from 'electron'

/**
 * `api-key` / `oauth-token` の秘密値を OS キーチェーン (`safeStorage`) に預け、**参照値のみをアプリが持つ**
 * (Principle V / FR-004 / charter 不変条件)。**本モジュールが `infra/secrets/` の最初の `.ts`** であり、
 * `electron` import の例外枠 (AD-023 §8。eslint `SECRETS_FILES` / boundaries `secrets` category で許可済み)。
 *
 * **アプリは平文の秘密を永続化しない。** `seal` は safeStorage が OS 鍵で暗号化した ciphertext (base64) を返し、
 * それを `ProviderProfile.credential.secretRefKey` として JSON に持つ (平文でなく OS 暗号化済みの参照値)。
 * 復号は起動時の env 導出でのみ行う (`open`)。**safeStorage 利用不可な環境では `seal` が `null` を返し、
 * 呼び出し側が登録を拒否する** (平文で保持しない。Edge Case / M-03 / SC-002)。
 */
export interface SecretStore {
  /** OS の暗号化が利用可能か (キーチェーン無効環境では false)。 */
  isAvailable(): boolean
  /** 秘密を OS 鍵で暗号化し永続用の参照値 (base64 ciphertext) にする。利用不可なら `null`。 */
  seal(plaintext: string): string | null
  /** 参照値を復号して秘密値に戻す (起動時の env 導出でのみ)。 */
  open(sealed: string): string
}

export function createSecretStore(): SecretStore {
  return {
    isAvailable(): boolean {
      return safeStorage.isEncryptionAvailable()
    },
    seal(plaintext: string): string | null {
      if (!safeStorage.isEncryptionAvailable()) return null
      return safeStorage.encryptString(plaintext).toString('base64')
    },
    open(sealed: string): string {
      return safeStorage.decryptString(Buffer.from(sealed, 'base64'))
    }
  }
}
