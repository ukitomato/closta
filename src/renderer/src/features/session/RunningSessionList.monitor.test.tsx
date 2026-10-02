import { Profiler } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import {
  AssistantRuntimeProvider,
  useExternalStoreRuntime,
  type ThreadMessageLike
} from '@assistant-ui/react'

import { SESSION_PORT_MESSAGE } from '@domain/capability'
import type { SessionEvent } from '@domain/session/agent-session'
import type { SessionStatusUpdate } from '@domain/session/status-update'

import { useUiStore } from '@/stores/ui'
import { stubCapability } from '@/test-support/capability'

import { useRunningThreadList } from './useRunningThreadList'
import { createRunningSessionStore, type RunningSessionStore } from './running-session-store'
import { RunningSessionList } from './RunningSessionList'
import { RunningSessionStoreContext } from './running-session-context'
import { SessionAttentionAnnouncer } from './SessionAttentionAnnouncer'
import { SessionNavBadge } from './SessionNavBadge'

/**
 * O-1 FE-003 / FE-012 / FE-022 — 監視ビュー (一覧の見出し・強調・経過時間・直近の活動・密度・ナビ・読み上げ)。
 * SC-001 / SC-002 / SC-003 (component 側) / SC-006。
 */

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
const C = '33333333-3333-4333-8333-333333333333'

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

function Harness(): React.JSX.Element {
  const threadList = useRunningThreadList((id) => (id === 'f2' ? '案件B' : '案件A'))
  const runtime = useExternalStoreRuntime({
    messages: [] as ThreadMessageLike[],
    isDisabled: true,
    convertMessage: (m: ThreadMessageLike) => m,
    onNew: async () => {},
    adapters: { threadList }
  })
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <RunningSessionList runtimeName={() => 'Ubuntu'} />
    </AssistantRuntimeProvider>
  )
}

interface Setup {
  readonly store: RunningSessionStore
  readonly ports: Record<string, FakePort>
  readonly push: (u: readonly SessionStatusUpdate[]) => void
  readonly emit: (id: string, event: SessionEvent) => void
  readonly renders: { count: number }
}

let detach: (() => void) | null = null
afterEach(() => {
  detach?.()
  detach = null
  vi.useRealTimers()
  useUiStore.setState({ screen: 'runtimes' })
})

async function setup(ids: readonly string[], extra?: React.ReactNode): Promise<Setup> {
  let listener: ((u: readonly SessionStatusUpdate[]) => void) | null = null
  const launch = vi.fn()
  for (const id of ids) launch.mockResolvedValueOnce({ status: 'launching', sessionId: id })
  const cap = stubCapability({
    launchSession: launch,
    killSession: vi.fn(async () => {}),
    endSession: vi.fn(async () => {}),
    interruptSession: vi.fn(async () => {}),
    onSessionStatus: (l) => {
      listener = l
      return () => {}
    }
  })
  const store = createRunningSessionStore(() => cap)
  detach = store.attach(window)
  const ports: Record<string, FakePort> = {}
  for (const [i, id] of ids.entries()) {
    await store.launch(
      {
        folderId: i === 1 ? 'f2' : 'f1',
        runtimeId: 'wsl:Ubuntu',
        providerId: null,
        modelId: null,
        effort: null,
        permissionMode: 'default'
      },
      i === 1 ? '案件B' : '案件A'
    )
    const port: FakePort = { onmessage: null, start: () => {}, close: () => {} }
    deliverPort(id, port)
    ports[id] = port
  }
  const renders = { count: 0 }
  render(
    <RunningSessionStoreContext.Provider value={store}>
      <Profiler id="list" onRender={() => (renders.count += 1)}>
        <Harness />
      </Profiler>
      <SessionNavBadge />
      <SessionAttentionAnnouncer />
      {extra}
    </RunningSessionStoreContext.Provider>
  )
  return {
    store,
    ports,
    renders,
    push: (u) => act(() => listener?.(u)),
    emit: (id, event) => act(() => ports[id]?.onmessage?.({ data: JSON.stringify(event) }))
  }
}

const st = (sessionId: string, over: Partial<SessionStatusUpdate> = {}): SessionStatusUpdate => ({
  sessionId,
  state: 'running',
  reasonKey: null,
  claudeAlive: true,
  ...over
})

