import { isEffortLevel, isValidModelId } from '@domain/provider/model-catalog'
import type { EffortLevel } from '@domain/provider/types'
import { hasControlCharacter, isValidDisplayName, MAX_ID_LENGTH } from '@domain/validation'

import { normalizeSessionName } from './live-settings'

/**
 * X-4 起動設定の型と共有述語 (FR-001 / FR-004 / FR-009 / [AD-041](../../../docs/decisions/0041-x4-launch-config-on-x1-launch-gate.md))。
 * **I/O を持たない。**
 *
 * **IPC (`checkLaunchConfig` / `checkPreset`) / 永続層 (`preset-record`) / agents の launch decoder が同じ述語を呼ぶ**
 * (write/read 対称。X-3 SEC-M-001)。
 */

/* ── 権限モード (安全 3 値。AD-041 (a)) ───────────────────────────── */

/**
 * 起動で選べる権限モード。AD-020 の危険度表で「安全」の 3 値。
 * **昇格 3 値 (`acceptEdits` / `auto` / `bypassPermissions`) を型で持たない** (正の構成)。capability 連動は I-3。
 */
export type SafePermissionMode = 'default' | 'plan' | 'dontAsk'

export const SAFE_PERMISSION_MODES = [
  'default',
  'plan',
  'dontAsk'
] as const satisfies readonly SafePermissionMode[]

export function isSafePermissionMode(value: unknown): value is SafePermissionMode {
  return typeof value === 'string' && (SAFE_PERMISSION_MODES as readonly string[]).includes(value)
}

/**
 * query() に渡す直前の**実行時 assert** (一次ゲート `buildQueryOptions` が呼ぶ)。
 * 境界 (main→agents の structured-clone) を越えると型保証が消えるため、値で再確立する。安全 3 値外は throw。
 */
export function assertSafePermissionMode(value: unknown): SafePermissionMode {
  if (!isSafePermissionMode(value)) {
    throw new Error(
      'assertSafePermissionMode: 権限モードが安全 3 値 {default, plan, dontAsk} の外です (AD-041)'
    )
  }
  return value
}

/* ── 起動設定 ──────────────────────────────────────────────────── */

/**
 * 検証済みの起動設定 (10 キー。glossary SessionLaunchConfig。X-4 の前 6 軸 + 024 の 4 キー)。
 * folder / runtime は**必須**。provider / model / effort は `null` = 既定 (文字列 `'default'` を id に使わない)。
 * 024 の 4 キーも必須 (上限と名前の `null` は「上限なし」「名前なし」。追加ディレクトリの空配列は「なし」)。
 */
export interface SessionLaunchConfig {
  // 前 6 軸 (変わらない)
  readonly folderId: string
  readonly runtimeId: string
  readonly providerId: string | null
  readonly modelId: string | null
  readonly effort: EffortLevel | null
  readonly permissionMode: SafePermissionMode
  // 024 (AD-064 Decision 3)
  readonly additionalDirectoryIds: readonly string[]
  readonly maxTurns: number | null
  readonly maxBudgetUsd: number | null
  readonly sessionName: string | null
}

/** プリセットが持つ形。名前を含まない (024 FR-010)。 */
export type PresetLaunchConfig = Omit<SessionLaunchConfig, 'sessionName'>

/**
 * キー集合の allowlist。**集合を変えるには ADR が要る (AD-064)。**
 * `LAUNCH_CONFIG_KEYS` は 10 キー、`PRESET_CONFIG_KEYS` は `sessionName` を除く 9 キー、
 * `PRESET_CONFIG_KEYS_V1` は版 1 の `presets.json` の前 6 軸。
 */
export const LAUNCH_CONFIG_KEYS = [
  'folderId',
  'runtimeId',
  'providerId',
  'modelId',
  'effort',
  'permissionMode',
  'additionalDirectoryIds',
  'maxTurns',
  'maxBudgetUsd',
  'sessionName'
] as const

export const PRESET_CONFIG_KEYS = [
  'folderId',
  'runtimeId',
  'providerId',
  'modelId',
  'effort',
  'permissionMode',
  'additionalDirectoryIds',
  'maxTurns',
  'maxBudgetUsd'
] as const

export const PRESET_CONFIG_KEYS_V1 = [
  'folderId',
  'runtimeId',
  'providerId',
  'modelId',
  'effort',
  'permissionMode'
] as const

/** 追加ディレクトリの件数の上限 (spec U-2)。 */
export const MAX_ADDITIONAL_DIRECTORIES = 10
/** ターン数の上限の範囲 1〜1000 (spec U-4)。 */
export const MAX_TURNS_LIMIT = 1000
/** 費用の上限の範囲 0.01〜1000 USD・小数 2 桁まで (spec U-4)。 */
export const MIN_BUDGET_USD = 0.01
export const MAX_BUDGET_USD_LIMIT = 1000

/** 新しい 3 軸の既定。版 1 のプリセットの読み替えとテストの既定に使う。 */
export const DEFAULT_EXTRA_AXES: Pick<
  PresetLaunchConfig,
  'additionalDirectoryIds' | 'maxTurns' | 'maxBudgetUsd'
> = { additionalDirectoryIds: [], maxTurns: null, maxBudgetUsd: null }

