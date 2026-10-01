import {
  isValidExtraEnv,
  isValidPassthroughVarNames,
  type ExtraEnvPredicates
} from '@domain/provider/forward-env'
import { isValidModelCatalog } from '@domain/provider/model-catalog'
import { scanExtraEnvForSecrets } from '@domain/provider/secret-scan'
import {
  isCredentialSource,
  type CredentialRef,
  type ModelCatalogRef,
  type ProviderProfile
} from '@domain/provider/types'
import { isValidDistroName, uncNamespace } from '@domain/runtime/namespace'
import { makeHostPath, makeWslUncPath } from '@domain/runtime/path-types'
import {
  hasControlCharacter,
  MAX_DISPLAY_NAME_LENGTH,
  MAX_ID_LENGTH,
  MAX_PATH_VALUE_LENGTH
} from '@domain/validation'

/**
 * `ProviderProfile` の永続化レコード検証 (BE-004 / contracts C-1)。folder-record.ts と同じ構え。
 *
 * **`electron` を import しない** (userDataDir は composition root が引数で渡す。AD-023 §8)。
 * **秘密の実体を持たない** (Principle V / FR-004) — `api-key` / `oauth-token` は `safeStorage` 参照値のみ、
 * `extraEnv` は**値スキャンで秘密らしい値を拒否**する (H-09)。キー名 allow-list + 値検証を別に行う。
 */

const RECORD_KEYS = [
  'id',
  'displayName',
  'backend',
  'configDir',
  'credential',
  'models',
  'extraEnv'
] as const

const BACKENDS = ['anthropic', 'bedrock', 'vertex', 'foundry'] as const

/** X-3 の provider ストアのスキーマ版。 */
export const SCHEMA_VERSION = 1

export type ProviderRecordIssue = 'invalid-record' | 'invalid-path' | 'secret-in-extraenv'

export type ProviderRecordResult =
  | { readonly ok: true; readonly profile: ProviderProfile }
  | { readonly ok: false; readonly reason: ProviderRecordIssue }

function invalid(reason: ProviderRecordIssue): ProviderRecordResult {
  return { ok: false, reason }
}

function isNonEmptyString(v: unknown, max: number): v is string {
  return typeof v === 'string' && v.length > 0 && v.length <= max && !hasControlCharacter(v)
}

/** `configDir` (`{namespace, value}`) を branded path へ復元する。namespace で HostPath / WslUncPath を分ける (H-101)。 */
function toConfigDir(value: unknown): ProviderProfile['configDir'] | 'invalid' | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'object' || value === null) return 'invalid'
  const p = value as Record<string, unknown>
  if (typeof p.namespace !== 'string' || typeof p.value !== 'string') return 'invalid'
  if (
    p.value.length === 0 ||
    p.value.length > MAX_PATH_VALUE_LENGTH ||
    hasControlCharacter(p.value)
  )
    return 'invalid'
  if (p.namespace === 'host') {
    const r = makeHostPath(p.value)
    return r.ok ? r.path : 'invalid'
  }
  // namespace **種別**を検証してから branded 化する (`as never` で型を迂回しない。PB-P-L03)。
  if (!p.namespace.startsWith('unc:') || !isValidDistroName(p.namespace.slice(4))) return 'invalid'
  const r = makeWslUncPath(uncNamespace(p.namespace.slice(4)), p.value)
  return r.ok ? r.path : 'invalid'
}

