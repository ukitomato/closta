import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'

import { InfoIcon } from 'lucide-react'

import { SESSION_PORT_MESSAGE } from '@domain/capability'
import type { RuntimeDescriptorDTO } from '@domain/runtime/dto'
import type { SessionEvent } from '@domain/session/agent-session'
import type {
  EnumerationOutcomeDTO,
  SessionGroupDTO,
  SessionIndexDTO,
  SessionSummaryDTO
} from '@domain/session/dto'
import type { SessionStatusUpdate } from '@domain/session/status-update'
import type { WorkspaceFolderDTO } from '@domain/workspace/dto'

import { TooltipProvider } from '@/components/ui/tooltip'
import { RunningSessionStoreContext } from '@/features/session/running-session-context'
import {
  createRunningSessionStore,
  type RunningSessionStore
} from '@/features/session/running-session-store'
import { SessionAttentionAnnouncer } from '@/features/session/SessionAttentionAnnouncer'
import { useSessionsStore } from '@/stores/sessions'
import { useUiStore } from '@/stores/ui'
import { installCapability } from '@/test-support/capability'

import { AppShell } from './AppShell'
import { SHELL_LABELS } from './labels'
import { OverviewTab } from './OverviewTab'
import type { PanelTab } from './panel-tabs'

/**
 * O-7 FE-014 / FE-021 / FE-031 / FE-042 — シェル (SC-001 / SC-002 / SC-004 / SC-007 / US-1〜US-4)。
 * 稼働中のストアと過去の一覧のストアは本物を使い、preload だけをスタブする。
 */

const NOW = Date.UTC(2026, 9, 5, 9, 0)
const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
const XSS = '<img src=x onerror="window.__pwned=1">'

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
  detectedAt: NOW
}

function folder(displayName = '案件フォルダ'): WorkspaceFolderDTO {
  return {
    id: 'folder-1',
    location: { kind: 'wsl', distroName: 'Ubuntu' },
    path: { namespace: 'wsl:Ubuntu', value: '/home/u/proj' },
    displayName,
    reachability: 'reachable',
    unreachableReason: null,
    blockedReason: null,
    resolutionSteps: [],
    registeredAt: NOW
  }
}

function pastSession(overrides: Partial<SessionSummaryDTO> = {}): SessionSummaryDTO {
  return {
    sessionId: '33333333-3333-4333-8333-333333333333',
    targetKey: 'wsl:Ubuntu#0',
    targetLabel: 'u',
    summary: '過去の作業',
    firstPrompt: null,
    customTitle: null,
    lastModified: NOW,
    createdAt: NOW,
    fileSize: 100,
    gitBranch: 'main',
    tag: null,
    cwd: { namespace: 'wsl:Ubuntu', value: '/home/u/proj' },
    cwdDisplay: null,
    originKind: 'wsl-inherited',
    programmatic: false,
    worktree: false,
    boundary: null,
    normalized: { truncated: false, controlCharsRemoved: false },
    ...overrides
  }
}

function pastIndex(sessions: readonly SessionSummaryDTO[] = [pastSession()]): SessionIndexDTO {
  const group: SessionGroupDTO = {
    kind: 'folder',
    folderId: 'folder-1',
    boundary: 'native',
    sessions
  }
  const outcome: EnumerationOutcomeDTO = {
    location: { kind: 'wsl', distroName: 'Ubuntu' },
    targetKey: 'wsl:Ubuntu#0',
    targetLabel: 'u',
    status: 'ok',
    reasonKey: null,
    count: sessions.length,
    truncated: false,
    fetchedAt: NOW
  }
  return { groups: [group], outcomes: [outcome], fetchedAt: NOW, complete: true }
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
  readonly emit: (sessionId: string, event: SessionEvent) => void
  readonly push: (updates: readonly SessionStatusUpdate[]) => void
  readonly container: HTMLElement
  readonly launchMock: ReturnType<typeof vi.fn>
}

let detach: (() => void) | null = null

