import type { WebFrameMain } from 'electron'

import { isValidDistroName, wslNamespace, type NamespaceId } from '@domain/runtime/namespace'
import {
  hasControlCharacter,
  isValidDisplayName,
  MAX_PATH_VALUE_LENGTH,
  MAX_SECRET_PLAINTEXT_BYTES,
  MAX_SESSION_OFFSET,
  isValidSessionId
} from '@domain/validation'
import type { SessionResumeRequest } from '@domain/session/resume'
import {
  isValidExtraEnv as isValidExtraEnvShared,
  isValidPassthroughVarNames,
  type ExtraEnvPredicates
} from '@domain/provider/forward-env'
import { isValidModelCatalog, isValidModelId } from '@domain/provider/model-catalog'
import { isPermissionAnswers } from '@domain/session/agent-session'
import { normalizeSessionName } from '@domain/session/live-settings'
import { isElicitationAction, isElicitationContent } from '@domain/session/elicitation'
import type { RuntimeDescriptor } from '@domain/runtime/descriptor'
import {
  isSafePermissionMode,
  isValidLaunchConfig,
  isValidPresetConfig,
  isValidPresetName,
  type PresetLaunchConfig,
  type SafePermissionMode,
  type SessionLaunchConfig
} from '@domain/session/launch-config'
import type { PathDTO } from '@domain/runtime/dto'
import { isValidSegment } from '@domain/runtime/path-api'
import { isNamespaceConsistent, type Location } from '@domain/workspace/folder'
import type { BrowseTargetDTO, LocationDTO } from '@domain/workspace/dto'

import { allowedOrigins } from './origins'

/**
 * 未信頼入力の検証 (contracts/ipc-capability.md / AD-023 のセキュリティ要件 5)。
 *
 * **送信元とペイロードの双方を検証する。** 片方だけでは要件を満たさない。
 *
 * 本ファイルの各関数は SC-018 が「検証表の**各行**について不正入力が拒否されること」を
 * 要求する対象である。3 つだけ列挙する形にしない — 列挙すると同じ構造の残りが拘束を外れる。
 */

/*
 * **述語と上限は `domain` の 1 箇所から取る。**
 *
 * 以前はここと `infra/settings/folder-record.ts` に同一実装があり、
 * 上限も各 2 箇所に散っていた。片方だけ変えると
 * **登録はできるが復元されないフォルダ**が生まれ、SC-013 が静かに崩れる。
 * (この形の `MAX_DIR_ENTRIES` は参照 0 件で死んでもいた。)
 */
export {
  MAX_DISPLAY_NAME_LENGTH,
  MAX_PATH_VALUE_LENGTH,
  MAX_SESSION_OFFSET
} from '@domain/validation'

/**
 * **送信元 (全メソッド共通)。**
 *
 * `event.senderFrame` が登録済み配信元 origin の main frame であること。
 * 不一致は応答せず破棄する。
 *
 * R-1 のウィンドウ構成では frame は 1 つだが、これを書かないと X-1 以降が
 * この土台に乗る。**環境で無効化する分岐を作らない** — 許可 origin の集合に
 * 開発ビルドの配信元を含める形で満たす (`origins.ts`)。
 */
export function isTrustedSender(frame: WebFrameMain | null): boolean {
  if (frame === null) return false
  // 親を持つ frame (iframe) は拒否する。単一 capability は main frame だけに公開する。
  if (frame.parent !== null) return false
  return allowedOrigins().includes(frame.origin)
}

/**
 * **すべてのパス値 (`PathDTO.value`)。**
 *
 * NUL と制御文字を含まないこと。**ランタイム名前空間の値はセパレータとして `/` のみを使い、
 * バックスラッシュを成分に含まないこと。** 長さ上限を超えないこと。
 *
 * POSIX 意味論ではバックスラッシュは通常の文字であり `.` / `..` の解決規則が発火しない。
 * 含んだまま UNC 形式へ変換すると値が字面で示す位置とは別の位置に解決される。
 */
