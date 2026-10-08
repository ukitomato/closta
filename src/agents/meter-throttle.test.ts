import { describe, expect, it } from 'vitest'

import {
  createMeterThrottle,
  METER_THROTTLE_INTERVAL_MS,
  METER_THROTTLE_MAX_KEYS,
  METER_THROTTLE_SESSION_LIMIT,
  taskThrottleKey,
  THINKING_THROTTLE_KEY,
  toolThrottleKey,
  type MeterThrottle,
  type MeterThrottleClock,
  type MeterThrottleKey
} from './meter-throttle'

/**
 * O-4 BE-041 — 間引き (014 spec SC-004。data-model §2「間引きと後始末」)。偽の時計で回数と順を固定する。
 * 形の外れた `task_id` で鍵を作らないことは、鍵を作る側 (`live-signals.test.ts`。BE-042) が見る。
 */

interface Sent {
  readonly at: number
  readonly key: MeterThrottleKey
  readonly value: number
}

interface FakeTimer {
  readonly at: number
  readonly callback: () => void
}

interface FakeClock {
  readonly clock: MeterThrottleClock
  readonly timerCount: () => number
  readonly setNow: (t: number) => void
  readonly advance: (ms: number) => void
}

/** 偽の時計 (timer は掛けた時刻の順に発火する)。 */
function fakeClock(): FakeClock {
  let now = 0
  let seq = 0
  const timers = new Map<number, FakeTimer>()
  const nextDue = (end: number): [number, FakeTimer] | null => {
    let next: [number, FakeTimer] | null = null
    for (const entry of timers) {
      if (entry[1].at > end) continue
      if (next === null || entry[1].at < next[1].at) next = entry
    }
    return next
  }
  return {
    clock: {
      now: () => now,
      setTimer: (callback: () => void, ms: number): unknown => {
        seq += 1
        timers.set(seq, { at: now + ms, callback })
        return seq
      },
      clearTimer: (handle: unknown): void => {
        timers.delete(handle as number)
      }
    },
    timerCount: (): number => timers.size,
    /** timer を発火させずに時刻だけを進める (同じ時刻に event と timer が重なった場合を作る)。 */
    setNow: (t: number): void => {
      now = t
    },
    /** `ms` だけ進め、その間に来る timer を順に発火させる。 */
    advance: (ms: number): void => {
      const end = now + ms
      for (let next = nextDue(end); next !== null; next = nextDue(end)) {
        timers.delete(next[0])
        now = Math.max(now, next[1].at)
        next[1].callback()
      }
      now = end
    }
  }
}

interface Setup {
  readonly time: FakeClock
  readonly sent: Sent[]
  readonly throttle: MeterThrottle<{ key: MeterThrottleKey; value: number }>
  readonly offer: (key: MeterThrottleKey, value: number) => void
}

function setup(): Setup {
  const time = fakeClock()
  const sent: Sent[] = []
  const throttle = createMeterThrottle<{ key: MeterThrottleKey; value: number }>({
    clock: time.clock,
    send: ({ key, value }) => sent.push({ at: time.clock.now(), key, value })
  })
  const offer = (key: MeterThrottleKey, value: number): void => throttle.offer(key, { key, value })
  return { time, sent, throttle, offer }
}

const tool = (i: number): MeterThrottleKey => toolThrottleKey(`toolu_${i}`)
const task = (i: number): MeterThrottleKey => taskThrottleKey(`task_${i}`)

/** 鍵ごとの送った時刻の間が 1 秒以上か。 */
function expectPerKeyInterval(sent: readonly Sent[]): void {
  const last = new Map<string, number>()
  for (const s of sent) {
    const prev = last.get(s.key)
    if (prev !== undefined) expect(s.at - prev).toBeGreaterThanOrEqual(METER_THROTTLE_INTERVAL_MS)
    last.set(s.key, s.at)
  }
}

/** どの 1 秒の窓にも 20 件以下か。 */
function expectSessionLimit(sent: readonly Sent[]): void {
  for (const s of sent) {
    const inWindow = sent.filter((o) => o.at >= s.at && o.at < s.at + METER_THROTTLE_INTERVAL_MS)
    expect(inWindow.length).toBeLessThanOrEqual(METER_THROTTLE_SESSION_LIMIT)
  }
}

