import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'

import { SESSION_PORT_MESSAGE, type ClostaCapability } from '@domain/capability'
import type { AutoModeStatus } from '@domain/runtime/capabilities'
import type { RuntimeListDTO } from '@domain/runtime/dto'
import type { SessionEvent } from '@domain/session/agent-session'
import type { PermissionModeKey } from '@domain/session/meter'
import type { SessionStatusUpdate } from '@domain/session/status-update'

import { PERMISSION_MODE_NAMES } from '@/features/chat/labels'
import { launchFailureLabel } from '@/features/session/labels'
import { RunningSessionStoreContext } from '@/features/session/running-session-context'
import {
  createRunningSessionStore,
  type RunningSessionStore
} from '@/features/session/running-session-store'
import { EMPTY_SESSION_METERS } from '@/features/session/running-session-types'
import type { RateLimitMeter } from '@/features/session/useSessionMeters'
import { useUiStore } from '@/stores/ui'
import { installCapability, stubCapability } from '@/test-support/capability'
import { RunningSessionsHarness } from '@/test-support/running-sessions-harness'

import { CenterBanners } from './CenterBanners'
import { CenterHeader } from './CenterHeader'
import { MAX_TIMER_DELAY_MS } from './quota-banner'

/**
 * O-4 FE-020 — Quota banner (014 spec US-2 AC1〜AC3 / AC5 / FR-006。data-model §4「Quota banner」/ §5)。
 * 判定と文の組み合わせの全部は `quota-banner.test.ts` が見る。ここは描画・timer・セッションごとの帯・並びを見る。
 * O-4 FE-040 — 権限モードの警告の帯 (014 spec US-4 AC1a / FR-010。data-model §4「権限モード」/ §5。U-6)。
 */

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
const AXE_RULES = { rules: { 'color-contrast': { enabled: false } } }

const NOW = new Date(2026, 9, 8, 10, 0, 0).getTime()
const SAME_DAY_SEC = new Date(2026, 9, 8, 14, 5, 0).getTime() / 1000
const OTHER_DAY_SEC = new Date(2026, 9, 9, 3, 0, 0).getTime() / 1000
/** 実時計で動くテストの解除の時刻 (今より 1 時間先)。 */
const FUTURE_SEC = Math.floor(Date.now() / 1000) + 3_600

function rl(over: Partial<RateLimitMeter> = {}): RateLimitMeter {
  return {
    type: 'rate-limit',
    status: 'allowed_warning',
    limitType: 'five_hour',
    utilizationPct: 80,
    resetsAtSec: SAME_DAY_SEC,
    usingOverage: false,
    ...over
  }
}

const banner = (): HTMLElement | null => screen.queryByTestId('quota-banner')

/* ── 部品だけを描く (計量はストアに直接置く) ────────────────────────────── */

interface Direct {
  readonly store: RunningSessionStore
  readonly setRate: (rateLimit: RateLimitMeter | null, id?: string) => void
  readonly rerender: (props: { sessionId?: string; terminal?: boolean }) => void
  readonly unmount: () => void
  readonly container: HTMLElement
}

function renderDirect(
  rateLimit: RateLimitMeter | null,
  { sessionId = A, terminal = false }: { sessionId?: string; terminal?: boolean } = {}
): Direct {
  const store = createRunningSessionStore(() => stubCapability())
  const setRate = (value: RateLimitMeter | null, id = A): void =>
    act(() =>
      store.setState((s) => ({
        meters: { ...s.meters, [id]: { ...EMPTY_SESSION_METERS, rateLimit: value } }
      }))
    )
  setRate(rateLimit)
  const tree = (props: { sessionId: string; terminal: boolean }): React.JSX.Element => (
    <RunningSessionStoreContext.Provider value={store}>
      <CenterBanners sessionId={props.sessionId} runtimeId="wsl:Ubuntu" terminal={props.terminal} />
    </RunningSessionStoreContext.Provider>
  )
  const utils = render(tree({ sessionId, terminal }))
  return {
    store,
    setRate,
    rerender: (props) =>
      utils.rerender(
        tree({ sessionId: props.sessionId ?? sessionId, terminal: props.terminal ?? terminal })
      ),
    unmount: utils.unmount,
    container: utils.container
  }
}

