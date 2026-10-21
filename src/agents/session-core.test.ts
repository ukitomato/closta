import { describe, expect, it, vi } from 'vitest'

import { WIN32_LAUNCH_SPEC_FIXTURE } from '@domain/session/__fixtures__/win32-launch-spec'
import type {
  CanUseToolResult,
  LaunchFailureReason,
  PermissionDecision,
  RuntimeLaunchSpec
} from '@domain/session/agent-session'

import {
  acceptsWhileClosing,
  buildQueryOptions,
  canEnd,
  classifyResult,
  classifyResultFailure,
  composeClaudeSpawn,
  createCanUseTool,
  createPermissionRegistry,
  decodeDecision,
  decodeSessionControl,
  QUERY_OPTION_KEYS,
  RESULT_ERROR_SUBTYPES,
  resultAction,
  type AgentSpawnOptions,
  type ElicitationResultLike,
  type ResultFailureInput,
  type SpawnedLike
} from './session-core'

const noopSpawn = (): SpawnedLike => ({ kill: () => true })
const noopElicitation = async (): Promise<ElicitationResultLike> => ({ action: 'decline' })

describe('createPermissionRegistry (承認往復の照合。X-5 FR-007 / SC-005)', () => {
  const decision = (requestId: string): PermissionDecision => ({
    requestId,
    outcome: 'allow',
    scope: 'once'
  })

  it('requestId は注入した生成器から作られる (本番は globalThis.crypto.randomUUID)', () => {
    const gen = vi.fn(() => 'req-1')
    const registry = createPermissionRegistry(gen)
    expect(registry.issue()).toBe('req-1')
    expect(gen).toHaveBeenCalledTimes(1)
  })

  it('本番の生成器 globalThis.crypto.randomUUID は UUID を返す (予測可能な連番でない)', () => {
    const registry = createPermissionRegistry(() => globalThis.crypto.randomUUID())
    const a = registry.issue()
    const b = registry.issue()
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(a).not.toBe(b)
  })

  it('pending の requestId だけを解決する', () => {
    const registry = createPermissionRegistry(() => 'req-1')
    const resolve = vi.fn()
    registry.register(registry.issue(), resolve)
    expect(registry.settle(decision('req-1'))).toBe(true)
    expect(resolve).toHaveBeenCalledWith(decision('req-1'))
  })

  it('未知・別セッション宛て・応答済みの requestId は何もしない (SDK のコールバックを解決しない)', () => {
    const registry = createPermissionRegistry(() => 'req-1')
    const resolve = vi.fn()
    registry.register(registry.issue(), resolve)
    expect(registry.settle(decision('other-session-req'))).toBe(false)
    expect(registry.settle(decision('req-1'))).toBe(true)
    // 応答済み
    expect(registry.settle(decision('req-1'))).toBe(false)
    expect(resolve).toHaveBeenCalledTimes(1)
  })

  it('denyAll は残りの受け口をすべて拒否で解決する', () => {
    let n = 0
    const registry = createPermissionRegistry(() => `req-${(n += 1)}`)
    const r1 = vi.fn()
    const r2 = vi.fn()
    registry.register(registry.issue(), r1)
    registry.register(registry.issue(), r2)
    registry.denyAll()
    expect(r1).toHaveBeenCalledWith({ requestId: 'req-1', outcome: 'deny', scope: 'once' })
    expect(r2).toHaveBeenCalledWith({ requestId: 'req-2', outcome: 'deny', scope: 'once' })
    expect(registry.settle(decision('req-1'))).toBe(false)
  })
})

describe('canEnd / acceptsWhileClosing (終わらせ方。X-5 FR-011 / R3-H-04)', () => {
  it('穏当な終了は応答待ち (done)・中断済み (interrupted)・最初のプロンプト待ちの launching だけ', () => {
    expect(canEnd('done', true)).toBe(true)
    expect(canEnd('interrupted', true)).toBe(true)
    // 最初のプロンプトを待つ launching は終了できる (pr-gate R1 po H-001)。送信済みなら応答中と同じく受けない。
    expect(canEnd('launching', false)).toBe(true)
    expect(canEnd('launching', true)).toBe(false)
    for (const s of ['idle', 'running', 'awaiting_permission', 'error'] as const) {
      expect(canEnd(s, false)).toBe(false)
    }
  })

  it('終了処理中は kill だけを受け付け、送信・承認・中断・終了は無視する', () => {
    expect(acceptsWhileClosing({ kind: 'kill' })).toBe(true)
    expect(acceptsWhileClosing({ kind: 'send-prompt', text: 'x' })).toBe(false)
    expect(acceptsWhileClosing({ kind: 'interrupt' })).toBe(false)
    expect(acceptsWhileClosing({ kind: 'end' })).toBe(false)
    expect(
      acceptsWhileClosing({
        kind: 'respond-permission',
        decision: { requestId: 'r', outcome: 'allow', scope: 'once' }
      })
    ).toBe(false)
  })
})

