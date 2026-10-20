import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent, { PointerEventsCheckLevel } from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'

import type { ThreadMessageLike } from '@assistant-ui/react'

import { SESSION_PORT_MESSAGE } from '@domain/capability'
import type { RuntimeDescriptorDTO } from '@domain/runtime/dto'
import type { SessionEvent } from '@domain/session/agent-session'
import type { SessionIndexDTO, SessionSummaryDTO } from '@domain/session/dto'
import type { SessionStatusUpdate } from '@domain/session/status-update'
import { sessionRowKey } from '@domain/session/summary'
import type { WorkspaceFolderDTO } from '@domain/workspace/dto'

import { TooltipProvider } from '@/components/ui/tooltip'
import { COMPOSER_LABELS, CONVERSATION_SEARCH_LABELS } from '@/features/chat/labels'
import { RunningSessionStoreContext } from '@/features/session/running-session-context'
import {
  createRunningSessionStore,
  type RunningSessionStore
} from '@/features/session/running-session-store'
import { SessionAttentionAnnouncer } from '@/features/session/SessionAttentionAnnouncer'
import { useSessionsStore } from '@/stores/sessions'
import { useUiStore, watchedIdOf } from '@/stores/ui'
import { installCapability } from '@/test-support/capability'

import { AppShell } from './AppShell'
import { PALETTE_LABELS, SETTINGS_SECTION_LABELS, SHELL_LABELS } from './labels'

/*
 * 過去ログの取得 (`useTranscript`) だけを差し替える (AppShell.test.tsx と同じ)。既定は「読み込み中」。
 */
const { transcript } = vi.hoisted(() => ({
  transcript: {
    messages: [] as readonly ThreadMessageLike[],
    status: 'loading' as 'idle' | 'loading' | 'ready' | 'empty' | 'failed',
    reasonKey: null,
    retry: () => {},
    hasSelection: true
  }
}))
vi.mock('@/features/chat/useTranscript', () => ({ useTranscript: () => transcript }))

/**
 * O-3 FE-032 — Command palette (spec FR-006 / FR-007 / US-3 AC1〜AC6 / SC-003 / 012 data-model §3)。
 * シェルごと描く (稼働中のストアと過去の一覧のストアは本物。preload だけをスタブする)。
 */

const NOW = Date.UTC(2026, 9, 5, 9, 0)
const A = '11111111-1111-4111-8111-111111111111'
const P1 = '33333333-3333-4333-8333-333333333333'

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
  id: 'folder-1',
  location: { kind: 'wsl', distroName: 'Ubuntu' },
  path: { namespace: 'wsl:Ubuntu', value: '/home/u/proj' },
  displayName: '案件フォルダ',
  reachability: 'reachable',
  unreachableReason: null,
  blockedReason: null,
  resolutionSteps: [],
  registeredAt: NOW
}

