import { act, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'

import { InfoIcon } from 'lucide-react'

import type { SessionEvent } from '@domain/session/agent-session'
import type { McpStatusKey } from '@domain/session/session-init-report'

import { useUiStore, type PanelTabId } from '@/stores/ui'
import {
  A,
  B,
  registerAppShellHooks,
  selectPast,
  selectRunning,
  setup
} from '@/test-support/app-shell-harness'

import { SHELL_LABELS } from './labels'
import type { PanelTab } from './panel-tabs'

/**
 * O-4 FE-030 — 右のペインのタブのキーボード操作 (014 spec FR-017 / SC-007 / data-model §6 / research R-12)。
 * WAI-ARIA APG の Tabs pattern の自動の選択。タブの表を差し替えて、3 つの出せるタブと 1 つの出せないタブで見る。
 * 共通の setup は `test-support/app-shell-harness.tsx` (タブのテストは `AppShell.test.tsx` に足さない。O-7 code-gate
 * convention M-008)。
 */

registerAppShellHooks()

function tab(
  id: string,
  label: string,
  availableFor: PanelTab['availableFor'] = ['none', 'running', 'past']
): PanelTab {
  // 表の規則だけを見るので型の外の id を使う (`panel-tabs.test.ts` と同じ)。
  return {
    id: id as PanelTabId,
    label,
    icon: InfoIcon,
    availableFor,
    Content: () => <p>{label}の中身</p>
  }
}

/** 中央が未選択 (`none`) のとき、「過去だけ」は出せないタブ。 */
const TABS: readonly PanelTab[] = [
  tab('one', '一つ目'),
  tab('past-only', '過去だけ', ['past']),
  tab('two', '二つ目'),
  tab('three', '三つ目')
]

async function openPanel(): Promise<void> {
  await setup({ panelTabs: TABS })
  await userEvent.click(screen.getByRole('button', { name: SHELL_LABELS.expandPanel }))
}

const tabList = (): HTMLElement => screen.getByRole('tablist', { name: SHELL_LABELS.panelTabs })
const tabNamed = (name: string): HTMLElement => within(tabList()).getByRole('tab', { name })
const tabPanel = (): HTMLElement => screen.getByRole('tabpanel')

/** フォーカスと選択とパネルの中身が `name` のタブに揃っている。 */
function expectOn(name: string): void {
  const el = tabNamed(name)
  expect(el).toHaveFocus()
  expect(el).toHaveAttribute('aria-selected', 'true')
  expect(tabPanel()).toHaveTextContent(`${name}の中身`)
  expect(tabPanel()).toHaveAttribute('aria-labelledby', el.id)
}

describe('右のペインの tablist のキー操作 (FR-017 / data-model §6)', () => {
  it('← / → で隣のタブへ移って選び、端では反対の端へ回る', async () => {
    await openPanel()
    act(() => tabNamed('一つ目').focus())
    await userEvent.keyboard('{ArrowRight}')
    expectOn('二つ目')
    expect(useUiStore.getState().panel.tab).toBe('two')
    await userEvent.keyboard('{ArrowRight}')
    expectOn('三つ目')
    await userEvent.keyboard('{ArrowRight}')
    expectOn('一つ目')
    await userEvent.keyboard('{ArrowLeft}')
    expectOn('三つ目')
    await userEvent.keyboard('{ArrowLeft}')
    expectOn('二つ目')
  })

  it('Home / End で端のタブへ移る', async () => {
    await openPanel()
    act(() => tabNamed('一つ目').focus())
    await userEvent.keyboard('{End}')
    expectOn('三つ目')
    await userEvent.keyboard('{Home}')
    expectOn('一つ目')
  })

  it('選ばれたタブだけが tabIndex=0 (roving tabindex)。Shift+Tab で選ばれていないタブを通らずに出る', async () => {
    await openPanel()
    const tabIndexes = (): (string | null)[] =>
      within(tabList())
        .getAllByRole('tab')
        .map((el) => el.getAttribute('tabindex'))
    expect(tabIndexes()).toEqual(['0', '-1', '-1'])
    act(() => tabNamed('一つ目').focus())
    await userEvent.keyboard('{ArrowRight}')
    expect(tabIndexes()).toEqual(['-1', '0', '-1'])
    // 一つ目 (tabIndex=-1) を飛ばして、tablist の前の開閉のボタンへ出る。
    await userEvent.tab({ shift: true })
    expect(screen.getByRole('button', { name: SHELL_LABELS.collapsePanel })).toHaveFocus()
    // Tab で戻ると、選ばれたタブに入る。
    await userEvent.tab()
    expect(tabNamed('二つ目')).toHaveFocus()
  })

  it('出せないタブ (availableFor の外) は並びにも矢印キーの移動の対象にも入らない', async () => {
    await openPanel()
    expect(
      within(tabList())
        .getAllByRole('tab')
        .map((el) => el.textContent)
    ).toEqual(['一つ目', '二つ目', '三つ目'])
    act(() => tabNamed('一つ目').focus())
    await userEvent.keyboard('{ArrowRight}')
    expectOn('二つ目')
    expect(screen.queryByRole('tab', { name: '過去だけ' })).toBeNull()
    await userEvent.keyboard('{ArrowLeft}')
    expectOn('一つ目')
  })

  it('他のキーでは移らない', async () => {
    await openPanel()
    act(() => tabNamed('一つ目').focus())
    await userEvent.keyboard('{ArrowDown}{ArrowUp}a')
    expectOn('一つ目')
    expect(useUiStore.getState().panel.tab).toBe('overview')
  })

  it('vitest-axe の違反 0 (キーで移った後も)', async () => {
    await openPanel()
    const panel = screen.getByTestId('right-panel')
    const rules = { rules: { 'color-contrast': { enabled: false } } }
    expect((await axe(panel, rules)).violations).toEqual([])
    act(() => tabNamed('一つ目').focus())
    await userEvent.keyboard('{End}')
    expect((await axe(panel, rules)).violations).toEqual([])
  })
})

describe('タブの横スクロール (025 FR-014 / data-model §8)', () => {
  const scrollSpy = vi.fn()
  const original = Element.prototype.scrollIntoView
  beforeEach(() => {
    scrollSpy.mockClear()
    Element.prototype.scrollIntoView = scrollSpy
  })
  afterEach(() => {
    Element.prototype.scrollIntoView = original
  })
  const nearest = { block: 'nearest', inline: 'nearest' }

  it('矢印・Home / End・クリックで移った先のタブを見える範囲に入れる (1 回ずつ)', async () => {
    await openPanel()
    act(() => tabNamed('一つ目').focus())
    await userEvent.keyboard('{ArrowRight}')
    expect(scrollSpy).toHaveBeenCalledTimes(1)
    expect(scrollSpy).toHaveBeenLastCalledWith(nearest)
    expect(scrollSpy.mock.contexts[0]).toBe(tabNamed('二つ目'))
    await userEvent.keyboard('{End}')
    expect(scrollSpy).toHaveBeenCalledTimes(2)
    expect(scrollSpy.mock.contexts[1]).toBe(tabNamed('三つ目'))
    await userEvent.keyboard('{Home}')
    expect(scrollSpy).toHaveBeenCalledTimes(3)
    await userEvent.click(tabNamed('三つ目'))
    expect(scrollSpy).toHaveBeenCalledTimes(4)
    expect(scrollSpy).toHaveBeenLastCalledWith(nearest)
  })

  it('タブの名前は省略されず、折り返さない・縮まない', async () => {
    await openPanel()
    const el = tabNamed('一つ目')
    expect(el.textContent).toBe('一つ目')
    expect(el).toHaveClass('whitespace-nowrap', 'shrink-0')
    expect(tabList()).toHaveClass('overflow-x-auto', 'min-w-0')
  })
})

describe('本物のタブの表 (概要・使用量・構成。O-4 FE-031 / O-5 FE-020)', () => {
  async function openRealPanel(): Promise<void> {
    await setup()
    await userEvent.click(screen.getByRole('button', { name: SHELL_LABELS.expandPanel }))
  }

  it('並びは 概要 → 使用量 → 構成。← / → と Home / End で移って選び、選ばれたタブだけが tabIndex=0', async () => {
    await openRealPanel()
    const tabs = within(tabList()).getAllByRole('tab')
    expect(tabs.map((el) => el.textContent)).toEqual([
      SHELL_LABELS.overviewTab,
      SHELL_LABELS.usageTab,
      SHELL_LABELS.initReportTab,
      SHELL_LABELS.conversationMapTab,
      SHELL_LABELS.backgroundTasksTab
    ])
    expect(tabs.map((el) => el.getAttribute('tabindex'))).toEqual(['0', '-1', '-1', '-1', '-1'])
    act(() => tabNamed(SHELL_LABELS.overviewTab).focus())
    await userEvent.keyboard('{ArrowRight}')
    expect(tabNamed(SHELL_LABELS.usageTab)).toHaveFocus()
    expect(tabNamed(SHELL_LABELS.usageTab)).toHaveAttribute('aria-selected', 'true')
    expect(within(tabPanel()).getByTestId('usage-empty')).toBeInTheDocument()
    expect(useUiStore.getState().panel.tab).toBe('usage')
    expect(
      within(tabList())
        .getAllByRole('tab')
        .map((el) => el.getAttribute('tabindex'))
    ).toEqual(['-1', '0', '-1', '-1', '-1'])
    await userEvent.keyboard('{ArrowRight}')
    expect(tabNamed(SHELL_LABELS.initReportTab)).toHaveFocus()
    expect(within(tabPanel()).getByTestId('init-report-empty')).toBeInTheDocument()
    expect(useUiStore.getState().panel.tab).toBe('init-report')
    await userEvent.keyboard('{ArrowRight}')
    expect(tabNamed(SHELL_LABELS.conversationMapTab)).toHaveFocus()
    expect(within(tabPanel()).getByTestId('conversation-map-empty')).toBeInTheDocument()
    expect(useUiStore.getState().panel.tab).toBe('conversation-map')
    await userEvent.keyboard('{ArrowRight}')
    expect(tabNamed(SHELL_LABELS.backgroundTasksTab)).toHaveFocus()
    expect(within(tabPanel()).getByTestId('background-tasks-not-running')).toBeInTheDocument()
    expect(useUiStore.getState().panel.tab).toBe('background-tasks')
    await userEvent.keyboard('{ArrowRight}')
    expect(tabNamed(SHELL_LABELS.overviewTab)).toHaveFocus()
    expect(within(tabPanel()).getByTestId('overview-empty')).toBeInTheDocument()
    await userEvent.keyboard('{ArrowLeft}')
    expect(tabNamed(SHELL_LABELS.backgroundTasksTab)).toHaveFocus()
    await userEvent.keyboard('{ArrowLeft}')
    expect(tabNamed(SHELL_LABELS.conversationMapTab)).toHaveFocus()
    await userEvent.keyboard('{ArrowLeft}')
    expect(tabNamed(SHELL_LABELS.initReportTab)).toHaveFocus()
    await userEvent.keyboard('{Home}')
    expect(tabNamed(SHELL_LABELS.overviewTab)).toHaveFocus()
    await userEvent.keyboard('{End}')
    expect(tabNamed(SHELL_LABELS.backgroundTasksTab)).toHaveFocus()
    expect(useUiStore.getState().panel.tab).toBe('background-tasks')
  })

  it('vitest-axe の違反 0 (使用量・構成のタブを選んだ後も)', async () => {
    await openRealPanel()
    const panel = screen.getByTestId('right-panel')
    const rules = { rules: { 'color-contrast': { enabled: false } } }
    expect((await axe(panel, rules)).violations).toEqual([])
    act(() => tabNamed(SHELL_LABELS.overviewTab).focus())
    await userEvent.keyboard('{ArrowRight}')
    expect((await axe(panel, rules)).violations).toEqual([])
    await userEvent.keyboard('{End}')
    expect((await axe(panel, rules)).violations).toEqual([])
  })
})

describe('注意の印 (畳んだ帯と開いた tablist。O-5 FE-020 / 015 spec US-2 AC5 / data-model §3)', () => {
  const report = (statuses: readonly McpStatusKey[]): SessionEvent => ({
    kind: 'meter',
    meter: {
      type: 'init-report',
      model: null,
      mcpServers: statuses.map((status, i) => ({ name: `s${i}`, status })),
      tools: [],
      skills: [],
      plugins: [],
      slashCommands: [],
      omitted: 0
    }
  })
  /** 畳んだ帯の「構成」のアイコン (名前は「構成」で始まる)。 */
  const bandButton = (): HTMLElement =>
    within(screen.getByTestId('right-panel')).getByRole('button', {
      name: new RegExp(`^${SHELL_LABELS.initReportTab}`)
    })

  it('failed / needs-auth で「構成」のアイコンに印 (data-attention・警告のアイコン・名前に「注意」)', async () => {
    const h = await setup({ ids: [A] })
    await selectRunning(0)
    h.emit(A, report(['connected', 'failed']))
    expect(bandButton()).toHaveAttribute('data-attention', 'true')
    expect(bandButton()).toHaveAccessibleName(
      `${SHELL_LABELS.initReportTab} (${SHELL_LABELS.attention})`
    )
    expect(within(bandButton()).getByTestId('panel-tab-attention')).toBeInTheDocument()
    h.emit(A, report(['needs-auth']))
    expect(bandButton()).toHaveAttribute('data-attention', 'true')
    // 他のタブのアイコンには出さない
    expect(
      within(screen.getByTestId('right-panel')).getByRole('button', {
        name: SHELL_LABELS.usageTab
      })
    ).not.toHaveAttribute('data-attention')
  })

  it('unknown / pending / connected では出さない。状態が直れば印が消える', async () => {
    const h = await setup({ ids: [A] })
    await selectRunning(0)
    h.emit(A, report(['unknown', 'pending', 'connected', 'disabled']))
    expect(bandButton()).not.toHaveAttribute('data-attention')
    expect(bandButton()).toHaveAccessibleName(SHELL_LABELS.initReportTab)
    h.emit(A, report(['failed']))
    expect(bandButton()).toHaveAttribute('data-attention', 'true')
    h.emit(A, report(['connected']))
    expect(bandButton()).not.toHaveAttribute('data-attention')
  })

  it('別のセッションの状態では出さない (表示中のセッションだけ)。切り替えると印が付く', async () => {
    const h = await setup({ ids: [A, B] })
    h.emit(A, report(['connected']))
    h.emit(B, report(['failed']))
    await selectRunning(0)
    expect(bandButton()).not.toHaveAttribute('data-attention')
    await selectRunning(1)
    expect(bandButton()).toHaveAttribute('data-attention', 'true')
  })

  it('過去のセッション・未選択では出さない', async () => {
    const h = await setup({ ids: [A] })
    h.emit(A, report(['failed']))
    expect(bandButton()).not.toHaveAttribute('data-attention')
    await selectPast(0)
    expect(bandButton()).not.toHaveAttribute('data-attention')
  })

  it('開いた tablist の「構成」のタブにも印 (別のタブを見ている間も。pr-gate R1 MD-02)', async () => {
    const h = await setup({ ids: [A] })
    await selectRunning(0)
    await userEvent.click(screen.getByRole('button', { name: SHELL_LABELS.expandPanel }))
    const initTab = (): HTMLElement =>
      within(tabList()).getByRole('tab', { name: new RegExp(`^${SHELL_LABELS.initReportTab}`) })
    expect(initTab()).not.toHaveAttribute('data-attention')
    h.emit(A, report(['failed']))
    expect(tabNamed(SHELL_LABELS.overviewTab)).toHaveAttribute('aria-selected', 'true')
    expect(initTab()).toHaveAttribute('data-attention', 'true')
    expect(initTab()).toHaveAccessibleName(
      `${SHELL_LABELS.initReportTab} (${SHELL_LABELS.attention})`
    )
    expect(within(initTab()).getByTestId('panel-tab-attention')).toBeInTheDocument()
    expect(tabNamed(SHELL_LABELS.usageTab)).not.toHaveAttribute('data-attention')
    const panel = screen.getByTestId('right-panel')
    const rules = { rules: { 'color-contrast': { enabled: false } } }
    expect((await axe(panel, rules)).violations).toEqual([])
    h.emit(A, report(['connected']))
    expect(initTab()).not.toHaveAttribute('data-attention')
    expect(initTab()).toHaveAccessibleName(SHELL_LABELS.initReportTab)
  })

  it('vitest-axe の違反 0 (印のある帯)', async () => {
    const h = await setup({ ids: [A] })
    await selectRunning(0)
    h.emit(A, report(['failed']))
    const panel = screen.getByTestId('right-panel')
    const rules = { rules: { 'color-contrast': { enabled: false } } }
    expect((await axe(panel, rules)).violations).toEqual([])
  })
})