/** `CredentialRef` を復元する。各 source の必須フィールドを検証する (**秘密の実体は持たない**)。 */
function toCredentialRef(value: unknown): CredentialRef | null {
  if (typeof value !== 'object' || value === null) return null
  const c = value as Record<string, unknown>
  if (!isCredentialSource(c.source)) return null
  // 制御文字も拒否する (helper パス・参照キーに制御文字が正当に入ることはない。X-3 SEC-L-201 / X-4 FR-014)。
  const str = (v: unknown): v is string => isNonEmptyString(v, MAX_PATH_VALUE_LENGTH)
  switch (c.source) {
    case 'config-dir':
    case 'in-app-login':
      return { source: c.source }
    case 'api-key-helper':
      return str(c.helperPath) ? { source: 'api-key-helper', helperPath: c.helperPath } : null
    case 'aws-credential-export':
      return str(c.helperPath)
        ? { source: 'aws-credential-export', helperPath: c.helperPath }
        : null
    case 'aws-assume-role':
      return str(c.helperPath) ? { source: 'aws-assume-role', helperPath: c.helperPath } : null
    case 'api-key':
      return str(c.secretRefKey) ? { source: 'api-key', secretRefKey: c.secretRefKey } : null
    case 'oauth-token':
      return str(c.secretRefKey) ? { source: 'oauth-token', secretRefKey: c.secretRefKey } : null
    case 'aws-profile': {
      if (!str(c.profileName)) return null
      if (c.region !== undefined && !str(c.region)) return null
      return c.region === undefined
        ? { source: 'aws-profile', profileName: c.profileName }
        : { source: 'aws-profile', profileName: c.profileName, region: c.region as string }
    }
    case 'env-passthrough': {
      // varNames は実名 allowlist に限る (IPC と同じ述語。X-4 / AD-041 (e) 4)。
      if (!isValidPassthroughVarNames(c.varNames)) return null
      return { source: 'env-passthrough', varNames: [...c.varNames] }
    }
  }
}

/** モデルカタログは IPC と同じ domain 述語で検証する (文字種 / 対応 effort / 重複 / 件数。SC-010)。 */
function toModels(value: unknown): ModelCatalogRef | null {
  return isValidModelCatalog(value) ? { models: value.models } : null
}

/**
 * @param preds extraEnv の登録境界の述語。composition root が transport のキー集合から組んで注入する
 *   (infra/runtime を直接 import しない。IPC と同じ実体を受ける。pr-gate R1 platform-boundary M-302)。
 */
export function toProviderRecord(value: unknown, preds: ExtraEnvPredicates): ProviderRecordResult {
  if (typeof value !== 'object' || value === null) return invalid('invalid-record')
  const r = value as Record<string, unknown>

  for (const key of Object.keys(r)) {
    if (!(RECORD_KEYS as readonly string[]).includes(key)) return invalid('invalid-record')
  }

  if (!isNonEmptyString(r.id, MAX_ID_LENGTH)) return invalid('invalid-record')
  if (!isNonEmptyString(r.displayName, MAX_DISPLAY_NAME_LENGTH)) return invalid('invalid-record')
  if (typeof r.backend !== 'string' || !(BACKENDS as readonly string[]).includes(r.backend)) {
    return invalid('invalid-record')
  }

  const configDir = toConfigDir(r.configDir)
  if (configDir === 'invalid') return invalid('invalid-path')

  const credential = toCredentialRef(r.credential)
  if (credential === null) return invalid('invalid-record')

  const models = toModels(r.models)
  if (models === null) return invalid('invalid-record')

  let extraEnv: Record<string, string> | undefined
  if (r.extraEnv !== undefined) {
    // IPC と同じ述語 (名前規則・転送禁止キー・資格情報 denylist・値の制御文字・Windows パス。X-4 FR-013)。
    // X-4 以前のレコードでこれに反するものは退避して読み込まない (AD-042 Decision 4)。
    if (!isValidExtraEnv(r.extraEnv, preds)) {
      return invalid('invalid-record')
    }
    extraEnv = r.extraEnv
    // **秘密らしい値を持つ extraEnv は拒否する** (無害キー名の下の平文秘密を弾く。H-09 / Principle V)。
    if (scanExtraEnvForSecrets(extraEnv).length > 0) return invalid('secret-in-extraenv')
  }

  const profile: ProviderProfile = {
    id: r.id,
    displayName: r.displayName,
    backend: r.backend as ProviderProfile['backend'],
    credential,
    models,
    ...(configDir !== undefined ? { configDir } : {}),
    ...(extraEnv !== undefined ? { extraEnv } : {})
  }
  return { ok: true, profile }
}

/** 保存する形へ落とす。**allow-list のキーだけを出す** (秘密の実体は持たない)。 */
export function fromProviderRecord(profile: ProviderProfile): Record<string, unknown> {
  return {
    id: profile.id,
    displayName: profile.displayName,
    backend: profile.backend,
    ...(profile.configDir !== undefined
      ? { configDir: { namespace: profile.configDir.namespace, value: profile.configDir.value } }
      : {}),
    credential: profile.credential,
    // root を allow-list で組み直す (root の未知キーを disk へ書かない。read 側 toModels と対称。M-302)。
    models: { models: profile.models.models },
    ...(profile.extraEnv !== undefined ? { extraEnv: profile.extraEnv } : {})
  }
}
