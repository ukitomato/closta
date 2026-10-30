import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'

import { SESSION_PORT_MESSAGE, type ClostaCapability } from '@domain/capability'
import type { ProviderSummaryDTO } from '@domain/provider/dto'
import type { SessionEvent } from '@domain/session/agent-session'

import { COMPOSER_LABELS, PERMISSION_MODE_NAMES } from '@/features/chat/labels'
import { installCapability } from '@/test-support/capability'
import { RunningSessionsHarness } from '@/test-support/running-sessions-harness'

import { LIVE_MODEL_LIST_FAILURE_LABELS, LIVE_SETTING_LABELS } from './labels'
import { RunningSessionStoreContext } from './running-session-context'
import { createRunningSessionStore } from './running-session-store'
import { EMPTY_SESSION_METERS } from './running-session-types'
import { DEFAULT_EXTRA_AXES } from '@domain/session/launch-config'

/**
 * 025 FE-012 — composer の周りの実行中の設定の選択 (spec US-1 AC1〜AC5 / SC-001 の component 版)。
 * port の本文 → store → Thread の composer までを本物で通す (`LivePane.composer.test.tsx` と同じ組み方)。
 */

const AXE_RULES = { rules: { 'color-contrast': { enabled: false } } }
const A = '11111111-1111-4111-8111-111111111111'

const PROVIDER: ProviderSummaryDTO = {
  id: 'p1',
  displayName: 'P1',
  backend: 'bedrock',
  source: 'aws-profile',
  modelCount: 3,
  models: [
    { id: 'sonnet', displayName: 'Sonnet', supportedEffortLevels: ['low', 'high'] },
    { id: 'opus', displayName: 'Opus', supportedEffortLevels: ['high'] },
    { id: 'haiku', displayName: 'Haiku' }
  ]
}

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

