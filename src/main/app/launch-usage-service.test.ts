import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  parseLocalDayKey,
  type LaunchDayCounts,
  type LaunchUsage,
  type LocalDayKey
} from '@domain/session/launch-usage'

import type { LaunchUsageLoadResult, LaunchUsageStore } from '../infra/settings/launch-usage-store'
import { createLaunchUsageService, type LaunchUsageService } from './launch-usage-service'

afterEach(() => {
  vi.restoreAllMocks()
})

/**
 * 起動の利用記録の service (O-3 BE-042 / spec FR-010・FR-012・FR-013 / SC-005 / 012 data-model §4「書き込み」「ログ」)。
 */

const DAY_MS = 86_400_000
/** 2026-10-04 12:00 UTC (時差 0 で `2026-10-04`)。 */
const T0 = Date.UTC(2026, 9, 4, 12)

function key(value: string): LocalDayKey {
  const parsed = parseLocalDayKey(value)
  if (parsed === null) throw new Error(`bad day ${value}`)
  return parsed
}

function usageOf(entries: Record<string, LaunchDayCounts>): LaunchUsage {
  return { days: new Map(Object.entries(entries).map(([k, v]) => [key(k), v])) }
}

const EMPTY_LOADED: LaunchUsageLoadResult = {
  kind: 'loaded',
  usage: { days: new Map() },
  reasonKeys: [],
  skippedDays: 0
}

interface FakeStore extends LaunchUsageStore {
  readonly saved: LaunchUsage[]
  loads: number
}

/** 書いた記録を次の load で返す store (load の結果と save の振る舞いは差し替えられる)。 */
function fakeStore(
  options: {
    readonly load?: () => Promise<LaunchUsageLoadResult>
    readonly save?: (usage: LaunchUsage) => Promise<void>
  } = {}
): FakeStore {
  const store: FakeStore = {
    saved: [],
    loads: 0,
    async load() {
      store.loads += 1
      return options.load !== undefined ? options.load() : EMPTY_LOADED
    },
    async save(usage) {
      if (options.save !== undefined) await options.save(usage)
      store.saved.push(usage)
    }
  }
  return store
}

function service(
  store: LaunchUsageStore,
  clock: { now: number } = { now: T0 },
  offset = 0
): LaunchUsageService {
  return createLaunchUsageService({
    store,
    now: () => clock.now,
    localOffsetMinutes: () => offset
  })
}

describe('launch-usage-service — 書き込み', () => {
  it('今日 (注入の now と時差のローカルの暦日) の起動元を 1 増やして書き、集計に出す', async () => {
    const store = fakeStore()
    // UTC 2026-10-04 20:00 は UTC+9 で 2026-10-05。
    const svc = service(store, { now: Date.UTC(2026, 9, 4, 20) }, 540)
    await svc.record('preset')
    expect(store.saved.at(-1)?.days.get(key('2026-10-05'))).toEqual({ preset: 1, manual: 0 })
    expect(await svc.summary()).toEqual({ status: 'ok', preset: 1, manual: 0, days: 30 })
  })

  it('並行の 2 回で 2 増える (直列化)', async () => {
    const store = fakeStore({
      // 書き込みに時間がかかる間に次の record が割り込まないことを見る。
      save: () => new Promise((resolve) => setTimeout(resolve, 5))
    })
    const svc = service(store)
    await Promise.all([svc.record('preset'), svc.record('preset'), svc.record('manual')])
    expect(store.saved).toHaveLength(3)
    expect(store.saved.at(-1)?.days.get(key('2026-10-04'))).toEqual({ preset: 2, manual: 1 })
    expect(await svc.summary()).toEqual({ status: 'ok', preset: 2, manual: 1, days: 30 })
  })

  it('書き込みの失敗で回数が増えず (reject もしない)、次の成功で 1 だけ増える', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    let fail = true
    const store = fakeStore({
      save: async () => {
        if (fail) throw Object.assign(new Error('disk full'), { code: 'ENOSPC' })
      }
    })
    const svc = service(store)
    await expect(svc.record('preset')).resolves.toBeUndefined()
    expect(await svc.summary()).toEqual({ status: 'ok', preset: 0, manual: 0, days: 30 })
    fail = false
    await svc.record('preset')
    expect(await svc.summary()).toEqual({ status: 'ok', preset: 1, manual: 0, days: 30 })
  })

  it('注入の now() を先に跳ばして 2 つの日で record を 3 回呼んでも、書いたファイルに跳ぶ前の日が残る (spec Edge Cases)', async () => {
    const before: Record<string, LaunchDayCounts> = {}
    for (let i = 0; i < 30; i += 1) {
      const day = new Date(T0 - i * DAY_MS).toISOString().slice(0, 10)
      before[day] = { preset: 1, manual: 0 }
    }
    const initial = usageOf(before)
    const store = fakeStore({
      load: async () => ({ kind: 'loaded', usage: initial, reasonKeys: [], skippedDays: 0 })
    })
    const clock = { now: T0 + 365 * DAY_MS } // 2027-10-04
    const svc = service(store, clock)
    await svc.record('manual')
    clock.now += DAY_MS // 2027-10-05
    await svc.record('manual')
    await svc.record('preset')

    const written = store.saved.at(-1)
    for (const day of Object.keys(before)) expect(written?.days.has(key(day))).toBe(true)
    expect(written?.days.get(key('2027-10-05'))).toEqual({ preset: 1, manual: 1 })

    // 時計を戻すと、跳ぶ前の 30 日分が集計に出る (跳んだ先の未来の鍵は数えない)。
    clock.now = T0
    expect(await svc.summary()).toEqual({ status: 'ok', preset: 30, manual: 0, days: 30 })
  })
})

