import type { ModelEntry } from '@domain/provider/types'
import { describe, expect, it } from 'vitest'

import {
  decodeSupervisorEventForMain,
  decodeSupervisorRequest,
  decodeWorkerMessage,
  encodeSupervisorEvent,
  encodeSupervisorRequest,
  type OpaqueBody
} from './supervisor-protocol'

const ID = '11111111-1111-4111-8111-111111111111'
const CONV = '22222222-2222-4222-8222-222222222222'

describe('decodeSupervisorRequest (制御行。X-5 BE-004)', () => {
  it('launch と control だけを受け付ける', () => {
    const launch = decodeSupervisorRequest(
      encodeSupervisorRequest({
        kind: 'launch',
        sessionId: ID,
        spec: { command: 'x' },
        options: { permissionMode: 'default' }
      })
    )
    expect(launch).toMatchObject({ kind: 'launch', sessionId: ID })
    const control = decodeSupervisorRequest(
      JSON.stringify({ kind: 'control', sessionId: ID, control: { kind: 'end' } })
    )
    expect(control).toEqual({ kind: 'control', sessionId: ID, control: { kind: 'end' } })
  })

  it('本文 (event) の kind を受け付けない', () => {
    expect(
      decodeSupervisorRequest(JSON.stringify({ kind: 'event', sessionId: ID, payload: '{}' }))
    ).toBeNull()
  })

  it('UUID でない sessionId・未知の制御・形の崩れ・JSON でない行を拒否する', () => {
    expect(
      decodeSupervisorRequest(
        JSON.stringify({ kind: 'control', sessionId: '../x', control: { kind: 'kill' } })
      )
    ).toBeNull()
    expect(
      decodeSupervisorRequest(
        JSON.stringify({ kind: 'control', sessionId: ID, control: { kind: 'setPermissionMode' } })
      )
    ).toBeNull()
    expect(
      decodeSupervisorRequest(
        JSON.stringify({ kind: 'launch', sessionId: ID, spec: 'x', options: {} })
      )
    ).toBeNull()
    expect(decodeSupervisorRequest('not json')).toBeNull()
  })
})

describe('decodeWorkerMessage (セッションスレッド → 調停役スレッド)', () => {
  it('event は payload が string であることだけを確かめる (中身は読まない)', () => {
    expect(decodeWorkerMessage({ kind: 'event', payload: 'not even json' })).toEqual({
      kind: 'event',
      payload: 'not even json'
    })
    expect(decodeWorkerMessage({ kind: 'event', payload: { parsed: true } })).toBeNull()
  })

  it('status は状態・理由キー・生存フラグを検証する', () => {
    expect(
      decodeWorkerMessage({ kind: 'status', state: 'running', reasonKey: null, claudeAlive: true })
    ).toEqual({
      kind: 'status',
      state: 'running',
      reasonKey: null,
      claudeAlive: true
    })
    expect(
      decodeWorkerMessage({ kind: 'status', state: 'bogus', reasonKey: null, claudeAlive: true })
    ).toBeNull()
    expect(
      decodeWorkerMessage({ kind: 'status', state: 'error', reasonKey: 'nope', claudeAlive: false })
    ).toBeNull()
  })

  it('child-exited / ended を受け付け、未知の kind を捨てる', () => {
    expect(decodeWorkerMessage({ kind: 'child-exited' })).toEqual({ kind: 'child-exited' })
    expect(decodeWorkerMessage({ kind: 'ended' })).toEqual({ kind: 'ended' })
    expect(decodeWorkerMessage({ kind: 'spawned', pid: 1 })).toBeNull()
    expect(decodeWorkerMessage('ended')).toBeNull()
  })
})

describe('encodeSupervisorEvent / decodeSupervisorEventForMain', () => {
  it('改行や引用符を含む本文でも 1 行に収まり、行を偽造できない', () => {
    const payload = '{"x":"a\n{\\"kind\\":\\"status-batch\\"}"}\n' as OpaqueBody
    const line = encodeSupervisorEvent({ kind: 'event', sessionId: ID, payload })
    expect(line.split('\n')).toHaveLength(1)
    expect(JSON.parse(line)).toEqual({ kind: 'event', sessionId: ID, payload })
  })

  it('main は status-batch と thread-ended だけを受け付け、本文の行 (event) を捨てる', () => {
    expect(
      decodeSupervisorEventForMain(encodeSupervisorEvent({ kind: 'status-batch', updates: [] }))
    ).toEqual({
      kind: 'status-batch',
      updates: []
    })
    expect(
      decodeSupervisorEventForMain(encodeSupervisorEvent({ kind: 'thread-ended', sessionId: ID }))
    ).toEqual({
      kind: 'thread-ended',
      sessionId: ID
    })
    expect(
      decodeSupervisorEventForMain(
        encodeSupervisorEvent({ kind: 'event', sessionId: ID, payload: '{}' as OpaqueBody })
      )
    ).toBeNull()
    expect(decodeSupervisorEventForMain('{"kind":"thread-ended","sessionId":"x"}')).toBeNull()
    expect(decodeSupervisorEventForMain('nope')).toBeNull()
  })

  it('main は conversation を受け付け、sessionId か conversationId が UUID でなければ捨てる (X-9 / C-5)', () => {
    expect(
      decodeSupervisorEventForMain(
        encodeSupervisorEvent({ kind: 'conversation', sessionId: ID, conversationId: CONV })
      )
    ).toEqual({ kind: 'conversation', sessionId: ID, conversationId: CONV })
    for (const bad of [
      { sessionId: 'x', conversationId: CONV },
      { sessionId: ID, conversationId: 'x' },
      { sessionId: ID, conversationId: '--resume' },
      { sessionId: ID, conversationId: 42 },
      { sessionId: ID }
    ]) {
      expect(
        decodeSupervisorEventForMain(JSON.stringify({ kind: 'conversation', ...bad }))
      ).toBeNull()
    }
  })
})

