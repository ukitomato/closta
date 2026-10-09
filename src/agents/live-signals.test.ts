import { describe, expect, it, vi } from 'vitest'

import type { SessionEvent } from '@domain/session/agent-session'
import type { SafePermissionMode } from '@domain/session/launch-config'

import { createLiveSignals } from './live-signals'

/**
 * O-4 BE-004 — 分岐の集約の土台 (014 research R-14 / data-model §2「セッションスレッドの状態」)。
 * BE-012 — 失敗の理由の材料 (data-model §1)。
 * BE-020 — レート制限 (`meter` の `rate-limit`) と API の再試行の行 (data-model §2 / §3)。
 * BE-030 — コンテキスト (`meter` の `context`) とターン (`turn`) (data-model §2)。
 * BE-040 — 権限モード (`meter` の `permission-mode` と権限モードの行。data-model §2 / §3)。
 */

function setup(launchPermissionMode: SafePermissionMode = 'default'): {
  signals: ReturnType<typeof createLiveSignals>
  emitted: SessionEvent[]
} {
  const emitted: SessionEvent[] = []
  const signals = createLiveSignals({
    launchPermissionMode,
    emit: (event) => emitted.push(event),
    clock: { now: () => 0, setTimer: vi.fn(), clearTimer: vi.fn() }
  })
  return { signals, emitted }
}

const FEED: readonly unknown[] = [
  { type: 'assistant', parent_tool_use_id: null, message: { usage: { input_tokens: 1 } } },
  { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 't1' }] } },
  { type: 'system', subtype: 'init', permissionMode: 'plan' },
  { type: 'system', subtype: 'status', status: 'compacting' },
  { type: 'system', subtype: 'api_retry', attempt: 1, max_retries: 3, error_status: 529 },
  { type: 'rate_limit_event', rate_limit_info: { status: 'rejected' } },
  { type: 'tool_progress', tool_use_id: 't1', parent_tool_use_id: null, elapsed_time_seconds: 2 },
  null,
  'x',
  42,
  { __proto__: null }
]

describe('createLiveSignals (土台)', () => {
  it('onResult は壊れた形・状態の無い result で今と同じ provider-error を返す', () => {
    const { signals } = setup()
    const results = [
      { type: 'result', subtype: 'success', is_error: true },
      { type: 'result', subtype: 'unexpected_new_subtype', is_error: true },
      null,
      'x',
      42,
      []
    ]
    for (const result of results) expect(signals.onResult(result)).toBe('provider-error')
  })

  it('どの分岐も例外を投げない', () => {
    const { signals } = setup()
    for (const message of FEED) {
      expect(() => {
        signals.onAssistant(message)
        signals.onUser(message)
        signals.onSystem(message)
        signals.onRateLimit(message)
        signals.onToolProgress(message)
        signals.onResult(message)
      }).not.toThrow()
    }
  })

  it('対象外・形の壊れたメッセージでは何も送らない', () => {
    const { signals, emitted } = setup()
    const ignored: readonly unknown[] = [
      // tool の結果は取り消しにだけ使う
      { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 't1' }] } },
      // 権限モードの無い init・status、圧縮でない status
      { type: 'system', subtype: 'init' },
      { type: 'system', subtype: 'status', status: null },
      { type: 'system', subtype: 'status', status: 'requesting' },
      // 圧縮の結果が列挙の外
      { type: 'system', subtype: 'status', status: null, compact_result: 'partial' },
      // O-4 が読まない system
      { type: 'system', subtype: 'hook_progress', hook_id: 'h1', stdout: 'x' },
      { type: 'system', subtype: 'background_tasks_changed', tasks: [] },
      // subagent の中の tool の経過時間
      {
        type: 'tool_progress',
        tool_use_id: 't1',
        parent_tool_use_id: 'toolu_parent',
        elapsed_time_seconds: 2
      },
      null,
      'x',
      42,
      { __proto__: null }
    ]
    for (const message of ignored) {
      signals.onAssistant(message)
      signals.onUser(message)
      signals.onSystem(message)
      signals.onRateLimit(message)
      signals.onToolProgress(message)
      signals.onResult(message)
    }
    expect(emitted).toEqual([])
  })

  it('onResult は result の subtype と api_error_status から理由を返す (014 data-model §1)', () => {
    const { signals } = setup()
    expect(
      signals.onResult({
        type: 'result',
        subtype: 'error_max_turns',
        is_error: true,
        api_error_status: 401
      })
    ).toBe('auth-failed')
    expect(signals.onResult({ type: 'result', subtype: 'success', api_error_status: 429 })).toBe(
      'rate-limited'
    )
    expect(signals.onResult({ type: 'result', subtype: 'error_max_budget_usd' })).toBe('max-budget')
    expect(signals.onResult({ type: 'result', subtype: 'success', api_error_status: 503 })).toBe(
      'api-error'
    )
  })

  it('errors / result の文字列を読まない (どんな文字列でも理由は変わらない。U-5)', () => {
    const { signals } = setup()
    expect(
      signals.onResult({
        type: 'result',
        subtype: 'error_during_execution',
        is_error: true,
        errors: ['401 Unauthorized: rate_limit billing_error'],
        result: 'authentication_failed'
      })
    ).toBe('execution-error')
  })

  it('dispose は何度呼んでもよく、timer を使わない', () => {
    const setTimer = vi.fn()
    const signals = createLiveSignals({
      launchPermissionMode: 'plan',
      emit: () => {},
      clock: { now: () => 0, setTimer, clearTimer: vi.fn() }
    })
    expect(() => {
      signals.dispose()
      signals.dispose()
    }).not.toThrow()
    expect(setTimer).not.toHaveBeenCalled()
  })
})