beforeEach(() => {
  useUiStore.setState({
    focus: 'none',
    settings: { open: false, section: 'runtimes' },
    sidebarCollapsed: false,
    panel: { collapsed: true, tab: 'overview' },
    launchOpen: false,
    folderDraftSeed: null,
    transcriptDensity: 'comfortable'
  })
  useSessionsStore.setState({
    index: null,
    loading: false,
    failed: false,
    selectedRowKey: null,
    selectionSeq: 0
  })
})

afterEach(() => {
  detach?.()
  detach = null
  vi.unstubAllGlobals()
})

async function setup(
  options: {
    readonly ids?: readonly string[]
    readonly folders?: readonly WorkspaceFolderDTO[]
    readonly index?: SessionIndexDTO
    readonly panelTabs?: readonly PanelTab[]
  } = {}
): Promise<Harness> {
  const ids = options.ids ?? []
  let listener: ((u: readonly SessionStatusUpdate[]) => void) | null = null
  const launch = vi.fn()
  for (const id of ids) launch.mockResolvedValueOnce({ status: 'launching', sessionId: id })
  const cap = installCapability({
    listFolders: () =>
      Promise.resolve({
        folders: options.folders ?? [folder()],
        restoreIssues: { skipped: 0, reasonKeys: [], backupPath: null }
      }),
    listRuntimes: () =>
      Promise.resolve({ runtimes: [UBUNTU], enumerationIssues: [], wslAvailability: 'available' }),
    listSessions: () => Promise.resolve(options.index ?? pastIndex()),
    listProviders: () => Promise.resolve([]),
    getTranscript: () => new Promise<never>(() => undefined),
    launchSession: launch,
    killSession: vi.fn(async () => {}),
    endSession: vi.fn(async () => {}),
    interruptSession: vi.fn(async () => {}),
    sendPrompt: vi.fn(async () => {}),
    onSessionStatus: (l) => {
      listener = l
      return () => {
        listener = null
      }
    }
  })
  const store = createRunningSessionStore(() => cap)
  detach = store.attach(window)
  const ports = new Map<string, FakePort>()
  for (const id of ids) {
    await store.launch(
      {
        folderId: 'folder-1',
        runtimeId: UBUNTU.id,
        providerId: null,
        modelId: null,
        effort: null,
        permissionMode: 'default'
      },
      '案件フォルダ'
    )
    const port: FakePort = { onmessage: null, start: vi.fn(), close: vi.fn() }
    deliverPort(id, port)
    ports.set(id, port)
  }
  // 起動の受け付けは store を通るので、シェルを描く前の起動は focus に効かない (購読の前)。既定の中央に戻す。
  useUiStore.setState({ focus: 'none', launchOpen: false })
  const { container } = render(
    <RunningSessionStoreContext.Provider value={store}>
      <TooltipProvider>
        <SessionAttentionAnnouncer />
        <AppShell panelTabs={options.panelTabs} />
      </TooltipProvider>
    </RunningSessionStoreContext.Provider>
  )
  return {
    store,
    container,
    launchMock: launch,
    emit: (sessionId, event) =>
      act(() => ports.get(sessionId)?.onmessage?.({ data: JSON.stringify(event) })),
    push: (updates) => act(() => listener?.(updates))
  }
}

const sidebar = (): HTMLElement => screen.getByTestId('sidebar')
const center = (): HTMLElement => screen.getByTestId('center')
const THREAD_ROW = '[data-slot="aui_thread-list-item"]'
const runningRows = (): HTMLElement[] =>
  Array.from(screen.getByTestId('session-list').querySelectorAll<HTMLElement>(THREAD_ROW))
/** 過去の区画の行 (列挙の結果の行など、ほかの listitem を拾わない)。 */
const pastRows = async (): Promise<HTMLElement[]> =>
  waitFor(() => {
    const rows = Array.from(
      screen.getByTestId('past-sessions').querySelectorAll<HTMLElement>(THREAD_ROW)
    )
    expect(rows.length).toBeGreaterThan(0)
    return rows
  })

