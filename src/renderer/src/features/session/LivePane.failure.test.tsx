import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'

import { SESSION_PORT_MESSAGE } from '@domain/capability'
import type { RuntimeDescriptorDTO } from '@domain/runtime/dto'
import type { LaunchFailureReason, SessionEvent } from '@domain/session/agent-session'
import type { SessionStatusUpdate } from '@domain/session/status-update'
import type { WorkspaceFolderDTO } from '@domain/workspace/dto'

import { useUiStore } from '@/stores/ui'
import { installCapability } from '@/test-support/capability'
import { RunningSessionsHarness } from '@/test-support/running-sessions-harness'

import { launchFailureLabel, launchFailureShortLabel } from './labels'
import { RunningSessionStoreContext } from './running-session-context'
import { createRunningSessionStore, type RunningSessionStore } from './running-session-store'
import { SessionAttentionAnnouncer } from './SessionAttentionAnnouncer'

/**
 * O-4 FE-011 — ターンの失敗の理由の表示 (014 spec US-1 AC1〜AC6 / AC3a / SC-001。data-model §1 / §5)。
 *
 * port の本文 (`failure` → `state: error`。セッションスレッドの `fail()` の順) と状態通知を流し、中央の失敗の表示
 * (`FailureBanner`)・監視ビューの行 (短い理由・全文・ツールチップ)・読み上げ (`SessionAttentionAnnouncer`) を本物で通す。
 * HTTP の状態から理由のキーへの分類は agents の単体 (`session-core.test.ts`) が見る。renderer に届くのは理由のキーだけ。
 */

const NOW = 1_700_000_000_000
const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
const FOLDER_A = 'wf_0123456789aa'
const FOLDER_B = 'wf_0123456789bb'
const AXE_RULES = { rules: { 'color-contrast': { enabled: false } } }

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

