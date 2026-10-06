import { describe, expect, it } from 'vitest'

import {
  addLaunch,
  checkLaunchOrigin,
  EMPTY_LAUNCH_USAGE,
  isLaunchCount,
  LAUNCH_USAGE_RETAINED_DAYS,
  parseLocalDayKey,
  prune,
  sum30,
  summarizeLaunchUsage,
  toLaunchDayCounts,
  toLaunchUsageRecord,
  toLocalDayKey,
  type LaunchDayCounts,
  type LaunchUsage,
  type LocalDayKey
} from './launch-usage'

/** O-3 BE-040 — 起動の利用記録の純関数 (spec FR-009〜FR-013 / SC-005 / 012 data-model §4)。 */

const DAY_MS = 86_400_000

/** UTC の日付から鍵を作る (時差 0)。 */
function day(year: number, month: number, date: number): LocalDayKey {
  return toLocalDayKey(Date.UTC(year, month - 1, date, 12), 0)
}

/** `from` から `count` 日続く鍵 (古い順)。 */
function consecutive(from: LocalDayKey, count: number): LocalDayKey[] {
  const start = Date.UTC(
    Number(from.slice(0, 4)),
    Number(from.slice(5, 7)) - 1,
    Number(from.slice(8, 10)),
    12
  )
  return Array.from({ length: count }, (_, i) => toLocalDayKey(start + i * DAY_MS, 0))
}

function usageOf(entries: readonly (readonly [LocalDayKey, LaunchDayCounts])[]): LaunchUsage {
  return { days: new Map(entries) }
}

describe('checkLaunchOrigin (spec FR-010)', () => {
  it('preset / manual だけを通す', () => {
    expect(checkLaunchOrigin('preset')).toBe('preset')
    expect(checkLaunchOrigin('manual')).toBe('manual')
  })

  it.each([
    ['toString', 'toString'],
    ['constructor', 'constructor'],
    ['大文字', 'Preset'],
    ['前後の空白', ' manual'],
    ['null', null],
    ['undefined', undefined],
    ['数値', 1],
    ['オブジェクト', { origin: 'preset' }],
    ['配列', ['preset']]
  ])('ほかの値は null (%s)', (_label, value) => {
    expect(checkLaunchOrigin(value)).toBeNull()
  })
})

describe('parseLocalDayKey', () => {
  it.each(['2026-10-04', '2028-02-29', '2000-02-29', '2026-12-31', '2026-01-01'])(
    '暦として正しい日を通す (%s)',
    (value) => {
      expect(parseLocalDayKey(value)).toBe(value)
    }
  )

  it.each([
    ['月日が範囲外', '2026-13-45'],
    ['閏年でない 2/29', '2026-02-29'],
    ['100 で割り切れる年の 2/29', '1900-02-29'],
    ['30 日の月の 31 日', '2026-04-31'],
    ['0 月', '2026-00-10'],
    ['0 日', '2026-01-00'],
    ['桁が足りない', '2026-1-01'],
    ['前後の空白', ' 2026-01-01'],
    ['時刻つき', '2026-01-01T00:00'],
    ['数値', 20260101],
    ['null', null]
  ])('不正な鍵を拒む (%s)', (_label, value) => {
    expect(parseLocalDayKey(value)).toBeNull()
  })
})

describe('toLocalDayKey', () => {
  it('時差で UTC の日をまたぐ (進んでいる時差・遅れている時差)', () => {
    const utcEvening = Date.UTC(2026, 9, 4, 20, 0) // UTC 2026-10-04 20:00
    expect(toLocalDayKey(utcEvening, 0)).toBe('2026-10-04')
    expect(toLocalDayKey(utcEvening, 540)).toBe('2026-10-05') // UTC+9
    const utcEarly = Date.UTC(2026, 9, 5, 2, 0) // UTC 2026-10-05 02:00
    expect(toLocalDayKey(utcEarly, -300)).toBe('2026-10-04') // UTC-5
  })

  it('作った鍵は parseLocalDayKey を通る', () => {
    const key = toLocalDayKey(Date.UTC(2028, 1, 29, 1), 0)
    expect(parseLocalDayKey(key)).toBe(key)
  })

  it('有限でない時刻・時差は RangeError', () => {
    expect(() => toLocalDayKey(Number.NaN, 0)).toThrow(RangeError)
    expect(() => toLocalDayKey(0, Number.POSITIVE_INFINITY)).toThrow(RangeError)
  })
})

