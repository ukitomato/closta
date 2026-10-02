import { describe, expect, it } from 'vitest'

import {
  acceptBatch,
  applySynthesized,
  coalesceUpdates,
  isSessionStatusUpdate,
  synthesizeExit,
  type RegistryStatus,
  type SessionStatusUpdate
} from './status-update'

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'

const u = (over: Partial<SessionStatusUpdate> = {}): SessionStatusUpdate => ({
  sessionId: A,
  state: 'running',
  reasonKey: null,
  claudeAlive: true,
  ...over
})

const entry = (over: Partial<RegistryStatus> = {}): RegistryStatus => ({
  generation: 1,
  state: 'launching',
  reasonKey: null,
  claudeAlive: true,
  ...over
})

describe('isSessionStatusUpdate', () => {
  it('正しい形だけを受け付ける', () => {
    expect(isSessionStatusUpdate(u())).toBe(true)
    expect(
      isSessionStatusUpdate(u({ state: 'error', reasonKey: 'process-crashed', claudeAlive: false }))
    ).toBe(true)
  })

  it('UUID でない sessionId・未知の状態・未知の理由キー・boolean でない生存フラグを拒否する', () => {
    expect(isSessionStatusUpdate(u({ sessionId: '../x' }))).toBe(false)
    expect(isSessionStatusUpdate({ ...u(), state: 'ended' })).toBe(false)
    expect(isSessionStatusUpdate({ ...u(), reasonKey: 'session-active' })).toBe(false)
    expect(isSessionStatusUpdate({ ...u(), claudeAlive: 'yes' })).toBe(false)
    expect(isSessionStatusUpdate(null)).toBe(false)
    expect(isSessionStatusUpdate([u()])).toBe(false)
  })

  it('会話由来の文字列を載せる余地を作らない — 未知のキーを持つ値を拒否する (SC-004)', () => {
    expect(isSessionStatusUpdate({ ...u(), text: 'hello' })).toBe(false)
    expect(isSessionStatusUpdate({ ...u(), label: 'proj' })).toBe(false)
  })

  it('型のフィールドは 4 つだけで、文字列は sessionId (UUID) と enum だけ (SC-004 の全フィールド走査)', () => {
    const sample = u({ state: 'error', reasonKey: 'provider-error', claudeAlive: false })
    expect(Object.keys(sample).sort()).toEqual(['claudeAlive', 'reasonKey', 'sessionId', 'state'])
  })
})

describe('coalesceUpdates', () => {
  it('同じセッションは最新に畳む', () => {
    const out = coalesceUpdates([
      u({ state: 'launching' }),
      u({ state: 'running' }),
      u({ sessionId: B })
    ])
    expect(out).toEqual([u({ state: 'running' }), u({ sessionId: B })])
  })

  it('error と理由キーは後続の非 error で上書きされない', () => {
    const out = coalesceUpdates([
      u({ state: 'error', reasonKey: 'provider-error' }),
      u({ state: 'running' })
    ])
    expect(out[0]).toMatchObject({ state: 'error', reasonKey: 'provider-error' })
  })

  it('claudeAlive: false は後続の true で上書きされない', () => {
    const out = coalesceUpdates([u({ claudeAlive: false }), u({ claudeAlive: true })])
    expect(out[0]?.claudeAlive).toBe(false)
  })

  it('done は終端として扱わず、後続の running で上書きされる (応答待ちから次のターンへ)', () => {
    const out = coalesceUpdates([u({ state: 'done' }), u({ state: 'running' })])
    expect(out[0]?.state).toBe('running')
  })
})

describe('acceptBatch (main の受信規則の唯一の正本)', () => {
  it('registry に在り現行世代のエントリへの通知だけを受理し、registry を更新する', () => {
    const registry = new Map([[A, entry()]])
    const { accepted, next } = acceptBatch(registry, 1, [u({ state: 'running' })])
    expect(accepted).toEqual([u({ state: 'running' })])
    expect(next.get(A)).toEqual(entry({ state: 'running' }))
    // 入力の Map は変更しない。
    expect(registry.get(A)?.state).toBe('launching')
  })

  it('形の崩れた値・registry に無い sessionId・別世代の通知を捨てる', () => {
    const registry = new Map([[A, entry({ generation: 1 })]])
    const { accepted, next } = acceptBatch(registry, 2, [
      { garbage: true },
      u({ sessionId: B }),
      u({ state: 'running' }) // A は世代 1 のエントリ、現行世代は 2
    ])
    expect(accepted).toEqual([])
    expect(next.get(A)).toEqual(entry({ generation: 1 }))
  })

  it('claudeAlive の false→true を反映せず、accepted にも単調性を適用した値が出る (R2 M-103)', () => {
    const registry = new Map([[A, entry({ claudeAlive: false, state: 'done' })]])
    const { accepted, next } = acceptBatch(registry, 1, [
      u({ claudeAlive: true, state: 'running' })
    ])
    expect(accepted[0]?.claudeAlive).toBe(false)
    expect(next.get(A)?.claudeAlive).toBe(false)
  })

  it('registry の error は後続の通知で上書きされない', () => {
    const registry = new Map([
      [A, entry({ state: 'error', reasonKey: 'supervisor-exited', claudeAlive: false })]
    ])
    const { accepted } = acceptBatch(registry, 1, [u({ state: 'running' })])
    expect(accepted[0]).toMatchObject({ state: 'error', reasonKey: 'supervisor-exited' })
  })
})

describe('synthesizeExit / applySynthesized', () => {
  it('異常終了の通知は error + 理由キー + claudeAlive: false', () => {
    expect(synthesizeExit([A, B], 'supervisor-exited')).toEqual([
      { sessionId: A, state: 'error', reasonKey: 'supervisor-exited', claudeAlive: false },
      { sessionId: B, state: 'error', reasonKey: 'supervisor-exited', claudeAlive: false }
    ])
  })

  it('applySynthesized は世代を照合せずに registry へ重ね、registry に無いものは捨てる', () => {
    const registry = new Map([[A, entry({ generation: 3 })]])
    const { accepted, next } = applySynthesized(
      registry,
      synthesizeExit([A, B], 'supervisor-exited')
    )
    expect(accepted).toHaveLength(1)
    expect(next.get(A)).toEqual({
      generation: 3,
      state: 'error',
      reasonKey: 'supervisor-exited',
      claudeAlive: false
    })
  })
})
