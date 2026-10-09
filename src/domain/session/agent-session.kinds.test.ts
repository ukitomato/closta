import { describe, expect, it } from 'vitest'

import { SESSION_EVENT_KINDS } from './agent-session'

/**
 * `SessionEvent` の kind の固定テスト (O-2 / BE-024。design-gate R2 platform-boundary L-101)。
 * O-2 は tool の結果・Hook / task の行を既存の `message` で運び、kind を増やさない。
 * O-4 は計量の `meter` を 1 つだけ足す (AD-047 Decision 2 / 014 spec FR-015・SC-006)。
 */
describe('SESSION_EVENT_KINDS', () => {
  it('8 つ (O-4 の meter を足した)', () => {
    expect([...SESSION_EVENT_KINDS].sort()).toEqual([
      'end-forced',
      'failure',
      'interrupt-receipt',
      'message',
      'meter',
      'permission-denied',
      'permission-request',
      'state'
    ])
  })
})
