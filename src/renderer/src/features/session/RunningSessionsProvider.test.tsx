import { useEffect } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { act, render } from '@testing-library/react'

import type { ThreadMessageLike } from '@assistant-ui/react'

import { installCapability } from '@/test-support/capability'

import { RunningSessionStoreContext } from './running-session-context'
import { createRunningSessionStore } from './running-session-store'
import { useRunningSessionsView, type RunningSessionsView } from './running-sessions-view'
import { RunningSessionsProvider } from './RunningSessionsProvider'
import { MESSAGE_WINDOW } from './session-view'
import { DEFAULT_EXTRA_AXES } from '@domain/session/launch-config'

/**
 * O-3 FE-023 — `RunningSessionsView.revealMessage` (012 data-model §2「移動」/ research R-03 / plan RK-04)。
 * 窓の外の id で「さらに表示」と同じ窓を広げ、窓の中の id・知らない id では窓を変えない。
 */

const A = '11111111-1111-4111-8111-111111111111'

function messages(count: number): ThreadMessageLike[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `m${i}`,
    role: 'assistant' as const,
    content: [{ type: 'text' as const, text: `本文 ${i}` }]
  }))
}

const sink: { view: RunningSessionsView | null } = { view: null }

function Probe(): null {
  const current = useRunningSessionsView()
  useEffect(() => {
    sink.view = current
  }, [current])
  return null
}

function view(): RunningSessionsView {
  if (sink.view === null) throw new Error('view が描かれていない')
  return sink.view
}

async function setup(count: number): Promise<void> {
  sink.view = null
  const launch = vi.fn().mockResolvedValueOnce({ status: 'launching', sessionId: A })
  const never = new Promise<never>(() => undefined)
  const cap = installCapability({
    listFolders: () => never,
    listRuntimes: () => never,
    launchSession: launch
  })
  const store = createRunningSessionStore(() => cap)
  store.attach(window)
  await store.launch({
    folderId: 'wf_0123456789ab',
    runtimeId: 'wsl:Ubuntu',
    providerId: null,
    modelId: null,
    effort: null,
    permissionMode: 'default',
    ...DEFAULT_EXTRA_AXES,
    sessionName: null
  })
  store.setState((s) => ({
    sessions: { ...s.sessions, [A]: { ...s.sessions[A]!, messages: messages(count) } },
    selectedId: A
  }))
  render(
    <RunningSessionStoreContext.Provider value={store}>
      <RunningSessionsProvider>
        <Probe />
      </RunningSessionsProvider>
    </RunningSessionStoreContext.Provider>
  )
}

describe('RunningSessionsView.runtimeName (X-8 H-003)', () => {
  it('Win32 のランタイムは「見つからない」ではなく「Windows (ホスト)」と出し、WSL は distro 名つき', async () => {
    sink.view = null
    const base = {
      state: 'running',
      isDefault: false,
      capabilities: {
        probeState: 'done',
        sandboxKind: 'none',
        seccompStatus: 'unknown',
        missingDependencies: [],
        probedAt: '2026-10-21T00:00:00.000Z',
        autoModeAllowed: false,
        autoModeStatus: 'unavailable'
      },
      detectedAt: '2026-10-21T00:00:00.000Z',
      claudeStatus: null,
      claudeOverridden: false
    }
    const cap = installCapability({
      listFolders: () => new Promise<never>(() => undefined),
      listRuntimes: async () =>
        ({
          wslAvailability: 'available',
          enumerationIssues: [],
          runtimes: [
            {
              ...base,
              id: 'host',
              kind: 'win32',
              distroName: null,
              wslVersion: null,
              hasPathMapping: false
            },
            {
              ...base,
              id: 'wsl:Ubuntu',
              kind: 'wsl',
              distroName: 'Ubuntu',
              wslVersion: 2,
              hasPathMapping: true
            }
          ]
        }) as never
    })
    const store = createRunningSessionStore(() => cap)
    render(
      <RunningSessionStoreContext.Provider value={store}>
        <RunningSessionsProvider>
          <Probe />
        </RunningSessionsProvider>
      </RunningSessionStoreContext.Provider>
    )
    await vi.waitFor(() => expect(view().runtimeName('host')).toBe('Windows (ホスト)'))
    expect(view().runtimeName('wsl:Ubuntu')).toBe('WSL: Ubuntu')
  })
})

describe('RunningSessionsView.revealMessage (O-3 FE-023)', () => {
  it('窓の外の id で、そのメッセージが入るところまで窓を広げる', async () => {
    await setup(MESSAGE_WINDOW * 2 + 5)
    expect(view().hiddenCount).toBe(MESSAGE_WINDOW + 5)

    // 窓の外の少し前 (広げる 1 段で入る)。
    act(() => view().revealMessage(`m${MESSAGE_WINDOW}`))
    expect(view().hiddenCount).toBe(5)

    // さらに前 (先頭)。「さらに表示」と同じ段で広げる。
    act(() => view().revealMessage('m0'))
    expect(view().hiddenCount).toBe(0)
  })

  it('窓の中の id・知らない id では窓を変えない', async () => {
    await setup(MESSAGE_WINDOW + 1)
    expect(view().hiddenCount).toBe(1)
    const before = view()

    act(() => view().revealMessage(`m${MESSAGE_WINDOW}`))
    expect(view().hiddenCount).toBe(1)
    act(() => view().revealMessage('知らない id'))
    expect(view().hiddenCount).toBe(1)
    // 窓の state を作り直さない (面に渡す値も変わらない)。
    expect(view()).toBe(before)
  })
})