function pastSession(overrides: Partial<SessionSummaryDTO> = {}): SessionSummaryDTO {
  return {
    sessionId: P1,
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
  return {
    groups: [{ kind: 'folder', folderId: FOLDER.id, boundary: 'native', sessions }],
    outcomes: [
      {
        location: { kind: 'wsl', distroName: 'Ubuntu' },
        targetKey: 'wsl:Ubuntu#0',
        targetLabel: 'u',
        status: 'ok',
        reasonKey: null,
        count: sessions.length,
        truncated: false,
        fetchedAt: NOW
      }
    ],
    fetchedAt: NOW,
    complete: true
  }
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
}

let detach: (() => void) | null = null

beforeEach(() => {
  transcript.messages = []
  transcript.status = 'loading'
  useUiStore.setState({
    focus: 'none',
    settings: { open: false, section: 'runtimes' },
    sidebarCollapsed: false,
    panel: { collapsed: true, tab: 'overview' },
    launchOpen: false,
    folderDraftSeed: null,
    transcriptDensity: 'comfortable',
    paletteOpen: false,
    conversationSearchRequest: 0
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
  options: { readonly ids?: readonly string[]; readonly index?: SessionIndexDTO } = {}
): Promise<Harness> {
  const ids = options.ids ?? []
  let listener: ((u: readonly SessionStatusUpdate[]) => void) | null = null
  const launch = vi.fn()
  for (const id of ids) launch.mockResolvedValueOnce({ status: 'launching', sessionId: id })
  const cap = installCapability({
    listFolders: () =>
      Promise.resolve({
        folders: [FOLDER],
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
    sendPrompt: vi.fn().mockResolvedValue(undefined),
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
        folderId: FOLDER.id,
        runtimeId: UBUNTU.id,
        providerId: null,
        modelId: null,
        effort: null,
        permissionMode: 'default'
      },
      FOLDER.displayName
    )
    const port: FakePort = { onmessage: null, start: vi.fn(), close: vi.fn() }
    deliverPort(id, port)
    ports.set(id, port)
  }
  useUiStore.setState({ focus: 'none', launchOpen: false })
  render(
    <RunningSessionStoreContext.Provider value={store}>
      <TooltipProvider>
        <SessionAttentionAnnouncer />
        <AppShell />
      </TooltipProvider>
    </RunningSessionStoreContext.Provider>
  )
  // 過去の一覧と登録フォルダの一覧 (候補のグループの表示に要る) が届くまで待つ。
  await waitFor(() =>
    expect(
      screen.getByTestId('past-sessions').querySelectorAll('[data-slot="aui_thread-list-item"]')
        .length
    ).toBeGreaterThan(0)
  )
  return {
    store,
    emit: (sessionId, event) =>
      act(() => ports.get(sessionId)?.onmessage?.({ data: JSON.stringify(event) })),
    push: (updates) => act(() => listener?.(updates))
  }
}

const sidebar = (): HTMLElement => screen.getByTestId('sidebar')
const center = (): HTMLElement => screen.getByTestId('center')
const palette = (): HTMLElement | null => screen.queryByTestId('command-palette')
const paletteInput = (): HTMLElement =>
  screen.getByRole('combobox', { name: PALETTE_LABELS.paletteInput })
const options = (): HTMLElement[] =>
  within(screen.getByRole('listbox', { name: PALETTE_LABELS.paletteTitle })).queryAllByRole(
    'option'
  )
const optionNames = (): string[] => options().map((option) => option.textContent ?? '')

/** フォーカスのある要素で Ctrl+K を押す。`preventDefault` されなければ true。 */
function ctrlK(init: KeyboardEventInit = {}): boolean {
  return fireEvent.keyDown(document.activeElement ?? document.body, {
    key: 'k',
    ctrlKey: true,
    ...init
  })
}

/** Ctrl+K で開き、入力欄にフォーカスが移るまで待つ。 */
async function openPalette(): Promise<HTMLElement> {
  expect(ctrlK()).toBe(false)
  const dialog = await screen.findByRole('dialog', { name: PALETTE_LABELS.paletteTitle })
  await waitFor(() => expect(paletteInput()).toHaveFocus())
  return dialog
}

function typeQuery(query: string): void {
  fireEvent.change(paletteInput(), { target: { value: query } })
}

/** 現在の候補 (`aria-activedescendant` が指す option)。 */
function activeOption(): HTMLElement | null {
  const id = paletteInput().getAttribute('aria-activedescendant')
  return id === null ? null : document.getElementById(id)
}

async function runActive(): Promise<void> {
  expect(fireEvent.keyDown(paletteInput(), { key: 'Enter' })).toBe(false)
  await waitFor(() => expect(palette()).toBeNull())
}

async function selectRunningRow(): Promise<void> {
  const row = screen
    .getByTestId('session-list')
    .querySelector<HTMLElement>('[data-slot="aui_thread-list-item"]')
  await userEvent.click(within(row!).getAllByRole('button')[0]!)
  expect(center()).toHaveAttribute('data-focus', 'running')
}

/** いちばん上のダイアログの外側 (overlay) を押す (AppShell.test.tsx の `pressOutside` と同じ)。 */
async function pressOutside(): Promise<void> {
  await act(() => new Promise((resolve) => setTimeout(resolve, 0)))
  const overlays = document.querySelectorAll<HTMLElement>('[data-slot="dialog-overlay"]')
  const overlay = overlays[overlays.length - 1]
  expect(overlay).toBeDefined()
  await userEvent.setup({ pointerEventsCheck: PointerEventsCheckLevel.Never }).click(overlay!)
}

const AXE_RULES = { rules: { 'color-contrast': { enabled: false } } }

describe('開く・閉じる (US-3 AC1 / AC4 / AC5 / FR-006)', () => {
  it('Ctrl+K で開いて入力欄にフォーカスが移る。名前は「コマンド」。開いている間の Ctrl+K は何もしない', async () => {
    await setup()
    const dialog = await openPalette()
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(useUiStore.getState().paletteOpen).toBe(true)
    const input = paletteInput()
    expect(input).toHaveAttribute('aria-expanded', 'true')
    expect(document.getElementById(input.getAttribute('aria-controls') ?? '')).toHaveAttribute(
      'role',
      'listbox'
    )
    // 開いている間の Ctrl+K は何もしない (preventDefault もしない)。
    expect(ctrlK()).toBe(true)
    expect(screen.getAllByRole('dialog', { name: PALETTE_LABELS.paletteTitle })).toHaveLength(1)
  })

  it('モーダルのダイアログ (起動・設定、ほかの aria-modal の要素) が開いている間は開かず、preventDefault もしない', async () => {
    await setup()
    await userEvent.click(within(sidebar()).getByRole('button', { name: SHELL_LABELS.newSession }))
    await screen.findByTestId('launch-dialog-host')
    expect(ctrlK()).toBe(true)
    expect(palette()).toBeNull()
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByTestId('launch-dialog-host')).toBeNull())

    await userEvent.click(within(sidebar()).getByRole('button', { name: SHELL_LABELS.settings }))
    await screen.findByTestId('settings-dialog')
    expect(ctrlK()).toBe(true)
    expect(palette()).toBeNull()
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByTestId('settings-dialog')).toBeNull())

    // 画像のダイアログ (`components/image.tsx`) は自前で aria-modal を出す。同じ印で判定する。
    const modal = document.createElement('div')
    modal.setAttribute('aria-modal', 'true')
    document.body.append(modal)
    try {
      expect(ctrlK()).toBe(true)
      expect(palette()).toBeNull()
    } finally {
      modal.remove()
    }
    // どれも閉じた後は開く。
    await openPalette()
  })

  it('Esc で閉じて、開く前の要素へフォーカスが戻る', async () => {
    await setup()
    const opener = within(sidebar()).getByRole('button', { name: SHELL_LABELS.settings })
    act(() => opener.focus())
    await openPalette()
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(palette()).toBeNull())
    await waitFor(() => expect(opener).toHaveFocus())
    expect(useUiStore.getState().paletteOpen).toBe(false)
    // 何も実行しない。
    expect(useUiStore.getState().settings.open).toBe(false)
  })

  it('外の押下で閉じて、開く前の要素へフォーカスが戻る', async () => {
    await setup()
    const opener = within(sidebar()).getByRole('button', { name: SHELL_LABELS.settings })
    act(() => opener.focus())
    await openPalette()
    await pressOutside()
    await waitFor(() => expect(palette()).toBeNull())
    await waitFor(() => expect(opener).toHaveFocus())
  })

  it('開く前の要素が消えていたら、閉じたときサイドバーの「新規起動」へ移る', async () => {
    await setup()
    const opener = within(center()).getByRole('button', { name: SHELL_LABELS.centerEmptyLaunch })
    act(() => opener.focus())
    await openPalette()
    // 開いている間に過去の行が選ばれ、中央の空の状態 (開く前の要素) が消えた。
    act(() => useSessionsStore.getState().select(sessionRowKey(pastSession())))
    expect(opener.isConnected).toBe(false)
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(palette()).toBeNull())
    await waitFor(() =>
      expect(within(sidebar()).getByRole('button', { name: SHELL_LABELS.newSession })).toHaveFocus()
    )
  })

  it('composer にフォーカスがあっても変換中でなければ開く。変換中の Ctrl+K では開かず preventDefault しない', async () => {
    await setup({ ids: [A] })
    await selectRunningRow()
    const composer = within(center()).getByRole('textbox', { name: COMPOSER_LABELS.composerInput })
    act(() => composer.focus())

    expect(ctrlK({ isComposing: true })).toBe(true)
    expect(ctrlK({ keyCode: 229 })).toBe(true)
    expect(palette()).toBeNull()

    await openPalette()
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(palette()).toBeNull())
    await waitFor(() => expect(composer).toHaveFocus())
  })

  it('palette の ↑↓ / Enter / Esc は変換中は何もしない (↑↓ / Enter は preventDefault もしない)', async () => {
    await setup()
    await openPalette()
    const first = activeOption()
    expect(first).not.toBeNull()

    expect(fireEvent.keyDown(paletteInput(), { key: 'ArrowDown', isComposing: true })).toBe(true)
    expect(fireEvent.keyDown(paletteInput(), { key: 'ArrowUp', keyCode: 229 })).toBe(true)
    expect(activeOption()).toBe(first)
    expect(fireEvent.keyDown(paletteInput(), { key: 'Enter', isComposing: true })).toBe(true)
    expect(fireEvent.keyDown(paletteInput(), { key: 'Enter', keyCode: 229 })).toBe(true)
    fireEvent.keyDown(paletteInput(), { key: 'Escape', isComposing: true })
    fireEvent.keyDown(paletteInput(), { key: 'Escape', keyCode: 229 })
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)))
    expect(palette()).not.toBeNull()
    expect(useUiStore.getState().launchOpen).toBe(false)
  })
})

