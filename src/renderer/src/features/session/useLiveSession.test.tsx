import { describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'

import { installCapability } from '@/test-support/capability'

import { useLiveSession } from './useLiveSession'

/**
 * FE-001 / FE-020 — `useLiveSession` の起動ライフサイクルと制御ルーティング (SC-001 / SC-010 / SC-011)。
 *
 * **teardown が稼働 supervisor を kill することを固定する** (pr-gate C-001 の回帰ガード) —
 * 「閉じる」(reset) が `killSession` を発火しないと孤児 + ソフトロックになる。
 * port 経由の `SessionEvent` 逐次反映 (jsdom MessageChannel) は quickstart / component 実機に委ね、
 * ここでは capability 呼び出し面と phase 遷移を計測する。
 */

const UUID = '11111111-1111-4111-8111-111111111111'

function launching(): () => Promise<{ status: 'launching'; sessionId: string }> {
  return vi.fn(async () => ({ status: 'launching' as const, sessionId: UUID }))
}

describe('useLiveSession', () => {
  it('launch 拒否で phase=rejected + rejectReason を持つ', async () => {
    installCapability({
      launchSession: vi.fn(async () => ({
        status: 'rejected' as const,
        reasonKey: 'distro-not-running' as const
      }))
    })
    const { result } = renderHook(() => useLiveSession())
    await act(async () => {
      await result.current.launch('f1', 'r1')
    })
    expect(result.current.phase).toBe('rejected')
    expect(result.current.rejectReason).toBe('distro-not-running')
  })

  it('launch 成功で phase=active。**reset() は稼働セッションを kill する** (C-001)', async () => {
    const killSession = vi.fn(async () => {})
    installCapability({ launchSession: launching(), killSession })
    const { result } = renderHook(() => useLiveSession())
    await act(async () => {
      await result.current.launch('f1', 'r1')
    })
    expect(result.current.phase).toBe('active')

    act(() => {
      result.current.reset()
    })
    // 「閉じる」で supervisor を殺してから畳む — 孤児 + ソフトロックを防ぐ。
    expect(killSession).toHaveBeenCalledWith(UUID)
    expect(result.current.phase).toBe('entry')
  })

  it('unmount 時にも稼働セッションを kill する (画面遷移経路。C-001)', async () => {
    const killSession = vi.fn(async () => {})
    installCapability({ launchSession: launching(), killSession })
    const { result, unmount } = renderHook(() => useLiveSession())
    await act(async () => {
      await result.current.launch('f1', 'r1')
    })
    unmount()
    expect(killSession).toHaveBeenCalledWith(UUID)
  })

  it('send / interrupt / respond は sessionId つきで capability を呼ぶ', async () => {
    const sendPrompt = vi.fn(async () => {})
    const interruptSession = vi.fn(async () => {})
    const respondPermission = vi.fn(async () => {})
    installCapability({
      launchSession: launching(),
      sendPrompt,
      interruptSession,
      respondPermission,
      // unmount 時の kill 発火 (C-001) が stub 未定義で reject しないよう与える。
      killSession: vi.fn(async () => {})
    })
    const { result } = renderHook(() => useLiveSession())
    await act(async () => {
      await result.current.launch('f1', 'r1')
    })
    act(() => {
      result.current.send('hi')
      result.current.interrupt()
      result.current.respond('perm-1', 'allow')
    })
    expect(sendPrompt).toHaveBeenCalledWith(UUID, 'hi')
    expect(interruptSession).toHaveBeenCalledWith(UUID)
    // 承認応答は常に once scope (X-1。capability 付与は X-4)。
    expect(respondPermission).toHaveBeenCalledWith(UUID, 'perm-1', 'allow', 'once')
  })

  it('appendUser は user 発話を messages に積む (楽観表示)', async () => {
    installCapability({ launchSession: launching(), killSession: vi.fn(async () => {}) })
    const { result } = renderHook(() => useLiveSession())
    await act(async () => {
      await result.current.launch('f1', 'r1')
    })
    act(() => {
      result.current.appendUser('hello')
    })
    expect(result.current.messages.some((m) => m.role === 'user')).toBe(true)
  })
})
