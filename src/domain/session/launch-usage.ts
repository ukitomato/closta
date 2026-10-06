/**
 * 起動の利用記録 (`LaunchUsage`。O-3 / spec FR-009〜FR-013 / 012 data-model §4)。**I/O を持たない純関数。**
 *
 * | 規則 | 根拠 |
 * |---|---|
 * | 起動元は `preset` / `manual` の 2 値。未信頼の値は厳密比較だけで受け、ほかは `null` (記録しない) | spec FR-010 / U-2 |
 * | 記録はローカルの暦日ごとの 2 つの回数だけ。識別子・名前・時刻 (日より細かいもの) は構造上入らない | spec FR-011 / Principle V |
 * | 日の鍵 (`LocalDayKey`) を作れるのは `toLocalDayKey` と `parseLocalDayKey` だけ | data-model §4 |
 * | **刈り込みは暦の日数ではなく鍵の数で行う** (今日の鍵と、ほかの新しい順の 89 個)。時計が先に跳んでも跳ぶ前の日を一度に消さない | spec FR-012 / data-model §4 / research R-05 |
 * | 30 日の合計は今日を含む 30 暦日。未来の日の鍵は数えない | spec FR-013 |
 * | 回数は `Number.isSafeInteger(n) && n >= 0` の範囲に留める (上限で止める) | data-model §4 |
 * | 書き出しは許可したキー (`schemaVersion` / `days` / 日付 / `preset` / `manual`) しか出さない | data-model §4「入れないもの」 / SC-005 |
 *
 * 日付の順は `YYYY-MM-DD` の字面の順と同じ (4 桁の年・2 桁の月日に固定するため)。
 */

/** 起動元 (glossary「起動元」)。数え方の正本は 012 data-model §4「renderer の起動元」。 */
export type LaunchOrigin = 'preset' | 'manual'

/** 起動の要求の未信頼入力を検証する。`value === 'preset' || value === 'manual'` の厳密比較で、ほかは `null`。 */
export function checkLaunchOrigin(value: unknown): LaunchOrigin | null {
  return value === 'preset' || value === 'manual' ? value : null
}

declare const localDayKeyBrand: unique symbol

/** ローカルの暦日 (`YYYY-MM-DD`)。`toLocalDayKey` と `parseLocalDayKey` の外では作れない。 */
export type LocalDayKey = string & { readonly [localDayKeyBrand]: true }

/** `launch-usage.json` の書式の版。 */
export const LAUNCH_USAGE_SCHEMA_VERSION = 1
/** 残す日の鍵の数 (今日の鍵を含む。spec U-4 / FR-012)。 */
export const LAUNCH_USAGE_RETAINED_DAYS = 90
/** プリセットの欄に出す集計の日数 (今日を含む。spec FR-013)。 */
export const LAUNCH_USAGE_SUMMARY_DAYS = 30

/** 1 日分の回数。 */
export interface LaunchDayCounts {
  readonly preset: number
  readonly manual: number
}

/** 起動の利用記録 (日の鍵 → 回数)。 */
export interface LaunchUsage {
  readonly days: ReadonlyMap<LocalDayKey, LaunchDayCounts>
}

export const EMPTY_LAUNCH_USAGE: LaunchUsage = { days: new Map() }

/**
 * 読み出しの IPC (`getLaunchUsage`) の戻り値。集計済みの 2 つの回数と集計の日数、または「読めない」だけで、
 * 日ごとの記録を renderer に渡さない (spec FR-013)。`unreadable` は将来版と読めないの両方。
 */
export type LaunchUsageSummaryDTO =
  | {
      readonly status: 'ok'
      readonly preset: number
      readonly manual: number
      readonly days: typeof LAUNCH_USAGE_SUMMARY_DAYS
    }
  | { readonly status: 'unreadable' }

/** 保存する形 (許可したキーだけ)。 */
export interface LaunchUsageRecord {
  readonly schemaVersion: typeof LAUNCH_USAGE_SCHEMA_VERSION
  readonly days: Readonly<Record<string, LaunchDayCounts>>
}

const MS_PER_MINUTE = 60_000
const MS_PER_DAY = 86_400_000
const DAY_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const COUNT_KEYS: readonly string[] = ['preset', 'manual']

/** 回数として正しいか (安全な整数で 0 以上)。 */
export function isLaunchCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

/** 上限 (`Number.MAX_SAFE_INTEGER`) で止める足し算。 */
function addCapped(a: number, b: number): number {
  return Math.min(a + b, Number.MAX_SAFE_INTEGER)
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28
  return month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31
}

