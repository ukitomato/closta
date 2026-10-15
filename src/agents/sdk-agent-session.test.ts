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
        for (const m of h.feed) yield m
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

async function boot(
  mode: Mode = 'normal',
  feed: Record<string, unknown>[] = []
): Promise<(data: unknown) => void> {
  h.mode = mode
  h.feed = feed
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

describe('sdk-agent-session: tool の結果と Hook / task の行 (O-2 / BE-024)', () => {
  interface MessageEvent {
    kind: string
    message?: { id: string; role: string; parts: Record<string, unknown>[] }
  }
  const messages = (): NonNullable<MessageEvent['message']>[] =>
    (events() as MessageEvent[])
      .filter((e) => e.kind === 'message')
      .map((e) => e.message as NonNullable<MessageEvent['message']>)

  async function runTurn(feed: Record<string, unknown>[]): Promise<void> {
    const send = await boot('normal', feed)
    send(launch)
    await vi.waitFor(() => expect(h.preMessageConsumed).toBe(true))
    send(control({ kind: 'send-prompt', text: 'go' }))
    await vi.waitFor(() => expect(states()).toContain('done'))
  }

  const assistantWithTools = (uuid: string, ...ids: string[]): Record<string, unknown> => ({
    type: 'assistant',
    uuid,
    message: { content: ids.map((id) => ({ type: 'tool_use', id, name: 'Bash', input: {} })) }
  })
  const userWith = (...content: unknown[]): Record<string, unknown> => ({
    type: 'user',
    message: { role: 'user', content },
    parent_tool_use_id: null
  })

  it('並列の結果が 1 つの user メッセージで来たら、同じ id の message を 1 回だけ送り直す', async () => {
    await runTurn([
      assistantWithTools('m1', 'a', 'b'),
      userWith(
        { type: 'tool_result', tool_use_id: 'a', content: 'one' },
        { type: 'tool_result', tool_use_id: 'b', content: 'two', is_error: true }
      )
    ])
    const m1 = messages().filter((m) => m.id === 'm1')
    expect(m1).toHaveLength(2) // 初回 + 送り直し 1 回
    expect(m1[1]?.parts).toMatchObject([
      { toolCallId: 'a', result: 'one', isError: false },
      { toolCallId: 'b', result: 'two', isError: true }
    ])
  })

  it('対応の無い結果は result:<id>、user の本文は送らない', async () => {
    await runTurn([
      userWith(
        { type: 'text', text: 'USER-BODY-TEXT' },
        { type: 'tool_result', tool_use_id: 'ghost', content: 'r' }
      ),
      { type: 'user', message: { role: 'user', content: 'USER-BODY-TEXT' } }
    ])
    expect(messages().map((m) => m.id)).toEqual(['result:ghost'])
    expect(posted.some((p) => (p.payload ?? '').includes('USER-BODY-TEXT'))).toBe(false)
  })

  it('hook_started / hook_response は同じ id (hook:<id>) の message', async () => {
    await runTurn([
      {
        type: 'system',
        subtype: 'hook_started',
        hook_id: 'h1',
        hook_name: 'fmt',
        hook_event: 'PostToolUse'
      },
      {
        type: 'system',
        subtype: 'hook_response',
        hook_id: 'h1',
        outcome: 'success',
        output: 'SECRET'
      }
    ])
    const rows = messages()
    expect(rows.map((m) => m.id)).toEqual(['hook:h1', 'hook:h1'])
    expect(rows[1]?.parts[0]).toMatchObject({ type: 'system-event', status: 'succeeded' })
    expect(JSON.stringify(rows)).not.toContain('SECRET')
  })

  it('task_started / task_updated / task_notification は同じ id (task:<id>) の message', async () => {
    await runTurn([
      {
        type: 'system',
        subtype: 'task_started',
        task_id: 't1',
        task_type: 'local_agent',
        description: 'scan',
        is_backgrounded: true
      },
      { type: 'system', subtype: 'task_updated', task_id: 't1', patch: { status: 'running' } },
      { type: 'system', subtype: 'task_notification', task_id: 't1', status: 'completed' }
    ])
    expect(messages().map((m) => m.id)).toEqual(['task:t1', 'task:t1', 'task:t1'])
    expect(messages()[2]?.parts[0]).toMatchObject({ status: 'completed' })
  })

  it('hook_progress / background_tasks_changed は送らない。task_progress は task の行の進み具合の更新だけを送る (O-4)', async () => {
    await runTurn([
      { type: 'system', subtype: 'hook_progress', hook_id: 'h1', stdout: 'x' },
      {
        type: 'system',
        subtype: 'task_progress',
        task_id: 't1',
        description: 'TASK-DESCRIPTION',
        summary: 'TASK-SUMMARY',
        usage: { total_tokens: 10, tool_uses: 2, duration_ms: 3000 }
      },
      { type: 'system', subtype: 'background_tasks_changed', tasks: [] }
    ])
    // 行の無い task への更新は renderer の合成が捨てる (O-4 / 014 data-model §3。セッションスレッドは task の状態を持たない)。
    expect(messages()).toEqual([
      {
        id: 'task:t1',
        role: 'system',
        parts: [
          {
            type: 'system-event',
            category: 'task',
            opens: false,
            name: '',
            detail: '\n10/2/3000',
            status: null
          }
        ],
        createdAt: null
      }
    ])
    expect(JSON.stringify(posted)).not.toMatch(/TASK-DESCRIPTION|TASK-SUMMARY/)
  })

  it('permission_denied の扱いは変わらない', async () => {
    await runTurn([
      { type: 'system', subtype: 'permission_denied', tool_name: 'Bash', message: 'no' }
    ])
    expect(events().filter((e) => e.kind === 'permission-denied')).toHaveLength(1)
    expect(messages()).toEqual([])
  })

  it('調停役スレッドへの post の kind は status / event / ended / child-exited のまま', async () => {
    const send = await boot('normal', [
      assistantWithTools('m1', 'a'),
      userWith({ type: 'tool_result', tool_use_id: 'a', content: 'ok' }),
      { type: 'system', subtype: 'hook_started', hook_id: 'h1', hook_name: 'n', hook_event: 'e' }
    ])
    send(launch)
    await vi.waitFor(() => expect(h.preMessageConsumed).toBe(true))
    send(control({ kind: 'send-prompt', text: 'go' }))
    await vi.waitFor(() => expect(states()).toContain('done'))
    send(control({ kind: 'end' }))
    await vi.waitFor(() => expect(kinds()).toContain('ended'))
    expect([...new Set(kinds())].sort()).toEqual(['child-exited', 'ended', 'event', 'status'])
  })
})

describe('sdk-agent-session: 会話の境界・拒否・取り消しの配線 (O-6 / 016 tasks BE-011 / BE-012)', () => {
  interface Ev {
    kind: string
    message?: { id: string; parts: Record<string, unknown>[] }
    meter?: { type: string; messageIds?: string[] }
  }
  const evs = (): Ev[] => events() as Ev[]

  async function runTurn(feed: Record<string, unknown>[]): Promise<void> {
    const send = await boot('normal', feed)
    send(launch)
    await vi.waitFor(() => expect(h.preMessageConsumed).toBe(true))
    send(control({ kind: 'send-prompt', text: 'go' }))
    await vi.waitFor(() => expect(states()).toContain('done'))
  }

  const assistantWithTools = (
    uuid: string,
    toolIds: string[],
    extra: Record<string, unknown> = {}
  ): Record<string, unknown> => ({
    type: 'assistant',
    uuid,
    parent_tool_use_id: null,
    message: { content: toolIds.map((id) => ({ type: 'tool_use', id, name: 'Bash', input: {} })) },
    ...extra
  })

  it('conversation_reset と compact_boundary は行になり、new_conversation_id などを送らない', async () => {
    await runTurn([
      { type: 'conversation_reset', uuid: 'r1', new_conversation_id: 'LEAK-conv', session_id: 's' },
      {
        type: 'system',
        subtype: 'compact_boundary',
        uuid: 'c1',
        compact_metadata: {
          trigger: 'manual',
          pre_tokens: 9,
          post_tokens: 3,
          preserved_segment: 'LEAK-seg'
        }
      }
    ])
    const ids = evs()
      .filter((e) => e.kind === 'message')
      .map((e) => e.message?.id)
    expect(ids).toEqual(['reset:r1', 'compact-boundary:c1'])
    expect(posted.some((p) => (p.payload ?? '').includes('LEAK-'))).toBe(false)
  })

  it('supersedes の retraction は代わりのメッセージの message より前に届く', async () => {
    await runTurn([
      assistantWithTools('old1', ['tu1']),
      assistantWithTools('new1', [], { supersedes: ['old1'] })
    ])
    const order = evs()
      .filter((e) => e.kind === 'message' || e.meter?.type === 'retraction')
      .map((e) =>
        e.kind === 'message' ? e.message?.id : `retraction:${e.meter?.messageIds?.join(',')}`
      )
    expect(order).toEqual(['old1', 'retraction:old1', 'new1'])
  })

  it('取り消した後に結果が届いても同じ id の message も結果だけのメッセージも送らず、取り消した id の assistant を後で受けても送らない', async () => {
    await runTurn([
      assistantWithTools('old1', ['tu1']),
      assistantWithTools('new1', [], { supersedes: ['old1'] }),
      {
        type: 'user',
        message: {
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: 'tu1', content: 'r' }]
        },
        parent_tool_use_id: null
      },
      assistantWithTools('old1', ['tu1'])
    ])
    const ids = evs()
      .filter((e) => e.kind === 'message')
      .map((e) => e.message?.id)
    expect(ids).toEqual(['old1', 'new1'])
  })

  it('model_refusal_fallback の retracted_message_uuids も retraction になる (行には入れない)', async () => {
    await runTurn([
      assistantWithTools('old1', ['tu1']),
      {
        type: 'system',
        subtype: 'model_refusal_fallback',
        uuid: 'f1',
        retracted_message_uuids: ['old1', 'old1'],
        fallback_model: 'claude-sonnet-4-5'
      }
    ])
    const retractions = evs().filter((e) => e.meter?.type === 'retraction')
    expect(retractions).toHaveLength(1)
    expect(retractions[0]?.meter?.messageIds).toEqual(['old1'])
    const row = evs().find((e) => e.message?.id === 'refusal:f1')
    expect(JSON.stringify(row)).not.toContain('old1')
  })
})