/** 鍵ごとの最後に送った値。 */
function lastValues(sent: readonly Sent[]): Map<string, number> {
  const out = new Map<string, number>()
  for (const s of sent) out.set(s.key, s.value)
  return out
}

describe('meter-throttle — 鍵ごとの間隔 (014 data-model §2)', () => {
  it('鍵ごとに 1 秒に 1 件以下。間隔の中の値は最後の 1 つだけを、次の 1 秒の境で送る', () => {
    const { time, sent, offer } = setup()
    offer(tool(1), 1)
    time.advance(100)
    offer(tool(1), 2)
    time.advance(100)
    offer(tool(1), 3)
    time.advance(700)
    offer(tool(1), 4)
    time.advance(600) // 1500
    offer(tool(1), 5)
    time.advance(2000)
    expect(sent).toEqual([
      { at: 0, key: tool(1), value: 1 },
      { at: 1000, key: tool(1), value: 4 },
      { at: 2000, key: tool(1), value: 5 }
    ])
    expect(time.timerCount()).toBe(0)
  })

  it('thinking と task の鍵も同じ。鍵どうしは互いの間隔を待たない', () => {
    const { time, sent, offer } = setup()
    offer(THINKING_THROTTLE_KEY, 10)
    offer(task(1), 20)
    offer(THINKING_THROTTLE_KEY, 11)
    offer(task(1), 21)
    time.advance(1000)
    expect(sent.map((s) => [s.at, s.key, s.value])).toEqual([
      [0, THINKING_THROTTLE_KEY, 10],
      [0, task(1), 20],
      [1000, THINKING_THROTTLE_KEY, 11],
      [1000, task(1), 21]
    ])
  })

  it('間隔が明けた後の値はすぐ送る', () => {
    const { time, sent, offer } = setup()
    offer(tool(1), 1)
    time.advance(1000)
    offer(tool(1), 2)
    time.advance(1500)
    offer(tool(1), 3)
    expect(sent.map((s) => [s.at, s.value])).toEqual([
      [0, 1],
      [1000, 2],
      [2500, 3]
    ])
  })
})

describe('meter-throttle — セッションあたりの上限 (014 spec SC-004)', () => {
  it('並列の tool N 個の合計が 1 秒に 20 件以下で、最後の値が残らず送られる', () => {
    const { time, sent, offer } = setup()
    const n = 50
    for (let step = 0; step < 50; step += 1) {
      for (let i = 0; i < n; i += 1) offer(tool(i), step)
      time.advance(100)
    }
    time.advance(10_000)
    expectSessionLimit(sent)
    expectPerKeyInterval(sent)
    const last = lastValues(sent)
    for (let i = 0; i < n; i += 1) expect(last.get(tool(i))).toBe(49)
    expect(time.timerCount()).toBe(0)
  })

  it('65 個の鍵 (thinking と 64) が毎秒更新しても、どの鍵も 4 秒以内に送られ、最後の値が残らず送られる', () => {
    const { time, sent, offer } = setup()
    const keys: MeterThrottleKey[] = [
      THINKING_THROTTLE_KEY,
      ...Array.from({ length: METER_THROTTLE_MAX_KEYS }, (_, i) =>
        i % 2 === 0 ? tool(i) : task(i)
      )
    ]
    const seconds = 12
    for (let t = 0; t < seconds; t += 1) {
      for (const key of keys) offer(key, t)
      time.advance(1000)
    }
    time.advance(10_000)
    expectSessionLimit(sent)
    expectPerKeyInterval(sent)
    for (const key of keys) {
      const times = sent.filter((s) => s.key === key).map((s) => s.at)
      expect(times[0]).toBeLessThanOrEqual(4000)
      for (let i = 1; i < times.length; i += 1)
        expect((times[i] ?? 0) - (times[i - 1] ?? 0)).toBeLessThanOrEqual(4000)
      expect(lastValues(sent).get(key)).toBe(seconds - 1)
    }
    expect(time.timerCount()).toBe(0)
  })

  it('枠を待つ保留があるとき、新しく来た鍵の値は列を追い越さない (保留になった時刻の古い順)', () => {
    const { time, sent, offer } = setup()
    for (let i = 0; i < 45; i += 1) offer(tool(i), i) // 20 件をすぐ送り、25 件が枠を待つ
    expect(sent).toHaveLength(20)
    // 枠が空く時刻ちょうどに、timer より先に新しい鍵が来た
    time.setNow(1000)
    offer(tool(99), 99)
    expect(sent.map((s) => s.key)).not.toContain(tool(99))
    time.advance(5000)
    const order = sent.map((s) => s.key)
    expect(order.indexOf(tool(99))).toBeGreaterThan(order.indexOf(tool(44)))
    expect(order.slice(20, 45)).toEqual(Array.from({ length: 25 }, (_, i) => tool(i + 20)))
  })

  it('保留の値を上書きしても順は変えない', () => {
    const { time, sent, offer } = setup()
    for (let i = 0; i < 22; i += 1) offer(tool(i), 0) // tool 20 / 21 が枠を待つ
    offer(tool(20), 1)
    offer(tool(21), 1)
    offer(tool(20), 2)
    time.advance(1000)
    expect(sent.slice(20)).toEqual([
      { at: 1000, key: tool(20), value: 2 },
      { at: 1000, key: tool(21), value: 1 }
    ])
  })
})

