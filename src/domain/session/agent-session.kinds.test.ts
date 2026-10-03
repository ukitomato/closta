import { describe, expect, it } from 'vitest'

import { SESSION_EVENT_KINDS } from './agent-session'

/**
 * `SessionEvent` の kind の固定テスト (O-2 / BE-024。design-gate R2 platform-boundary L-101)。
 * O-2 は tool の結果・Hook / task の行を既存の `message` で運び、kind を増やさない。
 */
describe('SESSION_EVENT_KINDS', () => {
  it('7 つのまま', () => {
    expect([...SESSION_EVENT_KINDS].sort()).toEqual([
      'end-forced',
      'failure',
      'interrupt-receipt',
      'message',
      'permission-denied',
      'permission-request',
      'state'
    ])
  })
})