describe('sdk-agent-session: live-signals の配線 (O-4 / 014 tasks BE-004 / BE-012 / BE-020 / BE-040 / BE-042)', () => {
  async function runTurn(feed: Record<string, unknown>[]): Promise<void> {
    const send = await boot('normal', feed)
    send(launch)
    await vi.waitFor(() => expect(h.preMessageConsumed).toBe(true))
    send(control({ kind: 'send-prompt', text: 'go' }))
  }

  async function failureOf(feed: Record<string, unknown>[]): Promise<unknown[]> {
    await runTurn(feed)
    await vi.waitFor(() => expect(kinds()).toContain('ended'))
    expect(states()).toContain('error')
    expect(states()).not.toContain('done')
    return events().filter((e) => e.kind === 'failure')
  }

  it('api_error_status: 429 の失敗で failure が rate-limited (失敗になる)', async () => {
    expect(
      await failureOf([
        { type: 'result', subtype: 'error_during_execution', is_error: true, api_error_status: 429 }
      ])
    ).toEqual([{ kind: 'failure', reasonKey: 'rate-limited' }])
  })

  it('failure (理由) は state: error より先に届く (renderer が失敗に入ったときに理由を読めるように。US-1 AC5)', async () => {
    await failureOf([{ type: 'result', subtype: 'error_max_turns', is_error: true }])
    const order = events()
      .filter((e) => e.kind === 'failure' || (e.kind === 'state' && e.state === 'error'))
      .map((e) => e.kind)
    expect(order).toEqual(['failure', 'state'])
  })

  it('同じターンの主ループの assistant の billing_error で billing', async () => {
    expect(
      await failureOf([
        {
          type: 'assistant',
          uuid: 'm1',
          parent_tool_use_id: null,
          message: { content: [] },
          error: 'billing_error'
        },
        { type: 'result', subtype: 'success', is_error: true }
      ])
    ).toEqual([{ kind: 'failure', reasonKey: 'billing' }])
  })

  it('知らない形の失敗は provider-error (状態通知の reasonKey も同じ)', async () => {
    expect(
      await failureOf([{ type: 'result', subtype: 'unexpected_new_subtype', is_error: true }])
    ).toEqual([{ kind: 'failure', reasonKey: 'provider-error' }])
    const errorStatuses = posted.filter((p) => p.kind === 'status' && p.state === 'error')
    expect(errorStatuses.length).toBeGreaterThan(0)
    for (const status of errorStatuses) expect(status.reasonKey).toBe('provider-error')
  })

  it('失敗の文字列 (errors / result) は event にも状態通知にも載らない', async () => {
    await failureOf([
      {
        type: 'result',
        subtype: 'error_during_execution',
        is_error: true,
        errors: ['ERRORS-TEXT-MARKER'],
        result: 'RESULT-TEXT-MARKER'
      }
    ])
    const all = JSON.stringify(posted)
    expect(all).not.toContain('ERRORS-TEXT-MARKER')
    expect(all).not.toContain('RESULT-TEXT-MARKER')
    expect(events().filter((e) => e.kind === 'failure')).toEqual([
      { kind: 'failure', reasonKey: 'execution-error' }
    ])
  })

  it('成功の result では完了のまま (失敗にしない)', async () => {
    await runTurn([])
    await vi.waitFor(() => expect(states()).toContain('done'))
    expect(events().some((e) => e.kind === 'failure')).toBe(false)
  })

  it('rate_limit_event は meter の rate-limit、主ループの tool_progress は meter の tool-elapsed を送る (014 tasks BE-020 / BE-042)', async () => {
    await runTurn([
      {
        type: 'rate_limit_event',
        rate_limit_info: {
          status: 'rejected',
          utilization: 1,
          resetsAt: 1_760_000_000,
          limitScope: 'LEAK-limitScope',
          errorCode: 'LEAK-errorCode'
        }
      },
      {
        type: 'tool_progress',
        tool_use_id: 'toolu_1',
        tool_name: 'Bash',
        parent_tool_use_id: null,
        elapsed_time_seconds: 3
      }
    ])
    await vi.waitFor(() => expect(states()).toContain('done'))
    expect(events().filter((e) => e.kind === 'meter')).toEqual([
      {
        kind: 'meter',
        meter: {
          type: 'rate-limit',
          status: 'rejected',
          limitType: null,
          utilizationPct: 100,
          resetsAtSec: 1_760_000_000,
          usingOverage: false
        }
      },
      { kind: 'meter', meter: { type: 'tool-elapsed', toolUseId: 'toolu_1', elapsedSeconds: 3 } }
    ])
    expect(events().some((e) => e.kind === 'failure')).toBe(false)
    expect(events().filter((e) => e.kind === 'message')).toEqual([])
    expect(JSON.stringify(posted)).not.toContain('LEAK')
    expect(JSON.stringify(posted)).not.toContain('"Bash"')
  })

  it('最上位の auth_status と system の plugin_install は行になり、output / error を送らない (015 tasks BE-031)', async () => {
    await runTurn([
      { type: 'auth_status', isAuthenticating: true, output: ['LEAK-output'] },
      {
        type: 'auth_status',
        isAuthenticating: false,
        output: ['LEAK-output'],
        error: 'LEAK-error'
      },
      { type: 'system', subtype: 'plugin_install', status: 'started', name: 'acme' },
      { type: 'system', subtype: 'plugin_install', status: 'installed', name: 'acme' },
      { type: 'system', subtype: 'plugin_install', status: 'completed', error: 'LEAK-plugin' }
    ])
    await vi.waitFor(() => expect(states()).toContain('done'))
    type RowEvent = {
      kind: string
      message?: { id: string; parts: { type: string; status?: string | null }[] }
    }
    const rows = (events() as RowEvent[]).flatMap((e) => {
      const part = e.message?.parts[0]
      return e.kind === 'message' && e.message && part?.type === 'system-event'
        ? [{ id: e.message.id, status: part.status }]
        : []
    })
    expect(rows).toEqual([
      { id: 'auth:0', status: 'authenticating' },
      { id: 'auth:0', status: 'failed' },
      { id: 'plugin:0', status: 'started' },
      { id: 'plugin:0', status: null },
      { id: 'plugin:0', status: 'completed' }
    ])
    expect(JSON.stringify(posted)).not.toContain('LEAK')
  })

  it('間引いて保留した値は、終わった後 (ended の後) に送らない (終了の後に timer が発火しない。014 spec SC-004)', async () => {
    const send = await boot('normal', [
      // task の鍵は result の後も残る (背景の task はターンをまたぐ)。2 つ目は 1 秒の間隔の中なので保留になる。
      {
        type: 'system',
        subtype: 'task_progress',
        task_id: 't1',
        usage: { total_tokens: 1, tool_uses: 1, duration_ms: 1 }
      },
      {
        type: 'system',
        subtype: 'task_progress',
        task_id: 't1',
        usage: { total_tokens: 2, tool_uses: 2, duration_ms: 2 }
      },
      { type: 'system', subtype: 'thinking_tokens', estimated_tokens: 5 },
      { type: 'system', subtype: 'thinking_tokens', estimated_tokens: 6 }
    ])
    send(launch)
    await vi.waitFor(() => expect(h.preMessageConsumed).toBe(true))
    send(control({ kind: 'send-prompt', text: 'go' }))
    await vi.waitFor(() => expect(states()).toContain('done'))
    send(control({ kind: 'end' }))
    await vi.waitFor(() => expect(kinds()).toContain('ended'))
    const endedAt = kinds().lastIndexOf('ended')
    // 保留の境 (1 秒) を過ぎるまで待つ
    await new Promise((resolve) => setTimeout(resolve, 1_300))
    expect(posted.slice(endedAt + 1)).toEqual([])
    // 思考の保留 (2 つ目) は result で取り消したので、どこにも送られていない
    const sentText = posted.map((p) => p.payload ?? '').join('\n')
    expect(sentText).toContain('"estimatedTokens":5')
    expect(sentText).not.toContain('"estimatedTokens":6')
  })

  interface RowEvent {
    kind: string
    message?: { id: string; role: string; parts: Record<string, unknown>[] }
  }
  const retryRows = (): Record<string, unknown>[] =>
    (events() as RowEvent[])
      .filter((e) => e.kind === 'message' && e.message?.id.startsWith('retry:') === true)
      .map((e) => ({ id: e.message?.id, ...e.message?.parts[0] }))

  it('api_retry は message の経路で再試行の行を送り、成功の result で succeeded に閉じる', async () => {
    await runTurn([
      {
        type: 'system',
        subtype: 'api_retry',
        attempt: 1,
        max_retries: 10,
        retry_delay_ms: 2000,
        error_status: 529,
        error: 'LEAK-error',
        no_response: { waited_ms: 'LEAK-waited', retry_wait_ms: 1 }
      }
    ])
    await vi.waitFor(() => expect(states()).toContain('done'))
    expect(retryRows()).toEqual([
      {
        id: 'retry:0',
        type: 'system-event',
        category: 'api-retry',
        opens: true,
        name: '',
        detail: '1/10/529/2000',
        status: 'retrying'
      },
      {
        id: 'retry:0',
        type: 'system-event',
        category: 'api-retry',
        opens: false,
        name: '',
        detail: '',
        status: 'succeeded'
      }
    ])
    expect(JSON.stringify(posted)).not.toContain('LEAK')
  })

  it('status / init の権限モードが起動の設定と違えば meter と権限モードの行を 1 回だけ送り、強制はしない (014 tasks BE-040)', async () => {
    await runTurn([
      { type: 'system', subtype: 'status', status: null, permissionMode: 'acceptEdits' },
      {
        type: 'system',
        subtype: 'init',
        permissionMode: 'acceptEdits',
        cwd: '/home/LEAK-cwd',
        tools: ['LEAK-tool']
      }
    ])
    await vi.waitFor(() => expect(states()).toContain('done'))
    expect(events().filter((e) => e.kind === 'meter')).toEqual([
      { kind: 'meter', meter: { type: 'permission-mode', mode: 'acceptEdits' } }
    ])
    expect(
      (events() as RowEvent[])
        .filter((e) => e.kind === 'message')
        .map((e) => ({ id: e.message?.id, ...e.message?.parts[0] }))
    ).toEqual([
      {
        id: 'mode:0',
        type: 'system-event',
        category: 'permission-mode',
        opens: true,
        name: '',
        detail: 'acceptEdits',
        status: 'changed'
      }
    ])
    // 強制しない (中断・失敗にしない。U-6)
    expect(events().some((e) => e.kind === 'failure')).toBe(false)
    expect(states()).not.toContain('error')
    expect(JSON.stringify(posted)).not.toContain('LEAK')
  })

  it('init / commands_changed は meter の init-report / commands で送り、状態通知に載せない (015 tasks BE-020)', async () => {
    await runTurn([
      {
        type: 'system',
        subtype: 'init',
        permissionMode: 'default',
        cwd: '/home/LEAK-cwd',
        apiKeySource: 'LEAK-api-key-source',
        model: 'claude-opus-4',
        mcp_servers: [{ name: 'github', status: 'needs-auth' }],
        tools: ['Bash'],
        skills: [],
        plugins: [{ name: 'plug', path: '/LEAK-plugin-path' }],
        slash_commands: ['/review']
      },
      {
        type: 'system',
        subtype: 'commands_changed',
        commands: [
          { name: 'review', description: 'd', argumentHint: '<pr>', aliases: ['LEAK-alias'] }
        ]
      }
    ])
    await vi.waitFor(() => expect(states()).toContain('done'))
    expect(events().filter((e) => e.kind === 'meter')).toEqual([
      {
        kind: 'meter',
        meter: {
          type: 'init-report',
          model: 'claude-opus-4',
          mcpServers: [{ name: 'github', status: 'needs-auth' }],
          tools: ['Bash'],
          skills: [],
          plugins: [{ name: 'plug', version: null }],
          slashCommands: ['review'],
          omitted: 0
        }
      },
      {
        kind: 'meter',
        meter: {
          type: 'commands',
          commands: [{ name: 'review', description: 'd', argumentHint: '<pr>' }],
          omitted: 0
        }
      }
    ])
    expect(JSON.stringify(posted)).not.toContain('LEAK')
    const statusText = JSON.stringify(posted.filter((p) => p.kind === 'status'))
    expect(statusText).not.toContain('init-report')
    expect(statusText).not.toContain('github')
  })

  it('失敗の result では再試行の行を failed に閉じ、閉じは failure と state: error より先に届く', async () => {
    await failureOf([
      {
        type: 'system',
        subtype: 'api_retry',
        attempt: 3,
        max_retries: 3,
        retry_delay_ms: 8000,
        error_status: null
      },
      { type: 'result', subtype: 'success', is_error: true, api_error_status: 529 }
    ])
    expect(retryRows().map((r) => r.status)).toEqual(['retrying', 'failed'])
    const order = (events() as (RowEvent & { state?: string })[])
      .filter(
        (e) =>
          (e.kind === 'message' && e.message?.parts[0]?.status === 'failed') ||
          e.kind === 'failure' ||
          (e.kind === 'state' && e.state === 'error')
      )
      .map((e) => e.kind)
    expect(order).toEqual(['message', 'failure', 'state'])
  })
})
