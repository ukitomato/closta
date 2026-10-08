/**
 * 実行中の進み具合の間引き (O-4 / 014 spec SC-004。
 * [data-model](../../specs/014-ui-metering-and-limits/data-model.md) §2「間引きと後始末」が正本)。
 *
 * セッションスレッドの `live-signals.ts` が `run()` の closure の中で 1 つ作る (module スコープに置かない)。
 * SDK も Electron も import しない。時計と timer は注入する (単体は偽の時計で測る)。
 *
 * | 規則 | 根拠 |
 * |---|---|
 * | 鍵 (`thinking`・`tool:<toolUseId>`・`task:<taskId>`) ごとに 1 秒に 1 回。間隔の中の値は最後の 1 つだけを持ち、次の 1 秒の境で送る | data-model §2 |
 * | セッションあたり、直近 1 秒に 20 件まで。超えた分は保留し、次の境で最新の値を送る | data-model §2 / SC-004 |
 * | 保留から送る順は、間隔の明けた鍵のうち、保留になった時刻の古い順。上書きしても順は変えない。枠を待つ保留があるときは、新しく来た値も列の末尾に並べる (追い越さない) | data-model §2 (飢える鍵を作らない) |
 * | tool と task の鍵は、保留が無く最後に送ってから 1 秒を過ぎたら外す。外す判定は新しい鍵を受ける前に行う (外すための timer を置かない) | data-model §2「鍵の寿命」 |
 * | 同時に追う tool と task の鍵は、外した後の数で 64 まで。埋まっているときの新しい鍵の更新は捨てる (覚えない) | data-model §2「同時に追う鍵の上限」 |
 * | 鍵が持つのは保留の値・最後に送った時刻だけ (task の状態を持たない) | spec FR-013 / AD-044 Decision 6 |
 * | 取り消し (tool の鍵 1 つ・`thinking` の保留・全部の tool の鍵・全部) の後に、取り消した保留を送らない。`dispose` の後は何も送らず timer も残さない | data-model §2 の取り消し / SC-004 |
 */

/** 鍵ごとの間隔 (ms)。 */
export const METER_THROTTLE_INTERVAL_MS = 1000
/** セッションあたり、直近 1 秒に送る件数の上限。 */
export const METER_THROTTLE_SESSION_LIMIT = 20
/** 同時に追う tool と task の鍵の上限。 */
export const METER_THROTTLE_MAX_KEYS = 64

/** 思考のトークン数の鍵 (1 つだけ)。tool / task の鍵の寿命と上限の対象にしない。 */
export const THINKING_THROTTLE_KEY = 'thinking'

export type MeterThrottleKey = typeof THINKING_THROTTLE_KEY | `tool:${string}` | `task:${string}`

const TOOL_KEY_PREFIX = 'tool:'

/** tool の経過時間の鍵 (`toolUseId` は呼ぶ側が形を検証した値)。 */
export function toolThrottleKey(toolUseId: string): MeterThrottleKey {
  return `tool:${toolUseId}`
}

/** task の進み具合の鍵 (`taskId` は呼ぶ側が形を検証した値)。 */
export function taskThrottleKey(taskId: string): MeterThrottleKey {
  return `task:${taskId}`
}

/** 時計と timer (`live-signals` の `LiveSignalsClock` と同じ形)。 */
export interface MeterThrottleClock {
  readonly now: () => number
  readonly setTimer: (callback: () => void, ms: number) => unknown
  readonly clearTimer: (handle: unknown) => void
}

export interface MeterThrottleDeps<T> {
  readonly clock: MeterThrottleClock
  /** 間引いた値を送る (`live-signals` の `send`)。 */
  readonly send: (value: T) => void
}

export interface MeterThrottle<T> {
  /** 鍵の新しい値。送れるならすぐ送り、送れなければ保留する (保留があれば上書きする)。 */
  offer(key: MeterThrottleKey, value: T): void
  /** tool の鍵 1 つを保留ごと外す (`user` の `tool_result`)。 */
  cancelTool(toolUseId: string): void
  /** `thinking` の保留を捨てる (主ループの assistant と result)。 */
  cancelThinking(): void
  /** 全部の tool の鍵を保留ごと外す (result。task の鍵は残す)。 */
  cancelAllTools(): void
  /** 全部の鍵・保留・timer を捨て、以後は何も送らない (`finish()` の最初)。何度呼んでもよい。 */
  dispose(): void
}

interface KeyState<T> {
  /** 最後に送った時刻 (まだ送っていなければ null)。 */
  lastSentAt: number | null
  /** 保留の値 (無ければ null)。 */
  pending: { value: T } | null
}

