import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import {
  LAUNCH_FAILURE_REASONS,
  type LaunchFailureReason,
  type SessionEvent
} from '@domain/session/agent-session'
import { toLiveAssistantMessage, type LiveAssistantMessage } from '@domain/session/live-message'
import {
  acceptBatch,
  isSessionStatusUpdate,
  type RegistryStatus,
  type SessionStatusUpdate
} from '@domain/session/status-update'
import { toSystemEventMessage } from '@domain/session/system-event'

import {
  PERMISSION_MODE_NAMES,
  SYSTEM_EVENT_LABELS,
  TOOL_RESULT_LABELS
} from '@/features/chat/labels'
import { launchFailureLabel } from '@/features/session/labels'
import {
  CONTEXT_COST_METER_LABELS,
  MCP_STATUS_LABELS,
  QUOTA_BANNER_LABELS,
  rateLimitTypeLabel,
  SHELL_LABELS,
  UNSAFE_MODE_BANNER_LABELS,
  USAGE_LABELS
} from '@/features/shell/labels'
import {
  A,
  B,
  registerAppShellHooks,
  selectRunning,
  setup,
  type Harness
} from '@/test-support/app-shell-harness'

import { createLiveSignals } from '../../src/agents/live-signals'
import { classifyResult } from '../../src/agents/session-core'

/**
 * 計量の経路を 1 本通すテスト (O-4 / 014 spec SC-002 / tasks SH-010 / research R-14)。
 *
 * SDK のメッセージの fixture → `live-signals` (セッションスレッドの分岐) → `JSON.stringify` → 偽の port → decoder →
 * 稼働中のストア → DOM (使用量のタブ・中央のヘッダの目盛りと帯・transcript の行) を本物で通す。シェルは
 * `test-support/app-shell-harness.tsx` (偽の port は `running-sessions-harness.tsx` の系統と同じ形) で描く。
 * `sdk-agent-session.ts` は import すると SDK と `main()` が走るので、SDK のメッセージの振り分け (switch) だけを
 * `sessionThread` に写す (research R-14)。
 *
 * | 観点 | 根拠 |
 * |---|---|
 * | 許可リストの外のフィールドに入れた目印の値が `SessionEvent` の文字列と DOM に 0 件 | 014 spec SC-002 / data-model §2 |
 * | 2 つのセッションの値が混ざらない | 014 spec SC-002 / US-3 AC4 |
 * | 値の検証の外れ (`__proto__`・長い id・URL の資格情報の形の `modelId`・`resetsAt: 1e300`) で例外が出ない | data-model §2「値の検証」 |
 * | 状態通知 (`SessionStatusUpdate`) のフィールドの差分 0 (X-5 の全フィールドの走査が通る) | 014 spec SC-002 / X-5 FR-004 |
 * | 構成 (`init` / `commands_changed`) が構成のタブ・畳んだ帯の印・MCP の tool の見出しまで届き、合流の窓の後に最新の値になる。許可リストの外の値と形の外れは出ない | 015 spec SC-002 / tasks SH-020 |
 */

registerAppShellHooks()

/** 許可リストの外のフィールドに入れる目印の値。 */
const LEAK = 'LEAK-meter-7d1f'
/** Quota banner の解除の時刻 (実時計の今から 1 時間先の epoch 秒)。 */
const RESETS_AT_SEC = Math.floor(Date.now() / 1000) + 3_600

type SdkMessage = Record<string, unknown>

/* ── セッションスレッド (`run()` の closure の `live-signals` と switch の振り分けの写し) ─────── */

interface SessionThread {
  /** SDK のメッセージを 1 つ流す (`sdk-agent-session.ts` の switch と同じ振り分け)。 */
  readonly feed: (message: SdkMessage) => void
  /** 偽の時計を進め、期限の来た timer を古い順に呼ぶ。 */
  readonly advance: (ms: number) => void
  /** 掛かっている timer の数。 */
  readonly timerCount: () => number
  /** `finish()` の最初の後始末 (`live-signals` の `dispose`)。 */
  readonly dispose: () => void
  /** port に送った `SessionEvent` の文字列。 */
  readonly sent: readonly string[]
  /** main の受信規則 (`acceptBatch`) を通って renderer に届いた状態通知。 */
  readonly statuses: readonly SessionStatusUpdate[]
}

interface FakeTimer {
  readonly at: number
  readonly callback: () => void
}