describe('createLiveSignals — 失敗の理由の材料 (O-4 BE-012 / 014 data-model §1)', () => {
  const mainAssistant = (error?: unknown): Record<string, unknown> => ({
    type: 'assistant',
    parent_tool_use_id: null,
    message: { content: [] },
    ...(error === undefined ? {} : { error })
  })
  const failedResult = { type: 'result', subtype: 'success', is_error: true }

  it('主ループの assistant の error で理由が決まる', () => {
    const { signals } = setup()
    signals.onAssistant(mainAssistant('billing_error'))
    expect(signals.onResult(failedResult)).toBe('billing')
    signals.onAssistant(mainAssistant('authentication_failed'))
    expect(signals.onResult(failedResult)).toBe('auth-failed')
    signals.onAssistant(mainAssistant('rate_limit'))
    expect(signals.onResult(failedResult)).toBe('rate-limited')
  })

  it('subagent の中の assistant の error を使わない', () => {
    const { signals } = setup()
    signals.onAssistant({
      type: 'assistant',
      parent_tool_use_id: 'toolu_parent',
      message: { content: [] },
      error: 'billing_error'
    })
    expect(signals.onResult(failedResult)).toBe('provider-error')
    // parent_tool_use_id が無い (null でない) ものも主ループとみなさない
    signals.onAssistant({ type: 'assistant', message: { content: [] }, error: 'rate_limit' })
    expect(signals.onResult(failedResult)).toBe('provider-error')
  })

  it('result で消え、次のターンに持ち越さない (成功の result でも消える)', () => {
    const { signals } = setup()
    signals.onAssistant(mainAssistant('billing_error'))
    expect(signals.onResult(failedResult)).toBe('billing')
    expect(signals.onResult(failedResult)).toBe('provider-error')

    signals.onAssistant(mainAssistant('rate_limit'))
    signals.onResult({ type: 'result', subtype: 'success', is_error: false })
    expect(signals.onResult(failedResult)).toBe('provider-error')
  })

  it('同じターンの最後の error を使い、error の無い assistant は前の error を消さない', () => {
    const { signals } = setup()
    signals.onAssistant(mainAssistant('rate_limit'))
    signals.onAssistant(mainAssistant('billing_error'))
    signals.onAssistant(mainAssistant())
    signals.onAssistant(mainAssistant(null))
    expect(signals.onResult(failedResult)).toBe('billing')
  })

  it('列挙の外の error は表に無い error と同じ (前の error を上書きし、汎用の理由)', () => {
    const { signals } = setup()
    signals.onAssistant(mainAssistant('billing_error'))
    signals.onAssistant(mainAssistant('future_error_kind'))
    expect(signals.onResult(failedResult)).toBe('provider-error')
    signals.onAssistant(mainAssistant('__proto__'))
    expect(signals.onResult({ ...failedResult, api_error_status: 500 })).toBe('api-error')
  })

  it('assistant の error を覚えても何も送らない', () => {
    const { signals, emitted } = setup()
    signals.onAssistant(mainAssistant('billing_error'))
    signals.onResult(failedResult)
    expect(emitted).toEqual([])
  })
})

describe('createLiveSignals — レート制限 (O-4 BE-020 / 014 data-model §2)', () => {
  const rateLimit = (info: unknown): Record<string, unknown> => ({
    type: 'rate_limit_event',
    rate_limit_info: info,
    uuid: 'u1',
    session_id: 's1'
  })

  it('rate_limit_info の 5 つのフィールドから meter の rate-limit を送る', () => {
    const { signals, emitted } = setup()
    signals.onRateLimit(
      rateLimit({
        status: 'allowed_warning',
        rateLimitType: 'seven_day_overage_included',
        utilization: 0.5,
        resetsAt: 1_760_000_000,
        isUsingOverage: true
      })
    )
    expect(emitted).toEqual([
      {
        kind: 'meter',
        meter: {
          type: 'rate-limit',
          status: 'allowed_warning',
          limitType: 'seven_day_overage_included',
          utilizationPct: 50,
          resetsAtSec: 1_760_000_000,
          usingOverage: true
        }
      }
    ])
  })

  it('間引かない (続けて届いた event をどれも送る)', () => {
    const { signals, emitted } = setup()
    signals.onRateLimit(rateLimit({ status: 'allowed_warning', utilization: 80 }))
    signals.onRateLimit(rateLimit({ status: 'rejected' }))
    signals.onRateLimit(rateLimit({ status: 'allowed' }))
    expect(emitted.map((e) => (e.kind === 'meter' ? e.meter : null))).toEqual([
      expect.objectContaining({ status: 'allowed_warning', utilizationPct: 80 }),
      expect.objectContaining({ status: 'rejected' }),
      expect.objectContaining({ status: 'allowed' })
    ])
  })

  it('utilization / resetsAt / rateLimitType が無い・範囲外・列挙の外なら null。isUsingOverage は true のときだけ', () => {
    const { signals, emitted } = setup()
    signals.onRateLimit(rateLimit({ status: 'rejected' }))
    signals.onRateLimit(
      rateLimit({
        status: 'rejected',
        utilization: 150,
        resetsAt: 1e300,
        rateLimitType: '__proto__',
        isUsingOverage: 'true'
      })
    )
    signals.onRateLimit(
      rateLimit({ status: 'rejected', utilization: -1, resetsAt: 5, rateLimitType: 'toString' })
    )
    for (const event of emitted) {
      expect(event).toEqual({
        kind: 'meter',
        meter: {
          type: 'rate-limit',
          status: 'rejected',
          limitType: null,
          utilizationPct: null,
          resetsAtSec: null,
          usingOverage: false
        }
      })
    }
    expect(emitted).toHaveLength(3)
  })

  it('resetsAt が ms なら秒に直す', () => {
    const { signals, emitted } = setup()
    signals.onRateLimit(rateLimit({ status: 'allowed_warning', resetsAt: 1_760_000_000_123 }))
    expect(emitted[0]).toMatchObject({ meter: { resetsAtSec: 1_760_000_000 } })
  })

  it('status が列挙の外・rate_limit_info が無い・type が違うなら送らない', () => {
    const { signals, emitted } = setup()
    signals.onRateLimit(rateLimit({ status: 'blocked' }))
    signals.onRateLimit(rateLimit({ status: '__proto__' }))
    signals.onRateLimit(rateLimit(null))
    signals.onRateLimit(rateLimit([]))
    signals.onRateLimit({ type: 'rate_limit_event' })
    signals.onRateLimit({ type: 'system', rate_limit_info: { status: 'rejected' } })
    expect(emitted).toEqual([])
  })

  it('許可リストの外のフィールドの値を送らない (014 SC-002)', () => {
    const { signals, emitted } = setup()
    signals.onRateLimit({
      type: 'rate_limit_event',
      uuid: 'LEAK-uuid',
      session_id: 'LEAK-session',
      rate_limit_info: {
        status: 'rejected',
        rateLimitType: 'five_hour',
        utilization: 1,
        resetsAt: 1_760_000_000,
        isUsingOverage: false,
        overageStatus: 'LEAK-overageStatus',
        overageResetsAt: 'LEAK-overageResetsAt',
        overageDisabledReason: 'LEAK-overageDisabledReason',
        overageInUse: 'LEAK-overageInUse',
        surpassedThreshold: 'LEAK-surpassedThreshold',
        limitScope: 'LEAK-limitScope',
        errorCode: 'LEAK-errorCode',
        canUserPurchaseCredits: 'LEAK-canUserPurchaseCredits',
        hasChargeableSavedPaymentMethod: 'LEAK-hasChargeableSavedPaymentMethod'
      }
    })
    expect(emitted).toHaveLength(1)
    expect(JSON.stringify(emitted)).not.toContain('LEAK')
  })

  it('dispose の後は送らない', () => {
    const { signals, emitted } = setup()
    signals.dispose()
    signals.onRateLimit(rateLimit({ status: 'rejected' }))
    expect(emitted).toEqual([])
  })
})

