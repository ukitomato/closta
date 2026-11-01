import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { WIN32_LAUNCH_SPEC_FIXTURE } from '@domain/session/__fixtures__/win32-launch-spec'

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
  /** spawn の呼び出しの記録 (X-8: cwd / windowsHide / shell を確かめる)。 */
  spawnCalls: [] as { command: string; args: string[]; options: Record<string, unknown> }[],
  /** テストから stream に流すメッセージ。 */
  feed: [] as Record<string, unknown>[],
  wakeFeed: null as null | (() => void),
  /** query() に渡った options (`canUseTool` / `onElicitation` をテストから呼ぶ。O-10 BE-022)。 */
  options: null as null | Record<string, unknown>,
  /** あれば、init と feed の後でターンをこの promise が解決するまで開けておく。 */
  holdTurn: null as null | Promise<void>,
  interrupts: 0,
  /** Win32 の停止のコマンドの呼び出しの記録 (stdio: 'ignore' の spawn を停止のコマンドとみなす。X-8 / BE-030)。 */
  stopCalls: [] as { command: string; args: string[]; options: Record<string, unknown> }[],
  /** 停止のコマンドの振る舞い: ok = 子を終わらせて 0 / nonzero / error / hang。 */
  stopMode: 'ok' as 'ok' | 'nonzero' | 'error' | 'hang',
  /** true なら claude の子の pid を未設定にする。 */
  pidless: false,
  /** 出来事の順番の記録 (stop / child-exit / kill / abort)。 */
  order: [] as string[],
  /** 最初のプロンプトの後に流す `init` (既定は素の init。再開のテストで session_id と権限モードを足す。X-9)。 */
  initMessage: null as null | Record<string, unknown>,
  /** spawn の直後 (init の前) の終わり方: exit = 子だけ異常終了 / throw = stream が例外 / end = 例外なく終わる (X-9 の経路 A / B / C)。 */
  preInit: null as null | 'exit' | 'throw' | 'end',
  /** 実行中の設定の切り替え (023): SDK の `setPermissionMode` / `setModel` の呼び出しの記録と reject の指定。 */
  setModeCalls: [] as unknown[][],
  setModelCalls: [] as unknown[][],
  liveSettingReject: false,
  /** 一覧の読み取り (025): `supportedModels` の呼び出し回数・返り値・reject の指定。 */
  supportedModelsCalls: 0,
  supportedModelsResult: [] as unknown,
  supportedModelsReject: false
}))

vi.mock('node:worker_threads', () => ({
  get parentPort() {
    return h.port
  }
}))