async function selectRunning(index: number): Promise<void> {
  await userEvent.click(within(runningRows()[index]!).getAllByRole('button')[0]!)
}

async function selectPast(index: number): Promise<void> {
  const rows = await pastRows()
  await userEvent.click(within(rows[index]!).getAllByRole('button')[0]!)
}

describe('起動直後 (US-1 AC1 / AC5 / SC-001)', () => {
  it('タブのボタンが無く、ランドマークが 1 つずつ。中央は空の状態、右は畳んだ帯、稼働中は 0 件の文言', async () => {
    await setup()
    for (const old of ['ランタイム', 'セッション起動', '会話 (準備中)', '組み合わせ']) {
      expect(screen.queryByRole('button', { name: old })).toBeNull()
    }
    expect(screen.getAllByRole('navigation')).toHaveLength(1)
    expect(screen.getAllByRole('main')).toHaveLength(1)
    expect(screen.getAllByRole('complementary', { name: SHELL_LABELS.panelLabel })).toHaveLength(1)
    expect(screen.getByTestId('center-empty')).toHaveTextContent(SHELL_LABELS.centerEmpty)
    expect(screen.getByTestId('right-panel')).toHaveAttribute('data-collapsed', 'true')
    expect(screen.getByTestId('session-list-empty')).toHaveTextContent(
      '稼働中のセッションはありません。'
    )
    // サイドバーの「新規起動」と中央の空の状態のボタンは文言を分ける (E2E の locator がぶつからない)。
    expect(within(sidebar()).getByRole('button', { name: SHELL_LABELS.newSession })).toBeEnabled()
    expect(
      within(center()).getByRole('button', { name: SHELL_LABELS.centerEmptyLaunch })
    ).toBeEnabled()
  })

  it('作業フォルダが未登録なら中央に「設定 → 作業フォルダ」の操作が出て、押すと設定が作業フォルダで開く', async () => {
    await setup({
      folders: [],
      index: { groups: [], outcomes: [], fetchedAt: NOW, complete: true }
    })
    const button = await within(center()).findByRole('button', {
      name: SHELL_LABELS.centerEmptyFolders
    })
    expect(center()).toHaveTextContent(SHELL_LABELS.centerEmptyNoFolders)
    await userEvent.click(button)
    expect(useUiStore.getState().settings).toEqual({ open: true, section: 'folders' })
  })

  it('vitest-axe の違反 0', async () => {
    const h = await setup({ ids: [A] })
    await pastRows()
    const results = await axe(h.container, { rules: { 'color-contrast': { enabled: false } } })
    expect(results.violations).toEqual([])
  })
})

