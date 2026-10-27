import { describe, expect, it } from 'vitest'

import {
  LIVE_SETTING_FAILURES,
  liveSettingBlocker,
  normalizeSessionName,
  type LiveSettingKind,
  type LiveSettingRow
} from './live-settings'
import { SESSION_RUN_STATES } from './run-state'

const row = (over: Partial<LiveSettingRow> = {}): LiveSettingRow => ({
  state: 'done',
  claudeAlive: true,
  hasConversation: true,
  changing: false,
  ...over
})

describe('LIVE_SETTING_FAILURES (集合を変えるには ADR が要る: AD-062)', () => {
  it('並びを固定する', () => {
    expect([...LIVE_SETTING_FAILURES]).toEqual([
      'unknown-session',
      'invalid-value',
      'not-running',
      'not-ready',
      'busy',
      'no-conversation',
      'turn-running',
      'rejected',
      'session-ended',
      'timeout',
      'write-failed'
    ])
  })
})

describe('liveSettingBlocker', () => {
  it('権限モード・モデルは running / awaiting_permission / interrupted / done で受ける', () => {
    for (const kind of ['permission-mode', 'model'] as const) {
      for (const state of ['running', 'awaiting_permission', 'interrupted', 'done'] as const) {
        expect(liveSettingBlocker(kind, row({ state, hasConversation: false }))).toBeNull()
      }
    }
  })

  it('名前は done / interrupted の会話ありだけで受ける', () => {
    expect(liveSettingBlocker('name', row({ state: 'done' }))).toBeNull()
    expect(liveSettingBlocker('name', row({ state: 'interrupted' }))).toBeNull()
    expect(liveSettingBlocker('name', row({ state: 'running' }))).toBe('turn-running')
    expect(liveSettingBlocker('name', row({ state: 'awaiting_permission' }))).toBe('turn-running')
    expect(liveSettingBlocker('name', row({ state: 'done', hasConversation: false }))).toBe(
      'no-conversation'
    )
  })

  it('idle / error / claudeAlive:false は not-running (running でも)', () => {
    const kinds: LiveSettingKind[] = ['permission-mode', 'model', 'name']
    for (const kind of kinds) {
      expect(liveSettingBlocker(kind, row({ state: 'idle' }))).toBe('not-running')
      expect(liveSettingBlocker(kind, row({ state: 'error' }))).toBe('not-running')
      expect(liveSettingBlocker(kind, row({ state: 'running', claudeAlive: false }))).toBe(
        'not-running'
      )
    }
  })

  it('launching は not-ready (changing でも)', () => {
    for (const kind of ['permission-mode', 'model', 'name'] as const) {
      expect(liveSettingBlocker(kind, row({ state: 'launching' }))).toBe('not-ready')
      expect(liveSettingBlocker(kind, row({ state: 'launching', changing: true }))).toBe(
        'not-ready'
      )
    }
  })

  it('changing は busy で、名前の no-conversation / turn-running より先', () => {
    expect(liveSettingBlocker('permission-mode', row({ changing: true }))).toBe('busy')
    expect(liveSettingBlocker('model', row({ state: 'running', changing: true }))).toBe('busy')
    expect(liveSettingBlocker('name', row({ hasConversation: false, changing: true }))).toBe(
      'busy'
    )
    expect(liveSettingBlocker('name', row({ state: 'running', changing: true }))).toBe('busy')
  })

  it('全状態 × 全 kind で blocker が表の優先順に従う (not-running が最優先)', () => {
    for (const state of SESSION_RUN_STATES) {
      const b = liveSettingBlocker('name', row({ state, claudeAlive: false, changing: true }))
      expect(b).toBe('not-running')
    }
  })
})

describe('normalizeSessionName', () => {
  it('文字列でなければ null', () => {
    for (const v of [1, null, undefined, {}, [], true]) expect(normalizeSessionName(v)).toBeNull()
  })

  it('空・空白だけは null、前後の空白は trim する', () => {
    expect(normalizeSessionName('')).toBeNull()
    expect(normalizeSessionName('   ')).toBeNull()
    expect(normalizeSessionName('  a  ')).toBe('a')
  })

  it('1 文字と 100 文字は通り、101 文字は null', () => {
    expect(normalizeSessionName('a')).toBe('a')
    expect(normalizeSessionName('a'.repeat(100))).toBe('a'.repeat(100))
    expect(normalizeSessionName('a'.repeat(101))).toBeNull()
  })

  it('サロゲートペアは 1 文字と数える', () => {
    const name = '😀'.repeat(100)
    expect(normalizeSessionName(name)).toBe(name)
    expect(normalizeSessionName('😀'.repeat(101))).toBeNull()
  })

  it('改行・制御文字・行と段落の区切りを含めば null', () => {
    for (const bad of ['a\nb', 'a\rb', 'a\u0000b', 'a\u007fb', 'a\u2028b', 'a\u2029b']) {
      expect(normalizeSessionName(bad)).toBeNull()
    }
  })
})
