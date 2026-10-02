import { describe, expect, it } from 'vitest'

import type { SessionStatusUpdate } from '@domain/session/status-update'

import {
  availableActions,
  deriveSessionView,
  MESSAGE_WINDOW,
  rowStatus,
  windowMessages,
  type SessionViewSource
} from './session-view'

/** X-5 — 表示用の導出の純関数 (一覧の行と表示中セッションで共有する判定)。 */

const ID = '11111111-1111-4111-8111-111111111111'

function src(over: Partial<SessionViewSource> = {}): SessionViewSource {
  return {
    runState: 'launching',
    failureReason: null,
    killed: false,
    ending: false,
    promptSent: false,
    ...over
  }
}

function st(over: Partial<SessionStatusUpdate> = {}): SessionStatusUpdate {
  return { sessionId: ID, state: 'launching', reasonKey: null, claudeAlive: true, ...over }
}

describe('最初のプロンプト待ち (pr-gate R1 po H-001)', () => {
  it('起動済み・未送信の launching は「プロンプト待ち」で、終了と強制終了を出す', () => {
    const view = deriveSessionView(src(), st())
    expect(view.awaitingFirstPrompt).toBe(true)
    expect(rowStatus(view)).toBe('ready')
    expect(availableActions(view, src())).toMatchObject({ end: true, kill: true, interrupt: false })
  })

  it('最初のプロンプトを送った後の launching は「応答中」で、終了を出さない', () => {
    const session = src({ promptSent: true })
    const view = deriveSessionView(session, st())
    expect(view.firstTurnInFlight).toBe(true)
    expect(rowStatus(view)).toBe('running')
    expect(availableActions(view, session)).toMatchObject({ end: false, kill: true })
  })

  it('状態通知がまだ届いていない launching は「起動中」で、強制終了だけ', () => {
    const view = deriveSessionView(src(), undefined)
    expect(rowStatus(view)).toBe('launching')
    expect(availableActions(view, src())).toMatchObject({ end: false, kill: true })
  })

  it('終了済み・失敗の launching はプロンプト待ちにしない', () => {
    expect(deriveSessionView(src(), st({ claudeAlive: false })).awaitingFirstPrompt).toBe(false)
    expect(deriveSessionView(src(), st({ state: 'error' })).awaitingFirstPrompt).toBe(false)
  })
})

describe('応答中・承認待ちの操作 (FR-011 / pr-gate R2 po M-103)', () => {
  const after = src({ promptSent: true, runState: 'running' })

  it('応答中は中断と強制終了を出し、終了は出さない', () => {
    const view = deriveSessionView(after, st({ state: 'running' }))
    expect(rowStatus(view)).toBe('running')
    expect(availableActions(view, after)).toMatchObject({ end: false, interrupt: true, kill: true })
  })

  it('承認待ちは強制終了だけ (中断は出さない — 承認カードの「拒否」で止める。X-1 の規則の継承)', () => {
    const session = src({ promptSent: true, runState: 'awaiting_permission' })
    const view = deriveSessionView(session, st({ state: 'awaiting_permission' }))
    expect(rowStatus(view)).toBe('awaiting')
    expect(availableActions(view, session)).toMatchObject({
      end: false,
      interrupt: false,
      kill: true
    })
  })
})

describe('終了中 (pr-gate R2 po M-104 / L-103)', () => {
  it('プロンプト待ちで終了を押すと「終了中」になり、強制終了は残る', () => {
    const session = src({ ending: true })
    const view = deriveSessionView(session, st())
    expect(rowStatus(view)).toBe('ending')
    expect(availableActions(view, session)).toMatchObject({ endPending: true, kill: true })
  })

  it('claude が終わったら「終了済み」で、閉じるだけ', () => {
    const session = src({ ending: true })
    const view = deriveSessionView(session, st({ claudeAlive: false }))
    expect(rowStatus(view)).toBe('ended')
    expect(availableActions(view, session)).toMatchObject({ kill: false, close: true })
  })
})

describe('windowMessages (末尾の窓。SC-003 / pr-gate R1 po M-006)', () => {
  const list = (n: number): number[] => Array.from({ length: n }, (_, i) => i)

  it('窓の中に収まるときは同じ配列を返し、省略は 0 件', () => {
    const messages = list(MESSAGE_WINDOW)
    const result = windowMessages(messages, MESSAGE_WINDOW)
    expect(result.windowed).toBe(messages)
    expect(result.hiddenCount).toBe(0)
  })

  it('1 件あふれたら末尾の窓だけを返し、省略は 1 件', () => {
    const result = windowMessages(list(MESSAGE_WINDOW + 1), MESSAGE_WINDOW)
    expect(result.hiddenCount).toBe(1)
    expect(result.windowed).toHaveLength(MESSAGE_WINDOW)
    expect(result.windowed[0]).toBe(1)
    expect(result.windowed.at(-1)).toBe(MESSAGE_WINDOW)
  })

  it('「さらに表示」で窓を広げると省略が無くなる', () => {
    const messages = list(MESSAGE_WINDOW + 1)
    expect(windowMessages(messages, MESSAGE_WINDOW * 2)).toEqual({
      windowed: messages,
      hiddenCount: 0
    })
  })
})
