import { describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'

import type { SessionLaunchConfig } from '@domain/session/launch-config'

import { stubCapability } from '@/test-support/capability'

import { createRunningSessionStore } from './running-session-store'
import { RunningSessionStoreContext } from './running-session-context'
import { useLiveSession } from './useLiveSession'
import { DEFAULT_EXTRA_AXES } from '@domain/session/launch-config'

/**
 * X-5 FE-002 — `useLiveSession(sessionId)` は 1 セッション分を読み、制御を引数のセッションに向ける。
 *
 * **unmount で kill しないことを固定する** (X-1 の「画面を離れたら kill」(pr-gate C-001) の撤去。spec FR-008)。
 * セッションの寿命は store と main (`dispose` / `killAll`) に一本化した。
 */

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'

const config: SessionLaunchConfig = {
  folderId: 'f1',
  runtimeId: 'wsl:Ubuntu',
  providerId: null,
  modelId: null,
  effort: null,
  permissionMode: 'default',
  ...DEFAULT_EXTRA_AXES,
  sessionName: null
}

async function setup(): Promise<{
  store: ReturnType<typeof createRunningSessionStore>
  cap: ReturnType<typeof stubCapability>
  wrapper: ({ children }: { children: React.ReactNode }) => React.JSX.Element
}> {
  const cap = stubCapability({
    launchSession: vi
      .fn()
      .mockResolvedValueOnce({ status: 'launching', sessionId: A })
      .mockResolvedValueOnce({ status: 'launching', sessionId: B }),
    sendPrompt: vi.fn(async () => {}),
    interruptSession: vi.fn(async () => {}),
    respondPermission: vi.fn(async () => {}),
    killSession: vi.fn(async () => {}),
    endSession: vi.fn(async () => {})
  })
  const store = createRunningSessionStore(() => cap)
  await store.launch(config)
  await store.launch(config)
  const wrapper = ({ children }: { children: React.ReactNode }): React.JSX.Element => (
    <RunningSessionStoreContext.Provider value={store}>
      {children}
    </RunningSessionStoreContext.Provider>
  )
  return { store, cap, wrapper }
}

describe('useLiveSession(sessionId)', () => {
  it('送信・中断・承認・終了・強制終了は引数のセッションに向く', async () => {
    const { cap, wrapper } = await setup()
    const { result } = renderHook(() => useLiveSession(A), { wrapper })
    act(() => {
      result.current?.send('hi')
      result.current?.interrupt()
      result.current?.respond('perm-1', 'deny')
    })
    expect(cap.sendPrompt).toHaveBeenCalledWith(A, 'hi')
    expect(cap.interruptSession).toHaveBeenCalledWith(A)
    expect(cap.respondPermission).toHaveBeenCalledWith(A, 'perm-1', 'deny', 'once')
    act(() => {
      result.current?.kill()
    })
    expect(cap.killSession).toHaveBeenCalledWith(A)
    expect(cap.killSession).not.toHaveBeenCalledWith(B)
  })

  it('unmount しても kill しない (FR-008)', async () => {
    const { cap, wrapper } = await setup()
    const { unmount } = renderHook(() => useLiveSession(A), { wrapper })
    unmount()
    expect(cap.killSession).not.toHaveBeenCalled()
  })

  it('appendUser は自分のセッションにだけユーザ発話を積む', async () => {
    const { store, wrapper } = await setup()
    const { result } = renderHook(() => useLiveSession(A), { wrapper })
    act(() => {
      result.current?.appendUser('hello')
    })
    expect(result.current?.state.messages.some((m) => m.role === 'user')).toBe(true)
    expect(store.getState().sessions[B]?.messages).toHaveLength(0)
  })

  it('他のセッションの更新では同じ値を返す (表示中の Thread を再描画させない)', async () => {
    const { store, wrapper } = await setup()
    const { result } = renderHook(() => useLiveSession(A), { wrapper })
    const before = result.current
    act(() => {
      store.appendUser(B, 'B への発話')
    })
    expect(result.current).toBe(before)
  })

  it('閉じたセッションは null', async () => {
    const { store, wrapper } = await setup()
    const { result } = renderHook(() => useLiveSession(A), { wrapper })
    act(() => {
      store.close(A)
    })
    expect(result.current).toBeNull()
  })
})