function folder(id: string, displayName: string): WorkspaceFolderDTO {
  return {
    id,
    location: { kind: 'wsl', distroName: 'Ubuntu' },
    path: { namespace: 'wsl:Ubuntu', value: `/home/u/${id}` },
    displayName,
    reachability: 'reachable',
    unreachableReason: null,
    blockedReason: null,
    resolutionSteps: [],
    registeredAt: NOW
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
  readonly container: HTMLElement
  readonly emit: (sessionId: string, event: SessionEvent) => void
  readonly push: (updates: readonly SessionStatusUpdate[]) => void
}

let detach: (() => void) | null = null

// 中央に稼働中の会話 (A) を出している。B は見ていないセッション (読み上げの対象)。
beforeEach(() => {
  useUiStore.setState({ focus: 'running', settings: { open: false, section: 'runtimes' } })
})

afterEach(() => {
  detach?.()
  detach = null
  useUiStore.setState({ focus: 'none', settings: { open: false, section: 'runtimes' } })
})

async function setup(): Promise<Harness> {
  let listener: ((u: readonly SessionStatusUpdate[]) => void) | null = null
  const launch = vi.fn()
  launch.mockResolvedValueOnce({ status: 'launching', sessionId: A })
  launch.mockResolvedValueOnce({ status: 'launching', sessionId: B })
  const cap = installCapability({
    listFolders: () =>
      Promise.resolve({
        folders: [folder(FOLDER_A, '案件A'), folder(FOLDER_B, '案件B')],
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
  const ports = new Map<string, FakePort>()
  for (const [id, folderId, label] of [
    [A, FOLDER_A, '案件A'],
    [B, FOLDER_B, '案件B']
  ] as const) {
    await store.launch(
      {
        folderId,
        runtimeId: UBUNTU.id,
        providerId: null,
        modelId: null,
        effort: null,
        permissionMode: 'default'
      },
      label
    )
    const port: FakePort = { onmessage: null, start: vi.fn(), close: vi.fn() }
    deliverPort(id, port)
    ports.set(id, port)
  }
  act(() => store.select(A))
  const { container } = render(
    <RunningSessionStoreContext.Provider value={store}>
      <RunningSessionsHarness />
      <SessionAttentionAnnouncer />
    </RunningSessionStoreContext.Provider>
  )
  return {
    store,
    container,
    emit: (sessionId, event) =>
      act(() => ports.get(sessionId)?.onmessage?.({ data: JSON.stringify(event) })),
    push: (updates) => act(() => listener?.(updates))
  }
}

/** セッションスレッドの `fail()` と同じ順で流す (理由 → `state: error` → 状態通知)。 */
function failAs(h: Harness, sessionId: string, reason: LaunchFailureReason): void {
  h.emit(sessionId, { kind: 'failure', reasonKey: reason })
  h.emit(sessionId, { kind: 'state', state: 'error' })
  h.push([{ sessionId, state: 'error', reasonKey: reason, claudeAlive: true }])
}

/** 中央の失敗の表示 (`role="alert"` で、次の操作のボタンを持つもの)。 */
function failureBanner(): HTMLElement {
  const banner = screen
    .getAllByRole('alert')
    .find((el) => within(el).queryByRole('button', { name: /^閉じて/ }) !== null)
  if (banner === undefined) throw new Error('failure banner')
  return banner
}

async function rowOf(name: string): Promise<HTMLElement> {
  const rows = await screen.findAllByRole('listitem')
  const row = rows.find((r) => within(r).queryByText(name) !== null)
  if (row === undefined) throw new Error(`row ${name}`)
  return row
}

const announcer = (): HTMLElement => screen.getByTestId('session-announcer')

const RELOGIN = '閉じて起動し直す'
const RESTART = '閉じて再起動'

describe('失敗の表示の理由と次の操作 (US-1 AC1〜AC6 / AC3a)', () => {
  it.each([
    // AC1: 401 / 403 → 認証または権限。再ログインの導線
    ['auth-failed', /認証または権限/, RELOGIN],
    // AC2: 429 → 待つ案内。再ログインを案内しない (Quota banner の有無に依らない文言)
    ['rate-limited', /しばらく待ってから/, RESTART],
    // AC3: 5xx → API のエラー
    ['api-error', /API がエラーを返しました/, RESTART],
    // AC3a: billing_error → 請求とアカウントの案内
    ['billing', /請求またはアカウント.*クレジットとアカウント/, RESTART],
    // AC4: 4 つの subtype
    ['max-turns', /ターン数の上限/, RESTART],
    ['max-budget', /費用の上限/, RESTART],
    ['structured-output-retries', /構造化出力の再試行の上限/, RESTART],
    ['execution-error', /実行中にエラーが起きました/, RESTART],
    // AC6: 知らない subtype → 汎用の provider-error と再ログインの導線 (今と同じ)
    ['provider-error', /Provider の認証\/接続/, RELOGIN]
  ] as const)(
    '%s: 理由の全文と次の操作を出し、完了の表示にしない',
    async (reason, text, action) => {
      const h = await setup()
      failAs(h, A, reason)
      const banner = failureBanner()
      expect(banner).toHaveTextContent(text)
      expect(banner).toHaveTextContent(launchFailureLabel(reason))
      expect(within(banner).getByRole('button', { name: action })).toBeInTheDocument()
      // HTTP の状態と失敗の文字列は出さない (renderer に届かない。U-5)
      expect(banner.textContent).not.toMatch(/\b(401|403|429|5\d\d)\b/)
      // AC5: 黙って完了にしない
      const rowA = await rowOf('案件A')
      expect(within(rowA).getByTestId('session-row-status')).toHaveAttribute(
        'data-row-status',
        'failed'
      )
      expect(within(rowA).getByTestId('session-row-status')).not.toHaveTextContent('完了')
    }
  )

  it('4 つの subtype の理由はそれぞれ違う文言になる (AC4)', () => {
    const labels = (
      ['max-turns', 'max-budget', 'structured-output-retries', 'execution-error'] as const
    ).map((reason) => launchFailureLabel(reason))
    expect(new Set(labels).size).toBe(4)
  })
})

describe('監視ビューの行と読み上げが同じ理由 (US-1 AC5)', () => {
  it('見ていないセッションの失敗: 行の全文・短い理由・ツールチップ・読み上げが同じ理由', async () => {
    const h = await setup()
    failAs(h, B, 'rate-limited')
    expect(announcer()).toHaveTextContent(
      `案件B: 失敗しました (${launchFailureShortLabel('rate-limited')})。`
    )
    const rowB = await rowOf('案件B')
    expect(within(rowB).getByTestId('session-row-failure')).toHaveTextContent(
      launchFailureLabel('rate-limited')
    )

    await userEvent.click(screen.getByRole('button', { name: 'コンパクト' }))
    const compactRow = await rowOf('案件B')
    expect(within(compactRow).getByTestId('session-row-failure-short')).toHaveTextContent(
      launchFailureShortLabel('rate-limited')
    )
    const trigger = within(compactRow).getByRole('button', { name: /案件B/ })
    expect(trigger.textContent).toContain(launchFailureLabel('rate-limited'))
    act(() => trigger.focus())
    expect(await screen.findByRole('tooltip')).toHaveTextContent(launchFailureLabel('rate-limited'))
  })

  it('状態通知だけで失敗に入っても (port を通らない失敗)、通知の理由を読む', async () => {
    const h = await setup()
    h.push([{ sessionId: B, state: 'error', reasonKey: 'supervisor-exited', claudeAlive: false }])
    expect(announcer()).toHaveTextContent(
      `案件B: 失敗しました (${launchFailureShortLabel('supervisor-exited')})。`
    )
  })

  it('汎用の provider-error は理由を添えない (今の文のまま)', async () => {
    const h = await setup()
    failAs(h, B, 'provider-error')
    expect(announcer()).toHaveTextContent('案件B: 失敗しました。')
    expect(announcer()).not.toHaveTextContent('Provider')
  })

  it('見ているセッション (A) の失敗は読み上げない (中央の失敗の表示が alert で出る)', async () => {
    const h = await setup()
    failAs(h, A, 'billing')
    expect(announcer()).toHaveTextContent('')
    expect(failureBanner()).toHaveTextContent(launchFailureLabel('billing'))
  })
})

describe('vitest-axe', () => {
  it('失敗の表示と失敗の行を出した状態で違反 0', async () => {
    const h = await setup()
    failAs(h, A, 'auth-failed')
    failAs(h, B, 'rate-limited')
    await rowOf('案件B')
    expect((await axe(h.container, AXE_RULES)).violations).toEqual([])
  })
})