async function setup(
  over: {
    readonly providerId?: string | null
    readonly effort?: 'low' | 'high' | null
    readonly modelId?: string | null
    readonly caps?: Partial<ClostaCapability>
    readonly initialState?: 'done' | 'launching'
  } = {}
): Promise<{
  readonly emit: (event: SessionEvent) => void
  readonly container: HTMLElement
  readonly store: ReturnType<typeof createRunningSessionStore>
  readonly cap: ClostaCapability
}> {
  const launch = vi.fn().mockResolvedValueOnce({ status: 'launching', sessionId: A })
  const cap = installCapability({
    listFolders: () => new Promise<never>(() => undefined),
    listRuntimes: () => new Promise<never>(() => undefined),
    listProviders: async () => [PROVIDER],
    launchSession: launch,
    sendPrompt: vi.fn(async () => {}),
    interruptSession: vi.fn(async () => {}),
    onSessionStatus: () => () => {},
    setSessionPermissionMode: vi.fn(async () => ({ ok: true as const })),
    setSessionModel: vi.fn(async () => ({ ok: true as const })),
    // 既定の Provider のセッションは最初の応答の後に一覧を聞く (025)。既定は空でない 2 件。
    listSessionModels: vi.fn(async () => ({
      ok: true as const,
      models: [
        { id: 'e2e-a', displayName: 'モデル A' },
        { id: 'e2e-b', displayName: 'モデル B' }
      ],
      reportedCount: 2
    })),
    ...over.caps
  })
  const store = createRunningSessionStore(() => cap)
  detach = store.attach(window)
  await store.launch({
    folderId: 'f1',
    runtimeId: 'wsl:Ubuntu',
    providerId: over.providerId ?? null,
    modelId: over.modelId ?? null,
    effort: over.effort ?? null,
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
  const { container } = render(
    <RunningSessionStoreContext.Provider value={store}>
      <RunningSessionsHarness />
    </RunningSessionStoreContext.Provider>
  )
  const emit = (e: SessionEvent): void => act(() => port.onmessage?.({ data: JSON.stringify(e) }))
  if (over.initialState !== 'launching') emit({ kind: 'state', state: 'done' })
  return { container, emit, store, cap }
}

const composerInput = (): HTMLElement =>
  screen.getByRole('textbox', { name: COMPOSER_LABELS.composerInput })
const modeSelect = (): HTMLSelectElement => screen.getByRole('combobox', { name: '権限モード' })
const modelSelect = (): HTMLSelectElement => screen.getByRole('combobox', { name: 'モデル' })
const optionValues = (el: HTMLSelectElement): string[] =>
  Array.from(el.querySelectorAll('option')).map((o) => o.value)

describe('composer の周りの選択 (FE-012 / US-1)', () => {
  it('選択が composer の領域にあり、中央のヘッダには無い。ヘッダに「名前を変更」がある。axe 違反 0', async () => {
    const h = await setup()
    await waitFor(() => expect(composerInput()).toBeInTheDocument())
    const composer = h.container.querySelector<HTMLElement>('.aui-composer-root')
    expect(composer).not.toBeNull()
    expect(composer).toContainElement(modeSelect())
    expect(composer).toContainElement(modelSelect())
    const header = screen.getByTestId('center-header')
    expect(header).not.toContainElement(modeSelect())
    expect(header).not.toContainElement(modelSelect())
    expect(screen.getByRole('button', { name: LIVE_SETTING_LABELS.rename })).toBeInTheDocument()
    // ヘッダの題はこの harness ではフォルダ名が空なので、composer の領域だけを検査する。
    expect((await axe(composer as HTMLElement, AXE_RULES)).violations).toEqual([])
  })

  it('権限モードの選択肢は安全 3 値だけで、名前は名前の表の値', async () => {
    await setup()
    await waitFor(() => expect(composerInput()).toBeInTheDocument())
    expect(optionValues(modeSelect())).toEqual(['default', 'plan', 'dontAsk'])
    const labels = Array.from(modeSelect().querySelectorAll('option')).map((o) => o.textContent)
    expect(labels).toEqual([
      PERMISSION_MODE_NAMES.default,
      PERMISSION_MODE_NAMES.plan,
      PERMISSION_MODE_NAMES.dontAsk
    ])
  })

  it('選ぶと setSessionPermissionMode / setSessionModel が 1 回ずつ呼ばれる。確定の後は composer にフォーカスがある', async () => {
    const h = await setup({ providerId: 'p1', modelId: 'sonnet' })
    await waitFor(() => expect(optionValues(modelSelect())).toEqual(['sonnet', 'opus', 'haiku']))
    modeSelect().focus()
    await userEvent.selectOptions(modeSelect(), 'plan')
    expect(h.cap.setSessionPermissionMode).toHaveBeenCalledExactlyOnceWith(A, 'plan')
    expect(composerInput()).toHaveFocus()

    await waitFor(() => expect(modelSelect()).not.toHaveAttribute('aria-disabled'))
    modelSelect().focus()
    await userEvent.selectOptions(modelSelect(), 'haiku')
    expect(h.cap.setSessionModel).toHaveBeenCalledExactlyOnceWith(A, 'haiku')
    expect(composerInput()).toHaveFocus()
  })

  it('Enter の確定の後に composer にフォーカスがあり、blur の確定ではフォーカスを動かさない', async () => {
    const h = await setup()
    await waitFor(() => expect(composerInput()).toBeInTheDocument())
    // Enter: 矢印キーで保留した値を確定する。
    modeSelect().focus()
    fireEvent.keyDown(modeSelect(), { key: 'ArrowDown' })
    fireEvent.change(modeSelect(), { target: { value: 'plan' } })
    fireEvent.keyDown(modeSelect(), { key: 'Enter' })
    expect(h.cap.setSessionPermissionMode).toHaveBeenCalledExactlyOnceWith(A, 'plan')
    await waitFor(() => expect(composerInput()).toHaveFocus())

    // blur: 利用者が移した先 (別の要素) を奪わない。
    await waitFor(() => expect(modeSelect()).not.toHaveAttribute('aria-disabled'))
    const other = document.createElement('button')
    document.body.append(other)
    modeSelect().focus()
    fireEvent.keyDown(modeSelect(), { key: 'ArrowDown' })
    fireEvent.change(modeSelect(), { target: { value: 'dontAsk' } })
    other.focus()
    await waitFor(() => expect(h.cap.setSessionPermissionMode).toHaveBeenCalledTimes(2))
    expect(other).toHaveFocus()
    other.remove()
  })

  it('launching では理由つきで押せない', async () => {
    await setup({ initialState: 'launching' })
    await waitFor(() => expect(composerInput()).toBeInTheDocument())
    expect(modeSelect()).toHaveAttribute('aria-disabled', 'true')
    expect(modeSelect()).toHaveAccessibleDescription(LIVE_SETTING_LABELS.blocker['not-ready'])
  })

  it('変更が拒否されると、直前の失敗の 1 行がヘッダの下に出て、表示は元の値のまま', async () => {
    await setup({
      caps: {
        setSessionPermissionMode: vi.fn(async () => ({
          ok: false as const,
          reason: 'rejected' as const
        }))
      }
    })
    await waitFor(() => expect(composerInput()).toBeInTheDocument())
    await userEvent.selectOptions(modeSelect(), 'plan')
    await waitFor(() =>
      expect(screen.getByTestId('live-setting-error')).toHaveTextContent(
        LIVE_SETTING_LABELS.failure['permission-mode']
      )
    )
    expect(screen.getByTestId('center-header')).toBeInTheDocument()
    expect(modeSelect().value).toBe('default')
  })

  it('meters の報告が無ければ起動の値を出し、報告が届けば表示が変わる', async () => {
    const h = await setup()
    await waitFor(() => expect(composerInput()).toBeInTheDocument())
    expect(modeSelect().value).toBe('default')
    act(() =>
      h.store.setState((s) => ({
        meters: { ...s.meters, [A]: { ...EMPTY_SESSION_METERS, permissionMode: 'dontAsk' } }
      }))
    )
    expect(modeSelect().value).toBe('dontAsk')
  })

  it('選択肢は起動の effort が効くモデルだけ。既定の Provider では押せず理由が出る', async () => {
    await setup({ providerId: 'p1', effort: 'low', modelId: 'sonnet' })
    await waitFor(() => expect(optionValues(modelSelect())).toEqual(['sonnet']))
    expect(modelSelect().value).toBe('sonnet')
  })
})

/* ── 既定の Provider (025 FE-020 / US-2) ── */

const LIVE_OPTIONS = [
  { id: 'e2e-a', displayName: 'モデル A' },
  { id: 'e2e-b', displayName: 'モデル B' }
]

const listOk = (
  models: readonly { id: string; displayName: string }[] = LIVE_OPTIONS,
  reportedCount = models.length
): ClostaCapability['listSessionModels'] =>
  vi.fn(async () => ({ ok: true as const, models, reportedCount }))

describe('既定の Provider のモデルの一覧 (FE-020 / US-2)', () => {
  it('最初の応答の後に 1 回だけ聞き、一覧が選択肢になる。選ぶと一覧の id で setSessionModel。axe 違反 0', async () => {
    const listSessionModels = listOk()
    const h = await setup({ providerId: null, caps: { listSessionModels } })
    await waitFor(() => expect(optionValues(modelSelect())).toContain('e2e-a'))
    expect(listSessionModels).toHaveBeenCalledExactlyOnceWith(A)
    expect(optionValues(modelSelect())).toEqual(['', 'e2e-a', 'e2e-b'])
    // 既定のモデル (null) は選べない先頭の項目。
    expect(modelSelect().querySelector('option')).toBeDisabled()
    modelSelect().focus()
    await userEvent.selectOptions(modelSelect(), 'e2e-b')
    expect(h.cap.setSessionModel).toHaveBeenCalledExactlyOnceWith(A, 'e2e-b')
    // 再描画しても聞き直さない。
    expect(listSessionModels).toHaveBeenCalledTimes(1)
    const composer = h.container.querySelector<HTMLElement>('.aui-composer-root')
    expect((await axe(composer as HTMLElement, AXE_RULES)).violations).toEqual([])
  })

  it('最初の応答の前 (launching) は聞かない', async () => {
    const listSessionModels = listOk()
    await setup({ providerId: null, initialState: 'launching', caps: { listSessionModels } })
    await waitFor(() => expect(composerInput()).toBeInTheDocument())
    expect(listSessionModels).not.toHaveBeenCalled()
    expect(modelSelect()).toHaveAccessibleDescription(LIVE_SETTING_LABELS.blocker['not-ready'])
  })

  it('取得の間は「読み込み中」で押せない', async () => {
    await setup({
      providerId: null,
      caps: { listSessionModels: () => new Promise<never>(() => undefined) }
    })
    await waitFor(() =>
      expect(modelSelect()).toHaveAccessibleDescription(LIVE_SETTING_LABELS.loadingModelList)
    )
    expect(modelSelect()).toHaveAttribute('aria-disabled', 'true')
  })

  it('空 (reportedCount 0) は押せず「返しませんでした」', async () => {
    await setup({ providerId: null, caps: { listSessionModels: listOk([], 0) } })
    await waitFor(() =>
      expect(modelSelect()).toHaveAccessibleDescription(LIVE_SETTING_LABELS.emptyModelList)
    )
    expect(modelSelect()).toHaveAttribute('aria-disabled', 'true')
  })

  it('effort で 0 件 (reportedCount > 0) は押せず、「返しませんでした」を出さない (H-002)', async () => {
    await setup({ providerId: null, caps: { listSessionModels: listOk([], 3) } })
    await waitFor(() =>
      expect(modelSelect()).toHaveAccessibleDescription(LIVE_SETTING_LABELS.noModelForEffort)
    )
    expect(screen.queryByText(LIVE_SETTING_LABELS.emptyModelList)).toBeNull()
  })

  it.each(['rejected', 'timeout', 'session-ended'] as const)(
    '失敗 (%s) は理由ごとの文言で押せず、フォーカスで 1 回だけ聞き直す',
    async (reason) => {
      const listSessionModels = vi
        .fn<ClostaCapability['listSessionModels']>()
        .mockResolvedValueOnce({ ok: false, reason })
        .mockResolvedValue({ ok: true, models: LIVE_OPTIONS, reportedCount: 2 })
      await setup({ providerId: null, caps: { listSessionModels } })
      await waitFor(() =>
        expect(modelSelect()).toHaveAccessibleDescription(LIVE_MODEL_LIST_FAILURE_LABELS[reason])
      )
      expect(listSessionModels).toHaveBeenCalledTimes(1)
      act(() => modelSelect().focus())
      await waitFor(() => expect(optionValues(modelSelect())).toContain('e2e-a'))
      expect(listSessionModels).toHaveBeenCalledTimes(2)
    }
  )

  it('Provider のあるセッションでは listSessionModels を呼ばず、カタログから出る', async () => {
    const listSessionModels = listOk()
    await setup({ providerId: 'p1', modelId: 'sonnet', caps: { listSessionModels } })
    await waitFor(() => expect(optionValues(modelSelect())).toEqual(['sonnet', 'opus', 'haiku']))
    expect(listSessionModels).not.toHaveBeenCalled()
  })
})