describe('addLaunch / 回数の範囲', () => {
  it('その日の起動元の回数だけを 1 増やす', () => {
    const today = day(2026, 10, 4)
    const once = addLaunch(EMPTY_LAUNCH_USAGE, today, 'preset')
    const twice = addLaunch(once, today, 'manual')
    expect(twice.days.get(today)).toEqual({ preset: 1, manual: 1 })
    // 元の記録は変えない (純関数)。
    expect(EMPTY_LAUNCH_USAGE.days.size).toBe(0)
    expect(once.days.get(today)).toEqual({ preset: 1, manual: 0 })
  })

  it('回数は Number.isSafeInteger の外にならない (上限で止める)', () => {
    const today = day(2026, 10, 4)
    const max = Number.MAX_SAFE_INTEGER
    const full = usageOf([[today, { preset: max, manual: max }]])
    const next = addLaunch(addLaunch(full, today, 'preset'), today, 'manual')
    expect(next.days.get(today)).toEqual({ preset: max, manual: max })
    expect(isLaunchCount(next.days.get(today)?.preset)).toBe(true)

    const yesterday = day(2026, 10, 3)
    const summed = sum30(usageOf([...full.days, [yesterday, { preset: max, manual: 1 }]]), today)
    expect(Number.isSafeInteger(summed.preset)).toBe(true)
    expect(summed.preset).toBe(max)
  })

  it.each([
    [0, true],
    [3, true],
    [Number.MAX_SAFE_INTEGER, true],
    [-1, false],
    [1.5, false],
    [Number.MAX_SAFE_INTEGER + 1, false],
    [Number.NaN, false],
    ['1', false]
  ])('isLaunchCount(%s) = %s', (value, ok) => {
    expect(isLaunchCount(value)).toBe(ok)
  })
})

describe('prune (鍵の数で残す。spec FR-012)', () => {
  it('今日の鍵と、ほかの新しい順の 89 個を残す。91 個目から古い日を消す', () => {
    const keys = consecutive(day(2026, 7, 6), LAUNCH_USAGE_RETAINED_DAYS + 1) // 91 日分
    const today = keys[keys.length - 1]
    const usage = usageOf(keys.map((k) => [k, { preset: 1, manual: 0 }] as const))
    const pruned = prune(usage, today)
    expect(pruned.days.size).toBe(LAUNCH_USAGE_RETAINED_DAYS)
    expect(pruned.days.has(keys[0])).toBe(false)
    expect(pruned.days.has(keys[1])).toBe(true)
    expect(pruned.days.has(today)).toBe(true)
  })

  it('90 個以下なら何も消さない', () => {
    const keys = consecutive(day(2026, 7, 7), LAUNCH_USAGE_RETAINED_DAYS)
    const usage = usageOf(keys.map((k) => [k, { preset: 0, manual: 1 }] as const))
    expect([...prune(usage, keys[keys.length - 1]).days.keys()]).toEqual(keys)
  })

  it('日付の順と字面の順が同じ (月と年の境目をまたいでも古い日から消える)', () => {
    // 2025-12-31 → 2026-01-01 (年) と 2026-01-31 → 2026-02-01 (月) の境目を含む 91 日。
    const keys = consecutive(day(2025, 12, 31), LAUNCH_USAGE_RETAINED_DAYS + 1)
    const sorted = [...keys].sort()
    expect(sorted).toEqual(keys)
    const shuffled = usageOf([...keys].reverse().map((k) => [k, { preset: 1, manual: 1 }] as const))
    const pruned = prune(shuffled, keys[keys.length - 1])
    expect(pruned.days.has('2025-12-31' as LocalDayKey)).toBe(false)
    expect(pruned.days.has('2026-01-01' as LocalDayKey)).toBe(true)
    // 残した鍵は古い順に並ぶ。
    expect([...pruned.days.keys()]).toEqual(keys.slice(1))
  })

  it('時計が戻ったらその日に足す。90 個の鍵がすべてそれより新しくても今日の鍵が残る', () => {
    const newer = consecutive(day(2027, 1, 1), LAUNCH_USAGE_RETAINED_DAYS)
    const usage = usageOf(newer.map((k) => [k, { preset: 1, manual: 0 }] as const))
    const past = day(2026, 10, 4)
    const written = prune(addLaunch(usage, past, 'manual'), past)
    expect(written.days.get(past)).toEqual({ preset: 0, manual: 1 })
    expect(written.days.size).toBe(LAUNCH_USAGE_RETAINED_DAYS)
    // 消えるのは「ほか」の最も古い 1 日。
    expect(written.days.has(newer[0])).toBe(false)
    expect(written.days.has(newer[newer.length - 1])).toBe(true)
  })

  it('時計の先跳び: 跳ぶ前の 30 日分に、跳んだ先の 2 つの日で addLaunch → prune を 3 回つなげても跳ぶ前の日がすべて残る', () => {
    const before = consecutive(day(2026, 9, 5), 30) // 2026-09-05 〜 2026-10-04
    let usage = usageOf(before.map((k) => [k, { preset: 1, manual: 0 }] as const))
    const jumped1 = day(2027, 10, 4)
    const jumped2 = day(2027, 10, 5)
    for (const today of [jumped1, jumped2, jumped2]) {
      usage = prune(addLaunch(usage, today, 'manual'), today)
    }
    for (const key of before) expect(usage.days.has(key)).toBe(true)
    expect(usage.days.get(jumped2)).toEqual({ preset: 0, manual: 2 })

    // 時計を戻した日の 30 日の合計に跳ぶ前の回数が出る (跳んだ先の未来の鍵は数えない)。
    expect(sum30(usage, before[before.length - 1])).toEqual({ preset: 30, manual: 0 })
  })
})

