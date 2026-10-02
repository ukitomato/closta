import { describe, expect, it, vi } from 'vitest'

import type { SessionStatusUpdate } from '@domain/session/status-update'

import { createSessionStatusRelay } from './session-status-relay'

const u: SessionStatusUpdate = {
  sessionId: '11111111-1111-4111-8111-111111111111',
  state: 'running',
  reasonKey: null,
  claudeAlive: true
}

describe('createSessionStatusRelay (X-5 / BE-013 / SC-004)', () => {
  it('受理済みのバッチを 1 回で送る (再バッチしない)', () => {
    const relay = createSessionStatusRelay()
    const send = vi.fn()
    relay.onForward(send)
    relay.forward([u, { ...u, state: 'done' }])
    expect(send).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalledWith([u, { ...u, state: 'done' }])
  })

  it('空のバッチは送らない', () => {
    const relay = createSessionStatusRelay()
    const send = vi.fn()
    relay.onForward(send)
    relay.forward([])
    expect(send).not.toHaveBeenCalled()
  })
})