export function isValidPathDTO(path: unknown): path is PathDTO {
  if (typeof path !== 'object' || path === null) return false
  const p = path as Record<string, unknown>
  if (typeof p.namespace !== 'string' || typeof p.value !== 'string') return false
  if (p.value.length === 0 || p.value.length > MAX_PATH_VALUE_LENGTH) return false
  if (hasControlCharacter(p.value)) return false

  if (p.namespace === 'host') return true
  if (p.namespace.startsWith('wsl:')) {
    // ランタイム名前空間の値はバックスラッシュを含まない。
    if (p.value.includes('\\')) return false
    if (!p.value.startsWith('/')) return false
    const distro = p.namespace.slice(4)
    return isValidDistroName(distro)
  }
  // `unc:` は `infra/fs` の内側に閉じる。境界を渡ってはならない。
  return false
}

/** **`location.distroName` (全経路)。** 列挙経路だけに置くと永続化ファイル由来の値が迂回する。 */
export function isValidLocationDTO(location: unknown): location is LocationDTO {
  if (typeof location !== 'object' || location === null) return false
  const l = location as Record<string, unknown>
  if (l.kind === 'windows') return true
  if (l.kind === 'wsl') {
    return typeof l.distroName === 'string' && isValidDistroName(l.distroName)
  }
  return false
}

export function toLocation(dto: LocationDTO): Location {
  return dto.kind === 'windows' ? { kind: 'windows' } : { kind: 'wsl', distroName: dto.distroName }
}

/** **`runtimeId`。** 既知の descriptor の識別子に完全一致すること。 */
export function findRuntime(
  runtimes: readonly RuntimeDescriptor[],
  runtimeId: unknown
): RuntimeDescriptor | null {
  if (typeof runtimeId !== 'string') return null
  return runtimes.find((r) => r.id === runtimeId) ?? null
}

/**
 * **`location` (`beginBrowse`)。**
 *
 * `kind === 'wsl'` のとき検出済み descriptor に完全一致すること。
 * **`kind === 'windows'` は常に拒否する。**
 *
 * 拒否の理由は**経路の一本化**である — ホスト側のフォルダ選択はネイティブダイアログに
 * 統一し、ホスト用のブラウズ実装を持たない。**ホストファイルシステムへの到達を
 * 塞ぐものではない** (所在 `wsl:<D>` のブラウズは Windows マウント配下を辿れ、
 * それは US-3 が越境として明示的に認める経路である)。
 */
export type BeginBrowseCheck =
  | { readonly ok: true; readonly namespace: NamespaceId }
  | { readonly ok: false; readonly reason: 'unsupported-location' | 'unknown-location' }

export function checkBeginBrowseLocation(
  runtimes: readonly RuntimeDescriptor[],
  location: unknown
): BeginBrowseCheck {
  if (!isValidLocationDTO(location)) return { ok: false, reason: 'unknown-location' }
  if (location.kind === 'windows') return { ok: false, reason: 'unsupported-location' }

  const namespace = wslNamespace(location.distroName)
  if (!runtimes.some((r) => r.id === namespace)) return { ok: false, reason: 'unknown-location' }
  return { ok: true, namespace }
}

/**
 * **`target` (`browseDirectory`)。**
 *
 * `of.namespace` が**トークンの名前空間識別子と完全一致**すること —
 * ディストロ名だけでなく**種別まで** (`unc:<D>` を `wsl:<D>` として受け付けない)。
 *
 * `name` は `/` とバックスラッシュ・NUL・制御文字を含まず、`.` / `..` **そのもの**でなく、
 * 長さ上限内であること (`.git` のような先頭ドットは許す)。
 */
export function isValidBrowseTarget(
  target: unknown,
  sessionNamespace: NamespaceId
): target is BrowseTargetDTO {
  if (typeof target !== 'object' || target === null) return false
  const t = target as Record<string, unknown>

  if (t.kind === 'root') return true

  if (t.kind === 'current' || t.kind === 'parent') {
    if (!isValidPathDTO(t.of)) return false
    return t.of.namespace === sessionNamespace
  }

  if (t.kind === 'child') {
    if (!isValidPathDTO(t.of)) return false
    if (t.of.namespace !== sessionNamespace) return false
    return typeof t.name === 'string' && isValidSegment(t.name)
  }

  return false
}

