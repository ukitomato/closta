import { isValidModelId } from '@domain/provider/model-catalog'

import { mayCarrySecret } from './system-event'

/**
 * 計量 (`SessionEvent` の `meter`) の形・値の検証・SDK の値の正規化 (O-4 / AD-047 Decision 2。
 * [data-model](../../../specs/014-ui-metering-and-limits/data-model.md) §2 が正本)。**純粋関数**で、SDK を import しない。
 *
 * セッションスレッドの組み立て (`src/agents/live-signals.ts`) と renderer の decoder (`session-event-decoder.ts`) が
 * **同じ関数・同じ定数**を使う。
 *
 * | 規則 | 根拠 |
 * |---|---|
 * | 運ぶ値は数・真偽・列挙・モデルの id と、形を検証した tool の id だけ。会話由来の文字列・エラー文・パスを運ばない | data-model §2 / spec FR-003 |
 * | 列挙は prototype を持たない表と `Object.hasOwn` で照合する (`__proto__` / `constructor` / `toString` を通さない) | data-model §2「値の検証」 |
 * | decoder は検証を通した値だけで新しい object を組む (余分なキーを運ばない)。どの入力でも例外を出さない | spec SC-002 |
 * | 権限モードの昇格値の綴りはここ (domain) に置く。`src/agents/` には置かない | Constitution 検証の項目 16 / data-model §2 |
 */

/* ── 列挙 (値域は SDK の型と `sdk-agent-session.ts` の `Equal<…>` で固定する) ───── */

/** 権限モードの鍵 (SDK の `PermissionMode` の 6 値と、知らない値の `unknown`)。 */
export const PERMISSION_MODE_KEYS = [
  'default',
  'acceptEdits',
  'bypassPermissions',
  'plan',
  'dontAsk',
  'auto',
  'unknown'
] as const
export type PermissionModeKey = (typeof PERMISSION_MODE_KEYS)[number]

/** `rate_limit_info.status` (SDK の `SDKRateLimitInfo['status']`)。 */
export const RATE_LIMIT_STATUSES = ['allowed', 'allowed_warning', 'rejected'] as const
export type RateLimitStatus = (typeof RATE_LIMIT_STATUSES)[number]

/** `rate_limit_info.rateLimitType` (SDK の 6 値)。 */
export const RATE_LIMIT_TYPES = [
  'five_hour',
  'seven_day',
  'seven_day_opus',
  'seven_day_sonnet',
  'seven_day_overage_included',
  'overage'
] as const
export type RateLimitType = (typeof RATE_LIMIT_TYPES)[number]

/** assistant のメッセージの `error` (SDK の `SDKAssistantMessageError` の 13 値。文字列の本文を含まない)。 */
export const ASSISTANT_ERROR_KEYS = [
  'authentication_failed',
  'oauth_org_not_allowed',
  'account_on_hold',
  'verification_required',
  'billing_error',
  'rate_limit',
  'overloaded',
  'invalid_request',
  'model_not_found',
  'server_error',
  'unknown',
  'max_output_tokens',
  'cloud_credential_error'
] as const
export type AssistantErrorKey = (typeof ASSISTANT_ERROR_KEYS)[number]

/** `MeterUpdate` の判別子。decoder は知らない `type` を捨てる (後続 feature が種類を足せる形)。 */
export const METER_UPDATE_TYPES = [
  'turn',
  'context',
  'rate-limit',
  'permission-mode',
  'thinking',
  'tool-elapsed'
] as const
export type MeterUpdateType = (typeof METER_UPDATE_TYPES)[number]

/* ── 形 ──────────────────────────────────────────────────────────── */

/** `result` の `modelUsage` の 1 モデル分 (data-model §2)。 */
export interface ModelMeter {
  readonly modelId: string
  readonly input: number
  readonly output: number
  readonly cacheRead: number
  readonly cacheCreation: number
  readonly costUsd: number
  readonly contextWindow: number
}

