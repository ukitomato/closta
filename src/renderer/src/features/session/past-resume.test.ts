import { describe, expect, it, vi } from 'vitest'

import { startPastResume } from './past-resume'

describe('startPastResume', () => {
  it('ok なら openResume を過去の行の形で呼び、setLaunchOpen(true) を 1 回呼ぶ', () => {
    const openResume = vi.fn()
    const setLaunchOpen = vi.fn()
    const reason = startPastResume({ store: { openResume }, setLaunchOpen }, 'tk', 'cv', {
      ok: true,
      folderId: 'f1',
      runtimeId: 'r1',
      providerId: null
    } as never)
    expect(reason).toBeNull()
    expect(openResume).toHaveBeenCalledTimes(1)
    expect(openResume).toHaveBeenCalledWith({
      source: { kind: 'past', targetKey: 'tk', conversationId: 'cv' },
      fixed: { folderId: 'f1', runtimeId: 'r1', providerId: null },
      initial: null,
      initialOrigin: 'manual',
      replaces: null
    })
    expect(setLaunchOpen).toHaveBeenCalledTimes(1)
    expect(setLaunchOpen).toHaveBeenCalledWith(true)
  })

  it('ok でなければ理由を返し、何も開かない', () => {
    const openResume = vi.fn()
    const setLaunchOpen = vi.fn()
    const reason = startPastResume({ store: { openResume }, setLaunchOpen }, 'tk', 'cv', {
      ok: false,
      reason: 'source-unknown'
    } as never)
    expect(reason).toBe('source-unknown')
    expect(openResume).not.toHaveBeenCalled()
    expect(setLaunchOpen).not.toHaveBeenCalled()
  })
})