/** UTC の時刻の暦日を鍵にする。4 桁の年に収まらない・時刻が不正なら `null`。 */
function formatUtcDay(utcMs: number): LocalDayKey | null {
  const date = new Date(utcMs)
  if (!Number.isFinite(date.getTime())) return null
  const year = date.getUTCFullYear()
  if (year < 0 || year > 9999) return null
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${String(year).padStart(4, '0')}-${month}-${day}` as LocalDayKey
}

/** 鍵の日の 00:00 (UTC として扱う) の時刻。`Date.UTC` は 0〜99 年を 1900 年代に読むので使わない。 */
function dayStartMs(day: LocalDayKey): number {
  const date = new Date(0)
  date.setUTCFullYear(
    Number(day.slice(0, 4)),
    Number(day.slice(5, 7)) - 1,
    Number(day.slice(8, 10))
  )
  return date.getTime()
}

/** 鍵の日から `delta` 日ずらした鍵。4 桁の年の外に出たら `null`。 */
function shiftDay(day: LocalDayKey, delta: number): LocalDayKey | null {
  return formatUtcDay(dayStartMs(day) + delta * MS_PER_DAY)
}

/**
 * 時刻 (epoch ms) とローカルの時差 (分。UTC より進んでいれば正) からローカルの暦日を作る。
 * 時刻・時差が有限でない、または年が 4 桁に収まらないときは `RangeError` を投げる (時計の値として起こらない)。
 */
export function toLocalDayKey(epochMs: number, offsetMinutes: number): LocalDayKey {
  const key =
    Number.isFinite(epochMs) && Number.isFinite(offsetMinutes)
      ? formatUtcDay(epochMs + offsetMinutes * MS_PER_MINUTE)
      : null
  if (key === null) throw new RangeError('local day out of range')
  return key
}

/** 読み込んだ日の鍵を検証する (`YYYY-MM-DD` かつ暦として正しい日。閏年を含む)。 */
export function parseLocalDayKey(value: unknown): LocalDayKey | null {
  if (typeof value !== 'string' || !DAY_KEY_PATTERN.test(value)) return null
  const year = Number(value.slice(0, 4))
  const month = Number(value.slice(5, 7))
  const day = Number(value.slice(8, 10))
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null
  return value as LocalDayKey
}

/** 読み込んだ 1 日分の値を検証する。キーは `preset` / `manual` の 2 つだけで、どちらも回数として正しいこと。 */
export function toLaunchDayCounts(value: unknown): LaunchDayCounts | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  const keys = Object.keys(record)
  if (keys.length !== COUNT_KEYS.length || keys.some((k) => !COUNT_KEYS.includes(k))) return null
  const { preset, manual } = record
  if (!isLaunchCount(preset) || !isLaunchCount(manual)) return null
  return { preset, manual }
}

/** その日の起動元の回数を 1 足す (上限で止める)。 */
export function addLaunch(usage: LaunchUsage, day: LocalDayKey, origin: LaunchOrigin): LaunchUsage {
  const current = usage.days.get(day) ?? { preset: 0, manual: 0 }
  const next: LaunchDayCounts =
    origin === 'preset'
      ? { preset: addCapped(current.preset, 1), manual: current.manual }
      : { preset: current.preset, manual: addCapped(current.manual, 1) }
  const days = new Map(usage.days)
  days.set(day, next)
  return { days }
}

/**
 * 日の鍵を 90 日分だけ残す: `today` の鍵と、それ以外の鍵を日付の新しい順に 89 個。ほかは消す。
 * 暦の日数では数えない (時計が先に跳んだ後の書き込みで、跳ぶ前の日をまとめて消さない。research R-05)。
 * 残した鍵は日付の古い順に並べる。
 */
export function prune(usage: LaunchUsage, today: LocalDayKey): LaunchUsage {
  const others = [...usage.days.keys()]
    .filter((key) => key !== today)
    .sort()
    .reverse()
    .slice(0, LAUNCH_USAGE_RETAINED_DAYS - 1)
  const keep = new Set<LocalDayKey>(others)
  if (usage.days.has(today)) keep.add(today)
  const entries = [...usage.days.entries()]
    .filter(([key]) => keep.has(key))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  return { days: new Map(entries) }
}

/** `today` を含む直近 30 暦日 (`today - 29` 〜 `today`) の合計。未来の日の鍵は入らない。 */
export function sum30(usage: LaunchUsage, today: LocalDayKey): LaunchDayCounts {
  const from = shiftDay(today, -(LAUNCH_USAGE_SUMMARY_DAYS - 1)) ?? ''
  let preset = 0
  let manual = 0
  for (const [key, counts] of usage.days) {
    if (key < from || key > today) continue
    preset = addCapped(preset, counts.preset)
    manual = addCapped(manual, counts.manual)
  }
  return { preset, manual }
}

/** 読み出しの DTO (読めたとき)。 */
export function summarizeLaunchUsage(
  usage: LaunchUsage,
  today: LocalDayKey
): LaunchUsageSummaryDTO {
  const { preset, manual } = sum30(usage, today)
  return { status: 'ok', preset, manual, days: LAUNCH_USAGE_SUMMARY_DAYS }
}

/** 保存する形へ落とす。**許可したキーだけを出す** (日付の古い順)。 */
export function toLaunchUsageRecord(usage: LaunchUsage): LaunchUsageRecord {
  const days: Record<string, LaunchDayCounts> = {}
  for (const key of [...usage.days.keys()].sort()) {
    const counts = usage.days.get(key)
    if (counts === undefined) continue
    days[key] = { preset: counts.preset, manual: counts.manual }
  }
  return { schemaVersion: LAUNCH_USAGE_SCHEMA_VERSION, days }
}