describe('resultAction (終了処理中の result。pr-gate R1 architecture L-001 / R2 L-006)', () => {
  it('正常完了は終了処理中でも complete', () => {
    expect(resultAction({ kind: 'complete' }, false)).toBe('complete')
    expect(resultAction({ kind: 'complete' }, true)).toBe('complete')
  })

  it('エラー結果は通常なら fail、終了・強制終了の処理中なら ignore (終了済みを「失敗」と出さない)', () => {
    expect(resultAction({ kind: 'provider-error' }, false)).toBe('fail')
    expect(resultAction({ kind: 'provider-error' }, true)).toBe('ignore')
  })
})

describe('buildQueryOptions (正の構成 P1)', () => {
  it('options のキー集合が allowlist の完全部分集合 (余分なキーが無い)', () => {
    const options = buildQueryOptions({
      permissionMode: 'default',
      canUseTool: async () => ({ behavior: 'deny', message: 'x' }),
      pathToClaudeCodeExecutable: '/usr/bin/claude',
      spawnClaudeCodeProcess: noopSpawn,
      abortController: new AbortController(),
      onElicitation: noopElicitation
    })
    const keys = Object.keys(options)
    // **キー集合 ⊆ allowlist** — settings/extraArgs/allowedTools 等の昇格 option が現れない (C-201)。
    for (const key of keys) {
      expect(QUERY_OPTION_KEYS as readonly string[]).toContain(key)
    }
    expect(options.permissionMode).toBe('default')
  })

  it('昇格 option キーが決して現れない (settings は AD-040 の制約付き射影のみ)', () => {
    const options = buildQueryOptions({
      permissionMode: 'default',
      canUseTool: async () => ({ behavior: 'allow' }),
      pathToClaudeCodeExecutable: '/usr/bin/claude',
      spawnClaudeCodeProcess: noopSpawn,
      abortController: new AbortController(),
      onElicitation: noopElicitation
    })
    // `settings` は X-3/AD-040 で制約付き射影に限り許すため forbidden から外す (下の 2 test が制約を守る)。
    const forbidden = [
      'extraArgs',
      'allowedTools',
      'disallowedTools',
      'permissionPromptToolName',
      'allowDangerouslySkipPermissions',
      'mcpServers'
    ]
    for (const key of forbidden) {
      expect(Object.prototype.hasOwnProperty.call(options, key)).toBe(false)
    }
    // helper 無指定なら settings は undefined (委譲なし)。
    expect(options.settings).toBeUndefined()
  })

  it('helper 委譲の settings は HelperSettings (2 キー限定) で query options に現れる (C-001 正の flow)', () => {
    const options = buildQueryOptions({
      permissionMode: 'default',
      canUseTool: async () => ({ behavior: 'allow' }),
      pathToClaudeCodeExecutable: '/usr/bin/claude',
      spawnClaudeCodeProcess: noopSpawn,
      abortController: new AbortController(),
      onElicitation: noopElicitation,
      settings: { apiKeyHelper: '/opt/helper.sh' }
    })
    expect(options.settings).toEqual({ apiKeyHelper: '/opt/helper.sh' })
    // 一次ゲートを通っても昇格キーは型で持てない (permissions/permissionMode/env が現れない)。
    expect(Object.keys(options.settings ?? {})).toEqual(['apiKeyHelper'])
  })

  it('昇格キー混入 settings は buildQueryOptions が throw で締め出す (C-001 負例)', () => {
    expect(() =>
      buildQueryOptions({
        permissionMode: 'default',
        canUseTool: async () => ({ behavior: 'allow' }),
        pathToClaudeCodeExecutable: '/usr/bin/claude',
        spawnClaudeCodeProcess: noopSpawn,
        abortController: new AbortController(),
        onElicitation: noopElicitation,
        settings: { apiKeyHelper: '/a', permissionMode: 'bypassPermissions' } as never
      })
    ).toThrow(/AD-040/)
  })
})