function sessionThread(h: Harness, sessionId: string): SessionThread {
  const sent: string[] = []
  const statuses: SessionStatusUpdate[] = []
  const timers = new Map<number, FakeTimer>()
  let now = 1_000_000
  let timerSeq = 0
  // `sdk-agent-session.ts` の `emit` と同じく文字列にする (harness の `emit` は同じ文字列を偽の port に渡す)。
  const emit = (event: SessionEvent): void => {
    sent.push(JSON.stringify(event))
    h.emit(sessionId, event)
  }
  const signals = createLiveSignals({
    launchPermissionMode: 'default',
    emit,
    clock: {
      now: () => now,
      setTimer: (callback, ms) => {
        timerSeq += 1
        timers.set(timerSeq, { at: now + ms, callback })
        return timerSeq
      },
      clearTimer: (handle) => {
        timers.delete(handle as number)
      }
    }
  })
  // `fail()` と同じ順 (理由 → `state: error` → 状態通知)。状態通知は main の受信規則を通して renderer に届ける。
  const fail = (reasonKey: LaunchFailureReason): void => {
    emit({ kind: 'failure', reasonKey })
    emit({ kind: 'state', state: 'error' })
    const registry = new Map<string, RegistryStatus>([
      [sessionId, { generation: 1, state: 'running', reasonKey: null, claudeAlive: true }]
    ])
    const update: SessionStatusUpdate = { sessionId, state: 'error', reasonKey, claudeAlive: true }
    const { accepted } = acceptBatch(registry, 1, [update])
    statuses.push(...accepted)
    h.push(accepted)
  }
  const nextDue = (): number | undefined => {
    let id: number | undefined
    let at = Number.POSITIVE_INFINITY
    for (const [key, timer] of timers) {
      if (timer.at > now || timer.at >= at) continue
      id = key
      at = timer.at
    }
    return id
  }
  emit({ kind: 'state', state: 'running' })
  return {
    sent,
    statuses,
    feed: (message) => {
      switch (message.type) {
        case 'assistant':
          emit({
            kind: 'message',
            message: toLiveAssistantMessage(message as unknown as LiveAssistantMessage, now)
          })
          signals.onAssistant(message)
          break
        case 'result': {
          const reason = signals.onResult(message)
          const subtype = typeof message.subtype === 'string' ? message.subtype : ''
          if (classifyResult(subtype, message.is_error !== false).kind === 'complete') {
            emit({ kind: 'state', state: 'done' })
          } else {
            fail(reason)
          }
          break
        }
        case 'system': {
          const row = toSystemEventMessage(message, null)
          if (row !== null) emit({ kind: 'message', message: row })
          signals.onSystem(message)
          break
        }
        case 'rate_limit_event':
          signals.onRateLimit(message)
          break
        case 'tool_progress':
          signals.onToolProgress(message)
          break
      }
    },
    advance: (ms) => {
      now += ms
      for (let id = nextDue(); id !== undefined; id = nextDue()) {
        const timer = timers.get(id)
        timers.delete(id)
        timer?.callback()
      }
    },
    timerCount: () => timers.size,
    dispose: () => signals.dispose()
  }
}

/* ── SDK のメッセージの fixture (許可リストの外のフィールドに目印の値を入れる) ─────────────── */

/**
 * `init`。構成の許可リスト (O-5 / 015 data-model §2: `model`・`mcp_servers` の `name` と `status`・`tools`・`skills`・
 * `plugins` の `name` と `version`・`slash_commands`) は運ぶ値なので目印を入れず、その外 (`cwd`・プラグインの `path`・
 * `apiKeySource` ほか) に目印の値を入れる。
 */
function init(permissionMode: unknown, over: SdkMessage = {}): SdkMessage {
  return {
    type: 'system',
    subtype: 'init',
    permissionMode,
    cwd: `/home/u/${LEAK}`,
    tools: ['Bash', 'mcp__github__create_issue'],
    mcp_servers: [{ name: 'github', status: 'connected' }],
    model: 'claude-sonnet-4-5',
    slash_commands: ['review'],
    terminal_slash_commands: [LEAK],
    plugins: [{ name: 'plug', path: `/plugins/${LEAK}`, version: '1.0.0' }],
    agents: [LEAK],
    skills: ['skill-a'],
    apiKeySource: LEAK,
    betas: [LEAK],
    capabilities: [LEAK],
    claude_code_version: LEAK,
    output_style: LEAK,
    ...over
  }
}

/** `commands_changed` (`aliases` に目印の値を入れる)。 */
function commandsChanged(commands: readonly SdkMessage[]): SdkMessage {
  return {
    type: 'system',
    subtype: 'commands_changed',
    commands: commands.map((c) => ({ aliases: [LEAK], ...c })),
    uuid: LEAK,
    session_id: LEAK
  }
}

/** 主ループの assistant。`context` は `usage` の入力側 3 つ (入力・キャッシュの読み込み・キャッシュの作成)。 */
function assistant(
  uuid: string,
  content: readonly unknown[],
  context: readonly [number, number, number],
  over: SdkMessage = {}
): SdkMessage {
  return {
    type: 'assistant',
    uuid,
    parent_tool_use_id: null,
    message: {
      id: `msg-${uuid}`,
      role: 'assistant',
      model: LEAK,
      stop_reason: LEAK,
      content,
      usage: {
        input_tokens: context[0],
        cache_read_input_tokens: context[1],
        cache_creation_input_tokens: context[2],
        output_tokens: 777,
        service_tier: LEAK
      }
    },
    ...over
  }
}

function toolProgress(toolUseId: string, parent: string | null, seconds: number): SdkMessage {
  return {
    type: 'tool_progress',
    tool_use_id: toolUseId,
    parent_tool_use_id: parent,
    elapsed_time_seconds: seconds,
    tool_name: LEAK,
    heartbeat: LEAK,
    task_id: LEAK,
    subagent_retry: LEAK
  }
}

