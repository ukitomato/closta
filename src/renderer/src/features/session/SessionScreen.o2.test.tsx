import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { SESSION_PORT_MESSAGE } from '@domain/capability'
import type { SessionEvent } from '@domain/session/agent-session'
import type { SessionStatusUpdate } from '@domain/session/status-update'
import type { TranscriptMessageDTO, TranscriptPartDTO } from '@domain/session/transcript-dto'

import {
  SYSTEM_EVENT_LABELS,
  TOOL_RESULT_LABELS,
  TRANSCRIPT_DENSITY_LABELS
} from '@/features/chat/labels'
import { useUiStore } from '@/stores/ui'
import { installCapability } from '@/test-support/capability'

import { MONITOR_LABELS } from './labels'
import { RunningSessionStoreContext } from './running-session-context'
import { createRunningSessionStore, type RunningSessionStore } from './running-session-store'
import { SessionScreen } from './SessionScreen'

/**
 * O-2 FE-012 / FE-022 — 実行中のセッションの transcript (SC-003 / SC-005)。
 * port の本文 (`SessionEvent`) → store の合成 → assistant-ui の Thread の描画までを本物で通す。
 */

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
  readonly emit: (sessionId: string, event: SessionEvent) => void
  readonly pushStatus: (update: Partial<SessionStatusUpdate> & { sessionId: string }) => void
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
  let listener: ((u: readonly SessionStatusUpdate[]) => void) | null = null
  const launch = vi.fn()
  for (const id of ids) launch.mockResolvedValueOnce({ status: 'launching', sessionId: id })
  const cap = installCapability({
    listFolders: () => new Promise<never>(() => undefined),
    listRuntimes: () => new Promise<never>(() => undefined),
    launchSession: launch,
    sendPrompt: vi.fn(async () => {}),
    interruptSession: vi.fn(async () => {}),
    onSessionStatus: (l) => {
      listener = l
      return () => {
        listener = null
      }
    }
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
  render(
    <RunningSessionStoreContext.Provider value={store}>
      <SessionScreen />
    </RunningSessionStoreContext.Provider>
  )
  return {
    store,
    emit: (sessionId, event) =>
      act(() => ports.get(sessionId)?.onmessage?.({ data: JSON.stringify(event) })),
    pushStatus: (update) =>
      act(() =>
        listener?.([
          { state: 'running', reasonKey: null, claudeAlive: true, ...update } as SessionStatusUpdate
        ])
      )
  }
}

type EventPart = Extract<TranscriptPartDTO, { type: 'system-event' }>

function eventMessage(id: string, part: Partial<EventPart>): SessionEvent {
  const message: TranscriptMessageDTO = {
    id,
    role: 'system',
    parts: [
      {
        type: 'system-event',
        category: 'hook',
        opens: false,
        name: '',
        detail: '',
        status: null,
        ...part
      }
    ],
    createdAt: 1
  }
  return { kind: 'message', message }
}

function toolMessage(
  toolName: string,
  args: unknown,
  result: string | null,
  over: { isError?: boolean; truncated?: boolean } = {}
): SessionEvent {
  return {
    kind: 'message',
    message: {
      id: 'a1',
      role: 'assistant',
      parts: [
        {
          type: 'tool-call',
          toolCallId: 'c1',
          toolName,
          argsText: JSON.stringify(args),
          result,
          isError: over.isError ?? false,
          truncated: over.truncated ?? false,
          children: []
        }
      ],
      createdAt: 1
    }
  }
}

const rows = (): HTMLElement[] =>
  Array.from(document.querySelectorAll<HTMLElement>('[data-slot="aui_system-event-row"]'))

const statusOf = (row: HTMLElement | undefined): string =>
  row?.querySelector('[data-slot="system-event-status"]')?.textContent ?? ''

describe('実行中の tool の結果 (FR-007 / US-2 AC1・AC2)', () => {
  it('tool-call の後に結果を埋めた同じ id の message が届くと Terminal block に出力が出る', async () => {
    const h = await setup()
    h.emit(A, toolMessage('Bash', { command: 'ls -la' }, null))
    const block = await waitFor(() => {
      const el = document.querySelector('[data-slot="aui_terminal-block"]')
      expect(el).not.toBeNull()
      return el as HTMLElement
    })
    expect(block).not.toHaveTextContent('out.txt')
    h.emit(A, toolMessage('Bash', { command: 'ls -la' }, 'out.txt'))
    await waitFor(() =>
      expect(document.querySelector('[data-slot="aui_terminal-block"]')).toHaveTextContent(
        'out.txt'
      )
    )
    expect(document.querySelectorAll('[data-slot="aui_terminal-block"]')).toHaveLength(1)
  })

  it('エラーと切り詰めを示す', async () => {
    const h = await setup()
    h.emit(A, toolMessage('Bash', { command: 'false' }, 'boom', { isError: true, truncated: true }))
    const block = await waitFor(() => {
      const el = document.querySelector<HTMLElement>('[data-slot="aui_terminal-block"]')
      expect(el).not.toBeNull()
      return el!
    })
    // 他の表示と同じ見える文字の印 (アイコンの aria-label だけに頼らない。pr-gate R2 ux M-002 / a11y L-002)。
    expect(within(block).getByText(TOOL_RESULT_LABELS.failed)).toHaveAttribute(
      'data-slot',
      'tool-result-error'
    )
    expect(block).toHaveTextContent(TOOL_RESULT_LABELS.truncated)
    // 切り詰めの印は透明度を足さない (muted-foreground のまま 4.5:1。pr-gate R2 a11y H-001)。
    const truncated = block.querySelector('[data-slot="tool-result-truncated"]')
    expect(truncated).not.toBeNull()
    expect(truncated!.className).not.toMatch(/opacity-/)
  })

  it('成功した Bash は完了のアイコンだけで、エラーの印を出さない', async () => {
    const h = await setup()
    h.emit(A, toolMessage('Bash', { command: 'ls' }, 'out.txt'))
    const block = await waitFor(() => {
      const el = document.querySelector<HTMLElement>('[data-slot="aui_terminal-block"]')
      expect(el).not.toBeNull()
      return el!
    })
    expect(within(block).getByLabelText(TOOL_RESULT_LABELS.completed)).toBeInTheDocument()
    expect(block.querySelector('[data-slot="tool-result-marks"]')).toBeNull()
  })

  /* ── エラーと切り詰めは Bash 以外の表示にも出る (pr-gate R1 po H-001) ── */

  const shown = async (slot: string): Promise<HTMLElement> =>
    waitFor(() => {
      const el = document.querySelector<HTMLElement>(`[data-slot="${slot}"]`)
      expect(el).not.toBeNull()
      return el!
    })

  it('失敗した Edit は適用済みの diff に見えない (「エラー」の印とエラーの本文を出す)', async () => {
    const h = await setup()
    h.emit(
      A,
      toolMessage(
        'Edit',
        { file_path: '/w/a.ts', old_string: 'a', new_string: 'b' },
        'File has not been read yet',
        {
          isError: true
        }
      )
    )
    const block = await shown('aui_code-diff')
    expect(within(block).getByText(TOOL_RESULT_LABELS.failed)).toHaveAttribute(
      'data-slot',
      'tool-result-error'
    )
    expect(block).toHaveTextContent('File has not been read yet')
  })

  it('成功した Edit は結果の本文も「エラー」の印も出さない', async () => {
    const h = await setup()
    h.emit(
      A,
      toolMessage('Edit', { file_path: '/w/a.ts', old_string: 'a', new_string: 'b' }, 'updated OK')
    )
    const block = await shown('aui_code-diff')
    expect(block).not.toHaveTextContent('updated OK')
    expect(block.querySelector('[data-slot="tool-result-error"]')).toBeNull()
  })

  it('専用の表示の無い tool (Read) のエラーは ToolFallback の閉じた見出しに「エラー」の印が出る', async () => {
    const h = await setup()
    h.emit(
      A,
      toolMessage('Read', { file_path: '/w/missing.ts' }, 'File does not exist.', { isError: true })
    )
    const root = await shown('tool-fallback-root')
    expect(within(root).getByText(TOOL_RESULT_LABELS.failed)).toBeInTheDocument()
    expect(root.querySelector('[data-slot="tool-fallback-trigger"]')).toHaveAttribute(
      'aria-expanded',
      'false'
    )
  })

  it('専用の表示の無い tool (Glob) の切り詰めは ToolFallback に「（切り詰め）」が出る', async () => {
    const h = await setup()
    h.emit(A, toolMessage('Glob', { pattern: '**/*' }, 'a\nb', { truncated: true }))
    const root = await shown('tool-fallback-root')
    expect(root).toHaveTextContent(TOOL_RESULT_LABELS.truncated)
    expect(root.querySelector('[data-slot="tool-result-error"]')).toBeNull()
  })

  it('失敗した Agent は最上位に「エラー」の印が出る', async () => {
    const h = await setup()
    h.emit(
      A,
      toolMessage(
        'Agent',
        { description: '調べる', prompt: 'x', subagent_type: 'Explore' },
        'Agent failed',
        { isError: true, truncated: true }
      )
    )
    const block = await shown('aui_subagent')
    const header = block.querySelector<HTMLElement>('.aui-subagent-header')!
    expect(within(header).getByText(TOOL_RESULT_LABELS.failed)).toBeInTheDocument()
    expect(header).toHaveTextContent(TOOL_RESULT_LABELS.truncated)
    expect(block).toHaveTextContent('Agent failed')
  })

  /* ── Agent plan / Todo list / Write の印と、エラーの本文が plain text であること (pr-gate R2) ── */

  it('失敗した ExitPlanMode は Agent plan に「エラー」の印と本文を出す (ui-coverage L-102 / po H)', async () => {
    const h = await setup()
    h.emit(
      A,
      toolMessage('ExitPlanMode', { plan: '1. 調べる' }, 'User rejected the plan', {
        isError: true
      })
    )
    const block = await shown('aui_agent-plan')
    expect(within(block).getByText(TOOL_RESULT_LABELS.failed)).toHaveAttribute(
      'data-slot',
      'tool-result-error'
    )
    expect(block.querySelector('[data-slot="tool-result-error-text"]')).toHaveTextContent(
      'User rejected the plan'
    )
  })

  it('切り詰めた TodoWrite は Todo list に「（切り詰め）」を出す (ui-coverage L-102 / ux M-003)', async () => {
    const h = await setup()
    h.emit(
      A,
      toolMessage(
        'TodoWrite',
        { todos: [{ content: '書く', status: 'pending', activeForm: '書いている' }] },
        'ok',
        { truncated: true }
      )
    )
    const block = await shown('aui_todo-list')
    expect(block).toHaveTextContent(TOOL_RESULT_LABELS.truncated)
    expect(block.querySelector('[data-slot="tool-result-error"]')).toBeNull()
    expect(block.querySelector('[data-slot="tool-result-truncated"]')!.className).not.toMatch(
      /opacity-/
    )
  })

  it('失敗した Write は Code diff に「エラー」の印と本文を出す (ux M-003)', async () => {
    const h = await setup()
    h.emit(
      A,
      toolMessage('Write', { file_path: '/w/a.ts', content: 'x' }, 'Permission denied', {
        isError: true
      })
    )
    const block = await shown('aui_code-diff')
    expect(within(block).getByText(TOOL_RESULT_LABELS.failed)).toHaveAttribute(
      'data-slot',
      'tool-result-error'
    )
    expect(block).toHaveTextContent('Permission denied')
  })

  it('エラーの本文の HTML は要素にならず、文字のまま出る (security L-102 / CWE-79)', async () => {
    const payload = '<img src=x onerror="window.__pwned=1">'
    const h = await setup()
    h.emit(
      A,
      toolMessage('Edit', { file_path: '/w/a.ts', old_string: 'a', new_string: 'b' }, payload, {
        isError: true
      })
    )
    const block = await shown('aui_code-diff')
    const errorText = block.querySelector<HTMLElement>('[data-slot="tool-result-error-text"]')
    expect(errorText).not.toBeNull()
    expect(errorText!.querySelector('img')).toBeNull()
    expect(errorText).toHaveTextContent(payload)
    expect((window as { __pwned?: unknown }).__pwned).toBeUndefined()
  })

  it('Agent は Subagent の表示になる', async () => {
    const h = await setup()
    h.emit(
      A,
      toolMessage('Agent', { description: '調べる', prompt: 'x', subagent_type: 'Explore' }, null)
    )
    await waitFor(() => expect(document.querySelector('[data-slot="aui_subagent"]')).not.toBeNull())
    expect(screen.getByText('Explore')).toBeInTheDocument()
  })
})

describe('実行中のシステムイベントの行 (FR-009 / US-2 AC3・AC4・AC6)', () => {
  it('同じ id の更新で行が増えずに書き換わる。名前の無い更新で名前が消えない', async () => {
    const h = await setup()
    h.emit(
      A,
      eventMessage('task:t1', {
        category: 'task',
        opens: true,
        name: 'npm run build',
        detail: 'local_bash',
        status: 'running'
      })
    )
    await waitFor(() => expect(rows()).toHaveLength(1))
    expect(statusOf(rows()[0])).toBe('実行中')
    h.emit(A, eventMessage('task:t1', { category: 'task', status: null }))
    h.emit(A, eventMessage('task:t1', { category: 'task', status: 'completed' }))
    await waitFor(() => expect(statusOf(rows()[0])).toBe('完了'))
    expect(rows()).toHaveLength(1)
    expect(rows()[0]).toHaveTextContent('npm run build')
    // 行の無い id への更新は行を作らない。
    h.emit(A, eventMessage('task:hidden', { category: 'task', status: 'completed' }))
    expect(rows()).toHaveLength(1)
  })

  it('終わりの来ない行は、実行中は状態のまま、セッションの終了後に「結果不明」になる', async () => {
    const h = await setup()
    h.emit(A, eventMessage('hook:h1', { opens: true, name: 'setup.sh', status: 'started' }))
    await waitFor(() => expect(statusOf(rows()[0])).toBe('実行中'))
    h.pushStatus({ sessionId: A, state: 'done', claudeAlive: false })
    await waitFor(() => expect(statusOf(rows()[0])).toBe(SYSTEM_EVENT_LABELS.outcomeUnknown))
  })

  it('失敗したセッションでも「結果不明」になる。終わった行はそのまま', async () => {
    const h = await setup()
    h.emit(A, eventMessage('hook:h1', { opens: true, status: 'started' }))
    h.emit(A, eventMessage('hook:h2', { opens: true, status: 'succeeded' }))
    await waitFor(() => expect(rows()).toHaveLength(2))
    h.emit(A, { kind: 'failure', reasonKey: 'supervisor-exited' })
    await waitFor(() => expect(statusOf(rows()[0])).toBe(SYSTEM_EVENT_LABELS.outcomeUnknown))
    expect(statusOf(rows()[1])).toBe('成功')
  })

  it('末尾がシステムイベントの行で応答中でも、その行に running indicator・action bar を付けない', async () => {
    const h = await setup()
    h.emit(A, { kind: 'state', state: 'running' })
    h.emit(A, eventMessage('hook:h1', { opens: true, status: 'started' }))
    await waitFor(() => expect(rows()).toHaveLength(1))
    const row = rows()[0]!
    expect(row.querySelector('[data-slot="aui_assistant-message-indicator"]')).toBeNull()
    expect(document.querySelector('[data-slot="aui_assistant-message-indicator"]')).toBeNull()
    expect(row.querySelector('.aui-assistant-action-bar-root')).toBeNull()
    expect(row.querySelector('.aui-branch-picker-root')).toBeNull()
    // 実行中の印は composer 側の既存の表示 (停止ボタン)。
    expect(screen.getByRole('button', { name: 'Stop generating' })).toBeInTheDocument()
  })
})

describe('transcript の密度と監視ビューの密度 (FR-012 / FR-013 / US-3 AC3・AC5)', () => {
  it('切り替えの group 名とボタン名が監視ビューの密度と区別でき、値は互いに独立', async () => {
    const h = await setup()
    const transcript = screen.getByRole('group', { name: TRANSCRIPT_DENSITY_LABELS.group })
    const monitor = screen.getByRole('group', { name: MONITOR_LABELS.density })
    expect(transcript).not.toBe(monitor)
    expect(TRANSCRIPT_DENSITY_LABELS.group).not.toBe(MONITOR_LABELS.density)
    const transcriptNames = within(transcript)
      .getAllByRole('button')
      .map((b) => b.textContent)
    const monitorNames = within(monitor)
      .getAllByRole('button')
      .map((b) => b.textContent)
    for (const name of transcriptNames) expect(monitorNames).not.toContain(name)
    // 見える文言でも区別できる: transcript の切り替えには group 名が見出しとして出て、監視ビューの側には出ない
    // (aria 名だけに頼らない。pr-gate R1 po M-001)。
    expect(transcript).toHaveTextContent(TRANSCRIPT_DENSITY_LABELS.group)
    expect(monitor).not.toHaveTextContent(TRANSCRIPT_DENSITY_LABELS.group)
    // 各ボタンの title で何が開閉するかを示す。
    expect(
      within(transcript).getByRole('button', { name: TRANSCRIPT_DENSITY_LABELS.comfortable })
    ).toHaveAttribute('title', TRANSCRIPT_DENSITY_LABELS.comfortableHint)
    expect(
      within(transcript).getByRole('button', { name: TRANSCRIPT_DENSITY_LABELS.compact })
    ).toHaveAttribute('title', TRANSCRIPT_DENSITY_LABELS.compactHint)
    // 選択は背景の色の差だけでなく太字でも示す (両方の切り替え。pr-gate R2 a11y H-002 / M-004)。
    for (const button of [
      ...within(transcript).getAllByRole('button'),
      ...within(monitor).getAllByRole('button')
    ]) {
      expect(button).toHaveClass('aria-pressed:font-semibold')
    }

    await userEvent.click(
      within(transcript).getByRole('button', { name: TRANSCRIPT_DENSITY_LABELS.compact })
    )
    expect(useUiStore.getState().transcriptDensity).toBe('compact')
    expect(h.store.getState().density).toBe('comfortable')
  })

  it('セッションを切り替えても選んだ密度が保たれる', async () => {
    const h = await setup([A, B])
    await userEvent.click(
      within(screen.getByRole('group', { name: TRANSCRIPT_DENSITY_LABELS.group })).getByRole(
        'button',
        {
          name: TRANSCRIPT_DENSITY_LABELS.compact
        }
      )
    )
    act(() => h.store.select(B))
    await waitFor(() => expect(h.store.getState().selectedId).toBe(B))
    const group = await screen.findByRole('group', { name: TRANSCRIPT_DENSITY_LABELS.group })
    expect(
      within(group).getByRole('button', { name: TRANSCRIPT_DENSITY_LABELS.compact })
    ).toHaveAttribute('aria-pressed', 'true')
    expect(document.querySelector('[data-density="compact"]')).not.toBeNull()
  })
})