describe('中央の切り替えと稼働中の状態の保持 (US-1 AC2〜AC4 / SC-002 / FR-004)', () => {
  it('稼働中の行で実行中の Chat、過去の行で transcript。戻ると稼働中の会話が同じ thread のまま保たれる', async () => {
    const h = await setup({ ids: [A] })
    act(() => h.store.setDraft(A, '書きかけ'))
    await selectRunning(0)
    expect(center()).toHaveAttribute('data-focus', 'running')
    expect(await within(center()).findByTestId('session-title')).toHaveTextContent('案件フォルダ')
    h.emit(A, {
      kind: 'message',
      message: {
        id: 'm1',
        role: 'assistant',
        parts: [{ type: 'text', text: '応答 1' }],
        createdAt: 1
      }
    })
    await within(center()).findByText('応答 1')

    await selectPast(0)
    expect(center()).toHaveAttribute('data-focus', 'past')
    expect(within(center()).getByTestId('past-title')).toHaveTextContent('過去の作業')
    expect(within(center()).queryByTestId('session-title')).toBeNull()

    await selectRunning(0)
    expect(center()).toHaveAttribute('data-focus', 'running')
    expect(await within(center()).findByText('応答 1')).toBeInTheDocument()
    expect(h.store.getDraft(A)).toBe('書きかけ')
    expect(h.store.getState().sessions[A]?.messages).toHaveLength(1)
    // 同じ id を選び直しても中央が移る (selectionSeq)。
    await selectPast(0)
    act(() => h.store.select(A))
    expect(center()).toHaveAttribute('data-focus', 'running')
  })

  it('focus の側の行だけを強調する (もう片方の選択は保つ)', async () => {
    const h = await setup({ ids: [A] })
    await selectRunning(0)
    await selectPast(0)
    const runningTrigger = within(runningRows()[0]!).getAllByRole('button')[0]!
    const pastTrigger = within((await pastRows())[0]!).getAllByRole('button')[0]!
    expect(pastTrigger).toHaveAttribute('aria-current', 'true')
    expect(runningTrigger).not.toHaveAttribute('aria-current')
    expect(h.store.getState().selectedId).toBe(A)
    await selectRunning(0)
    expect(within(runningRows()[0]!).getAllByRole('button')[0]).toHaveAttribute(
      'aria-current',
      'true'
    )
    expect(within((await pastRows())[0]!).getAllByRole('button')[0]).not.toHaveAttribute(
      'aria-current'
    )
  })

  it('表示中の稼働中のセッションを閉じると中央は空の状態に戻る', async () => {
    const h = await setup({ ids: [A] })
    await selectRunning(0)
    h.push([{ sessionId: A, state: 'done', reasonKey: null, claudeAlive: false }])
    act(() => h.store.close(A))
    expect(center()).toHaveAttribute('data-focus', 'none')
    expect(screen.getByTestId('center-empty')).toBeInTheDocument()
  })

  it('一覧の再取得で表示中の過去の行が消えると中央は空の状態に戻る', async () => {
    await setup()
    await selectPast(0)
    act(() => useSessionsStore.getState().setIndex(pastIndex([])))
    expect(center()).toHaveAttribute('data-focus', 'none')
  })

  it('中央のヘッダの題に HTML が含まれても要素にならない (US-4 AC5)', async () => {
    await setup({ index: pastIndex([pastSession({ summary: XSS })]) })
    await selectPast(0)
    const header = within(center()).getByTestId('center-header')
    expect(header.querySelector('img')).toBeNull()
    expect(header).toHaveTextContent(XSS)
    expect((window as { __pwned?: unknown }).__pwned).toBeUndefined()
  })
})

describe('承認待ちの印と読み上げ (US-1 AC6 / AC7 / FR-006)', () => {
  it('過去の会話を表示中でも件数の印と読み上げが出て、件数のボタンで中央が承認待ちのセッションに移る', async () => {
    const h = await setup({ ids: [A] })
    await selectRunning(0)
    await selectPast(0)
    h.emit(A, { kind: 'state', state: 'awaiting_permission' })
    expect(await within(sidebar()).findByTestId('session-nav-awaiting')).toHaveTextContent(
      '承認待ち 1 件'
    )
    expect(screen.getByTestId('session-announcer')).toHaveTextContent(
      '案件フォルダ: 承認待ちになりました。'
    )
    // 見ていないので、選択中の A も移動先になる (watchedId は null)。
    await userEvent.click(within(sidebar()).getByTestId('awaiting-count'))
    expect(center()).toHaveAttribute('data-focus', 'running')
    expect(h.store.getState().selectedId).toBe(A)
  })

  it('設定のダイアログを開いている間も読み上げる (ダイアログは閉じない)', async () => {
    const h = await setup({ ids: [A] })
    await selectRunning(0)
    await userEvent.click(within(sidebar()).getByRole('button', { name: SHELL_LABELS.settings }))
    h.emit(A, { kind: 'state', state: 'awaiting_permission' })
    expect(screen.getByTestId('session-announcer')).toHaveTextContent(
      '案件フォルダ: 承認待ちになりました。'
    )
    expect(screen.getByTestId('settings-dialog')).toBeInTheDocument()
  })
})

