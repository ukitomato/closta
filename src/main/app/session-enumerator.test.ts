import { afterEach, describe, expect, it, vi } from 'vitest'

import { okResponse } from '@agents/protocol'
import { wslNamespace, type WslNamespaceId } from '@domain/runtime/namespace'
import { makeHostPath, makeRuntimePath } from '@domain/runtime/path-types'
import {
  BROWSE_SESSION_TTL_MS,
  createVerifiedRunning,
  type VerifiedRunning
} from '@domain/runtime/verified-running'
import type { EnumerationRequest } from '@domain/session/interfaces'
import { enumerationTargetKey, type EnumerationTarget } from '@domain/session/target'

import {
  buildRequestLine,
  checkLaunchAllowed,
  createSessionEnumerator,
  type EnumerationWorker,
  type EnumerationWorkerLauncher,
  type SessionEnumeratorDeps
} from './session-enumerator'

/**
 * BE-025c — 起動ゲート・要求の組み立て・方針のユニットテスト
 * (SC-002 / SC-016 / C-5 / C-6 / AD-030)。
 *
 * **Electron を立てない。** 子プロセスを起こす層は `enumerator-spawner.ts` に
 * 分けてあるため、方針だけをモックゼロに近い形で検証できる。
 */

const NOW = 1_700_000_000_000
const UBUNTU: WslNamespaceId = wslNamespace('Ubuntu')
const DEBIAN: WslNamespaceId = wslNamespace('Debian')

function hostTarget(ordinal = 0): EnumerationTarget {
  const configDir = makeHostPath('C:\\Users\\y\\.claude')
  if (!configDir.ok) throw new Error('テストの前提が壊れている')
  return {
    key: enumerationTargetKey({ kind: 'windows' }, ordinal),
    location: { kind: 'windows' },
    configDir: configDir.path,
    origin: 'default',
    label: 'y'
  }
}

function wslTarget(namespace: WslNamespaceId, distroName: string): EnumerationTarget {
  const configDir = makeRuntimePath(namespace, '/home/y/.claude')
  if (!configDir.ok) throw new Error('テストの前提が壊れている')
  const location = { kind: 'wsl', distroName } as const
  return {
    key: enumerationTargetKey(location, 0),
    location,
    configDir: configDir.path,
    origin: 'default',
    label: 'y'
  }
}

function request(
  target: EnumerationTarget,
  verified: VerifiedRunning | null = null,
  overrides: Partial<EnumerationRequest> = {}
): EnumerationRequest {
  return { target, scope: { kind: 'all' }, timeoutMs: 5_000, verified, now: NOW, ...overrides }
}

/** 常駐プロセスの代役。**実プロセスを起こさない。** */
interface FakeWorker extends EnumerationWorker {
  /** 届いた要求の行。 */
  readonly received: string[]
  /** 応答を 1 行返す。 */
  respond(line: string): void
  /** 落ちたことにする。 */
  crash(code?: number | null): void
  readonly killCount: () => number
  readonly sendFails: (fail: boolean) => void
  /**
   * `kill()` 後の `exit` を保留する (pr-gate Round 1 / platform-boundary H-003)。
   *
   * 実 API の `exit` は**後の tick で届く**。その遅れの中で次のワーカが起きるため、
   * 「旧ワーカの exit が現行ワーカを潰す」順序が生まれる。
   * 保留できないとこの順序を再現できない。
   */
  readonly holdExit: (hold: boolean) => void
  /** 保留していた `exit` を届ける。 */
  readonly flushExit: () => void
}