function isIdString(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= MAX_ID_LENGTH &&
    !hasControlCharacter(value)
  )
}

/** ターン数の上限。`null` は上限なし。1〜1000 の整数。 */
export function isValidMaxTurns(value: unknown): value is number | null {
  if (value === null) return true
  return (
    typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= MAX_TURNS_LIMIT
  )
}

/** 費用の上限 (USD)。`null` は上限なし。0.01〜1000・小数 2 桁まで。 */
export function isValidMaxBudgetUsd(value: unknown): value is number | null {
  if (value === null) return true
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= MIN_BUDGET_USD &&
    value <= MAX_BUDGET_USD_LIMIT &&
    Number(value.toFixed(2)) === value
  )
}

/** 起動のときの名前。`null` は名前なし。023 の `normalizeSessionName` を通って変わらない値に限る。 */
export function isValidLaunchSessionName(value: unknown): value is string | null {
  if (value === null) return true
  return typeof value === 'string' && normalizeSessionName(value) === value
}

/** 追加ディレクトリの folder id の列。0〜10 件・重複なし・作業フォルダ自身を含まない。 */
export function isValidAdditionalDirectoryIds(
  value: unknown,
  folderId: string
): value is readonly string[] {
  if (!Array.isArray(value)) return false
  if (value.length > MAX_ADDITIONAL_DIRECTORIES) return false
  if (!value.every(isIdString)) return false
  if (new Set(value).size !== value.length) return false
  return !value.includes(folderId)
}

function hasOnlyKeys(c: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(c).every((k) => keys.includes(k))
}

/** 前 6 軸の形 (版 1 のレコードと共有)。 */
function hasValidBaseAxes(c: Record<string, unknown>): boolean {
  if (!isIdString(c.folderId) || !isIdString(c.runtimeId)) return false
  if (c.providerId !== null && !isIdString(c.providerId)) return false
  if (c.modelId !== null && !isValidModelId(c.modelId)) return false
  if (c.effort !== null && !isEffortLevel(c.effort)) return false
  return isSafePermissionMode(c.permissionMode)
}

/** 9 キーの形 (`PRESET_CONFIG_KEYS` に当たる検査。`sessionName` を数えない)。 */
function hasValidPresetAxes(c: Record<string, unknown>): boolean {
  return (
    hasValidBaseAxes(c) &&
    isValidAdditionalDirectoryIds(c.additionalDirectoryIds, c.folderId as string) &&
    isValidMaxTurns(c.maxTurns) &&
    isValidMaxBudgetUsd(c.maxBudgetUsd)
  )
}

/** 版 1 の `presets.json` の config (前 6 軸だけ)。読み替えは `DEFAULT_EXTRA_AXES` で補う (AD-064 Decision 4)。 */
export function isValidPresetConfigV1(
  value: unknown
): value is Pick<SessionLaunchConfig, (typeof PRESET_CONFIG_KEYS_V1)[number]> {
  if (typeof value !== 'object' || value === null) return false
  const c = value as Record<string, unknown>
  return hasOnlyKeys(c, PRESET_CONFIG_KEYS_V1) && hasValidBaseAxes(c)
}

/** プリセットの config の**形** (9 キー。`sessionName` のキーを持つ値は拒否)。 */
export function isValidPresetConfig(value: unknown): value is PresetLaunchConfig {
  if (typeof value !== 'object' || value === null) return false
  const c = value as Record<string, unknown>
  return hasOnlyKeys(c, PRESET_CONFIG_KEYS) && hasValidPresetAxes(c)
}

/**
 * 起動設定の**形**を検証する (キー allowlist + 各軸の値域)。
 * 意味の検証 (登録済みか・到達可能か・カタログに在るか) は `resolveLaunchAxes` が facts で行う。
 */
export function isValidLaunchConfig(value: unknown): value is SessionLaunchConfig {
  if (typeof value !== 'object' || value === null) return false
  const c = value as Record<string, unknown>
  return (
    hasOnlyKeys(c, LAUNCH_CONFIG_KEYS) &&
    hasValidPresetAxes(c) &&
    isValidLaunchSessionName(c.sessionName)
  )
}

/** 起動設定からプリセットの config を作る (`sessionName` を除いた新しい object。元を変えない)。 */
export function toPresetConfig(config: SessionLaunchConfig): PresetLaunchConfig {
  const { sessionName: _sessionName, ...rest } = config
  void _sessionName
  return { ...rest, additionalDirectoryIds: [...rest.additionalDirectoryIds] }
}

/* ── プリセット名 (FR-009) ──────────────────────────────────────── */

/** プリセット件数の上限 (IPC と永続層で共有)。 */
export const MAX_PRESETS = 100

/** 名前は表示名と同じ規則 (非空・長さ上限・制御文字なし。日本語可)。正規化後の値で判定する。 */
export function isValidPresetName(value: unknown): value is string {
  return typeof value === 'string' && isValidDisplayName(normalizePresetName(value))
}

/** 同名判定の正規化 (前後の空白を除き NFC に揃える)。保存する名前もこの形にする。 */
export function normalizePresetName(value: string): string {
  return value.trim().normalize('NFC')
}
