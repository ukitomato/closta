import { act, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { axe } from 'vitest-axe'

import { InfoIcon } from 'lucide-react'

import { useUiStore, type PanelTabId } from '@/stores/ui'
import { registerAppShellHooks, setup } from '@/test-support/app-shell-harness'

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

describe('本物のタブの表 (概要・使用量。O-4 FE-031)', () => {
  async function openRealPanel(): Promise<void> {
    await setup()
    await userEvent.click(screen.getByRole('button', { name: SHELL_LABELS.expandPanel }))
  }

  it('並びは 概要 → 使用量。← / → と Home / End で移って選び、選ばれたタブだけが tabIndex=0', async () => {
    await openRealPanel()
    const tabs = within(tabList()).getAllByRole('tab')
    expect(tabs.map((el) => el.textContent)).toEqual([
      SHELL_LABELS.overviewTab,
      SHELL_LABELS.usageTab
    ])
    expect(tabs.map((el) => el.getAttribute('tabindex'))).toEqual(['0', '-1'])
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
    ).toEqual(['-1', '0'])
    await userEvent.keyboard('{ArrowRight}')
    expect(tabNamed(SHELL_LABELS.overviewTab)).toHaveFocus()
    expect(within(tabPanel()).getByTestId('overview-empty')).toBeInTheDocument()
    await userEvent.keyboard('{ArrowLeft}')
    expect(tabNamed(SHELL_LABELS.usageTab)).toHaveFocus()
    await userEvent.keyboard('{Home}')
    expect(tabNamed(SHELL_LABELS.overviewTab)).toHaveFocus()
    await userEvent.keyboard('{End}')
    expect(tabNamed(SHELL_LABELS.usageTab)).toHaveFocus()
    expect(useUiStore.getState().panel.tab).toBe('usage')
  })

  it('vitest-axe の違反 0 (使用量のタブを選んだ後も)', async () => {
    await openRealPanel()
    const panel = screen.getByTestId('right-panel')
    const rules = { rules: { 'color-contrast': { enabled: false } } }
    expect((await axe(panel, rules)).violations).toEqual([])
    act(() => tabNamed(SHELL_LABELS.overviewTab).focus())
    await userEvent.keyboard('{End}')
    expect((await axe(panel, rules)).violations).toEqual([])
  })
})
