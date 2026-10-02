import { describe, expect, it } from 'vitest'

import { canReserve, countOccupying, MAX_CONCURRENT_SESSIONS } from './concurrency'

describe('canReserve (同時実行数の上限。X-5 FR-005)', () => {
  it('上限は 10 に固定', () => {
    expect(MAX_CONCURRENT_SESSIONS).toBe(10)
  })

  it('占有と予約の和が 10 未満なら予約できる', () => {
    expect(canReserve(0, 0)).toBe(true)
    expect(canReserve(9, 0)).toBe(true)
    expect(canReserve(8, 1)).toBe(true)
  })

  it('占有と予約の和が 10 に達していれば 11 本目は予約できない', () => {
    expect(canReserve(10, 0)).toBe(false)
    expect(canReserve(9, 1)).toBe(false)
    expect(canReserve(0, 10)).toBe(false)
  })
})

describe('countOccupying (枠は claudeAlive で数える。X-5 FR-005)', () => {
  it('生存中だけを数える (引数は claudeAlive だけ — run-state を判定材料にできない形)', () => {
    expect(
      countOccupying([
        { claudeAlive: true },
        { claudeAlive: true },
        { claudeAlive: false },
        { claudeAlive: false }
      ])
    ).toBe(2)
    expect(countOccupying([])).toBe(0)
  })
})