describe('sum30 (今日を含む 30 暦日)', () => {
  it('today - 29 〜 today を数え、today - 30 と未来の鍵を数えない', () => {
    const today = day(2026, 10, 4)
    const usage = usageOf([
      [day(2026, 9, 4), { preset: 100, manual: 100 }], // today - 30
      [day(2026, 9, 5), { preset: 1, manual: 0 }], // today - 29
      [day(2026, 10, 1), { preset: 2, manual: 3 }],
      [today, { preset: 4, manual: 5 }],
      [day(2026, 10, 5), { preset: 1000, manual: 1000 }] // 未来
    ])
    expect(sum30(usage, today)).toEqual({ preset: 7, manual: 8 })
    expect(summarizeLaunchUsage(usage, today)).toEqual({
      status: 'ok',
      preset: 7,
      manual: 8,
      days: 30
    })
  })

  it('記録が無ければ 0 / 0', () => {
    expect(sum30(EMPTY_LAUNCH_USAGE, day(2026, 10, 4))).toEqual({ preset: 0, manual: 0 })
  })
})

describe('toLaunchDayCounts (読み込みの 1 日分)', () => {
  it('preset / manual の 2 つのキーだけを持つ値を通す', () => {
    expect(toLaunchDayCounts({ preset: 1, manual: 0 })).toEqual({ preset: 1, manual: 0 })
  })

  it.each([
    ['キーが外', { preset: 1, manual: 0, sessionId: 'x' }],
    ['片方が欠けている', { preset: 1 }],
    ['回数が負', { preset: -1, manual: 0 }],
    ['回数が小数', { preset: 1.5, manual: 0 }],
    ['回数が文字列', { preset: '1', manual: 0 }],
    ['配列', [1, 0]],
    ['null', null]
  ])('不正な値は null (%s)', (_label, value) => {
    expect(toLaunchDayCounts(value)).toBeNull()
  })
})

describe('toLaunchUsageRecord (書き出しのキーが固定の集合。SC-005)', () => {
  /** JSON の中に現れるキーをすべて集める (日付の鍵は 1 つの印にまとめる)。 */
  function keysOf(value: unknown, into = new Set<string>()): Set<string> {
    if (typeof value !== 'object' || value === null) return into
    for (const [key, child] of Object.entries(value)) {
      into.add(parseLocalDayKey(key) === null ? key : '<day>')
      keysOf(child, into)
    }
    return into
  }

  it('版・日付・2 つの回数のほかのキーを出さない (値に余計なキーが紛れ込んでも)', () => {
    const smuggled = {
      preset: 2,
      manual: 1,
      sessionId: '11111111-1111-4111-8111-111111111111',
      presetName: '業務用',
      folder: 'C:\\dev\\secret',
      at: 1_700_000_000_000
    } as unknown as LaunchDayCounts
    const usage = usageOf([
      [day(2026, 10, 4), smuggled],
      [day(2026, 10, 3), { preset: 0, manual: 1 }]
    ])
    const written = JSON.parse(JSON.stringify(toLaunchUsageRecord(usage))) as unknown
    expect([...keysOf(written)].sort()).toEqual([
      '<day>',
      'days',
      'manual',
      'preset',
      'schemaVersion'
    ])
    expect(written).toEqual({
      schemaVersion: 1,
      days: {
        '2026-10-03': { preset: 0, manual: 1 },
        '2026-10-04': { preset: 2, manual: 1 }
      }
    })
  })
})