function thinking(estimatedTokens: number): SdkMessage {
  return {
    type: 'system',
    subtype: 'thinking_tokens',
    estimated_tokens: estimatedTokens,
    estimated_tokens_delta: 7,
    user_message_uuid: LEAK
  }
}

/** 背景の task の開始 (O-2 の task の行を作る。名前と種類は O-2 の経路で出る値)。 */
const TASK_STARTED: SdkMessage = {
  type: 'system',
  subtype: 'task_started',
  task_id: 'task_bg',
  task_type: 'local_agent',
  description: '背景の調査',
  is_backgrounded: true
}

function taskProgress(taskId: string): SdkMessage {
  return {
    type: 'system',
    subtype: 'task_progress',
    task_id: taskId,
    usage: { total_tokens: 12_345, tool_uses: 3, duration_ms: 4_500 },
    description: LEAK,
    summary: LEAK,
    last_tool_name: LEAK,
    subagent_type: LEAK,
    tool_use_id: LEAK
  }
}

function status(over: SdkMessage): SdkMessage {
  return { type: 'system', subtype: 'status', status: null, ...over }
}

const API_RETRY: SdkMessage = {
  type: 'system',
  subtype: 'api_retry',
  attempt: 1,
  max_retries: 10,
  retry_delay_ms: 2_000,
  error_status: 529,
  error: LEAK,
  no_response: LEAK
}

function rateLimit(info: SdkMessage): SdkMessage {
  return {
    type: 'rate_limit_event',
    rate_limit_info: {
      overageStatus: LEAK,
      overageResetsAt: LEAK,
      overageDisabledReason: LEAK,
      limitScope: LEAK,
      errorCode: LEAK,
      surpassedThreshold: LEAK,
      ...info
    }
  }
}

/** `modelUsage` の 1 モデル (4 つのトークン数・`costUSD`・`contextWindow` の他に目印の値)。 */
function modelUsageOf(over: Record<string, number>): SdkMessage {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadInputTokens: 0,
    cacheCreationInputTokens: 0,
    costUSD: 0,
    contextWindow: 200_000,
    webSearchRequests: 0,
    maxOutputTokens: 64_000,
    ...over,
    extra: LEAK
  }
}

function result(over: SdkMessage): SdkMessage {
  return {
    type: 'result',
    subtype: 'success',
    is_error: false,
    result: LEAK,
    stop_reason: LEAK,
    terminal_reason: LEAK,
    origin: LEAK,
    num_turns: 3,
    total_cost_usd: 0,
    duration_ms: 1_000,
    duration_api_ms: 900,
    usage: { input_tokens: 999_999, output_tokens: 1, service_tier: LEAK },
    modelUsage: {},
    permission_denials: [],
    ...over
  }
}

/* ── DOM ──────────────────────────────────────────────────────────────── */

async function openUsage(): Promise<HTMLElement> {
  await userEvent.click(screen.getByRole('button', { name: SHELL_LABELS.expandPanel }))
  await userEvent.click(screen.getByRole('tab', { name: SHELL_LABELS.usageTab }))
  return screen.getByRole('tabpanel')
}

/** `scope` の中の見出し (`dt`) が `label` の値 (`dd`)。 */
function ddOf(scope: HTMLElement, label: string): HTMLElement {
  const dt = within(scope).getAllByText(label, { selector: 'dt' })[0]!
  return dt.nextElementSibling as HTMLElement
}

/** transcript のシステムイベントの行 (category ごとに 1 行の fixture)。 */
function rowOf(category: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(
    `[data-slot="aui_system-event-row"][data-category="${category}"]`
  )
}

function slotText(row: HTMLElement | null, slot: string): string | null {
  return row?.querySelector(`[data-slot="${slot}"]`)?.textContent ?? null
}

function elapsedTexts(): (string | null)[] {
  const marks = document.querySelectorAll('[data-slot="tool-result-elapsed"]')
  return Array.from(marks, (el) => el.textContent)
}

const thinkingIndicator = (): HTMLElement | null =>
  document.querySelector<HTMLElement>('[data-slot="thinking-indicator"]')

/** port に送った `meter` の種類 (送った順)。 */
function meterTypes(sent: readonly string[]): string[] {
  return sent.flatMap((json) => {
    const event = JSON.parse(json) as { kind: string; meter?: { type: string } }
    return event.kind === 'meter' && event.meter !== undefined ? [event.meter.type] : []
  })
}

const leaks = (sent: readonly string[]): string[] => sent.filter((json) => json.includes(LEAK))

