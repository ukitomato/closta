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
  { type: 'auth_status', isAuthenticating: false, output: 7, error: {} },
  { type: 'system', subtype: 'plugin_install', status: 'completed', name: 42 },
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
        signals.onAuthStatus(message)
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
      signals.onAuthStatus(message)
      signals.onToolProgress(message)
      signals.onResult(message)
    }
    expect(emitted).toEqual([])
  })

  it('background_tasks_changed は background-tasks の meter を即時に 1 つ送る (O-11 / AD-056)。ambient・形の外れた id を除き 64 件で切る', () => {
    const { signals, emitted } = setup()
    signals.onSystem({
      type: 'system',
      subtype: 'background_tasks_changed',
      tasks: [
        { task_id: 'a', task_type: 'local_bash', description: 'SECRET-DESC' },
        { task_id: 'b', task_type: 'local_agent', ambient: true },
        { task_id: 'bad id', task_type: 'local_bash' }
      ]
    })
    expect(emitted).toEqual([
      {
        kind: 'meter',
        meter: { type: 'background-tasks', tasks: [{ taskId: 'a', taskType: 'local_bash' }] }
      }
    ])
    expect(JSON.stringify(emitted)).not.toContain('SECRET-DESC')
    signals.onSystem({
      type: 'system',
      subtype: 'background_tasks_changed',
      tasks: Array.from({ length: 65 }, (_, i) => ({ task_id: `t${i}`, task_type: 'local_bash' }))
    })
    const last = emitted.at(-1)
    expect(
      last?.kind === 'meter' && last.meter.type === 'background-tasks' && last.meter.tasks.length
    ).toBe(64)
    signals.onSystem({ type: 'system', subtype: 'background_tasks_changed', tasks: [] })
    expect(emitted.at(-1)).toEqual({
      kind: 'meter',
      meter: { type: 'background-tasks', tasks: [] }
    })
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

  it('init の権限モードと構成の許可リスト (015 data-model §2) の外 (cwd・plugins の path ほか) の値を送らない (014 SC-002 / 015 SC-002)', () => {
    const { signals, emitted } = setup()
    signals.onSystem({
      type: 'system',
      subtype: 'init',
      permissionMode: 'acceptEdits',
      cwd: '/home/LEAK-cwd',
      // 構成として運ぶフィールド (O-5 / AD-048 Decision 3。形の検査を通る値)
      tools: ['Bash'],
      mcp_servers: [{ name: 'srv', status: 'connected' }],
      model: 'claude-opus-4',
      slash_commands: ['review'],
      terminal_slash_commands: ['LEAK-terminal-slash'],
      plugins: [{ name: 'plug', path: '/LEAK-plugin-path' }],
      agents: ['LEAK-agent'],
      skills: ['skill-a'],
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
    expect(modeEventsOf(emitted)).toEqual([
      ...changed(0, 'acceptEdits'),
      {
        meter: {
          type: 'init-report',
          model: 'claude-opus-4',
          mcpServers: [{ name: 'srv', status: 'connected' }],
          tools: ['Bash'],
          skills: ['skill-a'],
          plugins: [{ name: 'plug', version: null }],
          slashCommands: ['review'],
          omitted: 0
        }
      },
      ...changed(1, 'default')
    ])
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

/* ── 構成 (O-5 / 015 tasks BE-020 / data-model §2) ─────────────────────── */

/** SDK の `init` の形 (構成の 6 つのフィールドがそろう)。 */
const initMessage = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  type: 'system',
  subtype: 'init',
  permissionMode: 'default',
  model: 'claude-opus-4',
  mcp_servers: [{ name: 'github', status: 'pending' }],
  tools: ['Bash', 'mcp__github__create_issue'],
  skills: ['skill-a'],
  plugins: [{ name: 'plug', path: '/p', version: '1.0.0' }],
  slash_commands: ['review'],
  ...over
})
const commandsChanged = (commands: unknown): Record<string, unknown> => ({
  type: 'system',
  subtype: 'commands_changed',
  commands
})
/** 送った `meter` のうち構成の種類だけ (と時刻)。 */
const reportsAt = (sent: readonly Timed[]): { at: number; meter: Record<string, unknown> }[] =>
  sent.flatMap(({ at, event }) =>
    event.kind === 'meter' &&
    (event.meter.type === 'init-report' || event.meter.type === 'commands')
      ? [{ at, meter: event.meter as unknown as Record<string, unknown> }]
      : []
  )

describe('createLiveSignals — 構成 (O-5 / 015 tasks BE-020 / data-model §2)', () => {
  it('init から meter の init-report、commands_changed から commands を送る (許可リストのフィールドだけ)', () => {
    const { signals, sent } = setupTimed()
    signals.onSystem(initMessage())
    signals.onSystem(
      commandsChanged([
        { name: 'review', description: 'レビュー', argumentHint: '<pr>', aliases: ['rv'] }
      ])
    )
    expect(reportsAt(sent).map((r) => r.meter)).toEqual([
      {
        type: 'init-report',
        model: 'claude-opus-4',
        mcpServers: [{ name: 'github', status: 'pending' }],
        tools: ['Bash', 'mcp__github__create_issue'],
        skills: ['skill-a'],
        plugins: [{ name: 'plug', version: '1.0.0' }],
        slashCommands: ['review'],
        omitted: 0
      },
      {
        type: 'commands',
        commands: [{ name: 'review', description: 'レビュー', argumentHint: '<pr>' }],
        omitted: 0
      }
    ])
  })

  it('名前は同じで状態だけが変わった 2 回目の init と、同じ長さの別のモデルが送られる', () => {
    const { signals, sent, advance } = setupTimed()
    signals.onSystem(initMessage())
    advance(1000)
    signals.onSystem(initMessage({ mcp_servers: [{ name: 'github', status: 'failed' }] }))
    advance(1000)
    signals.onSystem(
      initMessage({
        model: 'claude-opus-5',
        mcp_servers: [{ name: 'github', status: 'failed' }]
      })
    )
    const reports = reportsAt(sent).map((r) => r.meter)
    expect(reports).toHaveLength(3)
    expect(reports.map((m) => m.mcpServers)).toEqual([
      [{ name: 'github', status: 'pending' }],
      [{ name: 'github', status: 'failed' }],
      [{ name: 'github', status: 'failed' }]
    ])
    expect(reports.map((m) => m.model)).toEqual(['claude-opus-4', 'claude-opus-4', 'claude-opus-5'])
  })

  it('同じ内容の init / commands_changed は送らない。送らなかった回の後で基準が変わらない', () => {
    const { signals, sent, advance } = setupTimed()
    const commands = [{ name: 'a', description: 'x', argumentHint: '' }]
    signals.onSystem(initMessage())
    signals.onSystem(commandsChanged(commands))
    advance(2000)
    // キーの順が違っても同じ値なら送らない (変換後の値の直列化で比べる)
    signals.onSystem({ ...initMessage(), tools: ['Bash', 'mcp__github__create_issue'] })
    signals.onSystem(commandsChanged([{ argumentHint: '', description: 'x', name: '/a' }]))
    advance(2000)
    expect(reportsAt(sent)).toHaveLength(2)
    // 送らなかった回の後も、基準は最初に送った値のまま (違う値は送り、元の値に戻すとまた送る)
    signals.onSystem(initMessage({ skills: [] }))
    advance(2000)
    signals.onSystem(initMessage())
    const reports = reportsAt(sent).map((r) => r.meter)
    expect(reports).toHaveLength(4)
    expect(reports.slice(2).map((m) => m.skills)).toEqual([[], ['skill-a']])
  })

  it('構成のフィールドが欠けた init からは構成を送らない (権限モードの比較は今のまま)', () => {
    const { signals, sent } = setupTimed()
    signals.onSystem({ type: 'system', subtype: 'init', permissionMode: 'default' })
    signals.onSystem({
      type: 'system',
      subtype: 'init',
      permissionMode: 'default',
      tools: ['Bash']
    })
    expect(reportsAt(sent)).toEqual([])
  })

  it('合流: 1 秒の窓の中で中身の違う init を 21 回流すと、送るのは最初の 1 件と窓の終わりの最後の 1 件だけ', () => {
    const { signals, sent, advance, timerCount } = setupTimed()
    for (let i = 0; i < 21; i++) {
      signals.onSystem(initMessage({ skills: [`skill-${i}`] }))
      advance(40)
    }
    // 窓の終わり (1,000ms) まで進める
    advance(1000 - 21 * 40)
    const reports = reportsAt(sent)
    expect(reports.map((r) => [r.at, r.meter.skills])).toEqual([
      [0, ['skill-0']],
      [1000, ['skill-20']]
    ])
    expect(timerCount()).toBe(0)
  })

  it('合流: 窓の終わりの保留が前回送った値と同じなら送らない', () => {
    const { signals, sent, advance } = setupTimed()
    signals.onSystem(initMessage())
    advance(100)
    signals.onSystem(initMessage({ skills: [] }))
    advance(100)
    signals.onSystem(initMessage())
    advance(2000)
    expect(reportsAt(sent)).toHaveLength(1)
  })

  it('合流: 窓の後に届いた値はすぐ送る (leading)。窓の終わりに送った後の 1 秒はまた保留する', () => {
    const { signals, sent, advance } = setupTimed()
    signals.onSystem(initMessage())
    advance(500)
    signals.onSystem(initMessage({ skills: ['b'] }))
    advance(500)
    // 1,000ms で保留 (b) を送った。その 1 秒の中の値は 2,000ms に送る
    advance(300)
    signals.onSystem(initMessage({ skills: ['c'] }))
    advance(2000)
    signals.onSystem(initMessage({ skills: ['d'] }))
    expect(reportsAt(sent).map((r) => [r.at, r.meter.skills])).toEqual([
      [0, ['skill-a']],
      [1000, ['b']],
      [2000, ['c']],
      [3300, ['d']]
    ])
  })

  it('合流: init-report と commands の窓は互いに独立', () => {
    const { signals, sent, advance } = setupTimed()
    signals.onSystem(initMessage())
    advance(100)
    // init-report の窓の中でも、commands の最初の 1 件はすぐ送る
    signals.onSystem(commandsChanged([{ name: 'a', description: '', argumentHint: '' }]))
    signals.onSystem(initMessage({ skills: [] }))
    advance(100)
    signals.onSystem(commandsChanged([{ name: 'b', description: '', argumentHint: '' }]))
    advance(2000)
    expect(reportsAt(sent).map((r) => [r.at, r.meter.type])).toEqual([
      [0, 'init-report'],
      [100, 'commands'],
      [1000, 'init-report'],
      [1100, 'commands']
    ])
  })

  it('合流: O-4 の meter の間引き (meter-throttle の 1 秒に 20 件) を消費しない', () => {
    const { signals, sent } = setupTimed()
    for (let i = 0; i < 21; i++) {
      signals.onSystem(initMessage({ skills: [`s${i}`] }))
      signals.onSystem(commandsChanged([{ name: `c${i}`, description: '', argumentHint: '' }]))
    }
    for (let i = 0; i < 20; i++) signals.onToolProgress(toolProgress(`toolu_${i}`, 1))
    const toolMeters = metersAt(sent).filter(
      (m) => (m.meter as { type: string }).type === 'tool-elapsed'
    )
    expect(toolMeters).toHaveLength(20)
  })

  it('dispose の後は保留を送らず、timer も残らない', () => {
    const { signals, sent, advance, timerCount } = setupTimed()
    signals.onSystem(initMessage())
    signals.onSystem(commandsChanged([]))
    signals.onSystem(initMessage({ skills: [] }))
    signals.onSystem(commandsChanged([{ name: 'a', description: '', argumentHint: '' }]))
    expect(timerCount()).toBe(2)
    const before = sent.length
    signals.dispose()
    expect(timerCount()).toBe(0)
    advance(5000)
    signals.onSystem(initMessage({ skills: ['z'] }))
    signals.onSystem(commandsChanged([{ name: 'z', description: '', argumentHint: '' }]))
    advance(5000)
    expect(sent).toHaveLength(before)
    expect(timerCount()).toBe(0)
  })

  it('init の通さないフィールドと commands の aliases の目印の値が送った文字列に 0 件 (015 SC-002)', () => {
    const { signals, sent } = setupTimed()
    signals.onSystem(
      initMessage({
        cwd: '/home/LEAK-cwd',
        plugins: [{ name: 'plug', path: '/LEAK-plugin-path', version: '1.0.0' }],
        apiKeySource: 'LEAK-api-key-source',
        betas: ['LEAK-beta'],
        capabilities: ['LEAK-capability'],
        claude_code_version: 'LEAK-version',
        agents: ['LEAK-agent'],
        output_style: 'LEAK-style',
        terminal_slash_commands: ['LEAK-terminal'],
        fast_mode_state: 'LEAK-fast',
        effort: 'LEAK-effort',
        uuid: 'LEAK-uuid',
        session_id: 'LEAK-session'
      })
    )
    signals.onSystem({
      ...commandsChanged([
        { name: 'a', description: 'x', argumentHint: '', aliases: ['LEAK-alias'] }
      ]),
      uuid: 'LEAK-uuid',
      session_id: 'LEAK-session'
    })
    expect(reportsAt(sent)).toHaveLength(2)
    expect(JSON.stringify(sent.map((s) => s.event))).not.toContain('LEAK')
  })

  it('形の外れた構成 (制御文字・tag 文字・U+2028・長い名前・件数の超過・__proto__) で例外を出さず落とす', () => {
    const { signals, sent } = setupTimed()
    expect(() => {
      signals.onSystem(
        initMessage({
          model: 42,
          mcp_servers: [
            { name: 'a\u0000b', status: 'connected' },
            { name: 'x', status: '__proto__' },
            ...Array.from({ length: 70 }, (_, i) => ({ name: `s${i}`, status: 'connected' }))
          ],
          tools: ['Bash ', `t\u{E0041}`, 'x'.repeat(129)],
          skills: 'not-an-array',
          plugins: [null, 42],
          slash_commands: ['//a', 'ok']
        })
      )
      signals.onSystem(commandsChanged({ __proto__: null }))
      signals.onSystem(commandsChanged([{ name: 'constructor' }, null]))
    }).not.toThrow()
    const [report, commands] = reportsAt(sent).map((r) => r.meter)
    expect(report?.model).toBeNull()
    expect((report?.mcpServers as unknown[]).length).toBe(64)
    expect((report?.mcpServers as { status: string }[])[0]).toEqual({
      name: 'x',
      status: 'unknown'
    })
    expect(report?.tools).toEqual([])
    expect(report?.skills).toEqual([])
    expect(report?.slashCommands).toEqual(['ok'])
    expect(report?.omitted).toBeGreaterThan(0)
    expect(commands).toEqual({ type: 'commands', commands: [], omitted: 0 })
  })

  it('構成は状態通知 (SessionStatusUpdate) に載らない (送るのは event の meter だけ)', () => {
    const { signals, sent } = setupTimed()
    signals.onSystem(initMessage())
    signals.onSystem(commandsChanged([]))
    expect(sent.map((s) => s.event.kind)).toEqual(['meter', 'meter'])
  })
})

/** O-5 BE-031 — 認証とプラグインの行 (015 data-model §4 / spec FR-010)。 */
describe('createLiveSignals — 認証とプラグインの行 (O-5 / 015 tasks BE-031 / data-model §4)', () => {
  const MARK = 'SECRET_MARK'
  interface Row {
    readonly id: string
    readonly category: string
    readonly opens: boolean
    readonly detail: string
    readonly status: string | null
  }
  const rowsOf = (emitted: readonly SessionEvent[]): Row[] =>
    emitted.flatMap((event) => {
      if (event.kind !== 'message') return []
      const part = event.message.parts[0]
      if (part?.type !== 'system-event') return []
      expect(part.name).toBe('')
      expect(event.message.role).toBe('system')
      return [
        {
          id: event.message.id,
          category: part.category,
          opens: part.opens,
          detail: part.detail,
          status: part.status
        }
      ]
    })
  const auth = (isAuthenticating: boolean, over: Record<string, unknown> = {}): unknown => ({
    type: 'auth_status',
    isAuthenticating,
    output: [`${MARK}-output`],
    uuid: 'u1',
    session_id: 's1',
    ...over
  })
  const plugin = (status: string, over: Record<string, unknown> = {}): unknown => ({
    type: 'system',
    subtype: 'plugin_install',
    status,
    uuid: 'u1',
    session_id: 's1',
    ...over
  })

  it('認証の開閉: true で authenticating の行を作り、false で succeeded に閉じる。次の認証は別の id', () => {
    const { signals, emitted } = setup()
    signals.onAuthStatus(auth(true))
    signals.onAuthStatus(auth(true)) // 開いている間の続きは送らない
    signals.onAuthStatus(auth(false))
    signals.onAuthStatus(auth(true))
    signals.onAuthStatus(auth(false, { error: `${MARK}-error` }))
    expect(rowsOf(emitted)).toEqual([
      { id: 'auth:0', category: 'auth', opens: true, detail: '', status: 'authenticating' },
      { id: 'auth:0', category: 'auth', opens: false, detail: '', status: 'succeeded' },
      { id: 'auth:1', category: 'auth', opens: true, detail: '', status: 'authenticating' },
      { id: 'auth:1', category: 'auth', opens: false, detail: '', status: 'failed' }
    ])
  })

  it('auth_status の output / error と plugin_install の error の文字列を送らない (U-4)', () => {
    const { signals, emitted } = setup()
    signals.onAuthStatus(auth(true, { error: `${MARK}-error` }))
    signals.onAuthStatus(auth(false, { error: `${MARK}-error` }))
    signals.onSystem(plugin('started', { name: 'acme' }))
    signals.onSystem(plugin('failed', { name: 'acme', error: `${MARK}-plugin-error` }))
    signals.onSystem(plugin('completed', { error: `${MARK}-plugin-error` }))
    expect(emitted.length).toBeGreaterThan(0)
    expect(JSON.stringify(emitted)).not.toContain(MARK)
  })

  it('開いた行が無いまま isAuthenticating: false (error なし) と形の外れは例外を出さず、何も送らない', () => {
    const { signals, emitted } = setup()
    expect(() => {
      signals.onAuthStatus(auth(false))
      signals.onAuthStatus(auth(false, { error: '' }))
      signals.onAuthStatus(auth(false, { error: null }))
      signals.onAuthStatus({ type: 'auth_status' })
      signals.onAuthStatus({ type: 'auth_status', isAuthenticating: 'yes' })
      signals.onAuthStatus({ type: 'other', isAuthenticating: true })
    }).not.toThrow()
    expect(emitted).toEqual([])
  })

  it('開いた行が無いまま error のある false が来たら failed の行を 1 つ作って閉じ、次の認証は別の id (015 data-model §4)', () => {
    const { signals, emitted } = setup()
    signals.onAuthStatus(auth(false, { error: `${MARK}-error` }))
    signals.onAuthStatus(auth(true))
    signals.onAuthStatus(auth(false))
    expect(rowsOf(emitted)).toEqual([
      { id: 'auth:0', category: 'auth', opens: true, detail: '', status: 'failed' },
      { id: 'auth:1', category: 'auth', opens: true, detail: '', status: 'authenticating' },
      { id: 'auth:1', category: 'auth', opens: false, detail: '', status: 'succeeded' }
    ])
    expect(JSON.stringify(emitted)).not.toContain(MARK)
  })

  it('プラグインの進み具合の合成: started で開き、installed / failed を数え、completed で閉じる', () => {
    const { signals, emitted } = setup()
    signals.onSystem(plugin('started', { name: 'acme' }))
    signals.onSystem(plugin('installed', { name: 'acme' }))
    signals.onSystem(plugin('installed', { name: 'other/market' }))
    signals.onSystem(plugin('completed'))
    expect(rowsOf(emitted)).toEqual([
      { id: 'plugin:0', category: 'plugin', opens: true, detail: '0/0/acme', status: 'started' },
      { id: 'plugin:0', category: 'plugin', opens: false, detail: '1/0/acme', status: null },
      {
        id: 'plugin:0',
        category: 'plugin',
        opens: false,
        detail: '2/0/other/market',
        status: null
      },
      {
        id: 'plugin:0',
        category: 'plugin',
        opens: false,
        detail: '2/0/other/market',
        status: 'completed'
      }
    ])
  })

  it('失敗が 1 つでもあれば failed で閉じ、次の導入は別の id', () => {
    const { signals, emitted } = setup()
    signals.onSystem(plugin('started'))
    signals.onSystem(plugin('installed'))
    signals.onSystem(plugin('failed'))
    signals.onSystem(plugin('completed'))
    signals.onSystem(plugin('started'))
    const rows = rowsOf(emitted)
    expect(rows.at(-2)).toMatchObject({ id: 'plugin:0', detail: '1/1/', status: 'failed' })
    expect(rows.at(-1)).toMatchObject({ id: 'plugin:1', opens: true, status: 'started' })
  })

  it('形の外れたマーケットプレイスの名前は detail に出ず、前の名前が残る', () => {
    const { signals, emitted } = setup()
    signals.onSystem(plugin('started', { name: 'acme' }))
    for (const name of [
      `a${String.fromCodePoint(0x202e)}b`,
      'a b',
      'a//b',
      'x'.repeat(129),
      `${MARK}${String.fromCodePoint(0x2028)}`,
      42
    ])
      signals.onSystem(plugin('installed', { name }))
    const rows = rowsOf(emitted)
    expect(rows.at(-1)?.detail).toBe('6/0/acme')
    expect(JSON.stringify(emitted)).not.toContain(MARK)
  })

  it('知らない status は開いた行の有無に依らず何も送らない', () => {
    const { signals, emitted } = setup()
    signals.onSystem(plugin('exploded'))
    signals.onSystem(plugin('__proto__'))
    signals.onSystem(plugin('started'))
    signals.onSystem(plugin('exploded'))
    signals.onSystem(plugin('__proto__'))
    expect(rowsOf(emitted)).toEqual([
      { id: 'plugin:0', category: 'plugin', opens: true, detail: '0/0/', status: 'started' }
    ])
  })

  it('started の無い installed → completed は行を 1 つ開いて閉じる (数 1 / 0。015 data-model §4)', () => {
    const { signals, emitted } = setup()
    signals.onSystem(plugin('installed', { name: 'acme' }))
    signals.onSystem(plugin('completed'))
    signals.onSystem(plugin('started'))
    expect(rowsOf(emitted)).toEqual([
      { id: 'plugin:0', category: 'plugin', opens: true, detail: '1/0/acme', status: 'started' },
      { id: 'plugin:0', category: 'plugin', opens: false, detail: '1/0/acme', status: 'completed' },
      { id: 'plugin:1', category: 'plugin', opens: true, detail: '0/0/', status: 'started' }
    ])
  })

  it('started の無い failed → completed は failed で閉じ、error を送らない', () => {
    const { signals, emitted } = setup()
    signals.onSystem(plugin('failed', { name: 'acme', error: `${MARK}-plugin-error` }))
    signals.onSystem(plugin('completed', { error: `${MARK}-plugin-error` }))
    expect(rowsOf(emitted)).toEqual([
      { id: 'plugin:0', category: 'plugin', opens: true, detail: '0/1/acme', status: 'started' },
      { id: 'plugin:0', category: 'plugin', opens: false, detail: '0/1/acme', status: 'failed' }
    ])
    expect(JSON.stringify(emitted)).not.toContain(MARK)
  })

  it('completed だけなら数 0 / 0 の completed の行を 1 つ作り、次の導入は別の id', () => {
    const { signals, emitted } = setup()
    signals.onSystem(plugin('completed'))
    signals.onSystem(plugin('completed', { name: 'acme' }))
    expect(rowsOf(emitted)).toEqual([
      { id: 'plugin:0', category: 'plugin', opens: true, detail: '0/0/', status: 'completed' },
      { id: 'plugin:1', category: 'plugin', opens: true, detail: '0/0/acme', status: 'completed' }
    ])
  })

  it('dispose() の後は認証とプラグインの行を送らない', () => {
    const { signals, emitted } = setup()
    signals.dispose()
    signals.onAuthStatus(auth(true))
    signals.onSystem(plugin('started'))
    expect(emitted).toEqual([])
  })
})

describe('行の時刻 (O-9 BE-012 / data-model §1。AD-051)', () => {
  it('行の createdAt は signals の時計の値 (受信時刻)。合流の最初の値の保持は renderer の合成 (mergeSystemEvent) に任せる', () => {
    let now = 1_760_000_000_000
    const emitted: SessionEvent[] = []
    const signals = createLiveSignals({
      launchPermissionMode: 'default',
      emit: (event) => emitted.push(event),
      clock: { now: () => now, setTimer: vi.fn(), clearTimer: vi.fn() }
    })
    const apiRetry = { type: 'system', subtype: 'api_retry', attempt: 1, max_retries: 3 }
    signals.onSystem(apiRetry)
    now += 5_000
    signals.onSystem({ ...apiRetry, attempt: 2 })
    const times = emitted.flatMap((e) => (e.kind === 'message' ? [e.message.createdAt] : []))
    expect(times).toEqual([1_760_000_000_000, 1_760_000_005_000])
  })
})

describe('createLiveSignals — 実行中の権限モードの切り替え (023 / AD-062 / data-model §3.3)', () => {
  const permissionMeters = (emitted: readonly SessionEvent[]): unknown[] =>
    emitted.flatMap((e) =>
      e.kind === 'meter' && e.meter.type === 'permission-mode' ? [e.meter.mode] : []
    )
  const modeRows = (emitted: readonly SessionEvent[]): number =>
    emitted.filter((e) => e.kind === 'message' && e.message.id.startsWith('mode:')).length

  it('onPermissionModeApplied で meter と権限モードの行が 1 回ずつ出る', () => {
    const { signals, emitted } = setup('default')
    signals.onPermissionModeApplied('plan')
    expect(permissionMeters(emitted)).toEqual(['plan'])
    expect(modeRows(emitted)).toBe(1)
  })

  it('その後に同じ値の status / init が来ても二重に出ない', () => {
    const { signals, emitted } = setup('default')
    signals.onPermissionModeApplied('plan')
    signals.onSystem({ type: 'system', subtype: 'status', status: null, permissionMode: 'plan' })
    signals.onSystem({ type: 'system', subtype: 'init', permissionMode: 'plan' })
    expect(permissionMeters(emitted)).toEqual(['plan'])
    expect(modeRows(emitted)).toBe(1)
  })

  it('別の値の報告はそれを出す', () => {
    const { signals, emitted } = setup('default')
    signals.onPermissionModeApplied('plan')
    signals.onSystem({ type: 'system', subtype: 'status', status: null, permissionMode: 'dontAsk' })
    expect(permissionMeters(emitted)).toEqual(['plan', 'dontAsk'])
    expect(modeRows(emitted)).toBe(2)
  })
})
