import { act, render, screen, waitFor } from '@testing-library/react'
import { Profiler } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'

import { SESSION_PORT_MESSAGE } from '@domain/capability'
import type { SessionEvent } from '@domain/session/agent-session'

import { ToolResultMarks } from '@/components/assistant-ui/elements/tool-result-marks'
import { TOOL_RESULT_LABELS } from '@/features/chat/labels'
import {
  LiveProgressContext,
  useLiveThinkingTokens,
  type LiveProgressSource
} from '@/features/chat/transcript-context'
import { useUiStore } from '@/stores/ui'
import { installCapability, stubCapability } from '@/test-support/capability'
import { RunningSessionsHarness } from '@/test-support/running-sessions-harness'

import { RunningSessionStoreContext } from './running-session-context'
import { createRunningSessionStore, type RunningSessionStore } from './running-session-store'
import { EMPTY_SESSION_METERS } from './running-session-types'

/**
 * O-4 FE-043 — tool の経過時間 (014 spec FR-012 / US-4 AC3。data-model §4「進み具合」)。
 * O-4 FE-044 — 思考の印 (014 spec FR-012 / US-4 AC4。data-model §4「進み具合」/ research R-07)。
 * port の本文 (`message` と `meter`) → 稼働中のストア → 実行中の Thread (tool の見出し・viewport の footer) までを本物で通す。
 */

const AXE_RULES = { rules: { 'color-contrast': { enabled: false } } }

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'

interface FakePort {
  onmessage: ((event: { data: unknown }) => void) | null
  start: () => void
  close: () => void
}

function deliverPort(sessionId: string, port: FakePort): void {
  const event = new Event('message') as Event & { data: unknown; ports: unknown[] }
  event.data = { marker: SESSION_PORT_MESSAGE, sessionId }
  event.ports = [port]
  Object.defineProperty(event, 'origin', { value: window.location.origin })
  Object.defineProperty(event, 'source', { value: window })
  window.dispatchEvent(event)
}

interface Harness {
  readonly store: RunningSessionStore
  readonly container: HTMLElement
  readonly emit: (sessionId: string, event: SessionEvent) => void
}

let detach: (() => void) | null = null

beforeEach(() => {
  useUiStore.setState({ transcriptDensity: 'comfortable' })
})

afterEach(() => {
  detach?.()
  detach = null
  vi.unstubAllGlobals()
})

async function setup(ids: readonly string[] = [A]): Promise<Harness> {
  const launch = vi.fn()
  for (const id of ids) launch.mockResolvedValueOnce({ status: 'launching', sessionId: id })
  const cap = installCapability({
    listFolders: () => new Promise<never>(() => undefined),
    listRuntimes: () => new Promise<never>(() => undefined),
    launchSession: launch,
    sendPrompt: vi.fn(async () => {}),
    interruptSession: vi.fn(async () => {}),
    onSessionStatus: () => () => {}
  })
  const store = createRunningSessionStore(() => cap)
  detach = store.attach(window)
  const ports = new Map<string, FakePort>()
  for (const id of ids) {
    await store.launch({
      folderId: 'f1',
      runtimeId: 'wsl:Ubuntu',
      providerId: null,
      modelId: null,
      effort: null,
      permissionMode: 'default'
    })
    const port: FakePort = { onmessage: null, start: vi.fn(), close: vi.fn() }
    deliverPort(id, port)
    ports.set(id, port)
  }
  act(() => store.select(ids[0] ?? null))
  const { container } = render(
    <RunningSessionStoreContext.Provider value={store}>
      <RunningSessionsHarness />
    </RunningSessionStoreContext.Provider>
  )
  return {
    store,
    container,
    emit: (sessionId, event) =>
      act(() => ports.get(sessionId)?.onmessage?.({ data: JSON.stringify(event) }))
  }
}

/** assistant のメッセージ (tool の呼び出し 1 つ。`result` が null なら結果待ち)。 */
function toolCall(
  messageId: string,
  toolCallId: string,
  toolName: string,
  args: unknown,
  result: string | null
): SessionEvent {
  return {
    kind: 'message',
    message: {
      id: messageId,
      role: 'assistant',
      parts: [
        {
          type: 'tool-call',
          toolCallId,
          toolName,
          argsText: JSON.stringify(args),
          result,
          isError: false,
          truncated: false,
          children: []
        }
      ],
      createdAt: 1
    }
  }
}