describe('createLiveSignals — API の再試行の行 (O-4 BE-020 / 014 data-model §3)', () => {
  interface RowSummary {
    readonly id: string
    readonly opens: boolean
    readonly detail: string
    readonly status: string | null
  }
  /** 送った行を (id・opens・detail・status) に縮める。行でない event は落とす。 */
  const rowsOf = (emitted: readonly SessionEvent[]): RowSummary[] =>
    emitted.flatMap((event) => {
      if (event.kind !== 'message') return []
      const part = event.message.parts[0]
      if (part?.type !== 'system-event') return []
      expect(event.message.role).toBe('system')
      expect(part.category).toBe('api-retry')
      expect(part.name).toBe('')
      return [{ id: event.message.id, opens: part.opens, detail: part.detail, status: part.status }]
    })
  const apiRetry = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
    type: 'system',
    subtype: 'api_retry',
    attempt: 1,
    max_retries: 10,
    retry_delay_ms: 2000,
    error_status: 529,
    error: 'overloaded',
    uuid: 'u1',
    session_id: 's1',
    ...over
  })
  const mainAssistant = { type: 'assistant', parent_tool_use_id: null, message: { content: [] } }
  const subagentAssistant = {
    type: 'assistant',
    parent_tool_use_id: 'toolu_parent',
    message: { content: [] }
  }
  const okResult = { type: 'result', subtype: 'success', is_error: false }
  const failedResult = { type: 'result', subtype: 'error_during_execution', is_error: true }

  it('開閉の順: 最初の api_retry で行を作り、続きは同じ行。次の主ループの assistant で succeeded', () => {
    const { signals, emitted } = setup()
    signals.onSystem(apiRetry())
    signals.onSystem(apiRetry({ attempt: 2, retry_delay_ms: 4000, error_status: null }))
    signals.onAssistant(subagentAssistant)
    signals.onAssistant(mainAssistant)
    // 主ループの assistant はブロックごとに届く。同じ状態を送り直さない。
    signals.onAssistant(mainAssistant)
    signals.onResult(okResult)
    expect(rowsOf(emitted)).toEqual([
      { id: 'retry:0', opens: true, detail: '1/10/529/2000', status: 'retrying' },
      { id: 'retry:0', opens: false, detail: '2/10/-/4000', status: 'retrying' },
      { id: 'retry:0', opens: false, detail: '', status: 'succeeded' }
    ])
  })

  it('同じターンで assistant の後にまた再試行したら、同じ行に合成する', () => {
    const { signals, emitted } = setup()
    signals.onSystem(apiRetry())
    signals.onAssistant(mainAssistant)
    signals.onSystem(apiRetry({ attempt: 1, error_status: 500 }))
    signals.onAssistant(mainAssistant)
    expect(rowsOf(emitted)).toEqual([
      { id: 'retry:0', opens: true, detail: '1/10/529/2000', status: 'retrying' },
      { id: 'retry:0', opens: false, detail: '', status: 'succeeded' },
      { id: 'retry:0', opens: false, detail: '1/10/500/2000', status: 'retrying' },
      { id: 'retry:0', opens: false, detail: '', status: 'succeeded' }
    ])
  })

  it('result で閉じる: 成功なら succeeded、失敗なら failed。閉じは理由を返す前に送る', () => {
    const { signals, emitted } = setup()
    signals.onSystem(apiRetry())
    signals.onResult(okResult)
    signals.onSystem(apiRetry())
    expect(signals.onResult(failedResult)).toBe('execution-error')
    expect(rowsOf(emitted)).toEqual([
      { id: 'retry:0', opens: true, detail: '1/10/529/2000', status: 'retrying' },
      { id: 'retry:0', opens: false, detail: '', status: 'succeeded' },
      { id: 'retry:1', opens: true, detail: '1/10/529/2000', status: 'retrying' },
      { id: 'retry:1', opens: false, detail: '', status: 'failed' }
    ])
  })

  it('主ループの assistant の後でも、result が失敗なら failed に書き換える (再試行を使い切った後の合成のエラーなど)', () => {
    const { signals, emitted } = setup()
    signals.onSystem(apiRetry({ attempt: 10 }))
    signals.onAssistant({ ...mainAssistant, error: 'overloaded' })
    signals.onResult({ type: 'result', subtype: 'success', is_error: true })
    expect(rowsOf(emitted).map((r) => r.status)).toEqual(['retrying', 'succeeded', 'failed'])
  })

  it('次のターンの再試行は別の id。開いた行が無ければ assistant と result で何も送らない', () => {
    const { signals, emitted } = setup()
    signals.onAssistant(mainAssistant)
    signals.onResult(okResult)
    signals.onResult(failedResult)
    expect(emitted).toEqual([])
    signals.onSystem(apiRetry())
    expect(rowsOf(emitted).map((r) => r.id)).toEqual(['retry:2'])
    signals.onResult(okResult)
    signals.onResult(failedResult)
    expect(rowsOf(emitted).map((r) => r.id)).toEqual(['retry:2', 'retry:2'])
  })

  it('数が外れたら 0、error_status が整数でなければ - で符号化する', () => {
    const { signals, emitted } = setup()
    signals.onSystem(
      apiRetry({ attempt: -1, max_retries: 'x', retry_delay_ms: 1.5, error_status: 'LEAK-status' })
    )
    expect(rowsOf(emitted)[0]?.detail).toBe('0/0/-/0')
  })

  it('許可リストの外 (error・no_response ほか) の値を送らない (014 SC-002)', () => {
    const { signals, emitted } = setup()
    signals.onSystem(
      apiRetry({
        error: 'LEAK-error',
        no_response: { waited_ms: 'LEAK-waited', retry_wait_ms: 'LEAK-wait' },
        uuid: 'LEAK-uuid',
        session_id: 'LEAK-session'
      })
    )
    signals.onAssistant(mainAssistant)
    expect(emitted).toHaveLength(2)
    expect(JSON.stringify(emitted)).not.toContain('LEAK')
  })

  it('type が system でない・subtype が違うものから行を作らない', () => {
    const { signals, emitted } = setup()
    signals.onSystem({ ...apiRetry(), type: 'assistant' })
    signals.onSystem({ ...apiRetry(), subtype: 'api_retry_v2' })
    expect(emitted).toEqual([])
  })

  it('dispose の後は送らない', () => {
    const { signals, emitted } = setup()
    signals.onSystem(apiRetry())
    signals.dispose()
    signals.onSystem(apiRetry({ attempt: 2 }))
    signals.onAssistant(mainAssistant)
    signals.onResult(failedResult)
    expect(rowsOf(emitted)).toHaveLength(1)
  })
})

