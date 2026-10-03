import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ThreadMessageLike } from '@assistant-ui/react'

import { toSystemEventMessage } from '@domain/session/system-event'
import type { FailureReason } from '@domain/session/target'
import type {
  SystemEventStatus,
  TranscriptMessageDTO,
  TranscriptPartDTO
} from '@domain/session/transcript-dto'

import { useUiStore } from '@/stores/ui'

import { toThreadMessage } from './convert'
import { SYSTEM_EVENT_LABELS, TOOL_RESULT_LABELS, TRANSCRIPT_DENSITY_LABELS } from './labels'

/**
 * O-2 FE-012 / FE-022 — 過去ログの transcript のシステムイベントの行・Subagent の `Agent`・情報密度
 * (SC-003 / SC-005)。実行中の経路は `features/session/SessionScreen.o2.test.tsx`。
 *
 * `useTranscript` は mock し、描画経路 (assistant-ui の Thread / 変換) は本物を通す。
 */

const { view } = vi.hoisted(() => ({
  view: {
    messages: [] as readonly ThreadMessageLike[],
    status: 'ready' as 'idle' | 'loading' | 'ready' | 'empty' | 'failed',
    reasonKey: null as FailureReason | null,
    retry: (): void => {},
    hasSelection: true
  }
}))

vi.mock('./useTranscript', () => ({ useTranscript: () => view }))

import { ChatScreen } from './ChatScreen'

type EventPart = Extract<TranscriptPartDTO, { type: 'system-event' }>

function eventDto(id: string, over: Partial<EventPart>): TranscriptMessageDTO {
  return {
    id,
    role: 'system',
    parts: [
      {
        type: 'system-event',
        category: 'hook',
        opens: true,
        name: 'setup.sh',
        detail: 'SessionStart',
        status: 'succeeded',
        ...over
      }
    ],
    createdAt: null
  }
}

function textDto(id: string, text: string): TranscriptMessageDTO {
  return { id, role: 'assistant', parts: [{ type: 'text', text }], createdAt: null }
}

function toolDto(
  id: string,
  toolName: string,
  args: unknown,
  result: string | null = null
): TranscriptMessageDTO {
  return {
    id,
    role: 'assistant',
    parts: [
      {
        type: 'tool-call',
        toolCallId: `${id}-c`,
        toolName,
        argsText: JSON.stringify(args),
        result,
        isError: false,
        truncated: false,
        children: []
      }
    ],
    createdAt: null
  }
}

function show(messages: readonly TranscriptMessageDTO[]): void {
  view.messages = messages.map(toThreadMessage)
}

const rowsOf = (container: HTMLElement): HTMLElement[] =>
  Array.from(container.querySelectorAll<HTMLElement>('[data-slot="aui_system-event-row"]'))

const statusOf = (row: HTMLElement): string =>
  row.querySelector('[data-slot="system-event-status"]')?.textContent ?? ''

const nameOf = (row: HTMLElement): Element | null =>
  row.querySelector('[data-slot="system-event-name"]')

