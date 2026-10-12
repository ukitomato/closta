import { describe, expect, it } from 'vitest'

import { InfoIcon } from 'lucide-react'

import type { InitReportMeter, McpStatusKey } from '@domain/session/session-init-report'

import { EMPTY_SESSION_METERS, type SessionMeters } from '@/features/session/running-session-types'
import type { PanelTabId } from '@/stores/ui'

import { SHELL_LABELS } from './labels'
import { activeTab, attentionTabIds, PANEL_TABS, visibleTabs, type PanelTab } from './panel-tabs'

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

/* ── 構成のタブと注意の印 (O-5 / 015 data-model §3) ─────────────────────── */

function metersWith(statuses: readonly McpStatusKey[] | null): SessionMeters {
  if (statuses === null) return EMPTY_SESSION_METERS
  const initReport: InitReportMeter = {
    type: 'init-report',
    model: null,
    mcpServers: statuses.map((status, i) => ({ name: `s${i}`, status })),
    tools: [],
    skills: [],
    plugins: [],
    slashCommands: [],
    omitted: 0
  }
  return { ...EMPTY_SESSION_METERS, initReport }
}

describe('PANEL_TABS (O-5)', () => {
  it('並びは 概要 → 使用量 → 構成。構成の id は init-report (config を使わない) で、どの中央の状態でも出す', () => {
    expect(PANEL_TABS.map((t) => t.id)).toEqual(['overview', 'usage', 'init-report'])
    const report = PANEL_TABS[2]!
    expect(report.label).toBe(SHELL_LABELS.initReportTab)
    expect(report.availableFor).toEqual(['none', 'running', 'past'])
  })

  it('構成のタブの attention は failed / needs-auth のときだけ true (unknown・pending・構成が無いときは false)', () => {
    const attention = PANEL_TABS[2]!.attention!
    expect(attention(metersWith(['connected', 'failed']))).toBe(true)
    expect(attention(metersWith(['needs-auth']))).toBe(true)
    expect(attention(metersWith(['unknown', 'pending', 'disabled', 'connected']))).toBe(false)
    expect(attention(metersWith([]))).toBe(false)
    expect(attention(metersWith(null))).toBe(false)
  })

  it('attentionTabIds は attention が true のタブの id だけを表の並びで返す (attention の無いタブは含めない)', () => {
    expect(attentionTabIds(PANEL_TABS, metersWith(['failed']))).toEqual(['init-report'])
    expect(attentionTabIds(PANEL_TABS, metersWith(['connected']))).toEqual([])
    expect(attentionTabIds([OVERVIEW], metersWith(['failed']))).toEqual([])
  })
})
