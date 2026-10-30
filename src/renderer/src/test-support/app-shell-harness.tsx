import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, vi } from 'vitest'

import { SESSION_PORT_MESSAGE } from '@domain/capability'
import type { RuntimeDescriptorDTO } from '@domain/runtime/dto'
import type { SessionEvent } from '@domain/session/agent-session'
import type {
  EnumerationOutcomeDTO,
  SessionGroupDTO,
  SessionIndexDTO,
  SessionSummaryDTO
} from '@domain/session/dto'
import type { SessionLaunchConfig } from '@domain/session/launch-config'
import type { SessionStatusUpdate } from '@domain/session/status-update'
import type { WorkspaceFolderDTO } from '@domain/workspace/dto'

import { TooltipProvider } from '@/components/ui/tooltip'
import { RunningSessionStoreContext } from '@/features/session/running-session-context'
import {
  createRunningSessionStore,
  type RunningSessionStore
} from '@/features/session/running-session-store'
import { SessionAttentionAnnouncer } from '@/features/session/SessionAttentionAnnouncer'
import { AppShell } from '@/features/shell/AppShell'
import type { PanelTab } from '@/features/shell/panel-tabs'
import { useSessionsStore } from '@/stores/sessions'
import { useUiStore } from '@/stores/ui'
import { installCapability } from '@/test-support/capability'
import { DEFAULT_EXTRA_AXES } from '@domain/session/launch-config'

/**
 * シェル全体 (`AppShell`) を描くテストの共通の setup (O-4 FE-030 / 014 research R-12。O-7 の `AppShell.test.tsx` から移した)。
 * 稼働中のストアと過去の一覧のストアは本物を使い、preload だけをスタブする。
 *
 * - 右のペインのタブのテスト (`RightPanel.tabs.test.tsx`) を `AppShell.test.tsx` に足さないために出した (O-7 code-gate
 *   convention M-008 / 014 spec FR-017)
 * - **過去ログの中身 (`useTranscript`) を差し替えるテストは、そのファイルで `vi.mock` を書く** (vitest の `vi.mock` は
 *   ファイルごとに要る。`AppShell.test.tsx` の `vi.mock('@/features/chat/useTranscript', …)`)。差し替えなければ、過去ログの
 *   取得 (`getTranscript`) は解決せず読み込み中のまま
 * - 面の状態と過去の一覧のストアの初期化・ストアの外し・global の戻しは `registerAppShellHooks()` が登録する
 */

/**
 * 2026-10-05T09:00:00Z (`Date.UTC(2026, 9, 5, 9, 0)`)。数で書くのは、大文字の名前の呼び出し式の export を
 * `react-refresh/only-export-components` が component とみなし、この補助の他の export を落とすため。
 */
export const NOW = 1_791_190_800_000
export const A = '11111111-1111-4111-8111-111111111111'
export const B = '22222222-2222-4222-8222-222222222222'
export const XSS = '<img src=x onerror="window.__pwned=1">'

