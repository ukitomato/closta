import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { SESSION_PORT_MESSAGE, type ClostaCapability } from '@domain/capability'
import type { SessionEvent } from '@domain/session/agent-session'

import { APP_COMMAND_LABELS, COMPOSER_LABELS } from '@/features/chat/labels'
import { installCapability } from '@/test-support/capability'
import { RunningSessionsHarness } from '@/test-support/running-sessions-harness'

import { RunningSessionStoreContext } from './running-session-context'
import { createRunningSessionStore } from './running-session-store'
import { DEFAULT_EXTRA_AXES } from '@domain/session/launch-config'

/**
 * 025 FE-053 — `/resume` の候補と横取り (spec US-5 AC1 / AC2 / FR-017)。
 * port の本文 → store → Thread の composer までを本物で通す (`LivePane.settings.test.tsx` と同じ組み方)。
 */

const A = '11111111-1111-4111-8111-111111111111'

interface FakePort {
  onmessage: ((event: { data: unknown }) => void) | null
  start: () => void
  close: () => void
}

let detach: (() => void) | null = null

afterEach(() => {
  detach?.()
  detach = null
  vi.unstubAllGlobals()
})

async function setup(): Promise<{
  readonly emit: (event: SessionEvent) => void
  readonly cap: ClostaCapability
  readonly store: ReturnType<typeof createRunningSessionStore>
}> {
  const launch = vi.fn().mockResolvedValueOnce({ status: 'launching', sessionId: A })
  const cap = installCapability({
    listFolders: () => new Promise<never>(() => undefined),
    listRuntimes: () => new Promise<never>(() => undefined),
    listProviders: async () => [],
    launchSession: launch,
    sendPrompt: vi.fn(async () => {}),
    interruptSession: vi.fn(async () => {}),
    onSessionStatus: () => () => {},
    listSessionModels: vi.fn(async () => ({ ok: true as const, models: [], reportedCount: 0 }))
  })
  const store = createRunningSessionStore(() => cap)
  detach = store.attach(window)
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
  const port: FakePort = { onmessage: null, start: vi.fn(), close: vi.fn() }
  const event = new Event('message') as Event & { data: unknown; ports: unknown[] }
  event.data = { marker: SESSION_PORT_MESSAGE, sessionId: A }
  event.ports = [port]
  Object.defineProperty(event, 'origin', { value: window.location.origin })
  Object.defineProperty(event, 'source', { value: window })
  window.dispatchEvent(event)
  act(() => store.select(A))
  render(
    <RunningSessionStoreContext.Provider value={store}>
      <RunningSessionsHarness />
    </RunningSessionStoreContext.Provider>
  )
  const emit = (e: SessionEvent): void => act(() => port.onmessage?.({ data: JSON.stringify(e) }))
  emit({ kind: 'state', state: 'done' })
  return { emit, cap, store }
}

const composerInput = (): HTMLElement =>
  screen.getByRole('textbox', { name: COMPOSER_LABELS.composerInput })

describe('LivePane — /resume (025 US-5)', () => {
  it('/ の候補に /resume がアプリのコマンドの説明つきで 1 つ出る (meters が無くても)', async () => {
    await setup()
    await userEvent.type(composerInput(), '/')
    const options = await screen.findAllByRole('option')
    const resume = options.filter((o) => o.textContent?.includes(APP_COMMAND_LABELS.resume))
    expect(resume).toHaveLength(1)
  })

  it('待機中に /resume を送ると、送信されず選ぶ画面が開く', async () => {
    const { cap, store } = await setup()
    await userEvent.type(composerInput(), '/resume {Enter}')
    await waitFor(() => expect(store.getState().sessions[A]?.resumePicker).toBe(true))
    expect(cap.sendPrompt).not.toHaveBeenCalled()
    expect(await screen.findByTestId('resume-picker')).toBeTruthy()
  })
})
