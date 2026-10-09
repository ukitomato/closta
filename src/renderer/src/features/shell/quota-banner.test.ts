import { describe, expect, it } from 'vitest'

import type { RateLimitType } from '@domain/session/meter'

import type { RateLimitMeter } from '@/features/session/useSessionMeters'

import { formatQuotaResetTime, RATE_LIMIT_TYPE_LABELS, rateLimitTypeLabel } from './labels'
import { quotaBannerView } from './quota-banner'

/**
 * O-4 FE-020 — Quota banner の判定と文の組み立て (014 data-model §4「Quota banner」の 2 つの表 / §5)。
 * 時刻はローカルの日付で組む (書式の「今日」はローカルで決める)。
 */

const NOW = new Date(2026, 9, 8, 10, 0, 0).getTime()
const SAME_DAY_SEC = new Date(2026, 9, 8, 14, 5, 0).getTime() / 1000
const OTHER_DAY_SEC = new Date(2026, 9, 9, 3, 0, 0).getTime() / 1000

function rl(over: Partial<RateLimitMeter> = {}): RateLimitMeter {
  return {
    type: 'rate-limit',
    status: 'allowed_warning',
    limitType: 'five_hour',
    utilizationPct: 80,
    resetsAtSec: SAME_DAY_SEC,
    usingOverage: false,
    ...over
  }
}

const WAIT = /待ってから送ってください/

describe('出すか (014 data-model §4)', () => {
  it('rateLimit が null・allowed なら出さない', () => {
    expect(quotaBannerView(null, { terminal: false, nowMs: NOW })).toBeNull()
    expect(quotaBannerView(rl({ status: 'allowed' }), { terminal: false, nowMs: NOW })).toBeNull()
    expect(quotaBannerView(rl({ status: 'allowed' }), { terminal: true, nowMs: NOW })).toBeNull()
  })

  it('解除の時刻の 1 ms 前なら出し、ちょうどと過ぎた後は出さない', () => {
    for (const status of ['allowed_warning', 'rejected'] as const) {
      const r = rl({ status })
      const at = SAME_DAY_SEC * 1000
      expect(quotaBannerView(r, { terminal: false, nowMs: at - 1 })).not.toBeNull()
      expect(quotaBannerView(r, { terminal: false, nowMs: at })).toBeNull()
      expect(quotaBannerView(r, { terminal: false, nowMs: at + 60_000 })).toBeNull()
    }
  })

  it('解除の時刻が無ければ、いつでも出す', () => {
    expect(
      quotaBannerView(rl({ resetsAtSec: null }), { terminal: false, nowMs: NOW * 2 })
    ).not.toBeNull()
  })
})

describe('見た目と文の組み合わせ (status 2 × terminal 2 × 時刻の有無)', () => {
  it.each([
    [
      'allowed_warning',
      false,
      true,
      'notice',
      'status',
      ['5 時間の利用が 80% に達しました。', '14:05 にリセットされます。']
    ],
    [
      'allowed_warning',
      true,
      true,
      'notice',
      'status',
      ['5 時間の利用が 80% に達しました。', '14:05 にリセットされます。']
    ],
    ['allowed_warning', false, false, 'notice', 'status', ['5 時間の利用が 80% に達しました。']],
    ['allowed_warning', true, false, 'notice', 'status', ['5 時間の利用が 80% に達しました。']],
    [
      'rejected',
      false,
      true,
      'warning',
      'alert',
      ['5 時間の上限に達しました。', '14:05 のリセットまで待ってから送ってください。']
    ],
    [
      'rejected',
      false,
      false,
      'warning',
      'alert',
      ['5 時間の上限に達しました。', 'しばらく待ってから送ってください。']
    ],
    [
      'rejected',
      true,
      true,
      'warning',
      'status',
      ['5 時間の上限に達しました。', '14:05 にリセットされます。']
    ],
    ['rejected', true, false, 'warning', 'status', ['5 時間の上限に達しました。']]
  ] as const)(
    '%s / terminal=%s / 時刻あり=%s → %s・role=%s',
    (status, terminal, withTime, tone, role, sentences) => {
      const view = quotaBannerView(rl({ status, resetsAtSec: withTime ? SAME_DAY_SEC : null }), {
        terminal,
        nowMs: NOW
      })
      expect(view).toEqual({ tone, role, sentences })
    }
  )

  it('allowed_warning は時刻の有無と terminal によらず待つ案内を含まない', () => {
    for (const terminal of [false, true]) {
      for (const resetsAtSec of [SAME_DAY_SEC, null]) {
        const view = quotaBannerView(rl({ resetsAtSec, usingOverage: true }), {
          terminal,
          nowMs: NOW
        })
        expect(view?.sentences.join('')).not.toMatch(WAIT)
      }
    }
  })

  it('rejected で terminal なら待つ案内を含まず role は status (失敗の表示と逆の操作を案内しない)', () => {
    for (const resetsAtSec of [SAME_DAY_SEC, null]) {
      const view = quotaBannerView(rl({ status: 'rejected', resetsAtSec }), {
        terminal: true,
        nowMs: NOW
      })
      expect(view?.role).toBe('status')
      expect(view?.tone).toBe('warning')
      expect(view?.sentences.join('')).not.toMatch(WAIT)
    }
  })
})

