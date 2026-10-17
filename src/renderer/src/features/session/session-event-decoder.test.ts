import { describe, expect, it } from 'vitest'

import { decodeSessionEvent } from './session-event-decoder'

/**
 * X-5 FE-001 — port から届く本文 (未信頼の文字列) のデコード。kind ごとに正例と負例を固定する
 * (失敗は null = 破棄。他のセッションに影響させない。FR-012)。
 */

const enc = (value: unknown): string => JSON.stringify(value)

describe('decodeSessionEvent', () => {
  it('文字列でない本文・JSON でない文字列・未知の kind は破棄する', () => {
    expect(decodeSessionEvent({ kind: 'state', state: 'running' })).toBeNull()
    expect(decodeSessionEvent('{broken')).toBeNull()
    expect(decodeSessionEvent(enc(['state']))).toBeNull()
    expect(decodeSessionEvent(enc({ kind: 'launch' }))).toBeNull()
  })

  it('message: 形が合えば通し、id / role / parts / createdAt の崩れは破棄する', () => {
    const message = {
      id: 'm1',
      role: 'assistant',
      parts: [{ type: 'text', text: 'hi' }],
      createdAt: 1
    }
    expect(decodeSessionEvent(enc({ kind: 'message', message }))).toEqual({
      kind: 'message',
      message
    })
    expect(decodeSessionEvent(enc({ kind: 'message', message: { ...message, id: 1 } }))).toBeNull()
    expect(
      decodeSessionEvent(enc({ kind: 'message', message: { ...message, parts: [{}] } }))
    ).toBeNull()
    expect(
      decodeSessionEvent(enc({ kind: 'message', message: { ...message, createdAt: 'x' } }))
    ).toBeNull()
  })

  it('state: 既知の run-state だけを通す', () => {
    expect(decodeSessionEvent(enc({ kind: 'state', state: 'done' }))).toEqual({
      kind: 'state',
      state: 'done'
    })
    expect(decodeSessionEvent(enc({ kind: 'state', state: 'finished' }))).toBeNull()
  })

  it('permission-request: scope は once / capability だけ', () => {
    const request = { requestId: 'r', toolName: 'Bash', input: 'ls', scope: 'once' }
    expect(decodeSessionEvent(enc({ kind: 'permission-request', request }))).toEqual({
      kind: 'permission-request',
      request
    })
    expect(
      decodeSessionEvent(
        enc({ kind: 'permission-request', request: { ...request, scope: 'always' } })
      )
    ).toBeNull()
  })

  it('permission-request: answerable は ask-user-question のときだけ写し、他の値は捨てて要求は受ける (O-10)', () => {
    const request = { requestId: 'r', toolName: 'AskUserQuestion', input: '{}', scope: 'once' }
    expect(
      decodeSessionEvent(
        enc({
          kind: 'permission-request',
          request: { ...request, answerable: 'ask-user-question' }
        })
      )
    ).toEqual({
      kind: 'permission-request',
      request: { ...request, answerable: 'ask-user-question' }
    })
    for (const answerable of ['other', 1, null, true]) {
      expect(
        decodeSessionEvent(enc({ kind: 'permission-request', request: { ...request, answerable } }))
      ).toEqual({ kind: 'permission-request', request })
    }
  })

  it('permission-denied: 余分なフィールドを落とし、toolName / reason が文字列でなければ破棄する', () => {
    expect(
      decodeSessionEvent(
        enc({ kind: 'permission-denied', denied: { toolName: 'Bash', reason: 'no', extra: 1 } })
      )
    ).toEqual({ kind: 'permission-denied', denied: { toolName: 'Bash', reason: 'no' } })
    expect(
      decodeSessionEvent(enc({ kind: 'permission-denied', denied: { toolName: 'Bash' } }))
    ).toBeNull()
  })

  it('interrupt-receipt: 文字列の配列だけを通す', () => {
    expect(
      decodeSessionEvent(enc({ kind: 'interrupt-receipt', stillQueued: ['a'], cancelled: [] }))
    ).toEqual({ kind: 'interrupt-receipt', stillQueued: ['a'], cancelled: [] })
    expect(
      decodeSessionEvent(enc({ kind: 'interrupt-receipt', stillQueued: [1], cancelled: [] }))
    ).toBeNull()
  })

  it('failure: 既知の理由キーだけを通す', () => {
    expect(decodeSessionEvent(enc({ kind: 'failure', reasonKey: 'supervisor-exited' }))).toEqual({
      kind: 'failure',
      reasonKey: 'supervisor-exited'
    })
    expect(decodeSessionEvent(enc({ kind: 'failure', reasonKey: 'session-active' }))).toBeNull()
  })

  it('message (O-2): system-event の列挙と tool-call の結果の型を検証し、外れた part を落とす', () => {
    const event = {
      type: 'system-event',
      category: 'task',
      opens: true,
      name: 'build',
      detail: 'local_bash',
      status: 'running'
    }
    const ok = { id: 'task:t1', role: 'system', parts: [event], createdAt: null }
    expect(decodeSessionEvent(enc({ kind: 'message', message: ok }))).toEqual({
      kind: 'message',
      message: ok
    })
    // prototype のキーの status だけのメッセージは破棄 (空の行を作らない)。
    expect(
      decodeSessionEvent(
        enc({
          kind: 'message',
          message: { ...ok, parts: [{ ...event, status: 'constructor' }] }
        })
      )
    ).toBeNull()
    const tool = {
      type: 'tool-call',
      toolCallId: 'c1',
      toolName: 'Bash',
      argsText: '{}',
      result: 42,
      isError: false,
      truncated: false,
      children: []
    }
    const decoded = decodeSessionEvent(
      enc({
        kind: 'message',
        message: {
          id: 'a1',
          role: 'assistant',
          createdAt: 1,
          parts: [{ type: 'text', text: 'hi' }, tool]
        }
      })
    )
    expect(decoded?.kind === 'message' && decoded.message.parts.map((p) => p.type)).toEqual([
      'text'
    ])
  })

  it('end-forced: 余分なフィールドを持ち込まない', () => {
    expect(decodeSessionEvent(enc({ kind: 'end-forced', injected: '<script>' }))).toEqual({
      kind: 'end-forced'
    })
  })
})