/** **`displayName`。** 長さ上限内であり制御文字を含まないこと (述語の正本は `@domain/validation`)。 */
export { isValidDisplayName }

/** **`folderId`。** 既知の登録エントリに一致すること。 */
export function isKnownFolderId(ids: readonly string[], folderId: unknown): folderId is string {
  return typeof folderId === 'string' && ids.includes(folderId)
}

/**
 * **`registerFolder(draft)`。**
 *
 * 所在 `windows` の `path` は **renderer の主張をそのまま受理する** (`## Assumptions`)。
 * ピッカー由来であることは要求しない。到達可能性の実在確認を登録済みエントリに限ることで、
 * 任意パスの存在を問い合わせる経路を作らない。
 *
 * `kind === 'wsl'` の `location` は検出済み descriptor に一致すること —
 * 存在しない所在で任意個のエントリを作れないようにする。
 */
export type DraftCheck =
  | { readonly ok: true }
  | {
      readonly ok: false
      readonly reason: 'invalid-path' | 'namespace-mismatch' | 'unknown-location'
    }

export function checkFolderDraft(
  runtimes: readonly RuntimeDescriptor[],
  draft: unknown
): DraftCheck {
  if (typeof draft !== 'object' || draft === null) return { ok: false, reason: 'invalid-path' }
  const d = draft as Record<string, unknown>

  if (!isValidLocationDTO(d.location)) return { ok: false, reason: 'unknown-location' }
  if (!isValidPathDTO(d.path)) return { ok: false, reason: 'invalid-path' }
  if (!isValidDisplayName(d.displayName)) return { ok: false, reason: 'invalid-path' }

  if (d.location.kind === 'wsl') {
    const namespace = wslNamespace(d.location.distroName)
    if (!runtimes.some((r) => r.id === namespace)) return { ok: false, reason: 'unknown-location' }
  }

  // **`path` と `location`。** `domain` の `isNamespaceConsistent()` を通ること
  // (ディストロ名まで一致)。**同じ関数を永続化側も呼ぶ。**
  if (!isNamespaceConsistent(toLocation(d.location), d.path)) {
    return { ok: false, reason: 'namespace-mismatch' }
  }

  return { ok: true }
}

/* ── Provider (X-3 / contracts C-1) ─────────────────────────────── */

const PROVIDER_BACKENDS = ['anthropic', 'bedrock', 'vertex', 'foundry']

/** 非空・長さ上限・**制御文字なし** (helper パス・profile 名。read 側 provider-record と同一。X-4 FR-014)。 */
function isStr(v: unknown): v is string {
  return (
    typeof v === 'string' &&
    v.length > 0 &&
    v.length <= MAX_PATH_VALUE_LENGTH &&
    !hasControlCharacter(v)
  )
}

/**
 * `extraEnv` を検証する。**IPC と `provider-record` が同じ domain 述語を呼ぶ** (SEC-M-001 の write/read 対称)。
 * X-4 で名前規則・転送禁止キー・資格情報 denylist・値の Windows パス形を加えた (FR-013 / AD-041 (e))。
 * 述語は composition root が注入する (infra/runtime を直接 import しない。pr-gate R1 platform-boundary M-302)。
 */
function isValidExtraEnv(value: unknown, preds: ExtraEnvPredicates): boolean {
  return isValidExtraEnvShared(value, preds)
}

/**
 * configDir の namespace **種別**を検証する (`host` か `unc:<validDistro>`)。PB-P-L03。
 * folder 側 `isValidPathDTO` と対称に、種別を見ずに通すと `WslUncPath` brand が `unc:` 以外の綴りを
 * 持つ runtime 値を生みうる (AD-004 の名前空間分離が境界の再 branding で退化する)。
 */
function isValidConfigDirNamespace(ns: string): boolean {
  if (ns === 'host') return true
  if (ns.startsWith('unc:')) return isValidDistroName(ns.slice(4))
  return false
}