describe('createLiveSignals — コンテキストとターン (O-4 BE-030 / 014 data-model §2)', () => {
  const meters = (emitted: readonly SessionEvent[]): unknown[] =>
    emitted.flatMap((event) => (event.kind === 'meter' ? [event.meter] : []))
  /** 送った `turn` の拒否の件数の並び。 */
  const denialsOf = (emitted: readonly SessionEvent[]): unknown[] =>
    meters(emitted).map((m) => (m as { permissionDenials: number }).permissionDenials)
  const assistantWith = (
    usage: unknown,
    parent: string | null = null
  ): Record<string, unknown> => ({
    type: 'assistant',
    parent_tool_use_id: parent,
    message: { content: [], usage }
  })
  const result = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
    type: 'result',
    subtype: 'success',
    is_error: false,
    num_turns: 1,
    total_cost_usd: 0.25,
    ...over
  })
  const modelUsage = {
    'claude-sonnet-4-5': {
      inputTokens: 10,
      outputTokens: 20,
      cacheReadInputTokens: 30,
      cacheCreationInputTokens: 40,
      costUSD: 0.25,
      contextWindow: 200_000
    }
  }

  it('主ループの assistant の入力側 3 つの和を context で送る (出力側は足さない)', () => {
    const { signals, emitted } = setup()
    signals.onAssistant(
      assistantWith({
        input_tokens: 100,
        cache_read_input_tokens: 2000,
        cache_creation_input_tokens: 30,
        output_tokens: 5000
      })
    )
    expect(meters(emitted)).toEqual([{ type: 'context', usedTokens: 2130 }])
  })

  it('同じ値の context を続けて送らない (前に送った値と違えば送る)', () => {
    const { signals, emitted } = setup()
    const usage = { input_tokens: 1, cache_read_input_tokens: 2, cache_creation_input_tokens: 3 }
    signals.onAssistant(assistantWith(usage))
    signals.onAssistant(assistantWith({ ...usage, output_tokens: 99 }))
    signals.onAssistant(assistantWith({ input_tokens: 7 }))
    signals.onAssistant(assistantWith({ input_tokens: 6 }))
    expect(meters(emitted)).toEqual([
      { type: 'context', usedTokens: 6 },
      { type: 'context', usedTokens: 7 },
      { type: 'context', usedTokens: 6 }
    ])
  })

  it('subagent の中の assistant・usage の無い assistant を使わない', () => {
    const { signals, emitted } = setup()
    signals.onAssistant(assistantWith({ input_tokens: 500 }, 'toolu_parent'))
    signals.onAssistant({ type: 'assistant', message: { usage: { input_tokens: 500 } } })
    signals.onAssistant({ type: 'assistant', parent_tool_use_id: null, message: { content: [] } })
    signals.onAssistant({ type: 'assistant', parent_tool_use_id: null, message: 'x' })
    signals.onAssistant(assistantWith([1, 2]))
    signals.onAssistant(assistantWith('LEAK'))
    expect(emitted).toEqual([])
  })

  it('result から turn (費用・ターン数・モデルの内訳・拒否の件数) を送る', () => {
    const { signals, emitted } = setup()
    signals.onResult(
      result({
        modelUsage,
        permission_denials: [{ tool_name: 'Bash', tool_use_id: 'toolu_1', tool_input: {} }]
      })
    )
    expect(meters(emitted)).toEqual([
      {
        type: 'turn',
        costUsd: 0.25,
        turns: 1,
        models: [
          {
            modelId: 'claude-sonnet-4-5',
            input: 10,
            output: 20,
            cacheRead: 30,
            cacheCreation: 40,
            costUsd: 0.25,
            contextWindow: 200_000
          }
        ],
        permissionDenials: 1
      }
    ])
  })

  it('失敗の result でも turn を送り、理由を返す前に送る', () => {
    const { signals, emitted } = setup()
    const reason = signals.onResult(
      result({ subtype: 'error_max_turns', is_error: true, total_cost_usd: 1 })
    )
    expect(reason).toBe('max-turns')
    expect(meters(emitted)).toEqual([
      expect.objectContaining({ type: 'turn', costUsd: 1, turns: 1 })
    ])
  })

  it('turns は result ごとに +1 (num_turns を使わない。research R-08)', () => {
    const { signals, emitted } = setup()
    signals.onResult(result({ num_turns: 7 }))
    signals.onResult(result({ num_turns: 3 }))
    signals.onResult(result({ num_turns: 12 }))
    expect(meters(emitted).map((m) => (m as { turns: number }).turns)).toEqual([1, 2, 3])
  })

  it('0 に倒した result は送らず turns も増やさない (費用だけ・ターンだけの result は送る)', () => {
    const { signals, emitted } = setup()
    signals.onResult(result({ num_turns: 0, total_cost_usd: 0, is_error: true }))
    // 検証で外れた値は 0 (num_turns も total_cost_usd も無い result)
    signals.onResult({ type: 'result', subtype: 'success', is_error: true })
    signals.onResult(result({ num_turns: 'x', total_cost_usd: Number.NaN }))
    expect(emitted).toEqual([])
    signals.onResult(result({ num_turns: 0, total_cost_usd: 0.5 }))
    signals.onResult(result({ num_turns: 2, total_cost_usd: 0 }))
    expect(meters(emitted)).toEqual([
      expect.objectContaining({ type: 'turn', costUsd: 0.5, turns: 1 }),
      expect.objectContaining({ type: 'turn', costUsd: 0, turns: 2 })
    ])
  })

  it('/clear 相当で費用が 0 に戻ってもそのまま送る (turns は減らない)', () => {
    const { signals, emitted } = setup()
    signals.onResult(result({ total_cost_usd: 1.5, modelUsage }))
    signals.onResult(result({ num_turns: 1, total_cost_usd: 0, modelUsage: {} }))
    expect(meters(emitted)).toEqual([
      expect.objectContaining({ costUsd: 1.5, turns: 1 }),
      expect.objectContaining({ costUsd: 0, turns: 2, models: [] })
    ])
  })

  it('拒否の件数は tool_use_id の重複を除いて数え、形の外れた id を数えない', () => {
    const { signals, emitted } = setup()
    const denial = (id: unknown): Record<string, unknown> => ({
      tool_name: 'Bash',
      tool_use_id: id,
      tool_input: {}
    })
    signals.onResult(
      result({ permission_denials: [denial('toolu_a'), denial('toolu_b'), denial('toolu_a')] })
    )
    signals.onResult(
      result({
        permission_denials: [
          denial('toolu_b'),
          denial('toolu_c'),
          denial('a/b'),
          denial('a b'),
          denial('x'.repeat(129)),
          denial(42),
          null,
          'toolu_d'
        ]
      })
    )
    signals.onResult(result({ permission_denials: 'x' }))
    expect(denialsOf(emitted)).toEqual([2, 3, 3])
  })

  it('拒否の件数は 1,024 で止まる (上限に達したら足さない)', () => {
    const { signals, emitted } = setup()
    const denials = (from: number, count: number): unknown[] =>
      Array.from({ length: count }, (_, i) => ({ tool_use_id: `toolu_${from + i}` }))
    signals.onResult(result({ permission_denials: denials(0, 1000) }))
    signals.onResult(result({ permission_denials: denials(1000, 100) }))
    signals.onResult(result({ permission_denials: denials(5000, 10) }))
    expect(denialsOf(emitted)).toEqual([1000, 1024, 1024])
  })

  it('result と assistant の許可リストの外の値を送らない (014 SC-002)', () => {
    const { signals, emitted } = setup()
    signals.onAssistant({
      type: 'assistant',
      parent_tool_use_id: null,
      uuid: 'LEAK-uuid',
      session_id: 'LEAK-session',
      message: {
        id: 'LEAK-message-id',
        model: 'LEAK-model',
        stop_reason: 'LEAK-stop',
        content: [{ type: 'text', text: 'LEAK-text' }],
        usage: {
          input_tokens: 10,
          cache_read_input_tokens: 20,
          cache_creation_input_tokens: 30,
          output_tokens: 31337,
          service_tier: 'LEAK-tier',
          server_tool_use: { web_search_requests: 'LEAK-web' }
        }
      }
    })
    signals.onResult({
      type: 'result',
      subtype: 'error_during_execution',
      is_error: true,
      num_turns: 8_675_309,
      total_cost_usd: 0.5,
      duration_ms: 4_242_424,
      result: 'LEAK-result',
      errors: ['LEAK-errors'],
      stop_reason: 'LEAK-stop-reason',
      terminal_reason: 'LEAK-terminal',
      uuid: 'LEAK-uuid',
      session_id: 'LEAK-session',
      user_message_uuid: 'LEAK-user-message',
      usage: { input_tokens: 9_191_919, output_tokens: 'LEAK-usage' },
      permission_denials: [
        { tool_name: 'LEAK-tool-name', tool_use_id: 'toolu_1', tool_input: { cmd: 'LEAK-input' } }
      ],
      modelUsage: {
        'claude-sonnet-4-5': {
          inputTokens: 1,
          outputTokens: 2,
          cacheReadInputTokens: 3,
          cacheCreationInputTokens: 4,
          costUSD: 0.5,
          contextWindow: 200_000,
          maxOutputTokens: 'LEAK-max-output',
          webSearchRequests: 'LEAK-web-search'
        }
      }
    })
    expect(meters(emitted).map((m) => (m as { type: string }).type)).toEqual(['context', 'turn'])
    const text = JSON.stringify(emitted)
    for (const marker of ['LEAK', 'toolu_1', '31337', '8675309', '4242424', '9191919'])
      expect(text).not.toContain(marker)
  })

  it('dispose の後は context も turn も送らない', () => {
    const { signals, emitted } = setup()
    signals.dispose()
    signals.onAssistant(assistantWith({ input_tokens: 5 }))
    signals.onResult(result())
    expect(emitted).toEqual([])
  })
})