const rowOf = async (name: string): Promise<HTMLElement> => {
  const rows = await screen.findAllByRole('listitem')
  const row = rows.find((r) => within(r).queryByText(name) !== null)
  if (row === undefined) throw new Error(`row ${name}`)
  return row
}

const awaitingButton = (): HTMLElement => screen.getByTestId('awaiting-count')

describe('承認待ちと失敗の強調・件数 (FE-003 / SC-001)', () => {
  it('表示中以外が承認待ちになると行が強調され、見出しとナビの件数が 1 になり、並びは変わらない', async () => {
    const s = await setup([A, B])
    s.emit(A, { kind: 'state', state: 'awaiting_permission' })
    const rowA = await rowOf('案件A')
    const status = within(rowA).getByTestId('session-row-status')
    expect(status).toHaveAttribute('data-attention', 'approval')
    expect(status).toHaveTextContent('承認待ち')
    expect(awaitingButton()).toHaveTextContent('承認待ち 1 件')
    expect(screen.getByTestId('session-nav-awaiting')).toHaveTextContent('承認待ち 1 件')
    const names = screen
      .getAllByRole('listitem')
      .map((r) => (within(r).queryByText('案件A') ? 'A' : 'B'))
    expect(names).toEqual(['A', 'B'])
  })

  it('件数を押すと先に承認待ちになった方へ移り、もう一度押すと次へ移る。表示中しか無ければ押せず理由が読める', async () => {
    const s = await setup([A, B, C])
    s.emit(B, { kind: 'state', state: 'awaiting_permission' })
    await new Promise((r) => setTimeout(r, 5))
    s.emit(A, { kind: 'state', state: 'awaiting_permission' })
    await userEvent.click(awaitingButton())
    expect(s.store.getState().selectedId).toBe(B)
    await userEvent.click(awaitingButton())
    expect(s.store.getState().selectedId).toBe(A)
    s.emit(B, { kind: 'state', state: 'running' })
    expect(awaitingButton()).toBeDisabled()
    expect(awaitingButton()).toHaveAccessibleDescription('ほかに承認待ちのセッションはありません。')
  })

  it('承認に応じて応答中へ戻ると強調が消え、件数が減る', async () => {
    const s = await setup([A, B])
    s.emit(A, { kind: 'state', state: 'awaiting_permission' })
    s.emit(A, { kind: 'state', state: 'running' })
    const rowA = await rowOf('案件A')
    expect(within(rowA).getByTestId('session-row-status')).not.toHaveAttribute('data-attention')
    expect(awaitingButton()).toHaveTextContent('承認待ち 0 件')
    expect(screen.queryByTestId('session-nav-awaiting')).toBeNull()
  })

  it('失敗は承認待ちと別の印で理由が出て、見出しとナビの失敗の件数が一致する', async () => {
    const s = await setup([A, B])
    s.emit(A, { kind: 'failure', reasonKey: 'provider-error' })
    s.push([st(A, { state: 'error', reasonKey: 'provider-error' })])
    const rowA = await rowOf('案件A')
    expect(within(rowA).getByTestId('session-row-status')).toHaveAttribute(
      'data-attention',
      'failure'
    )
    expect(within(rowA).getByTestId('session-row-failure')).toHaveTextContent('Provider')
    expect(screen.getByTestId('failed-count')).toHaveTextContent('失敗 1 件')
    expect(screen.getByTestId('session-nav-failed')).toHaveTextContent('失敗 1 件')
    expect(awaitingButton()).toHaveTextContent('承認待ち 0 件')
  })
})

