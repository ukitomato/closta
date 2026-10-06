import { describe, expect, it } from 'vitest'

import { InfoIcon } from 'lucide-react'

import type { PanelTabId } from '@/stores/ui'

import { activeTab, visibleTabs, type PanelTab } from './panel-tabs'

/** O-7 — 右のペインのタブの表の絞り込みと、選んでいたタブが出せないときの戻り先 (data-model §4)。 */

function tab(id: string, availableFor: PanelTab['availableFor']): PanelTab {
  // 表の id は後続 feature が足す。ここでは表の規則だけを見るので型の外の id を使う。
  return {
    id: id as PanelTabId,
    label: id,
    icon: InfoIcon,
    availableFor,
    // 表の規則だけを見るので描かない。
    Content: () => {
      throw new Error('not rendered')
    }
  }
}

const OVERVIEW = tab('overview', ['none', 'running', 'past'])
const RUNNING_ONLY = tab('running-only', ['running'])

describe('visibleTabs', () => {
  it('今の中央の状態で出せるタブだけを、表の並びのまま返す', () => {
    expect(visibleTabs([OVERVIEW, RUNNING_ONLY], 'running')).toEqual([OVERVIEW, RUNNING_ONLY])
    expect(visibleTabs([OVERVIEW, RUNNING_ONLY], 'past')).toEqual([OVERVIEW])
    expect(visibleTabs([], 'none')).toEqual([])
  })
})

describe('activeTab', () => {
  it('選んでいたタブが出せるならそれ', () => {
    expect(activeTab([OVERVIEW, RUNNING_ONLY], 'running', 'running-only' as PanelTabId)).toBe(
      RUNNING_ONLY
    )
  })

  it('選んでいたタブが出せなければ最初のタブに戻る', () => {
    expect(activeTab([OVERVIEW, RUNNING_ONLY], 'past', 'running-only' as PanelTabId)).toBe(OVERVIEW)
  })

  it('出せるタブが 0 件なら null', () => {
    expect(activeTab([RUNNING_ONLY], 'past', 'overview')).toBeNull()
    expect(activeTab([], 'running', 'overview')).toBeNull()
  })
})