const elapsed = (toolCallId: string, elapsedSeconds: number): SessionEvent => ({
  kind: 'meter',
  meter: { type: 'tool-elapsed', toolUseId: toolCallId, elapsedSeconds }
})

const elapsedMarks = (): HTMLElement[] =>
  Array.from(document.querySelectorAll<HTMLElement>('[data-slot="tool-result-elapsed"]'))

describe('tool の経過時間 (US-4 AC3 / FR-012)', () => {
  it('結果待ちの tool の見出しに経過時間が出て、計量の更新で書き換わる', async () => {
    const h = await setup()
    h.emit(A, toolCall('m1', 'toolu_bash', 'Bash', { command: 'sleep 90' }, null))
    await waitFor(() =>
      expect(document.querySelector('[data-slot="aui_terminal-block"]')).not.toBeNull()
    )
    expect(elapsedMarks()).toEqual([])

    h.emit(A, elapsed('toolu_bash', 3))
    await waitFor(() => expect(elapsedMarks().map((el) => el.textContent)).toEqual(['3秒']))
    h.emit(A, elapsed('toolu_bash', 75))
    await waitFor(() => expect(elapsedMarks().map((el) => el.textContent)).toEqual(['1分15秒']))
    // live region にしない (毎秒読み上げない)
    expect(elapsedMarks()[0]?.closest('[role="status"], [aria-live]')).toBeNull()
  })

  it('専用の表示の無い tool (ToolFallback) と Code diff・Todo list・Agent plan・Subagent でも同じ印が出る', async () => {
    const h = await setup()
    h.emit(A, toolCall('m1', 'toolu_read', 'Read', { file_path: '/a.ts' }, null))
    h.emit(
      A,
      toolCall(
        'm2',
        'toolu_edit',
        'Edit',
        { file_path: '/a.ts', old_string: 'a', new_string: 'b' },
        null
      )
    )
    h.emit(A, toolCall('m3', 'toolu_todo', 'TodoWrite', { todos: [] }, null))
    h.emit(A, toolCall('m4', 'toolu_plan', 'ExitPlanMode', { plan: '計画' }, null))
    h.emit(
      A,
      toolCall(
        'm5',
        'toolu_agent',
        'Agent',
        { description: 'd', prompt: 'p', subagent_type: 'x' },
        null
      )
    )
    for (const id of ['toolu_read', 'toolu_edit', 'toolu_todo', 'toolu_plan', 'toolu_agent'])
      h.emit(A, elapsed(id, 12))
    await waitFor(() => expect(elapsedMarks()).toHaveLength(5))
    for (const mark of elapsedMarks()) expect(mark).toHaveTextContent('12秒')
  })

  it('結果が届くと経過時間が消える', async () => {
    const h = await setup()
    h.emit(A, toolCall('m1', 'toolu_bash', 'Bash', { command: 'ls' }, null))
    h.emit(A, elapsed('toolu_bash', 5))
    await waitFor(() => expect(elapsedMarks()).toHaveLength(1))
    h.emit(A, toolCall('m1', 'toolu_bash', 'Bash', { command: 'ls' }, 'out.txt'))
    await waitFor(() => expect(elapsedMarks()).toEqual([]))
    // 結果の後に古い値の更新が来ても出さない
    h.emit(A, elapsed('toolu_bash', 6))
    expect(elapsedMarks()).toEqual([])
  })

  it('別のセッションの経過時間を出さない', async () => {
    const h = await setup([A, B])
    h.emit(A, toolCall('m1', 'toolu_same', 'Bash', { command: 'ls' }, null))
    h.emit(B, elapsed('toolu_same', 9))
    await waitFor(() =>
      expect(document.querySelector('[data-slot="aui_terminal-block"]')).not.toBeNull()
    )
    expect(elapsedMarks()).toEqual([])
  })

  it('vitest-axe の違反 0 (経過時間のある tool の見出し)', async () => {
    const h = await setup()
    h.emit(A, toolCall('m1', 'toolu_bash', 'Bash', { command: 'sleep 9' }, null))
    h.emit(A, toolCall('m2', 'toolu_read', 'Read', { file_path: '/a.ts' }, null))
    h.emit(A, elapsed('toolu_bash', 4))
    h.emit(A, elapsed('toolu_read', 61))
    await waitFor(() => expect(elapsedMarks()).toHaveLength(2))
    const viewport = h.container.querySelector<HTMLElement>('[data-slot="aui_thread-viewport"]')
    expect(viewport).not.toBeNull()
    expect((await axe(viewport!, AXE_RULES)).violations).toEqual([])
  })
})