/** `credential` draft の source 別フィールドを検証する (秘密は seal 前の平文で来る=api-key/oauth-token のみ)。 */
function isValidCredentialDraft(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false
  const c = value as Record<string, unknown>
  switch (c.source) {
    case 'config-dir':
    case 'in-app-login':
      return true
    case 'api-key-helper':
    case 'aws-credential-export':
    case 'aws-assume-role':
      return isStr(c.helperPath)
    case 'api-key':
    case 'oauth-token':
      // 平文秘密は seal で UTF-8 バイトに変換され膨らむため、**UTF-8 バイト長**で上限に絞る (SEC-M-201)。
      // `.length` (UTF-16) だと multibyte 秘密が seal 後 secretRefKey で上限超過し reload 消失する。
      // 制御文字も拒否する (起動時 composeLaunchEnv と同じ述語。NUL は spawn で原因不明の失敗になる。FR-014 / L-002)。
      return (
        typeof c.secret === 'string' &&
        c.secret.length > 0 &&
        !hasControlCharacter(c.secret) &&
        new TextEncoder().encode(c.secret).length <= MAX_SECRET_PLAINTEXT_BYTES
      )
    case 'aws-profile':
      return isStr(c.profileName) && (c.region === undefined || isStr(c.region))
    case 'env-passthrough':
      // varNames は実名 allowlist (read 側 provider-record と同じ述語。X-4 / AD-041 (e) 4 / SEC-M-101)。
      return isValidPassthroughVarNames(c.varNames)
    default:
      return false
  }
}

/**
 * **`registerProvider(draft)`。** 未信頼な draft の形を検証する (contracts C-1)。
 * 意味的検証 (extraEnv 秘密スキャン・safeStorage 可否) は service が返す理由キーに委ねる (H-09 / M-03)。
 */
export type ProviderDraftCheck =
  { readonly ok: true } | { readonly ok: false; readonly reason: 'invalid-record' | 'invalid-path' }

export function checkProviderDraft(draft: unknown, preds: ExtraEnvPredicates): ProviderDraftCheck {
  if (typeof draft !== 'object' || draft === null) return { ok: false, reason: 'invalid-record' }
  const d = draft as Record<string, unknown>

  if (!isValidDisplayName(d.displayName)) return { ok: false, reason: 'invalid-record' }
  if (typeof d.backend !== 'string' || !PROVIDER_BACKENDS.includes(d.backend)) {
    return { ok: false, reason: 'invalid-record' }
  }
  if (!isValidCredentialDraft(d.credential)) return { ok: false, reason: 'invalid-record' }

  if (!isValidModelCatalog(d.models)) return { ok: false, reason: 'invalid-record' }

  if (d.configDir !== undefined) {
    if (typeof d.configDir !== 'object' || d.configDir === null)
      return { ok: false, reason: 'invalid-path' }
    const cd = d.configDir as Record<string, unknown>
    if (typeof cd.namespace !== 'string' || typeof cd.value !== 'string')
      return { ok: false, reason: 'invalid-path' }
    // namespace **種別**を検証する (host か unc:<validDistro>)。種別を見ないと brand が退化する (PB-P-L03)。
    if (!isValidConfigDirNamespace(cd.namespace)) return { ok: false, reason: 'invalid-path' }
    if (
      cd.value.length === 0 ||
      cd.value.length > MAX_PATH_VALUE_LENGTH ||
      hasControlCharacter(cd.value)
    ) {
      return { ok: false, reason: 'invalid-path' }
    }
  }

  if (d.extraEnv !== undefined && !isValidExtraEnv(d.extraEnv, preds)) {
    return { ok: false, reason: 'invalid-record' }
  }

  return { ok: true }
}

/** **`updateProvider(id, patch)`。** 未信頼 patch の形を検証する (表示名/モデル/extraEnv のみ)。 */
export function checkProviderPatch(patch: unknown, preds: ExtraEnvPredicates): boolean {
  if (typeof patch !== 'object' || patch === null) return false
  const p = patch as Record<string, unknown>
  if (p.displayName !== undefined && !isValidDisplayName(p.displayName)) return false
  if (p.models !== undefined && !isValidModelCatalog(p.models)) return false
  if (p.extraEnv !== undefined && !isValidExtraEnv(p.extraEnv, preds)) return false
  return true
}

