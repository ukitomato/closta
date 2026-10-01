import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * B-2 の回帰テスト (X-4 quickstart / pr-gate R1 po M-005)。
 *
 * claude 2.1.285 は起動直後 (初回 user メッセージの前) に `system/commands_changed` を出す。
 * それで launching → running にすると renderer が busy と判断して初回プロンプトを積み、
 * turn 完了まで dispatch しないためデッドロックした。**最初のプロンプトを送る前に届いたメッセージは
 * running への遷移を起こさない** ことを、実配線 (`sdk-agent-session.ts` の `main()` → `run()`) で固定する。
 *
 * SDK の `query()` と `child_process` は差し替える (実 claude も wsl.exe も起こさない)。
 * `parentPort` は utilityProcess にだけ在るため、fake を `process` に載せてから動的 import する
 * (本ファイルは import 時に `main()` が走る)。
 */

interface PromptLike {
  readonly message: { readonly content: string }
}

const sdk = vi.hoisted(() => ({
  /** 起動前メッセージを loop が消費し、次を要求した (= 初回プロンプト待ちに入った)。 */
  preMessageConsumed: false,
  prompts: [] as string[]
}))

vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: ({ prompt }: { prompt: AsyncIterable<PromptLike> }) => {
    async function* stream(): AsyncGenerator<Record<string, unknown>> {
      // 初回 user メッセージの前に届く通知 (実測の再現)。
      yield { type: 'system', subtype: 'commands_changed' }
      sdk.preMessageConsumed = true
      const first = await prompt[Symbol.asyncIterator]().next()
      if (first.done === true) return
      sdk.prompts.push(first.value.message.content)
      yield { type: 'system', subtype: 'init' }
    }
    return Object.assign(stream(), { interrupt: async () => ({}) })
  }
}))

vi.mock('node:child_process', () => ({ spawn: vi.fn() }))

type Listener = (message: { data: unknown; ports: readonly unknown[] }) => void

afterEach(() => {
  delete (process as unknown as { parentPort?: unknown }).parentPort
})

describe('sdk-agent-session: 最初のプロンプト前のメッセージ (B-2)', () => {
  it('送信前の system/commands_changed では running にせず、送信後の最初のメッセージで running にする', async () => {
    let listener: Listener | null = null
    ;(process as unknown as { parentPort: unknown }).parentPort = {
      on: (_event: 'message', l: Listener) => {
        listener = l
      },
      start: () => undefined
    }
    const events: { kind: string; state?: string }[] = []
    const port = {
      postMessage: (event: { kind: string; state?: string }) => events.push(event),
      start: () => undefined,
      close: () => undefined
    }

    await import('./sdk-agent-session')
    expect(listener).not.toBeNull()
    const send = (data: unknown, ports: readonly unknown[] = []): void =>
      (listener as unknown as Listener)({ data, ports })

    send(
      {
        kind: 'launch',
        spec: {
          pathToClaudeCodeExecutable: '/home/u/.local/bin/claude',
          command: 'wsl-launcher',
          prefixArgs: ['--cd', '/home/u/proj', '-d', 'Ubuntu', '--exec'],
          env: { WSL_UTF8: '1' }
        },
        options: { permissionMode: 'default' }
      },
      [port]
    )

    await vi.waitFor(() => expect(sdk.preMessageConsumed).toBe(true))
    const states = (): (string | undefined)[] =>
      events.filter((e) => e.kind === 'state').map((e) => e.state)
    expect(states()).toEqual(['launching'])

    send({ kind: 'control', control: { kind: 'send-prompt', text: 'こんにちは' } })

    await vi.waitFor(() => expect(states()).toContain('running'))
    expect(sdk.prompts).toEqual(['こんにちは'])
    expect(states()).toEqual(['launching', 'running'])
  })
})