describe('サイドバーの畳み (US-1 AC8) と 1 回の操作で届く入口 (SC-007)', () => {
  it('畳むと帯 (新規起動・件数の印・設定) になり、開くと戻る', async () => {
    await setup()
    await userEvent.click(
      within(sidebar()).getByRole('button', { name: SHELL_LABELS.collapseSidebar })
    )
    expect(sidebar()).toHaveAttribute('data-collapsed', 'true')
    expect(
      within(sidebar()).getByRole('button', { name: SHELL_LABELS.newSession })
    ).toBeInTheDocument()
    expect(
      within(sidebar()).getByRole('button', { name: SHELL_LABELS.settings })
    ).toBeInTheDocument()
    expect(screen.queryByTestId('past-sessions')).toBeNull()
    await userEvent.click(
      within(sidebar()).getByRole('button', { name: SHELL_LABELS.expandSidebar })
    )
    expect(sidebar()).toHaveAttribute('data-collapsed', 'false')
  })

  it('起動ダイアログと設定に 1 回の押下で届く', async () => {
    await setup()
    await userEvent.click(within(sidebar()).getByRole('button', { name: SHELL_LABELS.newSession }))
    expect(await screen.findByTestId('launch-dialog-host')).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByTestId('launch-dialog-host')).toBeNull())
    await userEvent.click(within(sidebar()).getByRole('button', { name: SHELL_LABELS.settings }))
    expect(await screen.findByTestId('settings-dialog')).toBeInTheDocument()
  })
})

describe('起動ダイアログ (US-2 AC1〜AC5 / FR-007)', () => {
  it('過去の会話を表示中に開いて閉じると、元の会話のまま', async () => {
    await setup()
    await selectPast(0)
    await userEvent.click(within(sidebar()).getByRole('button', { name: SHELL_LABELS.newSession }))
    await screen.findByTestId('launch-dialog-host')
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByTestId('launch-dialog-host')).toBeNull())
    expect(center()).toHaveAttribute('data-focus', 'past')
  })

  it('起動の受け付けでダイアログが閉じ、そのセッションが稼働中の行になって中央に出る', async () => {
    const h = await setup({ ids: [] })
    await userEvent.click(within(sidebar()).getByRole('button', { name: SHELL_LABELS.newSession }))
    await screen.findByTestId('launch-dialog-host')
    h.launchMock.mockResolvedValueOnce({ status: 'launching', sessionId: B })
    await act(() =>
      h.store.launch({
        folderId: 'folder-1',
        runtimeId: UBUNTU.id,
        providerId: null,
        modelId: null,
        effort: null,
        permissionMode: 'default'
      })
    )
    await waitFor(() => expect(screen.queryByTestId('launch-dialog-host')).toBeNull())
    expect(center()).toHaveAttribute('data-focus', 'running')
    expect(runningRows()).toHaveLength(1)
  })

  it('起動中は Esc で閉じられない', async () => {
    const h = await setup()
    await userEvent.click(within(sidebar()).getByRole('button', { name: SHELL_LABELS.newSession }))
    await screen.findByTestId('launch-dialog-host')
    act(() => h.store.setState((s) => ({ launch: { ...s.launch, phase: 'launching' } })))
    expect(await screen.findByTestId('session-launching')).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    expect(screen.getByTestId('launch-dialog-host')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: SHELL_LABELS.close })).toBeNull()
  })

  it('失敗したセッションを「閉じて起動し直す」と、ダイアログが前回の設定と理由つきで開く (X-4 US-1 AC7)', async () => {
    const h = await setup({ ids: [A] })
    await selectRunning(0)
    h.emit(A, { kind: 'failure', reasonKey: 'provider-error' })
    h.push([{ sessionId: A, state: 'error', reasonKey: 'provider-error', claudeAlive: false }])
    await userEvent.click(await within(center()).findByRole('button', { name: '閉じて起動し直す' }))
    expect(await screen.findByTestId('launch-dialog-host')).toBeInTheDocument()
    expect(h.store.getState().launch.previousFailure).toBe('provider-error')
    expect(center()).toHaveAttribute('data-focus', 'none')
  })
})