describe('読み上げ (FR-004 / SC-001)', () => {
  const announcer = (): HTMLElement => screen.getByTestId('session-announcer')

  it('見ていないセッションの承認待ちで 1 回だけ文が入り、応答中 ⇄ 応答待ちでは変わらない。会話由来の文字列を含まない', async () => {
    useUiStore.setState({ screen: 'launch' })
    const s = await setup([A, B])
    s.emit(A, { kind: 'state', state: 'awaiting_permission' })
    s.emit(A, {
      kind: 'permission-request',
      request: { requestId: 'r1', toolName: 'Bash', input: 'rm -rf secret', scope: 'once' }
    })
    expect(announcer()).toHaveTextContent('案件A: 承認待ちになりました。')
    expect(announcer().textContent).not.toMatch(/Bash|secret/)
    const before = announcer().innerHTML
    s.emit(B, { kind: 'state', state: 'done' })
    s.emit(B, { kind: 'state', state: 'running' })
    expect(announcer().innerHTML).toBe(before)
  })

  it('見ているセッション (セッション画面で選択中) の遷移は読まない。セッション画面以外では選ばれていたものも読む', async () => {
    useUiStore.setState({ screen: 'launch' })
    const s = await setup([A, B])
    expect(s.store.getState().selectedId).toBe(B)
    s.emit(B, { kind: 'state', state: 'awaiting_permission' })
    expect(announcer()).toHaveTextContent('')
    s.emit(B, { kind: 'state', state: 'running' })
    act(() => useUiStore.setState({ screen: 'sessions' }))
    s.emit(B, { kind: 'state', state: 'awaiting_permission' })
    expect(announcer()).toHaveTextContent('案件B: 承認待ちになりました。')
  })

  it('同じ状態通知のバッチの 2 本は 1 つの文', async () => {
    useUiStore.setState({ screen: 'sessions' })
    const s = await setup([A, B])
    s.push([st(A, { state: 'error' }), st(B, { state: 'error' })])
    expect(announcer()).toHaveTextContent('案件A、案件B: 失敗しました。')
  })

  it('同じ文が続いても要素が入れ替わる (読み上げ直される)', async () => {
    useUiStore.setState({ screen: 'sessions' })
    const s = await setup([A])
    s.emit(A, { kind: 'state', state: 'awaiting_permission' })
    const first = announcer().firstElementChild
    s.emit(A, { kind: 'state', state: 'running' })
    s.emit(A, { kind: 'state', state: 'awaiting_permission' })
    const second = announcer().firstElementChild
    expect(second).toHaveTextContent('案件A: 承認待ちになりました。')
    expect(second).not.toBe(first)
  })

  it('表示名が引けなくても文が壊れない', async () => {
    useUiStore.setState({ screen: 'sessions' })
    const s = await setup([A])
    act(() =>
      s.store.setState((x) => ({
        sessions: { ...x.sessions, [A]: { ...x.sessions[A]!, folderLabel: null } }
      }))
    )
    s.emit(A, { kind: 'state', state: 'awaiting_permission' })
    expect(announcer()).toHaveTextContent('名前を取得できないセッション: 承認待ちになりました。')
  })
})