describe('launch-usage-service — 読み込みの状態', () => {
  it('読み込み済みは再読しない', async () => {
    const store = fakeStore()
    const svc = service(store)
    await svc.record('preset')
    await svc.summary()
    await svc.record('manual')
    await svc.summary()
    expect(store.loads).toBe(1)
  })

  it('読めない (readFailed) の後は書かず、次の操作で読み直す', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    let fail = true
    const store = fakeStore({
      load: async () =>
        fail ? { kind: 'read-failed', reasonKey: 'read-failed', errorCode: 'EBUSY' } : EMPTY_LOADED
    })
    const svc = service(store)
    await svc.record('preset')
    expect(store.saved).toHaveLength(0)
    expect(await svc.summary()).toEqual({ status: 'unreadable' })
    fail = false
    await svc.record('preset')
    expect(store.saved).toHaveLength(1)
    expect(await svc.summary()).toEqual({ status: 'ok', preset: 1, manual: 0, days: 30 })
    expect(store.loads).toBe(3)
  })

  it('退避の失敗 (backup-failed) も読めないとして扱い、書かずに読み直す', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const store = fakeStore({
      load: async () => ({ kind: 'read-failed', reasonKey: 'backup-failed', errorCode: 'ENOSPC' })
    })
    const svc = service(store)
    await svc.record('manual')
    expect(await svc.summary()).toEqual({ status: 'unreadable' })
    expect(store.saved).toHaveLength(0)
    expect(store.loads).toBe(2)
  })

  it('読めないと記録無しを getLaunchUsage (summary) で区別する', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const unreadable = service(
      fakeStore({ load: async () => ({ kind: 'read-failed', reasonKey: 'read-failed' }) })
    )
    const empty = service(fakeStore())
    expect(await unreadable.summary()).toEqual({ status: 'unreadable' })
    expect(await empty.summary()).toEqual({ status: 'ok', preset: 0, manual: 0, days: 30 })
  })

  it('将来版なら書かず、集計は unreadable。再読もしない', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const store = fakeStore({ load: async () => ({ kind: 'newer-version' }) })
    const svc = service(store)
    await svc.record('preset')
    await svc.record('manual')
    expect(store.saved).toHaveLength(0)
    expect(await svc.summary()).toEqual({ status: 'unreadable' })
    expect(store.loads).toBe(1)
  })

  it('store.load が投げても reject せず、読めないとして扱う', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const store = fakeStore({ load: () => Promise.reject(new Error('boom')) })
    const svc = service(store)
    await expect(svc.record('preset')).resolves.toBeUndefined()
    await expect(svc.summary()).resolves.toEqual({ status: 'unreadable' })
  })
})

describe('launch-usage-service — ログ (data-model §4「ログ」/ Principle V)', () => {
  const SECRET_PATH = 'C:\\Users\\someone\\AppData\\Roaming\\closta\\launch-usage.json'

  it('console.warn の引数にパスと値が出ない (理由キーと errno のコードだけ)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const loads: LaunchUsageLoadResult[] = [
      { kind: 'read-failed', reasonKey: 'read-failed', errorCode: 'EBUSY' },
      { kind: 'read-failed', reasonKey: 'backup-failed', errorCode: 'ENOSPC' },
      {
        kind: 'loaded',
        usage: usageOf({ '2026-10-04': { preset: 12345, manual: 67890 } }),
        reasonKeys: ['invalid-day'],
        skippedDays: 2
      }
    ]
    const store = fakeStore({
      load: async () => loads.shift() ?? EMPTY_LOADED,
      save: async () => {
        throw Object.assign(new Error(`EPERM: operation not permitted, rename '${SECRET_PATH}'`), {
          code: 'EPERM',
          path: SECRET_PATH
        })
      }
    })
    const svc = service(store)
    await svc.summary() // read-failed
    await svc.summary() // backup-failed
    await svc.record('preset') // invalid-day で読み、書き込みに失敗する

    const messages = warn.mock.calls.map((call) => call.map(String).join(' '))
    expect(messages).toEqual([
      '[launch-usage-store] read-failed code=EBUSY',
      '[launch-usage-store] backup-failed code=ENOSPC',
      '[launch-usage-store] reasons=invalid-day',
      '[launch-usage-store] write-failed code=EPERM'
    ])
    for (const message of messages) {
      expect(message).not.toContain('C:\\')
      expect(message).not.toContain('launch-usage.json')
      expect(message).not.toContain('12345')
      expect(message).not.toContain('67890')
      expect(message).not.toContain('2026-10-04')
    }
  })

  it('正常な読み込みと書き込みでは warn を出さない', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const svc = service(fakeStore())
    await svc.record('preset')
    await svc.summary()
    expect(warn).not.toHaveBeenCalled()
  })
})