describe('buildQueryOptions (X-4 / AD-041)', () => {
  const base = {
    canUseTool: async () => ({ behavior: 'allow' as const }),
    pathToClaudeCodeExecutable: '/usr/bin/claude',
    spawnClaudeCodeProcess: noopSpawn,
    abortController: new AbortController(),
    onElicitation: noopElicitation
  }

  it('QUERY_OPTION_KEYS は AD-041 (g) + AD-053 + AD-054 + AD-059 の 12 キーに固定される (集合を変えるには ADR が要る: AD-041 / AD-054 / AD-059)', () => {
    expect(QUERY_OPTION_KEYS).toHaveLength(12)
    // onUserDialog / supportedDialogKinds は載せない (AD-053 Decision 4)。
    expect(QUERY_OPTION_KEYS as readonly string[]).not.toContain('onUserDialog')
    expect(QUERY_OPTION_KEYS as readonly string[]).not.toContain('supportedDialogKinds')
    expect([...QUERY_OPTION_KEYS].sort()).toEqual(
      [
        'abortController',
        'canUseTool',
        'effort',
        'forwardSubagentText',
        'includeHookEvents',
        'model',
        'onElicitation',
        'pathToClaudeCodeExecutable',
        'permissionMode',
        'resume',
        'settings',
        'spawnClaudeCodeProcess'
      ].sort()
    )
    // forkSession / sessionId / resumeSessionAt / continue は足さない (AD-059 Decision 1)。
    for (const key of ['forkSession', 'sessionId', 'resumeSessionAt', 'continue']) {
      expect(QUERY_OPTION_KEYS as readonly string[]).not.toContain(key)
    }
  })

  const CONVERSATION_ID = '123e4567-e89b-42d3-a456-426614174000'

  it('resume を持たない起動では options に resume のキーが無い', () => {
    const options = buildQueryOptions({ ...base, permissionMode: 'default' })
    expect(Object.prototype.hasOwnProperty.call(options, 'resume')).toBe(false)
  })

  it('正しい UUID の resume は options に載り、キーは許可リストの中に収まる', () => {
    const options = buildQueryOptions({
      ...base,
      permissionMode: 'default',
      resume: CONVERSATION_ID
    })
    expect(options.resume).toBe(CONVERSATION_ID)
    for (const key of Object.keys(options)) {
      expect(QUERY_OPTION_KEYS as readonly string[]).toContain(key)
    }
  })

  it.each(['', '-x', 'a b', `x${CONVERSATION_ID}`, `${CONVERSATION_ID}x`, '--resume'])(
    'UUID の形でない resume (%j) は throw する (値はメッセージに入らない)',
    (bad) => {
      let message = ''
      try {
        buildQueryOptions({ ...base, permissionMode: 'default', resume: bad })
      } catch (e) {
        message = (e as Error).message
      }
      expect(message).toMatch(/AD-059/)
      if (bad.length > 2) expect(message).not.toContain(bad)
    }
  )

  it('安全 3 値の assert は resume の有無で変わらない', () => {
    for (const resume of [undefined, CONVERSATION_ID]) {
      for (const mode of ['acceptEdits', 'auto', 'bypass' + 'Permissions']) {
        expect(() => buildQueryOptions({ ...base, permissionMode: mode as never, resume })).toThrow(
          /AD-041/
        )
      }
    }
  })

  it('includeHookEvents / forwardSubagentText はどの起動の入力でも true (O-11 / AD-054 Decision 4)', () => {
    for (const mode of ['default', 'plan', 'dontAsk'] as const) {
      const options = buildQueryOptions({
        ...base,
        permissionMode: mode,
        model: 'claude-sonnet-4-5',
        effort: 'high'
      })
      expect(options.includeHookEvents).toBe(true)
      expect(options.forwardSubagentText).toBe(true)
    }
  })

  it.each(['default', 'plan', 'dontAsk'] as const)('安全 3 値 %s はそのまま載る', (mode) => {
    expect(buildQueryOptions({ ...base, permissionMode: mode }).permissionMode).toBe(mode)
  })

  it('安全 3 値の外は throw する (X-1 の「default 固定」の assert を置き換えて残す)', () => {
    for (const mode of ['acceptEdits', 'auto', 'bypass' + 'Permissions', '']) {
      expect(() => buildQueryOptions({ ...base, permissionMode: mode as never })).toThrow(/AD-041/)
    }
  })

  it('model / effort は検証済みの値だけが載る', () => {
    const options = buildQueryOptions({
      ...base,
      permissionMode: 'plan',
      model: 'claude-sonnet-4-5[1m]',
      effort: 'high'
    })
    expect(options.model).toBe('claude-sonnet-4-5[1m]')
    expect(options.effort).toBe('high')
    for (const key of Object.keys(options)) {
      expect(QUERY_OPTION_KEYS as readonly string[]).toContain(key)
    }
  })

  it('model のメタ文字 / effort の enum 外は throw する', () => {
    expect(() =>
      buildQueryOptions({ ...base, permissionMode: 'default', model: 'x$(id)' })
    ).toThrow(/model/)
    expect(() =>
      buildQueryOptions({ ...base, permissionMode: 'default', effort: 'ultra' as never })
    ).toThrow(/effort/)
  })
})