describe('行の情報 (FE-012 / SC-002)', () => {
  it('直近の活動は前置きと別の要素で出て、HTML・マークダウンは文字列のまま (要素 0 件)', async () => {
    const s = await setup([A])
    s.emit(A, { kind: 'state', state: 'done' })
    s.emit(A, {
      kind: 'message',
      message: {
        id: 'm1',
        role: 'assistant',
        parts: [{ type: 'text', text: '<script>alert(1)</script> **太字**\n二行目' }],
        createdAt: null
      }
    })
    const rowA = await rowOf('案件A')
    const activity = await within(rowA).findByTestId('session-row-activity')
    expect(activity).toHaveTextContent('応答:')
    expect(within(activity).getByTestId('session-row-activity-text')).toHaveTextContent(
      '<script>alert(1)</script> **太字**'
    )
    expect(rowA.querySelector('script, strong')).toBeNull()
  })

  it('承認待ちの行は承認を求めている tool 名と入力を出す', async () => {
    const s = await setup([A])
    s.emit(A, { kind: 'state', state: 'awaiting_permission' })
    s.emit(A, {
      kind: 'permission-request',
      request: { requestId: 'r1', toolName: 'Bash', input: 'ls -la', scope: 'once' }
    })
    const rowA = await rowOf('案件A')
    expect(await within(rowA).findByTestId('session-row-activity')).toHaveTextContent(
      '承認を求めています:Bash ls -la'
    )
  })

  it('経過時間が時計の進みで更新され、状態が変わると 0 から数え直す', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const s = await setup([A])
    const rowA = await rowOf('案件A')
    expect(within(rowA).getByTestId('session-row-elapsed')).toHaveTextContent('0秒')
    act(() => vi.advanceTimersByTime(61_000))
    expect(within(rowA).getByTestId('session-row-elapsed')).toHaveTextContent('1分')
    s.emit(A, { kind: 'state', state: 'running' })
    act(() => vi.advanceTimersByTime(1_000))
    expect(within(rowA).getByTestId('session-row-elapsed')).toHaveTextContent(/^[01]秒$/)
  })

  it('枠の使用数は終了済みを数えない。上限で空け方の案内が出て、新規起動の導線は押せる', async () => {
    const ids = Array.from({ length: 10 }, (_, i) => `${i}0000000-0000-4000-8000-000000000000`)
    const s = await setup(ids)
    expect(screen.getByTestId('slot-usage')).toHaveTextContent('枠 10/10')
    expect(screen.getByTestId('limit-notice')).toHaveTextContent('上限に達しています')
    expect(screen.getByTestId('limit-notice')).toHaveTextContent('「終了」')
    expect(screen.getByRole('button', { name: '新規起動' })).toBeEnabled()
    s.push([st(ids[0]!, { state: 'done', claudeAlive: false })])
    expect(screen.getByTestId('slot-usage')).toHaveTextContent('枠 9/10')
    expect(screen.queryByTestId('limit-notice')).toBeNull()
  })

  it('観測点: 受信の累計と行の状態が属性で読める', async () => {
    const s = await setup([A])
    s.emit(A, { kind: 'state', state: 'running' })
    s.emit(A, {
      kind: 'message',
      message: {
        id: 'm1',
        role: 'assistant',
        parts: [{ type: 'text', text: 'x' }],
        createdAt: null
      }
    })
    expect(screen.getByTestId('received-messages')).toHaveAttribute('data-received-messages', '1')
    const rowA = await rowOf('案件A')
    expect(within(rowA).getByTestId('session-row-status')).toHaveAttribute(
      'data-row-status',
      'running'
    )
  })

  it('本文を 500ms の間に 20 回更新しても、一覧の描画は 3 回以下で最後の値が出る (SC-006)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const s = await setup([A])
    await screen.findAllByRole('listitem')
    s.emit(A, { kind: 'state', state: 'done' })
    act(() => vi.advanceTimersByTime(1_000))
    s.renders.count = 0
    act(() => {
      for (let i = 0; i < 20; i += 1)
        s.ports[A]?.onmessage?.({
          data: JSON.stringify({
            kind: 'message',
            message: {
              id: `m${i}`,
              role: 'assistant',
              parts: [{ type: 'text', text: `応答 ${i}` }],
              createdAt: null
            }
          })
        })
    })
    act(() => vi.advanceTimersByTime(500))
    // 直近の活動の書き込み (先頭 + trailing) で描画は起きる (計測が空でない) が、本文の 20 回には比例しない。
    expect(s.renders.count).toBeGreaterThan(0)
    expect(s.renders.count).toBeLessThanOrEqual(3)
    expect(screen.getByTestId('session-row-activity-text')).toHaveTextContent('応答 19')
  })
})

describe('情報密度 (FE-022 / SC-003 の component 側)', () => {
  it('compact の行は状態・表示名・経過時間と操作のアイコンボタンを出し、外した情報は読める。強調も同じに出る', async () => {
    const s = await setup([A, B])
    s.emit(A, { kind: 'state', state: 'awaiting_permission' })
    await userEvent.click(screen.getByRole('button', { name: 'コンパクト' }))
    expect(screen.getByRole('button', { name: 'コンパクト' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    const rowA = await rowOf('案件A')
    expect(within(rowA).getByTestId('session-row-status')).toHaveAttribute(
      'data-attention',
      'approval'
    )
    expect(within(rowA).getByTestId('session-row-elapsed')).toBeInTheDocument()
    expect(within(rowA).getByRole('button', { name: '強制終了' })).toBeInTheDocument()
    expect(within(rowA).getByRole('button', { name: /案件A/ })).toHaveAccessibleName(/Ubuntu/)
    expect(awaitingButton()).toHaveTextContent('承認待ち 1 件')
  })

  it('密度は新規起動と表示の切り替えで保たれる', async () => {
    const s = await setup([A, B])
    await userEvent.click(screen.getByRole('button', { name: 'コンパクト' }))
    act(() => s.store.select(A))
    await userEvent.click(screen.getByRole('button', { name: '新規起動' }))
    expect(s.store.getState().density).toBe('compact')
    expect(screen.getByRole('button', { name: 'コンパクト' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
  })
})
