import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/** 改名の子の起動 (023 BE-033 / contracts C-5 / data-model §6.3)。`utilityProcess` は偽物。 */

type Listener = (...args: unknown[]) => void

interface FakeChild {
  readonly on: (event: string, l: Listener) => void
  readonly once: (event: string, l: Listener) => void
  readonly postMessage: ReturnType<typeof vi.fn>
  readonly kill: ReturnType<typeof vi.fn>
  emit(event: string, ...args: unknown[]): void
  killResult: boolean
}

const h = vi.hoisted(() => ({
  children: [] as FakeChild[],
  fork: vi.fn()
}))

vi.mock('electron', () => ({ utilityProcess: { fork: h.fork } }))
vi.mock('@agents/rename-session?modulePath', () => ({ default: '/bundle/rename-session.js' }))

import { createRenameSpawner } from './rename-spawner'

function makeChild(): FakeChild {
  const listeners = new Map<string, Listener[]>()
  const add = (event: string, l: Listener): void => {
    listeners.set(event, [...(listeners.get(event) ?? []), l])
  }
  const child: FakeChild = {
    on: add,
    once: add,
    postMessage: vi.fn(),
    kill: vi.fn(() => child.killResult),
    emit: (event, ...args) => {
      for (const l of listeners.get(event) ?? []) l(...args)
    },
    killResult: true
  }
  return child
}

const ENV = { PATH: 'x', CLAUDE_CONFIG_DIR: '/cfg' }
const REQ = { conversationId: '22222222-2222-4222-8222-222222222222', name: '調査' }

beforeEach(() => {
  vi.useFakeTimers()
  h.children.length = 0
  h.fork.mockReset()
  h.fork.mockImplementation(() => {
    const c = makeChild()
    h.children.push(c)
    return c
  })
})
afterEach(() => {
  vi.useRealTimers()
})

describe('createRenameSpawner', () => {
  it('渡した env だけで起こし、stdio は ignore、起きてから 1 通だけ送る', async () => {
    const s = createRenameSpawner()
    const p = s.run(ENV, REQ)
    expect(h.fork).toHaveBeenCalledTimes(1)
    const [path, args, opts] = h.fork.mock.calls[0]
    expect(path).toBe('/bundle/rename-session.js')
    expect(args).toEqual([])
    expect(opts).toEqual({ env: ENV, stdio: 'ignore' })
    expect(h.children[0].postMessage).not.toHaveBeenCalled()
    h.children[0].emit('spawn')
    expect(h.children[0].postMessage).toHaveBeenCalledTimes(1)
    expect(h.children[0].postMessage).toHaveBeenCalledWith(REQ)
    h.children[0].emit('message', { ok: true })
    expect(await p).toEqual({ ok: true })
  })

  it('{ ok: false } は write-failed', async () => {
    const p = createRenameSpawner().run(ENV, REQ)
    h.children[0].emit('message', { ok: false })
    expect(await p).toEqual({ ok: false, reason: 'write-failed' })
  })

  it('結果の前の終わりは write-failed', async () => {
    const p = createRenameSpawner().run(ENV, REQ)
    h.children[0].emit('exit', 1)
    expect(await p).toEqual({ ok: false, reason: 'write-failed' })
  })

  it('期限で子を kill して write-failed', async () => {
    const p = createRenameSpawner({ timeoutMs: 10_000 }).run(ENV, REQ)
    await vi.advanceTimersByTimeAsync(9_999)
    expect(h.children[0].kill).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(h.children[0].kill).toHaveBeenCalledTimes(1)
    expect(await p).toEqual({ ok: false, reason: 'write-failed' })
  })

  it('結果が 2 回来ても 1 回だけ解く', async () => {
    const p = createRenameSpawner().run(ENV, REQ)
    h.children[0].emit('message', { ok: true })
    h.children[0].emit('message', { ok: false })
    h.children[0].emit('exit', 0)
    expect(await p).toEqual({ ok: true })
  })

  it('dispose で動いている子の全部に kill が呼ばれ待ちが write-failed、確かめられなかった数が戻る', async () => {
    const s = createRenameSpawner()
    const p1 = s.run(ENV, REQ)
    const p2 = s.run(ENV, REQ)
    h.children[1].killResult = false
    expect(s.dispose()).toBe(1)
    expect(h.children[0].kill).toHaveBeenCalledTimes(1)
    expect(h.children[1].kill).toHaveBeenCalledTimes(1)
    expect(await p1).toEqual({ ok: false, reason: 'write-failed' })
    expect(await p2).toEqual({ ok: false, reason: 'write-failed' })
  })

  it('dispose の後の起動は子を起こさず write-failed', async () => {
    const s = createRenameSpawner()
    s.dispose()
    expect(await s.run(ENV, REQ)).toEqual({ ok: false, reason: 'write-failed' })
    expect(h.fork).not.toHaveBeenCalled()
  })

  it('子が 10 個動いている間の 11 個目は子を起こさず write-failed (動いている子は kill されない)', async () => {
    const s = createRenameSpawner()
    const waits = Array.from({ length: 10 }, () => s.run(ENV, REQ))
    expect(h.fork).toHaveBeenCalledTimes(10)
    expect(await s.run(ENV, REQ)).toEqual({ ok: false, reason: 'write-failed' })
    expect(h.fork).toHaveBeenCalledTimes(10)
    for (const c of h.children) expect(c.kill).not.toHaveBeenCalled()
    // 1 つ終わると次を受けられる (追跡から外れる)
    h.children[0].emit('message', { ok: true })
    const next = s.run(ENV, REQ)
    expect(h.fork).toHaveBeenCalledTimes(11)
    for (const c of h.children) c.emit('message', { ok: true })
    await Promise.all([...waits, next])
  })

  it('ログに名前・会話の id・config ディレクトリが出ない', async () => {
    const spy = vi.spyOn(console, 'log')
    const err = vi.spyOn(console, 'error')
    const p = createRenameSpawner().run(ENV, REQ)
    h.children[0].emit('exit', 1)
    await p
    expect(spy).not.toHaveBeenCalled()
    expect(err).not.toHaveBeenCalled()
    spy.mockRestore()
    err.mockRestore()
  })
})
