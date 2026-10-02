import { afterEach, describe, expect, it, vi } from 'vitest'

import { runSupervisor, type TimerLike, type WorkerHandle } from './supervisor-core'
import {
  parentPortTransport,
  stdioTransport,
  type BodyPortLike,
  type ParentPortLike
} from './transport'

/**
 * 調停役スレッドの本体の単体 (X-5 / BE-005・BE-012・BE-022)。
 *
 * transport は本物 (`parentPortTransport` / `stdioTransport`) を fake の port / 標準入出力で動かし、
 * Worker と時計は fake にする。**本体は経路を知らない** — 同じ本体が 2 つの経路で動くことを確かめる。
 */

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'

/** Worker の最小 fake (`node:events` は agents の許可モジュール外なので使わない)。 */
class FakeWorker implements WorkerHandle {
  readonly received: unknown[] = []
  terminated = false
  private readonly listeners = new Map<string, ((value: never) => void)[]>()
  on(event: 'message' | 'error' | 'exit', listener: (value: never) => void): this {
    this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener])
    return this
  }
  emit(event: string, value: unknown): void {
    for (const l of this.listeners.get(event) ?? []) (l as (v: unknown) => void)(value)
  }
  postMessage(message: unknown): void {
    this.received.push(message)
  }
  terminate(): Promise<number> {
    if (!this.terminated) {
      this.terminated = true
      queueMicrotask(() => this.emit('exit', 1))
    }
    return Promise.resolve(1)
  }
  /** セッションスレッドからのメッセージを模す。 */
  send(message: unknown): void {
    this.emit('message', message)
  }
}

function fakeTimer(): TimerLike & { runAll: () => void; pending: () => number } {
  const tasks = new Map<number, () => void>()
  let seq = 0
  return {
    setTimeout(fn) {
      seq += 1
      tasks.set(seq, fn)
      return seq
    },
    clearTimeout(handle) {
      tasks.delete(handle as number)
    },
    runAll() {
      for (const [id, fn] of [...tasks]) {
        tasks.delete(id)
        fn()
      }
    },
    pending: () => tasks.size
  }
}

interface StatusLine {
  sessionId: string
  state: string
  reasonKey: string | null
  claudeAlive: boolean
}

interface MainLine {
  kind: string
  updates?: StatusLine[]
  sessionId?: string
}

interface ElectronHarness {
  readonly send: (data: unknown, ports?: readonly BodyPortLike[]) => void
  readonly workers: FakeWorker[]
  readonly timer: ReturnType<typeof fakeTimer>
  readonly exit: ReturnType<typeof vi.fn>
  readonly handle: ReturnType<typeof runSupervisor>
  readonly toMain: string[]
  readonly lines: () => MainLine[]
  readonly statusUpdates: () => StatusLine[]
}

function electronHarness(): ElectronHarness {
  const listeners: ((m: { data: unknown; ports?: readonly BodyPortLike[] }) => void)[] = []
  const toMain: string[] = []
  const port: ParentPortLike = {
    on: (_e, l) => listeners.push(l),
    postMessage: (m) => toMain.push(m as string)
  }
  const workers: FakeWorker[] = []
  const timer = fakeTimer()
  const exit = vi.fn()
  const handle = runSupervisor({
    transport: parentPortTransport(port),
    createWorker: () => {
      const w = new FakeWorker()
      workers.push(w)
      return w
    },
    timer,
    exit
  })
  const send = (data: unknown, ports: readonly BodyPortLike[] = []): void => {
    for (const l of listeners) l({ data: JSON.stringify(data), ports })
  }
  const lines = (): MainLine[] => toMain.map((l) => JSON.parse(l) as MainLine)
  const statusUpdates = (): StatusLine[] =>
    lines()
      .filter((l) => l.kind === 'status-batch')
      .flatMap((l) => l.updates ?? [])
  return { send, workers, timer, exit, handle, toMain, lines, statusUpdates }
}

const launchMsg = (sessionId: string): Record<string, unknown> => ({
  kind: 'launch',
  sessionId,
  spec: { command: 'wsl', secret: 'ANTHROPIC_API_KEY=x' },
  options: { permissionMode: 'default' }
})
const bodyPort = (): {
  postMessage: ReturnType<typeof vi.fn<(m: unknown) => void>>
  close: ReturnType<typeof vi.fn<() => void>>
} => ({
  postMessage: vi.fn<(m: unknown) => void>(),
  close: vi.fn<() => void>()
})