describe('createCanUseTool (正の構成 P2)', () => {
  it('全 return が toPermissionResult 経由で {behavior, message} のみ', async () => {
    const decision: PermissionDecision = { requestId: 'r1', outcome: 'deny', scope: 'once' }
    const emitRequest = vi.fn()
    const canUseTool = createCanUseTool({
      nextRequestId: () => 'r1',
      sanitizeInput: () => '{"path":"/x"}',
      sanitizeToolName: (n) => n,
      emitRequest,
      awaitDecision: async () => decision
    })

    const result = await canUseTool(
      'Bash',
      { command: 'ls' },
      { signal: new AbortController().signal }
    )
    // updatedPermissions/updatedInput が現れない (C-101/H-201/L-201 を一括で閉じる)。
    for (const key of Object.keys(result)) {
      expect(['behavior', 'message']).toContain(key)
    }
    expect(result.behavior).toBe('deny')
    expect(emitRequest).toHaveBeenCalledOnce()
  })

  it('allow の決定は {behavior:allow} のみ', async () => {
    const canUseTool = createCanUseTool({
      nextRequestId: () => 'r2',
      sanitizeInput: () => '{}',
      sanitizeToolName: (n) => n,
      emitRequest: () => {},
      awaitDecision: async () => ({ requestId: 'r2', outcome: 'allow', scope: 'once' })
    })
    const result = await canUseTool('Read', {}, { signal: new AbortController().signal })
    expect(result).toEqual({ behavior: 'allow' })
  })

  it.each(['once', 'capability'] as const)(
    'ExitPlanMode の allow (決定 scope %s) は {behavior} 系のキーだけで updatedPermissions を含まない (AD-041 Confirmation / P2)',
    async (scope) => {
      const canUseTool = createCanUseTool({
        nextRequestId: () => 'r-plan',
        sanitizeInput: () => '{"plan":"..."}',
        sanitizeToolName: (n) => n,
        emitRequest: () => {},
        awaitDecision: async () => ({ requestId: 'r-plan', outcome: 'allow', scope })
      })
      // SDK は ExitPlanMode にモード遷移の提案 (suggestions: setMode) を添えて呼ぶ。それを戻り値へ写さない
      // (`updatedPermissions` を返すと plan → acceptEdits 等へ昇格する経路になる)。
      const options = {
        signal: new AbortController().signal,
        suggestions: [{ type: 'setMode', mode: 'acceptEdits', destination: 'session' }]
      }
      const result = await canUseTool('ExitPlanMode', { plan: '...' }, options)
      expect(result).toEqual({ behavior: 'allow' })
      for (const key of Object.keys(result)) {
        expect(['behavior', 'message']).toContain(key)
      }
      expect(Object.prototype.hasOwnProperty.call(result, 'updatedPermissions')).toBe(false)
      expect(Object.prototype.hasOwnProperty.call(result, 'updatedInput')).toBe(false)
    }
  )

  it('toolName をサニタイズして emit する (H-05)', async () => {
    const emitRequest = vi.fn()
    const canUseTool = createCanUseTool({
      nextRequestId: () => 'r3',
      sanitizeInput: () => '{}',
      sanitizeToolName: () => 'Bash',
      emitRequest,
      awaitDecision: async () => ({ requestId: 'r3', outcome: 'deny', scope: 'once' })
    })
    // 双方向制御文字を含む偽装 tool 名を渡してもサニタイズ済みが emit される。
    await canUseTool('Read\u202eBash', {}, { signal: new AbortController().signal })
    expect(emitRequest).toHaveBeenCalledWith(expect.objectContaining({ toolName: 'Bash' }))
  })
})

