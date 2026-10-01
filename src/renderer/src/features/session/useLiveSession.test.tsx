import { describe, expect, it, vi } from 'vitest'
import type { SessionLaunchConfig } from '@domain/session/launch-config'
import { act, renderHook } from '@testing-library/react'

import { SESSION_PORT_MESSAGE } from '@domain/capability'

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

function cfg(folderId: string, runtimeId: string): SessionLaunchConfig {
  return {
    folderId,
    runtimeId,
    providerId: null,
    modelId: null,
    effort: null,
    permissionMode: 'default'
  }
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
      await result.current.launch(cfg('f1', 'r1'))
    })
    expect(result.current.phase).toBe('rejected')
    expect(result.current.rejectReason).toBe('distro-not-running')
  })

  it('launch 成功で phase=active。**reset() は稼働セッションを kill する** (C-001)', async () => {
    const killSession = vi.fn(async () => {})
    installCapability({ launchSession: launching(), killSession })
    const { result } = renderHook(() => useLiveSession())
    await act(async () => {
      await result.current.launch(cfg('f1', 'r1'))
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
      await result.current.launch(cfg('f1', 'r1'))
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
      await result.current.launch(cfg('f1', 'r1'))
    })
    act(() => {
      result.current.send('hi')
      result.current.interrupt()
      result.current.respond('perm-1', 'allow')
    })
    expect(sendPrompt).toHaveBeenCalledWith(UUID, 'hi')
    expect(interruptSession).toHaveBeenCalledWith(UUID)
    // 承認応答は常に once scope (X-1。capability 付与は I-3。AD-041 (c))。
    expect(respondPermission).toHaveBeenCalledWith(UUID, 'perm-1', 'allow', 'once')
  })

  it('appendUser は user 発話を messages に積む (楽観表示)', async () => {
    installCapability({ launchSession: launching(), killSession: vi.fn(async () => {}) })
    const { result } = renderHook(() => useLiveSession())
    await act(async () => {
      await result.current.launch(cfg('f1', 'r1'))
    })
    act(() => {
      result.current.appendUser('hello')
    })
    expect(result.current.messages.some((m) => m.role === 'user')).toBe(true)
  })

  it('失敗の後に reset で戻ると理由を previousFailure に保持し、次の launch で消す (US-1 AC7 / pr-gate M-07)', async () => {
    installCapability({ launchSession: launching(), killSession: vi.fn(async () => {}) })
    const { result } = renderHook(() => useLiveSession())
    await act(async () => {
      await result.current.launch(cfg('f1', 'r1'))
    })
    // preload の橋渡しを模す (自 origin・自 window)。jsdom の MessageChannel に依存しない fake port。
    const port: {
      onmessage: ((event: { data: unknown }) => void) | null
      start: () => void
      close: () => void
    } = { onmessage: null, start: vi.fn(), close: vi.fn() }
    const event = new Event('message') as Event & { data: unknown; ports: unknown[] }
    event.data = { marker: SESSION_PORT_MESSAGE, sessionId: UUID }
    event.ports = [port]
    Object.defineProperty(event, 'origin', { value: window.location.origin })
    Object.defineProperty(event, 'source', { value: window })
    act(() => {
      window.dispatchEvent(event)
    })
    act(() => {
      port.onmessage?.({ data: { kind: 'failure', reasonKey: 'launch-failed' } })
    })
    expect(result.current.failureReason).toBe('launch-failed')

    act(() => {
      result.current.reset()
    })
    expect(result.current.phase).toBe('entry')
    expect(result.current.failureReason).toBeNull()
    expect(result.current.previousFailure).toBe('launch-failed')
    expect(result.current.lastConfig).toEqual(cfg('f1', 'r1'))

    await act(async () => {
      await result.current.launch(cfg('f1', 'r1'))
    })
    expect(result.current.previousFailure).toBeNull()
  })

  it('失敗なしの reset (閉じる) では previousFailure を持たない', async () => {
    installCapability({ launchSession: launching(), killSession: vi.fn(async () => {}) })
    const { result } = renderHook(() => useLiveSession())
    await act(async () => {
      await result.current.launch(cfg('f1', 'r1'))
    })
    act(() => {
      result.current.reset()
    })
    expect(result.current.previousFailure).toBeNull()
  })
})
