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
