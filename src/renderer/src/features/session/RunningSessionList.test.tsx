import { describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import {
  AssistantRuntimeProvider,
  useExternalStoreRuntime,
  type ThreadMessageLike
} from '@assistant-ui/react'

import type { SessionStatusUpdate } from '@domain/session/status-update'

import { stubCapability } from '@/test-support/capability'

import { useRunningThreadList } from './useRunningThreadList'
import { createRunningSessionStore, type RunningSessionStore } from './running-session-store'
import { RunningSessionList } from './RunningSessionList'
import { RunningSessionStoreContext } from './running-session-context'
import { DEFAULT_EXTRA_AXES } from '@domain/session/launch-config'

/**
 * X-5 FE-011 / FE-013 — 一覧の行・選択・操作の出し分け・空状態 (FR-009 / FR-011 / SC-006)。
 * 一覧は assistant-ui の ThreadList で組むので、`RunningSessionsProvider` と同じ adapter (`useRunningThreadList`) を持つ
 * ランタイムの内側に置いて確かめる。
 */

function Harness(): React.JSX.Element {
  const threadList = useRunningThreadList(() => '案件フォルダ')
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

const rowsOf = (): Promise<HTMLElement[]> => screen.findAllByRole('listitem')

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'

async function setup(ids: readonly string[]): Promise<{
  store: RunningSessionStore
  cap: ReturnType<typeof stubCapability>
  push: (u: readonly SessionStatusUpdate[]) => void
}> {
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
  store.attach(window)
  for (let i = 0; i < ids.length; i += 1) {
    await store.launch({
      folderId: 'f1',
      runtimeId: 'wsl:Ubuntu',
      providerId: null,
      modelId: null,
      effort: null,
      permissionMode: 'default',
      ...DEFAULT_EXTRA_AXES,
      sessionName: null
    })
  }
  render(
    <RunningSessionStoreContext.Provider value={store}>
      <Harness />
    </RunningSessionStoreContext.Provider>
  )
  return { store, cap, push: (u) => act(() => listener?.(u)) }
}

const st = (sessionId: string, over: Partial<SessionStatusUpdate>): SessionStatusUpdate => ({
  sessionId,
  state: 'launching',
  reasonKey: null,
  claudeAlive: true,
  ...over
})

describe('RunningSessionList', () => {
  it('サイドバーの区画として section で描き、区画の中に「新規起動」を置かない (O-7 FR-001 / FR-002)', async () => {
    await setup([A])
    const region = screen.getByTestId('session-list')
    expect(region.tagName).toBe('SECTION')
    expect(screen.queryByRole('navigation')).toBeNull()
    expect(screen.queryByRole('button', { name: '新規起動' })).toBeNull()
  })

  it('行が 0 件なら空状態を出す', async () => {
    await setup([])
    expect(screen.getByTestId('session-list-empty')).toBeInTheDocument()
  })

  it('名前を付けた行は題が名前になり、付けていない行はフォルダ名のまま (023 FR-012)', async () => {
    const { store } = await setup([A, B])
    act(() =>
      store.setState((s) => ({
        sessions: { ...s.sessions, [A]: { ...s.sessions[A]!, name: '調査メモ' } }
      }))
    )
    const rows = await rowsOf()
    expect(within(rows[0]!).getByText('調査メモ')).toBeInTheDocument()
    expect(within(rows[1]!).getByText('案件フォルダ')).toBeInTheDocument()
  })

  it('行はフォルダ名・ランタイム・状態を示し、表示中の行が分かる。選ぶと切り替わる', async () => {
    const { store } = await setup([A, B])
    const rows = await rowsOf()
    expect(rows).toHaveLength(2)
    expect(within(rows[0]!).getByText('案件フォルダ')).toBeInTheDocument()
    expect(within(rows[0]!).getByText(/Ubuntu/)).toBeInTheDocument()
    // 最後に起動した B が表示中。
    expect(within(rows[1]!).getByRole('button', { name: /案件フォルダ/ })).toHaveAttribute(
      'aria-current',
      'true'
    )
    await userEvent.click(within(rows[0]!).getByRole('button', { name: /案件フォルダ/ }))
    await waitFor(() => expect(store.getState().selectedId).toBe(A))
  })

  it('起動中は強制終了だけを出す', async () => {
    await setup([A])
    const [row] = await rowsOf()
    if (row === undefined) throw new Error('row')
    expect(within(row).getByTestId('session-row-status')).toHaveTextContent('起動中')
    expect(within(row).getByRole('button', { name: '強制終了' })).toBeInTheDocument()
    expect(within(row).queryByRole('button', { name: '終了' })).toBeNull()
    expect(within(row).queryByRole('button', { name: '中断' })).toBeNull()
    expect(within(row).queryByRole('button', { name: '閉じる' })).toBeNull()
  })

  it('done で生存なら「応答待ち」と終了、終了済みなら「終了済み」と閉じる', async () => {
    const { store, cap, push } = await setup([A])
    // port の run-state を done にする (本文 `state: done` を受けた後の状態)。
    act(() => {
      store.setState((s) => ({
        sessions: { ...s.sessions, [A]: { ...s.sessions[A]!, runState: 'done' } }
      }))
    })
    push([st(A, { state: 'done' })])
    const [row] = await rowsOf()
    if (row === undefined) throw new Error('row')
    expect(within(row).getByTestId('session-row-status')).toHaveTextContent('応答待ち')
    await userEvent.click(within(row).getByRole('button', { name: '終了' }))
    expect(cap.endSession).toHaveBeenCalledWith(A)
    expect(within(row).getByRole('button', { name: '終了中…' })).toBeDisabled()
    // 終了の処理中は「終了中」で、強制終了へ切り替えられる (pr-gate R2 po M-104 / L-103)。
    expect(within(row).getByTestId('session-row-status')).toHaveTextContent('終了中')
    expect(within(row).getByRole('button', { name: '強制終了' })).toBeInTheDocument()

    push([st(A, { state: 'done', claudeAlive: false })])
    expect(within(row).getByTestId('session-row-status')).toHaveTextContent('終了済み')
    await userEvent.click(within(row).getByRole('button', { name: '閉じる' }))
    await waitFor(() => expect(screen.queryAllByRole('listitem')).toHaveLength(0))
    expect(screen.getByTestId('session-list-empty')).toBeInTheDocument()
  })

  it('end-forced を受けると強制終了に落ちた旨を行に出す', async () => {
    const { store } = await setup([A])
    await rowsOf()
    act(() => {
      store.setState((s) => ({
        sessions: { ...s.sessions, [A]: { ...s.sessions[A]!, endForced: true } }
      }))
    })
    expect(await screen.findByTestId('session-row-end-notice')).toHaveTextContent(
      '時間内に完了しなかったため強制終了'
    )
  })
})

describe('RunningSessionList — 行を閉じた後のフォーカス (O-4 FR-019 / SC-007。014 data-model §8)', () => {
  const C = '33333333-3333-4333-8333-333333333333'

  /** 全部の行を終了済みにして「閉じる」を出す。 */
  async function endedRows(ids: readonly string[]): Promise<HTMLElement[]> {
    const { push } = await setup(ids)
    push(ids.map((id) => st(id, { state: 'done', claudeAlive: false })))
    const rows = await rowsOf()
    await waitFor(() =>
      rows.forEach((row) =>
        expect(within(row).getByRole('button', { name: '閉じる' })).toBeInTheDocument()
      )
    )
    return rows
  }
  const triggerOf = (row: HTMLElement): HTMLElement =>
    within(row).getByRole('button', { name: /案件フォルダ/ })

  it('閉じた行の次の行の Trigger へ移す (body に落とさない)', async () => {
    const [a, b] = await endedRows([A, B, C])
    const next = triggerOf(b!)
    await userEvent.click(within(a!).getByRole('button', { name: '閉じる' }))
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(2))
    expect(document.activeElement).not.toBe(document.body)
    expect(document.activeElement).toBe(next)
  })

  it('閉じた行が最後なら前の行の Trigger へ移す', async () => {
    const [, b, c] = await endedRows([A, B, C])
    const previous = triggerOf(b!)
    await userEvent.click(within(c!).getByRole('button', { name: '閉じる' }))
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(2))
    expect(document.activeElement).toBe(previous)
  })

  it('1 行だけなら稼働中の区画の見出しへ移す', async () => {
    const [a] = await endedRows([A])
    await userEvent.click(within(a!).getByRole('button', { name: '閉じる' }))
    await waitFor(() => expect(screen.queryAllByRole('listitem')).toHaveLength(0))
    const heading = screen.getByRole('heading', { level: 2 })
    expect(heading).toHaveAttribute('tabindex', '-1')
    expect(document.activeElement).toBe(heading)
  })

  it('フォーカスが別の場所にあるときは動かさない', async () => {
    const [a] = await endedRows([A, B])
    const elsewhere = screen.getByRole('button', { name: '詳しく' })
    act(() => elsewhere.focus())
    // ポインタで押してもフォーカスを移さない経路 (フォーカスは押した行の外に残る)。
    fireEvent.click(within(a!).getByRole('button', { name: '閉じる' }))
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(1))
    expect(document.activeElement).toBe(elsewhere)
  })
})