describe('decodeSessionEvent の meter (O-4 / 014 tasks FE-004)', () => {
  const meter = (value: unknown): unknown =>
    decodeSessionEvent(enc({ kind: 'meter', meter: value }))

  it('6 つの type を通し、余分なキーを運ばない', () => {
    const turn = {
      type: 'turn',
      costUsd: 0.5,
      turns: 2,
      models: [
        {
          modelId: 'claude-sonnet-4-5[1m]',
          input: 1,
          output: 2,
          cacheRead: 3,
          cacheCreation: 4,
          costUsd: 0.5,
          contextWindow: 1_000_000,
          raw: 'SECRET_MARK'
        }
      ],
      permissionDenials: 0,
      errors: ['SECRET_MARK']
    }
    const rateLimit = {
      type: 'rate-limit',
      status: 'rejected',
      limitType: 'seven_day',
      utilizationPct: 100,
      resetsAtSec: 1_760_000_000,
      usingOverage: false,
      overageStatus: 'SECRET_MARK'
    }
    const updates = [
      turn,
      rateLimit,
      { type: 'context', usedTokens: 12_345, extra: 'SECRET_MARK' },
      { type: 'permission-mode', mode: 'plan', extra: 'SECRET_MARK' },
      { type: 'thinking', estimatedTokens: 99, extra: 'SECRET_MARK' },
      { type: 'tool-elapsed', toolUseId: 'toolu_1', elapsedSeconds: 3, extra: 'SECRET_MARK' }
    ]
    const decoded = updates.map(meter)
    expect(decoded.every((e) => e !== null)).toBe(true)
    expect(JSON.stringify(decoded)).not.toContain('SECRET_MARK')
    expect(decoded[2]).toEqual({ kind: 'meter', meter: { type: 'context', usedTokens: 12_345 } })
    expect(decoded[5]).toEqual({
      kind: 'meter',
      meter: { type: 'tool-elapsed', toolUseId: 'toolu_1', elapsedSeconds: 3 }
    })
  })

  it('知らない type・__proto__ のキー・形の外れた id は破棄し、例外を出さない', () => {
    expect(meter({ type: 'retraction' })).toBeNull()
    expect(meter({ type: '__proto__' })).toBeNull()
    expect(meter({ type: 'tool-elapsed', toolUseId: 'a/b', elapsedSeconds: 1 })).toBeNull()
    expect(meter(null)).toBeNull()
    expect(meter('turn')).toBeNull()
    const proto = '{"kind":"meter","meter":{"__proto__":{"type":"context"},"type":"__proto__"}}'
    expect(() => decodeSessionEvent(proto)).not.toThrow()
    expect(decodeSessionEvent(proto)).toBeNull()
  })
})

