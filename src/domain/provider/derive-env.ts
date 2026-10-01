import {
  isPassthroughVarName,
  isValidForwardKeyName,
  isWindowsPathValue,
  type MethodSpecificForwardKey
} from './forward-env'
import type { HelperSettings } from './settings'
import type { DerivedLaunchEnv, ProviderProfile, ResolvedCredential } from './types'

/**
 * `ProviderProfile` から**セッション起動 env・転送キー・制約付き settings を導出する純粋関数**
 * (X-3 FR-008 / data-model §4 / X-4 FR-013 / [AD-041](../../../docs/decisions/0041-x4-launch-config-on-x1-launch-gate.md) (e))。
 *
 * **I/O を持たない** — `safeStorage` 復号値・helper パスの分類・configDir の RuntimePath 変換・env-passthrough の値は
 * `infra` が先に解決して `resolved` で渡す (H-03。Principle VII / AD-023 §3/§7)。
 * `curatedBase` (X-1 `buildLaunchEnv` の passthrough 許可リスト適用済み env) と 2 つの述語を受ける。
 * 述語の文字列パターンは本モジュールに複製しない (SSoT は infra。L-03)。
 * - `isDeniedEnvKey`: 資格情報 denylist (`LAUNCH_ENV_DENY_PATTERN`)。passthrough (curated base と extraEnv) にだけ掛ける。
 * - `isForbiddenForwardKey`: 転送禁止キー (`makeForbiddenForwardKey`)。extraEnv に掛ける。
 *
 * env は **2 経路を分離** (FR-009): (a) passthrough (`curatedBase` + extraEnv の採用キー)、
 * (b) 方式固有の実名注入 (`ANTHROPIC_API_KEY` 等。資格情報 denylist の対象外 = 別勘定)。
 * **`forwardKeys` は (a) の extraEnv 採用キーと (b) だけ** — curated base のキーは WSL へ転送しない
 * (転送すると Windows 形式の `TMP` が WSL 内の tmpdir を作業フォルダ基準の相対パスに化けさせる。AD-041 (e) 1)。
 *
 * 資格情報 denylist と導出が制御するキーの extraEnv は**導出で締め出す** (skip)。
 * 導出を**続けられない**不整合 (転送禁止キー・名前規則違反・Windows パス値の extraEnv / helper の分類済みパスが無い /
 * allowlist 外の varName / Windows パス値の passthrough) は `null` を返して起動を拒否させる (fail-closed。FR-013)。
 * 登録境界 (IPC と provider-record の read 側) も同じ述語で拒否するので、ストア経由でここに届くことはない (defense-in-depth)。
 */
export interface DeriveLaunchEnvInput {
  readonly profile: ProviderProfile
  readonly resolved: ResolvedCredential
  /** infra `buildLaunchEnv` が組んだ curated base env (置換なので spread する。AD-039 D3)。 */
  readonly curatedBase: Record<string, string>
  /** passthrough の資格情報 denylist 述語 (SSoT = X-1 `LAUNCH_ENV_DENY_PATTERN`。FR-009 / security H-101)。 */
  readonly isDeniedEnvKey: (key: string) => boolean
  /**
   * 転送禁止キーの述語 (X-4。`makeForbiddenForwardKey(transportKeys)`)。**必須** — 省略時に許可側へ倒す
   * 既定値を持たない (注入し忘れた導出元で extraEnv の `LD_PRELOAD` 等が転送される fail-open を作らない。PB-3)。
   */
  readonly isForbiddenForwardKey: (key: string) => boolean
}

/**
 * 導出が排他的に制御する env キー。**extraEnv からの持ち込みを禁じる** (PB-H-001)。
 *
 * `CLAUDE_CONFIG_DIR` は名前空間依存の RuntimePath でなければならず、config-dir 分岐が `resolved` から
 * 変換済みの値だけを注入する。X-4 の転送禁止キーもこれを包含するが、注入された述語の中身に依らず締め出すため残す。
 */