describe('createLiveSignals — 権限モード (O-4 BE-040 / 014 data-model §2 / §3)', () => {
  /** 送った event を (meter の権限モード | 行の id・category・opens・detail・status) に縮める。 */
  const modeEventsOf = (emitted: readonly SessionEvent[]): unknown[] =>
    emitted.map((event) => {
      if (event.kind === 'meter') return { meter: event.meter }
      if (event.kind === 'message') {
        const part = event.message.parts[0]
        expect(event.message.role).toBe('system')
        if (part?.type !== 'system-event') return { message: event.message.id }
        expect(part.name).toBe('')
        return {
          row: event.message.id,
          category: part.category,
          opens: part.opens,
          detail: part.detail,
          status: part.status
        }
      }
      return { other: event.kind }
    })
  const changed = (seq: number, mode: string): unknown[] => [
    { meter: { type: 'permission-mode', mode } },
    {
      row: `mode:${seq}`,
      category: 'permission-mode',
      opens: true,
      detail: mode,
      status: 'changed'
    }
  ]
  const status = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
    type: 'system',
    subtype: 'status',
    status: null,
    uuid: 'u1',
    session_id: 's1',
    ...over
  })
  const init = (mode: unknown): Record<string, unknown> => ({
    type: 'system',
    subtype: 'init',
    permissionMode: mode
  })

  it('plan で起動し ExitPlanMode の後の status が default (安全 3 値のまま) で meter と行が 1 つずつ', () => {
    const { signals, emitted } = setup('plan')
    signals.onSystem(status({ permissionMode: 'default' }))
    expect(modeEventsOf(emitted)).toEqual(changed(0, 'default'))
  })

  it('同じモードが続けて来ても送らない (起動の設定と同じモードも送らない)', () => {
    const { signals, emitted } = setup('plan')
    signals.onSystem(status({ permissionMode: 'plan' }))
    expect(emitted).toEqual([])
    signals.onSystem(status({ permissionMode: 'default' }))
    signals.onSystem(status({ permissionMode: 'default' }))
    signals.onSystem(status({ permissionMode: 'default', status: 'requesting' }))
    expect(modeEventsOf(emitted)).toEqual(changed(0, 'default'))
  })

  it('昇格値 3 つと知らない値 (unknown) で meter と行。行の id は変わるたびに進む', () => {
    const { signals, emitted } = setup()
    signals.onSystem(status({ permissionMode: 'acceptEdits' }))
    signals.onSystem(status({ permissionMode: 'bypassPermissions' }))
    signals.onSystem(status({ permissionMode: 'auto' }))
    signals.onSystem(status({ permissionMode: 'future_mode' }))
    // 知らない値どうしは同じ鍵 (unknown) なので続けて送らない
    signals.onSystem(status({ permissionMode: '__proto__' }))
    signals.onSystem(status({ permissionMode: 42 }))
    expect(modeEventsOf(emitted)).toEqual([
      ...changed(0, 'acceptEdits'),
      ...changed(1, 'bypassPermissions'),
      ...changed(2, 'auto'),
      ...changed(3, 'unknown')
    ])
  })

  it('permissionMode の無い status (null も) では何も送らない', () => {
    const { signals, emitted } = setup()
    signals.onSystem(status())
    signals.onSystem(status({ status: 'requesting' }))
    signals.onSystem(status({ permissionMode: null }))
    signals.onSystem({ type: 'system', subtype: 'init' })
    expect(emitted).toEqual([])
  })

  it('init: 起動の設定と同じモードなら何も送らず、昇格値なら meter と行が 1 つずつ (起動の直後からの昇格)', () => {
    const { signals, emitted } = setup('dontAsk')
    signals.onSystem(init('dontAsk'))
    expect(emitted).toEqual([])
    signals.onSystem(init('bypassPermissions'))
    signals.onSystem(init('bypassPermissions'))
    expect(modeEventsOf(emitted)).toEqual(changed(0, 'bypassPermissions'))
  })

  it('status で変わった直後に同じモードの init が来ても重複しない (どちらで先に観測しても 1 回)', () => {
    const { signals, emitted } = setup('plan')
    signals.onSystem(status({ permissionMode: 'acceptEdits' }))
    signals.onSystem(init('acceptEdits'))
    expect(modeEventsOf(emitted)).toEqual(changed(0, 'acceptEdits'))
  })

  it('status を伴わずに次のターンの init だけでモードが変わっても meter と行が出る', () => {
    const { signals, emitted } = setup('plan')
    signals.onSystem(init('plan'))
    signals.onResult({ type: 'result', subtype: 'success', is_error: false })
    signals.onSystem(init('default'))
    signals.onResult({ type: 'result', subtype: 'success', is_error: false })
    signals.onSystem(init('plan'))
    expect(modeEventsOf(emitted)).toEqual([...changed(0, 'default'), ...changed(1, 'plan')])
  })

  it('init の permissionMode 以外 (cwd・tools・mcp_servers・model ほか) の値を送らない (014 SC-002)', () => {
    const { signals, emitted } = setup()
    signals.onSystem({
      type: 'system',
      subtype: 'init',
      permissionMode: 'acceptEdits',
      cwd: '/home/LEAK-cwd',
      tools: ['LEAK-tool'],
      mcp_servers: [{ name: 'LEAK-mcp', status: 'connected' }],
      model: 'LEAK-model',
      slash_commands: ['LEAK-slash'],
      terminal_slash_commands: ['LEAK-terminal-slash'],
      plugins: [{ name: 'LEAK-plugin', path: '/LEAK-plugin-path' }],
      agents: ['LEAK-agent'],
      skills: ['LEAK-skill'],
      apiKeySource: 'LEAK-api-key-source',
      betas: ['LEAK-beta'],
      claude_code_version: 'LEAK-version',
      output_style: 'LEAK-style',
      uuid: 'LEAK-uuid',
      session_id: 'LEAK-session'
    })
    signals.onSystem(
      status({
        permissionMode: 'default',
        compact_error: 'LEAK-compact-error',
        uuid: 'LEAK-uuid',
        session_id: 'LEAK-session'
      })
    )
    expect(modeEventsOf(emitted)).toEqual([...changed(0, 'acceptEdits'), ...changed(1, 'default')])
    expect(JSON.stringify(emitted)).not.toContain('LEAK')
  })

  it('dispose の後は送らない', () => {
    const { signals, emitted } = setup()
    signals.dispose()
    signals.onSystem(status({ permissionMode: 'acceptEdits' }))
    signals.onSystem(init('auto'))
    expect(emitted).toEqual([])
  })
})

