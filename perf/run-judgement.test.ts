import { describe, expect, it } from 'vitest'

import { DEFAULT_MIN_MESSAGES, judgeRun, parseMinMessages } from './run-judgement'

/** 実機計測の回の判定 (O-1 FR-012 / SC-005。pr-gate R1 architecture M-002)。実機を使わずに固定する。 */

describe('parseMinMessages', () => {
  it('未設定なら既定の下限で、既定から変えていない', () => {
    expect(parseMinMessages(undefined)).toEqual({
      minMessages: DEFAULT_MIN_MESSAGES,
      thresholdOverridden: false
    })
    expect(parseMinMessages('')).toEqual({
      minMessages: DEFAULT_MIN_MESSAGES,
      thresholdOverridden: false
    })
  })

  it('既定以外の下限は使い、変えたことを記録する。既定と同じ値なら変えていない扱い', () => {
    expect(parseMinMessages('10')).toEqual({ minMessages: 10, thresholdOverridden: true })
    expect(parseMinMessages(String(DEFAULT_MIN_MESSAGES))).toEqual({
      minMessages: DEFAULT_MIN_MESSAGES,
      thresholdOverridden: false
    })
  })

  it('有限の正の数でなければ理由キーだけで止める (値を例外の文に出さない)', () => {
    for (const raw of ['abc', 'NaN', 'Infinity', '0', '-5'])
      expect(() => parseMinMessages(raw)).toThrow(/^refused: CLOSTA_PERF_MIN_MESSAGES$/)
  })
})

describe('judgeRun', () => {
  const base = {
    sessions: 10,
    runningAtStart: 10,
    runningAtEnd: 10,
    receivedAtStart: 100,
    receivedAtEnd: 140,
    minMessages: 30
  }

  it('10 本が窓の両端で応答中で、下限以上のメッセージが届いたら有効', () => {
    expect(judgeRun(base)).toEqual({ messages: 40, reason: null })
  })

  it('窓の両端のどちらかで応答中が欠けたら not-all-running', () => {
    expect(judgeRun({ ...base, runningAtStart: 9 }).reason).toBe('not-all-running')
    expect(judgeRun({ ...base, runningAtEnd: 4 }).reason).toBe('not-all-running')
  })

  it('受信の累計が読めなければ probe-missing (NaN で下限の判定を素通りさせない)', () => {
    expect(judgeRun({ ...base, receivedAtEnd: Number.NaN })).toEqual({
      messages: null,
      reason: 'probe-missing'
    })
    expect(judgeRun({ ...base, receivedAtStart: Number.POSITIVE_INFINITY }).reason).toBe(
      'probe-missing'
    )
  })

  it('下限に届かなければ too-few-messages', () => {
    expect(judgeRun({ ...base, receivedAtEnd: 129 })).toEqual({
      messages: 29,
      reason: 'too-few-messages'
    })
    expect(judgeRun({ ...base, receivedAtEnd: 130 }).reason).toBeNull()
  })
})