const DERIVATION_CONTROLLED_KEYS: ReadonlySet<string> = new Set(['CLAUDE_CONFIG_DIR'])

export function deriveLaunchEnv(input: DeriveLaunchEnvInput): DerivedLaunchEnv | null {
  const { profile, resolved, curatedBase, isDeniedEnvKey, isForbiddenForwardKey } = input

  // (a) passthrough: curated base を spread。process.env 継承に頼らない (AD-039 D3)。**転送はしない。**
  const env: Record<string, string> = { ...curatedBase }
  const forwardKeys: string[] = []
  const inject = (key: string, value: string): void => {
    env[key] = value
    if (!forwardKeys.includes(key)) forwardKeys.push(key)
  }
  // (b) の方式固有注入は forward-env.ts の実名集合 (`METHOD_SPECIFIC_FORWARD_KEYS`) に型で閉じる
  // (composeLaunchEnv が同じ集合で転送禁止キーの拒否から外す)。
  const injectMethod = (key: MethodSpecificForwardKey, value: string): void => inject(key, value)

  if (profile.extraEnv !== undefined) {
    for (const [key, value] of Object.entries(profile.extraEnv)) {
      if (isDeniedEnvKey(key) || DERIVATION_CONTROLLED_KEYS.has(key)) continue
      // 転送禁止キー・名前規則違反・Windows パス値は捨てずに起動を拒否する (FR-013 / pr-gate R1 arch L-004)。
      if (isForbiddenForwardKey(key) || !isValidForwardKeyName(key) || isWindowsPathValue(value)) {
        return null
      }
      inject(key, value)
    }
  }

  // (b) 方式固有の実名注入 (資格情報 denylist の対象外・別勘定)。resolved の値のみを注入する。
  let settings: HelperSettings | undefined
  const cred = profile.credential
  switch (cred.source) {
    case 'api-key':
      if (resolved.apiKeyValue !== undefined) {
        injectMethod('ANTHROPIC_API_KEY', resolved.apiKeyValue)
      }
      break
    case 'oauth-token':
      if (resolved.oauthTokenValue !== undefined) {
        injectMethod('CLAUDE_CODE_OAUTH_TOKEN', resolved.oauthTokenValue)
      }
      break
    case 'api-key-helper':
    case 'aws-credential-export':
    case 'aws-assume-role': {
      // helper パスは infra が選択ランタイムの名前空間で分類した RuntimePath だけを使う (X-4 FR-014)。
      // **素の helperPath へ fallback しない** — HostPath のまま WSL に渡ると helper が見つからない (fail-closed)。
      const helper = resolved.helperRuntimePath
      if (helper === undefined) return null
      settings =
        cred.source === 'api-key-helper'
          ? { apiKeyHelper: helper.value }
          : { awsCredentialExport: helper.value }
      break
    }
    case 'aws-profile':
      injectMethod('AWS_PROFILE', cred.profileName)
      if (cred.region !== undefined) injectMethod('AWS_REGION', cred.region)
      if (profile.backend === 'bedrock') injectMethod('CLAUDE_CODE_USE_BEDROCK', '1')
      break
    case 'config-dir':
    case 'in-app-login':
      // CLAUDE_CONFIG_DIR は infra が RuntimePath へ変換した値を注入 (素の HostPath を載せない。H-02)。
      if (resolved.configDirRuntimePath !== undefined) {
        injectMethod('CLAUDE_CONFIG_DIR', resolved.configDirRuntimePath.value)
      }
      break
    case 'env-passthrough': {
      // varNames は実名 allowlist に限る (AD-041 (e) 4)。値は infra がアプリの process.env から取る。
      const values = resolved.passthroughValues ?? {}
      for (const name of cred.varNames) {
        if (!isPassthroughVarName(name)) return null
        const value = values[name]
        if (value === undefined) continue // 親 env に無い変数は渡さない
        if (isWindowsPathValue(value)) return null
        inject(name, value)
      }
      break
    }
  }

  return settings === undefined ? { env, forwardKeys } : { env, forwardKeys, settings }
}