describe('decodeSessionEvent の meter の構成 (O-5 FE-001 / 015 data-model §2)', () => {
  const meter = (value: unknown): unknown =>
    decodeSessionEvent(enc({ kind: 'meter', meter: value }))
  const initReport = {
    type: 'init-report',
    model: 'claude-sonnet-4-5',
    mcpServers: [{ name: 'github', status: 'needs-auth' }],
    tools: ['Bash', 'mcp__github__create_issue'],
    skills: ['pdf'],
    plugins: [{ name: 'p', version: '1.0.0' }],
    slashCommands: ['review'],
    omitted: 0
  }
  const commands = {
    type: 'commands',
    commands: [{ name: 'review', description: 'Review', argumentHint: '<pr>' }],
    omitted: 0
  }

  it('init-report / commands の正例を通す', () => {
    expect(meter(initReport)).toEqual({ kind: 'meter', meter: initReport })
    expect(meter(commands)).toEqual({ kind: 'meter', meter: commands })
  })

  it('余分なキーを運ばない', () => {
    const decoded = [
      meter({
        ...initReport,
        cwd: 'SECRET_MARK',
        mcpServers: [{ name: 'github', status: 'failed', error: 'SECRET_MARK' }],
        plugins: [{ name: 'p', version: '1', path: 'SECRET_MARK' }]
      }),
      meter({
        ...commands,
        commands: [{ name: 'a', description: '', argumentHint: '', aliases: ['SECRET_MARK'] }],
        extra: 'SECRET_MARK'
      })
    ]
    expect(decoded.every((e) => e !== null)).toBe(true)
    expect(JSON.stringify(decoded)).not.toContain('SECRET_MARK')
  })

  it('形の外れた名前は落とし、status の __proto__ は unknown、257 件は 256 件と omitted 1', () => {
    expect(
      meter({
        ...initReport,
        mcpServers: [
          { name: `a${String.fromCodePoint(0x202e)}b`, status: 'connected' },
          { name: 'ok', status: '__proto__' }
        ]
      })
    ).toEqual({
      kind: 'meter',
      meter: { ...initReport, mcpServers: [{ name: 'ok', status: 'unknown' }], omitted: 1 }
    })
    const many = Array.from({ length: 257 }, (_, i) => ({
      name: `c${i}`,
      description: '',
      argumentHint: ''
    }))
    const out = meter({ ...commands, commands: many }) as {
      meter: { commands: unknown[]; omitted: number }
    }
    expect(out.meter.commands).toHaveLength(256)
    expect(out.meter.omitted).toBe(1)
  })

  it('型の違いは破棄し、例外を出さない', () => {
    const bad = [
      { ...initReport, mcpServers: 'x' },
      { ...initReport, model: 1 },
      { ...initReport, omitted: '0' },
      { ...commands, commands: {} },
      { ...commands, omitted: undefined }
    ]
    for (const raw of bad) expect(meter(raw)).toBeNull()
    const proto =
      '{"kind":"meter","meter":{"type":"commands","commands":[{"__proto__":{"name":"x"},"name":"constructor"}],"omitted":0}}'
    expect(() => decodeSessionEvent(proto)).not.toThrow()
    expect(decodeSessionEvent(proto)).toEqual({
      kind: 'meter',
      meter: {
        type: 'commands',
        commands: [{ name: 'constructor', description: '', argumentHint: '' }],
        omitted: 0
      }
    })
  })
})

describe('decodeSessionEvent の elicitation-request (O-10 / 018 FE-020)', () => {
  const REQ = '11111111-1111-4111-8111-111111111111'
  const form = {
    requestId: REQ,
    serverName: 'github',
    title: 't',
    message: 'm',
    mode: 'form',
    url: null,
    fields: [{ key: 'a', label: 'a', description: '', required: true, type: 'string' }]
  }
  const dec = (request: unknown): unknown =>
    decodeSessionEvent(enc({ kind: 'elicitation-request', request }))

  it('正例: form と URL。余分なキー (elicitationId) は運ばない', () => {
    expect(dec({ ...form, elicitationId: 'x' })).toEqual({ kind: 'elicitation-request', request: form })
    const url = {
      requestId: REQ,
      serverName: '',
      title: '',
      message: '',
      mode: 'url',
      url: { openUrl: 'https://example.com/x', displayUrl: 'https://example.com/x', host: 'example.com' },
      fields: null
    }
    expect(dec(url)).toEqual({ kind: 'elicitation-request', request: url })
  })

  it('負例: 未知の mode・fields の型違い・33 項目・UUID でない id・開けない URL を破棄する', () => {
    expect(dec({ ...form, mode: 'dialog' })).toBeNull()
    expect(dec({ ...form, fields: 'x' })).toBeNull()
    expect(dec({ ...form, fields: Array.from({ length: 33 }, (_, i) => ({ ...form.fields[0], key: `k${i}` })) })).toBeNull()
    expect(dec({ ...form, requestId: 'req-1' })).toBeNull()
    expect(dec({ ...form, mode: 'url', fields: null, url: { openUrl: 'javascript:alert(1)', displayUrl: '', host: '' } })).toBeNull()
    expect(dec('x')).toBeNull()
  })
})
