import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'

import { SESSION_PORT_MESSAGE, TRANSCRIPT_PORT_MESSAGE } from '@domain/capability'
import type { SessionEvent } from '@domain/session/agent-session'
import type { SessionResumeRequest } from '@domain/session/resume'
import type { TranscriptMessageDTO } from '@domain/session/transcript-dto'

import { TOOL_RESULT_LABELS } from '@/features/chat/labels'
import { installCapability } from '@/test-support/capability'
import { RunningSessionsHarness } from '@/test-support/running-sessions-harness'

import { APPROVAL_CARD_LABELS, OLDER_MESSAGES_LABELS, RESUME_LABELS } from './labels'
import { RunningSessionStoreContext } from './running-session-context'
import { createRunningSessionStore, type RunningSessionStore } from './running-session-store'
import { DEFAULT_EXTRA_AXES } from '@domain/session/launch-config'

/**
 * X-9 FE-040 — それまでの会話の表示 (spec SC-007 / US-4 AC1〜AC3。data-model §8.2 / research R-09)。
 * 読み取った本文 → ストアの先頭への挿入 → 実行中の Chat の描画までを本物で通す。
 */

const AXE_RULES = { rules: { 'color-contrast': { enabled: false } } }
const B = '22222222-2222-4222-8222-222222222222'
const C = '33333333-3333-4333-8333-333333333333'

const REQUEST: SessionResumeRequest = {
  source: { kind: 'past', targetKey: 'target-1', conversationId: C },
  config: {
    folderId: 'f1',
    runtimeId: 'wsl:Ubuntu',
    providerId: null,
    modelId: null,
    effort: null,
    permissionMode: 'default',
    ...DEFAULT_EXTRA_AXES,
    sessionName: null
  }
}

interface FakePort {
  onmessage: ((event: { data: unknown }) => void) | null
  start: () => void
  close: () => void
}

function deliver(data: unknown): FakePort {
  const port: FakePort = { onmessage: null, start: vi.fn(), close: vi.fn() }
  const event = new Event('message') as Event & { data: unknown; ports: unknown[] }
  event.data = data
  event.ports = [port]
  Object.defineProperty(event, 'origin', { value: window.location.origin })
  Object.defineProperty(event, 'source', { value: window })
  window.dispatchEvent(event)
  return port
}

const user = (id: string, text: string): TranscriptMessageDTO => ({
  id,
  role: 'user',
  parts: [{ type: 'text', text }],
  createdAt: null
})

const bashWithoutResult = (id: string): TranscriptMessageDTO => ({
  id,
  role: 'assistant',
  parts: [
    {
      type: 'tool-call',
      toolCallId: `call-${id}`,
      toolName: 'Bash',
      argsText: JSON.stringify({ command: 'ls' }),
      result: null,
      isError: false,
      truncated: false,
      children: []
    }
  ],
  createdAt: null
})

let detach: (() => void) | null = null
afterEach(() => {
  detach?.()
  detach = null
})

interface Harness {
  readonly store: RunningSessionStore
  readonly container: HTMLElement
  readonly live: (event: SessionEvent) => void
}

/** 再開を受け付けて、`history` を読み取りの port で渡し、中央に出す。 */
async function setup(history: readonly TranscriptMessageDTO[]): Promise<Harness> {
  const cap = installCapability({
    listFolders: () => new Promise<never>(() => undefined),
    listRuntimes: () => new Promise<never>(() => undefined),
    resumeSession: vi.fn(async () => ({ status: 'launching' as const, sessionId: B })),
    getResumedTranscript: vi.fn(async (_id: string, token: string) => ({
      status: 'streaming' as const,
      requestToken: token
    })),
    sendPrompt: vi.fn(async () => {}),
    interruptSession: vi.fn(async () => {}),
    onSessionStatus: () => () => {},
    onSessionResumable: () => () => {}
  })
  const store = createRunningSessionStore(() => cap)
  detach = store.attach(window)
  await store.resume(REQUEST, null, 'manual')
  const livePort = deliver({ marker: SESSION_PORT_MESSAGE, sessionId: B })
  const token = String(vi.mocked(cap.getResumedTranscript).mock.calls[0]?.[1])
  const { container } = render(
    <RunningSessionStoreContext.Provider value={store}>
      <RunningSessionsHarness />
    </RunningSessionStoreContext.Provider>
  )
  act(() => {
    const port = deliver({ marker: TRANSCRIPT_PORT_MESSAGE, requestToken: token })
    port.onmessage?.({ data: { kind: 'messages', requestToken: token, messages: history } })
  })
  return {
    store,
    container,
    live: (event) => act(() => livePort.onmessage?.({ data: JSON.stringify(event) }))
  }
}

const toolStates = (): string[] =>
  Array.from(document.querySelectorAll<HTMLElement>('[data-slot="tool-result-state"]')).map(
    (el) => el.textContent ?? ''
  )