export const UBUNTU: RuntimeDescriptorDTO = {
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

export function folder(displayName = '案件フォルダ'): WorkspaceFolderDTO {
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

export function pastSession(overrides: Partial<SessionSummaryDTO> = {}): SessionSummaryDTO {
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

export function pastIndex(
  sessions: readonly SessionSummaryDTO[] = [pastSession()]
): SessionIndexDTO {
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

export interface FakePort {
  onmessage: ((event: { data: unknown }) => void) | null
  start: () => void
  close: () => void
}

export function deliverPort(sessionId: string, port: FakePort): void {
  const event = new Event('message') as Event & { data: unknown; ports: unknown[] }
  event.data = { marker: SESSION_PORT_MESSAGE, sessionId }
  event.ports = [port]
  Object.defineProperty(event, 'origin', { value: window.location.origin })
  Object.defineProperty(event, 'source', { value: window })
  window.dispatchEvent(event)
}

export interface Harness {
  readonly store: RunningSessionStore
  readonly emit: (sessionId: string, event: SessionEvent) => void
  readonly push: (updates: readonly SessionStatusUpdate[]) => void
  readonly container: HTMLElement
  readonly launchMock: ReturnType<typeof vi.fn>
  readonly sendMock: ReturnType<typeof vi.fn>
}

let detach: (() => void) | null = null

/**
 * 各テストの前に面の状態と過去の一覧のストアを既定に戻し、後にストアを外して global を戻す hook を登録する。
 * テストファイルの最上位で 1 回呼ぶ。
 */
export function registerAppShellHooks(): void {
  beforeEach(() => {
    useUiStore.setState({
      focus: 'none',
      settings: { open: false, section: 'runtimes' },
      sidebarCollapsed: false,
      panel: { collapsed: true, tab: 'overview' },
      launchOpen: false,
      folderDraftSeed: null,
      transcriptDensity: 'comfortable',
      // シェルは Command palette を持つ (O-3)。前のテストの開閉と会話内検索の要求を持ち越さない。
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
}

export async function setup(
  options: {
    readonly ids?: readonly string[]
    readonly folders?: readonly WorkspaceFolderDTO[]
    readonly index?: SessionIndexDTO
    readonly panelTabs?: readonly PanelTab[]
    /** Provider の一覧の取得 (既定は 0 件で解決)。 */
    readonly providers?: 'loading' | 'failed'
    /** `ids` を起動するときの設定の上書き (既定は Provider もモデルも無い `default`)。 */
    readonly launchConfig?: Partial<SessionLaunchConfig>
  } = {}
): Promise<Harness> {
  const ids = options.ids ?? []
  let listener: ((u: readonly SessionStatusUpdate[]) => void) | null = null
  const launch = vi.fn()
  for (const id of ids) launch.mockResolvedValueOnce({ status: 'launching', sessionId: id })
  const send = vi.fn().mockResolvedValue(undefined)
  const cap = installCapability({
    listFolders: () =>
      Promise.resolve({
        folders: options.folders ?? [folder()],
        restoreIssues: { skipped: 0, reasonKeys: [], backupPath: null }
      }),
    listRuntimes: () =>
      Promise.resolve({ runtimes: [UBUNTU], enumerationIssues: [], wslAvailability: 'available' }),
    listSessions: () => Promise.resolve(options.index ?? pastIndex()),
    listProviders: () =>
      options.providers === 'loading'
        ? new Promise<never>(() => undefined)
        : options.providers === 'failed'
          ? Promise.reject(new Error('取得の失敗'))
          : Promise.resolve([]),
    getTranscript: () => new Promise<never>(() => undefined),
    launchSession: launch,
    killSession: vi.fn(async () => {}),
    setSessionPermissionMode: vi.fn(async () => ({ ok: true as const })),
    setSessionModel: vi.fn(async () => ({ ok: true as const })),
    listSessionModels: vi.fn(async () => ({
      ok: true as const,
      models: [] as readonly { id: string; displayName: string }[],
      reportedCount: 0
    })),
    renameSession: vi.fn(async (_sessionId: string, name: string) => ({ ok: true as const, name })),
    endSession: vi.fn(async () => {}),
    interruptSession: vi.fn(async () => {}),
    sendPrompt: send,
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
        permissionMode: 'default',
        ...DEFAULT_EXTRA_AXES,
        sessionName: null,
        ...options.launchConfig
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
    sendMock: send,
    emit: (sessionId, event) =>
      act(() => ports.get(sessionId)?.onmessage?.({ data: JSON.stringify(event) })),
    push: (updates) => act(() => listener?.(updates))
  }
}

export const sidebar = (): HTMLElement => screen.getByTestId('sidebar')
export const center = (): HTMLElement => screen.getByTestId('center')
export const THREAD_ROW = '[data-slot="aui_thread-list-item"]'
export const runningRows = (): HTMLElement[] =>
  Array.from(screen.getByTestId('session-list').querySelectorAll<HTMLElement>(THREAD_ROW))
/** 過去の区画の行 (列挙の結果の行など、ほかの listitem を拾わない)。 */
export const pastRows = async (): Promise<HTMLElement[]> =>
  waitFor(() => {
    const rows = Array.from(
      screen.getByTestId('past-sessions').querySelectorAll<HTMLElement>(THREAD_ROW)
    )
    expect(rows.length).toBeGreaterThan(0)
    return rows
  })

export async function selectRunning(index: number): Promise<void> {
  await userEvent.click(within(runningRows()[index]!).getAllByRole('button')[0]!)
}

export async function selectPast(index: number): Promise<void> {
  const rows = await pastRows()
  await userEvent.click(within(rows[index]!).getAllByRole('button')[0]!)
}
