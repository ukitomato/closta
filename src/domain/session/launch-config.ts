import { isEffortLevel, isValidModelId } from '@domain/provider/model-catalog'
import type { EffortLevel } from '@domain/provider/types'
import { hasControlCharacter, isValidDisplayName, MAX_ID_LENGTH } from '@domain/validation'

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
 * 検証済みの起動設定 (6 軸。glossary SessionLaunchConfig の前 6 軸)。
 * folder / runtime は**必須**。provider / model / effort は `null` = 既定 (文字列 `'default'` を id に使わない)。
 */
export interface SessionLaunchConfig {
  readonly folderId: string
  readonly runtimeId: string
  readonly providerId: string | null
  readonly modelId: string | null
  readonly effort: EffortLevel | null
  readonly permissionMode: SafePermissionMode
}

const LAUNCH_CONFIG_KEYS = [
  'folderId',
  'runtimeId',
  'providerId',
  'modelId',
  'effort',
  'permissionMode'
] as const

function isIdString(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= MAX_ID_LENGTH &&
    !hasControlCharacter(value)
  )
}

/**
 * 起動設定の**形**を検証する (キー allowlist + 各軸の値域)。
 * 意味の検証 (登録済みか・到達可能か・カタログに在るか) は `resolveLaunchAxes` が facts で行う。
 */
export function isValidLaunchConfig(value: unknown): value is SessionLaunchConfig {
  if (typeof value !== 'object' || value === null) return false
  const c = value as Record<string, unknown>
  if (Object.keys(c).some((k) => !(LAUNCH_CONFIG_KEYS as readonly string[]).includes(k))) {
    return false
  }
  if (!isIdString(c.folderId) || !isIdString(c.runtimeId)) return false
  if (c.providerId !== null && !isIdString(c.providerId)) return false
  if (c.modelId !== null && !isValidModelId(c.modelId)) return false
  if (c.effort !== null && !isEffortLevel(c.effort)) return false
  return isSafePermissionMode(c.permissionMode)
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