describe('Quota banner の描画 (US-2 AC1〜AC3)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('allowed_warning で注意 (role="status") と種類・割合・解除の時刻が出る', () => {
    renderDirect(rl())
    const el = screen.getByRole('status')
    expect(el).toBe(banner())
    expect(el).toHaveAttribute('data-tone', 'notice')
    expect(el).toHaveTextContent('5 時間の利用が 80% に達しました。14:05 にリセットされます。')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('rejected で role="alert" と待つ案内が出る', () => {
    renderDirect(rl({ status: 'rejected' }))
    const el = screen.getByRole('alert')
    expect(el).toHaveAttribute('data-tone', 'warning')
    expect(el).toHaveTextContent(
      '5 時間の上限に達しました。14:05 のリセットまで待ってから送ってください。'
    )
  })

  it('解除の時刻が無ければ「しばらく待ってから」', () => {
    renderDirect(rl({ status: 'rejected', resetsAtSec: null }))
    expect(screen.getByRole('alert')).toHaveTextContent('しばらく待ってから送ってください。')
  })

  it('allowed が届くと消える。計量が無ければ何も出さない', () => {
    const d = renderDirect(rl({ status: 'rejected' }))
    expect(banner()).not.toBeNull()
    d.setRate(rl({ status: 'allowed' }))
    expect(banner()).toBeNull()
    d.setRate(null)
    expect(banner()).toBeNull()
    expect(d.container).toBeEmptyDOMElement()
  })

  it('今日なら HH:mm、別の日なら M/d HH:mm', () => {
    const d = renderDirect(rl())
    expect(banner()).toHaveTextContent('14:05 にリセットされます。')
    d.setRate(rl({ resetsAtSec: OTHER_DAY_SEC }))
    expect(banner()).toHaveTextContent('10/9 03:00 にリセットされます。')
  })

  it.each([
    ['five_hour', '5 時間'],
    ['seven_day', '7 日'],
    ['seven_day_opus', '7 日 (Opus)'],
    ['seven_day_sonnet', '7 日 (Sonnet)'],
    ['seven_day_overage_included', '7 日 (超過分を含む)'],
    ['overage', '超過分'],
    [null, '利用枠']
  ] as const)('limitType %s の種類の文言 (%s)', (limitType, label) => {
    renderDirect(rl({ status: 'rejected', limitType }))
    expect(banner()).toHaveTextContent(`${label}の上限に達しました。`)
  })

  it('usingOverage で「超過分を使っています。」を添える。割合が無ければ割合を出さない', () => {
    renderDirect(rl({ usingOverage: true, utilizationPct: null }))
    expect(banner()).toHaveTextContent(
      '5 時間の上限に近づいています。超過分を使っています。14:05 にリセットされます。'
    )
    expect(banner()?.textContent).not.toContain('%')
  })

  it('Invalid Date になる解除の時刻でも例外を出さず、時刻なしで描く', () => {
    expect(() => renderDirect(rl({ status: 'rejected', resetsAtSec: 1e300 }))).not.toThrow()
    expect(banner()).toHaveTextContent(
      '5 時間の上限に達しました。しばらく待ってから送ってください。'
    )
  })

  it('送れない終端になると待つ案内が消え、警告の見た目のまま role="status" になる', () => {
    const d = renderDirect(rl({ status: 'rejected' }))
    expect(screen.getByRole('alert')).toHaveTextContent('待ってから送ってください')
    d.rerender({ terminal: true })
    expect(screen.queryByRole('alert')).toBeNull()
    const el = screen.getByRole('status')
    expect(el).toHaveAttribute('data-tone', 'warning')
    expect(el).toHaveTextContent('5 時間の上限に達しました。14:05 にリセットされます。')
    expect(el.textContent).not.toContain('送ってください')
  })

  it('表示中のセッションの計量だけを読む (別のセッションの帯が出ない)', () => {
    const d = renderDirect(null, { sessionId: A })
    d.setRate(rl({ status: 'rejected' }), B)
    expect(banner()).toBeNull()
    d.rerender({ sessionId: B })
    expect(banner()).toHaveTextContent('上限に達しました')
  })
})

