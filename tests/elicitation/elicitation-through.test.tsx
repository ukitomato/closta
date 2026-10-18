import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { SESSION_PORT_MESSAGE } from '@domain/capability'
import type { SessionEvent } from '@domain/session/agent-session'
import type { ElicitationPrompt } from '@domain/session/elicitation'
import type { SessionStatusUpdate } from '@domain/session/status-update'

import { ELICITATION_LABELS } from '@/features/session/labels'
import { RunningSessionStoreContext } from '@/features/session/running-session-context'
import {
  createRunningSessionStore,
  type RunningSessionStore
} from '@/features/session/running-session-store'
import { installCapability } from '@/test-support/capability'
import { RunningSessionsHarness } from '@/test-support/running-sessions-harness'

import { handleRespondElicitation, type SessionIpcDeps } from '../../src/main/app/session-ipc'
import {
  createElicitationRegistry,
  createOnElicitation,
  decodeSessionControl
} from '../../src/agents/session-core'

/**
 * Elicitation の入力が残らないことの通しのテスト (O-10 / 018 tasks FE-023 / spec SC-004)。
 *
 * agents の `createOnElicitation` → `JSON.stringify` → 偽の port → decoder → 稼働中のストア → `ElicitationCard` の DOM
 * → 利用者の入力 → capability の `respondElicitation` → main の `handleRespondElicitation` → agents の
 * `decodeSessionControl` → registry の `settle` → SDK への戻り値、までを本物で通す。
 *
 * | 観点 | 根拠 |
 * |---|---|
 * | 入力に入れた目印が、設定の保存・console・ストア・`SessionEvent`・DOM に 0 件 | SC-004 / FR-009 |
 * | URL のリンクを押すと content なしの `accept` が SDK に `{action: 'accept'}` で届く | data-model §3 |
 * | 全部が任意の form を空で送ると `{}` の `accept` で届く | data-model §3 |
 */

const SESSION = '11111111-1111-4111-8111-111111111111'
const MARKER = 'O10-MARKER-xyz'

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

let detach: (() => void) | null = null

afterEach(() => {
  detach?.()
  detach = null
  vi.restoreAllMocks()
})

interface Rig {
  readonly store: RunningSessionStore
  readonly onElicitation: ReturnType<typeof createOnElicitation>
  readonly sent: string[]
  readonly settings: ReturnType<typeof vi.fn>
}

async function rig(): Promise<Rig> {
  const registry = createElicitationRegistry(() => crypto.randomUUID())
  const sent: string[] = []
  let port: FakePort | null = null
  const send = (event: SessionEvent): void => {
    const data = JSON.stringify(event)
    sent.push(data)
    act(() => port?.onmessage?.({ data }))
  }
  const onElicitation = createOnElicitation({
    registry,
    emitRequest: (prompt: ElicitationPrompt) => send({ kind: 'elicitation-request', request: prompt })
  })
  // main の handleRespondElicitation → agents の decodeSessionControl → registry.settle。
  const ipc = {
    controlSession(_sessionId: string, control: unknown): boolean {
      const decoded = decodeSessionControl(control)
      if (decoded?.kind === 'respond-elicitation') registry.settle(decoded.response)
      return true
    }
  } as unknown as SessionIpcDeps
  const settings = vi.fn()
  let listener: ((u: readonly SessionStatusUpdate[]) => void) | null = null
  const cap = installCapability({
    listFolders: () => new Promise<never>(() => undefined),
    listRuntimes: () => new Promise<never>(() => undefined),
    launchSession: vi.fn(async () => ({ status: 'launching' as const, sessionId: SESSION })),
    sendPrompt: vi.fn(async () => {}),
    interruptSession: vi.fn(async () => {}),
    respondElicitation: vi.fn(async (...args: unknown[]) => {
      await handleRespondElicitation(ipc, args)
    }),
    savePreset: settings,
    onSessionStatus: (l) => {
      listener = l
      return () => {
        listener = null
      }
    }
  })
  void listener
  const store = createRunningSessionStore(() => cap)
  detach = store.attach(window)
  await store.launch({
    folderId: 'f1',
    runtimeId: 'wsl:Ubuntu',
    providerId: null,
    modelId: null,
    effort: null,
    permissionMode: 'default'
  })
  port = { onmessage: null, start: vi.fn(), close: vi.fn() }
  deliverPort(SESSION, port)
  act(() => store.select(SESSION))
  render(
    createElement(
      RunningSessionStoreContext.Provider,
      { value: store },
      createElement(RunningSessionsHarness)
    )
  )
  return { store, onElicitation, sent, settings }
}