afterEach(() => {
  vi.restoreAllMocks()
  process.stdin.removeAllListeners('data')
  process.stdin.removeAllListeners('end')
})

describe('runSupervisor: 起動と宛先解決 (BE-005)', () => {
  it('launch で Worker を 1 つ起こし、起動指示を最初の message で渡す', () => {
    const h = electronHarness()
    h.send(launchMsg(A), [bodyPort()])
    expect(h.workers).toHaveLength(1)
    expect(h.workers[0]?.received[0]).toEqual({
      kind: 'launch',
      spec: { command: 'wsl', secret: 'ANTHROPIC_API_KEY=x' },
      options: { permissionMode: 'default' }
    })
  })

  it('Electron 経路で port の無い launch は Worker を起こさず、launch-failed と thread-ended を返す', () => {
    const h = electronHarness()
    h.send(launchMsg(A), [])
    expect(h.workers).toHaveLength(0)
    expect(h.statusUpdates()).toEqual([
      { sessionId: A, state: 'error', reasonKey: 'launch-failed', claudeAlive: false }
    ])
    expect(h.lines().some((l) => l.kind === 'thread-ended' && l.sessionId === A)).toBe(true)
  })

  it('control はその sessionId の Worker にだけ届き、未知の sessionId は捨てる (送信方向の宛先解決)', () => {
    const h = electronHarness()
    h.send(launchMsg(A), [bodyPort()])
    h.send(launchMsg(B), [bodyPort()])
    h.send({ kind: 'control', sessionId: A, control: { kind: 'interrupt' } })
    h.send({
      kind: 'control',
      sessionId: '33333333-3333-4333-8333-333333333333',
      control: { kind: 'kill' }
    })
    expect(h.workers[0]?.received.at(-1)).toEqual({
      kind: 'control',
      control: { kind: 'interrupt' }
    })
    expect(h.workers[1]?.received).toHaveLength(1) // launch だけ
  })

  it('Worker が他のセッションの sessionId を名乗っても、割り当てた sessionId で付け直す (受信方向)', () => {
    const h = electronHarness()
    h.send(launchMsg(A), [bodyPort()])
    h.send(launchMsg(B), [bodyPort()])
    h.workers[0]?.send({
      kind: 'status',
      sessionId: B,
      state: 'running',
      reasonKey: null,
      claudeAlive: true
    })
    h.timer.runAll()
    expect(h.statusUpdates()).toEqual([
      { sessionId: A, state: 'running', reasonKey: null, claudeAlive: true }
    ])
  })
})

describe('runSupervisor: 本文の中継 (FR-002 / FR-003)', () => {
  it('本文は JSON として解釈されず、文字列のままそのセッションの port へ渡る', () => {
    const h = electronHarness()
    const pa = bodyPort()
    const pb = bodyPort()
    h.send(launchMsg(A), [pa])
    h.send(launchMsg(B), [pb])
    const parse = vi.spyOn(JSON, 'parse')
    h.workers[0]?.send({ kind: 'event', payload: 'not json at all' })
    expect(parse).not.toHaveBeenCalled()
    expect(pa.postMessage).toHaveBeenCalledWith('not json at all')
    expect(pb.postMessage).not.toHaveBeenCalled()
    // 本文を main へ書かない。
    expect(h.toMain.some((l) => l.includes('not json at all'))).toBe(false)
  })

  it('セッション port の inbound を購読しない (本文経路は一方向。BE-014 / SC-002)', () => {
    const h = electronHarness()
    // 購読口を持つ port を渡しても、調停役スレッドはどれも触らない。
    const port = {
      ...bodyPort(),
      on: vi.fn(),
      addEventListener: vi.fn(),
      start: vi.fn(),
      onmessage: null as unknown
    }
    h.send(launchMsg(A), [port])
    h.workers[0]?.send({ kind: 'event', payload: '{"kind":"state","state":"running"}' })
    expect(port.on).not.toHaveBeenCalled()
    expect(port.addEventListener).not.toHaveBeenCalled()
    expect(port.start).not.toHaveBeenCalled()
    expect(port.onmessage).toBeNull()
    expect(port.postMessage).toHaveBeenCalledTimes(1)
  })
})

