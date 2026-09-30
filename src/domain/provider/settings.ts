/**
 * X-3 の helper 委譲を運ぶ**制約付き `settings` 射影** (C-001 / [AD-040](../../../docs/decisions/0040-provider-settings-constrained-projection.md))。
 *
 * X-1 の AD-036 §4 P1 は `query()` options の `settings` を昇格レバーとして締め出した
 * (`Settings.permissions.defaultMode` 経由で bypassPermissions/auto へ遷移できるため)。AD-040 はこれを調停し、
 * **`settings` を `{ apiKeyHelper?, awsCredentialExport? }` の 2 キー限定射影に限って許す** — 昇格面
 * (`permissions` / `permissionMode` / `env`) は型で組めず、境界通過後 (agents) の実行時 assert で再確立する。
 *
 * **`domain/provider` に置く**のは、`DerivedLaunchEnv.settings` (provider が導出) と
 * `BuiltQueryOptions.settings` (agents が組む) の双方から参照され、かつ provider→session の依存を作らないため
 * (`agents` → `domain/provider` は許可。`domain/provider` は `domain/session` を import しない)。
 */

/** helper 委譲の 2 キー限定射影。`Settings` 全体を組めない (昇格キーを型で持たない)。 */
export interface HelperSettings {
  /** `api-key-helper` 方式の helper スクリプトパス (AD-039 §3)。秘密でなくパス。 */
  readonly apiKeyHelper?: string
  /** `aws-credential-export` 方式の helper スクリプトパス (AD-039 §3)。秘密でなくパス。 */
  readonly awsCredentialExport?: string
}

/**
 * `settings` に現れてよいキーの**許可リスト** (AD-040 Decision 4 / `QUERY_SETTINGS_ALLOWED_KEYS`)。
 * これ以外のキー (`permissions` / `permissionMode` / `env` 等) が現れたら昇格面の再導入であり違反。
 */
export const HELPER_SETTINGS_KEYS = ['apiKeyHelper', 'awsCredentialExport'] as const

/**
 * `settings` オブジェクトのキー集合が許可リストの完全部分集合かを判定する (`as` キャストしない)。
 *
 * 境界 (main→agents の structured-clone) を越えると `HelperSettings` 型保証が消えるため、
 * query() options に載せる直前 (agents) にこの述語で再確立する (BE-010b / contracts C-4)。
 */
export function isHelperSettings(value: unknown): value is HelperSettings {
  if (typeof value !== 'object' || value === null) return false
  const allowed = HELPER_SETTINGS_KEYS as readonly string[]
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) return false
    const v = (value as Record<string, unknown>)[key]
    if (v !== undefined && typeof v !== 'string') return false
  }
  return true
}

/**
 * query 直前の**実行時 assert** (BE-010b。load-bearing gate)。
 *
 * キー集合 ⊆ `{apiKeyHelper, awsCredentialExport}` を検証し、逸脱は throw する
 * (`settings: someVar` の変数形でも効く。grep backstop の check.mjs 項目 16 では捕捉しづらい経路を塞ぐ)。
 * `undefined` はそのまま通す (settings 無しは正当)。
 */
export function assertHelperSettings(
  value: HelperSettings | undefined
): HelperSettings | undefined {
  if (value === undefined) return undefined
  if (!isHelperSettings(value)) {
    throw new Error(
      'assertHelperSettings: settings キーが許可リスト {apiKeyHelper, awsCredentialExport} を超えています (AD-040)'
    )
  }
  return value
}