describe('再開した行のそれまでの会話 (FE-040 / SC-007)', () => {
  it('それまでの会話が先頭に出て、区切りの行がその下、新しいメッセージがさらに下に並ぶ', async () => {
    const h = await setup([user('m1', '前の質問')])
    await screen.findAllByText('前の質問')
    expect(screen.getAllByText(RESUME_LABELS.resumedDivider).length).toBeGreaterThan(0)
    h.live({ kind: 'message', message: user('new-1', '新しい質問') })
    await screen.findAllByText('新しい質問')
    const divider = screen.getAllByText(RESUME_LABELS.resumedDivider)[0] as HTMLElement
    const FOLLOWING = Node.DOCUMENT_POSITION_FOLLOWING
    // 地図などに同じ文字列が重ねて出ることがあるので、区切りの行を境に「前に 1 つ・後に 1 つ」あれば並びは正しい
    const beforeDivider = screen
      .getAllByText('前の質問')
      .some((el) => el.compareDocumentPosition(divider) & FOLLOWING)
    const afterDivider = screen
      .getAllByText('新しい質問')
      .some((el) => divider.compareDocumentPosition(el) & FOLLOWING)
    expect(beforeDivider).toBe(true)
    expect(afterDivider).toBe(true)
  })

  it('窓は新しいメッセージを含む末尾 100 件で、「さらに表示」でそれまでの会話に辿れる', async () => {
    const history = Array.from({ length: 130 }, (_, i) => user(`m${i}`, `履歴-${i}-end`))
    const h = await setup(history)
    // 130 件 + 区切りの行 1 = 131 件。窓 100 件の外は 31 件 (保持は全件)。
    expect(h.store.getState().sessions[B]?.messages).toHaveLength(131)
    const older = await screen.findByTestId('older-messages')
    expect(older).toHaveTextContent(OLDER_MESSAGES_LABELS.showMore)
    expect(older).toHaveTextContent('31')
    await userEvent.click(screen.getByRole('button', { name: OLDER_MESSAGES_LABELS.showMore }))
    await waitFor(() => expect(screen.queryByTestId('older-messages')).toBeNull())
    expect(h.store.getState().sessions[B]?.messages).toHaveLength(131)
  })

  it('結果の無い tool は「結果不明」で描く (最初のプロンプトの前と後の両方)', async () => {
    const h = await setup([bashWithoutResult('a1')])
    await waitFor(() => expect(toolStates()).toEqual([TOOL_RESULT_LABELS.unknown]))
    // 最初のプロンプトの後 (応答中)。それまでの会話は前のターンなので「結果待ち」にならない。
    act(() => h.store.appendUser(B, '続きをお願い'))
    h.live({ kind: 'state', state: 'running' })
    await screen.findByText('続きをお願い')
    expect(toolStates()).toEqual([TOOL_RESULT_LABELS.unknown])
  })

  it('それまでの会話に承認・編集・再生成の操作が出ない', async () => {
    await setup([user('m1', '前の質問'), bashWithoutResult('a1')])
    await screen.findByText('前の質問')
    expect(screen.queryByRole('button', { name: APPROVAL_CARD_LABELS.allow })).toBeNull()
    expect(screen.queryByRole('button', { name: APPROVAL_CARD_LABELS.deny })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Refresh' })).toBeNull()
    expect(screen.queryByRole('button', { name: '編集して再試行' })).toBeNull()
  })

  it('読み取りの失敗で失敗の 1 行が出て、composer は使える', async () => {
    const cap = installCapability({
      listFolders: () => new Promise<never>(() => undefined),
      listRuntimes: () => new Promise<never>(() => undefined),
      resumeSession: vi.fn(async () => ({ status: 'launching' as const, sessionId: B })),
      getResumedTranscript: vi.fn(async (_id: string, token: string) => ({
        status: 'failed' as const,
        requestToken: token,
        reasonKey: 'transcript-read-failed' as const
      })),
      onSessionStatus: () => () => {},
      onSessionResumable: () => () => {}
    })
    const store = createRunningSessionStore(() => cap)
    detach = store.attach(window)
    await store.resume(REQUEST, null, 'manual')
    render(
      <RunningSessionStoreContext.Provider value={store}>
        <RunningSessionsHarness />
      </RunningSessionStoreContext.Provider>
    )
    await screen.findByText(RESUME_LABELS.resumedLoadFailed)
    expect(screen.getByRole('textbox', { name: 'メッセージ' })).toBeEnabled()
  })

  it('0 件は区切りの行だけ', async () => {
    await setup([])
    await screen.findByText(RESUME_LABELS.resumedDivider)
  })

  it('vitest-axe の違反 0 (それまでの会話・区切りの行・新しいメッセージ)', async () => {
    const h = await setup([user('m1', '前の質問'), bashWithoutResult('a1')])
    h.live({ kind: 'message', message: user('new-1', '新しい質問') })
    await screen.findByText('新しい質問')
    const viewport = h.container.querySelector<HTMLElement>('[data-slot="aui_thread-viewport"]')
    expect(viewport).not.toBeNull()
    expect((await axe(viewport!, AXE_RULES)).violations).toEqual([])
  })
})