describe('runSupervisor: 状態通知のバッチ化 (FR-004)', () => {
  it('窓の間の通知は 1 行にまとまり、セッションごとに最新へ畳まれる', () => {
    const h = electronHarness()
    h.send(launchMsg(A), [bodyPort()])
    h.send(launchMsg(B), [bodyPort()])
    h.workers[0]?.send({ kind: 'status', state: 'launching', reasonKey: null, claudeAlive: true })
    h.workers[0]?.send({ kind: 'status', state: 'running', reasonKey: null, claudeAlive: true })
    h.workers[1]?.send({ kind: 'status', state: 'launching', reasonKey: null, claudeAlive: true })
    expect(h.lines().filter((l) => l.kind === 'status-batch')).toHaveLength(0)
    h.timer.runAll()
    const batches = h.lines().filter((l) => l.kind === 'status-batch')
    expect(batches).toHaveLength(1)
    expect(batches[0]?.updates).toEqual([
      { sessionId: A, state: 'running', reasonKey: null, claudeAlive: true },
      { sessionId: B, state: 'launching', reasonKey: null, claudeAlive: true }
    ])
  })

  it('child-exited は窓を待たずに送り、生存フラグを false にする。以後の true の通知でも戻らない', () => {
    const h = electronHarness()
    h.send(launchMsg(A), [bodyPort()])
    h.workers[0]?.send({ kind: 'status', state: 'done', reasonKey: null, claudeAlive: true })
    h.workers[0]?.send({ kind: 'child-exited' })
    expect(h.statusUpdates().at(-1)).toEqual({
      sessionId: A,
      state: 'done',
      reasonKey: null,
      claudeAlive: false
    })
    h.workers[0]?.send({ kind: 'status', state: 'done', reasonKey: null, claudeAlive: true })
    h.timer.runAll()
    expect(h.statusUpdates().at(-1)?.claudeAlive).toBe(false)
  })
})