describe('createCanUseTool \u306e AskUserQuestion \u306e\u5206\u5c90 (O-10 / AD-052)', () => {
  const rawInput = {
    questions: [{ question: '\u8272\u306f?', options: [{ label: '\u8d64' }, { label: '\u9752' }] }]
  }
  const run = async (
    toolName: string,
    decision: Omit<PermissionDecision, 'requestId'>,
    input: Record<string, unknown> = rawInput,
    sanitizeToolName: (n: string) => string = (n) => n
  ): Promise<{ result: CanUseToolResult; emitRequest: ReturnType<typeof vi.fn> }> => {
    const emitRequest = vi.fn()
    const canUseTool = createCanUseTool({
      nextRequestId: () => 'rq',
      sanitizeInput: () => '{}',
      sanitizeToolName,
      emitRequest,
      awaitDecision: async () => ({ requestId: 'rq', ...decision })
    })
    const result = await canUseTool(toolName, input, { signal: new AbortController().signal })
    return { result, emitRequest }
  }

  it('AskUserQuestion \u306e\u8a31\u53ef\u306f {behavior, updatedInput} \u3067\u3001answerable \u304c\u4ed8\u304f', async () => {
    const { result, emitRequest } = await run('AskUserQuestion', {
      outcome: 'allow',
      scope: 'once',
      answers: ['\u8d64']
    })
    expect(Object.keys(result).sort()).toEqual(['behavior', 'updatedInput'])
    expect(result).toEqual({
      behavior: 'allow',
      updatedInput: { ...rawInput, answers: { '\u8272\u306f?': '\u8d64' } }
    })
    expect(emitRequest).toHaveBeenCalledWith(
      expect.objectContaining({ answerable: 'ask-user-question' })
    )
  })

  it.each(['mcp__x__AskUserQuestion', 'AskUserQuestion ', 'askuserquestion', 'Bash'])(
    '%s \u306f answerable \u304c\u4ed8\u304b\u305a\u3001answers \u304c\u3042\u3063\u3066\u3082 {behavior:allow} \u306e\u307f',
    async (name) => {
      const { result, emitRequest } = await run(name, {
        outcome: 'allow',
        scope: 'once',
        answers: ['\u8d64']
      })
      expect(result).toEqual({ behavior: 'allow' })
      const emitted: unknown = emitRequest.mock.calls[0]?.[0]
      expect(Object.prototype.hasOwnProperty.call(emitted, 'answerable')).toBe(false)
    }
  )

  it('sanitizeToolName \u304c AskUserQuestion \u3092\u8fd4\u3059\u5225\u306e\u540d\u524d\u3067\u3082\u4ed8\u304b\u305a updatedInput \u3082\u51fa\u306a\u3044', async () => {
    const { result, emitRequest } = await run(
      'Ask\u202eUserQuestion',
      { outcome: 'allow', scope: 'once', answers: ['\u8d64'] },
      rawInput,
      () => 'AskUserQuestion'
    )
    expect(result).toEqual({ behavior: 'allow' })
    const emitted: unknown = emitRequest.mock.calls[0]?.[0]
    expect(Object.prototype.hasOwnProperty.call(emitted, 'answerable')).toBe(false)
  })

  it('deny \u306f\u4eca\u3068\u540c\u3058 {behavior, message}', async () => {
    const { result } = await run('AskUserQuestion', {
      outcome: 'deny',
      scope: 'once',
      message: '\u65ad\u308b'
    })
    expect(result).toEqual({ behavior: 'deny', message: '\u65ad\u308b' })
  })

  it('\u5c04\u5f71\u306e\u5931\u6557\u306f deny (\u56de\u7b54\u3092\u843d\u3068\u3057\u3066\u8a31\u53ef\u3057\u306a\u3044)', async () => {
    const { result } = await run('AskUserQuestion', {
      outcome: 'allow',
      scope: 'once',
      answers: ['\u8d64', '\u9752']
    })
    expect(result.behavior).toBe('deny')
    expect(Object.prototype.hasOwnProperty.call(result, 'updatedInput')).toBe(false)
  })
})

