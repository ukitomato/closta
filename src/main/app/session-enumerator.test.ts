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
  buildEnumerationArgs,
  checkLaunchAllowed,
  createLineAssembler,
  createSessionEnumerator,
  type EnumerationChild,
  type EnumerationLauncher,
  type SessionEnumeratorDeps
} from './session-enumerator'

/**
 * BE-025c — 起動ゲート・引数・方針のユニットテスト (SC-002 / SC-016 / C-5 / C-6)。
 *
 * **Electron を立てない。** 子プロセスを起こす層は `enumerator-spawner.ts` に
 * 分けてあるため、方針だけをモックゼロに近い形で検証できる。
 */

const NOW = 1_700_000_000_000
const UBUNTU: WslNamespaceId = wslNamespace('Ubuntu')
const DEBIAN: WslNamespaceId = wslNamespace('Debian')

function hostTarget(): EnumerationTarget {
  const configDir = makeHostPath('C:\\Users\\y\\.claude')
  if (!configDir.ok) throw new Error('テストの前提が壊れている')
  return {
    key: enumerationTargetKey({ kind: 'windows' }, 0),
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

/** 応答を制御できる子プロセスの代役。**実プロセスを起こさない。** */
interface FakeChild extends EnumerationChild {
  emit(line: string): void
  exit(code?: number | null): void
  readonly killCount: () => number
}

function fakeChild(): FakeChild {
  let onLine: ((line: string) => void) | null = null
  let onExit: ((code: number | null) => void) | null = null
  let kills = 0

  return {
    onLine(listener) {
      onLine = listener
    },
    onExit(listener) {
      onExit = listener
    },
    kill() {
      kills += 1
      return true
    },
    emit(line) {
      onLine?.(line)
    },
    exit(code = 0) {
      onExit?.(code)
    },
    killCount: () => kills
  }
}

interface FakeLauncher extends EnumerationLauncher {
  readonly calls: { args: readonly string[]; env: Record<string, string>; child: FakeChild }[]
}

/** 起動されたらすぐ応答して終了する既定の代役。 */
function fakeLauncher(respond: (child: FakeChild, args: readonly string[]) => void): FakeLauncher {
  const calls: FakeLauncher['calls'] = []
  return {
    calls,
    launch(args, env) {
      const child = fakeChild()
      calls.push({ args, env, child })
      // リスナ登録のあとに応答させる。
      queueMicrotask(() => respond(child, args))
      return child
    }
  }
}

function respondOk(targetKey: string): (child: FakeChild, args: readonly string[]) => void {
  return (child, args) => {
    const key = args.find((arg) => arg.startsWith('--target-key='))?.slice('--target-key='.length)
    child.emit(JSON.stringify(okResponse(key ?? targetKey, [], false)))
    child.exit(0)
  }
}

/** 待機の記録。**`vi.fn` を使わず素の関数にする** — 引数の型がそのまま残る。 */
function waitRecorder(): { wait: (ms: number) => Promise<void>; waited: number[] } {
  const waited: number[] = []
  return {
    waited,
    wait: async (ms) => {
      waited.push(ms)
    }
  }
}

function deps(
  launcher: EnumerationLauncher,
  wait: (ms: number) => Promise<void> = async () => {}
): SessionEnumeratorDeps {
  return { launcher, wait, now: () => NOW, parentEnv: { SystemRoot: 'C:\\Windows' } }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('buildEnumerationArgs', () => {
  it('全件の要求を引数にする', () => {
    expect(buildEnumerationArgs(request(hostTarget()))).toEqual([
      '--target-key=host#0',
      '--scope=all'
    ])
  })

  it('先頭ページの要求を引数にする', () => {
    const args = buildEnumerationArgs(
      request(hostTarget(), null, { scope: { kind: 'page', limit: 50, offset: 100 } })
    )

    expect(args).toEqual(['--target-key=host#0', '--scope=page', '--limit=50', '--offset=100'])
  })

  it('config ディレクトリを引数に載せない (FR-042)', () => {
    const args = buildEnumerationArgs(request(wslTarget(UBUNTU, 'Ubuntu'), null))

    expect(args.join(' ')).not.toContain('.claude')
    expect(args.join(' ')).not.toContain('wsl.localhost')
  })
})

describe('checkLaunchAllowed', () => {
  it('所在が windows なら確認済みの値を要求しない', () => {
    expect(checkLaunchAllowed(request(hostTarget()))).toBeNull()
  })

  it('確認済みの値が無い wsl の起動を拒否する (FR-008 / SC-002)', () => {
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

describe('createLineAssembler', () => {
  it('チャンクを跨いだ 1 行を組み立てる', () => {
    const lines: string[] = []
    const assemble = createLineAssembler((line) => lines.push(line))

    assemble('{"a"')
    assemble(':1}\n')

    expect(lines).toEqual(['{"a":1}'])
  })

  it('改行が来るまで渡さない', () => {
    const lines: string[] = []
    const assemble = createLineAssembler((line) => lines.push(line))

    assemble('incomplete')

    expect(lines).toEqual([])
  })

  it('1 チャンクに複数行あれば全部渡す', () => {
    const lines: string[] = []
    const assemble = createLineAssembler((line) => lines.push(line))

    assemble('a\nb\n\nc\n')

    expect(lines).toEqual(['a', 'b', 'c'])
  })
})

describe('createSessionEnumerator', () => {
  it('停止中の所在に対して子プロセスを起こさない (SC-002)', async () => {
    const launcher = fakeLauncher(respondOk('wsl:Ubuntu#0'))
    const enumerator = createSessionEnumerator(deps(launcher))

    const result = await enumerator.enumerate(request(wslTarget(UBUNTU, 'Ubuntu')))

    expect(result).toEqual({ ok: false, reasonKey: 'distro-not-running' })
    expect(launcher.calls).toHaveLength(0)
  })

  it('許可リストの環境変数だけを子に渡す (SC-016)', async () => {
    const launcher = fakeLauncher(respondOk('host#0'))
    const enumerator = createSessionEnumerator({
      ...deps(launcher),
      parentEnv: { SystemRoot: 'C:\\Windows', ANTHROPIC_API_KEY: 'secret' }
    })

    await enumerator.enumerate(request(hostTarget()))

    expect(launcher.calls[0].env).not.toHaveProperty('ANTHROPIC_API_KEY')
    expect(launcher.calls[0].env.CLAUDE_CONFIG_DIR).toBe('C:\\Users\\y\\.claude')
  })

  it('同じ対象への並行要求を 1 つのプロセスに束ねる (C-6)', async () => {
    const launcher = fakeLauncher(respondOk('host#0'))
    const enumerator = createSessionEnumerator(deps(launcher))

    const [a, b] = await Promise.all([
      enumerator.enumerate(request(hostTarget())),
      enumerator.enumerate(request(hostTarget()))
    ])

    expect(launcher.calls).toHaveLength(1)
    expect(a).toEqual(b)
  })

  it('逐次の連打に最小間隔を掛ける (C-6)', async () => {
    const recorder = waitRecorder()
    const launcher = fakeLauncher(respondOk('host#0'))
    const enumerator = createSessionEnumerator(deps(launcher, recorder.wait))

    await enumerator.enumerate(request(hostTarget()))
    await enumerator.enumerate(request(hostTarget()))

    expect(launcher.calls).toHaveLength(2)
    // 2 回目は同じ時刻に来るので、間隔の残りをそのまま待たされる。
    expect(recorder.waited).toHaveLength(1)
    expect(recorder.waited[0]).toBeGreaterThan(0)
  })

  it('初回は待たされない', async () => {
    const recorder = waitRecorder()
    const launcher = fakeLauncher(respondOk('host#0'))
    const enumerator = createSessionEnumerator(deps(launcher, recorder.wait))

    await enumerator.enumerate(request(hostTarget()))

    expect(recorder.waited).toEqual([])
  })

  it('同時プロセス数の上限を守る (C-6)', async () => {
    let peak = 0
    let live = 0
    const pending: FakeChild[] = []
    const launcher: EnumerationLauncher = {
      launch() {
        live += 1
        peak = Math.max(peak, live)
        const child = fakeChild()
        pending.push(child)
        return child
      }
    }
    const enumerator = createSessionEnumerator({ ...deps(launcher), maxConcurrent: 2 })

    const targets = [0, 1, 2, 3].map((ordinal) => ({
      ...hostTarget(),
      key: enumerationTargetKey({ kind: 'windows' }, ordinal)
    }))
    const all = Promise.all(targets.map((target) => enumerator.enumerate(request(target))))

    // 起動済みのものを順に終わらせる。
    for (let i = 0; i < 4; i += 1) {
      await Promise.resolve()
      const child = pending[i]
      if (child === undefined) continue
      live -= 1
      child.emit(JSON.stringify(okResponse(targets[i].key, [], false)))
      child.exit(0)
      await Promise.resolve()
    }
    await all

    expect(peak).toBeLessThanOrEqual(2)
  })

  it('timeout で終了を要求し、失敗として返す (C-5)', async () => {
    vi.useFakeTimers()
    const children: FakeChild[] = []
    const launcher: EnumerationLauncher = {
      launch() {
        const child = fakeChild()
        children.push(child)
        return child
      }
    }
    const enumerator = createSessionEnumerator(deps(launcher))

    const promise = enumerator.enumerate(request(hostTarget(), null, { timeoutMs: 100 }))
    await vi.advanceTimersByTimeAsync(101)

    expect(children[0].killCount()).toBe(1)

    // 終了通知が来ないまま猶予が切れたら、枠を返して失敗にする。
    await vi.advanceTimersByTimeAsync(2_001)

    await expect(promise).resolves.toEqual({ ok: false, reasonKey: 'enumeration-failed' })
  })

  it('終了通知が猶予内に来れば、その応答を採る', async () => {
    vi.useFakeTimers()
    const children: FakeChild[] = []
    const launcher: EnumerationLauncher = {
      launch() {
        const child = fakeChild()
        children.push(child)
        return child
      }
    }
    const enumerator = createSessionEnumerator(deps(launcher))

    const promise = enumerator.enumerate(request(hostTarget(), null, { timeoutMs: 100 }))
    await vi.advanceTimersByTimeAsync(101)
    children[0].emit(JSON.stringify(okResponse('host#0', [], true)))
    children[0].exit(0)

    await expect(promise).resolves.toEqual({ ok: true, sessions: [], truncated: true })
  })

  it('応答が無いまま終了したら失敗にする', async () => {
    const launcher = fakeLauncher((child) => child.exit(1))
    const enumerator = createSessionEnumerator(deps(launcher))

    await expect(enumerator.enumerate(request(hostTarget()))).resolves.toEqual({
      ok: false,
      reasonKey: 'enumeration-failed'
    })
  })

  it('`targetKey` が違う応答を採らない (取り違えの検出)', async () => {
    const launcher = fakeLauncher((child) => {
      child.emit(JSON.stringify(okResponse('someone-else', [], false)))
      child.exit(0)
    })
    const enumerator = createSessionEnumerator(deps(launcher))

    await expect(enumerator.enumerate(request(hostTarget()))).resolves.toEqual({
      ok: false,
      reasonKey: 'enumeration-failed'
    })
  })

  it('形の合わない行を無視し、応答なしとして扱う', async () => {
    const launcher = fakeLauncher((child) => {
      child.emit('not json')
      child.exit(0)
    })
    const enumerator = createSessionEnumerator(deps(launcher))

    await expect(enumerator.enumerate(request(hostTarget()))).resolves.toMatchObject({ ok: false })
  })

  it('`killAll()` が生存中のプロセスを終了させる (C-5)', async () => {
    const children: FakeChild[] = []
    const launcher: EnumerationLauncher = {
      launch() {
        const child = fakeChild()
        children.push(child)
        return child
      }
    }
    const enumerator = createSessionEnumerator(deps(launcher))

    void enumerator.enumerate(request(hostTarget()))
    await Promise.resolve()
    await Promise.resolve()
    enumerator.killAll()

    expect(children[0].killCount()).toBe(1)
  })

  it('束ねた要求が終われば次の要求は新しいプロセスを起こす', async () => {
    const launcher = fakeLauncher(respondOk('host#0'))
    const enumerator = createSessionEnumerator(deps(launcher))

    await enumerator.enumerate(request(hostTarget()))
    await enumerator.enumerate(request(hostTarget()))

    expect(launcher.calls).toHaveLength(2)
  })
})