export function createMeterThrottle<T>(deps: MeterThrottleDeps<T>): MeterThrottle<T> {
  const { clock } = deps
  const keys = new Map<string, KeyState<T>>()
  /** 保留のある鍵 (保留になった時刻の古い順)。 */
  const queue: string[] = []
  /** 直近 1 秒に送った時刻 (古い順)。 */
  const sentAt: number[] = []
  let timer: unknown = null
  let timerAt: number | null = null
  let disposed = false

  const isLimited = (key: string): boolean => key !== THINKING_THROTTLE_KEY
  const intervalElapsed = (state: KeyState<T>, now: number): boolean =>
    state.lastSentAt === null || now - state.lastSentAt >= METER_THROTTLE_INTERVAL_MS

  /** 直近 1 秒に送れる残りの件数。 */
  const budget = (now: number): number => {
    while (sentAt.length > 0 && now - (sentAt[0] ?? now) >= METER_THROTTLE_INTERVAL_MS)
      sentAt.shift()
    return METER_THROTTLE_SESSION_LIMIT - sentAt.length
  }

  const emit = (state: KeyState<T>, value: T, now: number): void => {
    state.lastSentAt = now
    sentAt.push(now)
    deps.send(value)
  }

  const dequeue = (key: string): void => {
    const index = queue.indexOf(key)
    if (index >= 0) queue.splice(index, 1)
  }

  /** 間隔の明けた保留を、保留になった時刻の古い順に枠まで送る。 */
  const flush = (now: number): void => {
    let left = budget(now)
    let i = 0
    while (i < queue.length && left > 0) {
      const key = queue[i] ?? ''
      const state = keys.get(key)
      if (state === undefined || state.pending === null) {
        queue.splice(i, 1)
        continue
      }
      if (!intervalElapsed(state, now)) {
        i += 1
        continue
      }
      const { value } = state.pending
      state.pending = null
      queue.splice(i, 1)
      emit(state, value, now)
      left -= 1
    }
  }

  const clearScheduled = (): void => {
    if (timer !== null) clock.clearTimer(timer)
    timer = null
    timerAt = null
  }

  /** 次に保留を送れる時刻に timer を 1 つだけ掛ける (保留が無ければ解く)。 */
  const schedule = (now: number): void => {
    if (disposed || queue.length === 0) {
      clearScheduled()
      return
    }
    let wake = Number.POSITIVE_INFINITY
    for (const key of queue) {
      const lastSentAt = keys.get(key)?.lastSentAt ?? null
      wake = Math.min(wake, lastSentAt === null ? now : lastSentAt + METER_THROTTLE_INTERVAL_MS)
    }
    if (budget(now) <= 0) wake = Math.max(wake, (sentAt[0] ?? now) + METER_THROTTLE_INTERVAL_MS)
    if (timer !== null && timerAt === wake) return
    clearScheduled()
    timerAt = wake
    timer = clock.setTimer(onTimer, Math.max(0, wake - now))
  }

  function onTimer(): void {
    timer = null
    timerAt = null
    if (disposed) return
    const now = clock.now()
    flush(now)
    schedule(now)
  }

  /** 保留が無く、最後に送ってから 1 秒を過ぎた tool / task の鍵を外す。 */
  const sweep = (now: number): void => {
    for (const [key, state] of keys) {
      if (!isLimited(key) || state.pending !== null || state.lastSentAt === null) continue
      if (now - state.lastSentAt >= METER_THROTTLE_INTERVAL_MS) keys.delete(key)
    }
  }

  const limitedCount = (): number => {
    let n = 0
    for (const key of keys.keys()) if (isLimited(key)) n += 1
    return n
  }

  /** `offer` の本体 (送るか保留するか。timer は呼ぶ側が掛け直す)。 */
  const accept = (key: MeterThrottleKey, value: T, now: number): void => {
    let state = keys.get(key)
    if (state === undefined) {
      if (isLimited(key)) {
        sweep(now)
        // 埋まっているときの新しい鍵は捨てる (動いている鍵を追い出さない)。
        if (limitedCount() >= METER_THROTTLE_MAX_KEYS) return
      }
      state = { lastSentAt: null, pending: null }
      keys.set(key, state)
    }
    if (state.pending !== null) {
      // 上書きしても列の順は変えない。
      state.pending.value = value
      return
    }
    // 枠が残っていれば、枠を待つ保留は無い (直前の `flush` が先に送った) ので追い越さない。
    if (intervalElapsed(state, now) && budget(now) > 0) {
      emit(state, value, now)
      return
    }
    state.pending = { value }
    queue.push(key)
  }

  return {
    offer(key, value) {
      if (disposed) return
      const now = clock.now()
      flush(now)
      accept(key, value, now)
      schedule(now)
    },
    cancelTool(toolUseId) {
      if (disposed) return
      const key = toolThrottleKey(toolUseId)
      if (!keys.delete(key)) return
      dequeue(key)
      schedule(clock.now())
    },
    cancelThinking() {
      if (disposed) return
      const state = keys.get(THINKING_THROTTLE_KEY)
      if (state === undefined || state.pending === null) return
      state.pending = null
      dequeue(THINKING_THROTTLE_KEY)
      schedule(clock.now())
    },
    cancelAllTools() {
      if (disposed) return
      let removed = false
      for (const key of [...keys.keys()]) {
        if (!key.startsWith(TOOL_KEY_PREFIX)) continue
        keys.delete(key)
        removed = true
      }
      if (!removed) return
      for (let i = queue.length - 1; i >= 0; i -= 1)
        if ((queue[i] ?? '').startsWith(TOOL_KEY_PREFIX)) queue.splice(i, 1)
      schedule(clock.now())
    },
    dispose() {
      disposed = true
      keys.clear()
      queue.length = 0
      sentAt.length = 0
      clearScheduled()
    }
  }
}