describe('文の中身', () => {
  it('utilizationPct が null なら quotaWarningNoPct ({n} と % が残らない)', () => {
    const view = quotaBannerView(rl({ utilizationPct: null }), { terminal: false, nowMs: NOW })
    expect(view?.sentences[0]).toBe('5 時間の上限に近づいています。')
    expect(view?.sentences.join('')).not.toMatch(/[{}%]/)
  })

  it('割合は切り捨てる (上限の前に 100% と出さない)', () => {
    expect(
      quotaBannerView(rl({ utilizationPct: 99.6 }), { terminal: false, nowMs: NOW })?.sentences[0]
    ).toBe('5 時間の利用が 99% に達しました。')
  })

  it('usingOverage の文は状態の文と時刻の文の間', () => {
    expect(
      quotaBannerView(rl({ usingOverage: true }), { terminal: false, nowMs: NOW })?.sentences
    ).toEqual([
      '5 時間の利用が 80% に達しました。',
      '超過分を使っています。',
      '14:05 にリセットされます。'
    ])
    expect(
      quotaBannerView(rl({ status: 'rejected', usingOverage: true }), {
        terminal: false,
        nowMs: NOW
      })?.sentences
    ).toEqual([
      '5 時間の上限に達しました。',
      '超過分を使っています。',
      '14:05 のリセットまで待ってから送ってください。'
    ])
  })

  it('別の日の解除の時刻は M/d HH:mm', () => {
    expect(
      quotaBannerView(rl({ resetsAtSec: OTHER_DAY_SEC }), { terminal: false, nowMs: NOW })
        ?.sentences[1]
    ).toBe('10/9 03:00 にリセットされます。')
  })

  it.each([
    ['five_hour', '5 時間'],
    ['seven_day', '7 日'],
    ['seven_day_opus', '7 日 (Opus)'],
    ['seven_day_sonnet', '7 日 (Sonnet)'],
    ['seven_day_overage_included', '7 日 (超過分を含む)'],
    ['overage', '超過分']
  ] as const)('limitType %s → %s', (limitType: RateLimitType, label) => {
    expect(RATE_LIMIT_TYPE_LABELS[limitType]).toBe(label)
    expect(
      quotaBannerView(rl({ status: 'rejected', limitType }), { terminal: true, nowMs: NOW })
        ?.sentences[0]
    ).toBe(`${label}の上限に達しました。`)
  })

  it('limitType が null・知らない値・prototype のキーなら「利用枠」', () => {
    expect(
      quotaBannerView(rl({ status: 'rejected', limitType: null }), { terminal: true, nowMs: NOW })
        ?.sentences[0]
    ).toBe('利用枠の上限に達しました。')
    for (const unknown of ['ten_minute', 'toString', '__proto__', 'constructor']) {
      expect(rateLimitTypeLabel(unknown)).toBe('利用枠')
    }
  })
})

describe('Invalid Date で例外を出さない', () => {
  it('書式にできない解除の時刻は「時刻なし」と同じ', () => {
    const huge = rl({ status: 'rejected', resetsAtSec: 1e300 })
    expect(() => quotaBannerView(huge, { terminal: false, nowMs: NOW })).not.toThrow()
    expect(quotaBannerView(huge, { terminal: false, nowMs: NOW })?.sentences).toEqual([
      '5 時間の上限に達しました。',
      'しばらく待ってから送ってください。'
    ])
    expect(() =>
      quotaBannerView(rl({ resetsAtSec: Number.NaN }), { terminal: false, nowMs: NOW })
    ).not.toThrow()
    expect(() => quotaBannerView(rl(), { terminal: false, nowMs: Number.NaN })).not.toThrow()
  })

  it('formatQuotaResetTime は Invalid Date で null', () => {
    expect(formatQuotaResetTime(Number.NaN, NOW)).toBeNull()
    expect(formatQuotaResetTime(1e303, NOW)).toBeNull()
    expect(formatQuotaResetTime(SAME_DAY_SEC * 1000, Number.NaN)).toBeNull()
    expect(formatQuotaResetTime(SAME_DAY_SEC * 1000, NOW)).toBe('14:05')
  })
})