describe('SDK のメッセージ → live-signals → port → decoder → 稼働中のストア → DOM (014 spec SC-002)', () => {
  it('計量と行が DOM に出て、許可リストの外の値は SessionEvent の文字列にも DOM にも出ない。2 つのセッションの値が混ざらない', async () => {
    const h = await setup({ ids: [A, B] })
    await selectRunning(0)
    const panel = await openUsage()
    const a = sessionThread(h, A)
    const b = sessionThread(h, B)

    // ── 表示中の A のターンの途中 ──
    a.feed(init('default'))
    a.feed(API_RETRY)
    const bash = { type: 'tool_use', id: 'toolu_main', name: 'Bash', input: { command: 'sleep' } }
    a.feed(assistant('a-1', [bash], [1_000, 80_000, 3_000]))
    a.feed(toolProgress('toolu_main', null, 12.7))
    a.feed(toolProgress('toolu_sub', 'toolu_main', 99))
    a.feed(thinking(2_345))
    await waitFor(() => expect(thinkingIndicator()).toHaveTextContent('約 2,345 トークン'))
    // 1 秒の間隔の中の値は保留し、次の 1 秒の境で送る (014 data-model §2「間引きと後始末」)
    a.feed(thinking(3_000))
    expect(thinkingIndicator()).toHaveTextContent('約 2,345 トークン')
    a.advance(1_000)
    await waitFor(() => expect(thinkingIndicator()).toHaveTextContent('約 3,000 トークン'))
    expect(a.timerCount()).toBe(0)
    a.feed(TASK_STARTED)
    a.feed(taskProgress('task_bg'))
    a.feed(status({ permissionMode: 'acceptEdits' }))
    a.feed(status({ status: 'compacting' }))
    a.feed(status({ compact_result: 'failed', compact_error: LEAK }))
    const warning = rateLimit({
      status: 'allowed_warning',
      rateLimitType: 'five_hour',
      utilization: 0.75,
      resetsAt: RESETS_AT_SEC,
      isUsingOverage: false
    })
    a.feed(warning)

    // transcript の行: task の進み具合・API の再試行 (次の主ループの assistant で成功)・権限モード・圧縮 (失敗)
    const task = (): HTMLElement | null => rowOf('task')
    await waitFor(() =>
      expect(slotText(task(), 'system-event-progress')).toBe('約 12,345 トークン・tool 3 回・4 秒')
    )
    expect(slotText(task(), 'system-event-detail')).toBe('サブエージェント')
    const retry = rowOf('api-retry')
    expect(slotText(retry, 'system-event-detail')).toBe('1/10 回目・HTTP 529・2 秒後')
    expect(slotText(retry, 'system-event-status')).toBe('成功')
    expect(slotText(rowOf('permission-mode'), 'system-event-detail')).toBe(
      SYSTEM_EVENT_LABELS.permissionModeChanged(PERMISSION_MODE_NAMES.acceptEdits)
    )
    expect(slotText(rowOf('compaction'), 'system-event-status')).toBe('失敗')
    // tool の経過時間は主ループの tool だけ (subagent の中の tool は送らない)
    expect(elapsedTexts()).toEqual([TOOL_RESULT_LABELS.toolElapsed(12)])
    expect(a.sent.some((json) => json.includes('toolu_sub'))).toBe(false)
    // 中央のヘッダの下の帯: 権限モードの警告と Quota banner
    const unsafe = screen.getByTestId('unsafe-mode-banner')
    expect(unsafe).toHaveTextContent(
      UNSAFE_MODE_BANNER_LABELS.unsafeModeBanner(PERMISSION_MODE_NAMES.acceptEdits)
    )
    expect(unsafe).toHaveTextContent(UNSAFE_MODE_BANNER_LABELS.unsafeModeIsolationUnverified)
    const quota = screen.getByTestId('quota-banner')
    expect(quota).toHaveAttribute('role', 'status')
    expect(quota).toHaveTextContent(
      QUOTA_BANNER_LABELS.quotaWarning(rateLimitTypeLabel('five_hour'), 75)
    )
    expect(quota.textContent).toMatch(/\d{2}:\d{2} にリセットされます。/)
    // result がまだ無いので使用量のタブは空の状態
    expect(within(panel).getByTestId('usage-await-first')).toBeInTheDocument()

    // ── A のターンの終わり (result) ──
    const turnA = result({
      total_cost_usd: 1.25,
      num_turns: 4,
      modelUsage: {
        'claude-sonnet-4-5': modelUsageOf({
          inputTokens: 1_200,
          outputTokens: 3_400,
          cacheReadInputTokens: 56_000,
          cacheCreationInputTokens: 7_800,
          costUSD: 1.25
        })
      },
      permission_denials: [
        { tool_name: LEAK, tool_use_id: 'toolu_denied', tool_input: { command: LEAK } }
      ]
    })
    a.feed(turnA)
    const usage = await waitFor(() => within(panel).getByTestId('usage'))
    expect(ddOf(usage, USAGE_LABELS.usageCost)).toHaveTextContent('$1.25')
    expect(ddOf(usage, USAGE_LABELS.usageTurns).textContent).toBe('1')
    const tokens = within(usage).getByTestId('usage-tokens')
    expect(ddOf(tokens, USAGE_LABELS.tokenInput)).toHaveTextContent('1,200')
    expect(ddOf(usage, USAGE_LABELS.usageDeniedTotal)).toHaveTextContent('1 件')
    expect(within(usage).getByTestId('usage-models')).toHaveTextContent('claude-sonnet-4-5')
    // 中央のヘッダの目盛り: (1,000 + 80,000 + 3,000) / 200,000
    expect(screen.getByTestId('context-meter')).toHaveTextContent(
      CONTEXT_COST_METER_LABELS.contextMeter(42)
    )
    expect(screen.getByTestId('cost-meter')).toHaveTextContent(
      CONTEXT_COST_METER_LABELS.costMeter('1.25')
    )
    // ターンの終わりで tool の経過時間と思考の印は消える
    expect(elapsedTexts()).toEqual([])
    expect(thinkingIndicator()).toBeNull()
    expect(meterTypes(a.sent)).toEqual([
      // 構成 (O-5 / 015 data-model §2)。`init` は構成の許可リストのフィールドを読み、O-4 の権限モードの比較はそのまま
      'init-report',
      'context',
      'tool-elapsed',
      'thinking',
      'thinking',
      'permission-mode',
      'rate-limit',
      'turn'
    ])
    expect(document.body.innerHTML).not.toContain(LEAK)

    // ── 表示していない B のターン ──
    b.feed(init('default'))
    b.feed(assistant('b-1', [{ type: 'text', text: 'B の応答' }], [5_000, 0, 0]))
    const turnB = result({
      total_cost_usd: 0.25,
      num_turns: 1,
      modelUsage: {
        'claude-haiku-4-5': modelUsageOf({
          inputTokens: 5_000,
          outputTokens: 100,
          costUSD: 0.25,
          contextWindow: 100_000
        })
      }
    })
    b.feed(turnB)
    // 表示中の A の値は B の計量で変わらない
    expect(ddOf(usage, USAGE_LABELS.usageCost)).toHaveTextContent('$1.25')
    expect(panel).not.toHaveTextContent('claude-haiku-4-5')

    // ── B に切り替える ──
    await selectRunning(1)
    const usageB = await waitFor(() => within(screen.getByRole('tabpanel')).getByTestId('usage'))
    expect(ddOf(usageB, USAGE_LABELS.usageCost)).toHaveTextContent('$0.25')
    expect(usageB).toHaveTextContent('claude-haiku-4-5')
    expect(usageB).not.toHaveTextContent('claude-sonnet-4-5')
    expect(screen.getByTestId('context-meter')).toHaveTextContent(
      CONTEXT_COST_METER_LABELS.contextMeter(5)
    )
    await waitFor(() => expect(rowOf('api-retry')).toBeNull())
    expect(screen.queryByTestId('quota-banner')).toBeNull()
    expect(screen.queryByTestId('unsafe-mode-banner')).toBeNull()

    // 許可リストの外の値は、どの SessionEvent の文字列にも DOM にも無い
    expect(leaks([...a.sent, ...b.sent])).toEqual([])
    expect(document.body.innerHTML).not.toContain(LEAK)
    a.dispose()
    b.dispose()
    expect(a.timerCount() + b.timerCount()).toBe(0)
  })

  it('値の検証の外れ (__proto__・長い id・URL の資格情報の形の modelId・resetsAt: 1e300) で例外が出ず、外れた値だけが落ちる', async () => {
    const h = await setup({ ids: [A] })
    await selectRunning(0)
    const panel = await openUsage()
    const a = sessionThread(h, A)
    const ids = [
      '__proto__',
      'https://u:p@h/m',
      'u:p@h/m',
      'a'.repeat(129),
      'claude-sonnet-4-5[1m]',
      'arn:aws:bedrock:us-east-1:123456789012:inference-profile/us.anthropic.claude-sonnet-4-5',
      'claude-sonnet-4-5@20250929'
    ]
    // `__proto__` を自分のキーに持つ object は JSON.parse でしか作れない (SDK のメッセージも JSON から来る)
    const usage = JSON.stringify(modelUsageOf({ outputTokens: 10, costUSD: 0.5 }))
    const entries = ids.map((id) => `${JSON.stringify(id)}:${usage}`)
    const modelUsage: unknown = JSON.parse(`{${entries.join(',')}}`)
    const denials: unknown = JSON.parse(
      '[{"__proto__":{"tool_use_id":"toolu_polluted"}},{"tool_use_id":"toolu_ok"}]'
    )
    const rejected = rateLimit({
      status: 'rejected',
      rateLimitType: '__proto__',
      utilization: 1e9,
      resetsAt: 1e300
    })
    expect(() => {
      a.feed(init('__proto__'))
      a.feed(toolProgress('t'.repeat(129), null, 5))
      a.feed(toolProgress('a/b', null, 5))
      a.feed(taskProgress('a/b'))
      a.feed(rejected)
      a.feed(rateLimit({ status: '__proto__', rateLimitType: 'five_hour' }))
      a.feed(result({ total_cost_usd: 0.5, num_turns: 1, modelUsage, permission_denials: denials }))
    }).not.toThrow()

    // 内訳は検証を通ったモデルの id だけ ([1m] 付き・Bedrock の ARN・Vertex の model@date は落とさない)
    const models = await waitFor(() => within(panel).getByTestId('usage-models'))
    const items = within(models).getAllByRole('listitem')
    const titles = items.map((item) => item.querySelector('p')?.getAttribute('title'))
    expect(titles).toEqual(ids.slice(4))
    // 拒否の数は形を検証した tool の id だけ (`__proto__` の要素は数えない)
    const usageTab = within(panel).getByTestId('usage')
    expect(ddOf(usageTab, USAGE_LABELS.usageDeniedTotal)).toHaveTextContent('1 件')
    // 列挙の外 (`__proto__`) は「利用枠」と「不明なモード」。範囲の外の割合と時刻 (1e9・1e300) は出さない
    const quota = screen.getByTestId('quota-banner')
    expect(quota).toHaveAttribute('role', 'alert')
    expect(quota).toHaveTextContent(
      `${QUOTA_BANNER_LABELS.quotaRejected(rateLimitTypeLabel(null))}${QUOTA_BANNER_LABELS.quotaWait}`
    )
    expect(quota.textContent).not.toMatch(/\d{1,2}:\d{2}/)
    expect(screen.getByTestId('unsafe-mode-banner')).toHaveTextContent(
      UNSAFE_MODE_BANNER_LABELS.unsafeModeBanner(PERMISSION_MODE_NAMES.unknown)
    )
    expect(slotText(rowOf('permission-mode'), 'system-event-detail')).toBe(
      SYSTEM_EVENT_LABELS.permissionModeChanged(PERMISSION_MODE_NAMES.unknown)
    )
    // 形の外れた tool の id と task の id は送らない
    expect(a.sent.some((json) => json.includes('"tool-elapsed"'))).toBe(false)
    expect(a.sent.some((json) => json.includes('"task:'))).toBe(false)

    // port に直接届いた未信頼の `meter` も、decoder が検証を通した値だけで組み直す (余分なキー・`__proto__` を運ばない)
    const crafted = [
      '{"kind":"meter","meter":{"type":"__proto__","usedTokens":1}}',
      `{"kind":"meter","meter":{"type":"context","usedTokens":42,"extra":"${LEAK}","__proto__":{"polluted":"yes"}}}`,
      '{"kind":"meter","meter":{"type":"rate-limit","status":"allowed_warning","limitType":"constructor","utilizationPct":1e9,"resetsAtSec":1e300,"usingOverage":"yes"}}'
    ]
    expect(() => {
      for (const json of crafted) h.emit(A, JSON.parse(json) as SessionEvent)
    }).not.toThrow()
    const meters = h.store.getState().meters[A]
    expect(meters?.contextUsed).toBe(42)
    expect(Object.keys(meters?.rateLimit ?? {}).sort()).toEqual([
      'limitType',
      'resetsAtSec',
      'status',
      'type',
      'usingOverage',
      'utilizationPct'
    ])
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
    await waitFor(() =>
      expect(screen.getByTestId('quota-banner')).toHaveTextContent(
        QUOTA_BANNER_LABELS.quotaWarningNoPct(rateLimitTypeLabel(null))
      )
    )
    expect(leaks(a.sent)).toEqual([])
    expect(document.body.innerHTML).not.toContain(LEAK)
  })

  it('失敗の理由は状態通知の 4 つのフィールドのまま届き (X-5 の全フィールドの走査)、失敗の文字列は出ない', async () => {
    const h = await setup({ ids: [A] })
    await selectRunning(0)
    const a = sessionThread(h, A)
    a.feed(init('default'))
    const partial = [{ type: 'text', text: '途中の応答' }]
    a.feed(assistant('a-1', partial, [10, 0, 0], { error: 'rate_limit' }))
    const failed = result({
      subtype: 'error_during_execution',
      is_error: true,
      api_error_status: 429,
      errors: [LEAK],
      total_cost_usd: 0.01,
      num_turns: 1
    })
    a.feed(failed)

    // 理由は列挙のキーだけ。状態通知は 4 つのフィールドのまま main の受信規則を通る
    expect(a.statuses).toEqual([
      { sessionId: A, state: 'error', reasonKey: 'rate-limited', claudeAlive: true }
    ])
    for (const update of a.statuses) {
      expect(Object.keys(update).sort()).toEqual(['claudeAlive', 'reasonKey', 'sessionId', 'state'])
      expect(JSON.stringify(update)).not.toContain(LEAK)
    }
    // 理由のキーが 18 に広がっても状態通知の形は同じで、計量を載せる余地は無い
    for (const reasonKey of LAUNCH_FAILURE_REASONS) {
      const update = { sessionId: A, state: 'error', reasonKey, claudeAlive: true }
      expect(isSessionStatusUpdate(update)).toBe(true)
      const withMeter = { ...update, meter: { type: 'context', usedTokens: 1 } }
      expect(isSessionStatusUpdate(withMeter)).toBe(false)
    }

    // 計量 (turn) は失敗の理由より前に届く。失敗の表示は理由の全文 (HTTP の状態・errors の文字列は出さない)
    const turnAt = a.sent.findIndex((json) => json.includes('"type":"turn"'))
    const failureAt = a.sent.findIndex((json) => json.includes('"kind":"failure"'))
    expect(turnAt).toBeGreaterThanOrEqual(0)
    expect(turnAt).toBeLessThan(failureAt)
    const label = launchFailureLabel('rate-limited')
    await waitFor(() =>
      expect(screen.getAllByRole('alert').some((el) => el.textContent?.includes(label))).toBe(true)
    )
    // rate_limit_event が届かない (API キー・Bedrock の Provider) と帯は出ない。失敗の文言は帯を参照しない
    expect(screen.queryByTestId('quota-banner')).toBeNull()
    expect(document.body.textContent).not.toContain('429')
    expect(leaks(a.sent)).toEqual([])
    expect(document.body.innerHTML).not.toContain(LEAK)
  })
})

