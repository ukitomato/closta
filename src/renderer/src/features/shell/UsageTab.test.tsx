import { act, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { axe } from 'vitest-axe'

import type { ModelMeter } from '@domain/session/meter'

import { EMPTY_SESSION_METERS } from '@/features/session/running-session-types'
import type { TurnMeter } from '@/features/session/useSessionMeters'
import {
  A,
  B,
  registerAppShellHooks,
  selectPast,
  selectRunning,
  setup,
  XSS,
  type Harness
} from '@/test-support/app-shell-harness'

import { SHELL_LABELS, USAGE_LABELS } from './labels'

/**
 * O-4 FE-031 — 右のペインの「使用量」のタブ (014 spec FR-008 / US-3 AC1・AC3〜AC5。data-model §4「使用量のタブ」/ §5)。
 */

registerAppShellHooks()

const AXE_RULES = { rules: { 'color-contrast': { enabled: false } } }

function model(modelId: string, over: Partial<ModelMeter> = {}): ModelMeter {
  return {
    modelId,
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheCreation: 0,
    costUsd: 0,
    contextWindow: 200_000,
    ...over
  }
}

function turn(over: Partial<TurnMeter> = {}): TurnMeter {
  return { type: 'turn', costUsd: 0.25, turns: 1, models: [], permissionDenials: 0, ...over }
}

const SONNET = model('claude-sonnet-4-5', {
  input: 1_200,
  output: 3_400,
  cacheRead: 56_000,
  cacheCreation: 7_800,
  costUsd: 1.25
})
const HAIKU = model('claude-haiku-4-5', {
  input: 800,
  output: 600,
  cacheRead: 4_000,
  cacheCreation: 200,
  costUsd: 0.25
})

async function openUsage(): Promise<HTMLElement> {
  await userEvent.click(screen.getByRole('button', { name: SHELL_LABELS.expandPanel }))
  await userEvent.click(screen.getByRole('tab', { name: SHELL_LABELS.usageTab }))
  return screen.getByRole('tabpanel')
}

/** `scope` の中の見出し (`dt`) が `label` の値 (`dd`)。 */
function ddOf(scope: HTMLElement, label: string): HTMLElement {
  const dt = within(scope).getAllByText(label, { selector: 'dt' })[0]!
  return dt.nextElementSibling as HTMLElement
}

const denied = (h: Harness, id: string): void =>
  h.emit(id, { kind: 'permission-denied', denied: { toolName: 'Bash', reason: '拒否' } })

describe('使用量のタブの項目 (US-3 AC1)', () => {
  it('費用・トークンの累計・ターン数・モデルごとの内訳・拒否の 2 行と、推定の注記を出す', async () => {
    const h = await setup({ ids: [A] })
    await selectRunning(0)
    denied(h, A)
    denied(h, A)
    h.emit(A, {
      kind: 'meter',
      meter: turn({ costUsd: 1.5, turns: 3, permissionDenials: 5, models: [SONNET, HAIKU] })
    })
    const panel = await openUsage()
    const usage = within(panel).getByTestId('usage')

    expect(ddOf(usage, USAGE_LABELS.usageCost)).toHaveTextContent('$1.50')
    const tokens = within(usage).getByTestId('usage-tokens')
    expect(ddOf(tokens, '入力')).toHaveTextContent('2,000')
    expect(ddOf(tokens, '出力')).toHaveTextContent('4,000')
    expect(ddOf(tokens, 'キャッシュの読み込み')).toHaveTextContent('60,000')
    expect(ddOf(tokens, 'キャッシュの作成')).toHaveTextContent('8,000')
    expect(ddOf(usage, USAGE_LABELS.usageTurns)).toHaveTextContent('3')
    expect(ddOf(usage, '聞かれずに拒否された操作')).toHaveTextContent('2 件')
    expect(ddOf(usage, '拒否された操作の合計 (SDK の記録)')).toHaveTextContent('5 件')
    expect(within(usage).getByTestId('usage-estimate-note')).toHaveTextContent(
      '推定です。請求額ではありません。再開と /clear で 0 から数え直します。'
    )

    const models = within(within(usage).getByTestId('usage-models')).getAllByRole('listitem')
    expect(models).toHaveLength(2)
    expect(models[0]).toHaveTextContent('claude-sonnet-4-5')
    expect(ddOf(models[0]!, '入力')).toHaveTextContent('1,200')
    expect(ddOf(models[0]!, 'キャッシュの読み込み')).toHaveTextContent('56,000')
    expect(ddOf(models[0]!, '費用')).toHaveTextContent('$1.25')
    expect(models[1]).toHaveTextContent('claude-haiku-4-5')
    expect(ddOf(models[1]!, '出力')).toHaveTextContent('600')
    expect(ddOf(models[1]!, '費用')).toHaveTextContent('$0.25')
    expect(within(usage).getByRole('heading', { name: USAGE_LABELS.usageModels })).toBeVisible()
  })

  it('値は最新の turn で書き換わる。費用は ja-JP の書式で小数 4 桁まで', async () => {
    const h = await setup({ ids: [A] })
    await selectRunning(0)
    h.emit(A, { kind: 'meter', meter: turn({ costUsd: 0.5, turns: 1 }) })
    const panel = await openUsage()
    expect(ddOf(panel, USAGE_LABELS.usageCost)).toHaveTextContent('$0.50')
    h.emit(A, { kind: 'meter', meter: turn({ costUsd: 1234.56789, turns: 2 }) })
    expect(ddOf(panel, USAGE_LABELS.usageCost)).toHaveTextContent('$1,234.5679')
    expect(ddOf(panel, USAGE_LABELS.usageTurns)).toHaveTextContent('2')
  })

  it('SDK の記録の拒否は 1,024 に達したら「1,024 件以上」', async () => {
    const h = await setup({ ids: [A] })
    await selectRunning(0)
    h.emit(A, { kind: 'meter', meter: turn({ permissionDenials: 1_023 }) })
    const panel = await openUsage()
    const total = (): HTMLElement => ddOf(panel, USAGE_LABELS.usageDeniedTotal)
    expect(total()).toHaveTextContent('1,023 件')
    expect(total()).not.toHaveTextContent('以上')
    h.emit(A, { kind: 'meter', meter: turn({ permissionDenials: 1_024 }) })
    expect(total()).toHaveTextContent('1,024 件以上')
  })

  it('内訳が 0 件なら内訳の見出しを出さない', async () => {
    const h = await setup({ ids: [A] })
    await selectRunning(0)
    h.emit(A, { kind: 'meter', meter: turn({ models: [] }) })
    const panel = await openUsage()
    expect(within(panel).queryByTestId('usage-models')).toBeNull()
    expect(ddOf(within(panel).getByTestId('usage-tokens'), '入力')).toHaveTextContent('0')
  })

  it('モデルの id はテキストとして描く (HTML として解釈しない)', async () => {
    const h = await setup({ ids: [A] })
    await selectRunning(0)
    // decoder は通らない形 (`<` を含む) を、ストアに直接置いて描き方だけを見る。
    const lastTurn = turn({ models: [model(XSS)] })
    act(() =>
      h.store.setState((s) => ({
        meters: { ...s.meters, [A]: { ...EMPTY_SESSION_METERS, lastTurn } }
      }))
    )
    const panel = await openUsage()
    expect(panel).toHaveTextContent(XSS)
    expect(panel.querySelector('img')).toBeNull()
    expect((window as { __pwned?: unknown }).__pwned).toBeUndefined()
  })
})

describe('空の状態 (US-3 AC3 / AC5)', () => {
  it('稼働中で result がまだ届いていなければ「最初の応答の後に出ます」', async () => {
    const h = await setup({ ids: [A] })
    await selectRunning(0)
    // result 以外の計量だけでは出さない。
    h.emit(A, { kind: 'meter', meter: { type: 'context', usedTokens: 1_000 } })
    const panel = await openUsage()
    expect(within(panel).getByTestId('usage-await-first')).toHaveTextContent(
      USAGE_LABELS.usageAwaitFirst
    )
    expect(within(panel).queryByTestId('usage')).toBeNull()
  })

  it('過去のセッションではタブを出し、「実行中のセッションだけ出ます」', async () => {
    const h = await setup({ ids: [A] })
    h.emit(A, { kind: 'meter', meter: turn() })
    await selectPast(0)
    const panel = await openUsage()
    expect(within(panel).getByTestId('usage-live-only')).toHaveTextContent(
      USAGE_LABELS.usageLiveOnly
    )
    expect(within(panel).queryByTestId('usage')).toBeNull()
  })

  it('未選択では「セッションを選ぶと使用量が出ます」', async () => {
    await setup()
    const panel = await openUsage()
    expect(within(panel).getByTestId('usage-empty')).toHaveTextContent(USAGE_LABELS.usageEmpty)
  })
})

describe('セッションごとの値 (US-3 AC4)', () => {
  it('2 つのセッションを切り替えて値が混ざらない', async () => {
    const h = await setup({ ids: [A, B] })
    denied(h, A)
    h.emit(A, { kind: 'meter', meter: turn({ costUsd: 1.5, turns: 4, models: [SONNET] }) })
    h.emit(B, { kind: 'meter', meter: turn({ costUsd: 0.25, turns: 1, models: [HAIKU] }) })
    await selectRunning(0)
    const panel = await openUsage()
    expect(ddOf(panel, USAGE_LABELS.usageCost)).toHaveTextContent('$1.50')
    expect(ddOf(panel, USAGE_LABELS.usageTurns)).toHaveTextContent('4')
    expect(ddOf(panel, USAGE_LABELS.usageDeniedAuto)).toHaveTextContent('1 件')
    expect(panel).toHaveTextContent('claude-sonnet-4-5')
    expect(panel).not.toHaveTextContent('claude-haiku-4-5')

    await selectRunning(1)
    const after = screen.getByRole('tabpanel')
    expect(ddOf(after, USAGE_LABELS.usageCost)).toHaveTextContent('$0.25')
    expect(ddOf(after, USAGE_LABELS.usageTurns)).toHaveTextContent('1')
    expect(ddOf(after, USAGE_LABELS.usageDeniedAuto)).toHaveTextContent('0 件')
    expect(after).toHaveTextContent('claude-haiku-4-5')
    expect(after).not.toHaveTextContent('claude-sonnet-4-5')
  })
})

describe('vitest-axe', () => {
  it('項目のある状態と空の状態で違反 0', async () => {
    const h = await setup({ ids: [A] })
    await selectRunning(0)
    const panel = await openUsage()
    expect((await axe(panel, AXE_RULES)).violations).toEqual([])
    h.emit(A, {
      kind: 'meter',
      meter: turn({ costUsd: 1.5, turns: 3, permissionDenials: 5, models: [SONNET, HAIKU] })
    })
    expect(within(panel).getByTestId('usage')).toBeInTheDocument()
    expect((await axe(panel, AXE_RULES)).violations).toEqual([])
  })
})
