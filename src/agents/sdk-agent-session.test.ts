import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * セッションスレッド (`sdk-agent-session.ts`) の実配線のテスト (X-5 / BE-002)。
 *
 * SDK の `query()` と `child_process` は差し替える (実 claude も wsl.exe も起こさない)。
 * 調停役スレッドとの経路 (`worker_threads` の `parentPort`) も fake に差し替え、本ファイルは import 時に
 * `main()` が走るので、テストごとに module を読み直す。
 *
 * B-2 の回帰 (X-4 quickstart / pr-gate R1 po M-005) も含む: claude 2.1.285 は起動直後 (初回 user メッセージの前) に
 * `system/commands_changed` を出す。**最初のプロンプトを送る前に届いたメッセージは running への遷移を起こさない**。
 */

interface PromptLike {
  readonly message: { readonly content: string }
}

/** 子プロセスの最小 emitter (`node:events` は agents の許可モジュール外なので使わない)。 */
interface MiniEmitter {
  on(event: string, listener: (...args: unknown[]) => void): this
  once(event: string, listener: (...args: unknown[]) => void): this
  emit(event: string, ...args: unknown[]): boolean
}

interface FakeChild extends MiniEmitter {
  pid: number
  killed: boolean
  /** kill されたときに exit するか (false なら kill しても終わらない子を模す)。 */
  exitOnKill: boolean
  kill(signal?: string): boolean
}

type Mode = 'normal' | 'stuck-on-close' | 'crash-midstream' | 'no-spawn' | 'spawn-after-abort'

const h = vi.hoisted(() => ({
  createEmitter: (): MiniEmitter => {
    const listeners = new Map<string, ((...args: unknown[]) => void)[]>()
    const emitter: MiniEmitter = {
      on(event, listener) {
        listeners.set(event, [...(listeners.get(event) ?? []), listener])
        return this
      },
      once(event, listener) {
        const wrapped = (...args: unknown[]): void => {
          listeners.set(
            event,
            (listeners.get(event) ?? []).filter((l) => l !== wrapped)
          )
          listener(...args)
        }
        return this.on(event, wrapped)
      },
      emit(event, ...args) {
        const current = listeners.get(event) ?? []
        for (const l of current) l(...args)
        return current.length > 0
      }
    }
    return emitter
  },
  port: null as null | {
    on: (event: 'message', listener: (data: unknown) => void) => void
    postMessage: (message: unknown) => void
  },
  mode: 'normal' as Mode,
  preMessageConsumed: false,
  prompts: [] as string[],
  child: null as null | FakeChild,
  /** テストから stream に流すメッセージ。 */
  feed: [] as Record<string, unknown>[],
  wakeFeed: null as null | (() => void)
}))

vi.mock('node:worker_threads', () => ({
  get parentPort() {
    return h.port
  }
}))

vi.mock('node:child_process', () => ({
  spawn: vi.fn(() => {
    const child = h.createEmitter() as FakeChild
    child.pid = 4242
    child.killed = false
    child.exitOnKill = h.mode !== 'stuck-on-close'
    child.kill = () => {
      child.killed = true
      if (child.exitOnKill) queueMicrotask(() => child.emit('exit', null, 'SIGTERM'))
      return true
    }
    h.child = child
    return child
  })
}))

vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: ({
    prompt,
    options
  }: {
    prompt: AsyncIterable<PromptLike>
    options: {
      spawnClaudeCodeProcess: (o: { command: string; args: string[] }) => FakeChild
      abortController: AbortController
    }
  }) => {
    const signal = options.abortController.signal
    async function* stream(): AsyncGenerator<Record<string, unknown>> {
      if (h.mode === 'spawn-after-abort') {
        // abort を受けた後で spawn コールバックを呼ぶ SDK (pr-gate R2 platform-boundary L-102)。
        await new Promise<void>((resolve) =>
          signal.addEventListener('abort', () => resolve(), { once: true })
        )
        options.spawnClaudeCodeProcess({ command: 'claude', args: [] })
      } else if (h.mode !== 'no-spawn')
        options.spawnClaudeCodeProcess({ command: 'claude', args: [] })
      else await new Promise(() => undefined) // spawn しないまま止まる
      // 初回 user メッセージの前に届く通知 (実測の再現)。
      yield { type: 'system', subtype: 'commands_changed' }
      h.preMessageConsumed = true
      const iterator = prompt[Symbol.asyncIterator]()
      for (;;) {
        const next = await Promise.race([
          iterator.next(),
          new Promise<{ aborted: true }>((resolve) =>
            signal.addEventListener('abort', () => resolve({ aborted: true }), { once: true })
          )
        ])
        if ('aborted' in next) throw new Error('aborted')
        if (next.done === true) {
          // プロンプトの入力が閉じた → claude は正常終了する (stuck なら終わらない)。
          if (h.mode !== 'stuck-on-close') h.child?.emit('exit', 0, null)
          return
        }
        h.prompts.push(next.value.message.content)
        yield { type: 'system', subtype: 'init' }
        if (h.mode === 'crash-midstream') {
          // wsl.exe だけが異常終了し、stream が壊れる。
          h.child?.emit('exit', 1, null)
          throw new Error('stream broke')
        }
        yield { type: 'result', subtype: 'success', is_error: false }
      }
    }
    return Object.assign(stream(), { interrupt: async () => ({}) })
  }
}))

const SPEC = {
  pathToClaudeCodeExecutable: '/home/u/.local/bin/claude',
  command: 'wsl-launcher',
  prefixArgs: ['--cd', '/home/u/proj', '-d', 'Ubuntu', '--exec'],
  env: { WSL_UTF8: '1' }
}

interface Posted {
  kind: string
  payload?: string
  state?: string
  reasonKey?: string | null
  claudeAlive?: boolean
}

let posted: Posted[] = []
let listener: ((data: unknown) => void) | null = null

async function boot(mode: Mode = 'normal'): Promise<(data: unknown) => void> {
  h.mode = mode
  h.preMessageConsumed = false
  h.prompts = []
  h.child = null
  posted = []
  listener = null
  h.port = {
    on: (_event, l) => {
      listener = l
    },
    postMessage: (message) => posted.push(message as Posted)
  }
  vi.resetModules()
  await import('./sdk-agent-session')
  expect(listener).not.toBeNull()
  return (data: unknown) => (listener as (data: unknown) => void)(data)
}

const events = (): { kind: string; state?: string }[] =>
  posted
    .filter((p) => p.kind === 'event')
    .map((p) => JSON.parse(p.payload as string) as { kind: string; state?: string })
const states = (): (string | undefined)[] =>
  events()
    .filter((e) => e.kind === 'state')
    .map((e) => e.state)
const kinds = (): string[] => posted.map((p) => p.kind)
const launch = { kind: 'launch', spec: SPEC, options: { permissionMode: 'default' } }
const control = (c: unknown): unknown => ({ kind: 'control', control: c })

// main() が process に登録する未捕捉例外の口を、テストごとに外す (Vitest 自身の listener は残す)。
let baseline: { uncaught: unknown[]; rejection: unknown[] } = { uncaught: [], rejection: [] }

beforeEach(() => {
  baseline = {
    uncaught: process.listeners('uncaughtException'),
    rejection: process.listeners('unhandledRejection')
  }
})

afterEach(() => {
  h.port = null
  for (const l of process.listeners('uncaughtException')) {
    if (!baseline.uncaught.includes(l)) process.off('uncaughtException', l)
  }
  for (const l of process.listeners('unhandledRejection')) {
    if (!baseline.rejection.includes(l)) process.off('unhandledRejection', l)
  }
})