describe('decodeDecision \u306e answers (O-10)', () => {
  const base = { requestId: 'r', outcome: 'allow', scope: 'once' }
  it('answers \u3092\u7701\u3044\u305f\u4eca\u306e\u5f62\u3068\u3001\u6b63\u3057\u3044 answers \u3092\u53d7\u3051\u308b', () => {
    expect(decodeDecision(base)).toEqual(base)
    expect(decodeDecision({ ...base, answers: ['a'] })).toEqual({ ...base, answers: ['a'] })
  })
  it.each([
    ['\u914d\u5217\u3067\u306a\u3044', 'a'],
    ['5 \u4ef6', ['a', 'b', 'c', 'd', 'e']],
    ['\u6570\u3092\u542b\u3080', ['a', 1]],
    ['1,001 \u30b3\u30fc\u30c9\u30dd\u30a4\u30f3\u30c8', ['a'.repeat(1001)]],
    ['\u7a7a\u6587\u5b57', ['']],
    ['\u7a7a\u767d\u3060\u3051', ['  \n']]
  ])('%s \u306f\u5236\u5fa1\u3054\u3068 null', (_name, answers) => {
    expect(decodeDecision({ ...base, answers })).toBeNull()
    expect(
      decodeSessionControl({ kind: 'respond-permission', decision: { ...base, answers } })
    ).toBeNull()
  })
})

describe('composeClaudeSpawn の Win32 の行 (X-8 / data-model §5.3)', () => {
  it('command は実行ファイル、args は options.args だけ、env は spec.env、cwd と windowsHide は spec の値', () => {
    const options: AgentSpawnOptions = {
      command: 'node',
      args: ['--print', '--verbose'],
      env: { ANTHROPIC_API_KEY: 'secret' }
    }
    const plan = composeClaudeSpawn(WIN32_LAUNCH_SPEC_FIXTURE, options)
    expect(plan.command).toBe(WIN32_LAUNCH_SPEC_FIXTURE.pathToClaudeCodeExecutable)
    // options.args の前にパスを足さない。
    expect(plan.args).toEqual(['--print', '--verbose'])
    expect(plan.env).toEqual(WIN32_LAUNCH_SPEC_FIXTURE.env)
    expect(plan.cwd).toBe(WIN32_LAUNCH_SPEC_FIXTURE.cwd)
    expect(plan.windowsHide).toBe(true)
  })

  it('空白と日本語を含む cwd がそのまま渡る', () => {
    const cwd = 'C:\\Users\\山田 太郎\\my project'
    const plan = composeClaudeSpawn(
      { ...WIN32_LAUNCH_SPEC_FIXTURE, cwd },
      { command: 'node', args: [] }
    )
    expect(plan.cwd).toBe(cwd)
  })

  it('WSL の行に cwd / windowsHide のキーが無い', () => {
    const plan = composeClaudeSpawn(
      {
        pathToClaudeCodeExecutable: '/home/u/.local/bin/claude',
        command: 'launcher-bin',
        prefixArgs: ['--exec'],
        env: {}
      },
      { command: 'node', args: [] }
    )
    expect('cwd' in plan).toBe(false)
    expect('windowsHide' in plan).toBe(false)
  })
})