function fakeWorker(): FakeWorker {
  let onLine: ((line: string) => void) | null = null
  let onExit: ((code: number | null) => void) | null = null
  let kills = 0
  let fail = false
  let hold = false
  let held = 0
  const received: string[] = []

  return {
    received,
    onLine(listener) {
      onLine = listener
    },
    onExit(listener) {
      onExit = listener
    },
    send(line) {
      if (fail) return false
      received.push(line)
      return true
    },
    kill() {
      kills += 1
      /*
       * **実 API に合わせて `exit` を発火する** (pr-gate Round 1 / platform-boundary H-003)。
       *
       * `UtilityProcess.kill()` は `exit` イベントを出す。
       * 代役が出さなかったため、**timeout → kill → 遅れて届く exit** という順序が
       * 1 度もテストを通らず、以下の 2 つの欠陥が見つからなかった。
       *
       * - 旧ワーカの `exit` が現行ワーカの参照を捨て、実行中の要求を巻き添えで失敗させる
       * - timeout が crash に数えられ、3 回で列挙が恒久停止する
       *
       * **代役が実 API と乖離していると、その差の中にある欠陥は構造的に見つからない。**
       * transport の事故 (経路が 2 本あることが代役に現れなかった) と同じ形である。
       *
       * **非同期で出す。** 実 API と同じく後の tick で届く形にしないと、
       * 「同期で `worker = null` した直後に exit が来る」順序を再現できない。
       */
      if (hold) held += 1
      else queueMicrotask(() => onExit?.(0))
      return true
    },
    respond(line) {
      onLine?.(line)
    },
    crash(code = 1) {
      onExit?.(code)
    },
    killCount: () => kills,
    sendFails: (value) => {
      fail = value
    },
    holdExit: (value) => {
      hold = value
    },
    flushExit: () => {
      while (held > 0) {
        held -= 1
        onExit?.(0)
      }
    }
  }
}

interface FakeLauncher extends EnumerationWorkerLauncher {
  readonly workers: FakeWorker[]
  readonly envs: Record<string, string>[]
}

/**
 * 要求が届いたら自動で応答する代役。
 *
 * **`respond` を渡さなければ応答しない** — timeout の経路を試すため。
 */
function fakeLauncher(auto: boolean = true): FakeLauncher {
  const workers: FakeWorker[] = []
  const envs: Record<string, string>[] = []
  return {
    workers,
    envs,
    launch(env) {
      const worker = fakeWorker()
      workers.push(worker)
      envs.push(env)
      if (!auto) return worker

      const send = worker.send.bind(worker)
      worker.send = (line) => {
        const written = send(line)
        if (written) {
          const parsed = JSON.parse(line) as { id: number; targetKey: string }
          queueMicrotask(() =>
            worker.respond(JSON.stringify(okResponse(parsed.id, parsed.targetKey, [], false)))
          )
        }
        return written
      }
      return worker
    }
  }
}

