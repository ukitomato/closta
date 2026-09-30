import type { CredentialSource, ModelCatalogRef } from './types'

/**
 * `ProviderProfile` の**表示用 DTO** (contracts C-1)。IPC 境界を越える値であり、**秘密の参照値
 * (`secretRefKey`) も helper パスも含まない** — renderer が要るのは識別と表示のためのメタだけ (Principle V)。
 */
export interface ProviderSummaryDTO {
  readonly id: string
  readonly displayName: string
  readonly backend: 'anthropic' | 'bedrock' | 'vertex' | 'foundry'
  readonly source: CredentialSource
  readonly modelCount: number
}

/** 起動選択用の Provider リスト (到達可能で絞り込み済み。除外は理由キー付き。FR-012 / L-05)。 */
export interface ReachableProvidersDTO {
  readonly reachable: readonly ProviderSummaryDTO[]
  readonly excluded: readonly {
    readonly provider: ProviderSummaryDTO
    readonly reason: 'unreachable' | 'blocked'
  }[]
}

/**
 * 登録/更新の入力 (renderer 由来。`api-key` / `oauth-token` は平文秘密を 1 回だけ渡して main が seal する。
 * contracts C-2)。**それ以外の経路に秘密を載せない。**
 */
export type CredentialDraft =
  | { readonly source: 'config-dir' }
  | { readonly source: 'in-app-login' }
  | { readonly source: 'api-key-helper'; readonly helperPath: string }
  | { readonly source: 'aws-credential-export'; readonly helperPath: string }
  | { readonly source: 'aws-assume-role'; readonly helperPath: string }
  | { readonly source: 'api-key'; readonly secret: string }
  | { readonly source: 'oauth-token'; readonly secret: string }
  | { readonly source: 'aws-profile'; readonly profileName: string; readonly region?: string }
  | { readonly source: 'env-passthrough'; readonly varNames: readonly string[] }

export interface ProviderDraft {
  readonly displayName: string
  readonly backend: 'anthropic' | 'bedrock' | 'vertex' | 'foundry'
  readonly credential: CredentialDraft
  readonly configDir?: { readonly namespace: string; readonly value: string }
  readonly models: ModelCatalogRef
  readonly extraEnv?: Record<string, string>
}

/**
 * 登録の結果 (失敗は理由キーのみ。payload/秘密を返さない。contracts C-3 / M-02)。
 * `store-newer-version`: providers.json が将来版で、上書きすると退避 (.bak) 済みの新版データを
 * アプリから復旧不能にするため mutation を拒否する (DB-P-M01)。
 */
export type RegisterProviderResult =
  | { readonly ok: true; readonly provider: ProviderSummaryDTO }
  | {
      readonly ok: false
      readonly reason:
        | 'safestorage-unavailable'
        | 'secret-in-extraenv'
        | 'invalid-path'
        | 'invalid-record'
        | 'store-newer-version'
    }

/**
 * 編集の入力 (US-4)。**認証方式 (`credential`) / `backend` は変えられない** — それは再登録の領分。
 * 編集できるのは表示名・モデルカタログ・追加 env のみ (`undefined` は変更しない)。
 */
export interface ProviderPatch {
  readonly displayName?: string
  readonly models?: ModelCatalogRef
  readonly extraEnv?: Record<string, string>
}

export type UpdateProviderResult =
  | { readonly ok: true; readonly provider: ProviderSummaryDTO }
  | {
      readonly ok: false
      readonly reason: 'not-found' | 'secret-in-extraenv' | 'invalid-record' | 'store-newer-version'
    }