export type MeterUpdate =
  | {
      readonly type: 'turn'
      readonly costUsd: number
      readonly turns: number
      readonly models: readonly ModelMeter[]
      readonly permissionDenials: number
    }
  | { readonly type: 'context'; readonly usedTokens: number }
  | {
      readonly type: 'rate-limit'
      readonly status: RateLimitStatus
      readonly limitType: RateLimitType | null
      readonly utilizationPct: number | null
      readonly resetsAtSec: number | null
      readonly usingOverage: boolean
    }
  | { readonly type: 'permission-mode'; readonly mode: PermissionModeKey }
  | { readonly type: 'thinking'; readonly estimatedTokens: number }
  | { readonly type: 'tool-elapsed'; readonly toolUseId: string; readonly elapsedSeconds: number }

/* ── 定数 (agents と decoder で共有) ────────────────────────────────── */

/** `models` の件数の上限。17 件目以降を落とす。 */
export const MAX_METER_MODELS = 16
/** 費用 (USD) の上限。 */
export const MAX_METER_COST_USD = 1e6
/** `contextWindow` の上限。 */
export const MAX_METER_CONTEXT_WINDOW = 1e8
/** 解除の時刻 (epoch 秒) の範囲。 */
export const MIN_RESETS_AT_SEC = 1e9
export const MAX_RESETS_AT_SEC = 1e11
/**
 * `turn` の `permissionDenials` (result の `permission_denials` の `tool_use_id` を重複を除いて数えた数) の上限。
 * セッションスレッドは達したら足さず、renderer は達していたら「1,024 件以上」と出す (data-model §2 / §4)。
 */
export const MAX_METER_PERMISSION_DENIALS = 1024

/** tool の id (`tool_use_id`) と task の id (`task_id`) の形。 */
const METER_ID_SHAPE = /^[A-Za-z0-9_-]{1,128}$/
/** scheme の無い userinfo の形 (`u:p@h/m`)。 */
const USERINFO_SHAPE = /^[^/]*:[^/]*@/

/* ── 照合の部品 ───────────────────────────────────────────────────── */

type Rec = Record<string, unknown>

/** 配列でない object だけを record として読む。 */
function asRecord(value: unknown): Rec | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Rec)
    : null
}

/** 列挙の照合表 (prototype を持たない。`Object.hasOwn` と組で `constructor` などを通さない)。 */
function enumTable(values: readonly string[]): Readonly<Record<string, true>> {
  const table: Record<string, true> = Object.create(null) as Record<string, true>
  for (const v of values) table[v] = true
  return table
}

function inEnum(table: Readonly<Record<string, true>>, value: unknown): value is string {
  return typeof value === 'string' && Object.hasOwn(table, value)
}

const PERMISSION_MODE_TABLE = enumTable(PERMISSION_MODE_KEYS)
const RATE_LIMIT_STATUS_TABLE = enumTable(RATE_LIMIT_STATUSES)
const RATE_LIMIT_TYPE_TABLE = enumTable(RATE_LIMIT_TYPES)
const ASSISTANT_ERROR_TABLE = enumTable(ASSISTANT_ERROR_KEYS)
const METER_UPDATE_TYPE_TABLE = enumTable(METER_UPDATE_TYPES)

/* ── 列挙の正規化 ─────────────────────────────────────────────────── */

/** 権限モード。知らない値・文字列でない値は `unknown`。 */
export function toPermissionModeKey(raw: unknown): PermissionModeKey {
  return inEnum(PERMISSION_MODE_TABLE, raw) ? (raw as PermissionModeKey) : 'unknown'
}

/** assistant の `error`。知らない値は null。 */
export function toAssistantErrorKey(raw: unknown): AssistantErrorKey | null {
  return inEnum(ASSISTANT_ERROR_TABLE, raw) ? (raw as AssistantErrorKey) : null
}

/** `rate_limit_info.status`。知らない値は null (`rate-limit` を送らない)。 */
export function toRateLimitStatus(raw: unknown): RateLimitStatus | null {
  return inEnum(RATE_LIMIT_STATUS_TABLE, raw) ? (raw as RateLimitStatus) : null
}

/** `rate_limit_info.rateLimitType`。無い・知らない値は null (文言は「利用枠」)。 */
export function toRateLimitType(raw: unknown): RateLimitType | null {
  return inEnum(RATE_LIMIT_TYPE_TABLE, raw) ? (raw as RateLimitType) : null
}

/* ── 数の正規化 ───────────────────────────────────────────────────── */

