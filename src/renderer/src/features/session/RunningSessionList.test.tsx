import { describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor, within } from '@testing-library/react'
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

/**
 * X-5 FE-011 / FE-013 — 一覧の行・選択・操作の出し分け・空状態 (FR-009 / FR-011 / SC-006)。
 * 一覧は assistant-ui の ThreadList で組むので、SessionScreen と同じ adapter (`useRunningThreadList`) を持つ
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
      permissionMode: 'default'
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
  it('「新規起動」は adapter の onSwitchToNewThread を通って選択を外す (起動ダイアログを開く)', async () => {
    const { store } = await setup([A])
    expect(store.getState().selectedId).toBe(A)
    await userEvent.click(screen.getByRole('button', { name: '新規起動' }))
    await waitFor(() => expect(store.getState().selectedId).toBeNull())
  })

  it('行が 0 件なら空状態を出す', async () => {
    await setup([])
    expect(screen.getByTestId('session-list-empty')).toBeInTheDocument()
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