describe('候補と実行 (US-3 AC2 / AC3 / AC6 / FR-007)', () => {
  it('語で操作とセッションが候補に出て、セッションには種別が添えられる。0 件は文言を出す。vitest-axe の違反 0', async () => {
    await setup({ ids: [A] })
    const dialog = await openPalette()
    // 語が空のときは操作だけ。
    expect(optionNames()[0]).toBe(PALETTE_LABELS.paletteLaunch)
    expect(within(dialog).queryByText(PALETTE_LABELS.paletteKindPast)).toBeNull()
    expect((await axe(dialog, AXE_RULES)).violations).toEqual([])

    typeQuery('案件')
    await waitFor(() => expect(options()).toHaveLength(2))
    const [running, past] = options()
    expect(running).toHaveTextContent(FOLDER.displayName)
    expect(running).toHaveTextContent(PALETTE_LABELS.paletteKindRunning)
    expect(past).toHaveTextContent('過去の作業')
    expect(past).toHaveTextContent(PALETTE_LABELS.paletteKindPast)
    expect(
      within(dialog).getByRole('group', { name: PALETTE_LABELS.paletteGroupSessions })
    ).toContainElement(past!)
    expect((await axe(dialog, AXE_RULES)).violations).toEqual([])

    typeQuery('設定')
    expect(optionNames()).toEqual(
      Object.values(SETTINGS_SECTION_LABELS).map((label) => PALETTE_LABELS.paletteSettings(label))
    )
    expect(
      within(dialog).getByRole('group', { name: PALETTE_LABELS.paletteGroupActions })
    ).toBeInTheDocument()

    typeQuery('一致しない語')
    expect(options()).toHaveLength(0)
    const empty = within(dialog).getByTestId('palette-empty')
    expect(empty).toHaveTextContent(PALETTE_LABELS.paletteNone)
    expect(empty).toHaveTextContent(PALETTE_LABELS.paletteNoneHint)
    expect(paletteInput()).toHaveAttribute('aria-expanded', 'false')
    expect(paletteInput()).not.toHaveAttribute('aria-activedescendant')
    expect((await axe(dialog, AXE_RULES)).violations).toEqual([])
  })

  it('↑↓ で選び Enter で閉じて実行する。実行は palette の内容が外れた後で、設定のダイアログが選んだ項目で開く', async () => {
    await setup()
    const opener = within(sidebar()).getByRole('button', { name: SHELL_LABELS.newSession })
    act(() => opener.focus())
    await openPalette()
    expect(activeOption()).toBe(options()[0])
    // ↑ は反対の端へ、↓ で 1 つずつ進む。
    fireEvent.keyDown(paletteInput(), { key: 'ArrowUp' })
    expect(activeOption()).toBe(options().at(-1))
    fireEvent.keyDown(paletteInput(), { key: 'ArrowDown' })
    expect(activeOption()).toBe(options()[0])
    fireEvent.keyDown(paletteInput(), { key: 'ArrowDown' })
    fireEvent.keyDown(paletteInput(), { key: 'ArrowDown' })
    expect(activeOption()).toHaveTextContent(
      PALETTE_LABELS.paletteSettings(SETTINGS_SECTION_LABELS.folders)
    )
    expect(activeOption()).toHaveAttribute('aria-selected', 'true')

    let mountedAtRun: boolean | null = null
    const unsubscribe = useUiStore.subscribe((next, prev) => {
      if (next.settings.open && !prev.settings.open) mountedAtRun = palette() !== null
    })
    try {
      await runActive()
      const settings = await screen.findByTestId('settings-dialog')
      expect(within(settings).getByTestId('settings-section')).toHaveAttribute(
        'data-section',
        'folders'
      )
      expect(mountedAtRun).toBe(false)
      // 開いたダイアログの初期のフォーカス。閉じると palette を開く前の要素へ戻る。
      await waitFor(() => expect(settings.contains(document.activeElement)).toBe(true))
      await userEvent.keyboard('{Escape}')
      await waitFor(() => expect(screen.queryByTestId('settings-dialog')).toBeNull())
      await waitFor(() => expect(opener).toHaveFocus())
    } finally {
      unsubscribe()
    }
  })

  it('新規起動: 起動ダイアログの初期のフォーカスに移り、起動ダイアログを閉じると palette を開く前の要素へ戻る', async () => {
    await setup()
    const opener = within(sidebar()).getByRole('button', { name: SHELL_LABELS.settings })
    act(() => opener.focus())
    await openPalette()
    typeQuery('起動')
    expect(activeOption()).toHaveTextContent(PALETTE_LABELS.paletteLaunch)
    await runActive()
    const host = await screen.findByTestId('launch-dialog-host')
    await waitFor(() => expect(host.contains(document.activeElement)).toBe(true))
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByTestId('launch-dialog-host')).toBeNull())
    await waitFor(() => expect(opener).toHaveFocus())
  })

  it('稼働中・過去のセッションの候補で中央が切り替わり (focus は useShellFocus が書く)、フォーカスは中央へ移る', async () => {
    const h = await setup({ ids: [A] })
    const opener = within(sidebar()).getByRole('button', { name: SHELL_LABELS.settings })

    // 過去の候補 (composer は無効なので、フォーカスは中央の main に留まる)。
    act(() => opener.focus())
    await openPalette()
    typeQuery('過去の作業')
    await waitFor(() => expect(options()).toHaveLength(1))
    let selectedWhileMounted: boolean | null = null
    const unsubscribe = useSessionsStore.subscribe((next, prev) => {
      if (next.selectionSeq !== prev.selectionSeq) selectedWhileMounted = palette() !== null
    })
    try {
      await runActive()
      await waitFor(() => expect(center()).toHaveAttribute('data-focus', 'past'))
      expect(selectedWhileMounted).toBe(false)
    } finally {
      unsubscribe()
    }
    expect(useSessionsStore.getState().selectedRowKey).toBe(sessionRowKey(pastSession()))
    expect(within(center()).getByTestId('past-title')).toHaveTextContent('過去の作業')
    await waitFor(() => expect(center()).toHaveFocus())

    // 稼働中の候補。中央の中身が入れ替わる (前の会話の要素は消えうる) ので中央へ移す。稼働中の composer は
    // 表示のときに自分でフォーカスを取るので (autoFocus。O-7 pr-gate R2 (1) の持ち主のまま)、行き先は中央の中。
    act(() => opener.focus())
    await openPalette()
    typeQuery(FOLDER.displayName)
    await waitFor(() => expect(options()[0]).toHaveTextContent(PALETTE_LABELS.paletteKindRunning))
    await runActive()
    await waitFor(() => expect(center()).toHaveAttribute('data-focus', 'running'))
    expect(h.store.getState().selectedId).toBe(A)
    await waitFor(() => expect(center().contains(document.activeElement)).toBe(true))
  })

  it('選んだ行が実行の前に消えていたら、中央は空の状態でフォーカスは中央の main (過去・稼働中)', async () => {
    const h = await setup({ ids: [A] })
    const opener = within(sidebar()).getByRole('button', { name: SHELL_LABELS.settings })

    act(() => opener.focus())
    await openPalette()
    typeQuery('過去の作業')
    await waitFor(() => expect(options()).toHaveLength(1))
    // Enter で操作を覚えて閉じ、実行 (閉じた後) の前に一覧の再取得で行が消える。
    act(() => {
      fireEvent.keyDown(paletteInput(), { key: 'Enter' })
      useSessionsStore.getState().setIndex(pastIndex([]))
    })
    await waitFor(() => expect(palette()).toBeNull())
    await waitFor(() => expect(useSessionsStore.getState().selectionSeq).toBe(1))
    expect(center()).toHaveAttribute('data-focus', 'none')
    expect(screen.getByTestId('center-empty')).toBeInTheDocument()
    await waitFor(() => expect(center()).toHaveFocus())

    act(() => opener.focus())
    await openPalette()
    typeQuery(FOLDER.displayName)
    await waitFor(() => expect(options()).toHaveLength(1))
    h.push([{ sessionId: A, state: 'done', reasonKey: null, claudeAlive: false }])
    act(() => {
      fireEvent.keyDown(paletteInput(), { key: 'Enter' })
      h.store.close(A)
    })
    await waitFor(() => expect(palette()).toBeNull())
    await waitFor(() => expect(h.store.getState().selectedId).toBe(A))
    expect(screen.getByTestId('center-empty')).toBeInTheDocument()
    await waitFor(() => expect(center()).toHaveFocus())
  })

  it('palette を開いている間は watchedId が null で、選ばれていたセッションの承認待ちも読み上げる', async () => {
    const h = await setup({ ids: [A] })
    await selectRunningRow()
    expect(watchedIdOf(useUiStore.getState(), A)).toBe(A)
    await openPalette()
    expect(watchedIdOf(useUiStore.getState(), A)).toBeNull()
    h.emit(A, { kind: 'state', state: 'awaiting_permission' })
    expect(screen.getByTestId('session-announcer')).toHaveTextContent(
      `${FOLDER.displayName}: 承認待ちになりました。`
    )
  })

  it('「会話内を検索」で検索のバーが開いて入力欄へ。開いていれば入力欄へフォーカスを移すだけ。palette の間の Ctrl+F では開かない', async () => {
    await setup({ ids: [A] })
    await selectRunningRow()
    const composer = within(center()).getByRole('textbox', { name: COMPOSER_LABELS.composerInput })
    const searchbox = (): HTMLElement =>
      within(screen.getByTestId('conversation-search')).getByRole('searchbox', {
        name: CONVERSATION_SEARCH_LABELS.searchOpen
      })

    act(() => composer.focus())
    await openPalette()
    // palette を開いている間の Ctrl+F は会話内検索を開かない (preventDefault もしない)。
    expect(fireEvent.keyDown(paletteInput(), { key: 'f', ctrlKey: true })).toBe(true)
    expect(screen.queryByTestId('conversation-search')).toBeNull()

    typeQuery('会話内')
    expect(optionNames()).toEqual([PALETTE_LABELS.paletteChatSearch])
    await runActive()
    await waitFor(() => expect(searchbox()).toHaveFocus())

    // 開いているときは入力欄へフォーカスを移すだけ (バーは 1 つのまま)。
    act(() => composer.focus())
    await openPalette()
    typeQuery('会話内')
    await runActive()
    await waitFor(() => expect(searchbox()).toHaveFocus())
    expect(screen.getAllByTestId('conversation-search')).toHaveLength(1)
  })

  it('サイドバーを畳む操作で、開く前の要素がサイドバーの中なら畳んだ帯 (開閉のボタン) へ移る。密度の切り替えでは開く前の要素へ戻る', async () => {
    await setup({ ids: [A] })
    await selectRunningRow()
    const opener = within(sidebar()).getByRole('button', { name: SHELL_LABELS.settings })

    act(() => opener.focus())
    await openPalette()
    typeQuery('transcript')
    await runActive()
    expect(useUiStore.getState().transcriptDensity).toBe('compact')
    await waitFor(() => expect(opener).toHaveFocus())

    await openPalette()
    typeQuery(SHELL_LABELS.collapseSidebar)
    expect(optionNames()).toEqual([SHELL_LABELS.collapseSidebar])
    await runActive()
    expect(useUiStore.getState().sidebarCollapsed).toBe(true)
    await waitFor(() =>
      expect(
        within(sidebar()).getByRole('button', { name: SHELL_LABELS.expandSidebar })
      ).toHaveFocus()
    )
  })

  it('sessionId と targetKey に " ] : \\ # と空白を含む過去の行で、↑↓ のたびに aria-activedescendant が実在の option を指し、Enter でその行の rowKey が選ばれる。DOM の id に外部の値が出ない', async () => {
    const odd = [
      pastSession({
        sessionId: 'a"],[data-x="b',
        targetKey: 'wsl:Ubuntu#0 "x"]',
        summary: '特殊な行 1'
      }),
      pastSession({ sessionId: 'c:d]e\\f #g h', targetKey: 'wsl:U b#1', summary: '特殊な行 2' })
    ]
    await setup({ index: pastIndex(odd) })
    const dialog = await openPalette()
    typeQuery('特殊')
    await waitFor(() => expect(options()).toHaveLength(2))

    const expectActive = (at: number): void => {
      const id = paletteInput().getAttribute('aria-activedescendant')
      expect(id).not.toBeNull()
      const element = document.getElementById(id!)
      expect(element).not.toBeNull()
      expect(element).toBe(options()[at])
    }
    expectActive(0)
    fireEvent.keyDown(paletteInput(), { key: 'ArrowDown' })
    expectActive(1)
    fireEvent.keyDown(paletteInput(), { key: 'ArrowDown' })
    expectActive(0)
    fireEvent.keyDown(paletteInput(), { key: 'ArrowUp' })
    expectActive(1)

    const ids = Array.from(dialog.querySelectorAll('[id]'), (element) => element.id)
    const refs = Array.from(dialog.querySelectorAll('*')).flatMap((element) =>
      ['aria-activedescendant', 'aria-controls', 'aria-labelledby'].map(
        (name) => element.getAttribute(name) ?? ''
      )
    )
    for (const value of [...ids, ...refs]) {
      for (const s of odd) {
        expect(value).not.toContain(s.sessionId)
        expect(value).not.toContain(s.targetKey)
      }
      expect(value).not.toContain('\u0000')
    }

    await runActive()
    expect(useSessionsStore.getState().selectedRowKey).toBe(sessionRowKey(odd[1]!))
    await waitFor(() => expect(center()).toHaveAttribute('data-focus', 'past'))
  })
})
