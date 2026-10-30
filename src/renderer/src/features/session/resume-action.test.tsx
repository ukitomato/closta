import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'

import { SESSION_PORT_MESSAGE } from '@domain/capability'
import type { RuntimeDescriptorDTO } from '@domain/runtime/dto'
import type { SessionRunState } from '@domain/session/run-state'
import type { SessionStatusUpdate } from '@domain/session/status-update'
import type { WorkspaceFolderDTO } from '@domain/workspace/dto'

import { useUiStore } from '@/stores/ui'
import { installCapability } from '@/test-support/capability'
import { RunningSessionsHarness } from '@/test-support/running-sessions-harness'

import { RESUME_LABELS } from './labels'
import { resumeActionFor } from './resume-action'
import { RunningSessionStoreContext } from './running-session-context'
import { createRunningSessionStore, type RunningSessionStore } from './running-session-store'
import { DEFAULT_EXTRA_AXES } from '@domain/session/launch-config'

/**
 * X-9 / FE-020 — 稼働中の行の「再開」「やり直す」の出し分けと実行 (data-model §9.1・§9.2・§9.5 / SC-004)。
 * 純関数を §9.1 の稼働中の区画の表の全行で回し、行・`EndNotice`・`FailureBanner` の 3 か所が同じ出し分けを描くことを確かめる。
 */

const NOW = 1_700_000_000_000
const A = '11111111-1111-4111-8111-111111111111'
const FOLDER_A = 'wf_0123456789aa'
const AXE_RULES = { rules: { 'color-contrast': { enabled: false } } }

describe('resumeActionFor (§9.1 の稼働中の区画の表)', () => {
  const row = (
    runState: SessionRunState,
    ended: boolean,
    resumable: boolean
  ): Parameters<typeof resumeActionFor>[0] => ({ runState, ended, resumable })

  it('動いている・中断済み・承認待ち・応答待ち (claudeAlive) は何も出さない', () => {
    for (const state of [
      'launching',
      'running',
      'interrupted',
      'awaiting_permission',
      'done'
    ] as const) {
      expect(resumeActionFor(row(state, false, true))).toBeNull()
      expect(resumeActionFor(row(state, false, false))).toBeNull()
    }
  })

  it('終了済み: 会話の id ありで「再開」、なしで何も出さない', () => {
    expect(resumeActionFor(row('done', true, true))).toBe('resume')
    expect(resumeActionFor(row('done', true, false))).toBeNull()
  })

  it('失敗: 会話の id ありで「再開」、なしで「やり直す」', () => {
    expect(resumeActionFor(row('error', true, true))).toBe('resume')
    expect(resumeActionFor(row('error', true, false))).toBe('retry')
  })

  it('失敗で claudeAlive が true (終わりの通知の前) は何も出さない', () => {
    expect(resumeActionFor(row('error', false, true))).toBeNull()
    expect(resumeActionFor(row('error', false, false))).toBeNull()
  })
})

const UBUNTU: RuntimeDescriptorDTO = {
  id: 'wsl:Ubuntu',
  kind: 'wsl',
  distroName: 'Ubuntu',
  wslVersion: 2,
  state: 'running',
  isDefault: true,
  capabilities: {
    probeState: 'done',
    sandboxKind: 'bubblewrap',
    seccompStatus: 'unknown',
    missingDependencies: [],
    probedAt: NOW,
    autoModeAllowed: true,
    autoModeStatus: 'allowed'
  },
  hasPathMapping: true,
  detectedAt: NOW,
  claudeStatus: null,
  claudeOverridden: false
}

const FOLDER: WorkspaceFolderDTO = {
  id: FOLDER_A,
  location: { kind: 'wsl', distroName: 'Ubuntu' },
  path: { namespace: 'wsl:Ubuntu', value: '/home/u/a' },
  displayName: '案件A',
  reachability: 'reachable',
  unreachableReason: null,
  blockedReason: null,
  resolutionSteps: [],
  registeredAt: NOW
}

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

interface Harness {
  readonly store: RunningSessionStore
  readonly container: HTMLElement
  readonly push: (updates: readonly SessionStatusUpdate[]) => void
}

let detach: (() => void) | null = null

beforeEach(() => {
  useUiStore.setState({
    focus: 'running',
    launchOpen: false,
    settings: { open: false, section: 'runtimes' }
  })
})

afterEach(() => {
  detach?.()
  detach = null
  useUiStore.setState({
    focus: 'none',
    launchOpen: false,
    settings: { open: false, section: 'runtimes' }
  })
})

/** 中央に A を出している。`model` / `effort` は元の起動設定の値 (初期値の確認に使う)。 */
async function setup(): Promise<Harness> {
  let listener: ((u: readonly SessionStatusUpdate[]) => void) | null = null
  const launch = vi.fn()
  launch.mockResolvedValueOnce({ status: 'launching', sessionId: A })
  const cap = installCapability({
    listFolders: () =>
      Promise.resolve({
        folders: [FOLDER],
        restoreIssues: { skipped: 0, reasonKeys: [], backupPath: null }
      }),
    listRuntimes: () =>
      Promise.resolve({ runtimes: [UBUNTU], enumerationIssues: [], wslAvailability: 'available' }),
    launchSession: launch,
    killSession: vi.fn(async () => {}),
    onSessionStatus: (l) => {
      listener = l
      return () => {
        listener = null
      }
    }
  })
  const store = createRunningSessionStore(() => cap)
  detach = store.attach(window)
  await store.launch(
    {
      folderId: FOLDER_A,
      runtimeId: UBUNTU.id,
      providerId: null,
      modelId: 'm1',
      effort: 'high',
      permissionMode: 'plan',
      ...DEFAULT_EXTRA_AXES,
      maxTurns: 30,
      sessionName: null
    },
    '案件A',
    'preset'
  )
  const port: FakePort = { onmessage: null, start: vi.fn(), close: vi.fn() }
  deliverPort(A, port)
  const { container } = render(
    <RunningSessionStoreContext.Provider value={store}>
      <RunningSessionsHarness />
    </RunningSessionStoreContext.Provider>
  )
  return { store, container, push: (updates) => act(() => listener?.(updates)) }
}