/* ── 間引く進み具合と圧縮の行 (O-4 BE-042) ─────────────────────────────── */

interface Timed {
  readonly at: number
  readonly event: SessionEvent
}

/** 偽の時計 (timer は掛けた時刻の順に発火する) で組んだ live-signals。 */
function setupTimed(): {
  signals: ReturnType<typeof createLiveSignals>
  sent: Timed[]
  advance: (ms: number) => void
  timerCount: () => number
} {
  let now = 0
  let seq = 0
  const timers = new Map<number, { at: number; callback: () => void }>()
  const sent: Timed[] = []
  const signals = createLiveSignals({
    launchPermissionMode: 'default',
    emit: (event) => sent.push({ at: now, event }),
    clock: {
      now: () => now,
      setTimer: (callback, ms) => {
        seq += 1
        timers.set(seq, { at: now + ms, callback })
        return seq
      },
      clearTimer: (handle) => {
        timers.delete(handle as number)
      }
    }
  })
  const advance = (ms: number): void => {
    const end = now + ms
    for (;;) {
      let next: [number, { at: number; callback: () => void }] | null = null
      for (const entry of timers)
        if (entry[1].at <= end && (next === null || entry[1].at < next[1].at)) next = entry
      if (next === null) break
      timers.delete(next[0])
      now = Math.max(now, next[1].at)
      next[1].callback()
    }
    now = end
  }
  return { signals, sent, advance, timerCount: () => timers.size }
}

const toolProgress = (
  id: unknown,
  seconds: number,
  over: Record<string, unknown> = {}
): Record<string, unknown> => ({
  type: 'tool_progress',
  tool_use_id: id,
  tool_name: 'Bash',
  parent_tool_use_id: null,
  elapsed_time_seconds: seconds,
  uuid: 'u1',
  session_id: 's1',
  ...over
})
const thinking = (tokens: number, over: Record<string, unknown> = {}): Record<string, unknown> => ({
  type: 'system',
  subtype: 'thinking_tokens',
  estimated_tokens: tokens,
  estimated_tokens_delta: 1,
  ...over
})
const taskProgress = (
  taskId: unknown,
  usage: unknown,
  over: Record<string, unknown> = {}
): Record<string, unknown> => ({
  type: 'system',
  subtype: 'task_progress',
  task_id: taskId,
  description: 'scan',
  usage,
  ...over
})
const compactStatus = (over: Record<string, unknown>): Record<string, unknown> => ({
  type: 'system',
  subtype: 'status',
  status: null,
  ...over
})
const mainAssistantMessage = {
  type: 'assistant',
  parent_tool_use_id: null,
  message: { content: [] }
}
const okResultMessage = { type: 'result', subtype: 'success', is_error: false }
const userResult = (...ids: string[]): Record<string, unknown> => ({
  type: 'user',
  parent_tool_use_id: null,
  message: { role: 'user', content: ids.map((id) => ({ type: 'tool_result', tool_use_id: id })) }
})

