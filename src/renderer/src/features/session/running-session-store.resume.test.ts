import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ClostaCapability } from '@domain/capability'
import type { SessionLaunchHandshakeDTO } from '@domain/session/agent-session'
import { DEFAULT_EXTRA_AXES, type SessionLaunchConfig } from '@domain/session/launch-config'
import type { SessionResumeRequest } from '@domain/session/resume'
import type { SessionStatusUpdate } from '@domain/session/status-update'

import { stubCapability } from '@/test-support/capability'

import { createRunningSessionStore, type RunningSessionStore } from './running-session-store'

/**
 * X-9 FE-010 — 稼働中のストアの再開の状態 (data-model §9.4 / §9.6 / research R-11)。
 * 既存の `running-session-store.test.ts` は書き換えない (この規則は別のファイルに置く)。
 */

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
const C = '33333333-3333-4333-8333-333333333333'

function cfg(folderId = 'f1'): SessionLaunchConfig {
  return {
    folderId,
    runtimeId: 'wsl:Ubuntu',
    providerId: null,
    modelId: null,
    effort: null,
    permissionMode: 'default',
    ...DEFAULT_EXTRA_AXES,
    sessionName: null
  }
}

function request(): SessionResumeRequest {
  return {
    source: { kind: 'past', targetKey: 'target-1', conversationId: C },
    config: cfg()
  }
}

interface Harness {
  readonly store: RunningSessionStore
  readonly cap: ClostaCapability
  readonly pushResumable: (ids: readonly string[]) => void
  readonly pushStatus: (updates: readonly SessionStatusUpdate[]) => void
}

let detach: (() => void) | null = null

afterEach(() => {
  detach?.()
  detach = null
})

/** handshake を `releaseAll` まで待たせる `launchSession` (起動要求が在る間の通知を観測する)。 */
function deferredLaunch(sessionIds: readonly string[]): {
  readonly launchSession: ClostaCapability['launchSession']
  readonly releaseAll: () => void
} {
  const releases: (() => void)[] = []
  return {
    launchSession: () =>
      new Promise<SessionLaunchHandshakeDTO>((resolve) => {
        const sessionId = sessionIds[releases.length] ?? A
        releases.push(() => resolve({ status: 'launching', sessionId }))
      }),
    releaseAll: () => {
      for (const release of releases) release()
    }
  }
}

function harness(over: Partial<ClostaCapability> = {}): Harness {
  let resumable: ((ids: readonly string[]) => void) | null = null
  let statusListener: ((u: readonly SessionStatusUpdate[]) => void) | null = null
  const cap = stubCapability({
    launchSession: vi.fn(async () => ({ status: 'launching' as const, sessionId: A })),
    resumeSession: vi.fn(async () => ({ status: 'launching' as const, sessionId: B })),
    killSession: vi.fn(async () => {}),
    // それまでの会話の読み取りは FE-040 の別のテストで見る。ここでは終わらせない (`resumed: loading` のまま)。
    getResumedTranscript: vi.fn(() => new Promise<never>(() => {})),
    onSessionStatus: (l) => {
      statusListener = l
      return () => {
        statusListener = null
      }
    },
    onSessionResumable: (l) => {
      resumable = l
      return () => {
        resumable = null
      }
    },
    ...over
  })
  const store = createRunningSessionStore(
    () => cap,
    () => 1_700_000_000_000
  )
  detach = store.attach(window)
  return {
    store,
    cap,
    pushResumable: (ids) => resumable?.(ids),
    pushStatus: (u) => statusListener?.(u)
  }
}

