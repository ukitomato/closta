import {
  isValidLaunchConfig,
  isValidPresetName,
  normalizePresetName
} from '@domain/session/launch-config'
import type { Preset } from '@domain/session/preset'
import { hasControlCharacter, MAX_ID_LENGTH } from '@domain/validation'

/**
 * プリセットの永続化レコード検証 (X-4 BE-011 / FR-009 / FR-010)。`provider-record.ts` と同じ構え。
 *
 * **`electron` を import しない** (userDataDir は composition root が引数で渡す。AD-023 §8)。
 * **秘密の実体を持たない** (Principle V) — キーは allow-list (id / name / config / updatedAt) だけで、
 * config は Provider を **id 参照**で持つ。値は **IPC (`checkPreset`) と同じ述語** (`isValidLaunchConfig` /
 * `isValidPresetName`) で検証する (write/read 対称。X-3 SEC-M-001)。昇格モードや不正 id を読み取りで拒否する。
 */

const RECORD_KEYS = ['id', 'name', 'config', 'updatedAt'] as const

/** X-4 のプリセットストアのスキーマ版。 */
export const PRESET_SCHEMA_VERSION = 1

export type PresetRecordResult =
  | { readonly ok: true; readonly preset: Preset }
  | { readonly ok: false; readonly reason: 'invalid-record' }

const invalid: PresetRecordResult = { ok: false, reason: 'invalid-record' }

export function toPresetRecord(value: unknown): PresetRecordResult {
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
  if (!isValidLaunchConfig(r.config)) return invalid
  if (typeof r.updatedAt !== 'number' || !Number.isFinite(r.updatedAt) || r.updatedAt < 0) {
    return invalid
  }

  const c = r.config
  return {
    ok: true,
    preset: {
      id: r.id,
      name: normalizePresetName(r.name),
      // allow-list のキーだけで組み直す (未知キーを持ち込まない)。
      config: {
        folderId: c.folderId,
        runtimeId: c.runtimeId,
        providerId: c.providerId,
        modelId: c.modelId,
        effort: c.effort,
        permissionMode: c.permissionMode
      },
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
      permissionMode: preset.config.permissionMode
    },
    updatedAt: preset.updatedAt
  }
}