/* ── 構成 (O-5 / 015 spec SC-002 / tasks SH-020) ──────────────────────── */

async function openInitReport(): Promise<HTMLElement> {
  await userEvent.click(screen.getByRole('button', { name: SHELL_LABELS.expandPanel }))
  // 注意の印があると名前に「(注意)」が付く (015 pr-gate R1 MD-02)。
  await userEvent.click(
    screen.getByRole('tab', { name: new RegExp(`^${SHELL_LABELS.initReportTab}`) })
  )
  return screen.getByRole('tabpanel')
}

/** 畳んだ帯の「構成」のアイコン (印があると名前に「注意」が付く)。 */
const initReportBand = (): HTMLElement =>
  within(screen.getByTestId('right-panel')).getByRole('button', {
    name: new RegExp(`^${SHELL_LABELS.initReportTab}`)
  })

const slashTexts = (scope: HTMLElement): string[] =>
  within(scope)
    .queryAllByTestId('init-report-slash-command')
    .map((el) => el.textContent ?? '')

describe('構成の経路: init / commands_changed → live-signals → port → decoder → 稼働中のストア → DOM (015 spec SC-002)', () => {
  it('構成のタブ・畳んだ帯の印・MCP の tool の見出しのサーバー名まで届き、許可リストの外の値は出ない。2 つのセッションが混ざらない', async () => {
    const h = await setup({ ids: [A, B] })
    await selectRunning(0)
    const a = sessionThread(h, A)
    const b = sessionThread(h, B)

    // ── A のターン: 構成・コマンドの一覧・MCP の tool の呼び出し ──
    a.feed(
      init('default', {
        mcp_servers: [{ name: 'github', status: 'pending' }],
        slash_commands: ['/a']
      })
    )
    a.feed(commandsChanged([{ name: 'a', description: '説明 A', argumentHint: '<x>' }]))
    const mcpCall = {
      type: 'tool_use',
      id: 'toolu_mcp',
      name: 'mcp__github__create_issue',
      input: { title: 't' }
    }
    a.feed(assistant('a-1', [mcpCall], [10, 0, 0]))
    // MCP の tool の見出しのサーバー名は表示中のセッションの構成から引く (一致がちょうど 1 つなので推定の印なし)
    await waitFor(() =>
      expect(document.querySelector('[data-slot="mcp-tool-call-server"]')).toHaveTextContent(
        'github'
      )
    )
    expect(document.querySelector('[data-slot="mcp-tool-call-inferred"]')).toBeNull()
    expect(initReportBand()).not.toHaveAttribute('data-attention')

    // ── 名前は同じで状態だけが変わった 2 回目の init (1 秒の窓の中なので、窓の終わりに届く) ──
    a.feed(
      init('default', {
        mcp_servers: [{ name: 'github', status: 'failed' }],
        slash_commands: ['/a']
      })
    )
    expect(initReportBand()).not.toHaveAttribute('data-attention')
    a.advance(1_000)
    await waitFor(() => expect(initReportBand()).toHaveAttribute('data-attention', 'true'))

    const panel = await openInitReport()
    const server = within(panel).getByTestId('init-report-mcp-server')
    expect(server).toHaveTextContent('github')
    expect(server).toHaveTextContent(MCP_STATUS_LABELS.failed)
    expect(within(server).getByRole('img', { name: SHELL_LABELS.attention })).toHaveAttribute(
      'data-attention',
      'true'
    )
    // `init` の `slash_commands` が `/a`・`commands_changed` の `name` が `a` でも、`/a` に説明と引数の形が付く
    expect(slashTexts(panel)).toEqual(['/a <x>説明 A'])
    expect(within(panel).getByTestId('init-report-model')).toHaveTextContent('claude-sonnet-4-5')

    // ── 同じ長さの別のモデル (窓の外なので、すぐ届く) ──
    a.advance(1_000)
    a.feed(
      init('default', {
        mcp_servers: [{ name: 'github', status: 'failed' }],
        model: 'claude-sonnet-4-6',
        slash_commands: ['/a']
      })
    )
    await waitFor(() =>
      expect(within(panel).getByTestId('init-report-model')).toHaveTextContent('claude-sonnet-4-6')
    )
    // MCP の状態だけが違う init の後も、説明と引数の形は消えない
    expect(slashTexts(panel)).toEqual(['/a <x>説明 A'])

    // ── 1 秒の窓の中の連続した init の後で、DOM は最後の値 ──
    for (const skill of ['skill-1', 'skill-2', 'skill-3'])
      a.feed(
        init('default', { model: 'claude-sonnet-4-6', skills: [skill], slash_commands: ['/a'] })
      )
    a.advance(1_000)
    await waitFor(() =>
      expect(within(panel).getByTestId('init-report-skills')).toHaveTextContent('skill-3')
    )
    expect(panel).not.toHaveTextContent('skill-1')
    expect(panel).not.toHaveTextContent('skill-2')

    // ── 表示していない B の構成 ──
    b.feed(
      init('default', {
        model: 'claude-haiku-4-5',
        mcp_servers: [{ name: 'linear', status: 'connected' }],
        skills: ['skill-of-b']
      })
    )
    expect(panel).not.toHaveTextContent('skill-of-b')
    expect(within(panel).getByTestId('init-report-model')).toHaveTextContent('claude-sonnet-4-6')
    await selectRunning(1)
    const panelB = screen.getByRole('tabpanel')
    await waitFor(() =>
      expect(within(panelB).getByTestId('init-report-model')).toHaveTextContent('claude-haiku-4-5')
    )
    expect(panelB).toHaveTextContent('skill-of-b')
    expect(panelB).toHaveTextContent('linear')
    expect(panelB).not.toHaveTextContent('skill-3')
    expect(panelB.querySelector('[data-attention="true"]')).toBeNull()

    // 許可リストの外の値 (cwd・プラグインの path・apiKeySource・aliases ほか) は SessionEvent の文字列にも DOM にも無い
    expect(meterTypes(a.sent).filter((t) => t === 'init-report' || t === 'commands')).toEqual([
      'init-report',
      'commands',
      'init-report',
      'init-report',
      'init-report'
    ])
    expect(leaks([...a.sent, ...b.sent])).toEqual([])
    expect(document.body.innerHTML).not.toContain(LEAK)
    // 構成は状態通知に載らない (状態通知の形は 4 つのフィールドのまま。構成を載せる余地は無い)
    expect([...a.statuses, ...b.statuses]).toEqual([])
    const update = { sessionId: A, state: 'running', reasonKey: null, claudeAlive: true }
    expect(isSessionStatusUpdate(update)).toBe(true)
    expect(isSessionStatusUpdate({ ...update, initReport: { type: 'init-report' } })).toBe(false)
    a.dispose()
    b.dispose()
    expect(a.timerCount() + b.timerCount()).toBe(0)
  })

  it('形の検査の外れ (制御文字・tag 文字・U+2028・長い名前・件数の超過・__proto__ / constructor) で例外が出ず、外れた値だけが落ちる', async () => {
    const h = await setup({ ids: [A] })
    await selectRunning(0)
    const a = sessionThread(h, A)
    const many = Array.from({ length: 70 }, (_, i) => ({ name: `srv-${i}`, status: 'connected' }))
    // `__proto__` を自分のキーに持つ object は JSON.parse でしか作れない (SDK のメッセージも JSON から来る)
    const polluted: unknown = JSON.parse(
      '{"__proto__":{"polluted":"yes"},"name":"p","status":"connected"}'
    )
    expect(() => {
      a.feed(
        init('default', {
          mcp_servers: [
            { name: 'a\u0000b', status: 'connected' },
            { name: '__proto__', status: '__proto__' },
            { name: 'constructor', status: 'failed' },
            polluted,
            ...many
          ],
          tools: ['x y', `t\u{E0041}`, 'n'.repeat(129), 'Bash'],
          slash_commands: ['//a', 'ok'],
          skills: '__proto__',
          plugins: [{ name: 'p', path: `/${LEAK}`, version: 'v 1' }]
        })
      )
      a.feed(
        commandsChanged([
          { name: '__proto__', description: 'd‮e', argumentHint: '' },
          { name: 'x'.repeat(129), description: '', argumentHint: '' },
          { name: 'constructor', description: `${'長'.repeat(250)}`, argumentHint: '' }
        ])
      )
    }).not.toThrow()
    // MCP サーバーのどれか (`constructor`) が failed なので帯に印が付く
    await waitFor(() => expect(initReportBand()).toHaveAttribute('data-attention', 'true'))
    const panel = await openInitReport()
    const rows = within(panel).getAllByTestId('init-report-mcp-server')
    expect(rows).toHaveLength(64)
    expect(rows[0]).toHaveTextContent('__proto__')
    expect(rows[0]).toHaveTextContent(MCP_STATUS_LABELS.unknown)
    expect(within(panel).getByTestId('init-report-tools')).toHaveTextContent('Bash')
    expect(within(panel).getByTestId('init-report-tool-count')).toHaveTextContent('1 件')
    expect(within(panel).getByTestId('init-report-omitted')).toBeInTheDocument()
    const commands = slashTexts(panel)
    expect(commands.map((t) => t.slice(0, 12))).toEqual(['/__proto__de', '/constructor'])
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
    expect(leaks(a.sent)).toEqual([])
    expect(document.body.innerHTML).not.toContain(LEAK)
  })
})