const status = (over: Partial<SessionStatusUpdate>): SessionStatusUpdate => ({
  sessionId: A,
  state: 'done',
  reasonKey: null,
  claudeAlive: false,
  ...over
})

async function rowA(): Promise<HTMLElement> {
  const rows = await screen.findAllByRole('listitem')
  const row = rows.find((r) => within(r).queryByText('案件A') !== null)
  if (row === undefined) throw new Error('row')
  return row
}

describe('稼働中の行の「再開」「やり直す」 (US-2 AC1〜AC4)', () => {
  it('終了済みで会話の id あり: 行と EndNotice に「再開」が出て、押すと元の 3 軸と初期値でダイアログが開く', async () => {
    const h = await setup()
    act(() =>
      h.store.setState((s) => ({
        sessions: { ...s.sessions, [A]: { ...s.sessions[A]!, resumable: true } }
      }))
    )
    h.push([status({})])
    const row = await rowA()
    const rowButton = within(row).getByRole('button', { name: RESUME_LABELS.action })
    const notice = screen.getByRole('status')
    expect(within(notice).getByRole('button', { name: RESUME_LABELS.action })).toBeInTheDocument()

    await userEvent.click(rowButton)
    expect(useUiStore.getState().launchOpen).toBe(true)
    expect(h.store.getState().launch.resume).toEqual({
      source: { kind: 'live', sessionId: A },
      fixed: { folderId: FOLDER_A, runtimeId: UBUNTU.id, providerId: null },
      initial: {
        modelId: 'm1',
        effort: 'high',
        permissionMode: 'plan',
        ...DEFAULT_EXTRA_AXES,
        maxTurns: 30
      },
      initialOrigin: 'preset',
      replaces: A
    })
    // 開いただけでは元の行を消さない。
    expect(h.store.getState().sessions[A]).toBeDefined()
  })

  it('終了済みで会話の id なし: 何も出さず、ダイアログも開かない', async () => {
    const h = await setup()
    h.push([status({})])
    const row = await rowA()
    expect(within(row).queryByRole('button', { name: RESUME_LABELS.action })).toBeNull()
    expect(within(row).queryByRole('button', { name: RESUME_LABELS.retry })).toBeNull()
    expect(
      within(screen.getByRole('status')).queryByRole('button', { name: RESUME_LABELS.retry })
    ).toBeNull()
    expect(useUiStore.getState().launchOpen).toBe(false)
  })

  it('動いている行には何も出さない', async () => {
    await setup()
    const row = await rowA()
    expect(within(row).queryByRole('button', { name: RESUME_LABELS.action })).toBeNull()
    expect(within(row).queryByRole('button', { name: RESUME_LABELS.retry })).toBeNull()
  })

  it('失敗で会話の id なし: 行と FailureBanner に「やり直す」。押すと行が閉じて新規起動の形のダイアログが元の設定で開く', async () => {
    const h = await setup()
    h.push([status({ state: 'error', reasonKey: 'process-crashed' })])
    const row = await rowA()
    const banner = screen
      .getAllByRole('alert')
      .find((el) => within(el).queryByRole('button', { name: RESUME_LABELS.retry }) !== null)
    expect(banner).toBeDefined()
    expect(within(row).getByRole('button', { name: RESUME_LABELS.retry })).toBeInTheDocument()

    await userEvent.click(within(row).getByRole('button', { name: RESUME_LABELS.retry }))
    expect(h.store.getState().sessions[A]).toBeUndefined()
    expect(h.store.getState().launch.previousFailure).toBe('process-crashed')
    expect(h.store.getState().launch.lastConfig?.modelId).toBe('m1')
    expect(h.store.getState().launch.resume).toBeNull()
    expect(useUiStore.getState().launchOpen).toBe(true)
  })

  it('失敗で会話の id あり: 「再開」が出る (「やり直す」は出ない)', async () => {
    const h = await setup()
    act(() =>
      h.store.setState((s) => ({
        sessions: { ...s.sessions, [A]: { ...s.sessions[A]!, resumable: true } }
      }))
    )
    h.push([status({ state: 'error', reasonKey: 'resume-failed' })])
    const row = await rowA()
    expect(within(row).getByRole('button', { name: RESUME_LABELS.action })).toBeInTheDocument()
    expect(within(row).queryByRole('button', { name: RESUME_LABELS.retry })).toBeNull()
  })

  it('失敗で claudeAlive が true の間は何も出さない', async () => {
    const h = await setup()
    h.push([status({ state: 'error', reasonKey: 'process-crashed', claudeAlive: true })])
    const row = await rowA()
    expect(within(row).queryByRole('button', { name: RESUME_LABELS.retry })).toBeNull()
    expect(within(row).queryByRole('button', { name: RESUME_LABELS.action })).toBeNull()
  })

  it('vitest-axe: 操作を出した状態で違反 0', async () => {
    const h = await setup()
    act(() =>
      h.store.setState((s) => ({
        sessions: { ...s.sessions, [A]: { ...s.sessions[A]!, resumable: true } }
      }))
    )
    h.push([status({})])
    await rowA()
    expect((await axe(h.container, AXE_RULES)).violations).toEqual([])
  })
})
