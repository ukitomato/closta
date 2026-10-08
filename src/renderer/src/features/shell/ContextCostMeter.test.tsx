import { act, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { axe } from 'vitest-axe'

import type { ModelMeter } from '@domain/session/meter'

import { RunningSessionStoreContext } from '@/features/session/running-session-context'
import { createRunningSessionStore } from '@/features/session/running-session-store'
import { EMPTY_SESSION_METERS } from '@/features/session/running-session-types'
import type { TurnMeter } from '@/features/session/useSessionMeters'
import { A, B, registerAppShellHooks, selectRunning, setup } from '@/test-support/app-shell-harness'
import { stubCapability } from '@/test-support/capability'

import { CenterHeader } from './CenterHeader'
import { ContextCostMeter } from './ContextCostMeter'
import { CONTEXT_COST_METER_LABELS } from './labels'

/**
 * O-4 FE-032 — コンテキストと費用の目盛り (014 spec US-3 AC2 / AC4 / FR-009。data-model §4「コンテキストと費用の目盛り」/ §5)。
 */

registerAppShellHooks()

const AXE_RULES = { rules: { 'color-contrast': { enabled: false } } }

function model(modelId: string, over: Partial<ModelMeter> = {}): ModelMeter {
  return {
    modelId,
    input: 10,
    output: 20,
    cacheRead: 30,
    cacheCreation: 40,
    costUsd: 0.25,
    contextWindow: 200_000,
    ...over
  }
}

function turn(models: readonly ModelMeter[], costUsd = 0.25): TurnMeter {
  return { type: 'turn', costUsd, turns: 1, models, permissionDenials: 0 }
}

const contextMeter = (): HTMLElement | null => screen.queryByTestId('context-meter')
const costMeter = (): HTMLElement | null => screen.queryByTestId('cost-meter')

/* ── 部品だけを描く (計量はストアに直接置く) ────────────────────────────── */

function renderDirect({
  lastTurn,
  contextUsed,
  modelId = null
}: {
  readonly lastTurn: TurnMeter | null
  readonly contextUsed: number | null
  readonly modelId?: string | null
}): HTMLElement {
  const store = createRunningSessionStore(() => stubCapability())
  act(() => store.setState({ meters: { [A]: { ...EMPTY_SESSION_METERS, lastTurn, contextUsed } } }))
  const { container } = render(
    <RunningSessionStoreContext.Provider value={store}>
      <ContextCostMeter sessionId={A} modelId={modelId} />
    </RunningSessionStoreContext.Provider>
  )
  return container
}

describe('目盛りの値 (US-3 AC2 / data-model §4)', () => {
  it('コンテキストの割合と費用の累計を出し、推定であることを aria-label と title で伝える', () => {
    renderDirect({ lastTurn: turn([model('claude-sonnet-4-5')]), contextUsed: 84_000 })
    const meter = screen.getByRole('meter', { name: CONTEXT_COST_METER_LABELS.contextMeterLabel })
    expect(meter).toBe(contextMeter())
    expect(meter).toHaveTextContent('コンテキスト 約 42%')
    expect(meter).toHaveAttribute('aria-valuenow', '42')
    expect(meter).toHaveAttribute('title', 'コンテキストの使用量 (推定): コンテキスト 約 42%')
    expect(meter).toHaveAttribute('data-tone', 'normal')
    const cost = screen.getByRole('group', { name: CONTEXT_COST_METER_LABELS.costMeterLabel })
    expect(cost).toBe(costMeter())
    expect(cost).toHaveTextContent('費用 約 $0.25')
    expect(cost).toHaveAttribute('title', '費用の累計 (推定): 費用 約 $0.25')
    expect(CONTEXT_COST_METER_LABELS.contextMeterLabel).toContain('推定')
    expect(CONTEXT_COST_METER_LABELS.costMeterLabel).toContain('推定')
  })

  it('live region にしない (ターンごとに読み上げない)', () => {
    const container = renderDirect({ lastTurn: turn([model('m')]), contextUsed: 190_000 })
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(container.querySelector('[aria-live]')).toBeNull()
  })

  it('80% 以上で注意の見た目 (80% の手前は通常)', () => {
    renderDirect({ lastTurn: turn([model('m')]), contextUsed: 159_999 })
    expect(contextMeter()).toHaveTextContent('コンテキスト 約 79%')
    expect(contextMeter()).toHaveAttribute('data-tone', 'normal')
  })

  it.each([
    [160_000, 'コンテキスト 約 80%'],
    [200_000, 'コンテキスト 約 100%']
  ])('%s トークンで注意の見た目 (%s)', (contextUsed, text) => {
    renderDirect({ lastTurn: turn([model('m')]), contextUsed })
    expect(contextMeter()).toHaveTextContent(text)
    expect(contextMeter()).toHaveAttribute('data-tone', 'caution')
  })

  it('100% を超えたら「100% 以上」で数を出さない', () => {
    renderDirect({ lastTurn: turn([model('m')]), contextUsed: 200_001 })
    expect(contextMeter()).toHaveTextContent(CONTEXT_COST_METER_LABELS.contextOver)
    expect(contextMeter()?.textContent).not.toContain('約')
    expect(contextMeter()).toHaveAttribute('data-tone', 'caution')
    expect(contextMeter()).toHaveAttribute('aria-valuenow', '100')
  })

  it('contextWindow が 0 ならコンテキストの目盛りを出さず、費用だけを出す', () => {
    renderDirect({ lastTurn: turn([model('m', { contextWindow: 0 })]), contextUsed: 1_000 })
    expect(contextMeter()).toBeNull()
    expect(costMeter()).toHaveTextContent('費用 約 $0.25')
  })

  it('contextUsed が null ならコンテキストの目盛りを出さない', () => {
    renderDirect({ lastTurn: turn([model('m')]), contextUsed: null })
    expect(contextMeter()).toBeNull()
    expect(costMeter()).not.toBeNull()
  })

  it('内訳のモデルが 0 件ならコンテキストの目盛りを出さない (割る数が無い)', () => {
    renderDirect({ lastTurn: turn([], 0), contextUsed: 1_000 })
    expect(contextMeter()).toBeNull()
    expect(costMeter()).toHaveTextContent('費用 約 $0.00')
  })

  it('lastTurn も contextUsed も無いと何も出さない。lastTurn が無ければ contextUsed だけでも出さない', () => {
    expect(renderDirect({ lastTurn: null, contextUsed: null })).toBeEmptyDOMElement()
    expect(renderDirect({ lastTurn: null, contextUsed: 5_000 })).toBeEmptyDOMElement()
  })

  it('費用は ja-JP の書式で小数 4 桁まで', () => {
    renderDirect({ lastTurn: turn([model('m')], 1234.56789), contextUsed: null })
    expect(costMeter()).toHaveTextContent('費用 約 $1,234.5679')
  })
})

describe('主モデルの照合 (data-model §4 の 3 段)', () => {
  const HAIKU = model('claude-haiku-4-5', { output: 9_999, contextWindow: 100_000 })

  it('1. 完全一致の行の contextWindow で割る (出力トークン最多の行が subagent のモデルでも)', () => {
    renderDirect({
      lastTurn: turn([HAIKU, model('claude-opus-4-1', { output: 10, contextWindow: 200_000 })]),
      contextUsed: 50_000,
      modelId: 'claude-opus-4-1'
    })
    expect(contextMeter()).toHaveTextContent('コンテキスト 約 25%')
  })

  it('2. 起動の設定が [1m] 付きでキーが付かない形でも一致する', () => {
    renderDirect({
      lastTurn: turn([HAIKU, model('claude-sonnet-4-5', { output: 1, contextWindow: 1_000_000 })]),
      contextUsed: 100_000,
      modelId: 'claude-sonnet-4-5[1m]'
    })
    expect(contextMeter()).toHaveTextContent('コンテキスト 約 10%')
  })

  it('2. キーが [1m] 付きで起動の設定が付かない形でも一致する', () => {
    renderDirect({
      lastTurn: turn([
        HAIKU,
        model('claude-sonnet-4-5[1m]', { output: 1, contextWindow: 1_000_000 })
      ]),
      contextUsed: 100_000,
      modelId: 'claude-sonnet-4-5'
    })
    expect(contextMeter()).toHaveTextContent('コンテキスト 約 10%')
  })

  it('完全一致を [1m] を外した一致より先に使う', () => {
    renderDirect({
      lastTurn: turn([
        model('claude-sonnet-4-5', { contextWindow: 200_000 }),
        model('claude-sonnet-4-5[1m]', { contextWindow: 1_000_000 })
      ]),
      contextUsed: 100_000,
      modelId: 'claude-sonnet-4-5[1m]'
    })
    expect(contextMeter()).toHaveTextContent('コンテキスト 約 10%')
  })

  it.each([
    ['alias で起動した (sonnet)', 'sonnet'],
    ['起動の設定にモデルが無い', null]
  ])('3. %s ときは出力トークンの最も多い行', (_case, modelId) => {
    renderDirect({
      lastTurn: turn([
        model('claude-haiku-4-5', { output: 5, contextWindow: 100_000 }),
        model('claude-sonnet-4-5', { output: 50, contextWindow: 400_000 })
      ]),
      contextUsed: 100_000,
      modelId
    })
    expect(contextMeter()).toHaveTextContent('コンテキスト 約 25%')
  })
})

describe('vitest-axe', () => {
  it.each([
    ['通常', 84_000],
    ['注意', 170_000],
    ['100% 以上', 250_000]
  ])('%s の目盛りで違反 0', async (_tone, contextUsed) => {
    const container = renderDirect({ lastTurn: turn([model('m')]), contextUsed })
    expect(contextMeter()).not.toBeNull()
    expect((await axe(container, AXE_RULES)).violations).toEqual([])
  })
})

/* ── 中央のヘッダの中 (シェルを本物で通す) ─────────────────────────────── */

describe('中央のヘッダの目盛り (US-3 AC2 / AC4)', () => {
  it('右のペインを畳んでいても中央のヘッダの行に出る。値は届いた計量で更新される', async () => {
    const h = await setup({ ids: [A], launchConfig: { modelId: 'claude-sonnet-4-5' } })
    await selectRunning(0)
    expect(screen.getByTestId('right-panel')).toHaveAttribute('data-collapsed', 'true')
    const header = (): HTMLElement => screen.getByTestId('center-header')
    expect(within(header()).queryByTestId('context-cost-meter')).toBeNull()

    h.emit(A, { kind: 'meter', meter: turn([model('claude-sonnet-4-5')], 0.5) })
    h.emit(A, { kind: 'meter', meter: { type: 'context', usedTokens: 20_000 } })
    expect(within(header()).getByTestId('context-meter')).toHaveTextContent('コンテキスト 約 10%')
    expect(within(header()).getByTestId('cost-meter')).toHaveTextContent('費用 約 $0.50')

    h.emit(A, { kind: 'meter', meter: { type: 'context', usedTokens: 180_000 } })
    expect(within(header()).getByTestId('context-meter')).toHaveTextContent('コンテキスト 約 90%')
    expect(within(header()).getByTestId('context-meter')).toHaveAttribute('data-tone', 'caution')
  })

  it('別のセッションに切り替えるとそのセッションの値が出る (値が混ざらない)', async () => {
    const h = await setup({ ids: [A, B] })
    h.emit(A, { kind: 'meter', meter: turn([model('m')], 0.5) })
    h.emit(B, { kind: 'meter', meter: turn([model('m')], 1.25) })
    h.emit(B, { kind: 'meter', meter: { type: 'context', usedTokens: 100_000 } })
    await selectRunning(0)
    expect(costMeter()).toHaveTextContent('費用 約 $0.50')
    expect(contextMeter()).toBeNull()
    await selectRunning(1)
    expect(costMeter()).toHaveTextContent('費用 約 $1.25')
    expect(contextMeter()).toHaveTextContent('コンテキスト 約 50%')
  })

  it('過去の会話 (live を渡さない中央のヘッダ) では、計量があっても出さない', () => {
    const store = createRunningSessionStore(() => stubCapability())
    act(() =>
      store.setState({
        meters: {
          [A]: { ...EMPTY_SESSION_METERS, lastTurn: turn([model('m')]), contextUsed: 1_000 }
        }
      })
    )
    render(
      <RunningSessionStoreContext.Provider value={store}>
        <CenterHeader title="過去" detail={null} status="読み取り専用" titleTestId="past-title" />
      </RunningSessionStoreContext.Provider>
    )
    expect(screen.getByTestId('center-header')).toBeInTheDocument()
    expect(screen.queryByTestId('context-cost-meter')).toBeNull()
  })
})
