import type { HostPath, RuntimePath, WslUncPath } from '@domain/runtime/path-types'

import type { HelperSettings } from './settings'

/**
 * X-3 Provider 登録と到達可能性判定の `domain` 型 (data-model)。**I/O を持たない。**
 *
 * 型正本は [AD-005](../../../docs/decisions/0005-provider-as-registrable-value.md) (`ProviderProfile`)、
 * 9 種 `CredentialSource` × 委譲マトリクスは [AD-039](../../../docs/decisions/0039-credential-delegation-verified.md) §3。
 * **秘密の実体はどの型にも現れない** (Principle V / FR-004)。
 */

/** Provider の認証方式 (9 種)。参照キーであり訳出は `ui` (FR-014 / AD-039 §3)。 */
export type CredentialSource =
  | 'config-dir'
  | 'in-app-login'
  | 'api-key-helper'
  | 'api-key'
  | 'oauth-token'
  | 'aws-profile'
  | 'aws-credential-export'
  | 'aws-assume-role'
  | 'env-passthrough'

export const CREDENTIAL_SOURCES = [
  'config-dir',
  'in-app-login',
  'api-key-helper',
  'api-key',
  'oauth-token',
  'aws-profile',
  'aws-credential-export',
  'aws-assume-role',
  'env-passthrough'
] as const satisfies readonly CredentialSource[]

export function isCredentialSource(value: unknown): value is CredentialSource {
  return typeof value === 'string' && (CREDENTIAL_SOURCES as readonly string[]).includes(value)
}

/**
 * AD-005 の `credential: CredentialSource` を、**非秘密の参照** (safeStorage 参照キー / helper パス /
 * profile 名 / role メタ) を担うために精緻化した判別 union (data-model §2 の読み替え。Principle V)。
 * **秘密の実体は持たない** — `api-key` / `oauth-token` は `safeStorage` 参照キーのみ。
 */
export type CredentialRef =
  | { readonly source: 'config-dir' }
  | { readonly source: 'in-app-login' }
  | { readonly source: 'api-key-helper'; readonly helperPath: string }
  /** `safeStorage` 参照キー (秘密の実体でない)。 */
  | { readonly source: 'api-key'; readonly secretRefKey: string }
  | { readonly source: 'oauth-token'; readonly secretRefKey: string }
  | { readonly source: 'aws-profile'; readonly profileName: string; readonly region?: string }
  | { readonly source: 'aws-credential-export'; readonly helperPath: string }
  /** R-02: awsCredentialExport 化。AssumeRole して一時資格を出力する helper のパス。 */
  | { readonly source: 'aws-assume-role'; readonly helperPath: string }
  /** env-passthrough は**変数名のみ** (値を持たない。H-10)。 */
  | { readonly source: 'env-passthrough'; readonly varNames: readonly string[] }

/** Provider ごとのモデル集合。**Bedrock は inference profile ID で pin** (FR-010)。 */
export interface ModelEntry {
  readonly id: string
  readonly displayName: string
  /** Bedrock は inference profile ID で pin (alias 運用しない)。 */
  readonly inferenceProfileId?: string
}

export interface ModelCatalogRef {
  readonly models: readonly ModelEntry[]
}

/** Provider の実体 (AD-005 型)。**秘密の実体を持たない**。 */
export interface ProviderProfile {
  readonly id: string
  readonly displayName: string
  readonly backend: 'anthropic' | 'bedrock' | 'vertex' | 'foundry'
  /** `CLAUDE_CONFIG_DIR`。WSL 内 config は UNC 名前空間 (AD-025 §2。H-101)。未指定なら既定。 */
  readonly configDir?: HostPath | WslUncPath
  readonly credential: CredentialRef
  readonly models: ModelCatalogRef
  /** 追加 env。**秘密を入れる場所ではない** — 永続前に値スキャン (FR-004 / H-09)。 */
  readonly extraEnv?: Record<string, string>
}

/**
 * 検出で得た**登録前の候補** (data-model §3)。**env の秘密「値」を運ばない** — 変数名・存在・所在のメタのみ
 * (H-10 / FR-002)。**提示のみで自動登録しない** (FR-002 / SC-001)。
 */
export type DetectedCandidate =
  | {
      readonly kind: 'config-dir'
      readonly displayLabel: string
      /** config dir の値と名前空間 (表示・登録用。生パスは infra が変換)。 */
      readonly configDirValue: string
      readonly namespace: string
      readonly alreadyRegistered: boolean
    }
  | {
      readonly kind: 'aws-profile'
      readonly displayLabel: string
      readonly profileName: string
      readonly alreadyRegistered: boolean
    }
  | {
      readonly kind: 'env-passthrough'
      readonly displayLabel: string
      /** 変数名のみ。**値を含まない** (H-10)。 */
      readonly varNames: readonly string[]
      readonly alreadyRegistered: boolean
    }

/**
 * `infra` が先に解決した値 (I/O 境界。data-model §4)。純粋関数 `deriveLaunchEnv` へ**引数で渡す** (H-03)。
 */
export interface ResolvedCredential {
  /** `api-key` の safeStorage 復号値 (infra/secrets)。 */
  readonly apiKeyValue?: string
  /** `oauth-token` の safeStorage 復号値。 */
  readonly oauthTokenValue?: string
  /** `aws-assume-role` の awsCredentialExport helper パス (R-02)。 */
  readonly awsCredentialExportPath?: string
  /**
   * `config-dir` の configDir を選択ランタイムの `RuntimePath` へ変換した値 (infra/runtime。H-02/H-101)。
   * **branded 型で持つ** — 素の `string` にすると HostPath.value (Windows 形式) の取り違えを tsc が検出できない
   * (PB-M-001 / data-model §4 / AD-004)。生成は `makeRuntimePath` 経由を強制する。
   */
  readonly configDirRuntimePath?: RuntimePath
}

/** `deriveLaunchEnv` の戻り (data-model §4)。`settings` は 2 キー限定射影 (C-001 / AD-040)。 */
export interface DerivedLaunchEnv {
  readonly env: Record<string, string>
  readonly settings?: HelperSettings
}
