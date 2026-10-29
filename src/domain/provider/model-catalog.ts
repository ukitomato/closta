import { hasControlCharacter, MAX_DISPLAY_NAME_LENGTH, MAX_ID_LENGTH } from '@domain/validation'

import { EFFORT_LEVELS, type EffortLevel, type ModelCatalogRef, type ModelEntry } from './types'

/**
 * モデルカタログの述語 (X-4 FR-017 / AD-041 / AD-042)。**I/O を持たない。**
 *
 * モデルカタログは provider の概念なので `domain/provider` に置く。`domain/session` はここを import する
 * (session → provider の順方向依存。provider は session を import しない)。
 *
 * **IPC 形状検証 (`app/validate.ts`) / 永続層 (`infra/settings/provider-record.ts`) / 起動設定検証が
 * 同じ述語を呼ぶ** (write/read 対称。X-3 SEC-M-001)。別々に書くと「登録は通るが reload で消える」非対称が生まれる。
 */

export function isEffortLevel(value: unknown): value is EffortLevel {
  return typeof value === 'string' && (EFFORT_LEVELS as readonly string[]).includes(value)
}

/**
 * モデル ID / inference profile ID の文字種 (allowlist)。
 *
 * 英数と `._:/@-[]` だけを許し、**先頭は英数**に限る (`-` 始まりは CLI フラグに化ける)。
 * `[1m]` のような context 指定と Bedrock の ARN 形 (`arn:aws:bedrock:...:inference-profile/...`) を通す。
 * 起動 argv は `--exec` でシェルを経由しないが (AD-041 (f))、文字種で縛るのは defense-in-depth である。
 */
const MODEL_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/@[\]-]*$/

export function isValidModelId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= MAX_ID_LENGTH &&
    MODEL_ID_PATTERN.test(value)
  )
}

/** 対応 effort の配列: enum 照合・重複なし・5 件以下。 */
export function isValidEffortLevels(value: unknown): value is readonly EffortLevel[] {
  if (!Array.isArray(value)) return false
  if (value.length > EFFORT_LEVELS.length) return false
  if (!value.every(isEffortLevel)) return false
  return new Set(value).size === value.length
}

function isValidModelDisplayName(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= MAX_DISPLAY_NAME_LENGTH &&
    !hasControlCharacter(value)
  )
}

/** カタログの 1 項目。**許可キー以外を持たない** (id / displayName / inferenceProfileId / supportedEffortLevels)。 */
const MODEL_ENTRY_KEYS = ['id', 'displayName', 'inferenceProfileId', 'supportedEffortLevels']

export function isValidModelEntry(value: unknown): value is ModelEntry {
  if (typeof value !== 'object' || value === null) return false
  const e = value as Record<string, unknown>
  if (Object.keys(e).some((k) => !MODEL_ENTRY_KEYS.includes(k))) return false
  if (!isValidModelId(e.id)) return false
  if (!isValidModelDisplayName(e.displayName)) return false
  if (e.inferenceProfileId !== undefined && !isValidModelId(e.inferenceProfileId)) return false
  if (e.supportedEffortLevels !== undefined && !isValidEffortLevels(e.supportedEffortLevels)) {
    return false
  }
  return true
}

/** カタログ件数の上限 (IPC と永続層で共有)。 */
export const MAX_CATALOG_MODELS = 64

/** カタログ root の許可キー (未知キーを永続層へ通さない。write/read 対称。pr-gate R1 database M-302)。 */
const MODEL_CATALOG_KEYS = ['models']

export function isValidModelCatalog(value: unknown): value is ModelCatalogRef {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const m = value as Record<string, unknown>
  if (Object.keys(m).some((k) => !MODEL_CATALOG_KEYS.includes(k))) return false
  if (!Array.isArray(m.models)) return false
  if (m.models.length > MAX_CATALOG_MODELS) return false
  if (!m.models.every(isValidModelEntry)) return false
  // 同一 id の重複は選択を曖昧にする。
  return new Set(m.models.map((e: ModelEntry) => e.id)).size === m.models.length
}

/**
 * 実行中のセッションで切り替えられるモデル (023 / data-model §2)。
 *
 * - `effort === null` ならカタログの全部 (並びはカタログの順)
 * - `effort !== null` なら `supportedEffortLevels` にその effort を含むものだけ (対応 effort が無いモデルは除く)
 *
 * renderer の選択肢と main の検証の両方がこの関数を使う。
 */
export function switchableModels(
  models: readonly ModelEntry[],
  effort: EffortLevel | null
): readonly ModelEntry[] {
  if (effort === null) return models
  return models.filter((m) => (m.supportedEffortLevels ?? []).includes(effort))
}

/** 同じ `id` は先を残し、先頭から `MAX_CATALOG_MODELS` 件で切る (一覧の正規化の共通の後段)。 */
function dedupeAndCap(entries: readonly ModelEntry[]): readonly ModelEntry[] {
  const seen = new Set<string>()
  const out: ModelEntry[] = []
  for (const e of entries) {
    if (seen.has(e.id)) continue
    seen.add(e.id)
    out.push(e)
    if (out.length >= MAX_CATALOG_MODELS) break
  }
  return out
}

/**
 * Claude Code の `supportedModels()` の答え (`ModelInfo[]`) を `ModelEntry` の形に正規化する (025 / data-model §1.2)。
 * **セッションスレッドだけが使う** (入力は `value` を持つ SDK の形)。配列でなければ `null`。空の配列は `[]` (失敗と分ける)。
 * `description` / `resolvedModel` / `supports*` は写さない。
 */
export function normalizeLiveModels(raw: unknown): readonly ModelEntry[] | null {
  if (!Array.isArray(raw)) return null
  const mapped: ModelEntry[] = []
  for (const item of raw as unknown[]) {
    if (typeof item !== 'object' || item === null) continue
    const r = item as Record<string, unknown>
    if (typeof r.value !== 'string') continue
    const candidate: Record<string, unknown> = { id: r.value, displayName: r.displayName }
    if (r.supportedEffortLevels !== undefined) {
      candidate.supportedEffortLevels = r.supportedEffortLevels
    }
    if (isValidModelEntry(candidate)) mapped.push(candidate)
  }
  return dedupeAndCap(mapped)
}

/**
 * main の境界の再検査 (025 / data-model §1.3)。入力はセッションスレッドが送った `ModelEntry` の形。
 * `isValidModelEntry` を通らない要素と `inferenceProfileId` を持つ要素を捨てる。配列でなければ `null`。
 */
export function normalizeLiveModelEntries(raw: unknown): readonly ModelEntry[] | null {
  if (!Array.isArray(raw)) return null
  const kept: ModelEntry[] = []
  for (const item of raw as unknown[]) {
    if (!isValidModelEntry(item)) continue
    if (item.inferenceProfileId !== undefined) continue
    kept.push(item)
  }
  return dedupeAndCap(kept)
}

/** Bedrock は inference profile ID で pin する (X-3 FR-010)。無ければモデル ID。起動と実行中の切り替えの両方が使う。 */
export function sdkModelOf(entry: ModelEntry): string {
  return entry.inferenceProfileId ?? entry.id
}
