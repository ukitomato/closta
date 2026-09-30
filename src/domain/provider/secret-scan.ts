/**
 * `extraEnv` の値が**秘密らしい形**かを判定する純粋関数 (FR-004 / H-09 / security M-101)。
 *
 * `extraEnv` は秘密を入れる場所ではない。登録 / 更新の**永続前**に値をスキャンし、秘密らしい値を持つ KEY を
 * 返す (呼び出し側 = app/infra が登録を拒否する。無害キー名の下に秘密値が平文 JSON へ焼き込まれるのを防ぐ)。
 *
 * **これは best-effort backstop である** — ヒューリスティックは網羅を保証しない (security M-101)。秘密は必ず
 * `api-key` / `oauth-token` の `safeStorage` 経路へ誘導する。SC-002 の primary は永続スキーマの静的検査 (SH-010)。
 */

/**
 * 秘密の綴りパターン (SSoT。security M-101 で拡張)。
 * 既知プロバイダのキー接頭辞 + `Bearer ` + 長大な高エントロピー base64/hex を含む。
 */
const SECRET_PREFIX_PATTERNS: readonly RegExp[] = [
  /\bsk-[A-Za-z0-9_-]{16,}/, // OpenAI / Anthropic 系
  /\bAIza[A-Za-z0-9_-]{16,}/, // Google API key
  /\bgh[pousr]_[A-Za-z0-9]{16,}/, // GitHub token
  /\bglpat-[A-Za-z0-9_-]{16,}/, // GitLab PAT
  /\bxox[baprs]-[A-Za-z0-9-]{10,}/, // Slack token
  /\bAKIA[0-9A-Z]{16}\b/, // AWS access key id
  /\bASIA[0-9A-Z]{16}\b/, // AWS temp access key id
  /^Bearer\s+[A-Za-z0-9._-]{16,}$/, // Authorization: Bearer ...
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/ // PEM private key
]

/** 高エントロピーな長い英数字/base64 blob (>= 40 桁の連続) を秘密とみなす保守的判定。 */
const HIGH_ENTROPY_BLOB = /[A-Za-z0-9+/=_-]{40,}/

export function looksLikeSecret(value: string): boolean {
  if (SECRET_PREFIX_PATTERNS.some((re) => re.test(value))) return true
  // 40 桁以上の連続 blob かつ英字と数字が混在するもの (英字のみ/数字のみのパスや文章を除く)。
  const blob = HIGH_ENTROPY_BLOB.exec(value)
  if (blob !== null) {
    const s = blob[0]
    if (/[A-Za-z]/.test(s) && /[0-9]/.test(s)) return true
  }
  return false
}

/** `extraEnv` のうち秘密らしい値を持つ KEY を列挙する (空配列なら安全)。 */
export function scanExtraEnvForSecrets(extraEnv: Record<string, string> | undefined): string[] {
  if (extraEnv === undefined) return []
  const offending: string[] = []
  for (const [key, value] of Object.entries(extraEnv)) {
    if (looksLikeSecret(value)) offending.push(key)
  }
  return offending
}
