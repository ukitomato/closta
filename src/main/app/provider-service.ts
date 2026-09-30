import { deriveLaunchEnv } from '@domain/provider/derive-env'
import { normalizeDetectedCandidates } from '@domain/provider/detect'
import type {
  CredentialDraft,
  ProviderDraft,
  ProviderPatch,
  ProviderSummaryDTO,
  ReachableProvidersDTO,
  RegisterProviderResult,
  UpdateProviderResult
} from '@domain/provider/dto'
import { assessReachability, splitByReachability } from '@domain/provider/reachability'
import { scanExtraEnvForSecrets } from '@domain/provider/secret-scan'
import type {
  CredentialRef,
  DerivedLaunchEnv,
  DetectedCandidate,
  ProviderProfile
} from '@domain/provider/types'
import type { RuntimeDescriptor } from '@domain/runtime/descriptor'
import { isValidDistroName, uncNamespace } from '@domain/runtime/namespace'
import { makeHostPath, makeWslUncPath, type RuntimePath } from '@domain/runtime/path-types'

import type { ProviderStore } from '../infra/settings/provider-store'
import type { SecretStore } from '../infra/secrets/safe-storage'

/**
 * Provider の取り回し (BE-005 / BE-014 / BE-030)。**状態を持つ調停** — 読み込んだ profiles を保持し、
 * I/O (store / secrets / 検出 / env) は**インタフェース経由で注入**して自分で取りに行かない
 * (AD-023 §5/§7 の `services ✗→ I/O`。`.dependency-cruiser.js` の `services-not-to-io` に実名追加。A-1)。
 *
 * **秘密の実体を持たない** (Principle V) — `api-key` / `oauth-token` の平文は登録時に `secrets.seal` で
 * `safeStorage` 参照値に変え、profile には参照値のみを持つ。safeStorage 利用不可なら登録を拒否する (M-03)。
 */

export interface ProviderServiceDeps {
  readonly store: ProviderStore
  readonly secrets: SecretStore
  /** 検出 I/O の結果 (composition が home/aws config/env を解決して渡す。H-04)。 */
  readonly detect: () => Promise<readonly DetectedCandidate[]>
  readonly runtimes: () => readonly RuntimeDescriptor[]
  /** `config-dir` の configDir を選択ランタイムの `RuntimePath` へ変換 (composition。H-02/H-101/PB-M-001)。 */
  readonly resolveConfigDirRuntimePath: (
    configDir: ProviderProfile['configDir'],
    runtime: RuntimeDescriptor
  ) => RuntimePath | null
  /** infra `buildLaunchEnv` の curated base (composition が parentEnv から組む)。 */
  readonly curatedBaseEnv: () => Record<string, string>
  /** X-1 `LAUNCH_ENV_DENY_PATTERN` の述語 (SSoT を注入。複製しない。FR-009)。 */
  readonly isDeniedEnvKey: (key: string) => boolean
  readonly newId: () => string
}

function toSummary(p: ProviderProfile): ProviderSummaryDTO {
  return {
    id: p.id,
    displayName: p.displayName,
    backend: p.backend,
    source: p.credential.source,
    modelCount: p.models.models.length
  }
}

function toConfigDir(
  raw: { namespace: string; value: string } | undefined
): ProviderProfile['configDir'] | 'invalid' | undefined {
  if (raw === undefined) return undefined
  if (raw.namespace === 'host') {
    const r = makeHostPath(raw.value)
    return r.ok ? r.path : 'invalid'
  }
  // namespace 種別を検証してから branded 化する (`as never` で型を迂回しない。PB-P-L03)。
  if (!raw.namespace.startsWith('unc:') || !isValidDistroName(raw.namespace.slice(4)))
    return 'invalid'
  const r = makeWslUncPath(uncNamespace(raw.namespace.slice(4)), raw.value)
  return r.ok ? r.path : 'invalid'
}

export interface ProviderService {
  list(): Promise<readonly ProviderSummaryDTO[]>
  detect(): Promise<readonly DetectedCandidate[]>
  register(draft: ProviderDraft): Promise<RegisterProviderResult>
  update(id: string, patch: ProviderPatch): Promise<UpdateProviderResult>
  remove(id: string): Promise<{ readonly ok: boolean }>
  listReachable(runtimeId: string): Promise<ReachableProvidersDTO>
  /** 起動 env を導出する (X-4 が起動時に消費。FR-008)。到達不可/未知は null。 */
  deriveEnv(providerId: string, runtimeId: string): Promise<DerivedLaunchEnv | null>
}

