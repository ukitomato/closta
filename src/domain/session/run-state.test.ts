import { describe, expect, it } from 'vitest'

import {
  isSessionRunState,
  isTerminal,
  nextState,
  SESSION_RUN_STATES,
  TERMINAL_STATES,
  type SessionAction,
  type SessionRunState
} from './run-state'

describe('nextState', () => {
  it('idle は launch で launching へ、それ以外は idle のまま', () => {
    expect(nextState('idle', { kind: 'launch' })).toBe('launching')
    expect(nextState('idle', { kind: 'ready' })).toBe('idle')
    expect(nextState('idle', { kind: 'send-prompt' })).toBe('idle')
  })

  it('launching は ready で running、fail で error', () => {
    expect(nextState('launching', { kind: 'ready' })).toBe('running')
    expect(nextState('launching', { kind: 'fail' })).toBe('error')
  })

  it('running の分岐', () => {
    expect(nextState('running', { kind: 'permission-request' })).toBe('awaiting_permission')
    expect(nextState('running', { kind: 'interrupt' })).toBe('interrupted')
    expect(nextState('running', { kind: 'complete' })).toBe('done')
    // send-prompt は queue に積むだけで running のまま (M-003)。
    expect(nextState('running', { kind: 'send-prompt' })).toBe('running')
  })

  it('awaiting_permission は respond で running、送信は queue で状態維持 (C-004)', () => {
    expect(nextState('awaiting_permission', { kind: 'permission-respond' })).toBe('running')
    expect(nextState('awaiting_permission', { kind: 'send-prompt' })).toBe('awaiting_permission')
  })

  it('interrupted / done は send-prompt で running (継続)', () => {
    expect(nextState('interrupted', { kind: 'send-prompt' })).toBe('running')
    expect(nextState('done', { kind: 'send-prompt' })).toBe('running')
  })

  it('kill は非終端のどこからでも done、fail は error', () => {
    const nonTerminal: SessionRunState[] = [
      'idle',
      'launching',
      'running',
      'awaiting_permission',
      'interrupted'
    ]
    for (const s of nonTerminal) {
      expect(nextState(s, { kind: 'kill' })).toBe('done')
      expect(nextState(s, { kind: 'fail' })).toBe('error')
    }
  })

  it('終端状態 (error/done) は kill で変化しない。error は fail でも変化しない', () => {
    for (const s of TERMINAL_STATES) {
      expect(nextState(s, { kind: 'kill' })).toBe(s)
    }
    expect(nextState('error', { kind: 'fail' })).toBe('error')
    expect(nextState('error', { kind: 'send-prompt' })).toBe('error')
  })

  it('応答待ち (done) の間の失敗は error にする (X-5 / FR-012。done は claude 生存の応答待ちも表す)', () => {
    expect(nextState('done', { kind: 'fail' })).toBe('error')
  })

  it('未定義の (state, action) は現状維持 (例外を投げない)', () => {
    const actions: SessionAction['kind'][] = [
      'launch',
      'ready',
      'send-prompt',
      'permission-request',
      'permission-respond',
      'complete',
      'interrupt',
      'kill',
      'fail'
    ]
    // すべての組み合わせで例外を投げず SessionRunState を返す。
    const states: SessionRunState[] = [
      'idle',
      'launching',
      'running',
      'awaiting_permission',
      'interrupted',
      'error',
      'done'
    ]
    for (const s of states) {
      for (const k of actions) {
        expect(() => nextState(s, { kind: k } as SessionAction)).not.toThrow()
      }
    }
  })
})

describe('isSessionRunState / isTerminal', () => {
  it('isSessionRunState は 7 状態だけを受け付ける (X-5 で isActive を廃止し、受信検証用の述語を足した)', () => {
    for (const s of SESSION_RUN_STATES) expect(isSessionRunState(s)).toBe(true)
    expect(isSessionRunState('ended')).toBe(false)
    expect(isSessionRunState(3)).toBe(false)
    expect(isSessionRunState(undefined)).toBe(false)
  })

  it('isTerminal は error/done で true', () => {
    expect(isTerminal('error')).toBe(true)
    expect(isTerminal('done')).toBe(true)
    expect(isTerminal('running')).toBe(false)
  })
})
