import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'

import { SESSION_PORT_MESSAGE } from '@domain/capability'
import type { SessionEvent } from '@domain/session/agent-session'
import type { SessionStatusUpdate } from '@domain/session/status-update'
import type { TranscriptMessageDTO, TranscriptPartDTO } from '@domain/session/transcript-dto'

import {
  PERMISSION_MODE_NAMES,
  SYSTEM_EVENT_LABELS,
  TOOL_RESULT_LABELS,
  TRANSCRIPT_DENSITY_LABELS
} from '@/features/chat/labels'
import { useUiStore } from '@/stores/ui'
import { installCapability } from '@/test-support/capability'
import { RunningSessionsHarness } from '@/test-support/running-sessions-harness'

import { MONITOR_LABELS } from './labels'
import { RunningSessionStoreContext } from './running-session-context'
import { createRunningSessionStore, type RunningSessionStore } from './running-session-store'

/**
 * O-2 FE-012 / FE-022 — 実行中のセッションの transcript (SC-003 / SC-005)。
 * port の本文 (`SessionEvent`) → store の合成 → assistant-ui の Thread の描画までを本物で通す。
 * O-4 FE-021 — API の再試行の行 (014 spec US-2 AC4 / FR-007。data-model §3 / §5)。
 * O-4 FE-042 — 権限モード・コンテキストの圧縮・task の進み具合の行 (014 spec US-4 AC1・AC2・AC5。data-model §3 / §4 / §5)。
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
  const { container } = render(
    <RunningSessionStoreContext.Provider value={store}>
      <RunningSessionsHarness />
    </RunningSessionStoreContext.Provider>
  )
  return {
    store,
    container,
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

  it('専用の表示の無い tool (NotebookEdit) のエラーは ToolFallback の閉じた見出しに「エラー」の印が出る', async () => {
    const h = await setup()
    h.emit(
      A,
      toolMessage('NotebookEdit', { notebook_path: '/w/missing.ipynb' }, 'File does not exist.', {
        isError: true
      })
    )
    const root = await shown('tool-fallback-root')
    expect(within(root).getByText(TOOL_RESULT_LABELS.failed)).toBeInTheDocument()
    expect(root.querySelector('[data-slot="tool-fallback-trigger"]')).toHaveAttribute(
      'aria-expanded',
      'false'
    )
  })

  it('専用の表示の無い tool (NotebookEdit) の切り詰めは ToolFallback に「（切り詰め）」が出る', async () => {
    const h = await setup()
    h.emit(
      A,
      toolMessage('NotebookEdit', { notebook_path: '/w/a.ipynb' }, 'a\nb', { truncated: true })
    )
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
    expect(screen.getByRole('button', { name: '生成を止める' })).toBeInTheDocument()
  })
})

describe('API の再試行の行 (O-4 FE-021 / 014 spec US-2 AC4 / FR-007)', () => {
  const retry = (id: string, part: Partial<EventPart>): SessionEvent =>
    eventMessage(id, { category: 'api-retry', ...part })
  const detailOf = (row: HTMLElement | undefined): string | null =>
    row?.querySelector('[data-slot="system-event-detail"]')?.textContent ?? null

  it('回数・HTTP の状態・待ち時間を出し、同じターンの再試行は同じ行で書き換わる', async () => {
    const h = await setup()
    h.emit(A, retry('retry:0', { opens: true, detail: '1/10/529/2000', status: 'retrying' }))
    await waitFor(() => expect(rows()).toHaveLength(1))
    const row = (): HTMLElement | undefined => rows()[0]
    expect(row()).toHaveAttribute('data-category', 'api-retry')
    expect(row()).toHaveTextContent('API の再試行')
    expect(detailOf(row())).toBe('1/10 回目・HTTP 529・2 秒後')
    expect(statusOf(row())).toBe('再試行中')

    // HTTP の状態が無い (接続の失敗など) ときは HTTP の部分を出さない。待ち時間は秒に切り上げる。
    h.emit(A, retry('retry:0', { detail: '2/10/-/4500', status: 'retrying' }))
    await waitFor(() => expect(detailOf(row())).toBe('2/10 回目・5 秒後'))
    expect(rows()).toHaveLength(1)

    // 閉じの更新は detail を持たない (前の detail のまま)。
    h.emit(A, retry('retry:0', { detail: '', status: 'succeeded' }))
    await waitFor(() => expect(statusOf(row())).toBe('成功'))
    expect(detailOf(row())).toBe('2/10 回目・5 秒後')
    expect(rows()).toHaveLength(1)

    // 次のターンの再試行は別の行。
    h.emit(A, retry('retry:1', { opens: true, detail: '1/3/500/1000', status: 'retrying' }))
    await waitFor(() => expect(rows()).toHaveLength(2))
    h.emit(A, retry('retry:1', { detail: '', status: 'failed' }))
    await waitFor(() => expect(statusOf(rows()[1])).toBe('失敗'))
    expect(statusOf(rows()[0])).toBe('成功')
  })

  it('形の合わない detail は出さない (エラーの中身を DOM に出さない)', async () => {
    const h = await setup()
    h.emit(
      A,
      retry('retry:0', {
        opens: true,
        detail: 'LEAK overloaded_error: upstream secret',
        status: 'retrying'
      })
    )
    await waitFor(() => expect(rows()).toHaveLength(1))
    expect(detailOf(rows()[0])).toBeNull()
    expect(statusOf(rows()[0])).toBe('再試行中')
    expect(document.body.textContent).not.toContain('LEAK')
  })

  it('再試行中のまま終わった行は、セッションの終了後に「結果不明」になる', async () => {
    const h = await setup()
    h.emit(A, retry('retry:0', { opens: true, detail: '1/10/529/2000', status: 'retrying' }))
    await waitFor(() => expect(statusOf(rows()[0])).toBe('再試行中'))
    h.pushStatus({ sessionId: A, state: 'done', claudeAlive: false })
    await waitFor(() => expect(statusOf(rows()[0])).toBe(SYSTEM_EVENT_LABELS.outcomeUnknown))
  })

  it('vitest-axe の違反 0 (再試行中と閉じた行)', async () => {
    const h = await setup()
    h.emit(A, retry('retry:0', { opens: true, detail: '1/10/529/2000', status: 'retrying' }))
    h.emit(A, retry('retry:0', { detail: '', status: 'succeeded' }))
    h.emit(A, retry('retry:1', { opens: true, detail: '2/10/-/4000', status: 'retrying' }))
    await waitFor(() => expect(rows()).toHaveLength(2))
    // 見る範囲は transcript の viewport (この harness はフォルダの一覧を読み込まないので、中央のヘッダの題が空になる)。
    const viewport = h.container.querySelector<HTMLElement>('[data-slot="aui_thread-viewport"]')
    expect(viewport).not.toBeNull()
    expect((await axe(viewport!, AXE_RULES)).violations).toEqual([])
  })
})

describe('権限モード・コンテキストの圧縮・task の進み具合の行 (O-4 FE-042 / 014 spec US-4 AC1・AC2・AC5)', () => {
  const detailOf = (row: HTMLElement | undefined): string | null =>
    row?.querySelector('[data-slot="system-event-detail"]')?.textContent ?? null
  const progressOf = (row: HTMLElement | undefined): string | null =>
    row?.querySelector('[data-slot="system-event-progress"]')?.textContent ?? null

  it('権限モードの行: 文言とモードの名前。知らない鍵は「不明なモード」', async () => {
    const h = await setup()
    h.emit(
      A,
      eventMessage('mode:0', {
        category: 'permission-mode',
        opens: true,
        detail: 'bypassPermissions',
        status: 'changed'
      })
    )
    h.emit(
      A,
      eventMessage('mode:1', {
        category: 'permission-mode',
        opens: true,
        detail: '__proto__',
        status: 'changed'
      })
    )
    await waitFor(() => expect(rows()).toHaveLength(2))
    const [first, second] = rows()
    expect(first).toHaveAttribute('data-category', 'permission-mode')
    expect(first).toHaveTextContent('権限モード')
    expect(detailOf(first)).toBe(
      SYSTEM_EVENT_LABELS.permissionModeChanged(PERMISSION_MODE_NAMES.bypassPermissions)
    )
    expect(statusOf(first)).toBe('変更')
    expect(detailOf(second)).toBe('権限モードが「不明なモード」に変わりました')
    // 変わった行は終わった行 (セッションの終了後も「結果不明」にしない)
    h.pushStatus({ sessionId: A, state: 'done', claudeAlive: false })
    await waitFor(() => expect(statusOf(rows()[0])).toBe('変更'))
  })

  it('コンテキストの圧縮の行は「圧縮中」から成功 / 失敗に書き換わり、行は増えない', async () => {
    const h = await setup()
    h.emit(
      A,
      eventMessage('compact:0', { category: 'compaction', opens: true, status: 'compacting' })
    )
    await waitFor(() => expect(rows()).toHaveLength(1))
    expect(rows()[0]).toHaveAttribute('data-category', 'compaction')
    expect(rows()[0]).toHaveTextContent('コンテキストの圧縮')
    expect(statusOf(rows()[0])).toBe('圧縮中')
    expect(detailOf(rows()[0])).toBeNull()
    h.emit(A, eventMessage('compact:0', { category: 'compaction', status: 'succeeded' }))
    await waitFor(() => expect(statusOf(rows()[0])).toBe('成功'))
    expect(rows()).toHaveLength(1)

    h.emit(A, eventMessage('compact:1', { category: 'compaction', opens: true, status: 'failed' }))
    await waitFor(() => expect(rows()).toHaveLength(2))
    expect(statusOf(rows()[1])).toBe('失敗')
    expect(rows()[1]?.querySelector('[data-slot="system-event-status"]')).toHaveAttribute(
      'data-variant',
      'destructive'
    )
  })

  it('圧縮中のまま終わった行は、セッションの終了後に「結果不明」になる', async () => {
    const h = await setup()
    h.emit(
      A,
      eventMessage('compact:0', { category: 'compaction', opens: true, status: 'compacting' })
    )
    await waitFor(() => expect(statusOf(rows()[0])).toBe('圧縮中'))
    h.pushStatus({ sessionId: A, state: 'done', claudeAlive: false })
    await waitFor(() => expect(statusOf(rows()[0])).toBe(SYSTEM_EVENT_LABELS.outcomeUnknown))
  })

  it('task の行に種類が残ったまま進み具合が更新される。進み具合が無ければ種類だけ', async () => {
    const h = await setup()
    h.emit(
      A,
      eventMessage('task:t1', {
        category: 'task',
        opens: true,
        name: 'scan',
        detail: 'local_agent',
        status: 'running'
      })
    )
    await waitFor(() => expect(rows()).toHaveLength(1))
    const row = (): HTMLElement | undefined => rows()[0]
    expect(detailOf(row())).toBe('サブエージェント')
    expect(progressOf(row())).toBeNull()

    h.emit(A, eventMessage('task:t1', { category: 'task', detail: '\n12345/3/4500' }))
    await waitFor(() => expect(progressOf(row())).toBe('約 12,345 トークン・tool 3 回・4 秒'))
    expect(detailOf(row())).toBe('サブエージェント')
    expect(statusOf(row())).toBe('実行中')

    h.emit(A, eventMessage('task:t1', { category: 'task', detail: '\n20000/7/61000' }))
    await waitFor(() => expect(progressOf(row())).toBe('約 20,000 トークン・tool 7 回・61 秒'))
    expect(detailOf(row())).toBe('サブエージェント')
    expect(row()?.querySelector('[data-slot="system-event-name"]')).toHaveTextContent('「scan」')

    // 状態の更新 (detail が空) でも種類と進み具合が残る
    h.emit(A, eventMessage('task:t1', { category: 'task', status: 'completed' }))
    await waitFor(() => expect(statusOf(row())).toBe('完了'))
    expect(detailOf(row())).toBe('サブエージェント')
    expect(progressOf(row())).toBe('約 20,000 トークン・tool 7 回・61 秒')
    expect(rows()).toHaveLength(1)
  })

  it('行の無い task への進み具合は捨てる。復号できない進み具合 (要約・説明の形) は DOM に出さない', async () => {
    const h = await setup()
    h.emit(A, eventMessage('task:ghost', { category: 'task', detail: '\n1/2/3' }))
    h.emit(
      A,
      eventMessage('task:t1', {
        category: 'task',
        opens: true,
        detail: 'local_bash',
        status: 'running'
      })
    )
    await waitFor(() => expect(rows()).toHaveLength(1))
    h.emit(A, eventMessage('task:t1', { category: 'task', detail: '\nLEAK summary: secret plan' }))
    h.emit(A, eventMessage('task:t1', { category: 'task', status: 'running' }))
    await waitFor(() => expect(detailOf(rows()[0])).toBe('シェルのコマンド'))
    expect(progressOf(rows()[0])).toBeNull()
    expect(document.body.textContent).not.toContain('LEAK')
    // 行の無い task (`task:ghost`) の行は作られない
    expect(rows()).toHaveLength(1)
  })

  it('後から背景に移した task の行 (backgrounded-task): 「背景に移した」の印・コマンドの名前・進み具合・名前が空なら種類だけ (O-11 FE-021)', async () => {
    const h = await setup()
    h.emit(
      A,
      eventMessage('task:b1', {
        category: 'backgrounded-task',
        opens: true,
        name: 'npm',
        detail: 'local_bash',
        status: 'running'
      })
    )
    h.emit(
      A,
      eventMessage('task:b2', {
        category: 'backgrounded-task',
        opens: true,
        name: '',
        detail: 'local_bash',
        status: 'running'
      })
    )
    await waitFor(() => expect(rows()).toHaveLength(2))
    const [first, second] = rows()
    expect(first).toHaveAttribute('data-category', 'backgrounded-task')
    expect(first).toHaveTextContent('Background task')
    expect(first?.querySelector('[data-slot="system-event-backgrounded"]')).toHaveTextContent(
      '背景に移した'
    )
    expect(detailOf(first)).toBe('シェルのコマンド')
    expect(first?.querySelector('[data-slot="system-event-name"]')).toHaveTextContent('「npm」')
    // 名前が空なら種類のラベルだけ
    expect(second?.querySelector('[data-slot="system-event-name"]')).toBeNull()
    expect(detailOf(second)).toBe('シェルのコマンド')

    // 進み具合 (category task の更新) が backgrounded-task の行に入る。
    h.emit(A, eventMessage('task:b1', { category: 'task', detail: '\n100/2/3000' }))
    await waitFor(() => expect(progressOf(rows()[0])).toBe('約 100 トークン・tool 2 回・3 秒'))
    expect(rows()[0]).toHaveAttribute('data-category', 'backgrounded-task')
    expect(rows()).toHaveLength(2)
  })

  it('種類ごとにアイコンを分ける (Hook・task・再試行・圧縮・権限モード・認証・プラグイン)', async () => {
    const h = await setup()
    const categories = [
      'hook',
      'task',
      'api-retry',
      'compaction',
      'permission-mode',
      'auth',
      'plugin'
    ] as const
    categories.forEach((category, i) =>
      h.emit(
        A,
        eventMessage(`row:${i}`, { category, opens: true, status: 'succeeded', detail: '' })
      )
    )
    await waitFor(() => expect(rows()).toHaveLength(categories.length))
    const icons = rows().map((row) => row.querySelector('svg')?.getAttribute('class') ?? '')
    for (const icon of icons) {
      expect(icon).not.toBe('')
      expect(rows()[icons.indexOf(icon)]?.querySelector('svg')).toHaveAttribute('aria-hidden')
    }
    expect(new Set(icons).size).toBe(categories.length)
  })

  it('vitest-axe の違反 0 (権限モード・圧縮・進み具合のある task の行)', async () => {
    const h = await setup()
    h.emit(
      A,
      eventMessage('mode:0', {
        category: 'permission-mode',
        opens: true,
        detail: 'acceptEdits',
        status: 'changed'
      })
    )
    h.emit(
      A,
      eventMessage('compact:0', { category: 'compaction', opens: true, status: 'compacting' })
    )
    h.emit(
      A,
      eventMessage('task:t1', {
        category: 'task',
        opens: true,
        detail: 'local_agent',
        status: 'running'
      })
    )
    h.emit(A, eventMessage('task:t1', { category: 'task', detail: '\n100/1/1000' }))
    await waitFor(() => expect(rows()).toHaveLength(3))
    const viewport = h.container.querySelector<HTMLElement>('[data-slot="aui_thread-viewport"]')
    expect(viewport).not.toBeNull()
    expect((await axe(viewport!, AXE_RULES)).violations).toEqual([])
  })
})

describe('認証とプラグインの行 (O-5 FE-030 / 015 spec US-3 AC1〜AC5 / data-model §4)', () => {
  const MARK = 'LEAK_MARK'
  const detailOf = (row: HTMLElement | undefined): string | null =>
    row?.querySelector('[data-slot="system-event-detail"]')?.textContent ?? null
  const guidanceOf = (row: HTMLElement | undefined): string | null =>
    row?.querySelector('[data-slot="system-event-guidance"]')?.textContent ?? null
  const auth = (id: string, part: Partial<EventPart>): SessionEvent =>
    eventMessage(id, { category: 'auth', ...part })
  const plugin = (id: string, part: Partial<EventPart>): SessionEvent =>
    eventMessage(id, { category: 'plugin', ...part })

  it('認証中 → 成功に同じ行が書き換わる (AC1・AC2)', async () => {
    const h = await setup()
    h.emit(A, auth('auth:0', { opens: true, status: 'authenticating' }))
    await waitFor(() => expect(rows()).toHaveLength(1))
    const row = (): HTMLElement | undefined => rows()[0]
    expect(row()).toHaveAttribute('data-category', 'auth')
    expect(row()).toHaveTextContent('認証')
    expect(statusOf(row())).toBe('認証中')
    expect(guidanceOf(row())).toBe(SYSTEM_EVENT_LABELS.authInProgress)
    expect(detailOf(row())).toBeNull()
    h.emit(A, auth('auth:0', { status: 'succeeded' }))
    await waitFor(() => expect(statusOf(row())).toBe('成功'))
    expect(guidanceOf(row())).toBe(SYSTEM_EVENT_LABELS.authSucceeded)
    expect(rows()).toHaveLength(1)
  })

  it('認証中 → 失敗に同じ行が書き換わり、再ログインを案内する (AC3)', async () => {
    const h = await setup()
    h.emit(A, auth('auth:0', { opens: true, status: 'authenticating' }))
    await waitFor(() => expect(rows()).toHaveLength(1))
    h.emit(A, auth('auth:0', { status: 'failed' }))
    await waitFor(() => expect(statusOf(rows()[0])).toBe('失敗'))
    expect(guidanceOf(rows()[0])).toBe(SYSTEM_EVENT_LABELS.authFailed)
    expect(rows()[0]?.querySelector('[data-slot="system-event-status"]')).toHaveAttribute(
      'data-variant',
      'destructive'
    )
    expect(rows()).toHaveLength(1)
  })

  it('output / error の目印が DOM に出ない', async () => {
    const h = await setup()
    const withMarks = (event: SessionEvent): SessionEvent => {
      if (event.kind !== 'message') return event
      const [part] = event.message.parts
      return {
        ...event,
        message: {
          ...event.message,
          parts: [{ ...part, output: [MARK], error: MARK } as unknown as TranscriptPartDTO]
        }
      }
    }
    h.emit(A, withMarks(auth('auth:0', { opens: true, status: 'authenticating' })))
    h.emit(A, withMarks(auth('auth:0', { status: 'failed' })))
    h.emit(A, withMarks(plugin('plugin:0', { opens: true, detail: '0/0/', status: 'started' })))
    h.emit(A, auth('auth:1', { opens: true, status: 'authenticating' }))
    await waitFor(() => expect(rows().length).toBeGreaterThan(0))
    expect(document.body.textContent).not.toContain(MARK)
  })

  it('「認証中」のまま終わった行は「結果不明」になり、ログインの案内を出さない (AC4)', async () => {
    const h = await setup()
    h.emit(A, auth('auth:0', { opens: true, status: 'authenticating' }))
    await waitFor(() => expect(statusOf(rows()[0])).toBe('認証中'))
    h.pushStatus({ sessionId: A, state: 'done', claudeAlive: false })
    await waitFor(() => expect(statusOf(rows()[0])).toBe(SYSTEM_EVENT_LABELS.outcomeUnknown))
    expect(guidanceOf(rows()[0])).toBeNull()
  })

  it('プラグインの行が 1 つで進み具合が書き換わる (AC5)', async () => {
    const h = await setup()
    h.emit(A, plugin('plugin:0', { opens: true, detail: '0/0/acme', status: 'started' }))
    await waitFor(() => expect(rows()).toHaveLength(1))
    const row = (): HTMLElement | undefined => rows()[0]
    expect(row()).toHaveAttribute('data-category', 'plugin')
    expect(row()).toHaveTextContent('プラグイン')
    expect(detailOf(row())).toBe(`${SYSTEM_EVENT_LABELS.pluginInstalling}・「acme」`)
    expect(statusOf(row())).toBe('実行中')

    h.emit(A, plugin('plugin:0', { detail: '2/0/acme' }))
    await waitFor(() =>
      expect(detailOf(row())).toBe(
        `${SYSTEM_EVENT_LABELS.pluginInstalling}・${SYSTEM_EVENT_LABELS.pluginInstalled(2)}・「acme」`
      )
    )
    h.emit(A, plugin('plugin:0', { detail: '2/1/other', status: 'failed' }))
    await waitFor(() => expect(statusOf(row())).toBe('失敗'))
    expect(detailOf(row())).toBe(
      `${SYSTEM_EVENT_LABELS.pluginInstalled(2)}・${SYSTEM_EVENT_LABELS.pluginFailed(1)}・「other」`
    )
    expect(rows()).toHaveLength(1)

    h.emit(A, plugin('plugin:1', { opens: true, detail: '0/0/', status: 'started' }))
    h.emit(A, plugin('plugin:1', { detail: '3/0/', status: 'completed' }))
    await waitFor(() => expect(statusOf(rows()[1])).toBe('完了'))
    expect(detailOf(rows()[1])).toBe(SYSTEM_EVENT_LABELS.pluginInstalled(3))
  })

  it('形の合わないプラグインの detail・名前は出さない', async () => {
    const h = await setup()
    h.emit(A, plugin('plugin:0', { opens: true, detail: `${MARK} error text`, status: 'started' }))
    h.emit(A, plugin('plugin:1', { opens: true, detail: '1/0/a b', status: 'started' }))
    await waitFor(() => expect(rows()).toHaveLength(2))
    expect(detailOf(rows()[0])).toBeNull()
    expect(detailOf(rows()[1])).toBe(
      `${SYSTEM_EVENT_LABELS.pluginInstalling}・${SYSTEM_EVENT_LABELS.pluginInstalled(1)}`
    )
    expect(document.body.textContent).not.toContain(MARK)
  })

  it('「認証中」を経ない失敗で「認証に失敗」の行と再ログインの案内が 1 つ出る (AC3。FE-031)', async () => {
    const h = await setup()
    h.emit(A, auth('auth:0', { opens: true, status: 'failed' }))
    await waitFor(() => expect(rows()).toHaveLength(1))
    expect(rows()[0]).toHaveAttribute('data-category', 'auth')
    expect(statusOf(rows()[0])).toBe('失敗')
    expect(guidanceOf(rows()[0])).toBe(SYSTEM_EVENT_LABELS.authFailed)
    h.pushStatus({ sessionId: A, state: 'done', claudeAlive: false })
    await waitFor(() => expect(statusOf(rows()[0])).toBe('失敗'))
    expect(rows()).toHaveLength(1)
  })

  it('started を経ないプラグインの結果で行が 1 つ出て、同じ行が書き換わる (AC6。FE-031)', async () => {
    const h = await setup()
    h.emit(A, plugin('plugin:0', { opens: true, detail: '1/0/acme', status: 'started' }))
    await waitFor(() => expect(rows()).toHaveLength(1))
    expect(detailOf(rows()[0])).toBe(
      `${SYSTEM_EVENT_LABELS.pluginInstalling}・${SYSTEM_EVENT_LABELS.pluginInstalled(1)}・「acme」`
    )
    h.emit(A, plugin('plugin:0', { detail: '1/0/acme', status: 'completed' }))
    await waitFor(() => expect(statusOf(rows()[0])).toBe('完了'))
    expect(rows()).toHaveLength(1)

    h.emit(A, plugin('plugin:1', { opens: true, detail: '0/0/', status: 'completed' }))
    await waitFor(() => expect(rows()).toHaveLength(2))
    expect(rows()[1]).toHaveAttribute('data-category', 'plugin')
    expect(statusOf(rows()[1])).toBe('完了')
  })

  it('vitest-axe の違反 0 (単独の結果の行。FE-031)', async () => {
    const h = await setup()
    h.emit(A, auth('auth:0', { opens: true, status: 'failed' }))
    h.emit(A, plugin('plugin:0', { opens: true, detail: '0/1/acme', status: 'started' }))
    h.emit(A, plugin('plugin:1', { opens: true, detail: '0/0/', status: 'completed' }))
    await waitFor(() => expect(rows()).toHaveLength(3))
    const viewport = h.container.querySelector<HTMLElement>('[data-slot="aui_thread-viewport"]')
    expect(viewport).not.toBeNull()
    expect((await axe(viewport!, AXE_RULES)).violations).toEqual([])
  })

  it('vitest-axe の違反 0 (認証とプラグインの行)', async () => {
    const h = await setup()
    h.emit(A, auth('auth:0', { opens: true, status: 'authenticating' }))
    h.emit(A, auth('auth:1', { opens: true, status: 'failed' }))
    h.emit(A, plugin('plugin:0', { opens: true, detail: '1/1/acme', status: 'started' }))
    await waitFor(() => expect(rows()).toHaveLength(3))
    const viewport = h.container.querySelector<HTMLElement>('[data-slot="aui_thread-viewport"]')
    expect(viewport).not.toBeNull()
    expect((await axe(viewport!, AXE_RULES)).violations).toEqual([])
  })
})

describe('会話の境界と拒否・知らせの行 (O-6 FE-011 / 016 spec US-1)', () => {
  const boundaries = (): HTMLElement[] =>
    Array.from(document.querySelectorAll<HTMLElement>('[data-slot="aui_transcript-boundary"]'))
  const detailOf = (row: HTMLElement | undefined): string | null =>
    row?.querySelector('[data-slot="system-event-detail"]')?.textContent ?? null

  it('圧縮の境界: 手動 / 自動とトークン数を見出しに出し、状態の文言は出さない', async () => {
    const h = await setup()
    h.emit(
      A,
      eventMessage('compact-boundary:u1', {
        category: 'compact-boundary',
        opens: true,
        detail: 'manual 120000 8000',
        status: 'marked'
      })
    )
    h.emit(
      A,
      eventMessage('compact-boundary:u2', {
        category: 'compact-boundary',
        opens: true,
        detail: 'auto - -',
        status: 'marked'
      })
    )
    await waitFor(() => expect(boundaries()).toHaveLength(2))
    expect(boundaries()[0]).toHaveTextContent(
      'ここでコンテキストを圧縮しました (手動、120,000 → 8,000 トークン)'
    )
    expect(boundaries()[1]).toHaveTextContent('ここでコンテキストを圧縮しました (自動)')
    expect(rows()).toHaveLength(0)
  })

  it('会話の作り直しの境界は「ここから新しい会話です」', async () => {
    const h = await setup()
    h.emit(
      A,
      eventMessage('reset:u1', { category: 'conversation-reset', opens: true, status: 'marked' })
    )
    await waitFor(() => expect(boundaries()).toHaveLength(1))
    expect(boundaries()[0]).toHaveTextContent('ここから新しい会話です')
  })

  it('拒否して別のモデルへ切り替えた行: モデル名・この応答だけ・分類の訳・説明', async () => {
    const h = await setup()
    h.emit(
      A,
      eventMessage('refusal:u1', {
        category: 'refusal',
        opens: true,
        name: 'claude-haiku-4-5',
        detail: 'forward local cyber 理由の説明です',
        status: 'fallback'
      })
    )
    await waitFor(() => expect(rows()).toHaveLength(1))
    const text = rows()[0]?.textContent ?? ''
    expect(text).toContain('claude-haiku-4-5')
    expect(text).toContain('この応答だけ')
    expect(text).toContain('サイバーセキュリティ')
    expect(text).toContain('理由の説明です')
  })

  it('知らない分類は出さず、説明が無ければ説明の段も出ない', async () => {
    const h = await setup()
    h.emit(
      A,
      eventMessage('refusal:u2', {
        category: 'refusal',
        opens: true,
        name: '',
        detail: 'forward session weird',
        status: 'fallback'
      })
    )
    await waitFor(() => expect(rows()).toHaveLength(1))
    const text = rows()[0]?.textContent ?? ''
    expect(text).not.toContain('weird')
    expect(text).not.toContain('分類')
    expect(text).toContain('別のモデル')
  })

  it('切り替え先が無い拒否の行: 言い直して送り直せる旨と本文', async () => {
    const h = await setup()
    h.emit(
      A,
      eventMessage('refusal:u3', {
        category: 'refusal',
        opens: true,
        name: 'bio',
        detail: '本文です',
        status: 'no-fallback'
      })
    )
    await waitFor(() => expect(rows()).toHaveLength(1))
    const text = rows()[0]?.textContent ?? ''
    expect(text).toContain('言い直して送り直せます')
    expect(text).toContain('生物・化学')
    expect(text).toContain('本文です')
  })

  it('知らせの行: ここで止まりました / 注意 / 知らせ。notice は状態の文言を出さない', async () => {
    const h = await setup()
    for (const [id, status] of [
      ['info:1', 'prevented'],
      ['info:2', 'warning'],
      ['info:3', 'notice']
    ] as const) {
      h.emit(
        A,
        eventMessage(id, {
          category: 'informational',
          opens: true,
          name: '',
          detail: `本文 ${id}`,
          status
        })
      )
    }
    await waitFor(() => expect(rows()).toHaveLength(3))
    expect(statusOf(rows()[0])).toBe('ここで止まりました')
    expect(statusOf(rows()[1])).toBe('注意')
    expect(statusOf(rows()[2])).toBe('')
    expect(detailOf(rows()[0]) ?? rows()[0]?.textContent).toContain('本文 info:1')
  })

  it('同じ id の知らせは行が増えず、書き換わる', async () => {
    const h = await setup()
    h.emit(
      A,
      eventMessage('info:t1', {
        category: 'informational',
        opens: true,
        detail: '最初',
        status: 'notice'
      })
    )
    await waitFor(() => expect(rows()).toHaveLength(1))
    h.emit(
      A,
      eventMessage('info:t1', { category: 'informational', detail: '次', status: 'warning' })
    )
    await waitFor(() => expect(statusOf(rows()[0])).toBe('注意'))
    expect(rows()).toHaveLength(1)
  })

  it('境界と拒否・知らせの行に a11y の違反が無い', async () => {
    const h = await setup()
    h.emit(
      A,
      eventMessage('compact-boundary:ax', {
        category: 'compact-boundary',
        opens: true,
        detail: 'manual 10 5',
        status: 'marked'
      })
    )
    h.emit(
      A,
      eventMessage('refusal:ax', {
        category: 'refusal',
        opens: true,
        name: 'claude-haiku-4-5',
        detail: 'forward local cyber 説明',
        status: 'fallback'
      })
    )
    h.emit(
      A,
      eventMessage('info:ax', {
        category: 'informational',
        opens: true,
        detail: '本文',
        status: 'prevented'
      })
    )
    await waitFor(() => expect(rows()).toHaveLength(2))
    expect(boundaries()).toHaveLength(1)
    const viewport = h.container.querySelector<HTMLElement>('[data-slot="aui_thread-viewport"]')
    expect(viewport).not.toBeNull()
    expect((await axe(viewport!, AXE_RULES)).violations).toEqual([])
  })
})

describe('MCP の手続きの行 (O-10 FE-022 / 018 data-model §5)', () => {
  it('サーバー名つきの文を出し、名前を別の「」で重ねない・名前が空なら「MCP サーバー」・axe', async () => {
    const h = await setup()
    h.emit(
      A,
      eventMessage('elicitation:e1', {
        category: 'elicitation',
        opens: true,
        name: 'github',
        detail: '',
        status: 'completed'
      })
    )
    h.emit(
      A,
      eventMessage('elicitation:e2', {
        category: 'elicitation',
        opens: true,
        name: '',
        detail: '',
        status: 'completed'
      })
    )
    h.emit(
      A,
      eventMessage('hook:e3', {
        category: 'hook',
        opens: true,
        name: 'h',
        detail: 'Stop',
        status: 'succeeded'
      })
    )
    await waitFor(() => expect(rows()).toHaveLength(3))
    const text0 = rows()[0]?.textContent ?? ''
    expect(text0).toContain('MCP の手続き')
    expect(text0).toContain('github の URL での手続きが終わりました')
    expect(text0).not.toContain('「github」')
    expect(rows()[1]?.textContent ?? '').toContain('MCP サーバー の URL での手続きが終わりました')
    // 既存の種類の行は変わらない (回帰)。
    expect(rows()[2]?.textContent ?? '').toContain('「h」')
    const viewport = h.container.querySelector<HTMLElement>('[data-slot="aui_thread-viewport"]')
    expect((await axe(viewport!, AXE_RULES)).violations).toEqual([])
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

describe('拒否の行の「編集して再試行」 (O-10 FE-040 / 018 spec US-4 / SC-008)', () => {
  const refusal = (status: 'no-fallback' | 'no-fallback-retry'): SessionEvent =>
    eventMessage('refusal:r1', {
      category: 'refusal',
      opens: true,
      name: 'bio',
      detail: '本文です',
      status
    })
  const composer = (): HTMLTextAreaElement =>
    screen.getByRole('textbox', { name: 'メッセージ' }) as HTMLTextAreaElement

  it('no-fallback-retry で出て、空の composer に文が入り、フォーカスが移り、送られない', async () => {
    const h = await setup()
    act(() => h.store.appendUser(A, '拒否された文'))
    h.emit(A, refusal('no-fallback-retry'))
    const button = await screen.findByRole('button', { name: '編集して再試行' })
    await userEvent.click(button)
    await waitFor(() => expect(composer().value).toBe('拒否された文'))
    expect(document.activeElement).toBe(composer())
    expect(document.body.textContent).not.toContain('refused_user_message_uuid')
  })

  it('no-fallback・前に入力が無いときは出さない', async () => {
    const h = await setup()
    h.emit(A, refusal('no-fallback'))
    await waitFor(() => expect(rows()).toHaveLength(1))
    expect(screen.queryByRole('button', { name: '編集して再試行' })).toBeNull()
    h.emit(
      A,
      eventMessage('refusal:r2', {
        category: 'refusal',
        opens: true,
        name: '',
        detail: '',
        status: 'no-fallback-retry'
      })
    )
    await waitFor(() => expect(rows()).toHaveLength(2))
    expect(screen.queryByRole('button', { name: '編集して再試行' })).toBeNull()
  })

  it('下書きがあると dialog。既定のフォーカスは「取り消す」で、取り消すと下書きがそのまま', async () => {
    const h = await setup()
    act(() => h.store.appendUser(A, '拒否された文'))
    h.emit(A, refusal('no-fallback-retry'))
    await userEvent.type(composer(), '書きかけ')
    await userEvent.click(await screen.findByRole('button', { name: '編集して再試行' }))
    const cancel = await screen.findByRole('button', { name: '取り消す' })
    await waitFor(() => expect(document.activeElement).toBe(cancel))
    await userEvent.click(cancel)
    await waitFor(() => expect(screen.queryByRole('button', { name: '取り消す' })).toBeNull())
    expect(composer().value).toBe('書きかけ')
  })

  it('下書きがあって「置き換える」で文が入る', async () => {
    const h = await setup()
    act(() => h.store.appendUser(A, '拒否された文'))
    h.emit(A, refusal('no-fallback-retry'))
    await userEvent.type(composer(), '書きかけ')
    await userEvent.click(await screen.findByRole('button', { name: '編集して再試行' }))
    await userEvent.click(await screen.findByRole('button', { name: '置き換える' }))
    await waitFor(() => expect(composer().value).toBe('拒否された文'))
  })
})

describe('O-12 知らせの類の行 (FE-010)', () => {
  const detailOf = (row: HTMLElement | undefined): string | null =>
    row?.querySelector('[data-slot="system-event-detail"]')?.textContent ?? null
  const headingOf = (row: HTMLElement | undefined): string =>
    row?.querySelector('span.font-medium')?.textContent ?? ''
  const tone = (row: HTMLElement | undefined): string | null | undefined =>
    row?.getAttribute('data-tone')

  it('7 つの見出し・tone・状態の文言', async () => {
    const h = await setup()
    const emit = (id: string, part: Partial<EventPart>): void =>
      h.emit(A, eventMessage(id, { opens: true, name: '', ...part }))
    emit('notification:a', { category: 'notification', detail: '注意の通知', status: 'warning' })
    emit('notification:b', { category: 'notification', detail: '通常の通知', status: 'notice' })
    emit('local-command:1', { category: 'local-command-output', detail: '出力', status: 'notice' })
    emit('memory:1', {
      category: 'memory-recall',
      detail: 'select 4 2 1 1 1',
      status: 'notice',
      name: 'a.md\nb.md'
    })
    emit('mirror-error:1', { category: 'mirror-error', detail: 'boom', status: 'failed' })
    emit('summary:1', { category: 'tool-use-summary', detail: '要約', status: 'notice' })
    emit('goal:1', { category: 'active-goal', detail: 'ship', status: 'notice' })
    emit('goal:2', { category: 'active-goal', detail: '', status: 'completed' })
    emit('files-persisted:1', {
      category: 'files-persisted',
      detail: '1 1 no space',
      status: 'failed',
      name: 'a\nb'
    })
    emit('files-persisted:2', {
      category: 'files-persisted',
      detail: '2 0',
      status: 'completed',
      name: 'c'
    })
    await waitFor(() => expect(rows()).toHaveLength(10))
    const r = rows()
    expect(r.map(headingOf)).toEqual([
      '通知',
      '通知',
      'コマンドの出力',
      'メモリを読み込みました',
      '記録の同期に失敗しました',
      'tool の要約',
      '目標',
      '目標を解除しました',
      'ファイルを保存しました',
      'ファイルを保存しました'
    ])
    expect(tone(r[0])).toBe('attention')
    expect(statusOf(r[0])).toBe('注意')
    expect(tone(r[1])).toBe('quiet')
    expect(statusOf(r[1])).toBe('')
    expect(detailOf(r[3])).toBe('4 件 (個人 2・チーム 1・組織 1・要約 1)')
    expect(r[3]?.querySelectorAll('[data-slot="system-event-names"] li')).toHaveLength(2)
    expect(tone(r[4])).toBe('attention')
    expect(statusOf(r[7])).toBe('')
    expect(detailOf(r[8])).toBe('保存 1 件・失敗 1 件 (no space)')
    expect(tone(r[8])).toBe('attention')
    expect(tone(r[9])).toBe('quiet')
    expect(statusOf(r[9])).toBe('')
    // files-persisted に操作 (ボタン・リンク) を置かない (FR-006)。
    for (const row of [r[8], r[9]]) {
      expect(row?.querySelectorAll('button, a')).toHaveLength(0)
    }
  })

  it('名前の列の「ほか N 件」と、同じ key の通知が 1 行に書き換わる。a11y の違反が無い', async () => {
    const h = await setup()
    const names = [...Array.from({ length: 20 }, (_, i) => `f${i}`), '+3'].join('\n')
    h.emit(
      A,
      eventMessage('files-persisted:many', {
        category: 'files-persisted',
        opens: true,
        detail: '23 0',
        status: 'completed',
        name: names
      })
    )
    h.emit(
      A,
      eventMessage('notification:k', {
        category: 'notification',
        opens: true,
        detail: '最初',
        status: 'notice'
      })
    )
    await waitFor(() => expect(rows()).toHaveLength(2))
    h.emit(
      A,
      eventMessage('notification:k', { category: 'notification', detail: '次', status: 'warning' })
    )
    await waitFor(() => expect(statusOf(rows()[1])).toBe('注意'))
    expect(rows()).toHaveLength(2)
    expect(rows()[0]?.textContent).toContain('ほか 3 件')
    expect(rows()[0]?.querySelectorAll('[data-slot="system-event-names"] li')).toHaveLength(21)
    const viewport = h.container.querySelector<HTMLElement>('[data-slot="aui_thread-viewport"]')
    expect(viewport).not.toBeNull()
    expect((await axe(viewport!, AXE_RULES)).violations).toEqual([])
  })
})