describe('composeClaudeSpawn (env は spec のみ・argv は配列)', () => {
  // command は不透明トークンで十分 (composeClaudeSpawn は spec.command を素通しするだけ)。
  // 実リテラルは infra の WSL_BINARY に閉じており、テストで再掲しない (check.mjs 項目 3)。
  const launcher = 'launcher-bin'
  const spec: RuntimeLaunchSpec = {
    pathToClaudeCodeExecutable: '/home/u/.local/bin/claude',
    command: launcher,
    prefixArgs: ['--cd', '/home/u/proj', '-d', 'Ubuntu', '--exec'],
    env: { SystemRoot: 'C:\\Windows', WSL_UTF8: '1' }
  }

  it('env は spec.env のみ (options.env / process.env を混ぜない。H-01/H-102)', () => {
    const options: AgentSpawnOptions = {
      command: 'node',
      args: ['--flag'],
      env: { ANTHROPIC_API_KEY: 'secret', WSLENV: 'PATH/l' }
    }
    const plan = composeClaudeSpawn(spec, options)
    expect(plan.env).toEqual({ SystemRoot: 'C:\\Windows', WSL_UTF8: '1' })
    // 汚染された options.env のキーが 1 つも漏れない。
    expect(Object.prototype.hasOwnProperty.call(plan.env, 'ANTHROPIC_API_KEY')).toBe(false)
    expect(Object.prototype.hasOwnProperty.call(plan.env, 'WSLENV')).toBe(false)
  })

  it('command は spec.command、argv は配列で --cd 経由 + SDK args を後置', () => {
    const options: AgentSpawnOptions = { command: 'node', args: ['claude.js', '--print'] }
    const plan = composeClaudeSpawn(spec, options)
    expect(plan.command).toBe(launcher)
    expect(Array.isArray(plan.args)).toBe(true)
    expect(plan.args).toEqual([
      '--cd',
      '/home/u/proj',
      '-d',
      'Ubuntu',
      '--exec',
      '/home/u/.local/bin/claude',
      'claude.js',
      '--print'
    ])
    // シェル補間を誘発する単一文字列に連結していない (各要素が独立 argv)。
    expect(plan.args.some((a) => a.includes(' && ') || a.includes('$('))).toBe(false)
  })

  it('合成後 argv に権限昇格フラグが現れない (L-404 / SH-020(a)(iii))', () => {
    // SDK が汚染された args を渡しても、composeClaudeSpawn は素通しするだけで昇格フラグを足さない。
    // 昇格は options のキー (P1) と Query メソッド (P3) で塞ぐのが正本だが、argv 側も負例で確認する。
    const options: AgentSpawnOptions = { command: 'node', args: ['cli.js'] }
    const plan = composeClaudeSpawn(spec, options)
    const escalationFlags = [
      '--dangerously-skip-permissions',
      '--permission-mode',
      '--allowedTools',
      '--disallowedTools',
      '--settings'
    ]
    for (const flag of escalationFlags) {
      expect(plan.args).not.toContain(flag)
    }
  })
})

describe('classifyResult (V-11 / FR-030 — 認証失敗を黙って done にしない)', () => {
  it('success かつ is_error=false のみ complete', () => {
    expect(classifyResult('success', false)).toEqual({ kind: 'complete' })
  })

  it('success でも is_error=true なら provider-error', () => {
    expect(classifyResult('success', true)).toEqual({ kind: 'provider-error' })
  })

  it('非 success subtype は provider-error (max_turns / 実行中エラー / 認証系)', () => {
    // **黙って done にしない** — 認証切れ・API エラーは provider-error に倒す (V-11)。
    expect(classifyResult('error_max_turns', false)).toEqual({ kind: 'provider-error' })
    expect(classifyResult('error_during_execution', false)).toEqual({ kind: 'provider-error' })
    expect(classifyResult('error', true)).toEqual({ kind: 'provider-error' })
    // 未知 subtype も既定で provider-error (allowlist 的に success のみ complete)。
    expect(classifyResult('unexpected_new_subtype', false)).toEqual({ kind: 'provider-error' })
  })
})