/** 数 (トークン・回数・ms)。安全な整数で 0 以上でなければ 0。 */
export function toCount(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isSafeInteger(raw) || raw < 0) return 0
  return raw === 0 ? 0 : raw // -0 を 0 にする
}

/** 秒。`Math.floor` してから `toCount` と同じ規則。 */
export function toSeconds(raw: unknown): number {
  return typeof raw === 'number' ? toCount(Math.floor(raw)) : 0
}

/** 費用 (USD)。有限で 0 以上 `MAX_METER_COST_USD` 以下でなければ 0。 */
export function toCostUsd(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return 0
  if (raw < 0 || raw > MAX_METER_COST_USD) return 0
  return raw === 0 ? 0 : raw
}

/** `contextWindow`。安全な整数で 0 より大きく `MAX_METER_CONTEXT_WINDOW` 以下でなければ 0 (目盛りを出さない)。 */
export function toContextWindow(raw: unknown): number {
  return typeof raw === 'number' &&
    Number.isSafeInteger(raw) &&
    raw > 0 &&
    raw <= MAX_METER_CONTEXT_WINDOW
    ? raw
    : 0
}

/**
 * `rate_limit_info.utilization` → 割合 (0〜100)。`0 <= x <= 1` なら ×100、`1 < x <= 100` ならそのまま、
 * それ以外は null (値域を実データで確かめるまで両方を受ける。plan RK-07)。
 */
export function toUtilizationPct(raw: unknown): number | null {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return null
  if (raw >= 0 && raw <= 1) return raw === 0 ? 0 : raw * 100
  if (raw > 1 && raw <= 100) return raw
  return null
}

/**
 * `rate_limit_info.resetsAt` → epoch 秒。`MIN_RESETS_AT_SEC`〜`MAX_RESETS_AT_SEC` の外で上を超えたら ms とみなして
 * 1000 で割り、同じ範囲に入るかを確かめる。入らなければ null (単位を実データで確かめるまで。plan RK-07)。
 */
export function toResetsAtSec(raw: unknown): number | null {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return null
  const sec = Math.floor(raw > MAX_RESETS_AT_SEC ? raw / 1000 : raw)
  return sec >= MIN_RESETS_AT_SEC && sec <= MAX_RESETS_AT_SEC ? sec : null
}

/* ── id の検証 ────────────────────────────────────────────────────── */

/** tool の id (`toolUseId`) の形 (`^[A-Za-z0-9_-]{1,128}$`)。 */
export function isValidToolUseId(raw: unknown): raw is string {
  return typeof raw === 'string' && METER_ID_SHAPE.test(raw)
}

/** task の id (`task_progress` の `task_id`)。`toolUseId` と同じ述語。 */
export const isValidTaskId: (raw: unknown) => raw is string = isValidToolUseId

/**
 * 計量で運んでよいモデルの id。文字種と長さの正本は domain の `isValidModelId` (起動の設定・モデルカタログと同じ述語。
 * `[1m]` 付き・`_` を含む id・Bedrock の ARN・Vertex の `model@date` を通す)。その上に 3 つだけを足す:
 * `//` を含まない・scheme の無い userinfo の形 (`u:p@h/m`) でない・`mayCarrySecret` が false。
 */
export function isMeterModelId(raw: unknown): raw is string {
  return (
    isValidModelId(raw) && !raw.includes('//') && !USERINFO_SHAPE.test(raw) && !mayCarrySecret(raw)
  )
}

/* ── SDK の値の正規化 (agents が使う) ───────────────────────────────── */

/**
 * `result` の `modelUsage` (モデルの id → 使用量) → 内訳の行。id を検証で落とした行は除き、`MAX_METER_MODELS` 件まで。
 * 読むのは 4 つのトークン数・`costUSD`・`contextWindow` だけ (data-model §2 の許可リスト)。
 */
export function toModelMeters(raw: unknown): readonly ModelMeter[] {
  const usage = asRecord(raw)
  if (usage === null) return []
  const out: ModelMeter[] = []
  for (const modelId of Object.keys(usage)) {
    if (out.length >= MAX_METER_MODELS) break
    if (!isMeterModelId(modelId)) continue
    const u = asRecord(usage[modelId])
    if (u === null) continue
    out.push({
      modelId,
      input: toCount(u.inputTokens),
      output: toCount(u.outputTokens),
      cacheRead: toCount(u.cacheReadInputTokens),
      cacheCreation: toCount(u.cacheCreationInputTokens),
      costUsd: toCostUsd(u.costUSD),
      contextWindow: toContextWindow(u.contextWindow)
    })
  }
  return out
}