beforeEach(() => {
  useUiStore.setState({ transcriptDensity: 'comfortable' })
  view.messages = []
  view.status = 'ready'
  view.hasSelection = true
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('過去ログのシステムイベントの行 (FR-009 / SC-003)', () => {
  it('Hook の名前と結果、task の説明と状態を 1 行ずつ描く。assistant-ui の変換が例外を投げない', () => {
    show([
      textDto('m1', 'こんにちは'),
      eventDto('hook:h1', { name: 'setup.sh', detail: 'SessionStart', status: 'succeeded' }),
      eventDto('task:t1', {
        category: 'task',
        name: 'npm run build',
        detail: 'local_bash',
        status: 'completed'
      })
    ])
    let container!: HTMLElement
    expect(() => ({ container } = render(<ChatScreen />))).not.toThrow()
    const [hook, task] = rowsOf(container)
    expect(hook).toHaveTextContent('Hook')
    expect(hook).toHaveTextContent('SessionStart')
    expect(statusOf(hook!)).toBe('成功')
    expect(nameOf(hook!)).toHaveTextContent('setup.sh')
    expect(task).toHaveTextContent('Background task')
    expect(statusOf(task!)).toBe('完了')
    expect(nameOf(task!)).toHaveTextContent('npm run build')
  })

  it('task の種類は文言の表で出し、知らない値は識別子のまま (po L-002)', () => {
    show([
      eventDto('task:a', { category: 'task', name: '', detail: 'local_bash', status: 'running' }),
      eventDto('task:b', { category: 'task', detail: 'local_agent', status: 'completed' }),
      eventDto('task:c', { category: 'task', detail: 'remote_future', status: 'completed' }),
      eventDto('task:d', { category: 'task', detail: 'toString', status: 'completed' }),
      // Hook の detail (hook_event) は表を通さない。
      eventDto('hook:h', { detail: 'local_bash' })
    ])
    const { container } = render(<ChatScreen />)
    const details = rowsOf(container).map(
      (row) => row.querySelector('[data-slot="system-event-detail"]')?.textContent
    )
    expect(details).toEqual([
      'シェルのコマンド',
      'サブエージェント',
      'remote_future',
      'toString',
      'local_bash'
    ])
  })

  it('名前の無い Hook の行は hook_event と状態だけで描く (security L-001)', () => {
    const dto = toSystemEventMessage({
      type: 'system',
      subtype: 'hook_response',
      hook_id: 'h1',
      hook_name: 'TOKEN=abc ./notify.sh',
      hook_event: 'PostToolUse',
      outcome: 'success'
    })
    show([dto!])
    const { container } = render(<ChatScreen />)
    const [row] = rowsOf(container)
    expect(nameOf(row!)).toBeNull()
    expect(row).toHaveTextContent('PostToolUse')
    expect(statusOf(row!)).toBe('成功')
    expect(container.textContent).not.toContain('TOKEN')
  })

  it('行に action bar・branch picker・footer が無い', () => {
    show([eventDto('hook:h1', {})])
    const { container } = render(<ChatScreen />)
    const [row] = rowsOf(container)
    expect(row).toBeDefined()
    expect(row!.querySelector('.aui-assistant-action-bar-root')).toBeNull()
    expect(row!.querySelector('.aui-branch-picker-root')).toBeNull()
    expect(row!.querySelector('[data-slot="aui_assistant-message-footer"]')).toBeNull()
    expect(container.querySelector('[data-slot="aui_assistant-message-root"]')).toBeNull()
  })

  it.each<[SystemEventStatus | null]>([
    ['started'],
    ['running'],
    ['pending'],
    ['paused'],
    ['unknown'],
    [null]
  ])('終わりを表さない状態 (%s) は過去ログで常に「結果不明」', (status) => {
    show([eventDto('hook:h1', { status, category: status === 'started' ? 'hook' : 'task' })])
    const { container } = render(<ChatScreen />)
    const [row] = rowsOf(container)
    expect(statusOf(row!)).toBe(SYSTEM_EVENT_LABELS.outcomeUnknown)
    expect(row).toHaveAttribute('data-status', 'unresolved')
  })

  it('失敗した Hook には案内が出て、成功・取り消しには出ない', () => {
    show([
      eventDto('hook:a', { status: 'failed' }),
      eventDto('hook:b', { status: 'succeeded' }),
      eventDto('hook:c', { status: 'cancelled' }),
      eventDto('task:d', { category: 'task', status: 'failed' })
    ])
    const { container } = render(<ChatScreen />)
    const [failed, succeeded, cancelled, taskFailed] = rowsOf(container)
    expect(failed).toHaveTextContent(SYSTEM_EVENT_LABELS.hookFailedGuidance)
    // 案内は見る場所 (hooks の設定と debug の出力) を示す (po L-003)。
    expect(failed).toHaveTextContent('.claude/settings.json')
    expect(failed).toHaveTextContent('claude --debug')
    // 次の操作 (直したら起動し直す) も示す (pr-gate R2 ux L-004)。
    expect(failed).toHaveTextContent('セッションを起動し直してください')
    expect(statusOf(failed!)).toBe('失敗')
    for (const row of [succeeded, cancelled, taskFailed]) {
      expect(row).not.toHaveTextContent(SYSTEM_EVENT_LABELS.hookFailedGuidance)
    }
    // 失敗した task には tool の呼び出しの表示を見る案内が出る (pr-gate R2 ux L-004)。
    expect(taskFailed).toHaveTextContent(SYSTEM_EVENT_LABELS.taskFailedGuidance)
    for (const row of [failed, succeeded, cancelled]) {
      expect(row).not.toHaveTextContent(SYSTEM_EVENT_LABELS.taskFailedGuidance)
    }
  })

  it('強制停止した task には案内が出て、完了した task には出ない (pr-gate R2 ux L-004)', () => {
    show([
      eventDto('task:a', { category: 'task', status: 'killed' }),
      eventDto('task:b', { category: 'task', status: 'completed' })
    ])
    const { container } = render(<ChatScreen />)
    const [killed, completed] = rowsOf(container)
    expect(killed).toHaveTextContent(SYSTEM_EVENT_LABELS.taskFailedGuidance)
    expect(completed).not.toHaveTextContent(SYSTEM_EVENT_LABELS.taskFailedGuidance)
  })

  it('切り詰めた名前と detail は title で全文を見られ、名前は透明度を足さない (pr-gate R2 a11y M-001 / M-002)', () => {
    show([eventDto('task:t1', { category: 'task', name: 'ビルドを走らせる', status: 'completed' })])
    const { container } = render(<ChatScreen />)
    const [row] = rowsOf(container)
    const name = nameOf(row!) as HTMLElement
    expect(name).toHaveAttribute('title', 'ビルドを走らせる')
    expect(name.className).not.toMatch(/\/80\b/)
    const detail = row!.querySelector('[data-slot="system-event-detail"]')
    expect(detail).not.toBeNull()
    expect(detail).toHaveAttribute('title', detail!.textContent)
    // 動きを減らす設定では fade-in しない (a11y L-003)。
    expect(row!.className).toContain('motion-reduce:animate-none')
  })

  it('HTML・偽の状態の文言を含む名前は要素にならず、状態の文言と別の span に入る', () => {
    show([
      eventDto('hook:h1', { name: '<img src=x onerror="window.__pwned=1">成功', status: 'failed' })
    ])
    const { container } = render(<ChatScreen />)
    const [row] = rowsOf(container)
    expect(row!.querySelector('img')).toBeNull()
    expect(statusOf(row!)).toBe('失敗')
    const name = nameOf(row!)
    expect(name).toHaveTextContent('<img src=x onerror="window.__pwned=1">成功')
    // 名前の span は状態の Badge の外にあり、テキストノードだけを持つ。
    expect(name!.closest('[data-slot="system-event-status"]')).toBeNull()
    expect(name!.children).toHaveLength(0)
  })

  it('双方向制御文字・改行を含む名前は domain の変換で除かれ、DOM に現れない (end-to-end)', () => {
    const dto = toSystemEventMessage({
      type: 'system',
      subtype: 'hook_response',
      hook_id: 'h1',
      // 空白を含む名前は allowlist で落ちる (pr-gate R2 security L-101) ので、改行は末尾に置いて除かれることを確かめる。
      hook_name: 'evil‮name\n',
      hook_event: 'SessionStart',
      outcome: 'success',
      output: 'SECRET OUTPUT'
    })
    expect(dto).not.toBeNull()
    show([dto!])
    const { container } = render(<ChatScreen />)
    expect(container.textContent).not.toContain('‮')
    expect(container.textContent).not.toContain('SECRET OUTPUT')
    expect(nameOf(rowsOf(container)[0]!)?.textContent).toBe('「evilname」')
  })

  it('全角の長い名前は 1 行で切り詰める (truncate。改行しない)', () => {
    const long = 'あ'.repeat(120)
    show([eventDto('task:t1', { category: 'task', name: long, status: 'completed' })])
    const { container } = render(<ChatScreen />)
    const name = nameOf(rowsOf(container)[0]!) as HTMLElement
    expect(name.className).toContain('truncate')
    expect(name.className).toContain('min-w-0')
    expect(name.textContent).not.toContain('\n')
  })
})

describe('Subagent の Agent (FR-010)', () => {
  it('実行時の名前 Agent も Subagent の表示になる (fallback にならない)', async () => {
    show([
      toolDto(
        'm',
        'Agent',
        { description: '調べる', prompt: 'find x', subagent_type: 'Explore' },
        '見つかった'
      )
    ])
    const { container } = render(<ChatScreen />)
    expect(await screen.findByText('Explore')).toBeInTheDocument()
    expect(container.querySelector('[data-slot="aui_subagent"]')).not.toBeNull()
    expect(container.textContent).toContain('見つかった')
    expect(container.textContent).toContain('調べる')
  })

  it('入れ子の tool 呼び出しにもエラーと切り詰めの印が出る (pr-gate R2 ui-coverage L-101)', async () => {
    const nested = (
      id: string,
      over: { isError: boolean; truncated: boolean }
    ): TranscriptMessageDTO => ({
      id,
      role: 'assistant' as const,
      parts: [
        {
          type: 'tool-call' as const,
          toolCallId: `${id}-c`,
          toolName: 'Read',
          argsText: '{}',
          result: 'r',
          children: [],
          ...over
        }
      ],
      createdAt: null
    })
    const parent = toolDto('m', 'Agent', { description: '調べる', prompt: 'x' }, 'done')
    const call = parent.parts[0]
    if (call?.type !== 'tool-call') throw new Error('tool-call が無い')
    show([
      {
        ...parent,
        parts: [
          {
            ...call,
            children: [
              nested('c1', { isError: true, truncated: false }),
              nested('c2', { isError: false, truncated: true })
            ]
          }
        ]
      }
    ])
    const { container } = render(<ChatScreen />)
    await screen.findByText('調べる')
    const body = container.querySelector<HTMLElement>('[data-slot="aui_subagent"]')!
    const marks = Array.from(body.querySelectorAll('[data-slot="tool-result-marks"]'))
    expect(marks).toHaveLength(2)
    expect(marks[0]).toHaveTextContent(TOOL_RESULT_LABELS.failed)
    expect(marks[0]).not.toHaveTextContent(TOOL_RESULT_LABELS.truncated)
    expect(marks[1]).toHaveTextContent(TOOL_RESULT_LABELS.truncated)
    expect(marks[1]).not.toHaveTextContent(TOOL_RESULT_LABELS.failed)
  })
})

/* ── 情報密度 (US-3 / SC-005) ── */

const triggerOf = (text: RegExp | string): HTMLElement => {
  const button = screen.getByText(text).closest('button')
  if (button === null) throw new Error('trigger が無い')
  return button
}

const densityButton = (label: string): HTMLElement =>
  within(screen.getByRole('group', { name: TRANSCRIPT_DENSITY_LABELS.group })).getByRole('button', {
    name: label
  })

describe('transcript の情報密度 (FR-012 / FR-013)', () => {
  const withReasoning: TranscriptMessageDTO = {
    id: 'r',
    role: 'assistant',
    parts: [
      { type: 'reasoning', text: '考えている' },
      { type: 'text', text: '答え' }
    ],
    createdAt: null
  }

  it('既定は comfortable で Tool group が開く。compact で Tool group と Reasoning が閉じ、間隔を詰める', () => {
    show([withReasoning, toolDto('m', 'Bash', { command: 'ls' }, 'out')])
    const { container } = render(<ChatScreen />)
    expect(densityButton(TRANSCRIPT_DENSITY_LABELS.comfortable)).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    expect(triggerOf('1 tool call')).toHaveAttribute('aria-expanded', 'true')
    expect(container.querySelector('[data-density="comfortable"]')).not.toBeNull()

    fireEvent.click(densityButton(TRANSCRIPT_DENSITY_LABELS.compact))
    expect(densityButton(TRANSCRIPT_DENSITY_LABELS.compact)).toHaveAttribute('aria-pressed', 'true')
    expect(triggerOf('1 tool call')).toHaveAttribute('aria-expanded', 'false')
    expect(triggerOf(/Reasoning/)).toHaveAttribute('aria-expanded', 'false')
    expect(container.querySelector('[data-density="compact"]')).not.toBeNull()
  })

  it('利用者の開閉は新しいメッセージで上書きされず、密度の切り替えで新しい既定に戻る', () => {
    show([toolDto('m', 'Bash', { command: 'ls' }, 'out')])
    const { rerender } = render(<ChatScreen />)
    fireEvent.click(triggerOf('1 tool call'))
    expect(triggerOf('1 tool call')).toHaveAttribute('aria-expanded', 'false')

    // 新しいメッセージが届いても利用者が閉じたものは閉じたまま。
    show([toolDto('m', 'Bash', { command: 'ls' }, 'out'), textDto('m2', '続き')])
    rerender(<ChatScreen />)
    expect(screen.getByText('続き')).toBeInTheDocument()
    expect(triggerOf('1 tool call')).toHaveAttribute('aria-expanded', 'false')

    // 密度を切り替えたら新しい密度の既定に戻る (compact → comfortable で開く)。
    fireEvent.click(densityButton(TRANSCRIPT_DENSITY_LABELS.compact))
    fireEvent.click(densityButton(TRANSCRIPT_DENSITY_LABELS.comfortable))
    expect(triggerOf('1 tool call')).toHaveAttribute('aria-expanded', 'true')
  })

  it('選んだ密度は画面を作り直しても保たれる (過去ログ / 実行中の行き来。永続化はしない)', () => {
    show([toolDto('m', 'Bash', { command: 'ls' }, 'out')])
    const first = render(<ChatScreen />)
    fireEvent.click(densityButton(TRANSCRIPT_DENSITY_LABELS.compact))
    first.unmount()

    render(<ChatScreen />)
    expect(densityButton(TRANSCRIPT_DENSITY_LABELS.compact)).toHaveAttribute('aria-pressed', 'true')
    expect(triggerOf('1 tool call')).toHaveAttribute('aria-expanded', 'false')
  })

  it('切り替えでスクロールを動かさない (scrollTo / scrollIntoView を呼ばない)', () => {
    const scrollTo = vi.fn()
    const scrollIntoView = vi.fn()
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
      value: scrollTo,
      configurable: true
    })
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      value: scrollIntoView,
      configurable: true
    })
    show([toolDto('m', 'Bash', { command: 'ls' }, 'out'), textDto('m2', '本文')])
    render(<ChatScreen />)
    scrollTo.mockClear()
    scrollIntoView.mockClear()
    act(() => {
      fireEvent.click(densityButton(TRANSCRIPT_DENSITY_LABELS.compact))
    })
    expect(scrollTo).not.toHaveBeenCalled()
    expect(scrollIntoView).not.toHaveBeenCalled()
    Reflect.deleteProperty(HTMLElement.prototype, 'scrollTo')
    Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView')
  })
})