describe('解除の時刻を過ぎた後 (014 data-model §4)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('偽の時計で解除の時刻を過ぎると event を送らずに消える。ストアの値は書き換えない。新しい event で再び出る', () => {
    const resetsAtSec = NOW / 1000 + 5
    const d = renderDirect(rl({ status: 'rejected', resetsAtSec }))
    expect(banner()).not.toBeNull()
    act(() => vi.advanceTimersByTime(4_999))
    expect(banner()).not.toBeNull()
    act(() => vi.advanceTimersByTime(1))
    expect(banner()).toBeNull()
    expect(d.store.getState().meters[A]?.rateLimit).toMatchObject({ resetsAtSec })

    d.setRate(rl({ status: 'rejected', resetsAtSec: NOW / 1000 + 3_600 }))
    expect(screen.getByRole('alert')).toHaveTextContent(
      '11:00 のリセットまで待ってから送ってください。'
    )
  })

  it('解除の時刻が 2 ** 31 - 1 ms より先でも、すぐには消えない (頭打ちの後に掛け直す)', () => {
    const resetsAtSec = NOW / 1000 + 30 * 24 * 3_600 // 30 日後 (約 2.6e9 ms)
    renderDirect(rl({ status: 'rejected', resetsAtSec }))
    act(() => vi.advanceTimersByTime(0))
    expect(banner()).not.toBeNull()
    act(() => vi.advanceTimersByTime(MAX_TIMER_DELAY_MS))
    expect(banner()).not.toBeNull()
    act(() => vi.advanceTimersByTime(resetsAtSec * 1000 - Date.now()))
    expect(banner()).toBeNull()
  })

  it('timer は 1 つだけ。rateLimit を替えた後と外した後に timer が残らない', () => {
    const baseline = vi.getTimerCount()
    const d = renderDirect(rl({ status: 'rejected' }))
    expect(vi.getTimerCount()).toBe(baseline + 1)
    d.setRate(rl({ status: 'rejected', resetsAtSec: SAME_DAY_SEC + 60 }))
    expect(vi.getTimerCount()).toBe(baseline + 1)
    d.setRate(rl({ status: 'rejected', resetsAtSec: null }))
    expect(vi.getTimerCount()).toBe(baseline)
    d.setRate(rl({ status: 'allowed_warning' }))
    expect(vi.getTimerCount()).toBe(baseline + 1)
    d.rerender({ terminal: true })
    expect(vi.getTimerCount()).toBe(baseline + 1)
    d.unmount()
    expect(vi.getTimerCount()).toBe(baseline)
  })

  it('出していない帯 (allowed・計量なし) は timer を持たない', () => {
    const baseline = vi.getTimerCount()
    const d = renderDirect(rl({ status: 'allowed' }))
    expect(vi.getTimerCount()).toBe(baseline)
    d.setRate(null)
    expect(vi.getTimerCount()).toBe(baseline)
  })
})

describe('vitest-axe', () => {
  it.each([
    ['allowed_warning', false],
    ['rejected', false],
    ['rejected', true]
  ] as const)('%s (terminal=%s) の帯で違反 0', async (status, terminal) => {
    // 実時計で動くので、解除の時刻は今より先にする (過ぎていると帯が出ない)。
    const d = renderDirect(rl({ status, usingOverage: true, resetsAtSec: FUTURE_SEC }), {
      terminal
    })
    expect(banner()).not.toBeNull()
    expect((await axe(d.container, AXE_RULES)).violations).toEqual([])
  })
})

/* ── 中央のヘッダの中 (稼働中の会話を本物で通す) ───────────────────────── */

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

afterEach(() => {
  detach?.()
  detach = null
  vi.unstubAllGlobals()
})