/**
 * 主ループの assistant のメッセージの `message.usage` → コンテキストの使用量 (入力 + キャッシュの読み込み +
 * キャッシュの作成)。出力側は読まない。`usage` が record でない・和が安全な整数でないときは null (送らない)。
 */
export function contextTokensOf(usage: unknown): number | null {
  const u = asRecord(usage)
  if (u === null) return null
  const sum =
    toCount(u.input_tokens) +
    toCount(u.cache_read_input_tokens) +
    toCount(u.cache_creation_input_tokens)
  return Number.isSafeInteger(sum) ? sum : null
}

/* ── decoder (renderer が port から受けた値を検証する) ─────────────────── */

/** 送られた割合 (正規化の後の 0〜100)。 */
function decodeUtilizationPct(raw: unknown): number | null {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return null
  if (raw < 0 || raw > 100) return null
  return raw === 0 ? 0 : raw
}

/** 送られた解除の時刻 (正規化の後の epoch 秒)。 */
function decodeResetsAtSec(raw: unknown): number | null {
  return typeof raw === 'number' &&
    Number.isSafeInteger(raw) &&
    raw >= MIN_RESETS_AT_SEC &&
    raw <= MAX_RESETS_AT_SEC
    ? raw
    : null
}

/** 送られた内訳の行。id を検証で落とした行は除き、`MAX_METER_MODELS` 件まで。 */
function decodeModelMeters(raw: unknown): readonly ModelMeter[] {
  if (!Array.isArray(raw)) return []
  const out: ModelMeter[] = []
  for (const item of raw as readonly unknown[]) {
    if (out.length >= MAX_METER_MODELS) break
    const m = asRecord(item)
    if (m === null || !isMeterModelId(m.modelId)) continue
    out.push({
      modelId: m.modelId,
      input: toCount(m.input),
      output: toCount(m.output),
      cacheRead: toCount(m.cacheRead),
      cacheCreation: toCount(m.cacheCreation),
      costUsd: toCostUsd(m.costUsd),
      contextWindow: toContextWindow(m.contextWindow)
    })
  }
  return out
}

/**
 * `meter` の中身 (未信頼) → `MeterUpdate`。**検証を通した値だけで新しい object を組む** (余分なキーを運ばない)。
 * 知らない `type`・`status` の無い `rate-limit`・形の外れた `toolUseId` は null (捨てる)。例外を出さない。
 */
export function decodeMeterUpdate(raw: unknown): MeterUpdate | null {
  const m = asRecord(raw)
  if (m === null || !inEnum(METER_UPDATE_TYPE_TABLE, m.type)) return null
  switch (m.type as MeterUpdateType) {
    case 'turn':
      return {
        type: 'turn',
        costUsd: toCostUsd(m.costUsd),
        turns: toCount(m.turns),
        models: decodeModelMeters(m.models),
        permissionDenials: toCount(m.permissionDenials)
      }
    case 'context':
      return { type: 'context', usedTokens: toCount(m.usedTokens) }
    case 'rate-limit': {
      const status = toRateLimitStatus(m.status)
      if (status === null) return null
      return {
        type: 'rate-limit',
        status,
        limitType: toRateLimitType(m.limitType),
        utilizationPct: decodeUtilizationPct(m.utilizationPct),
        resetsAtSec: decodeResetsAtSec(m.resetsAtSec),
        usingOverage: m.usingOverage === true
      }
    }
    case 'permission-mode':
      return { type: 'permission-mode', mode: toPermissionModeKey(m.mode) }
    case 'thinking':
      return { type: 'thinking', estimatedTokens: toCount(m.estimatedTokens) }
    case 'tool-elapsed': {
      if (!isValidToolUseId(m.toolUseId)) return null
      return {
        type: 'tool-elapsed',
        toolUseId: m.toolUseId,
        elapsedSeconds: toSeconds(m.elapsedSeconds)
      }
    }
  }
}