describe('meter-throttle — 鍵の寿命と同時に追う鍵の上限 (014 data-model §2)', () => {
  it('64 個の鍵が動いている間の 65 個目の新しい鍵を捨てる (覚えない)', () => {
    const { time, sent, offer } = setup()
    for (let step = 0; step < 6; step += 1) {
      for (let i = 0; i < METER_THROTTLE_MAX_KEYS; i += 1) offer(tool(i), step)
      offer(tool(100), step)
      time.advance(500)
    }
    expect(sent.some((s) => s.key === tool(100))).toBe(false)
    // thinking は上限の対象ではない
    offer(THINKING_THROTTLE_KEY, 1)
    time.advance(10_000)
    expect(sent.some((s) => s.key === THINKING_THROTTLE_KEY)).toBe(true)
    expect(sent.some((s) => s.key === tool(100))).toBe(false)
  })

  it('64 個の鍵が保留なしで 1 秒休んだ後は、65 個目の新しい鍵が通る', () => {
    const { time, sent, offer } = setup()
    for (let i = 0; i < METER_THROTTLE_MAX_KEYS; i += 1) offer(tool(i), 0)
    offer(tool(100), 0)
    time.advance(3000) // 64 件を送り終える (最後は 3000)
    expect(sent).toHaveLength(METER_THROTTLE_MAX_KEYS)
    time.advance(1000)
    offer(tool(100), 1)
    expect(sent.at(-1)).toEqual({ at: 4000, key: tool(100), value: 1 })
  })

  it('外れた鍵に更新が来ても、鍵ごと 1 秒に 1 件を破らない', () => {
    const { time, sent, offer } = setup()
    // 疑似乱数で、上限を超える数の鍵が不規則に更新する
    let seed = 7
    const random = (): number => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31
      return seed / 2 ** 31
    }
    for (let t = 0; t < 20_000; t += 50) {
      const n = Math.floor(random() * 6)
      for (let k = 0; k < n; k += 1) {
        const i = Math.floor(random() * 90)
        offer(i % 3 === 0 ? task(i) : tool(i), t)
      }
      time.advance(50)
    }
    time.advance(10_000)
    expect(sent.length).toBeGreaterThan(0)
    expectPerKeyInterval(sent)
    expectSessionLimit(sent)
  })

  it('鍵が 1 秒休んで外れた後の更新は新しい鍵として受け、すぐ送る (間隔は 1 秒以上)', () => {
    const { time, sent, offer } = setup()
    for (let i = 0; i < METER_THROTTLE_MAX_KEYS; i += 1) offer(tool(i), 0)
    time.advance(4000) // 全部送って 1 秒休む
    offer(tool(100), 1) // 新しい鍵を受ける前に休んだ鍵を外す
    offer(tool(0), 2)
    expect(sent.slice(-2)).toEqual([
      { at: 4000, key: tool(100), value: 1 },
      { at: 4000, key: tool(0), value: 2 }
    ])
    expectPerKeyInterval(sent)
  })
})