/* ── 思考の印 (O-4 FE-044) ───────────────────────────────────────────── */

const thinking = (estimatedTokens: number): SessionEvent => ({
  kind: 'meter',
  meter: { type: 'thinking', estimatedTokens }
})
const indicator = (): HTMLElement | null =>
  document.querySelector<HTMLElement>('[data-slot="thinking-indicator"]')
const liveRegions = (): number =>
  document.querySelectorAll('[role="status"], [role="alert"], [role="log"], [aria-live]').length

function hookRow(i: number): SessionEvent {
  return {
    kind: 'message',
    message: {
      id: `hook:h${i}`,
      role: 'system',
      parts: [
        {
          type: 'system-event',
          category: 'hook',
          opens: true,
          name: '',
          detail: 'PostToolUse',
          status: 'succeeded'
        }
      ],
      createdAt: 1
    }
  }
}

const assistantText = (id: string): SessionEvent => ({
  kind: 'message',
  message: { id, role: 'assistant', parts: [{ type: 'text', text: '応答' }], createdAt: 1 }
})

describe('思考の印 (US-4 AC4 / FR-012)', () => {
  it('composer の上に「思考中 約 N トークン」が出て、値の更新で書き換わる。読み上げの領域は増えない', async () => {
    const h = await setup()
    await waitFor(() => expect(document.querySelector('.aui-composer-input')).not.toBeNull())
    expect(indicator()).toBeNull()
    const regions = liveRegions()

    h.emit(A, thinking(1_234))
    await waitFor(() => expect(indicator()).not.toBeNull())
    expect(indicator()).toHaveTextContent('思考中')
    expect(indicator()).toHaveTextContent('約 1,234 トークン')
    h.emit(A, thinking(5_000))
    await waitFor(() => expect(indicator()).toHaveTextContent('約 5,000 トークン'))
    expect(document.querySelectorAll('[data-slot="thinking-indicator"]')).toHaveLength(1)

    // footer の中で composer より前
    const footer = indicator()?.closest('.aui-thread-viewport-footer')
    const composer = footer?.querySelector('.aui-composer-root')
    expect(footer).not.toBeNull()
    expect(composer).not.toBeNull()
    expect(
      indicator()!.compareDocumentPosition(composer!) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
    // live region にしない (毎秒読み上げない)
    expect(liveRegions()).toBe(regions)
    expect(indicator()?.closest('[role="status"], [aria-live]')).toBeNull()
  })

  it('文字色は呼び出し側で text-muted-foreground に上書きする (WCAG 1.4.3。pr-gate R1 H-001)', async () => {
    const h = await setup()
    h.emit(A, thinking(1_234))
    await waitFor(() => expect(indicator()).not.toBeNull())
    // root の「思考中」(vendored の `text-foreground/55`) を tailwind-merge で置き換える
    expect(indicator()).toHaveClass('text-muted-foreground')
    expect(indicator()).not.toHaveClass('text-foreground/55')
    // 値の span (vendored の `text-foreground/30`) は子孫の選択子で上書きする
    expect(indicator()).toHaveClass('[&_.tabular-nums]:text-muted-foreground')
    expect(indicator()?.querySelector('.tabular-nums')).toHaveTextContent('約 1,234 トークン')
  })

  it('主ループの assistant のメッセージで消える', async () => {
    const h = await setup()
    h.emit(A, thinking(100))
    await waitFor(() => expect(indicator()).not.toBeNull())
    h.emit(A, assistantText('m1'))
    await waitFor(() => expect(indicator()).toBeNull())
  })

  it('ターンの終わり (turn) で消える', async () => {
    const h = await setup()
    h.emit(A, thinking(100))
    await waitFor(() => expect(indicator()).not.toBeNull())
    h.emit(A, {
      kind: 'meter',
      meter: { type: 'turn', costUsd: 0.1, turns: 1, models: [], permissionDenials: 0 }
    })
    await waitFor(() => expect(indicator()).toBeNull())
  })

  it('システムイベントの行では消えない。別のセッションの思考は出さない', async () => {
    const h = await setup([A, B])
    h.emit(B, thinking(42))
    await waitFor(() => expect(document.querySelector('.aui-composer-input')).not.toBeNull())
    expect(indicator()).toBeNull()
    h.emit(A, thinking(7))
    h.emit(A, hookRow(0))
    await waitFor(() => expect(indicator()).toHaveTextContent('約 7 トークン'))
  })

  it('仮想 (41 件以上) の footer でも composer の上に出る', async () => {
    const h = await setup()
    for (let i = 0; i < 45; i += 1) h.emit(A, hookRow(i))
    await waitFor(() =>
      expect(
        document.querySelector('[data-slot="aui_thread-viewport"][data-virtualized="true"]')
      ).not.toBeNull()
    )
    const regions = liveRegions()
    h.emit(A, thinking(321))
    await waitFor(() => expect(indicator()).toHaveTextContent('約 321 トークン'))
    const footer = indicator()?.closest('.aui-thread-viewport-footer')
    const composer = footer?.querySelector('.aui-composer-root')
    expect(composer).not.toBeNull()
    expect(
      indicator()!.compareDocumentPosition(composer!) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
    expect(liveRegions()).toBe(regions)
  })

  it('vitest-axe の違反 0 (思考の印のある footer)', async () => {
    const h = await setup()
    h.emit(A, thinking(1_000))
    await waitFor(() => expect(indicator()).not.toBeNull())
    const footer = indicator()?.closest<HTMLElement>('.aui-thread-viewport-footer')
    expect(footer).not.toBeNull()
    expect((await axe(footer!, AXE_RULES)).violations).toEqual([])
    expect(h.container).toContainElement(footer!)
  })
})

/** 思考のトークン数の購読の値を文字で出す (購読元の有無を見る)。 */
function ThinkingProbe(): React.JSX.Element {
  return <span data-testid="thinking-probe">{String(useLiveThinkingTokens())}</span>
}

describe('思考の印の購読元 (過去ログ)', () => {
  it('購読元が無ければ (過去ログ) 思考の値があっても null。あれば表示中のセッションの値を購読する', () => {
    const store = createRunningSessionStore(() => stubCapability())
    act(() => store.setState({ meters: { [A]: { ...EMPTY_SESSION_METERS, thinkingTokens: 99 } } }))
    const { rerender } = render(<ThinkingProbe />)
    expect(screen.getByTestId('thinking-probe')).toHaveTextContent('null')
    rerender(
      <LiveProgressContext.Provider value={sourceOf(store, A)}>
        <ThinkingProbe />
      </LiveProgressContext.Provider>
    )
    expect(screen.getByTestId('thinking-probe')).toHaveTextContent('99')
    act(() =>
      store.setState((s) => ({
        meters: { ...s.meters, [A]: { ...EMPTY_SESSION_METERS, thinkingTokens: 100 } }
      }))
    )
    expect(screen.getByTestId('thinking-probe')).toHaveTextContent('100')
    // 別のセッションの値は引かない
    act(() =>
      store.setState((s) => ({
        meters: { ...s.meters, [B]: { ...EMPTY_SESSION_METERS, thinkingTokens: 5 } }
      }))
    )
    expect(screen.getByTestId('thinking-probe')).toHaveTextContent('100')
  })
})

/* ── 部品だけ (購読の範囲と過去ログ) ─────────────────────────────────────── */

/** 稼働中のストアの計量から作る購読元 (`LivePane` の `useLiveProgressSource` と同じ形)。 */
function sourceOf(store: RunningSessionStore, sessionId: string): LiveProgressSource {
  return {
    toolElapsed: (id) => store.getState().meters[sessionId]?.toolElapsed.get(id) ?? null,
    thinkingTokens: () => store.getState().meters[sessionId]?.thinkingTokens ?? null,
    subscribe: (listener) =>
      store.subscribe((state, prev) => {
        if (state.meters[sessionId] !== prev.meters[sessionId]) listener()
      })
  }
}

function setElapsed(store: RunningSessionStore, entries: readonly [string, number][]): void {
  act(() =>
    store.setState((s) => ({
      meters: {
        ...s.meters,
        [A]: { ...(s.meters[A] ?? EMPTY_SESSION_METERS), toolElapsed: new Map(entries) }
      }
    }))
  )
}

describe('ToolResultMarks の購読 (014 data-model §4「進み具合」)', () => {
  it('他の tool の更新で描き直さない (自分の値が変わったときだけ描き直す)', () => {
    const store = createRunningSessionStore(() => stubCapability())
    const source = sourceOf(store, A)
    const commits = { a: 0, b: 0 }
    render(
      <LiveProgressContext.Provider value={source}>
        <Profiler
          id="a"
          onRender={() => {
            commits.a += 1
          }}
        >
          <ToolResultMarks toolCallId="toolu_a" pending isError={false} truncated={false} />
        </Profiler>
        <Profiler
          id="b"
          onRender={() => {
            commits.b += 1
          }}
        >
          <ToolResultMarks toolCallId="toolu_b" pending isError={false} truncated={false} />
        </Profiler>
      </LiveProgressContext.Provider>
    )
    setElapsed(store, [['toolu_a', 1]])
    const afterA = { ...commits }
    expect(screen.getAllByText('1秒')).toHaveLength(1)

    setElapsed(store, [
      ['toolu_a', 1],
      ['toolu_b', 1]
    ])
    setElapsed(store, [
      ['toolu_a', 1],
      ['toolu_b', 2]
    ])
    setElapsed(store, [
      ['toolu_a', 1],
      ['toolu_b', 3]
    ])
    expect(commits.a).toBe(afterA.a)
    expect(commits.b).toBe(afterA.b + 3)
    expect(screen.getByText('3秒')).toBeInTheDocument()

    setElapsed(store, [
      ['toolu_a', 2],
      ['toolu_b', 3]
    ])
    expect(commits.a).toBe(afterA.a + 1)
  })

  it('購読元が無い (過去ログ) と、結果の届いた tool には経過時間を出さない', () => {
    const store = createRunningSessionStore(() => stubCapability())
    setElapsed(store, [['toolu_a', 30]])
    const { container, rerender } = render(
      <ToolResultMarks toolCallId="toolu_a" pending isError={false} truncated={false} />
    )
    expect(container).toBeEmptyDOMElement()
    rerender(
      <LiveProgressContext.Provider value={sourceOf(store, A)}>
        <ToolResultMarks toolCallId="toolu_a" pending={false} isError={false} truncated={false} />
      </LiveProgressContext.Provider>
    )
    expect(container).toBeEmptyDOMElement()
    rerender(
      <LiveProgressContext.Provider value={sourceOf(store, A)}>
        <ToolResultMarks toolCallId="toolu_a" pending isError={false} truncated={false} />
      </LiveProgressContext.Provider>
    )
    expect(container).toHaveTextContent(TOOL_RESULT_LABELS.toolElapsed(30))
  })

  it('経過時間の文言: 60 秒未満は秒、それ以上は分と秒', () => {
    expect(TOOL_RESULT_LABELS.toolElapsed(0)).toBe('0秒')
    expect(TOOL_RESULT_LABELS.toolElapsed(59)).toBe('59秒')
    expect(TOOL_RESULT_LABELS.toolElapsed(60)).toBe('1分0秒')
    expect(TOOL_RESULT_LABELS.toolElapsed(3_725)).toBe('62分5秒')
  })
})
