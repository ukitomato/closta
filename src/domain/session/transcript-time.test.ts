import { afterEach, describe, expect, it, vi } from 'vitest'

import { parseMessageTime } from './transcript-time'

const NOW = Date.parse('2026-10-16T12:00:00Z')
const DAY = 86_400_000

describe('parseMessageTime', () => {
  it.each([
    ['2026-10-16T01:23:45.678Z', Date.parse('2026-10-16T01:23:45.678Z')],
    ['2026-10-16T10:23:45+09:00', Date.parse('2026-10-16T01:23:45Z')],
    ['2026-10-16T01:23Z', Date.parse('2026-10-16T01:23:00Z')],
    ['2026-10-16T01:23:45.123456789Z', Date.parse('2026-10-16T01:23:45.123Z')]
  ])('accepts %s', (raw, expected) => {
    expect(parseMessageTime(raw, NOW)).toBe(expected)
  })

  it.each([
    ['date only', '2026-10-16'],
    ['no timezone', '2026-10-16T01:23:45'],
    ['leading space', ' 2026-10-16T01:23:45Z'],
    ['before 2020', '2019-12-31T23:59:59Z'],
    ['number', 1760000000000],
    ['41 chars', '2026-10-16T01:23:45.123456789Z' + '0'.repeat(11)],
    ['null', null],
    ['undefined', undefined],
    ['object', {}],
    ['nonexistent date', '2026-02-30T00:00:00Z'],
    ['hour 25', '2026-10-16T25:00:00Z']
  ])('rejects %s', (_name, raw) => {
    expect(parseMessageTime(raw, NOW)).toBeNull()
  })

  it('rejects now + 1 day + 1 ms and accepts now + 1 day', () => {
    const now = Date.parse('2026-10-16T12:00:00.000Z')
    expect(parseMessageTime(new Date(now + DAY).toISOString(), now)).toBe(now + DAY)
    expect(parseMessageTime(new Date(now + DAY + 1).toISOString(), now)).toBeNull()
  })

  it('accepts exactly 2020-01-01T00:00:00Z', () => {
    expect(parseMessageTime('2020-01-01T00:00:00Z', NOW)).toBe(1_577_836_800_000)
    expect(parseMessageTime('2019-12-31T23:59:59.999Z', NOW)).toBeNull()
  })

  describe('clock', () => {
    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('does not read Date.now', () => {
      const spy = vi.spyOn(Date, 'now').mockImplementation(() => {
        throw new Error('clock read')
      })
      expect(parseMessageTime('2026-10-16T01:23:45Z', NOW)).toBe(Date.parse('2026-10-16T01:23:45Z'))
      expect(spy).not.toHaveBeenCalled()
    })
  })
})