describe('classifyResultFailure (O-4 / 014 data-model §1 / SC-001)', () => {
  const base: ResultFailureInput = {
    subtype: 'success',
    apiErrorStatus: null,
    lastAssistantError: null
  }
  const classify = (overrides: Partial<ResultFailureInput>): LaunchFailureReason =>
    classifyResultFailure({ ...base, ...overrides })

  it('HTTP の状態: 401 / 403 は auth-failed、429 は rate-limited、5xx と他の状態は api-error', () => {
    expect(classify({ apiErrorStatus: 401 })).toBe('auth-failed')
    expect(classify({ apiErrorStatus: 403 })).toBe('auth-failed')
    expect(classify({ apiErrorStatus: 429 })).toBe('rate-limited')
    expect(classify({ apiErrorStatus: 500 })).toBe('api-error')
    expect(classify({ apiErrorStatus: 503 })).toBe('api-error')
    expect(classify({ apiErrorStatus: 529 })).toBe('api-error')
    expect(classify({ apiErrorStatus: 400 })).toBe('api-error')
    expect(classify({ apiErrorStatus: 0 })).toBe('api-error')
    expect(classify({ apiErrorStatus: 999 })).toBe('api-error')
  })

  it('assistant の認証系の error は auth-failed', () => {
    for (const error of [
      'authentication_failed',
      'oauth_org_not_allowed',
      'verification_required',
      'cloud_credential_error'
    ] as const) {
      expect(classify({ lastAssistantError: error })).toBe('auth-failed')
    }
  })

  it('assistant の billing_error / account_on_hold は billing', () => {
    expect(classify({ lastAssistantError: 'billing_error' })).toBe('billing')
    expect(classify({ lastAssistantError: 'account_on_hold' })).toBe('billing')
  })

  it('assistant の rate_limit は rate-limited', () => {
    expect(classify({ lastAssistantError: 'rate_limit' })).toBe('rate-limited')
  })

  it('失敗の 4 つの subtype が区別される', () => {
    expect(classify({ subtype: 'error_max_turns' })).toBe('max-turns')
    expect(classify({ subtype: 'error_max_budget_usd' })).toBe('max-budget')
    expect(classify({ subtype: 'error_max_structured_output_retries' })).toBe(
      'structured-output-retries'
    )
    expect(classify({ subtype: 'error_during_execution' })).toBe('execution-error')
  })

  it('状態が無い・知らない subtype・表に無い assistant の error は provider-error', () => {
    expect(classify({})).toBe('provider-error')
    expect(classify({ apiErrorStatus: undefined })).toBe('provider-error')
    expect(classify({ subtype: 'unexpected_new_subtype' })).toBe('provider-error')
    expect(classify({ subtype: '__proto__' })).toBe('provider-error')
    expect(classify({ subtype: 'toString' })).toBe('provider-error')
    expect(classify({ subtype: 42 })).toBe('provider-error')
    expect(classify({ subtype: undefined })).toBe('provider-error')
    for (const error of [
      'overloaded',
      'invalid_request',
      'model_not_found',
      'server_error',
      'unknown',
      'max_output_tokens'
    ] as const) {
      expect(classify({ lastAssistantError: error })).toBe('provider-error')
    }
  })

  it('apiErrorStatus が 1000・-1・小数・数でないなら状態が無いのと同じ (provider-error)', () => {
    expect(classify({ apiErrorStatus: 1000 })).toBe('provider-error')
    expect(classify({ apiErrorStatus: -1 })).toBe('provider-error')
    expect(classify({ apiErrorStatus: 401.5 })).toBe('provider-error')
    expect(classify({ apiErrorStatus: Number.NaN })).toBe('provider-error')
    expect(classify({ apiErrorStatus: Number.POSITIVE_INFINITY })).toBe('provider-error')
    expect(classify({ apiErrorStatus: '401' })).toBe('provider-error')
  })

  it('評価の順: 表の上の行が勝つ', () => {
    // billing_error と 401 → auth-failed (1 行目が 2 行目より先)
    expect(classify({ lastAssistantError: 'billing_error', apiErrorStatus: 401 })).toBe(
      'auth-failed'
    )
    // rate_limit と error_max_turns → rate-limited (3 行目が subtype より先)
    expect(classify({ lastAssistantError: 'rate_limit', subtype: 'error_max_turns' })).toBe(
      'rate-limited'
    )
    // error_during_execution と 500 → execution-error (subtype が api-error より先)
    expect(classify({ subtype: 'error_during_execution', apiErrorStatus: 500 })).toBe(
      'execution-error'
    )
    // billing_error と 429 → billing (2 行目が 3 行目より先)
    expect(classify({ lastAssistantError: 'billing_error', apiErrorStatus: 429 })).toBe('billing')
    // 429 と 403 は同時に来ないが、rate_limit と 403 → rate-limited (3 行目が 4 行目より先)
    expect(classify({ lastAssistantError: 'rate_limit', apiErrorStatus: 403 })).toBe('rate-limited')
    // 403 と error_max_turns → auth-failed (4 行目が subtype より先)
    expect(classify({ apiErrorStatus: 403, subtype: 'error_max_turns' })).toBe('auth-failed')
    // 表に無い error と 500 → api-error
    expect(classify({ lastAssistantError: 'server_error', apiErrorStatus: 500 })).toBe('api-error')
  })

  it('どの失敗の分類も完了にしない (classifyResult は失敗のまま。X-1 FR-020 / US-4 AC6)', () => {
    for (const subtype of [...RESULT_ERROR_SUBTYPES, 'success', 'unexpected_new_subtype']) {
      expect(classifyResult(subtype, true)).toEqual({ kind: 'provider-error' })
      expect(resultAction(classifyResult(subtype, true), false)).toBe('fail')
    }
    for (const subtype of RESULT_ERROR_SUBTYPES) {
      expect(classifyResult(subtype, false)).toEqual({ kind: 'provider-error' })
      expect(classifyResultFailure({ ...base, subtype })).not.toBe('provider-error')
    }
  })
})
