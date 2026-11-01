import {
  DEFAULT_EXTRA_AXES,
  isValidPresetConfig,
  isValidPresetConfigV1,
  isValidPresetName,
  normalizePresetName,
  type PresetLaunchConfig
} from '@domain/session/launch-config'
import type { Preset } from '@domain/session/preset'
import { hasControlCharacter, MAX_ID_LENGTH } from '@domain/validation'

/**
 * プリセットの永続化レコード検証 (X-4 BE-011 / FR-009 / FR-010)。`provider-record.ts` と同じ構え。
 *
 * **`electron` を import しない** (userDataDir は composition root が引数で渡す。AD-023 §8)。
 * **秘密の実体を持たない** (Principle V) — キーは allow-list (id / name / config / updatedAt) だけで、
 * config は Provider を **id 参照**で持つ。値は **IPC (`checkPreset`) と同じ述語** (`isValidPresetConfig` /
 * `isValidPresetName`) で検証する (write/read 対称。X-3 SEC-M-001)。昇格モードや不正 id を読み取りで拒否する。
 *
 * **版 2 (024 / AD-064 Decision 4)**: config は名前を除いた 9 キー。版 1 (前 6 軸) は読むだけで書かず、
 * 新しい 3 軸を既定 (`DEFAULT_EXTRA_AXES`) で補う。読み替えは store の内側に閉じる (AD-042 Decision 4)。
 */

const RECORD_KEYS = ['id', 'name', 'config', 'updatedAt'] as const

/**
 * プリセットストアのスキーマ版 (書く版)。版 2 = 追加ディレクトリと上限を持つ (024)。
 * 版 3 = 権限モードに `auto` を持てる (026 / AD-066。キーは版 2 と同じ。確認の印は持たせない)。
 * 旧版が `auto` の版 3 を読まないよう版を上げる (AD-042)。
 */
export const PRESET_SCHEMA_VERSION = 3

/** 読める版。版 1 は新しい軸を既定で補って読み、書き戻さない。版 2 と 3 は同じ述語で読む。 */
export const SUPPORTED_PRESET_SCHEMA_VERSIONS = [1, 2, 3] as const

export type PresetRecordResult =
  | { readonly ok: true; readonly preset: Preset }
  | { readonly ok: false; readonly reason: 'invalid-record' }

const invalid: PresetRecordResult = { ok: false, reason: 'invalid-record' }

/**
 * @param version ファイルの `schemaVersion` (`SUPPORTED_PRESET_SCHEMA_VERSIONS` のどれか)。版 1 は前 6 軸の検証と補完、
 *   版 2 は 9 キーの検証。
 */
export function toPresetRecord(value: unknown, version: number): PresetRecordResult {
  if (typeof value !== 'object' || value === null) return invalid
  const r = value as Record<string, unknown>
  if (Object.keys(r).some((k) => !(RECORD_KEYS as readonly string[]).includes(k))) return invalid

  if (
    typeof r.id !== 'string' ||
    r.id.length === 0 ||
    r.id.length > MAX_ID_LENGTH ||
    hasControlCharacter(r.id)
  ) {
    return invalid
  }
  if (!isValidPresetName(r.name)) return invalid
  let config: PresetLaunchConfig
  if (version === 1) {
    if (!isValidPresetConfigV1(r.config)) return invalid
    // allow-list のキーだけで組み直し、新しい 3 軸を既定で補う (未知キーを持ち込まない)。
    config = {
      folderId: r.config.folderId,
      runtimeId: r.config.runtimeId,
      providerId: r.config.providerId,
      modelId: r.config.modelId,
      effort: r.config.effort,
      permissionMode: r.config.permissionMode,
      ...DEFAULT_EXTRA_AXES,
      additionalDirectoryIds: []
    }
  } else if (version === 2 || version === 3) {
    if (!isValidPresetConfig(r.config)) return invalid
    const c = r.config
    config = {
      folderId: c.folderId,
      runtimeId: c.runtimeId,
      providerId: c.providerId,
      modelId: c.modelId,
      effort: c.effort,
      permissionMode: c.permissionMode,
      additionalDirectoryIds: [...c.additionalDirectoryIds],
      maxTurns: c.maxTurns,
      maxBudgetUsd: c.maxBudgetUsd
    }
  } else {
    return invalid
  }
  if (typeof r.updatedAt !== 'number' || !Number.isFinite(r.updatedAt) || r.updatedAt < 0) {
    return invalid
  }

  return {
    ok: true,
    preset: {
      id: r.id,
      name: normalizePresetName(r.name),
      config,
      updatedAt: r.updatedAt
    }
  }
}

/** 保存する形へ落とす。**allow-list のキーだけを出す** (秘密の実体は持たない)。 */
export function fromPresetRecord(preset: Preset): Record<string, unknown> {
  return {
    id: preset.id,
    name: preset.name,
    config: {
      folderId: preset.config.folderId,
      runtimeId: preset.config.runtimeId,
      providerId: preset.config.providerId,
      modelId: preset.config.modelId,
      effort: preset.config.effort,
      permissionMode: preset.config.permissionMode,
      additionalDirectoryIds: [...preset.config.additionalDirectoryIds],
      maxTurns: preset.config.maxTurns,
      maxBudgetUsd: preset.config.maxBudgetUsd
    },
    updatedAt: preset.updatedAt
  }
}
