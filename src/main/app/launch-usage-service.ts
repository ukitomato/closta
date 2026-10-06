import {
  addLaunch,
  EMPTY_LAUNCH_USAGE,
  prune,
  summarizeLaunchUsage,
  toLocalDayKey,
  type LaunchOrigin,
  type LaunchUsage,
  type LaunchUsageSummaryDTO,
  type LocalDayKey
} from '@domain/session/launch-usage'

import type { LaunchUsageStore } from '../infra/settings/launch-usage-store'

/**
 * 起動の利用記録の取り回し (O-3 BE-042 / spec FR-010・FR-012・FR-013 / 012 data-model §4「書き込み」「ログ」)。
 * **状態を持つ調停** — 読み込んだ記録を保持し、I/O (store / 時刻 / 時差) は注入で受ける (AD-023 §5/§7 の
 * `services ✗→ I/O`。`.dependency-cruiser.js` の `services-not-to-io` に実名を足してある)。`preset-service.ts` と同じ構え。
 *
 * | 規則 | 根拠 |
 * |---|---|
 * | 操作を 1 本の Promise の鎖で直列化する (並行の 2 回で 2 増える) | data-model §4 / preset-service の `serialize` |
 * | **書き込みが成功してからメモリを差し替える** (失敗した 1 回は捨てる) | spec FR-012 |
 * | `record()` も `summary()` も reject しない。失敗は理由キーと errno のコードだけを `console.warn` に出す (値・パスを出さない) | spec FR-012 / Principle V |
 * | 読み込みの状態: 読めない・退避の失敗は確定させず次の操作で読み直す。将来版は書き込まない。読み込み済みは再読しない | data-model §4 の表 |
 * | 今日は注入の `now()` と `localOffsetMinutes` から作るローカルの暦日 (renderer の時計を信じない) | research R-05 |
 */

export interface LaunchUsageServiceDeps {
  readonly store: LaunchUsageStore
  readonly now: () => number
  /** その時刻のローカルの時差 (分。UTC より進んでいれば正)。composition root が `-new Date(ms).getTimezoneOffset()` を渡す。 */
  readonly localOffsetMinutes: (epochMs: number) => number
}

export interface LaunchUsageService {
  /** 受け付けた起動を 1 回数える。**reject しない** (失敗は握ってログに出す)。 */
  record(origin: LaunchOrigin): Promise<void>
  /** 直近 30 日の集計。将来版・読めないときは `unreadable`。**reject しない。** */
  summary(): Promise<LaunchUsageSummaryDTO>
}

const LOG_PREFIX = '[launch-usage-store]'

/** errno コードの形 (`EBUSY` など) のときだけ返す。それ以外は出さない。 */
function errnoCode(error: unknown): string {
  const code = (error as { readonly code?: unknown } | null)?.code
  return typeof code === 'string' && /^[A-Z][A-Z0-9_]*$/.test(code) ? code : 'unknown'
}

export function createLaunchUsageService(deps: LaunchUsageServiceDeps): LaunchUsageService {
  const { store, now, localOffsetMinutes } = deps
  let usage: LaunchUsage = EMPTY_LAUNCH_USAGE
  /** `unloaded` は未読込か、読めなかった (次の操作で読み直す)。 */
  let state: 'unloaded' | 'loaded' | 'newer-version' = 'unloaded'
  let queue: Promise<unknown> = Promise.resolve()

  function serialize<T>(task: () => Promise<T>): Promise<T> {
    const run = queue.then(task, task)
    queue = run.catch(() => undefined)
    return run
  }

  async function ensureLoaded(): Promise<void> {
    if (state !== 'unloaded') return
    const result = await store.load().catch((error: unknown) => {
      console.warn(`${LOG_PREFIX} read-failed code=${errnoCode(error)}`)
      return null
    })
    if (result === null) return
    switch (result.kind) {
      case 'read-failed':
        console.warn(`${LOG_PREFIX} ${result.reasonKey} code=${result.errorCode ?? 'unknown'}`)
        return
      case 'newer-version':
        console.warn(`${LOG_PREFIX} schema-version-unknown`)
        usage = EMPTY_LAUNCH_USAGE
        state = 'newer-version'
        return
      case 'loaded':
        if (result.reasonKeys.length > 0) {
          console.warn(`${LOG_PREFIX} reasons=${result.reasonKeys.join(',')}`)
        }
        usage = result.usage
        state = 'loaded'
        return
    }
  }

  function today(): LocalDayKey {
    const ms = now()
    return toLocalDayKey(ms, localOffsetMinutes(ms))
  }

  return {
    record(origin) {
      return serialize(async (): Promise<void> => {
        try {
          await ensureLoaded()
          // 将来版は書き換えない。読めない間は中身を知らないまま上書きしない (その 1 回は捨てる)。
          if (state !== 'loaded') return
          const day = today()
          const next = prune(addLaunch(usage, day, origin), day)
          await store.save(next)
          usage = next
        } catch (error) {
          console.warn(`${LOG_PREFIX} write-failed code=${errnoCode(error)}`)
        }
      })
    },

    summary() {
      return serialize(async (): Promise<LaunchUsageSummaryDTO> => {
        try {
          await ensureLoaded()
          if (state !== 'loaded') return { status: 'unreadable' }
          return summarizeLaunchUsage(usage, today())
        } catch {
          return { status: 'unreadable' }
        }
      })
    }
  }
}