describe('設定のダイアログ (US-3 AC1〜AC4 / FR-008 / FR-009 / SC-004)', () => {
  it('左に 4 項目とテーマ、右に選んだ項目の画面。Esc で閉じて「設定」のボタンにフォーカスが戻り、中の画面は外れる', async () => {
    await setup()
    const opener = within(sidebar()).getByRole('button', { name: SHELL_LABELS.settings })
    await userEvent.click(opener)
    const dialog = await screen.findByTestId('settings-dialog')
    const nav = within(dialog).getByRole('navigation', { name: SHELL_LABELS.settingsNav })
    expect(
      within(nav)
        .getAllByRole('button')
        .map((b) => b.textContent)
    ).toEqual(['ランタイム', '作業フォルダ', 'プロバイダ', '組み合わせ'])
    expect(within(dialog).getByText(SHELL_LABELS.theme)).toBeInTheDocument()
    await userEvent.click(within(nav).getByRole('button', { name: 'プロバイダ' }))
    expect(within(dialog).getByTestId('settings-section')).toHaveAttribute(
      'data-section',
      'providers'
    )
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByTestId('settings-dialog')).toBeNull())
    expect(screen.queryByTestId('settings-section')).toBeNull()
    expect(opener).toHaveFocus()
    // 覚えるのは項目の id だけ。
    expect(useUiStore.getState().settings).toEqual({ open: false, section: 'providers' })
  })

  it('一覧の「登録」(seedFolderDraft) で「作業フォルダ」の項目が初期値つきで開き、閉じると押したボタンにフォーカスが戻る', async () => {
    const index: SessionIndexDTO = {
      groups: [
        {
          kind: 'unregistered',
          cwdKey: 'k1',
          location: { kind: 'wsl', distroName: 'Ubuntu' },
          cwd: { namespace: 'wsl:Ubuntu', value: '/home/u/other' },
          cwdDisplay: null,
          suggestedDisplayName: 'other',
          sessions: [pastSession()]
        }
      ],
      outcomes: pastIndex().outcomes,
      fetchedAt: NOW,
      complete: true
    }
    await setup({ index })
    const register = await within(screen.getByTestId('past-sessions')).findByRole('button', {
      name: '作業フォルダとして登録'
    })
    await userEvent.click(register)
    const dialog = await screen.findByTestId('settings-dialog')
    expect(within(dialog).getByTestId('settings-section')).toHaveAttribute(
      'data-section',
      'folders'
    )
    expect(useUiStore.getState().folderDraftSeed?.suggestedDisplayName).toBe('other')
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByTestId('settings-dialog')).toBeNull())
    expect(register).toHaveFocus()
  })
})