/** 送った event のうち `meter` の中身 (と時刻)。 */
const metersAt = (sent: readonly Timed[]): { at: number; meter: unknown }[] =>
  sent.flatMap(({ at, event }) => (event.kind === 'meter' ? [{ at, meter: event.meter }] : []))
/** 送った event のうち行 (id・opens・detail・status と時刻)。 */
const rowsAt = (
  sent: readonly Timed[]
): {
  at: number
  id: string
  category: string
  opens: boolean
  detail: string
  status: unknown
}[] =>
  sent.flatMap(({ at, event }) => {
    if (event.kind !== 'message') return []
    const part = event.message.parts[0]
    if (part?.type !== 'system-event') return []
    expect(part.name).toBe('')
    return [
      {
        at,
        id: event.message.id,
        category: part.category,
        opens: part.opens,
        detail: part.detail,
        status: part.status
      }
    ]
  })

describe('createLiveSignals — コンテキストの圧縮の行 (O-4 BE-042 / 014 data-model §3)', () => {
  it('compacting で行を作り、compact_result で成功 / 失敗に閉じる。続けて来た compacting は同じ行', () => {
    const { signals, sent } = setupTimed()
    signals.onSystem(compactStatus({ status: 'compacting' }))
    signals.onSystem(compactStatus({ status: 'compacting' }))
    signals.onSystem(compactStatus({ compact_result: 'success' }))
    signals.onSystem(compactStatus({ status: 'compacting' }))
    signals.onSystem(
      compactStatus({ compact_result: 'failed', compact_error: 'LEAK-compact-error' })
    )
    expect(
      rowsAt(sent).map(({ id, opens, status, detail, category }) => [
        id,
        opens,
        status,
        detail,
        category
      ])
    ).toEqual([
      ['compact:0', true, 'compacting', '', 'compaction'],
      ['compact:0', false, 'succeeded', '', 'compaction'],
      ['compact:1', true, 'compacting', '', 'compaction'],
      ['compact:1', false, 'failed', '', 'compaction']
    ])
    expect(JSON.stringify(sent)).not.toContain('LEAK')
  })

  it('開いた行が無いまま結果が来たら、結果の状態で行を作る', () => {
    const { signals, sent } = setupTimed()
    signals.onSystem(compactStatus({ compact_result: 'failed' }))
    signals.onSystem(compactStatus({ compact_result: 'success' }))
    expect(rowsAt(sent).map(({ id, opens, status }) => [id, opens, status])).toEqual([
      ['compact:0', true, 'failed'],
      ['compact:1', true, 'succeeded']
    ])
  })

  it('同じ status で権限モードも変われば、権限モードの meter と行も送る (圧縮は間引かない)', () => {
    const { signals, sent } = setupTimed()
    signals.onSystem(compactStatus({ status: 'compacting', permissionMode: 'plan' }))
    expect(metersAt(sent).map((m) => m.meter)).toEqual([{ type: 'permission-mode', mode: 'plan' }])
    expect(rowsAt(sent).map((r) => r.id)).toEqual(['mode:0', 'compact:0'])
  })
})