async function setupLive({
  runtimes = null,
  savePreset = vi.fn<ClostaCapability['savePreset']>()
}: {
  /** ランタイムの一覧 (null なら読み込み中のまま)。 */
  readonly runtimes?: RuntimeListDTO | null
  readonly savePreset?: ClostaCapability['savePreset']
} = {}): Promise<Harness> {
  let listener: ((u: readonly SessionStatusUpdate[]) => void) | null = null
  const launch = vi.fn()
  launch.mockResolvedValueOnce({ status: 'launching', sessionId: A })
  launch.mockResolvedValueOnce({ status: 'launching', sessionId: B })
  const cap = installCapability({
    listFolders: () => new Promise<never>(() => undefined),
    listRuntimes: () =>
      runtimes === null ? new Promise<never>(() => undefined) : Promise.resolve(runtimes),
    savePreset,
    launchSession: launch,
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
  for (const id of [A, B]) {
    await store.launch({
      folderId: 'f1',
      runtimeId: 'wsl:Ubuntu',
      providerId: null,
      modelId: null,
      effort: null,
      permissionMode: 'default'
    })
    const port: FakePort = { onmessage: null, start: vi.fn(), close: vi.fn() }
    deliverPort(id, port)
    ports.set(id, port)
  }
  act(() => store.select(A))
  const { container } = render(
    <RunningSessionStoreContext.Provider value={store}>
      <RunningSessionsHarness />
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

const meterOf = (rateLimit: RateLimitMeter): SessionEvent => ({ kind: 'meter', meter: rateLimit })

describe('中央のヘッダの帯 (US-2 AC5 / 014 data-model §4)', () => {
  beforeEach(() => {
    useUiStore.setState({ transcriptDensity: 'comfortable' })
  })

  it('帯はセッションごと: 別のセッションの帯が出ず、切り替えるとそのセッションの帯が出る', async () => {
    const h = await setupLive()
    h.emit(B, meterOf(rl({ status: 'rejected', resetsAtSec: null })))
    expect(banner()).toBeNull()
    act(() => h.store.select(B))
    expect(await screen.findByTestId('quota-banner')).toHaveTextContent('上限に達しました')
    act(() => h.store.select(A))
    expect(banner()).toBeNull()
  })

  it('並びは 中央のヘッダの行 → Quota banner → 会話内検索のバー', async () => {
    const h = await setupLive()
    h.emit(A, meterOf(rl({ resetsAtSec: FUTURE_SEC })))
    const quota = await screen.findByTestId('quota-banner')
    await userEvent.click(screen.getByRole('button', { name: '会話内を検索' }))
    const search = await screen.findByTestId('conversation-search')
    const header = screen.getByTestId('center-header')
    expect(header.nextElementSibling).toBe(quota)
    expect(quota.nextElementSibling).toBe(search)
  })

  it('表示中のセッションが失敗すると、待つ案内が消えて role="status" になる (失敗の表示と矛盾しない)', async () => {
    const h = await setupLive()
    h.emit(A, meterOf(rl({ status: 'rejected', resetsAtSec: FUTURE_SEC })))
    const quota = await screen.findByTestId('quota-banner')
    expect(quota).toHaveAttribute('role', 'alert')
    expect(quota).toHaveTextContent('待ってから送ってください')

    h.emit(A, { kind: 'failure', reasonKey: 'rate-limited' })
    h.emit(A, { kind: 'state', state: 'error' })
    h.push([{ sessionId: A, state: 'error', reasonKey: 'rate-limited', claudeAlive: true }])

    const after = await screen.findByTestId('quota-banner')
    expect(after).toHaveAttribute('role', 'status')
    expect(after).not.toHaveTextContent('送ってください')
    expect(after).toHaveTextContent('にリセットされます。')
    // 失敗の表示 (起動し直す案内) は帯を参照せずに出る。
    const failure = screen
      .getAllByRole('alert')
      .find((el) => within(el).queryByRole('button', { name: /^閉じて/ }) !== null)
    expect(failure).toHaveTextContent(launchFailureLabel('rate-limited'))
  })
})

/* ── 権限モードの警告の帯 (O-4 FE-040) ─────────────────────────────────── */

const NOW_DETECTED = 1_700_000_000_000

function runtimeList(autoModeStatus: AutoModeStatus): RuntimeListDTO {
  return {
    wslAvailability: 'available',
    enumerationIssues: [],
    runtimes: [
      {
        id: 'wsl:Ubuntu',
        kind: 'wsl',
        distroName: 'Ubuntu',
        wslVersion: 2,
        state: 'running',
        isDefault: true,
        capabilities: {
          probeState: 'done',
          sandboxKind: autoModeStatus === 'unavailable' ? 'none' : 'bubblewrap',
          seccompStatus: 'unknown',
          missingDependencies: [],
          probedAt: NOW_DETECTED,
          // ゲート用の値は表示に使わない (帯は autoModeStatus だけを読む)。食い違わせて、読んでいないことを確かめる。
          autoModeAllowed: autoModeStatus !== 'allowed',
          autoModeStatus
        },
        hasPathMapping: true,
        detectedAt: NOW_DETECTED,
        claudeStatus: null,
        claudeOverridden: false
      }
    ]
  }
}

const modeOf = (mode: PermissionModeKey): SessionEvent => ({
  kind: 'meter',
  meter: { type: 'permission-mode', mode }
})
const unsafeBanner = (): HTMLElement | null => screen.queryByTestId('unsafe-mode-banner')

describe('権限モードの警告の帯 (US-4 AC1a / 014 data-model §4「権限モード」)', () => {
  beforeEach(() => {
    useUiStore.setState({ transcriptDensity: 'comfortable' })
  })

  it.each(['default', 'plan', 'dontAsk'] as const)('安全 3 値 (%s) では出ない', async (mode) => {
    const h = await setupLive({ runtimes: runtimeList('unavailable') })
    h.emit(A, modeOf(mode))
    expect(unsafeBanner()).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it.each(['acceptEdits', 'bypassPermissions', 'auto', 'unknown'] as const)(
    '安全 3 値の外 (%s) で role="alert" の帯が出て、モードの名前が入る',
    async (mode) => {
      const h = await setupLive({ runtimes: runtimeList('allowed') })
      h.emit(A, modeOf(mode))
      const el = await screen.findByTestId('unsafe-mode-banner')
      expect(el).toHaveAttribute('role', 'alert')
      expect(el).toHaveTextContent(
        `アプリが選んでいない権限モード (「${PERMISSION_MODE_NAMES[mode]}」) で動いています。`
      )
      // 安全 3 値に戻ると消える
      h.emit(A, modeOf('default'))
      expect(unsafeBanner()).toBeNull()
    }
  )

  it('隔離の無いランタイム (unavailable) では「隔離がありません」と強める', async () => {
    const h = await setupLive({ runtimes: runtimeList('unavailable') })
    h.emit(A, modeOf('bypassPermissions'))
    const el = await screen.findByTestId('unsafe-mode-banner')
    await vi.waitFor(() => expect(el).toHaveTextContent('このランタイムには隔離がありません。'))
    expect(el).not.toHaveTextContent('確かめていません')
    expect(el).toHaveTextContent(PERMISSION_MODE_NAMES.bypassPermissions)
  })

  it.each([
    ['allowed', runtimeList('allowed')],
    ['undetermined', runtimeList('undetermined')],
    ['読み込み中', null]
  ] as const)(
    '%s では「このセッションの隔離をアプリは確かめていません」で、隔離されていると読める文言を出さない',
    async (_label, runtimes) => {
      const h = await setupLive({ runtimes })
      h.emit(A, modeOf('acceptEdits'))
      const el = await screen.findByTestId('unsafe-mode-banner')
      // 一覧が届いた (ヘッダの補足にランタイムの名前が出た) 後も文言が変わらない (allowed を「隔離あり」に丸めない)
      if (runtimes !== null) await within(screen.getByTestId('center-header')).findByText(/Ubuntu/)
      expect(el).toHaveTextContent('このセッションの隔離をアプリは確かめていません。')
      expect(el.textContent).not.toMatch(/隔離されて|隔離があります|隔離の中|安全です/)
      expect(el).not.toHaveTextContent('隔離がありません')
    }
  )

  it('並びは 中央のヘッダの行 → 警告の帯 → Quota banner → 会話内検索のバー', async () => {
    const h = await setupLive()
    h.emit(A, modeOf('auto'))
    h.emit(A, meterOf(rl({ resetsAtSec: FUTURE_SEC })))
    const unsafe = await screen.findByTestId('unsafe-mode-banner')
    const quota = await screen.findByTestId('quota-banner')
    await userEvent.click(screen.getByRole('button', { name: '会話内を検索' }))
    const search = await screen.findByTestId('conversation-search')
    const header = screen.getByTestId('center-header')
    expect(header.nextElementSibling).toBe(unsafe)
    expect(unsafe.nextElementSibling).toBe(quota)
    expect(quota.nextElementSibling).toBe(search)
  })

  it('帯はセッションごと: 別のセッションの昇格で表示中のセッションに帯が出ない', async () => {
    const h = await setupLive()
    h.emit(B, modeOf('bypassPermissions'))
    expect(unsafeBanner()).toBeNull()
    act(() => h.store.select(B))
    expect(await screen.findByTestId('unsafe-mode-banner')).toBeInTheDocument()
  })

  it('起動の設定・直近の起動の設定・プリセットの権限モードは変わらない (強制もしない)', async () => {
    const savePreset = vi.fn<ClostaCapability['savePreset']>()
    const h = await setupLive({ runtimes: runtimeList('unavailable'), savePreset })
    h.emit(A, modeOf('bypassPermissions'))
    await screen.findByTestId('unsafe-mode-banner')
    const state = h.store.getState()
    expect(state.sessions[A]?.config.permissionMode).toBe('default')
    expect(state.launch.lastConfig?.permissionMode).toBe('default')
    expect(state.meters[A]?.permissionMode).toBe('bypassPermissions')
    expect(savePreset).not.toHaveBeenCalled()
    // 失敗・終了にしない (帯は知らせるだけ)
    expect(state.sessions[A]?.runState).not.toBe('error')
  })

  it('vitest-axe: 警告の帯と Quota banner を並べて違反 0', async () => {
    const h = await setupLive({ runtimes: runtimeList('unavailable') })
    h.emit(A, modeOf('bypassPermissions'))
    h.emit(A, meterOf(rl({ status: 'rejected', resetsAtSec: FUTURE_SEC })))
    const unsafe = await screen.findByTestId('unsafe-mode-banner')
    await vi.waitFor(() => expect(unsafe).toHaveTextContent('隔離がありません'))
    // 帯の部分だけを見る (ハーネスは作業フォルダの一覧を返さないので、ヘッダの題が空になる)。
    expect((await axe(unsafe, AXE_RULES)).violations).toEqual([])
    expect((await axe(screen.getByTestId('quota-banner'), AXE_RULES)).violations).toEqual([])
    expect(h.container).toContainElement(unsafe)
  })
})

describe('過去の会話には出さない', () => {
  it('live を渡さない中央のヘッダは、計量 (レート制限・安全 3 値の外の権限モード) があっても帯を描かない', () => {
    const store = createRunningSessionStore(() => stubCapability())
    act(() =>
      store.setState({
        meters: {
          [A]: {
            ...EMPTY_SESSION_METERS,
            rateLimit: rl({ status: 'rejected', resetsAtSec: null }),
            permissionMode: 'bypassPermissions'
          }
        }
      })
    )
    render(
      <RunningSessionStoreContext.Provider value={store}>
        <CenterHeader title="過去" detail={null} status="読み取り専用" titleTestId="past-title" />
      </RunningSessionStoreContext.Provider>
    )
    expect(screen.getByTestId('center-header')).toBeInTheDocument()
    expect(banner()).toBeNull()
    expect(unsafeBanner()).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