function deps(
  launcher: EnumerationWorkerLauncher,
  wait: (ms: number) => Promise<void> = async () => {}
): SessionEnumeratorDeps {
  return { launcher, wait, now: () => NOW, parentEnv: { SystemRoot: 'C:\\Windows' } }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('buildRequestLine', () => {
  it('config ディレクトリを要求に載せる (AD-030 §2)', () => {
    const line = buildRequestLine(1, request(hostTarget()), 'C:\\Users\\y\\.claude')

    expect(line).toMatchObject({
      kind: 'enumerate',
      id: 1,
      targetKey: 'host#0',
      configDir: 'C:\\Users\\y\\.claude',
      scope: { kind: 'all' }
    })
  })

  it('先頭ページの範囲をそのまま運ぶ', () => {
    const line = buildRequestLine(
      2,
      request(hostTarget(), null, { scope: { kind: 'page', limit: 50, offset: 100 } }),
      'C:\\x'
    )

    expect(line.scope).toEqual({ kind: 'page', limit: 50, offset: 100 })
  })
})

describe('checkLaunchAllowed', () => {
  it('所在が windows なら確認済みの値を要求しない', () => {
    expect(checkLaunchAllowed(request(hostTarget()))).toBeNull()
  })

  it('確認済みの値が無い wsl の要求を拒否する (FR-008 / SC-002)', () => {
    expect(checkLaunchAllowed(request(wslTarget(UBUNTU, 'Ubuntu')))).toBe('distro-not-running')
  })

  it('期限切れの確認済みの値を拒否する', () => {
    const stale = createVerifiedRunning(UBUNTU, NOW - BROWSE_SESSION_TTL_MS - 1)

    expect(checkLaunchAllowed(request(wslTarget(UBUNTU, 'Ubuntu'), stale))).toBe(
      'distro-not-running'
    )
  })

  it('別ディストロの確認済みの値を拒否する', () => {
    const other = createVerifiedRunning(DEBIAN, NOW)

    expect(checkLaunchAllowed(request(wslTarget(UBUNTU, 'Ubuntu'), other))).toBe(
      'distro-not-running'
    )
  })

  it('期限内で同じディストロなら許す', () => {
    const ok = createVerifiedRunning(UBUNTU, NOW)

    expect(checkLaunchAllowed(request(wslTarget(UBUNTU, 'Ubuntu'), ok))).toBeNull()
  })
})

describe('createSessionEnumerator', () => {
  it('停止中の所在に対して要求を出さない (SC-002)', async () => {
    const launcher = fakeLauncher()
    const enumerator = createSessionEnumerator(deps(launcher))

    const result = await enumerator.enumerate(request(wslTarget(UBUNTU, 'Ubuntu')))

    expect(result).toEqual({ ok: false, reasonKey: 'distro-not-running' })
    expect(launcher.workers).toHaveLength(0)
  })

  it('プロセスは 1 つだけ起こす (AD-030 §1)', async () => {
    const launcher = fakeLauncher()
    const enumerator = createSessionEnumerator(deps(launcher))

    await enumerator.enumerate(request(hostTarget(0)))
    await enumerator.enumerate(request(hostTarget(1)))
    await enumerator.enumerate(request(hostTarget(2)))

    expect(launcher.workers).toHaveLength(1)
    expect(launcher.workers[0].received).toHaveLength(3)
  })

  it('先に起こしておける (AD-030 §6)', () => {
    const launcher = fakeLauncher()
    const enumerator = createSessionEnumerator(deps(launcher))

    enumerator.warmUp()

    expect(launcher.workers).toHaveLength(1)
  })

  it('許可リストの環境変数だけを渡す (SC-016)', async () => {
    const launcher = fakeLauncher()
    const enumerator = createSessionEnumerator({
      ...deps(launcher),
      parentEnv: { SystemRoot: 'C:\\Windows', ANTHROPIC_API_KEY: 'secret' }
    })

    await enumerator.enumerate(request(hostTarget()))

    expect(launcher.envs[0]).not.toHaveProperty('ANTHROPIC_API_KEY')
    expect(launcher.envs[0]).toEqual({ SystemRoot: 'C:\\Windows' })
  })

  it('**config ディレクトリを環境変数に載せない** (AD-030 §2)', async () => {
    const launcher = fakeLauncher()
    const enumerator = createSessionEnumerator(deps(launcher))

    await enumerator.enumerate(request(hostTarget()))

    expect(launcher.envs[0]).not.toHaveProperty('CLAUDE_CONFIG_DIR')
    // 代わりに要求の行に載る。
    expect(launcher.workers[0].received[0]).toContain('.claude')
  })

  it('要求を 2 件重ねて送らない (AD-030 §3 のレース対策)', async () => {
    const launcher = fakeLauncher(false)
    const enumerator = createSessionEnumerator(deps(launcher))

    const a = enumerator.enumerate(request(hostTarget(0)))
    const b = enumerator.enumerate(request(hostTarget(1)))
    await Promise.resolve()
    await Promise.resolve()

    // **1 件だけ届いている。** 2 件目は応答を待っている。
    expect(launcher.workers[0].received).toHaveLength(1)

    const worker = launcher.workers[0]
    const first = JSON.parse(worker.received[0]) as { id: number; targetKey: string }
    worker.respond(JSON.stringify(okResponse(first.id, first.targetKey, [], false)))
    await a

    await Promise.resolve()
    await Promise.resolve()
    expect(worker.received).toHaveLength(2)

    const second = JSON.parse(worker.received[1]) as { id: number; targetKey: string }
    worker.respond(JSON.stringify(okResponse(second.id, second.targetKey, [], false)))
    await expect(b).resolves.toMatchObject({ ok: true })
  })

  it('同じ対象への並行要求を束ねる (C-6)', async () => {
    const launcher = fakeLauncher()
    const enumerator = createSessionEnumerator(deps(launcher))

    const [a, b] = await Promise.all([
      enumerator.enumerate(request(hostTarget())),
      enumerator.enumerate(request(hostTarget()))
    ])

    expect(launcher.workers[0].received).toHaveLength(1)
    expect(a).toEqual(b)
  })

  it('逐次の連打に最小間隔を掛ける (C-6)', async () => {
    const waited: number[] = []
    const launcher = fakeLauncher()
    const enumerator = createSessionEnumerator(
      deps(launcher, async (ms) => {
        waited.push(ms)
      })
    )

    await enumerator.enumerate(request(hostTarget()))
    await enumerator.enumerate(request(hostTarget()))

    expect(waited).toHaveLength(1)
    expect(waited[0]).toBeGreaterThan(0)
  })

  it('識別子が違う応答を採らない (取り違えの検出)', async () => {
    vi.useFakeTimers()
    const launcher = fakeLauncher(false)
    const enumerator = createSessionEnumerator(deps(launcher))

    const promise = enumerator.enumerate(request(hostTarget(), null, { timeoutMs: 100 }))
    await vi.advanceTimersByTimeAsync(1)
    launcher.workers[0].respond(JSON.stringify(okResponse(999, 'host#0', [], false)))
    await vi.advanceTimersByTimeAsync(200)

    await expect(promise).resolves.toEqual({ ok: false, reasonKey: 'enumeration-failed' })
  })

  it('timeout で常駐プロセスを作り直す (C-5)', async () => {
    vi.useFakeTimers()
    const launcher = fakeLauncher(false)
    const enumerator = createSessionEnumerator(deps(launcher))

    const promise = enumerator.enumerate(request(hostTarget(), null, { timeoutMs: 100 }))
    await vi.advanceTimersByTimeAsync(101)

    await expect(promise).resolves.toEqual({ ok: false, reasonKey: 'enumeration-failed' })
    expect(launcher.workers[0].killCount()).toBe(1)

    // 次の要求では新しいプロセスを起こす。
    vi.useRealTimers()
    const auto = launcher.workers[0]
    auto.sendFails(false)
    void enumerator.enumerate(request(hostTarget(1)))
    await Promise.resolve()
    expect(launcher.workers).toHaveLength(2)
  })

  it('timeout を crash に数えない (pr-gate Round 1 / platform-boundary H-004)', async () => {
    /*
     * **こちらから殺したものは異常終了ではない。**
     * 数えると `crashes` が上限に達し、`ensureWorker()` が `null` を返し続ける。
     * `crashes` が 0 に戻るのは応答が届いたときだけなので、
     * **ワーカを起こせない = 応答が来ない = 永久に 3 のまま**になる。
     * `ENUMERATION_TIMEOUT_MS` は SC-008 の全件予算と同値であり、
     * 予算ちょうどの所在は必ず timeout に当たる。
     */
    vi.useFakeTimers()
    const launcher = fakeLauncher(false)
    const enumerator = createSessionEnumerator(deps(launcher))

    /* 上限 (3) を超える回数の timeout を起こす。 */
    for (let i = 0; i < 4; i += 1) {
      const promise = enumerator.enumerate(request(hostTarget(i), null, { timeoutMs: 100 }))
      await vi.advanceTimersByTimeAsync(101)
      await expect(promise).resolves.toEqual({ ok: false, reasonKey: 'enumeration-failed' })
    }

    /* **4 回目のあともワーカを起こせる。** 恒久停止していない。 */
    vi.useRealTimers()
    const before = launcher.workers.length
    void enumerator.enumerate(request(hostTarget(9)))
    await Promise.resolve()

    expect(launcher.workers.length).toBeGreaterThan(before)
  })

  it('旧ワーカの終了が現行ワーカの要求を巻き添えにしない (platform-boundary H-003)', async () => {
    /*
     * `UtilityProcess.kill()` の `exit` は**後の tick で届く**。
     * 同一性を見ないと次の順序で壊れた。
     *
     * 1. 要求 A が timeout → worker#1 を kill → A は失敗
     * 2. 要求 B → worker#2 を起こす → `pending = {B}`
     * 3. worker#1 の exit が届く → worker#2 の参照を捨て、**B を失敗にする**
     */
    vi.useFakeTimers()
    const launcher = fakeLauncher(false)
    const enumerator = createSessionEnumerator(deps(launcher))

    const first = enumerator.enumerate(request(hostTarget(0), null, { timeoutMs: 100 }))
    await Promise.resolve()
    await Promise.resolve()
    const old = launcher.workers[0]
    /* **exit を保留する。** 実 API の遅れを模し、次のワーカが起きた後に届かせる。 */
    old.holdExit(true)

    await vi.advanceTimersByTimeAsync(101)
    await expect(first).resolves.toEqual({ ok: false, reasonKey: 'enumeration-failed' })

    vi.useRealTimers()
    const second = enumerator.enumerate(request(hostTarget(1)))
    await Promise.resolve()
    await Promise.resolve()

    /* worker#2 が起きている。 */
    expect(launcher.workers.length).toBeGreaterThanOrEqual(2)
    const current = launcher.workers[launcher.workers.length - 1]

    /* **ここで旧ワーカの exit が届く。** 同一性を見ないと worker#2 を捨てて B を失敗にする。 */
    old.flushExit()
    await Promise.resolve()

    /* **現行ワーカが応答すれば成功する。** 旧ワーカの exit に潰されていない。 */
    const sent = JSON.parse(current.received[0]) as { id: number; targetKey: string }
    current.respond(JSON.stringify(okResponse(sent.id, sent.targetKey, [], false)))

    await expect(second).resolves.toMatchObject({ ok: true })
  })

  it('`dispose()` が起こしたワーカ全部を終了させる (contracts C-5 / H-003)', async () => {
    /*
     * `worker` 1 つしか見ないと、参照から外れたワーカが
     * **UNC ハンドルを掴んだ孤児として残る**。
     */
    vi.useFakeTimers()
    const launcher = fakeLauncher(false)
    const enumerator = createSessionEnumerator(deps(launcher))

    const promise = enumerator.enumerate(request(hostTarget(0), null, { timeoutMs: 100 }))
    await Promise.resolve()
    await Promise.resolve()
    const old = launcher.workers[0]
    /*
     * **exit を保留して 2 つ同時に生かす。** これが孤児の生まれる窓である。
     * 保留しないと worker#1 は `spawned` から外れ、差が出ない。
     */
    old.holdExit(true)

    await vi.advanceTimersByTimeAsync(101)
    await promise

    vi.useRealTimers()
    void enumerator.enumerate(request(hostTarget(1)))
    await Promise.resolve()
    const current = launcher.workers[launcher.workers.length - 1]

    /* **kill の増分で見る。** worker#1 は timeout で既に 1 回殺されている。 */
    const beforeOld = old.killCount()
    const beforeCurrent = current.killCount()

    enumerator.dispose()

    expect(current.killCount()).toBeGreaterThan(beforeCurrent)
    /* `worker` 1 つしか見ない実装では、この行が落ちる (孤児が残る)。 */
    expect(old.killCount()).toBeGreaterThan(beforeOld)
  })

  it('落ちたら実行中の要求を失敗にする (AD-030 §7)', async () => {
    const launcher = fakeLauncher(false)
    const enumerator = createSessionEnumerator(deps(launcher))

    const promise = enumerator.enumerate(request(hostTarget()))
    await Promise.resolve()
    await Promise.resolve()
    launcher.workers[0].crash(1)

    await expect(promise).resolves.toEqual({ ok: false, reasonKey: 'enumeration-failed' })
  })

  it('落ち続けたら作り直すのをやめる (AD-030 §7)', async () => {
    const launcher: FakeLauncher = {
      workers: [],
      envs: [],
      launch(env) {
        const worker = fakeWorker()
        launcher.workers.push(worker)
        launcher.envs.push(env)
        // 送った直後に落ちる。
        const send = worker.send.bind(worker)
        worker.send = (line) => {
          const written = send(line)
          queueMicrotask(() => worker.crash(1))
          return written
        }
        return worker
      }
    }
    const enumerator = createSessionEnumerator({ ...deps(launcher), maxCrashes: 2 })

    for (let i = 0; i < 4; i += 1) {
      await enumerator.enumerate(request(hostTarget(i)))
    }

    // **2 回でやめる。** 落ち続けるプロセスを起こし続けない。
    expect(launcher.workers).toHaveLength(2)
  })

  it('送れなかったら失敗にして作り直す', async () => {
    const launcher = fakeLauncher(false)
    const enumerator = createSessionEnumerator(deps(launcher))
    enumerator.warmUp()
    launcher.workers[0].sendFails(true)

    const result = await enumerator.enumerate(request(hostTarget()))

    expect(result).toEqual({ ok: false, reasonKey: 'enumeration-failed' })
    expect(launcher.workers[0].killCount()).toBe(1)
  })

  it('失敗の理由キーをそのまま返す', async () => {
    const launcher = fakeLauncher(false)
    const enumerator = createSessionEnumerator(deps(launcher))

    const promise = enumerator.enumerate(request(hostTarget()))
    await Promise.resolve()
    await Promise.resolve()
    const worker = launcher.workers[0]
    const sent = JSON.parse(worker.received[0]) as { id: number }
    worker.respond(
      JSON.stringify({
        kind: 'error',
        version: 2,
        id: sent.id,
        targetKey: 'host#0',
        reasonKey: 'permission-denied'
      })
    )

    await expect(promise).resolves.toEqual({ ok: false, reasonKey: 'permission-denied' })
  })

  it('`dispose()` が常駐プロセスを終了させる (C-5)', () => {
    const launcher = fakeLauncher()
    const enumerator = createSessionEnumerator(deps(launcher))
    enumerator.warmUp()

    enumerator.dispose()

    expect(launcher.workers[0].killCount()).toBe(1)
  })
})