describe('sdk-agent-session: 最初のプロンプト前のメッセージ (B-2)', () => {
  it('送信前の system/commands_changed では running にせず、送信後の最初のメッセージで running にする', async () => {
    const send = await boot()
    send(launch)
    await vi.waitFor(() => expect(h.preMessageConsumed).toBe(true))
    expect(states()).toEqual(['launching'])

    send(control({ kind: 'send-prompt', text: 'こんにちは' }))
    await vi.waitFor(() => expect(states()).toContain('running'))
    expect(h.prompts).toEqual(['こんにちは'])
  })
})

describe('sdk-agent-session: 調停役スレッドとのメッセージ (X-5 / BE-002)', () => {
  it('本文は { kind: event, payload: string } で出る (直列化はセッションスレッドで行う)', async () => {
    const send = await boot()
    send(launch)
    await vi.waitFor(() => expect(events().length).toBeGreaterThan(0))
    const first = posted.find((p) => p.kind === 'event')
    expect(typeof first?.payload).toBe('string')
  })

  it('状態通知の claudeAlive は常に true (spawn 前も)。sessionId は載せない', async () => {
    const send = await boot()
    send(launch)
    await vi.waitFor(() => expect(posted.some((p) => p.kind === 'status')).toBe(true))
    for (const s of posted.filter((p) => p.kind === 'status')) {
      expect(s.claudeAlive).toBe(true)
      expect(s).not.toHaveProperty('sessionId')
    }
  })

  it('起動した子プロセスだけが異常終了したとき、child-exited が出て、そのセッションは理由付き error になり、ended が出る', async () => {
    const send = await boot('crash-midstream')
    send(launch)
    await vi.waitFor(() => expect(h.preMessageConsumed).toBe(true))
    send(control({ kind: 'send-prompt', text: 'go' }))
    await vi.waitFor(() => expect(kinds()).toContain('ended'))
    expect(kinds()).toContain('child-exited')
    expect(states()).toContain('error')
    const lastStatus = posted.filter((p) => p.kind === 'status').at(-1)
    // 原因は子の終了なので process-crashed (後続の stream の例外で stream-protocol-error に上書きしない)。
    expect(lastStatus).toMatchObject({ state: 'error', reasonKey: 'process-crashed' })
    // ended は child-exited の後
    expect(kinds().indexOf('ended')).toBeGreaterThan(kinds().indexOf('child-exited'))
  })

  it('応答待ち (done) の間に子だけが異常終了しても、終了済みでなく理由付き error になる (FR-012 / SH-022 で発見)', async () => {
    const send = await boot()
    send(launch)
    await vi.waitFor(() => expect(h.preMessageConsumed).toBe(true))
    send(control({ kind: 'send-prompt', text: 'go' }))
    await vi.waitFor(() => expect(states()).toContain('done'))
    h.child?.emit('exit', 1, null)
    await vi.waitFor(() => expect(kinds()).toContain('child-exited'))
    const lastStatus = posted.filter((p) => p.kind === 'status').at(-1)
    expect(lastStatus).toMatchObject({ state: 'error', reasonKey: 'process-crashed' })
    expect(events().some((e) => e.kind === 'failure')).toBe(true)
  })

  it('終了 (end) で子が正常終了したときは error にしない', async () => {
    const send = await boot()
    send(launch)
    await vi.waitFor(() => expect(h.preMessageConsumed).toBe(true))
    send(control({ kind: 'send-prompt', text: 'go' }))
    await vi.waitFor(() => expect(states()).toContain('done'))
    send(control({ kind: 'end' }))
    await vi.waitFor(() => expect(kinds()).toContain('ended'))
    expect(states()).not.toContain('error')
  })

  it('end は done のときに効き、プロンプトの入力を閉じて claude を正常終了させる (end-forced は出ない)', async () => {
    const send = await boot()
    send(launch)
    await vi.waitFor(() => expect(h.preMessageConsumed).toBe(true))
    send(control({ kind: 'send-prompt', text: 'go' }))
    await vi.waitFor(() => expect(states()).toContain('done'))
    send(control({ kind: 'end' }))
    await vi.waitFor(() => expect(kinds()).toContain('ended'))
    expect(kinds()).toContain('child-exited')
    expect(events().some((e) => e.kind === 'end-forced')).toBe(false)
    expect(h.child?.killed).toBe(false)
  })

  it('end は最初のプロンプトを待つ launching でも効き、期限を待たずに子を止め、破損の警告を出さない (pr-gate R1 po H-001)', async () => {
    const send = await boot()
    send(launch)
    await vi.waitFor(() => expect(h.preMessageConsumed).toBe(true))
    send(control({ kind: 'end' })) // launching (プロンプト未送信)
    await vi.waitFor(() => expect(kinds()).toContain('ended'))
    expect(kinds()).toContain('child-exited')
    expect(h.prompts).toEqual([])
    expect(events().some((e) => e.kind === 'end-forced')).toBe(false)
    expect(states()).not.toContain('error')
  })

  it('end が期限内に終わらなければ end-forced を流してから強制終了に落ちる', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      const send = await boot('stuck-on-close')
      send(launch)
      await vi.waitFor(() => expect(h.preMessageConsumed).toBe(true))
      send(control({ kind: 'send-prompt', text: 'go' }))
      await vi.waitFor(() => expect(states()).toContain('done'))
      ;(h.child as FakeChild).exitOnKill = true
      send(control({ kind: 'end' }))
      await vi.advanceTimersByTimeAsync(3100)
      await vi.waitFor(() => expect(kinds()).toContain('ended'))
      expect(events().some((e) => e.kind === 'end-forced')).toBe(true)
      expect(h.child?.killed).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })

  it('kill の後に届いた送信は無視され、run-state は巻き戻らない。ended は子の exit の後 (R3-H-04)', async () => {
    const send = await boot()
    send(launch)
    await vi.waitFor(() => expect(h.preMessageConsumed).toBe(true))
    send(control({ kind: 'send-prompt', text: 'go' }))
    await vi.waitFor(() => expect(states()).toContain('done'))
    send(control({ kind: 'kill' }))
    send(control({ kind: 'send-prompt', text: 'late' }))
    await vi.waitFor(() => expect(kinds()).toContain('ended'))
    expect(h.prompts).toEqual(['go'])
    expect(states().at(-1)).toBe('done')
    expect(states().filter((s) => s === 'running')).toHaveLength(1)
    expect(kinds().indexOf('ended')).toBeGreaterThan(kinds().indexOf('child-exited'))
  })

  it('spawn 前 (launching) の kill でも ended が出る (Worker を残さない。R3-H-03)', async () => {
    const send = await boot('no-spawn')
    send(launch)
    await new Promise((r) => setTimeout(r, 20))
    send(control({ kind: 'kill' }))
    await vi.waitFor(() => expect(kinds()).toContain('ended'))
    expect(kinds()).not.toContain('child-exited')
  })

  it('kill の後に SDK が spawn を呼んでも子を起こさず、失敗にもしない (pr-gate R2 platform-boundary L-102)', async () => {
    const send = await boot('spawn-after-abort')
    send(launch)
    await new Promise((r) => setTimeout(r, 20))
    send(control({ kind: 'kill' }))
    await vi.waitFor(() => expect(kinds()).toContain('ended'))
    await new Promise((r) => setTimeout(r, 20))
    expect(h.child).toBeNull()
    expect(states()).not.toContain('error')
  })

  it('launch のデコードに失敗したら error を通知して ended を送る (Worker を残さない)', async () => {
    const send = await boot()
    send({
      kind: 'launch',
      spec: { ...SPEC, prefixArgs: ['C:\\x'] },
      options: { permissionMode: 'default' }
    })
    expect(kinds()).toEqual(['status', 'ended'])
    expect(posted[0]).toMatchObject({ state: 'error', reasonKey: 'launch-failed' })
  })
})
