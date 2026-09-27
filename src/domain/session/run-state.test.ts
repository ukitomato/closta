import { describe, expect, it } from 'vitest'

import {
  isActive,
  isTerminal,
  nextState,
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

  it('終端状態 (error/done) は kill/fail で変化しない', () => {
    for (const s of TERMINAL_STATES) {
      expect(nextState(s, { kind: 'kill' })).toBe(s)
      expect(nextState(s, { kind: 'fail' })).toBe(s)
    }
    expect(nextState('error', { kind: 'send-prompt' })).toBe('error')
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

describe('isActive / isTerminal', () => {
  it('isActive は非終端の稼働状態で true (単一セッション不変判定)', () => {
    expect(isActive('launching')).toBe(true)
    expect(isActive('running')).toBe(true)
    expect(isActive('awaiting_permission')).toBe(true)
    expect(isActive('interrupted')).toBe(true)
    expect(isActive('idle')).toBe(false)
    expect(isActive('error')).toBe(false)
    expect(isActive('done')).toBe(false)
  })

  it('isTerminal は error/done で true', () => {
    expect(isTerminal('error')).toBe(true)
    expect(isTerminal('done')).toBe(true)
    expect(isTerminal('running')).toBe(false)
  })
})