export function createProviderService(deps: ProviderServiceDeps): ProviderService {
  const {
    store,
    secrets,
    detect,
    runtimes,
    resolveConfigDirRuntimePath,
    curatedBaseEnv,
    isDeniedEnvKey,
    newId
  } = deps

  let profiles: readonly ProviderProfile[] = []
  let loaded = false
  /** load 時の退避メタ。**破棄しない** — version-skew では mutation を拒否して上書きを防ぐ (DB-P-M01)。 */
  let storeNewerVersion = false

  async function ensureLoaded(): Promise<void> {
    if (loaded) return
    const result = await store.load()
    profiles = result.profiles
    // providers.json が将来版だった場合、profiles は空になっている。ここで save すると新版データを
    // (退避済みとはいえ) アプリから復旧不能に上書きするため、以降の mutation を止める。
    storeNewerVersion = result.reasonKeys.includes('schema-version-unknown')
    loaded = true
  }

  /** draft の credential を CredentialRef へ (`api-key`/`oauth-token` は seal)。unavailable は null。 */
  function toCredentialRef(draft: CredentialDraft): CredentialRef | 'safestorage-unavailable' {
    switch (draft.source) {
      case 'api-key':
      case 'oauth-token': {
        const sealed = secrets.seal(draft.secret)
        if (sealed === null) return 'safestorage-unavailable'
        return { source: draft.source, secretRefKey: sealed }
      }
      case 'aws-profile':
        return draft.region === undefined
          ? { source: 'aws-profile', profileName: draft.profileName }
          : { source: 'aws-profile', profileName: draft.profileName, region: draft.region }
      case 'env-passthrough':
        return { source: 'env-passthrough', varNames: [...draft.varNames] }
      case 'api-key-helper':
      case 'aws-credential-export':
      case 'aws-assume-role':
        return { source: draft.source, helperPath: draft.helperPath }
      case 'config-dir':
      case 'in-app-login':
        return { source: draft.source }
    }
  }

  return {
    async list() {
      await ensureLoaded()
      return profiles.map(toSummary)
    },

    async detect() {
      await ensureLoaded()
      const raw = await detect()
      return normalizeDetectedCandidates(raw, profiles)
    },

    async register(draft) {
      await ensureLoaded()
      if (storeNewerVersion) return { ok: false, reason: 'store-newer-version' }

      if (typeof draft.displayName !== 'string' || draft.displayName.length === 0) {
        return { ok: false, reason: 'invalid-record' }
      }
      // **extraEnv の値スキャンで秘密らしい値を拒否** (H-09 / Principle V)。
      if (scanExtraEnvForSecrets(draft.extraEnv).length > 0) {
        return { ok: false, reason: 'secret-in-extraenv' }
      }

      const configDir = toConfigDir(draft.configDir)
      if (configDir === 'invalid') return { ok: false, reason: 'invalid-path' }

      const credential = toCredentialRef(draft.credential)
      if (credential === 'safestorage-unavailable') {
        return { ok: false, reason: 'safestorage-unavailable' }
      }

      const profile: ProviderProfile = {
        id: newId(),
        displayName: draft.displayName,
        backend: draft.backend,
        credential,
        models: draft.models,
        ...(configDir !== undefined ? { configDir } : {}),
        ...(draft.extraEnv !== undefined ? { extraEnv: draft.extraEnv } : {})
      }

      profiles = [...profiles, profile]
      await store.save(profiles)
      return { ok: true, provider: toSummary(profile) }
    },

    async update(id, patch) {
      await ensureLoaded()
      if (storeNewerVersion) return { ok: false, reason: 'store-newer-version' }
      const current = profiles.find((p) => p.id === id)
      if (current === undefined) return { ok: false, reason: 'not-found' }

      if (
        patch.displayName !== undefined &&
        (typeof patch.displayName !== 'string' || patch.displayName.length === 0)
      ) {
        return { ok: false, reason: 'invalid-record' }
      }
      // **編集後の extraEnv も値スキャンで秘密を拒否** (H-09)。
      if (patch.extraEnv !== undefined && scanExtraEnvForSecrets(patch.extraEnv).length > 0) {
        return { ok: false, reason: 'secret-in-extraenv' }
      }

      // 認証方式・backend・configDir は編集不可 (再登録の領分)。表示名/モデル/extraEnv のみ差し替える。
      const updated: ProviderProfile = {
        ...current,
        ...(patch.displayName !== undefined ? { displayName: patch.displayName } : {}),
        ...(patch.models !== undefined ? { models: patch.models } : {}),
        ...(patch.extraEnv !== undefined ? { extraEnv: patch.extraEnv } : {})
      }
      profiles = profiles.map((p) => (p.id === id ? updated : p))
      await store.save(profiles)
      return { ok: true, provider: toSummary(updated) }
    },

    async remove(id) {
      await ensureLoaded()
      if (storeNewerVersion) return { ok: false }
      const next = profiles.filter((p) => p.id !== id)
      if (next.length === profiles.length) return { ok: false }
      // 秘密の参照値は profile 内に閉じており、profile を落とせば参照も解放される (別ストア無し)。
      profiles = next
      await store.save(profiles)
      return { ok: true }
    },

    async listReachable(runtimeId) {
      await ensureLoaded()
      const runtime = runtimes().find((r) => r.id === runtimeId)
      if (runtime === undefined) return { reachable: [], excluded: [] }
      const split = splitByReachability(profiles, runtime)
      return {
        reachable: split.reachable.map(toSummary),
        excluded: split.excluded
          .filter((e) => e.reason !== 'reachable')
          .map((e) => ({
            provider: toSummary(e.profile),
            reason: e.reason as 'unreachable' | 'blocked'
          }))
      }
    },

    async deriveEnv(providerId, runtimeId) {
      await ensureLoaded()
      const profile = profiles.find((p) => p.id === providerId)
      const runtime = runtimes().find((r) => r.id === runtimeId)
      if (profile === undefined || runtime === undefined) return null

      // **到達不可な Provider へは env を導出しない** (contracts C-1 / interface doc「到達不可は null」。PB-H-002)。
      // listReachable が一次ゲートだが、deriveEnv 自身も到達可能性を強制して config-dir の沈黙フォールバックを塞ぐ
      // (到達不可で CLAUDE_CONFIG_DIR 欠落 → ランタイム既定 config-dir を掴む経路を断つ。SC-004 / charter Journey 2)。
      if (assessReachability(profile, runtime) !== 'reachable') return null

      // infra が解決した値を組み立てて純粋関数へ渡す (seam。H-03)。
      const cred = profile.credential
      const configDirRuntimePath =
        profile.configDir !== undefined
          ? resolveConfigDirRuntimePath(profile.configDir, runtime)
          : undefined
      // **config-dir 方式で configDir を持つのに RuntimePath へ変換できないなら fail-closed** (PB-P-M01)。
      // reachable でも変換不能なら CLAUDE_CONFIG_DIR を欠いた env になり、WSL 内 claude がランタイム既定の
      // config dir (別資格情報名前空間) を黙って掴む。到達可能性の一次ゲートとは別に、seam でも安全側へ倒す。
      if (
        (cred.source === 'config-dir' || cred.source === 'in-app-login') &&
        profile.configDir !== undefined &&
        configDirRuntimePath === null
      ) {
        return null
      }
      const resolved = {
        ...(cred.source === 'api-key' ? { apiKeyValue: secrets.open(cred.secretRefKey) } : {}),
        ...(cred.source === 'oauth-token'
          ? { oauthTokenValue: secrets.open(cred.secretRefKey) }
          : {}),
        ...(cred.source === 'aws-assume-role' ? { awsCredentialExportPath: cred.helperPath } : {}),
        ...(configDirRuntimePath !== null && configDirRuntimePath !== undefined
          ? { configDirRuntimePath }
          : {})
      }
      return deriveLaunchEnv({
        profile,
        resolved,
        curatedBase: curatedBaseEnv(),
        isDeniedEnvKey
      })
    }
  }
}