/* ── セッション一覧 (R-2 / BE-028) ─────────────────────────────── */

/**
 * **`fetchMoreSessions(targetKey, offset)`。**
 *
 * `targetKey` は main が発行した**不透明な値**である。
 * **既知の集合との完全一致でのみ照合し、パスとして解釈しない** (data-model §1)。
 * R-1 の `isKnownFolderId` と同じ扱いにしてある — 判定を 2 通り持たない。
 */
export function isKnownTargetKey(keys: readonly string[], targetKey: unknown): targetKey is string {
  return typeof targetKey === 'string' && keys.includes(targetKey)
}

/**
 * `offset` の検査。**非負の安全な整数であり、実名で定めた上限内**であること
 * (contracts/ipc-session-list.md の検証表)。
 *
 * **SDK に渡す前に検査する。** 上限が無いと、renderer から巨大な値を渡して
 * SDK 側の走査を無駄に走らせられる。
 */
export function isValidSessionOffset(offset: unknown): offset is number {
  return typeof offset === 'number' && Number.isSafeInteger(offset) && offset >= 0
    ? offset <= MAX_SESSION_OFFSET
    : false
}

/* ── セッション起動 + 制御 (X-1 / contracts C-1) ─────────────────── */

/**
 * **`respondPermission` の `outcome`。** `allow` / `deny` に完全一致すること。
 *
 * **`as` キャストで受けない** — 明示述語で enum を検証する (H-04 / SC-004 / SC-007)。
 * データ経路 (port) からは発行できず、この control-plane invoke だけが決定を運ぶ。
 */
export function isPermissionOutcome(value: unknown): value is 'allow' | 'deny' {
  return value === 'allow' || value === 'deny'
}

/**
 * **`respondPermission` の `scope`。** `once` / `capability` に完全一致すること。
 *
 * enum 形状の検証は境界のここで済ませる (`as` を使わせない)。**`once` 要求に `capability` 決定を
 * 受理しない** (H-04) の scope 上限強制は、要求 scope を保持する agents が `boundDecisionScope`
 * (`@domain/session/agent-session`) で行う — main は本文経路 (port) を持たず要求 scope を知らないため。
 */
export function isPermissionScope(value: unknown): value is 'once' | 'capability' {
  return value === 'once' || value === 'capability'
}

/**
 * **`respondPermission` の `answers`** (O-10 / AD-052。省略可)。形の規則は domain の `isPermissionAnswers`
 * (renderer の送る前の確かめ・agents の decode と同じ関数。main に別の規則を書かない。U-9)。
 */
export function isValidPermissionAnswers(value: unknown): value is readonly string[] {
  return isPermissionAnswers(value)
}

/**
 * **`respondElicitation` の `action`** (O-10 / AD-053)。形の規則は domain の `isElicitationAction`
 * (renderer の送る前の確かめ・agents の decode と同じ関数。main に別の規則を書かない。U-9)。
 */
export function isValidElicitationAction(value: unknown): value is 'accept' | 'decline' | 'cancel' {
  return isElicitationAction(value)
}

/**
 * **`respondElicitation` の `content`** (`accept` のときだけ読む。省略可。0〜32 キー)。形の規則は domain の
 * `isElicitationContent`。
 */
export function isValidElicitationContent(
  value: unknown
): value is Readonly<Record<string, string | number | boolean>> {
  return isElicitationContent(value)
}

/**
 * **`setSessionPermissionMode(sessionId, mode)`** (023 / contracts C-1)。引数はちょうど 2 つで、
 * `sessionId` は UUID・`mode` は安全 3 値。外れたら `invalid-value` (service を呼ばない)。
 */
export function checkSetPermissionModeArgs(
  args: readonly unknown[]
): args is readonly [string, SafePermissionMode] {
  return args.length === 2 && isValidSessionId(args[0]) && isSafePermissionMode(args[1])
}

/**
 * **`setSessionModel(sessionId, modelId)`** (023 / contracts C-2)。引数はちょうど 2 つで、
 * `sessionId` は UUID・`modelId` は文字種の検証 (`isValidModelId`)。カタログとの照合は service が行う。
 */
