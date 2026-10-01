import type { SessionLaunchConfig } from './launch-config'

/**
 * 名前付きで保存された起動設定 (X-4 FR-009〜011 / glossary Preset)。**I/O を持たない。**
 *
 * **資格情報の値を含まない** (Principle V) — Provider は id 参照で持ち、secretRefKey も helper の実体も持たない。
 * 名前は `normalizePresetName` 済みの値で保持し、同名判定もその形で行う。
 */
export interface Preset {
  readonly id: string
  readonly name: string
  readonly config: SessionLaunchConfig
  /** 最終保存時刻 (ms)。一覧は降順に並べる。 */
  readonly updatedAt: number
}

/** 表示・IPC 用の DTO (Preset と同じ形。秘密を持たないので射影は不要)。 */
export type PresetDTO = Preset

/**
 * 保存の結果 (失敗は理由キーのみ)。
 * `store-read-failed`: presets.json を読めなかった (未作成以外)。中身を知らないまま上書きしないため拒否する。
 */
export type SavePresetResult =
  | { readonly ok: true; readonly preset: PresetDTO }
  | {
      readonly ok: false
      readonly reason:
        | 'invalid-preset'
        | 'name-conflict'
        | 'limit-reached'
        | 'store-newer-version'
        | 'store-read-failed'
    }

/** 一覧を更新日時の降順に並べる。 */
export function sortPresets(presets: readonly Preset[]): Preset[] {
  return [...presets].sort((a, b) => b.updatedAt - a.updatedAt)
}