const spies = (): ReturnType<typeof vi.spyOn>[] =>
  (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) =>
    vi.spyOn(console, m).mockImplementation(() => undefined)
  )

const noMarker = (value: unknown): void => {
  expect(JSON.stringify(value) ?? '').not.toContain(MARKER)
}

describe('Elicitation の通し (SC-004)', () => {
  it('form: 入力した目印は SDK への戻り値にだけ届き、設定・console・ストア・イベント・DOM に残らない', async () => {
    const consoles = spies()
    const h = await rig()
    const pending = h.onElicitation(
      {
        serverName: 'github',
        message: '名前を教えてください',
        mode: 'form',
        requestedSchema: {
          type: 'object',
          properties: { name: { type: 'string', title: 'お名前' } },
          required: ['name']
        }
      },
      { signal: new AbortController().signal }
    )
    const input = await screen.findByLabelText(/お名前/)
    const user = userEvent.setup()
    await user.type(input, MARKER)
    await user.click(screen.getByText(ELICITATION_LABELS.submit))
    await expect(pending).resolves.toEqual({ action: 'accept', content: { name: MARKER } })

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(h.settings).not.toHaveBeenCalled()
    for (const spy of consoles) noMarker(spy.mock.calls)
    noMarker(h.store.getState())
    noMarker(h.sent)
    expect(document.body.innerHTML).not.toContain(MARKER)
  })

  it('全部が任意の form を空で送ると {} の accept で届く', async () => {
    const h = await rig()
    const pending = h.onElicitation(
      {
        serverName: 's',
        message: '',
        mode: 'form',
        requestedSchema: { type: 'object', properties: { memo: { type: 'string' } } }
      },
      { signal: new AbortController().signal }
    )
    await userEvent.setup().click(await screen.findByText(ELICITATION_LABELS.submit))
    await expect(pending).resolves.toEqual({ action: 'accept', content: {} })
  })

  it('URL: リンクを押すと content なしの accept が {action: accept} で届き、カードが外れる', async () => {
    const h = await rig()
    const pending = h.onElicitation(
      { serverName: 's', message: '', mode: 'url', url: 'https://example.com/auth' },
      { signal: new AbortController().signal }
    )
    const link = await screen.findByRole('link')
    // jsdom は target=_blank の遷移を行わない。既定の動作は止めずに押す。
    await userEvent.setup().click(link)
    await expect(pending).resolves.toEqual({ action: 'accept' })
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
  })

  it('断ると decline・取り消すと cancel で届く (content は付かない)', async () => {
    const h = await rig()
    const first = h.onElicitation(
      { serverName: 's', message: '', mode: 'url', url: 'https://example.com/a' },
      { signal: new AbortController().signal }
    )
    await userEvent.setup().click(await screen.findByText(ELICITATION_LABELS.decline))
    await expect(first).resolves.toEqual({ action: 'decline' })
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    const second = h.onElicitation(
      { serverName: 's', message: '', mode: 'url', url: 'https://example.com/b' },
      { signal: new AbortController().signal }
    )
    await userEvent.setup().click(await screen.findByText(ELICITATION_LABELS.cancel))
    await expect(second).resolves.toEqual({ action: 'cancel' })
  })
})