vi.mock('node:child_process', () => ({
  spawn: vi.fn((command: string, args: string[], options: Record<string, unknown>) => {
    if (options.stdio === 'ignore') {
      h.stopCalls.push({ command, args, options })
      h.order.push('stop')
      const stop = h.createEmitter() as FakeChild
      queueMicrotask(() => {
        if (h.stopMode === 'hang') return
        if (h.stopMode === 'error') {
          stop.emit('error', new Error('spawn failed'))
          return
        }
        if (h.stopMode === 'nonzero') {
          stop.emit('exit', 128, null)
          return
        }
        h.order.push('child-exit')
        h.child?.emit('exit', null, 'SIGKILL')
        stop.emit('exit', 0, null)
      })
      return stop
    }
    h.spawnCalls.push({ command, args, options })
    const child = h.createEmitter() as FakeChild
    child.pid = h.pidless ? (undefined as unknown as number) : 4242
    child.killed = false
    child.exitOnKill = h.mode !== 'stuck-on-close'
    child.kill = () => {
      child.killed = true
      h.order.push('kill')
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
    signal.addEventListener('abort', () => h.order.push('abort'), { once: true })
    h.options = options as unknown as Record<string, unknown>
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
      if (h.preInit === 'exit') h.child?.emit('exit', 1, null)
      if (h.preInit === 'throw') throw new Error('stream broke before init')
      if (h.preInit === 'end') return
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
        yield h.initMessage ?? { type: 'system', subtype: 'init' }
        for (const m of h.feed) yield m
        if (h.holdTurn !== null) await h.holdTurn
        if (h.mode === 'crash-midstream') {
          // wsl.exe だけが異常終了し、stream が壊れる。
          h.child?.emit('exit', 1, null)
          throw new Error('stream broke')
        }
        yield { type: 'result', subtype: 'success', is_error: false }
      }
    }
    return Object.assign(stream(), {
      interrupt: async () => {
        h.interrupts += 1
        return {}
      },
      setPermissionMode: async (...args: unknown[]) => {
        h.setModeCalls.push(args)
        if (h.liveSettingReject) throw new Error('secret reject reason')
      },
      setModel: async (...args: unknown[]) => {
        h.setModelCalls.push(args)
        if (h.liveSettingReject) throw new Error('secret reject reason')
      },
      supportedModels: async () => {
        h.supportedModelsCalls += 1
        if (h.supportedModelsReject) throw new Error('secret models reason')
        return h.supportedModelsResult
      }
    })
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
  h.spawnCalls = []
  h.stopCalls = []
  h.stopMode = 'ok'
  h.pidless = false
  h.order = []
  h.options = null
  h.holdTurn = null
  h.interrupts = 0
  h.initMessage = null
  h.preInit = null
  h.setModeCalls = []
  h.setModelCalls = []
  h.liveSettingReject = false
  h.supportedModelsCalls = 0
  h.supportedModelsResult = []
  h.supportedModelsReject = false
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

describe('sdk-agent-session: Win32 の起動の値の検査と起動 (X-8 / BE-010)', () => {
  const win32Launch = (spec: unknown): unknown => ({
    kind: 'launch',
    spec,
    options: { permissionMode: 'default' }
  })
  const fixture = WIN32_LAUNCH_SPEC_FIXTURE as unknown as Record<string, unknown>
  const stopOf = (patch: Record<string, unknown>): Record<string, unknown> => ({
    ...WIN32_LAUNCH_SPEC_FIXTURE.stop,
    ...patch
  })

  it('正規の fixture (contracts C-4) が通り、cwd と windowsHide つき・シェルなしで起動する', async () => {
    const send = await boot()
    send(win32Launch(WIN32_LAUNCH_SPEC_FIXTURE))
    await vi.waitFor(() => expect(h.preMessageConsumed).toBe(true))
    expect(states()).not.toContain('error')
    expect(h.spawnCalls).toHaveLength(1)
    const { command, args, options } = h.spawnCalls[0]!
    expect(command).toBe(WIN32_LAUNCH_SPEC_FIXTURE.pathToClaudeCodeExecutable)
    expect(args).toEqual([])
    expect(options.cwd).toBe(WIN32_LAUNCH_SPEC_FIXTURE.cwd)
    expect(options.windowsHide).toBe(true)
    expect(options.shell).toBe(false)
    expect(options.env).toEqual(WIN32_LAUNCH_SPEC_FIXTURE.env)
  })

  it('WSL の起動の呼び出しに cwd / windowsHide のキーが無い', async () => {
    const send = await boot()
    send(launch)
    await vi.waitFor(() => expect(h.preMessageConsumed).toBe(true))
    const options = h.spawnCalls[0]?.options ?? {}
    expect('cwd' in options).toBe(false)
    expect('windowsHide' in options).toBe(false)
  })

  it('stop.command の末尾の名前の大文字は通る', async () => {
    const send = await boot()
    send(
      win32Launch({ ...fixture, stop: stopOf({ command: 'C:\\WINDOWS\\System32\\TASKKILL.EXE' }) })
    )
    await vi.waitFor(() => expect(h.preMessageConsumed).toBe(true))
    expect(states()).not.toContain('error')
  })

  const withoutKey = (key: string): Record<string, unknown> => {
    const copy = { ...fixture }
    delete copy[key]
    return copy
  }
  const rejected: [string, unknown][] = [
    [
      '.exe でない',
      { ...fixture, pathToClaudeCodeExecutable: 'C:\\a\\claude.cmd', command: 'C:\\a\\claude.cmd' }
    ],
    ['相対', { ...fixture, pathToClaudeCodeExecutable: 'claude.exe', command: 'claude.exe' }],
    [
      'UNC',
      {
        ...fixture,
        pathToClaudeCodeExecutable: '\\\\wsl$\\U\\claude.exe',
        command: '\\\\wsl$\\U\\claude.exe'
      }
    ],
    ['command が違う', { ...fixture, command: 'C:\\other\\claude.exe' }],
    ['prefixArgs のキーがある', { ...fixture, prefixArgs: [] }],
    ['cwd が無い', withoutKey('cwd')],
    ['cwd が相対', { ...fixture, cwd: 'dev' }],
    ['WSLENV', { ...fixture, env: { WSLENV: 'x' } }],
    ['wslenv', { ...fixture, env: { wslenv: 'x' } }],
    ['WSL_UTF8', { ...fixture, env: { WSL_UTF8: '1' } }],
    ['windowsHide が無い', withoutKey('windowsHide')],
    ['windowsHide が false', { ...fixture, windowsHide: false }],
    ['windowsHide が文字列', { ...fixture, windowsHide: 'true' }],
    ['stop が無い', withoutKey('stop')],
    ['stop が null', { ...fixture, stop: null }],
    ['stop が配列', { ...fixture, stop: [] }],
    ['argsBeforePid が /IM', { ...fixture, stop: stopOf({ argsBeforePid: ['/T', '/F', '/IM'] }) }],
    [
      'argsBeforePid が /PID の重複',
      { ...fixture, stop: stopOf({ argsBeforePid: ['/T', '/F', '/PID', '/PID'] }) }
    ],
    ['argsBeforePid が /X', { ...fixture, stop: stopOf({ argsBeforePid: ['/X'] }) }],
    ['argsBeforePid の /PID の欠落', { ...fixture, stop: stopOf({ argsBeforePid: ['/T', '/F'] }) }],
    [
      'argsBeforePid が小文字',
      { ...fixture, stop: stopOf({ argsBeforePid: ['/t', '/f', '/pid'] }) }
    ],
    ['argsBeforePid が配列でない', { ...fixture, stop: stopOf({ argsBeforePid: '/T /F /PID' }) }],
    [
      'stop.command が cmd.exe',
      { ...fixture, stop: stopOf({ command: 'C:\\WINDOWS\\System32\\cmd.exe' }) }
    ],
    [
      'stop.command が .cmd',
      { ...fixture, stop: stopOf({ command: 'C:\\WINDOWS\\System32\\taskkill.cmd' }) }
    ],
    [
      'stop.command が拡張子なし',
      { ...fixture, stop: stopOf({ command: 'C:\\WINDOWS\\System32\\taskkill' }) }
    ],
    ['stop.command が相対', { ...fixture, stop: stopOf({ command: 'taskkill.exe' }) }],
    ['stop.command が UNC', { ...fixture, stop: stopOf({ command: '\\\\h\\s\\taskkill.exe' }) }],
    ['知らない kind', { ...fixture, kind: 'posix' }]
  ]

  it.each(rejected)('%s は launch-failed で終わり、子を起こさない', async (_name, spec) => {
    const send = await boot()
    send(win32Launch(spec))
    expect(kinds()).toEqual(['status', 'ended'])
    expect(posted[0]).toMatchObject({ state: 'error', reasonKey: 'launch-failed' })
    expect(h.spawnCalls).toHaveLength(0)
  })

  it('値が文字列でない env のキーは捨てる', async () => {
    const send = await boot()
    send(win32Launch({ ...fixture, env: { PATH: 'C:\\x', BAD: 1 } }))
    await vi.waitFor(() => expect(h.preMessageConsumed).toBe(true))
    const options = h.spawnCalls[0]?.options
    expect(options?.env).toEqual({ PATH: 'C:\\x' })
  })
})

describe('sdk-agent-session: Win32 のプロセス木の停止と順番 (X-8 / BE-030)', () => {
  const win32Launch = {
    kind: 'launch',
    spec: WIN32_LAUNCH_SPEC_FIXTURE,
    options: { permissionMode: 'default' }
  }
  const stderrLines = (spy: { mock: { calls: unknown[][] } }): string =>
    spy.mock.calls.map((c) => String(c[0])).join('')

  async function bootWin32(prompt = true): Promise<(data: unknown) => void> {
    const send = await boot()
    send(win32Launch)
    await vi.waitFor(() => expect(h.preMessageConsumed).toBe(true))
    if (prompt) {
      send(control({ kind: 'send-prompt', text: 'go' }))
      await vi.waitFor(() => expect(states()).toContain('done'))
    }
    return send
  }

  const spies: { mockRestore: () => void }[] = []
  const quietStderr = (): ReturnType<typeof vi.spyOn> => {
    const spy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    spies.push(spy)
    return spy
  }

  afterEach(() => {
    vi.useRealTimers()
    for (const spy of spies.splice(0)) spy.mockRestore()
  })

  it('強制終了: 停止の起動 → 子の exit → abort の順で、その後に ended を送る', async () => {
    const send = await bootWin32()
    send(control({ kind: 'kill' }))
    await vi.waitFor(() => expect(kinds()).toContain('ended'))
    expect(h.order).toEqual(['stop', 'child-exit', 'abort'])
    expect(kinds().indexOf('ended')).toBeGreaterThan(kinds().indexOf('child-exited'))
  })

  it('停止のコマンドは spec の値だけで起こす (引数 = [...argsBeforePid, pid]・shell なし・windowsHide・stdio ignore・stop.env)', async () => {
    const send = await bootWin32()
    send(control({ kind: 'kill' }))
    await vi.waitFor(() => expect(kinds()).toContain('ended'))
    expect(h.stopCalls).toHaveLength(1)
    const { command, args, options } = h.stopCalls[0]!
    expect(command).toBe(WIN32_LAUNCH_SPEC_FIXTURE.stop.command)
    expect(args).toEqual([...WIN32_LAUNCH_SPEC_FIXTURE.stop.argsBeforePid, '4242'])
    expect(options.shell).toBe(false)
    expect(options.windowsHide).toBe(WIN32_LAUNCH_SPEC_FIXTURE.windowsHide)
    expect(options.stdio).toBe('ignore')
    expect(options.env).toEqual(WIN32_LAUNCH_SPEC_FIXTURE.stop.env)
  })

  it('2 回目の kill や重なった kill でも停止のコマンドは 1 回', async () => {
    const send = await bootWin32()
    send(control({ kind: 'kill' }))
    send(control({ kind: 'kill' }))
    await vi.waitFor(() => expect(kinds()).toContain('ended'))
    expect(h.stopCalls).toHaveLength(1)
  })

  it('子が自然に終わった後は停止のコマンドを起こさない', async () => {
    const send = await bootWin32()
    h.child?.emit('exit', 0, null)
    send(control({ kind: 'kill' }))
    await vi.waitFor(() => expect(kinds()).toContain('ended'))
    expect(h.stopCalls).toHaveLength(0)
  })

  it('穏当な終了 (end) では停止のコマンドを起こさず、claude の自分からの終了で終わる', async () => {
    const send = await bootWin32()
    send(control({ kind: 'end' }))
    await vi.waitFor(() => expect(kinds()).toContain('ended'))
    expect(h.stopCalls).toHaveLength(0)
    expect(h.child?.killed).toBe(false)
  })

  it('最初のプロンプトの前の end は強制終了と同じ順番 (end-forced は出さない)', async () => {
    const send = await bootWin32(false)
    send(control({ kind: 'end' }))
    await vi.waitFor(() => expect(kinds()).toContain('ended'))
    expect(h.order).toEqual(['stop', 'child-exit', 'abort'])
    expect(events().some((e) => e.kind === 'end-forced')).toBe(false)
  })

  it('セッションスレッドの例外 (fatalSink) でも、キューを閉じる前に木ごと止めてから ended を送る', async () => {
    await bootWin32()
    const fatal = process
      .listeners('uncaughtException')
      .filter((l) => !baseline.uncaught.includes(l))
    expect(fatal.length).toBeGreaterThan(0)
    ;(fatal[0] as (error: Error, origin: string) => void)(new Error('boom'), 'uncaughtException')
    await vi.waitFor(() => expect(kinds()).toContain('ended'))
    expect(h.stopCalls).toHaveLength(1)
    expect(h.order.indexOf('stop')).toBeLessThan(h.order.indexOf('child-exit'))
  })

  it('起動前 (spawn 前) の kill は停止のコマンドを起こさず今と同じ (ended が出る)', async () => {
    const send = await boot('no-spawn')
    send(win32Launch)
    await new Promise((r) => setTimeout(r, 20))
    send(control({ kind: 'kill' }))
    await vi.waitFor(() => expect(kinds()).toContain('ended'))
    expect(h.stopCalls).toHaveLength(0)
  })

  it('停止のコマンドが非 0 で終わって子が生きていれば child.kill() に落とし、fallback を記録する', async () => {
    const spy = quietStderr()
    const send = await boot()
    h.stopMode = 'nonzero'
    send(win32Launch)
    await vi.waitFor(() => expect(h.preMessageConsumed).toBe(true))
    send(control({ kind: 'send-prompt', text: 'go' }))
    await vi.waitFor(() => expect(states()).toContain('done'))
    send(control({ kind: 'kill' }))
    await vi.waitFor(() => expect(kinds()).toContain('ended'))
    expect(h.child?.killed).toBe(true)
    expect(stderrLines(spy)).toContain('[tree-stop] fallback')
  })

  it('停止のコマンドの起動の失敗でも child.kill() に落とす', async () => {
    const spy = quietStderr()
    const send = await boot()
    h.stopMode = 'error'
    send(win32Launch)
    await vi.waitFor(() => expect(h.preMessageConsumed).toBe(true))
    send(control({ kind: 'kill' }))
    await vi.waitFor(() => expect(kinds()).toContain('ended'))
    expect(h.child?.killed).toBe(true)
    expect(stderrLines(spy)).toContain('[tree-stop] fallback')
  })

  it('pid が無ければ停止のコマンドを起こさず child.kill() に落とす', async () => {
    quietStderr()
    const send = await boot()
    h.pidless = true
    send(win32Launch)
    await vi.waitFor(() => expect(h.preMessageConsumed).toBe(true))
    send(control({ kind: 'kill' }))
    await vi.waitFor(() => expect(kinds()).toContain('ended'))
    expect(h.stopCalls).toHaveLength(0)
    expect(h.child?.killed).toBe(true)
  })

  it('期限 (5,000 ms) を過ぎたら timeout を記録して先へ進み、閉じる操作が終わる (パス・pid・env を記録しない)', async () => {
    const spy = quietStderr()
    const send = await boot()
    h.stopMode = 'hang'
    send(win32Launch)
    await vi.waitFor(() => expect(h.preMessageConsumed).toBe(true))
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    send(control({ kind: 'kill' }))
    await vi.advanceTimersByTimeAsync(4999)
    expect(kinds()).not.toContain('ended')
    await vi.advanceTimersByTimeAsync(1)
    await vi.waitFor(() => expect(kinds()).toContain('ended'))
    const written = stderrLines(spy)
    expect(written).toContain('[tree-stop] timeout')
    expect(written).not.toContain('4242')
    expect(written).not.toContain('C:\\')
  })

  it('interrupt ではプロセスを止めない (FR-010)', async () => {
    const send = await bootWin32()
    send(control({ kind: 'interrupt' }))
    await vi.waitFor(() => expect(h.interrupts).toBe(1))
    expect(h.stopCalls).toHaveLength(0)
    expect(h.order).not.toContain('kill')
  })

  it('WSL の spec では停止のコマンドを起こさず、今の順番 (child.kill → abort) のまま', async () => {
    const send = await boot()
    send(launch)
    await vi.waitFor(() => expect(h.preMessageConsumed).toBe(true))
    send(control({ kind: 'kill' }))
    await vi.waitFor(() => expect(kinds()).toContain('ended'))
    expect(h.stopCalls).toHaveLength(0)
    expect(h.order.slice(0, 2)).toEqual(['kill', 'abort'])
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

  it('別のメッセージの server_tool_use の結果を同じ id に埋めて 1 回送り直し、届いたメッセージから孤児を外す (O-12 BE-032)', async () => {
    await runTurn([
      {
        type: 'assistant',
        uuid: 's1',
        message: {
          content: [
            { type: 'server_tool_use', id: 'srv_1', name: 'web_search', input: { query: 'q' } }
          ]
        }
      },
      {
        type: 'assistant',
        uuid: 's2',
        message: {
          content: [
            { type: 'text', text: 'found' },
            {
              type: 'web_search_tool_result',
              tool_use_id: 'srv_1',
              content: [{ type: 'web_search_result', title: 'T', url: 'https://e.com' }]
            }
          ]
        }
      },
      {
        type: 'assistant',
        uuid: 's3',
        message: {
          content: [{ type: 'web_fetch_tool_result', tool_use_id: 'srv_1', content: 'x' }]
        }
      }
    ])
    const rows = messages()
    expect(rows.map((m) => m.id)).toEqual(['s1', 's1', 's2', 's3'])
    expect(rows[0]?.parts[0]).toMatchObject({ type: 'server-tool-call', result: null })
    expect(rows[1]?.parts[0]).toMatchObject({
      type: 'server-tool-call',
      toolName: 'web_search',
      result: { kind: 'web-search' }
    })
    // 届いたメッセージからは孤児が外れ、他の part は残る。2 つ目の結果 (s3) は孤児のまま出る。
    expect(rows[2]?.parts.map((p) => p.type)).toEqual(['text'])
    expect(rows[3]?.parts[0]).toMatchObject({ type: 'server-tool-call', toolName: '' })
  })

  it('実行中の user のメッセージの server_tool_use や未知のブロックは何も出さない (O-12 U-10)', async () => {
    await runTurn([
      userWith(
        { type: 'server_tool_use', id: 'srv_1', name: 'x', input: {} },
        { type: 'search_result', content: 'USER-BLOCK-MARK' }
      )
    ])
    expect(messages()).toEqual([])
    expect(posted.some((p) => (p.payload ?? '').includes('USER-BLOCK-MARK'))).toBe(false)
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

  it('一般の Hook (PreToolUse / Stop) も同じ行になり、出力本文を持たず、hook_progress は送らない (O-11 US-1 / SC-001)', async () => {
    await runTurn([
      {
        type: 'system',
        subtype: 'hook_started',
        hook_id: 'g1',
        hook_name: 'PreToolUse:Bash',
        hook_event: 'PreToolUse'
      },
      { type: 'system', subtype: 'hook_progress', hook_id: 'g1', stdout: 'PROGRESS-OUT' },
      {
        type: 'system',
        subtype: 'hook_response',
        hook_id: 'g1',
        hook_name: 'PreToolUse:Bash',
        hook_event: 'PreToolUse',
        outcome: 'error',
        output: 'HOOK-OUTPUT',
        stdout: 'HOOK-STDOUT',
        stderr: 'HOOK-STDERR',
        exit_code: 7777
      },
      {
        type: 'system',
        subtype: 'hook_response',
        hook_id: 'g2',
        hook_name: 'Bearer x',
        hook_event: 'Stop',
        outcome: 'cancelled'
      }
    ])
    const rows = messages()
    expect(rows.map((m) => m.id)).toEqual(['hook:g1', 'hook:g1', 'hook:g2'])
    expect(rows[0]?.parts[0]).toMatchObject({
      category: 'hook',
      name: 'PreToolUse:Bash',
      detail: 'PreToolUse',
      status: 'started'
    })
    expect(rows[1]?.parts[0]).toMatchObject({ status: 'failed' })
    expect(rows[2]?.parts[0]).toMatchObject({ name: '', detail: 'Stop', status: 'cancelled' })
    const text = JSON.stringify(rows)
    expect(text).not.toMatch(/HOOK-OUTPUT|HOOK-STDOUT|HOOK-STDERR|PROGRESS-OUT|7777|Bearer/)
  })

  it('時刻 (O-9 / AD-051): assistant は SDK の timestamp、結果だけと Hook の行は受信時刻、送り直しは最初の値', async () => {
    const stamp = '2026-10-16T01:23:45.678Z'
    const before = Date.now()
    await runTurn([
      { ...assistantWithTools('m1', 'a'), timestamp: stamp },
      { ...assistantWithTools('m2', 'b') },
      userWith({ type: 'tool_result', tool_use_id: 'a', content: 'ok' }),
      userWith({ type: 'tool_result', tool_use_id: 'ghost', content: 'r' }),
      { type: 'system', subtype: 'hook_started', hook_id: 'h1', hook_name: 'n', hook_event: 'e' }
    ])
    const after = Date.now()
    const rows = messages() as unknown as { id: string; createdAt: number | null }[]
    const m1 = rows.filter((m) => m.id === 'm1')
    expect(m1.map((m) => m.createdAt)).toEqual([Date.parse(stamp), Date.parse(stamp)])
    for (const id of ['m2', 'result:ghost', 'hook:h1']) {
      const row = rows.find((m) => m.id === id)
      expect(row?.createdAt).toBeGreaterThanOrEqual(before)
      expect(row?.createdAt).toBeLessThanOrEqual(after)
    }
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

  it('前景で始まり patch.is_backgrounded が true になった task の行が開き、以後の更新が同じ行に入る。名前は直前の Bash のコマンドの名前 (O-11 US-2 AC1 / AC2)', async () => {
    await runTurn([
      {
        type: 'assistant',
        uuid: 'm1',
        message: {
          content: [
            { type: 'tool_use', id: 'toolu_b', name: 'Bash', input: { command: 'npm run build' } }
          ]
        }
      },
      {
        type: 'system',
        subtype: 'task_started',
        task_id: 't1',
        task_type: 'local_bash',
        description: 'LEAK-DESCRIPTION',
        tool_use_id: 'toolu_b'
      },
      {
        type: 'system',
        subtype: 'task_updated',
        task_id: 't1',
        patch: { is_backgrounded: true }
      },
      { type: 'system', subtype: 'task_notification', task_id: 't1', status: 'completed' }
    ])
    const rows = messages().filter((m) => m.id === 'task:t1')
    expect(rows).toHaveLength(2)
    expect(rows[0]?.parts[0]).toMatchObject({
      category: 'backgrounded-task',
      opens: true,
      name: 'npm',
      detail: 'local_bash',
      status: 'running'
    })
    expect(rows[1]?.parts[0]).toMatchObject({ opens: false, status: 'completed' })
    expect(JSON.stringify(posted)).not.toContain('LEAK-DESCRIPTION')
  })

  it('background_tasks_changed は background-tasks の meter を受けるたびに 1 つ送る (O-11 US-2 AC3)', async () => {
    await runTurn([
      {
        type: 'system',
        subtype: 'background_tasks_changed',
        tasks: [
          { task_id: 'a', task_type: 'local_bash', description: 'LEAK-DESC' },
          { task_id: 'b', task_type: 'local_agent', ambient: true }
        ]
      },
      { type: 'system', subtype: 'background_tasks_changed', tasks: [] }
    ])
    const meters = (events() as { kind: string; meter?: { type: string; tasks?: unknown[] } }[])
      .filter((e) => e.kind === 'meter' && e.meter?.type === 'background-tasks')
      .map((e) => e.meter?.tasks)
    expect(meters).toEqual([[{ taskId: 'a', taskType: 'local_bash' }], []])
    expect(JSON.stringify(posted)).not.toContain('LEAK-DESC')
  })

  it('hook_progress は送らない。task_progress は task の行の進み具合の更新だけを送る (O-4)', async () => {
    await runTurn([
      { type: 'system', subtype: 'hook_progress', hook_id: 'h1', stdout: 'x' },
      {
        type: 'system',
        subtype: 'task_progress',
        task_id: 't1',
        description: 'TASK-DESCRIPTION',
        summary: 'TASK-SUMMARY',
        usage: { total_tokens: 10, tool_uses: 2, duration_ms: 3000 }
      }
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
        // 行の時刻は受信時刻 (signals の時計。O-9 / AD-051)。
        createdAt: expect.any(Number)
      }
    ])
    expect(JSON.stringify(posted)).not.toMatch(/TASK-DESCRIPTION|TASK-SUMMARY/)
  })

  describe('subagent の入れ子 (O-11 BE-031 / AD-055)', () => {
    const inner = (
      uuid: string,
      parent: string | null | undefined,
      content: unknown[]
    ): Record<string, unknown> => ({
      type: 'assistant',
      uuid,
      ...(parent === undefined ? {} : { parent_tool_use_id: parent }),
      message: { content }
    })
    const toolUse = (id: string): Record<string, unknown> => ({
      type: 'tool_use',
      id,
      name: 'Read',
      input: {}
    })
    const rootWithAgent = (uuid: string, id: string): Record<string, unknown> => ({
      ...assistantWithTools(uuid, id),
      parent_tool_use_id: null
    })
    type Call = { toolCallId: string; result: string | null; children: { parts: unknown[] }[] }
    const rootCalls = (m: { parts: Record<string, unknown>[] }): Call[] =>
      m.parts.filter((p) => p.type === 'tool-call') as unknown as Call[]

    it('parent_tool_use_id を持つ assistant / user は主ループの message にならず、親の children に入る (結果も深い位置に埋まる)', async () => {
      await runTurn([
        rootWithAgent('m1', 'agent1'),
        inner('s1', 'agent1', [{ type: 'text', text: 'SUB-TEXT' }, toolUse('r1')]),
        {
          type: 'user',
          parent_tool_use_id: 'agent1',
          message: {
            role: 'user',
            content: [
              { type: 'text', text: 'LEAK-USER-TEXT' },
              { type: 'tool_result', tool_use_id: 'r1', content: 'file-body' }
            ]
          },
          isSynthetic: true
        }
      ])
      // 主ループの message は根 (m1) だけ。送り直しの分だけ同じ id で出る。
      expect(new Set(messages().map((m) => m.id))).toEqual(new Set(['m1']))
      const last = messages().at(-1) as NonNullable<ReturnType<typeof messages>[number]>
      const agent = rootCalls(last)[0] as Call
      expect(agent.children).toHaveLength(1)
      const nested = rootCalls(agent.children[0] as { parts: Record<string, unknown>[] })[0]
      expect(nested).toMatchObject({ toolCallId: 'r1', result: 'file-body' })
      expect(JSON.stringify(posted)).not.toContain('LEAK-USER-TEXT')
    })

    it('親より先に届いた子は平らに出る (孤児)', async () => {
      await runTurn([inner('s1', 'agent-later', [{ type: 'text', text: 'early' }])])
      expect(messages().map((m) => m.id)).toEqual(['s1'])
    })

    it('取り消した応答の配下の子は出ない', async () => {
      await runTurn([
        assistantWithTools('old1', 'agent1'),
        { ...assistantWithTools('new1'), supersedes: ['old1'] },
        inner('s1', 'agent1', [{ type: 'text', text: 'late' }])
      ])
      expect(messages().map((m) => m.id)).toEqual(['old1', 'new1'])
    })

    it('帰属つきの compact_boundary は親の children の区切りになり、主ループの行にならない', async () => {
      await runTurn([
        rootWithAgent('m1', 'agent1'),
        {
          type: 'system',
          subtype: 'compact_boundary',
          uuid: 'c1',
          parent_tool_use_id: 'agent1',
          compact_metadata: { trigger: 'auto', pre_tokens: 1, post_tokens: 1 }
        }
      ])
      expect(new Set(messages().map((m) => m.id))).toEqual(new Set(['m1']))
      const last = messages().at(-1) as NonNullable<ReturnType<typeof messages>[number]>
      const agent = rootCalls(last)[0] as Call
      expect(agent.children[0]?.parts).toEqual([{ type: 'divider', label: 'コンテキストを圧縮' }])
    })

    it('帰属つきの Hook / task / informational は帰属の無いものと同じ主ループの行になる (U-9)', async () => {
      await runTurn([
        rootWithAgent('m1', 'agent1'),
        {
          type: 'system',
          subtype: 'hook_started',
          hook_id: 'h1',
          hook_name: 'PreToolUse:Bash',
          hook_event: 'PreToolUse',
          parent_tool_use_id: 'agent1'
        },
        {
          type: 'system',
          subtype: 'informational',
          uuid: 'i1',
          content: 'note',
          parent_tool_use_id: 'agent1'
        }
      ])
      const ids = messages().map((m) => m.id)
      expect(ids).toContain('hook:h1')
      expect(ids).toContain('info:i1')
    })

    it('入れ子の tool に tool_progress の経過時間の meter が出ない', async () => {
      await runTurn([
        rootWithAgent('m1', 'agent1'),
        {
          type: 'tool_progress',
          tool_use_id: 'r1',
          parent_tool_use_id: 'agent1',
          elapsed_time_seconds: 9
        }
      ])
      expect(
        (events() as { kind: string; meter?: { type: string } }[]).filter(
          (e) => e.meter?.type === 'tool-elapsed'
        )
      ).toEqual([])
    })
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

  it('O-12: tool_use_summary / active_goal / notification は行になり、prompt_suggestion は何も出さない', async () => {
    await runTurn([
      {
        type: 'tool_use_summary',
        uuid: 's1',
        summary: 'did things',
        preceding_tool_use_ids: ['LEAK-pre']
      },
      { type: 'active_goal', uuid: 'g1', value: { condition: 'ship', iterations: 4242 } },
      { type: 'active_goal', uuid: 'g2', value: null },
      { type: 'prompt_suggestion', suggestion: 'LEAK-suggest', uuid: 'p1' },
      {
        type: 'system',
        subtype: 'notification',
        uuid: 'n1',
        key: 'k',
        text: 'hello',
        color: 'LEAK-c'
      },
      { type: 'system', subtype: 'notification', uuid: 'n2', key: 'k', text: 'again' }
    ])
    const ids = evs()
      .filter((e) => e.kind === 'message')
      .map((e) => e.message?.id)
    expect(ids).toEqual(['summary:s1', 'goal:g1', 'goal:g2', 'notification:k', 'notification:k'])
    expect(posted.some((p) => (p.payload ?? '').includes('LEAK-'))).toBe(false)
    expect(posted.some((p) => (p.payload ?? '').includes('4242'))).toBe(false)
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

describe('sdk-agent-session: Elicitation の待ちと状態の遷移 (O-10 / 018 tasks BE-022)', () => {
  type Ask = (
    request: Record<string, unknown>,
    options: { signal: AbortSignal }
  ) => Promise<unknown>
  type UseTool = (
    name: string,
    input: Record<string, unknown>,
    options: { signal: AbortSignal }
  ) => Promise<unknown>

  const MARKER = 'O10-MARKER-xyz'
  const formRequest = {
    serverName: 'github',
    message: 'm',
    mode: 'form',
    requestedSchema: { type: 'object', properties: { a: { type: 'string' } } }
  }
  const ask = (signal: AbortSignal = new AbortController().signal): Promise<unknown> =>
    (h.options?.onElicitation as Ask)(formRequest, { signal })
  const useTool = (): Promise<unknown> =>
    (h.options?.canUseTool as UseTool)(
      'Bash',
      { command: 'ls' },
      { signal: new AbortController().signal }
    )
  const requestIds = (kind: string): string[] =>
    posted
      .filter((p) => p.kind === 'event')
      .map(
        (p) => JSON.parse(p.payload as string) as { kind: string; request?: { requestId: string } }
      )
      .filter((e) => e.kind === kind)
      .map((e) => e.request?.requestId ?? '')
  const lastState = (): string | undefined => states().at(-1)

  /** 1 ターンを開けたままにする (`holdTurn`)。 */
  async function openTurn(): Promise<{ send: (data: unknown) => void; release: () => void }> {
    let release: () => void = () => undefined
    const hold = new Promise<void>((resolve) => {
      release = resolve
    })
    const send = await boot()
    h.holdTurn = hold
    send(launch)
    await vi.waitFor(() => expect(h.preMessageConsumed).toBe(true))
    send(control({ kind: 'send-prompt', text: 'go' }))
    await vi.waitFor(() => expect(states()).toContain('running'))
    await vi.waitFor(() => expect(h.options).not.toBeNull())
    return { send, release }
  }
  const respondElicitation = (
    send: (data: unknown) => void,
    requestId: string,
    action: string,
    content?: unknown
  ): void =>
    send(
      control({
        kind: 'respond-elicitation',
        response: { requestId, action, ...(content !== undefined ? { content } : {}) }
      })
    )
  const respondPermission = (send: (data: unknown) => void, requestId: string): void =>
    send(
      control({
        kind: 'respond-permission',
        decision: { requestId, outcome: 'allow', scope: 'once' }
      })
    )

  it('Elicitation だけの待ちは awaiting_permission になり、応答で running に戻る', async () => {
    const { send, release } = await openTurn()
    const pending = ask()
    await vi.waitFor(() => expect(lastState()).toBe('awaiting_permission'))
    const [id] = requestIds('elicitation-request')
    respondElicitation(send, id ?? '', 'accept', {})
    await expect(pending).resolves.toEqual({ action: 'accept', content: {} })
    await vi.waitFor(() => expect(lastState()).toBe('running'))
    expect(h.interrupts).toBe(0)
    release()
  })

  it('承認が 2 件重なっても、1 件目の応答では awaiting_permission のまま、2 件目で running に戻る', async () => {
    const { send, release } = await openTurn()
    const first = useTool()
    const second = useTool()
    await vi.waitFor(() => expect(requestIds('permission-request')).toHaveLength(2))
    const [a, b] = requestIds('permission-request')
    respondPermission(send, a ?? '')
    await first
    expect(lastState()).toBe('awaiting_permission')
    respondPermission(send, b ?? '')
    await second
    await vi.waitFor(() => expect(lastState()).toBe('running'))
    release()
  })

  it('承認と Elicitation が重なると、両方が済むまで awaiting_permission のまま', async () => {
    const { send, release } = await openTurn()
    const tool = useTool()
    const pending = ask()
    await vi.waitFor(() => expect(requestIds('elicitation-request')).toHaveLength(1))
    respondPermission(send, requestIds('permission-request')[0] ?? '')
    await tool
    expect(lastState()).toBe('awaiting_permission')
    respondElicitation(send, requestIds('elicitation-request')[0] ?? '', 'decline')
    await expect(pending).resolves.toEqual({ action: 'decline' })
    await vi.waitFor(() => expect(lastState()).toBe('running'))
    release()
  })

  it('signal の abort は cancel で解決し、最後の待ちなら running に戻る。後から届いた応答は何も起こさない', async () => {
    const { send, release } = await openTurn()
    const controller = new AbortController()
    const pending = ask(controller.signal)
    await vi.waitFor(() => expect(lastState()).toBe('awaiting_permission'))
    const id = requestIds('elicitation-request')[0] ?? ''
    controller.abort()
    await expect(pending).resolves.toEqual({ action: 'cancel' })
    await vi.waitFor(() => expect(lastState()).toBe('running'))
    const before = posted.length
    respondElicitation(send, id, 'accept', { a: MARKER })
    await new Promise((r) => setTimeout(r, 20))
    expect(posted).toHaveLength(before)
    release()
  })

  it('kill で残りの待ちは cancel で解決する', async () => {
    const { send, release } = await openTurn()
    const pending = ask()
    await vi.waitFor(() => expect(requestIds('elicitation-request')).toHaveLength(1))
    send(control({ kind: 'kill' }))
    await expect(pending).resolves.toEqual({ action: 'cancel' })
    // 偽の stream は abort を見ないので、ターンを開けたままにしている分を解放する。
    release()
    await vi.waitFor(() => expect(kinds()).toContain('ended'))
  })

  it('入力の値 (content) は SDK への戻り値にだけ届き、イベント・状態通知・console に出ない', async () => {
    const consoles = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) =>
      vi.spyOn(console, m).mockImplementation(() => undefined)
    )
    const { send, release } = await openTurn()
    const pending = ask()
    await vi.waitFor(() => expect(requestIds('elicitation-request')).toHaveLength(1))
    respondElicitation(send, requestIds('elicitation-request')[0] ?? '', 'accept', { a: MARKER })
    await expect(pending).resolves.toEqual({ action: 'accept', content: { a: MARKER } })
    expect(JSON.stringify(posted)).not.toContain(MARKER)
    for (const spy of consoles) expect(JSON.stringify(spy.mock.calls)).not.toContain(MARKER)
    vi.restoreAllMocks()
    release()
  })
})

describe('sdk-agent-session: 再開 (X-9 / AD-059 / data-model §6)', () => {
  const CONV = '55555555-5555-4555-8555-555555555555'
  const OTHER = '66666666-6666-4666-8666-666666666666'
  const resumeLaunch = {
    kind: 'launch',
    spec: SPEC,
    options: { permissionMode: 'default', resume: CONV }
  }
  const init = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
    type: 'system',
    subtype: 'init',
    session_id: CONV,
    permissionMode: 'default',
    ...over
  })
  const conversations = (): Posted[] => posted.filter((p) => p.kind === 'conversation')
  const lastStatus = (): Posted | undefined => posted.filter((p) => p.kind === 'status').at(-1)

  async function runPrompt(
    launchMessage: unknown,
    initMessage: Record<string, unknown> | null,
    feed: Record<string, unknown>[] = [],
    mode: Mode = 'normal'
  ): Promise<void> {
    const send = await boot(mode, feed)
    h.initMessage = initMessage
    send(launchMessage)
    await vi.waitFor(() => expect(h.preMessageConsumed).toBe(true))
    send(control({ kind: 'send-prompt', text: 'go' }))
  }

  async function runPreInit(
    launchMessage: unknown,
    preInit: 'exit' | 'throw' | 'end'
  ): Promise<void> {
    const send = await boot()
    h.preInit = preInit
    send(launchMessage)
  }

  describe('options の resume (§6.1 / §6.2)', () => {
    it('再開の起動で query() の options に resume が載る。新しい起動では resume のキーが無い', async () => {
      const send = await boot()
      send(resumeLaunch)
      await vi.waitFor(() => expect(h.options).not.toBeNull())
      expect(h.options?.resume).toBe(CONV)

      const send2 = await boot()
      send2(launch)
      await vi.waitFor(() => expect(h.options).not.toBeNull())
      expect(Object.prototype.hasOwnProperty.call(h.options, 'resume')).toBe(false)
    })

    it('起動の options の許可の 4 値 (auto を含む) は query() に渡る (AD-066)', async () => {
      const send = await boot()
      send({ kind: 'launch', spec: SPEC, options: { permissionMode: 'auto' } })
      await vi.waitFor(() => expect(h.options).not.toBeNull())
      expect(h.options?.permissionMode).toBe('auto')
    })

    it.each([['acceptEdits'], ['bypass' + 'Permissions'], ['weird'], [42], [null]])(
      '起動の permissionMode が許可の 4 値の外 (%j) は起動しない (query() を呼ばない)',
      async (bad) => {
        const send = await boot()
        send({ kind: 'launch', spec: SPEC, options: { permissionMode: bad } })
        expect(kinds()).toEqual(['status', 'ended'])
        expect(h.options).toBeNull()
      }
    )

    it.each([['x'], [''], ['--resume'], [42], [null], [['a']]])(
      'resume が UUID の形でない (%j) 起動は起動しない (error を通知して ended)',
      async (bad) => {
        const send = await boot()
        send({ kind: 'launch', spec: SPEC, options: { permissionMode: 'default', resume: bad } })
        expect(kinds()).toEqual(['status', 'ended'])
        expect(h.options).toBeNull()
      }
    )
  })

  describe('会話の id の送出 (§6.3)', () => {
    it('最初の init で conversation を 1 回送る。2 回目の init (/clear の後) では送らない', async () => {
      await runPrompt(launch, init(), [init({ session_id: OTHER })])
      await vi.waitFor(() => expect(states()).toContain('done'))
      expect(conversations()).toEqual([{ kind: 'conversation', conversationId: CONV }])
    })

    it('最初の init の session_id が UUID でなければ送らず、その後の正しい init でも送らない', async () => {
      await runPrompt(launch, init({ session_id: 'nope' }), [init()])
      await vi.waitFor(() => expect(states()).toContain('done'))
      expect(conversations()).toEqual([])
    })

    it('構成の報告 (init-report の meter) は今と同じ 1 回で、状態通知に会話の id を載せない', async () => {
      await runPrompt(
        launch,
        init({
          model: 'claude-opus-4',
          mcp_servers: [],
          tools: ['Bash'],
          skills: [],
          plugins: [],
          slash_commands: []
        })
      )
      await vi.waitFor(() => expect(states()).toContain('done'))
      const reports = events().filter(
        (e) =>
          e.kind === 'meter' && (e as { meter?: { type?: string } }).meter?.type === 'init-report'
      )
      expect(reports).toHaveLength(1)
      for (const s of posted.filter((p) => p.kind === 'status')) {
        expect(JSON.stringify(s)).not.toContain(CONV)
      }
    })

    it('会話の id を stderr に出さない', async () => {
      const err = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
      await runPrompt(resumeLaunch, init())
      await vi.waitFor(() => expect(states()).toContain('done'))
      for (const call of err.mock.calls) expect(String(call[0])).not.toContain(CONV)
      err.mockRestore()
    })
  })

  describe('resume-failed の分岐 (§6.4)', () => {
    it('新しい起動は今どおり: A は process-crashed、B は stream-protocol-error、C は失敗にしない', async () => {
      await runPreInit(launch, 'exit')
      await vi.waitFor(() => expect(lastStatus()).toMatchObject({ reasonKey: 'process-crashed' }))

      await runPreInit(launch, 'throw')
      await vi.waitFor(() => expect(kinds()).toContain('ended'))
      expect(lastStatus()).toMatchObject({ state: 'error', reasonKey: 'stream-protocol-error' })

      await runPreInit(launch, 'end')
      await vi.waitFor(() => expect(kinds()).toContain('ended'))
      expect(states()).not.toContain('error')
    })

    it('再開で init の前は A〜C のどの終わり方でも resume-failed', async () => {
      await runPreInit(resumeLaunch, 'exit')
      await vi.waitFor(() => expect(lastStatus()).toMatchObject({ reasonKey: 'resume-failed' }))

      await runPreInit(resumeLaunch, 'throw')
      await vi.waitFor(() => expect(kinds()).toContain('ended'))
      expect(lastStatus()).toMatchObject({ state: 'error', reasonKey: 'resume-failed' })
      expect(events().filter((e) => e.kind === 'failure')).toEqual([
        { kind: 'failure', reasonKey: 'resume-failed' }
      ])

      await runPreInit(resumeLaunch, 'end')
      await vi.waitFor(() => expect(kinds()).toContain('ended'))
      expect(lastStatus()).toMatchObject({ state: 'error', reasonKey: 'resume-failed' })
    })

    it('再開で init の後は今どおり (process-crashed)', async () => {
      await runPrompt(resumeLaunch, init(), [], 'crash-midstream')
      await vi.waitFor(() => expect(kinds()).toContain('ended'))
      expect(lastStatus()).toMatchObject({ state: 'error', reasonKey: 'process-crashed' })
    })

    it('fatalSink は再開で init の前でも process-crashed のまま', async () => {
      const send = await boot()
      send(resumeLaunch)
      await vi.waitFor(() => expect(h.preMessageConsumed).toBe(true))
      const fatal = process
        .listeners('uncaughtException')
        .filter((l) => !baseline.uncaught.includes(l))
      ;(fatal[0] as (error: Error, origin: string) => void)(new Error('boom'), 'uncaughtException')
      await vi.waitFor(() => expect(kinds()).toContain('ended'))
      expect(lastStatus()).toMatchObject({ state: 'error', reasonKey: 'process-crashed' })
    })

    it('終了処理の中 (kill の後) は再開でも A〜C のどれも失敗にしない', async () => {
      const send = await boot()
      send(resumeLaunch)
      await vi.waitFor(() => expect(h.preMessageConsumed).toBe(true))
      send(control({ kind: 'kill' }))
      await vi.waitFor(() => expect(kinds()).toContain('ended'))
      expect(states()).not.toContain('error')
    })
  })

  describe('権限モードの fail closed (§6.3 の 1 / SC-009)', () => {
    it.each(['default', 'plan', 'dontAsk'])(
      '再開の最初の init の権限モードが安全な値 (%s) なら失敗しない',
      async (mode) => {
        await runPrompt(resumeLaunch, init({ permissionMode: mode }))
        await vi.waitFor(() => expect(states()).toContain('done'))
        expect(states()).not.toContain('error')
        expect(conversations()).toHaveLength(1)
      }
    )

    it.each([
      ['知らない値', { permissionMode: 'weird' }],
      ['昇格の値', { permissionMode: 'bypass' + 'Permissions' }],
      ['別の昇格の値', { permissionMode: 'acceptEdits' }],
      ['数', { permissionMode: 42 }],
      ['無い', { permissionMode: undefined }]
    ])(
      '再開の最初の init が %s なら resume-failed で止まり、会話の id を送らない',
      async (_n, over) => {
        await runPrompt(resumeLaunch, init(over))
        await vi.waitFor(() => expect(kinds()).toContain('ended'))
        expect(lastStatus()).toMatchObject({ state: 'error', reasonKey: 'resume-failed' })
        expect(conversations()).toEqual([])
        expect(h.child?.killed).toBe(true)
      }
    )

    it('再開を auto で頼んで init も auto なら失敗しない (AD-066 / data-model §3.2)', async () => {
      await runPrompt(
        { kind: 'launch', spec: SPEC, options: { permissionMode: 'auto', resume: CONV } },
        init({ permissionMode: 'auto' })
      )
      await vi.waitFor(() => expect(states()).toContain('done'))
      expect(states()).not.toContain('error')
      expect(conversations()).toHaveLength(1)
    })

    it.each([
      ['default で頼んで auto が戻る', 'default', 'auto'],
      ['auto で頼んで昇格の値が戻る', 'auto', 'bypass' + 'Permissions']
    ])('%s と resume-failed で止まる', async (_n, asked, got) => {
      await runPrompt(
        { kind: 'launch', spec: SPEC, options: { permissionMode: asked, resume: CONV } },
        init({ permissionMode: got })
      )
      await vi.waitFor(() => expect(kinds()).toContain('ended'))
      expect(lastStatus()).toMatchObject({ state: 'error', reasonKey: 'resume-failed' })
      expect(conversations()).toEqual([])
    })

    it('新しい起動では同じ init で失敗しない (表示だけ。今どおり)', async () => {
      await runPrompt(launch, init({ permissionMode: 'acceptEdits' }))
      await vi.waitFor(() => expect(states()).toContain('done'))
      expect(states()).not.toContain('error')
    })

    it('2 回目以降の init は検査しない', async () => {
      await runPrompt(resumeLaunch, init(), [init({ permissionMode: 'acceptEdits' })])
      await vi.waitFor(() => expect(states()).toContain('done'))
      expect(states()).not.toContain('error')
    })
  })
})

describe('sdk-agent-session: 実行中の設定の切り替え (023 / AD-062 / data-model §3.2)', () => {
  const REQ = '123e4567-e89b-42d3-a456-426614174000'
  const results = (): { requestId: string; ok: boolean }[] =>
    posted
      .filter((p) => p.kind === 'control-result')
      .map((p) => p as unknown as { requestId: string; ok: boolean })
  const modeMeters = (): unknown[] =>
    events().filter(
      (e) =>
        e.kind === 'meter' && (e as { meter?: { type?: string } }).meter?.type === 'permission-mode'
    )

  it('set-permission-mode は要求の値で setPermissionMode を 1 回呼び、control-result ok:true と meter が出る', async () => {
    const send = await boot()
    send(launch)
    await vi.waitFor(() => expect(h.preMessageConsumed).toBe(true))
    send(control({ kind: 'send-prompt', text: 'go' }))
    await vi.waitFor(() => expect(states()).toContain('done'))
    send(control({ kind: 'set-permission-mode', requestId: REQ, mode: 'plan' }))
    await vi.waitFor(() =>
      expect(results()).toEqual([{ kind: 'control-result', requestId: REQ, ok: true }])
    )
    expect(h.setModeCalls).toEqual([['plan']])
    expect(modeMeters()).toHaveLength(1)
    // 状態は変わらない (done のまま。ターンも止めない)。
    expect(states().at(-1)).toBe('done')
  })

  it('set-permission-mode は auto も Query.setPermissionMode に渡し、成功で meter が 1 回出る (AD-066)', async () => {
    const send = await boot()
    send(launch)
    await vi.waitFor(() => expect(h.preMessageConsumed).toBe(true))
    send(control({ kind: 'send-prompt', text: 'go' }))
    await vi.waitFor(() => expect(states()).toContain('done'))
    send(control({ kind: 'set-permission-mode', requestId: REQ, mode: 'auto' }))
    await vi.waitFor(() =>
      expect(results()).toEqual([{ kind: 'control-result', requestId: REQ, ok: true }])
    )
    expect(h.setModeCalls).toEqual([['auto']])
    expect(modeMeters()).toHaveLength(1)
  })

  it.each(['acceptEdits', 'bypass' + 'Permissions', 'weird'])(
    'set-permission-mode の値が許可の 4 値の外 (%s) は SDK を呼ばない',
    async (mode) => {
      const send = await boot()
      send(launch)
      await vi.waitFor(() => expect(h.preMessageConsumed).toBe(true))
      send(control({ kind: 'send-prompt', text: 'go' }))
      await vi.waitFor(() => expect(states()).toContain('done'))
      send(control({ kind: 'set-permission-mode', requestId: REQ, mode }))
      expect(h.setModeCalls).toEqual([])
    }
  )

  it('running の最中でも SDK を呼ぶ (受け付ける状態の判定は main の仕事)', async () => {
    const send = await boot()
    let release: () => void = () => undefined
    send(launch)
    await vi.waitFor(() => expect(h.preMessageConsumed).toBe(true))
    h.holdTurn = new Promise<void>((resolve) => {
      release = resolve
    })
    send(control({ kind: 'send-prompt', text: 'go' }))
    await vi.waitFor(() => expect(states()).toContain('running'))
    send(control({ kind: 'set-model', requestId: REQ, model: 'claude-opus-4-1' }))
    await vi.waitFor(() => expect(results()).toHaveLength(1))
    expect(h.setModelCalls).toEqual([['claude-opus-4-1']])
    expect(states().at(-1)).toBe('running')
    release()
  })

  it('reject は ok:false で返し、状態は変わらず、理由の文字列をどこにも出さない', async () => {
    const send = await boot()
    send(launch)
    await vi.waitFor(() => expect(h.preMessageConsumed).toBe(true))
    send(control({ kind: 'send-prompt', text: 'go' }))
    await vi.waitFor(() => expect(states()).toContain('done'))
    h.liveSettingReject = true
    send(control({ kind: 'set-permission-mode', requestId: REQ, mode: 'dontAsk' }))
    await vi.waitFor(() => expect(results()).toHaveLength(1))
    expect(results()[0]).toEqual({ kind: 'control-result', requestId: REQ, ok: false })
    expect(modeMeters()).toHaveLength(0)
    expect(states().at(-1)).toBe('done')
    expect(JSON.stringify(posted)).not.toContain('secret reject reason')
  })

  it('終了処理の中 (end の後) は SDK を呼ばずに ok:false', async () => {
    const send = await boot()
    send(launch)
    await vi.waitFor(() => expect(h.preMessageConsumed).toBe(true))
    send(control({ kind: 'send-prompt', text: 'go' }))
    await vi.waitFor(() => expect(states()).toContain('done'))
    send(control({ kind: 'end' }))
    send(control({ kind: 'set-permission-mode', requestId: REQ, mode: 'plan' }))
    await vi.waitFor(() => expect(results()).toHaveLength(1))
    expect(results()[0]).toMatchObject({ ok: false })
    expect(h.setModeCalls).toEqual([])
  })
})

describe('sdk-agent-session: モデルの一覧 (025 / AD-065 / data-model §4)', () => {
  const REQ = '123e4567-e89b-42d3-a456-426614174000'
  const modelResults = (): { requestId: string; models: unknown }[] =>
    posted
      .filter((p) => p.kind === 'models-result')
      .map((p) => p as unknown as { requestId: string; models: unknown })

  const bootToDone = async (result: unknown = []): Promise<(data: unknown) => void> => {
    const send = await boot()
    h.supportedModelsResult = result
    send(launch)
    await vi.waitFor(() => expect(h.preMessageConsumed).toBe(true))
    send(control({ kind: 'send-prompt', text: 'go' }))
    await vi.waitFor(() => expect(states()).toContain('done'))
    return send
  }

  it('list-models 1 回につき supportedModels を 1 回呼び、正規化した値を models-result で返す', async () => {
    const send = await bootToDone([
      { value: 'sonnet[1m]', displayName: 'Sonnet', description: 'x' },
      { value: 'opus', displayName: 'Opus', supportedEffortLevels: ['high'] },
      { value: 3 }
    ])
    send(control({ kind: 'list-models', requestId: REQ }))
    await vi.waitFor(() => expect(modelResults()).toHaveLength(1))
    expect(h.supportedModelsCalls).toBe(1)
    expect(modelResults()[0]).toEqual({
      kind: 'models-result',
      requestId: REQ,
      models: [
        { id: 'sonnet[1m]', displayName: 'Sonnet' },
        { id: 'opus', displayName: 'Opus', supportedEffortLevels: ['high'] }
      ]
    })
  })

  it('reject は models: null で、例外の文字列とモデルの値をどこにも出さない', async () => {
    const send = await bootToDone([{ value: 'secret-model', displayName: 'S' }])
    h.supportedModelsReject = true
    send(control({ kind: 'list-models', requestId: REQ }))
    await vi.waitFor(() => expect(modelResults()).toHaveLength(1))
    expect(modelResults()[0]?.models).toBeNull()
    expect(JSON.stringify(posted)).not.toContain('secret models reason')
  })

  it('配列でない返り値は models: null', async () => {
    const send = await bootToDone({ not: 'array' })
    send(control({ kind: 'list-models', requestId: REQ }))
    await vi.waitFor(() => expect(modelResults()).toHaveLength(1))
    expect(modelResults()[0]?.models).toBeNull()
  })

  it('終了処理の中 (end の後) は SDK を呼ばずに models: null', async () => {
    const send = await bootToDone()
    send(control({ kind: 'end' }))
    send(control({ kind: 'list-models', requestId: REQ }))
    await vi.waitFor(() => expect(modelResults()).toHaveLength(1))
    expect(modelResults()[0]?.models).toBeNull()
    expect(h.supportedModelsCalls).toBe(0)
  })
})

describe('sdk-agent-session: options の 4 キー (024 / AD-064。SC-003 の agents の部分)', () => {
  const wslLaunch = (options: Record<string, unknown>): unknown => ({
    kind: 'launch',
    spec: SPEC,
    options: { permissionMode: 'default', ...options }
  })
  const win32Launch = (options: Record<string, unknown>): unknown => ({
    kind: 'launch',
    spec: WIN32_LAUNCH_SPEC_FIXTURE,
    options: { permissionMode: 'default', ...options }
  })

  it('4 キーが無い起動では query() の options に 4 キーが無い', async () => {
    const send = await boot()
    send(launch)
    await vi.waitFor(() => expect(h.options).not.toBeNull())
    for (const key of ['additionalDirectories', 'maxTurns', 'maxBudgetUsd', 'title']) {
      expect(Object.prototype.hasOwnProperty.call(h.options, key)).toBe(false)
    }
    expect(Object.prototype.hasOwnProperty.call(h.options, 'launchDirectoryKind')).toBe(false)
  })

  it('WSL の起動: 値があれば同名で query() の options に載る', async () => {
    const send = await boot()
    send(
      wslLaunch({
        additionalDirectories: ['/home/u/lib', '/mnt/c/work/日本語 の lib'],
        maxTurns: 30,
        maxBudgetUsd: 2.5,
        title: 'ログインの API 修正'
      })
    )
    await vi.waitFor(() => expect(h.options).not.toBeNull())
    expect(h.options?.additionalDirectories).toEqual(['/home/u/lib', '/mnt/c/work/日本語 の lib'])
    expect(h.options?.maxTurns).toBe(30)
    expect(h.options?.maxBudgetUsd).toBe(2.5)
    expect(h.options?.title).toBe('ログインの API 修正')
  })

  it('Win32 の起動: ドライブ付きのパスが載る', async () => {
    const send = await boot()
    send(win32Launch({ additionalDirectories: ['C:\\work\\lib'] }))
    await vi.waitFor(() => expect(h.options).not.toBeNull())
    expect(h.options?.additionalDirectories).toEqual(['C:\\work\\lib'])
  })

  const many = Array.from({ length: 11 }, (_, i) => `/d${i}`)
  it.each([
    ['additionalDirectories が配列でない', wslLaunch, { additionalDirectories: '/a' }],
    ['additionalDirectories が 0 件', wslLaunch, { additionalDirectories: [] }],
    ['additionalDirectories が 11 件', wslLaunch, { additionalDirectories: many }],
    ['additionalDirectories が重複', wslLaunch, { additionalDirectories: ['/a', '/a'] }],
    ['WSL の起動に Windows のパス', wslLaunch, { additionalDirectories: ['C:\\work\\lib'] }],
    ['Win32 の起動に POSIX のパス', win32Launch, { additionalDirectories: ['/home/u/lib'] }],
    ['maxTurns が範囲外', wslLaunch, { maxTurns: 0 }],
    ['maxTurns が 1001', wslLaunch, { maxTurns: 1001 }],
    ['maxTurns が null', wslLaunch, { maxTurns: null }],
    ['maxTurns が文字列', wslLaunch, { maxTurns: '30' }],
    ['maxBudgetUsd が範囲外', wslLaunch, { maxBudgetUsd: 0 }],
    ['maxBudgetUsd が null', wslLaunch, { maxBudgetUsd: null }],
    ['maxBudgetUsd が文字列', wslLaunch, { maxBudgetUsd: '2' }],
    ['title が規則の外', wslLaunch, { title: ' a ' }],
    ['title が null', wslLaunch, { title: null }]
  ])('%s の起動は起動しない (error を通知して ended)', async (_name, make, options) => {
    const send = await boot()
    send(make(options))
    expect(kinds()).toEqual(['status', 'ended'])
    expect(h.options).toBeNull()
  })
})
