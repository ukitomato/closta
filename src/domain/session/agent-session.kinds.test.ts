import { describe, expect, it } from 'vitest'

import { SESSION_EVENT_KINDS } from './agent-session'
import { SUPPORTED_DIALOG_KINDS } from './elicitation'

/**
 * `SessionEvent` の kind の固定テスト (O-2 / BE-024。design-gate R2 platform-boundary L-101)。
 * O-2 は tool の結果・Hook / task の行を既存の `message` で運び、kind を増やさない。
 * O-4 は計量の `meter` を 1 つだけ足す (AD-047 Decision 2 / 014 spec FR-015・SC-006)。
 * O-10 は Elicitation の要求の `elicitation-request` を 1 つだけ足す (AD-053 Decision 2)。
 */
describe('SESSION_EVENT_KINDS', () => {
  it('9 つ (O-10 の elicitation-request を足した。集合を変えるには ADR が要る)', () => {
    expect([...SESSION_EVENT_KINDS].sort()).toEqual([
      'elicitation-request',
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

  it('宣言する dialog の種類は無い (`request_user_dialog` は受けない。AD-053 Decision 4)', () => {
    expect(SUPPORTED_DIALOG_KINDS).toEqual([])
  })
})