describe('runSupervisor: Worker の終わり方 (BE-022 / R3-H-03)', () => {
  it('ended 未着で Worker が終わる (応答待ちの done 中を含む) と process-crashed になり、生存フラグが false になる', async () => {
    const h = electronHarness()
    h.send(launchMsg(A), [bodyPort()])
    h.workers[0]?.send({ kind: 'status', state: 'done', reasonKey: null, claudeAlive: true })
    h.workers[0]?.emit('exit', 1)
    expect(h.statusUpdates().at(-1)).toEqual({
      sessionId: A,
      state: 'error',
      reasonKey: 'process-crashed',
      claudeAlive: false
    })
    expect(h.lines().some((l) => l.kind === 'thread-ended' && l.sessionId === A)).toBe(true)
    expect(h.handle.size()).toBe(0)
  })

  it('メモリ上限超過相当の error でも、そのセッションだけが process-crashed になり、他は流れ続ける', () => {
    const h = electronHarness()
    const pb = bodyPort()
    h.send(launchMsg(A), [bodyPort()])
    h.send(launchMsg(B), [pb])
    h.workers[0]?.emit('error', new Error('Worker terminated due to reaching memory limit'))
    h.workers[1]?.send({ kind: 'event', payload: 'still flowing' })
    expect(h.statusUpdates()).toEqual([
      { sessionId: A, state: 'error', reasonKey: 'process-crashed', claudeAlive: false }
    ])
    expect(pb.postMessage).toHaveBeenCalledWith('still flowing')
    expect(h.handle.size()).toBe(1)
  })

  it('ended を受けた後の終了は異常終了と判定しない (kill 後の正常終了)', async () => {
    const h = electronHarness()
    h.send(launchMsg(A), [bodyPort()])
    h.workers[0]?.send({ kind: 'status', state: 'done', reasonKey: null, claudeAlive: true })
    h.workers[0]?.send({ kind: 'child-exited' })
    h.workers[0]?.send({ kind: 'ended' })
    await vi.waitFor(() => expect(h.workers[0]?.terminated).toBe(true))
    await vi.waitFor(() => expect(h.handle.size()).toBe(0))
    h.timer.runAll()
    expect(h.statusUpdates().some((u) => u.reasonKey === 'process-crashed')).toBe(false)
  })

  it('ended を受けたが child-exited が未着 (spawn 前の終了) でも、生存フラグを false にして枠を解放する', async () => {
    const h = electronHarness()
    h.send(launchMsg(A), [bodyPort()])
    h.workers[0]?.send({ kind: 'status', state: 'launching', reasonKey: null, claudeAlive: true })
    h.workers[0]?.send({ kind: 'ended' })
    await vi.waitFor(() => expect(h.handle.size()).toBe(0))
    expect(h.statusUpdates().at(-1)).toEqual({
      sessionId: A,
      state: 'launching',
      reasonKey: null,
      claudeAlive: false
    })
  })

  it('1 本の Worker が承認待ちの間も、他の Worker の本文は流れる', () => {
    const h = electronHarness()
    const pb = bodyPort()
    h.send(launchMsg(A), [bodyPort()])
    h.send(launchMsg(B), [pb])
    h.workers[0]?.send({
      kind: 'status',
      state: 'awaiting_permission',
      reasonKey: null,
      claudeAlive: true
    })
    for (let i = 0; i < 5; i += 1) h.workers[1]?.send({ kind: 'event', payload: `m${i}` })
    expect(pb.postMessage).toHaveBeenCalledTimes(5)
  })

  it('上限いっぱいの本文を連続して中継している間も、他のセッションの本文は届く', () => {
    const h = electronHarness()
    const pa = bodyPort()
    const pb = bodyPort()
    h.send(launchMsg(A), [pa])
    h.send(launchMsg(B), [pb])
    const big = 'x'.repeat(200_000)
    for (let i = 0; i < 25; i += 1) h.workers[0]?.send({ kind: 'event', payload: big })
    h.workers[1]?.send({ kind: 'event', payload: 'small' })
    expect(pa.postMessage).toHaveBeenCalledTimes(25)
    expect(pb.postMessage).toHaveBeenCalledWith('small')
  })
})

describe('runSupervisor: 単独起動 (標準入出力経路。BE-012 / SC-009)', () => {
  it('同じ本体が標準入出力で動き、本文と状態通知を行で返し、標準入力を閉じると全セッションを止めて終わる', async () => {
    const written: string[] = []
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      written.push(String(chunk))
      return true
    })
    const workers: FakeWorker[] = []
    const timer = fakeTimer()
    const exit = vi.fn()
    runSupervisor({
      transport: stdioTransport(),
      createWorker: () => {
        const w = new FakeWorker()
        workers.push(w)
        return w
      },
      timer,
      exit
    })
    process.stdin.emit('data', `${JSON.stringify(launchMsg(A))}\n${JSON.stringify(launchMsg(B))}\n`)
    expect(workers).toHaveLength(2)
    workers[0]?.send({ kind: 'event', payload: '{"kind":"state","state":"launching"}' })
    workers[0]?.send({ kind: 'status', state: 'launching', reasonKey: null, claudeAlive: true })
    timer.runAll()
    const lines = written
      .join('')
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l) as { kind: string; sessionId?: string; payload?: string })
    expect(lines.find((l) => l.kind === 'event')).toEqual({
      kind: 'event',
      sessionId: A,
      payload: '{"kind":"state","state":"launching"}'
    })
    expect(lines.some((l) => l.kind === 'status-batch')).toBe(true)

    // 終了の制御
    process.stdin.emit(
      'data',
      `${JSON.stringify({ kind: 'control', sessionId: A, control: { kind: 'end' } })}\n`
    )
    expect(workers[0]?.received.at(-1)).toEqual({ kind: 'control', control: { kind: 'end' } })

    // 標準入力を閉じる → 全 Worker に kill → 全部終わったら exit
    process.stdin.emit('end')
    expect(
      workers.every(
        (w) => (w.received.at(-1) as { control?: { kind: string } }).control?.kind === 'kill'
      )
    ).toBe(true)
    workers[0]?.emit('exit', 0)
    workers[1]?.emit('exit', 0)
    expect(exit).toHaveBeenCalledWith(0)
  })
})