describe('右のペイン (US-4 AC1〜AC5 / FR-014 / FR-015)', () => {
  it('開くと「概要」に稼働中の項目が出る。畳むと帯に戻る', async () => {
    await setup({ ids: [A] })
    await selectRunning(0)
    await userEvent.click(screen.getByRole('button', { name: SHELL_LABELS.expandPanel }))
    const panel = screen.getByTestId('right-panel')
    expect(within(panel).getByRole('tab', { name: SHELL_LABELS.overviewTab })).toHaveAttribute(
      'aria-selected',
      'true'
    )
    const overview = await within(panel).findByTestId('overview')
    expect(overview).toHaveTextContent('Provider')
    expect(overview).toHaveTextContent('既定')
    expect(overview).toHaveTextContent('通常 (操作ごとに承認)')
    expect(overview).toHaveTextContent('Ubuntu')
    await userEvent.click(within(panel).getByRole('button', { name: SHELL_LABELS.collapsePanel }))
    expect(screen.getByTestId('right-panel')).toHaveAttribute('data-collapsed', 'true')
  })

  it('過去の行では登録フォルダの配下でもフォルダと所在が出る。値の無い項目は出さない', async () => {
    await setup({ index: pastIndex([pastSession({ gitBranch: null })]) })
    await selectPast(0)
    await userEvent.click(screen.getByRole('button', { name: SHELL_LABELS.expandPanel }))
    const overview = await within(screen.getByTestId('right-panel')).findByTestId('overview')
    expect(overview).toHaveTextContent('フォルダ')
    expect(overview).toHaveTextContent('案件フォルダ')
    expect(overview).toHaveTextContent('所在')
    expect(overview).toHaveTextContent('Ubuntu')
    expect(overview).not.toHaveTextContent('ブランチ')
  })

  it('ブランチ名・フォルダ名の HTML は要素にならない', async () => {
    await setup({
      folders: [folder(XSS)],
      index: pastIndex([pastSession({ gitBranch: XSS })])
    })
    await selectPast(0)
    await userEvent.click(screen.getByRole('button', { name: SHELL_LABELS.expandPanel }))
    const panel = screen.getByTestId('right-panel')
    await within(panel).findByTestId('overview')
    await waitFor(() => expect(panel).toHaveTextContent(XSS))
    expect(panel.querySelector('img')).toBeNull()
    expect(document.querySelector('img[src="x"]')).toBeNull()
  })

  it('未選択は空の状態', async () => {
    await setup()
    await userEvent.click(screen.getByRole('button', { name: SHELL_LABELS.expandPanel }))
    expect(
      within(screen.getByTestId('right-panel')).getByTestId('overview-empty')
    ).toHaveTextContent(SHELL_LABELS.overviewEmpty)
  })

  it('選んでいたタブが出せなくなったら最初のタブに戻る', async () => {
    const pastOnly: PanelTab = {
      id: 'past-only' as PanelTab['id'],
      label: '過去だけ',
      icon: InfoIcon,
      availableFor: ['past'],
      Content: () => <p>過去だけの中身</p>
    }
    const overview: PanelTab = {
      id: 'overview',
      label: SHELL_LABELS.overviewTab,
      icon: InfoIcon,
      availableFor: ['none', 'running', 'past'],
      Content: OverviewTab
    }
    await setup({ ids: [A], panelTabs: [overview, pastOnly] })
    await selectPast(0)
    await userEvent.click(screen.getByRole('button', { name: SHELL_LABELS.expandPanel }))
    await userEvent.click(screen.getByRole('tab', { name: '過去だけ' }))
    expect(screen.getByText('過去だけの中身')).toBeInTheDocument()
    await selectRunning(0)
    expect(screen.queryByRole('tab', { name: '過去だけ' })).toBeNull()
    expect(screen.getByRole('tab', { name: SHELL_LABELS.overviewTab })).toHaveAttribute(
      'aria-selected',
      'true'
    )
  })

  it('狭くなると右 → 左の順に 1 回だけ自動で畳み、利用者が開いたら開く', async () => {
    let callback: ((entries: { contentRect: { width: number } }[]) => void) | null = null
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(cb: typeof callback) {
          callback = cb
        }
        observe(): void {
          // 幅は callback を直接呼んで与える。
        }
        disconnect(): void {
          // 何も持たない。
        }
      }
    )
    useUiStore.setState({ panel: { collapsed: false, tab: 'overview' } })
    await setup()
    const resize = (width: number): void => act(() => callback?.([{ contentRect: { width } }]))
    resize(1100) // 280 + 320 + 480 = 1080 以上
    expect(useUiStore.getState().panel.collapsed).toBe(false)
    resize(1000) // 閾値を割った瞬間: 右を畳む (畳んだ後の閾値 800 を割っていないので左は開いたまま)
    expect(useUiStore.getState().panel.collapsed).toBe(true)
    expect(useUiStore.getState().sidebarCollapsed).toBe(false)
    act(() => useUiStore.getState().setPanelCollapsed(false)) // 利用者が開く
    resize(990) // まだ閾値の下 (割った瞬間ではない) なので畳まない
    expect(useUiStore.getState().panel.collapsed).toBe(false)
    resize(1200)
    resize(700) // 割った瞬間: 右を畳み、それでも 800 を割るので左も畳む
    expect(useUiStore.getState().panel.collapsed).toBe(true)
    expect(useUiStore.getState().sidebarCollapsed).toBe(true)
    resize(1400) // 幅が戻っても自動では開かない
    expect(useUiStore.getState().sidebarCollapsed).toBe(true)
  })
})