export function checkSetModelArgs(args: readonly unknown[]): args is readonly [string, string] {
  return args.length === 2 && isValidSessionId(args[0]) && isValidModelId(args[1])
}

/**
 * **`listSessionModels(sessionId)`** (025 / contracts C-7)。引数はちょうど 1 つで、`sessionId` は UUID。
 * 外れたら service を呼ばず `unknown-session`。
 */
export function checkListModelsArgs(args: readonly unknown[]): args is readonly [string] {
  return args.length === 1 && isValidSessionId(args[0])
}

/**
 * **`renameSession(sessionId, name)`** (023 / contracts C-3)。引数はちょうど 2 つで、`sessionId` は UUID・
 * `name` は名前の規則 (`normalizeSessionName`) を通ること。通れば trim した値を返す (service には trim 済みを渡す)。
 * 外れたら `null`。名前をログに出さない。
 */
export function checkRenameArgs(args: readonly unknown[]): readonly [string, string] | null {
  if (args.length !== 2 || !isValidSessionId(args[0])) return null
  const name = normalizeSessionName(args[1])
  return name === null ? null : [args[0], name]
}

/* ── 起動設定 / プリセット (X-4 / FR-005 / FR-009) ─────────────────── */

/**
 * **`launchSession(config)`。** 起動設定の形 (10 キー・安全 3 値・文字種・上限の範囲・名前の規則) を検証する。
 * 意味 (登録済み・到達可能・カタログ・対応 effort) は main の起動ゲートが facts で再評価する (FR-006)。
 */
export function checkLaunchConfig(value: unknown): value is SessionLaunchConfig {
  return isValidLaunchConfig(value)
}

/* ── セッションの再開 (X-9 / data-model §2.1) ─────────────────── */

function hasOnlyKeys(value: object, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key))
}

/**
 * **`resumeSession(request, origin)` の要求の形。** キーの許可リストは厳密 (余分なキーで拒否)。
 * 外れたら呼び出し側が `{ status: 'rejected', reasonKey: 'invalid-config' }` を返す。
 */
export function checkResumeRequest(
  value: unknown,
  knownTargetKeys: readonly string[]
): value is SessionResumeRequest {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  if (!hasOnlyKeys(value, ['source', 'config'])) return false
  const { source, config } = value as { source?: unknown; config?: unknown }
  if (!checkLaunchConfig(config)) return false
  // 再開は名前を渡さない (024 FR-012 / AD-064 Decision 5)。
  if (config.sessionName !== null) return false
  if (typeof source !== 'object' || source === null || Array.isArray(source)) return false
  const record = source as Record<string, unknown>
  if (record.kind === 'live') {
    return hasOnlyKeys(source, ['kind', 'sessionId']) && isValidSessionId(record.sessionId)
  }
  if (record.kind === 'past') {
    return (
      hasOnlyKeys(source, ['kind', 'targetKey', 'conversationId']) &&
      isKnownTargetKey(knownTargetKeys, record.targetKey) &&
      isValidSessionId(record.conversationId)
    )
  }
  return false
}

/** **`resolvePastResume(targetKey, conversationId)` の引数。** 外れたら `source-unknown`。 */
export function checkPastResumeQuery(
  targetKey: unknown,
  conversationId: unknown,
  knownTargetKeys: readonly string[]
): { readonly ok: true } | { readonly ok: false; readonly reason: 'source-unknown' } {
  return isKnownTargetKey(knownTargetKeys, targetKey) && isValidSessionId(conversationId)
    ? { ok: true }
    : { ok: false, reason: 'source-unknown' }
}

/**
 * **`savePreset(name, config)`。** 名前は表示名と同じ規則 (正規化後)、config は名前を除いた 9 キーの述語
 * (`isValidPresetConfig`。preset-record の read 側と同じ。`sessionName` のキーを持つ値は拒否する)。
 */
export function checkPreset(name: unknown, config: unknown): config is PresetLaunchConfig {
  return isValidPresetName(name) && isValidPresetConfig(config)
}