describe('meter-throttle — 取り消し (014 data-model §2)', () => {
  it('tool の鍵を 1 つ取り消すと、その保留を送らず、枠が空いて新しい鍵が通る', () => {
    const { time, sent, offer, throttle } = setup()
    for (let i = 0; i < METER_THROTTLE_MAX_KEYS; i += 1) offer(tool(i), 0) // tool 20〜63 は保留
    offer(tool(100), 0)
    throttle.cancelTool('toolu_50')
    offer(tool(100), 1)
    time.advance(10_000)
    expect(sent.some((s) => s.key === tool(50))).toBe(false)
    expect(sent.filter((s) => s.key === tool(100)).map((s) => s.value)).toEqual([1])
  })

  it('全部の tool の鍵の取り消し (result) で枠が空き、task の鍵と保留は残る', () => {
    const { time, sent, offer, throttle } = setup()
    for (let i = 0; i < 32; i += 1) offer(tool(i), 0)
    for (let i = 0; i < 32; i += 1) offer(task(i), 0)
    offer(tool(100), 0)
    expect(sent).toHaveLength(20) // tool 0〜19
    throttle.cancelAllTools()
    offer(tool(100), 1)
    time.advance(10_000)
    expect(sent.filter((s) => s.key.startsWith('tool:') && s.at > 0)).toEqual([
      expect.objectContaining({ key: tool(100), value: 1 })
    ])
    // task の保留は残らず送られる
    for (let i = 0; i < 32; i += 1) expect(lastValues(sent).get(task(i))).toBe(0)
    expect(time.timerCount()).toBe(0)
  })

  it('thinking の保留の取り消し (主ループの assistant / result) の後に、その保留を送らない', () => {
    const { time, sent, offer, throttle } = setup()
    offer(THINKING_THROTTLE_KEY, 1)
    offer(THINKING_THROTTLE_KEY, 2)
    throttle.cancelThinking()
    expect(time.timerCount()).toBe(0)
    time.advance(5000)
    expect(sent.map((s) => s.value)).toEqual([1])
    // 取り消した後も鍵ごとの間隔は保つ
    offer(THINKING_THROTTLE_KEY, 3)
    expect(sent.map((s) => [s.at, s.value])).toEqual([
      [0, 1],
      [5000, 3]
    ])
  })

  it('取り消した tool の保留だけを落とし、他の鍵の保留は送る。保留が無くなれば timer を解く', () => {
    const { time, sent, offer, throttle } = setup()
    offer(tool(1), 1)
    offer(tool(1), 2)
    offer(tool(2), 1)
    offer(tool(2), 2)
    throttle.cancelTool('toolu_1')
    expect(time.timerCount()).toBe(1)
    throttle.cancelTool('toolu_2')
    expect(time.timerCount()).toBe(0)
    throttle.cancelTool('toolu_unknown')
    time.advance(5000)
    expect(sent.map((s) => [s.key, s.value])).toEqual([
      [tool(1), 1],
      [tool(2), 1]
    ])
  })

  it('全部を取り消した (dispose) 後は何も送らず、timer が残らない。何度呼んでもよい', () => {
    const { time, sent, offer, throttle } = setup()
    for (let i = 0; i < 40; i += 1) offer(tool(i), 0)
    offer(task(1), 0)
    offer(task(1), 1)
    offer(THINKING_THROTTLE_KEY, 0)
    offer(THINKING_THROTTLE_KEY, 1)
    const before = sent.length
    expect(time.timerCount()).toBe(1)
    throttle.dispose()
    throttle.dispose()
    expect(time.timerCount()).toBe(0)
    time.advance(10_000)
    offer(tool(1), 9)
    offer(THINKING_THROTTLE_KEY, 9)
    throttle.cancelTool('toolu_1')
    throttle.cancelThinking()
    throttle.cancelAllTools()
    time.advance(10_000)
    expect(sent).toHaveLength(before)
    expect(time.timerCount()).toBe(0)
  })

  it('timer は 1 つだけ掛ける', () => {
    const { time, offer } = setup()
    for (let i = 0; i < 60; i += 1) offer(i % 2 === 0 ? tool(i) : task(i), 0)
    for (let i = 0; i < 60; i += 1) offer(i % 2 === 0 ? tool(i) : task(i), 1)
    expect(time.timerCount()).toBe(1)
    time.advance(500)
    expect(time.timerCount()).toBe(1)
    time.advance(10_000)
    expect(time.timerCount()).toBe(0)
  })
})
