import type { HelperSettings } from './settings'
import type { DerivedLaunchEnv, ProviderProfile, ResolvedCredential } from './types'

/**
 * `ProviderProfile` から**セッション起動 env と制約付き settings を導出する純粋関数** (FR-008 / data-model §4)。
 *
 * **I/O を持たない** — `safeStorage` 復号値・helper パス・configDir の RuntimePath 変換は `infra` が先に解決し
 * `resolved` で受ける (H-03。Principle VII / AD-023 §3/§7)。`curatedBase` (X-1 `buildLaunchEnv` の passthrough
 * 許可リスト適用済み env) と denylist 述語 (`isDeniedEnvKey` = X-1 `LAUNCH_ENV_DENY_PATTERN` の SSoT。app が注入。
 * L-03 の再掲を避けるため文字列パターンを本モジュールに複製しない) を受ける。
 *
 * env は **2 経路を分離** (FR-009): (a) passthrough (`curatedBase` を spread + `extraEnv` の非 denylist KEY のみ)、
 * (b) 方式固有の実名 curated 注入 (`ANTHROPIC_API_KEY` 等。denylist の対象外 = 別勘定)。
 */
export interface DeriveLaunchEnvInput {
  readonly profile: ProviderProfile
  readonly resolved: ResolvedCredential
  /** infra `buildLaunchEnv` が組んだ curated base env (置換なので spread する。AD-039 D3)。 */
  readonly curatedBase: Record<string, string>
  /** passthrough denylist 述語 (SSoT = X-1 `LAUNCH_ENV_DENY_PATTERN`。FR-009 / security H-101)。 */
  readonly isDeniedEnvKey: (key: string) => boolean
}

/**
 * 導出が排他的に制御する env キー。**extraEnv からの持ち込みを禁じる** (PB-H-001)。
 *
 * `CLAUDE_CONFIG_DIR` は名前空間依存の RuntimePath でなければならず、config-dir 分岐が `resolved` から
 * 変換済みの値だけを注入する。extraEnv 経由で素の HostPath を載せると RuntimePath 変換を迂回し、WSL 内
 * `claude` が POSIX として解釈できず委譲が沈黙失敗する (Principle I / AD-004 / AD-036 §6 / FR-008)。
 * `isDeniedEnvKey` (資格情報系 denylist) は `CLAUDE_CONFIG_DIR` に一致しないため、ここで別途締め出す。
 */
const DERIVATION_CONTROLLED_KEYS: ReadonlySet<string> = new Set(['CLAUDE_CONFIG_DIR'])

export function deriveLaunchEnv(input: DeriveLaunchEnvInput): DerivedLaunchEnv {
  const { profile, resolved, curatedBase, isDeniedEnvKey } = input

  // (a) passthrough: curated base を spread。process.env 継承に頼らない (AD-039 D3)。
  const env: Record<string, string> = { ...curatedBase }

  // extraEnv は passthrough 側。**導出時に KEY denylist を適用** — WSLENV/資格情報 KEY は除外する
  // (無害キー名の下の WSLENV 再導入を塞ぐ。security H-101)。加えて導出が制御する `CLAUDE_CONFIG_DIR` は
  // extraEnv から持ち込ませない (素の HostPath で RuntimePath 変換を迂回させない。PB-H-001)。
  // 値スキャンは登録時 (secret-scan) が別に担う。
  if (profile.extraEnv !== undefined) {
    for (const [key, value] of Object.entries(profile.extraEnv)) {
      if (isDeniedEnvKey(key) || DERIVATION_CONTROLLED_KEYS.has(key)) continue
      env[key] = value
    }
  }

  // (b) 方式固有の実名 curated 注入 (denylist の対象外・別勘定)。resolved の値のみを注入する。
  let settings: HelperSettings | undefined
  const cred = profile.credential
  switch (cred.source) {
    case 'api-key':
      if (resolved.apiKeyValue !== undefined) env.ANTHROPIC_API_KEY = resolved.apiKeyValue
      break
    case 'oauth-token':
      if (resolved.oauthTokenValue !== undefined)
        env.CLAUDE_CODE_OAUTH_TOKEN = resolved.oauthTokenValue
      break
    case 'api-key-helper':
      settings = { apiKeyHelper: cred.helperPath }
      break
    case 'aws-credential-export':
      settings = { awsCredentialExport: cred.helperPath }
      break
    case 'aws-assume-role':
      // R-02: awsCredentialExport 化。helper パスを settings で渡し、一時資格の実体を持たない。
      settings = { awsCredentialExport: resolved.awsCredentialExportPath ?? cred.helperPath }
      break
    case 'aws-profile':
      env.AWS_PROFILE = cred.profileName
      if (cred.region !== undefined) env.AWS_REGION = cred.region
      if (profile.backend === 'bedrock') env.CLAUDE_CODE_USE_BEDROCK = '1'
      break
    case 'config-dir':
    case 'in-app-login':
      // CLAUDE_CONFIG_DIR は infra が RuntimePath へ変換した値を注入 (素の HostPath を載せない。H-02)。
      // branded の `.value` を取り出す (RuntimePath 経由を型で強制。PB-M-001)。
      if (resolved.configDirRuntimePath !== undefined) {
        env.CLAUDE_CONFIG_DIR = resolved.configDirRuntimePath.value
      }
      break
    case 'env-passthrough':
      // 選択された非 denylist 変数は infra が denylist 適用のうえ curatedBase に合流済み (値を domain は持たない)。
      break
  }

  return settings === undefined ? { env } : { env, settings }
}