describe('createLiveSignals — 間引く進み具合 (O-4 BE-042 / 014 data-model §2 / SC-004)', () => {
  it('thinking_tokens → meter の thinking を 1 秒に 1 回まで (最後の値を次の境で送る)', () => {
    const { signals, sent, advance } = setupTimed()
    signals.onSystem(thinking(10))
    advance(200)
    signals.onSystem(thinking(20))
    advance(200)
    signals.onSystem(thinking(30))
    advance(2000)
    expect(metersAt(sent)).toEqual([
      { at: 0, meter: { type: 'thinking', estimatedTokens: 10 } },
      { at: 1000, meter: { type: 'thinking', estimatedTokens: 30 } }
    ])
  })

  it('主ループの tool_progress → meter の tool-elapsed (tool ごとに 1 秒に 1 回まで)。subagent の中の tool は捨てる', () => {
    const { signals, sent, advance } = setupTimed()
    signals.onToolProgress(toolProgress('toolu_a', 1.9))
    signals.onToolProgress(toolProgress('toolu_b', 4))
    advance(500)
    signals.onToolProgress(toolProgress('toolu_a', 2.4))
    signals.onToolProgress(toolProgress('toolu_sub', 3, { parent_tool_use_id: 'toolu_parent' }))
    advance(1000)
    expect(metersAt(sent)).toEqual([
      { at: 0, meter: { type: 'tool-elapsed', toolUseId: 'toolu_a', elapsedSeconds: 1 } },
      { at: 0, meter: { type: 'tool-elapsed', toolUseId: 'toolu_b', elapsedSeconds: 4 } },
      { at: 1000, meter: { type: 'tool-elapsed', toolUseId: 'toolu_a', elapsedSeconds: 2 } }
    ])
  })

  it('形の外れた tool_use_id では送らない', () => {
    const { signals, sent } = setupTimed()
    for (const id of ['', 'a/b', 'a b', 'a.b', 'x'.repeat(129), 42, null, undefined])
      signals.onToolProgress(toolProgress(id, 1))
    signals.onToolProgress({ ...toolProgress('toolu_a', 1), type: 'system' })
    expect(sent).toEqual([])
  })

  it('task_progress → 既存の task の行の更新 (task:<task_id>・opens: false・進み具合だけの detail・状態なし)', () => {
    const { signals, sent, advance } = setupTimed()
    signals.onSystem(taskProgress('t1', { total_tokens: 1200, tool_uses: 3, duration_ms: 4500 }))
    advance(300)
    signals.onSystem(taskProgress('t1', { total_tokens: 1500, tool_uses: 4, duration_ms: 4800 }))
    advance(1000)
    signals.onSystem(taskProgress('t2', { total_tokens: -1, tool_uses: 'x', duration_ms: 1.5 }))
    expect(rowsAt(sent)).toEqual([
      {
        at: 0,
        id: 'task:t1',
        category: 'task',
        opens: false,
        detail: '\n1200/3/4500',
        status: null
      },
      {
        at: 1000,
        id: 'task:t1',
        category: 'task',
        opens: false,
        detail: '\n1500/4/4800',
        status: null
      },
      { at: 1300, id: 'task:t2', category: 'task', opens: false, detail: '\n0/0/0', status: null }
    ])
  })

  it('形の外れた task_id では task の行の更新を送らず、間引きの鍵も作らない (上限の枠を使わない)', () => {
    const { signals, sent, advance } = setupTimed()
    // 63 個の tool の鍵を動かしたまま (保留を持たせ続ける)
    const tools = Array.from({ length: 63 }, (_, i) => `toolu_${i}`)
    for (const id of tools) signals.onToolProgress(toolProgress(id, 1))
    for (const id of tools) signals.onToolProgress(toolProgress(id, 2))
    for (const bad of ['', 'x'.repeat(129), 'a b', 'a/b', 'a.b', 42, null])
      signals.onSystem(taskProgress(bad, { total_tokens: 1, tool_uses: 1, duration_ms: 1 }))
    // 64 個目の鍵 (形の正しい task) は通る — 外れた task_id が枠を使っていない
    signals.onSystem(taskProgress('task_ok', { total_tokens: 7, tool_uses: 1, duration_ms: 1 }))
    advance(10_000)
    const taskRows = rowsAt(sent).filter((r) => r.category === 'task')
    expect(taskRows.map((r) => r.id)).toEqual(['task:task_ok'])
    expect(taskRows[0]?.detail).toBe('\n7/1/1')
  })

  it('許可リストの外のフィールドの値を送らない (014 SC-002)', () => {
    const { signals, sent, advance } = setupTimed()
    signals.onSystem(
      thinking(5, {
        estimated_tokens_delta: 'LEAK-delta',
        user_message_uuid: 'LEAK-user-message',
        uuid: 'LEAK-uuid',
        session_id: 'LEAK-session'
      })
    )
    signals.onToolProgress(
      toolProgress('toolu_a', 2, {
        tool_name: 'LEAK-tool-name',
        heartbeat: 'LEAK-heartbeat',
        task_id: 'LEAK-task-id',
        subagent_type: 'LEAK-subagent-type',
        subagent_retry: { agent_id: 'LEAK-agent', error_category: 'LEAK-category' },
        uuid: 'LEAK-uuid'
      })
    )
    signals.onSystem(
      taskProgress(
        't1',
        { total_tokens: 1, tool_uses: 1, duration_ms: 1, extra: 'LEAK-usage-extra' },
        {
          description: 'LEAK-description',
          summary: 'LEAK-summary',
          last_tool_name: 'LEAK-last-tool',
          subagent_type: 'LEAK-subagent',
          tool_use_id: 'LEAK-tool-use-id',
          uuid: 'LEAK-uuid'
        }
      )
    )
    signals.onSystem(compactStatus({ status: 'compacting', compact_error: 'LEAK-compact-error' }))
    advance(5000)
    expect(sent.length).toBe(4)
    expect(JSON.stringify(sent)).not.toContain('LEAK')
  })

  it('tool の結果の後に、その tool の保留を送らない (他の tool の保留は送る)', () => {
    const { signals, sent, advance } = setupTimed()
    signals.onToolProgress(toolProgress('toolu_a', 1))
    signals.onToolProgress(toolProgress('toolu_b', 1))
    signals.onToolProgress(toolProgress('toolu_a', 2))
    signals.onToolProgress(toolProgress('toolu_b', 2))
    signals.onUser(userResult('toolu_a'))
    advance(5000)
    expect(metersAt(sent).map((m) => m.meter)).toEqual([
      { type: 'tool-elapsed', toolUseId: 'toolu_a', elapsedSeconds: 1 },
      { type: 'tool-elapsed', toolUseId: 'toolu_b', elapsedSeconds: 1 },
      { type: 'tool-elapsed', toolUseId: 'toolu_b', elapsedSeconds: 2 }
    ])
  })

  it('主ループの assistant の後に思考の保留を送らない (subagent の中の assistant では取り消さない)', () => {
    const { signals, sent, advance } = setupTimed()
    signals.onSystem(thinking(1))
    signals.onSystem(thinking(2))
    signals.onAssistant({ ...mainAssistantMessage, parent_tool_use_id: 'toolu_parent' })
    advance(1500)
    signals.onSystem(thinking(3))
    signals.onAssistant(mainAssistantMessage)
    advance(5000)
    expect(
      metersAt(sent).map((m) => (m.meter as { estimatedTokens: number }).estimatedTokens)
    ).toEqual([1, 2])
  })

  it('result の後に思考と全部の tool の保留を送らない。task の保留は残して送る', () => {
    const { signals, sent, advance, timerCount } = setupTimed()
    signals.onSystem(thinking(1))
    signals.onSystem(thinking(2))
    signals.onToolProgress(toolProgress('toolu_a', 1))
    signals.onToolProgress(toolProgress('toolu_a', 2))
    signals.onSystem(taskProgress('t1', { total_tokens: 1, tool_uses: 1, duration_ms: 1 }))
    signals.onSystem(taskProgress('t1', { total_tokens: 2, tool_uses: 2, duration_ms: 2 }))
    const before = sent.length
    signals.onResult(okResultMessage)
    advance(5000)
    const after = sent.slice(before)
    expect(metersAt(after)).toEqual([])
    expect(rowsAt(after).map((r) => [r.id, r.detail])).toEqual([['task:t1', '\n2/2/2']])
    expect(timerCount()).toBe(0)
  })

  it('dispose の後は保留を送らず、timer も残らない', () => {
    const { signals, sent, advance, timerCount } = setupTimed()
    signals.onSystem(thinking(1))
    signals.onSystem(thinking(2))
    signals.onSystem(taskProgress('t1', { total_tokens: 1, tool_uses: 1, duration_ms: 1 }))
    signals.onSystem(taskProgress('t1', { total_tokens: 2, tool_uses: 2, duration_ms: 2 }))
    expect(timerCount()).toBe(1)
    const before = sent.length
    signals.dispose()
    expect(timerCount()).toBe(0)
    advance(5000)
    signals.onSystem(thinking(3))
    signals.onToolProgress(toolProgress('toolu_a', 1))
    signals.onSystem(compactStatus({ status: 'compacting' }))
    advance(5000)
    expect(sent).toHaveLength(before)
    expect(timerCount()).toBe(0)
  })
})