describe('decodeWorkerMessage の conversation (X-9 / C-5)', () => {
  it('UUID の形の conversationId だけを受け付ける', () => {
    expect(decodeWorkerMessage({ kind: 'conversation', conversationId: CONV })).toEqual({
      kind: 'conversation',
      conversationId: CONV
    })
    for (const bad of ['x', '', 42, null, undefined, ['a']]) {
      expect(decodeWorkerMessage({ kind: 'conversation', conversationId: bad })).toBeNull()
    }
    expect(decodeWorkerMessage({ kind: 'conversation' })).toBeNull()
  })
})

describe('control-result (023 / contracts C-4)', () => {
  it('decodeWorkerMessage: requestId が UUID・ok が真偽のときだけ受け付ける', () => {
    expect(decodeWorkerMessage({ kind: 'control-result', requestId: CONV, ok: true })).toEqual({
      kind: 'control-result',
      requestId: CONV,
      ok: true
    })
    expect(decodeWorkerMessage({ kind: 'control-result', requestId: CONV, ok: false })).toEqual({
      kind: 'control-result',
      requestId: CONV,
      ok: false
    })
    for (const bad of ['x', '', 42, null, undefined]) {
      expect(decodeWorkerMessage({ kind: 'control-result', requestId: bad, ok: true })).toBeNull()
    }
    for (const bad of ['true', 1, null, undefined]) {
      expect(decodeWorkerMessage({ kind: 'control-result', requestId: CONV, ok: bad })).toBeNull()
    }
    expect(decodeWorkerMessage({ kind: 'control-result', ok: true })).toBeNull()
  })

  it('decodeSupervisorEventForMain: sessionId / requestId が UUID・ok が真偽のときだけ受け付ける', () => {
    expect(
      decodeSupervisorEventForMain(
        encodeSupervisorEvent({ kind: 'control-result', sessionId: ID, requestId: CONV, ok: false })
      )
    ).toEqual({ kind: 'control-result', sessionId: ID, requestId: CONV, ok: false })
    for (const bad of [
      { sessionId: 'x', requestId: CONV, ok: true },
      { sessionId: ID, requestId: 'x', ok: true },
      { sessionId: ID, requestId: CONV, ok: 'yes' },
      { sessionId: ID, requestId: CONV }
    ]) {
      expect(
        decodeSupervisorEventForMain(JSON.stringify({ kind: 'control-result', ...bad }))
      ).toBeNull()
    }
  })
})

describe('models-result (025 / contracts C-9)', () => {
  const entries: readonly ModelEntry[] = [
    { id: 'a', displayName: 'A' },
    { id: 'b', displayName: 'B', supportedEffortLevels: ['high'] }
  ]

  it('decodeWorkerMessage: requestId が UUID・models が null か配列のときだけ受け付ける', () => {
    expect(decodeWorkerMessage({ kind: 'models-result', requestId: CONV, models: null })).toEqual({
      kind: 'models-result',
      requestId: CONV,
      models: null
    })
    expect(
      decodeWorkerMessage({ kind: 'models-result', requestId: CONV, models: entries })
    ).toEqual({ kind: 'models-result', requestId: CONV, models: entries })
    for (const bad of ['x', '', 42, null, undefined]) {
      expect(decodeWorkerMessage({ kind: 'models-result', requestId: bad, models: [] })).toBeNull()
    }
    for (const bad of ['x', {}, 1, undefined]) {
      expect(
        decodeWorkerMessage({ kind: 'models-result', requestId: CONV, models: bad })
      ).toBeNull()
    }
  })

  it('decodeSupervisorEventForMain: ModelEntry の形の配列が件数どおり通る', () => {
    expect(
      decodeSupervisorEventForMain(
        encodeSupervisorEvent({
          kind: 'models-result',
          sessionId: ID,
          requestId: CONV,
          models: entries
        })
      )
    ).toEqual({
      kind: 'models-result',
      sessionId: ID,
      requestId: CONV,
      models: entries,
      dropped: 0
    })
  })

  it('decodeSupervisorEventForMain: 形の外の要素が落ち、件数の差が dropped になる', () => {
    const decoded = decodeSupervisorEventForMain(
      JSON.stringify({
        kind: 'models-result',
        sessionId: ID,
        requestId: CONV,
        models: [entries[0], { id: '-bad', displayName: 'x' }, 7]
      })
    )
    expect(decoded).toMatchObject({ models: [entries[0]], dropped: 2 })
  })

  it('decodeSupervisorEventForMain: null は失敗のまま・不正な形は null', () => {
    expect(
      decodeSupervisorEventForMain(
        JSON.stringify({ kind: 'models-result', sessionId: ID, requestId: CONV, models: null })
      )
    ).toMatchObject({ models: null, dropped: 0 })
    for (const bad of [
      { sessionId: 'x', requestId: CONV, models: [] },
      { sessionId: ID, requestId: 'x', models: [] },
      { sessionId: ID, requestId: CONV, models: 'x' },
      { sessionId: ID, requestId: CONV }
    ]) {
      expect(
        decodeSupervisorEventForMain(JSON.stringify({ kind: 'models-result', ...bad }))
      ).toBeNull()
    }
  })
})