describe('running-session-store — 再開 (FE-010)', () => {
  it('受け付けで新しい行が選ばれ resumable: true・resumed: loading。新規起動の行は resumable: false', async () => {
    const h = harness()
    await h.store.launch(cfg())
    expect(h.store.getState().sessions[A]).toMatchObject({ resumable: false, resumed: null })

    const outcome = await h.store.resume(request(), null, 'manual')
    expect(outcome).toBe('accepted')
    expect(h.cap.resumeSession).toHaveBeenCalledWith(request(), 'manual')
    const state = h.store.getState()
    expect(state.selectedId).toBe(B)
    expect(state.order).toEqual([A, B])
    expect(state.sessions[B]).toMatchObject({ resumable: true, resumed: { phase: 'loading' } })
    expect(state.launch).toMatchObject({ phase: 'entry', rejectReason: null, resume: null })
  })

  it('replaces があれば元の行が消え、previousFailure が立たず、order の長さが変わらない', async () => {
    const h = harness()
    await h.store.launch(cfg())
    h.pushStatus([
      { sessionId: A, state: 'error', reasonKey: 'process-crashed', claudeAlive: false }
    ])
    h.store.openResume({
      source: { kind: 'live', sessionId: A },
      fixed: { folderId: 'f1', runtimeId: 'wsl:Ubuntu', providerId: null },
      initial: null,
      initialOrigin: 'manual',
      replaces: A
    })
    const before = h.store.getState()
    expect(before.order).toHaveLength(1)

    await h.store.resume({ source: { kind: 'live', sessionId: A }, config: cfg() }, null, 'manual')
    const after = h.store.getState()
    expect(after.order).toEqual([B])
    expect(after.sessions[A]).toBeUndefined()
    expect(after.selectedId).toBe(B)
    expect(after.launch.previousFailure).toBeNull()
    expect(after.order).toHaveLength(before.order.length)
    // 元の行は止まっているので kill を送らない。
    expect(h.cap.killSession).not.toHaveBeenCalled()
  })

  it('replace は close と違い previousFailure を立てず、新しい行を元の位置に置いて選ぶ', async () => {
    const h = harness()
    await h.store.launch(cfg())
    vi.mocked(h.cap.launchSession).mockResolvedValueOnce({ status: 'launching', sessionId: C })
    await h.store.launch(cfg('f2'))
    vi.mocked(h.cap.launchSession).mockResolvedValueOnce({ status: 'launching', sessionId: B })
    await h.store.launch(cfg('f3'))
    h.pushStatus([
      { sessionId: A, state: 'error', reasonKey: 'process-crashed', claudeAlive: false }
    ])
    const seq = h.store.getState().selectionSeq
    h.store.replace(A, B)
    const state = h.store.getState()
    expect(state.order).toEqual([B, C])
    expect(state.selectedId).toBe(B)
    expect(state.selectionSeq).toBe(seq + 1)
    expect(state.launch.previousFailure).toBeNull()
  })

  it('already-running は返った行を選び、元の行を残す', async () => {
    const h = harness()
    await h.store.launch(cfg())
    vi.mocked(h.cap.resumeSession).mockResolvedValueOnce({
      status: 'already-running',
      sessionId: A
    })
    const outcome = await h.store.resume(request(), null, 'manual')
    expect(outcome).toBe('already-running')
    expect(h.store.getState().selectedId).toBe(A)
    expect(h.store.getState().order).toEqual([A])
    expect(h.store.getState().launch.phase).toBe('entry')
  })

  it('rejected は理由を起動の状態に置き、行を足さない', async () => {
    const h = harness()
    vi.mocked(h.cap.resumeSession).mockResolvedValueOnce({
      status: 'rejected',
      reasonKey: 'provider-missing'
    })
    const outcome = await h.store.resume(request(), null, 'manual')
    expect(outcome).toBe('rejected')
    expect(h.store.getState().order).toEqual([])
    expect(h.store.getState().launch).toMatchObject({
      phase: 'rejected',
      rejectReason: 'provider-missing',
      lastConfig: cfg()
    })
  })

  it('起動せずに閉じると再開の形が戻る', () => {
    const h = harness()
    h.store.openResume({
      source: { kind: 'past', targetKey: 't', conversationId: C },
      fixed: { folderId: 'f1', runtimeId: 'wsl:Ubuntu', providerId: null },
      initial: null,
      initialOrigin: 'manual',
      replaces: null
    })
    expect(h.store.getState().launch.resume).not.toBeNull()
    h.store.dismissLaunchNotice()
    expect(h.store.getState().launch.resume).toBeNull()
  })
})

describe('running-session-store — sessionResumable の通知 (FE-010)', () => {
  it('通知で該当の行の resumable が立つ。知らない sessionId は無視する', async () => {
    const h = harness()
    await h.store.launch(cfg())
    h.pushResumable([B])
    expect(h.store.getState().sessions[B]).toBeUndefined()
    h.pushResumable([A])
    expect(h.store.getState().sessions[A]?.resumable).toBe(true)
  })

  it('行より先の通知は覚えて、行の作成で当てる', async () => {
    const deferred = deferredLaunch([A])
    const h = harness({ launchSession: deferred.launchSession })
    const pending = h.store.launch(cfg())
    h.pushResumable([A])
    deferred.releaseAll()
    await pending
    expect(h.store.getState().sessions[A]?.resumable).toBe(true)
  })

  it('11 件目の先着の通知で最も古いものが捨てられる', async () => {
    const ids = Array.from(
      { length: 11 },
      (_, i) => `${String(i).padStart(8, '0')}-0000-4000-8000-000000000000`
    )
    const first = ids[0] as string
    const last = ids[10] as string
    const deferred = deferredLaunch([first, last])
    const h = harness({ launchSession: deferred.launchSession })
    const p1 = h.store.launch(cfg())
    const p2 = h.store.launch(cfg('f2'))
    h.pushResumable(ids)
    deferred.releaseAll()
    await Promise.all([p1, p2])
    // 最も古い (先頭) は捨てられたので当たらない。新しい側は残る。
    expect(h.store.getState().sessions[first]?.resumable).toBe(false)
    expect(h.store.getState().sessions[last]?.resumable).toBe(true)
  })
})
