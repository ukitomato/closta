import { describe, expect, it } from 'vitest'

import type { EnumerationOutcomeDTO, SessionGroupDTO, SessionSummaryDTO } from '@domain/session/dto'

import { groupLabelOf, locationIndexOf, locationLabelOf } from './group-label'
import { GROUP_KIND_LABELS } from './labels'

/** O-7 — 一覧の見出し・中央のヘッダ・「概要」が共有するグループと所在の表示 (data-model §5)。 */

function session(overrides: Partial<SessionSummaryDTO> = {}): SessionSummaryDTO {
  return {
    sessionId: '33333333-3333-4333-8333-333333333333',
    targetKey: 'wsl:Ubuntu#0',
    targetLabel: 'u',
    summary: '過去の作業',
    firstPrompt: null,
    customTitle: null,
    lastModified: 0,
    createdAt: 0,
    fileSize: 100,
    gitBranch: null,
    tag: null,
    cwd: null,
    cwdDisplay: null,
    originKind: 'wsl-inherited',
    programmatic: false,
    worktree: false,
    boundary: null,
    normalized: { truncated: false, controlCharsRemoved: false },
    ...overrides
  }
}

describe('locationLabelOf / locationIndexOf', () => {
  it('WSL はディストロ名、Windows は「Windows」', () => {
    expect(locationLabelOf({ kind: 'wsl', distroName: 'Ubuntu' })).toBe('Ubuntu')
    expect(locationLabelOf({ kind: 'windows' })).toBe('Windows')
  })

  it('列挙の結果の targetKey から所在の表示名を引ける', () => {
    const outcome = (targetKey: string, distroName: string | null): EnumerationOutcomeDTO => ({
      location: distroName === null ? { kind: 'windows' } : { kind: 'wsl', distroName },
      targetKey,
      targetLabel: 'u',
      status: 'ok',
      reasonKey: null,
      count: 0,
      truncated: false,
      fetchedAt: 0
    })
    const index = locationIndexOf([outcome('wsl:Ubuntu#0', 'Ubuntu'), outcome('host#0', null)])
    expect(index.get('wsl:Ubuntu#0')).toBe('Ubuntu')
    expect(index.get('host#0')).toBe('Windows')
    expect(index.get('wsl:Debian#0')).toBeUndefined()
  })
})

describe('groupLabelOf (4 つの種別)', () => {
  const s = session({ cwdDisplay: '/home/u/other' })

  it('folder は登録フォルダの表示名。引けない窓では種別名 (空欄にしない)', () => {
    const group: SessionGroupDTO = {
      kind: 'folder',
      folderId: 'f',
      boundary: 'native',
      sessions: [s]
    }
    expect(groupLabelOf(group, '案件フォルダ', s)).toBe('案件フォルダ')
    expect(groupLabelOf(group, null, s)).toBe(GROUP_KIND_LABELS.folder)
  })

  it('pending は所在', () => {
    const group: SessionGroupDTO = {
      kind: 'pending',
      location: { kind: 'wsl', distroName: 'Ubuntu' },
      reasonKey: 'distro-not-running',
      sessions: [s]
    }
    expect(groupLabelOf(group, null, s)).toBe('Ubuntu')
  })

  it('unregistered は変換済みのパス、無ければ表示用の文字列、どちらも無ければ null', () => {
    const base = {
      kind: 'unregistered',
      cwdKey: 'k',
      suggestedDisplayName: null,
      location: null,
      sessions: [s]
    } as const
    expect(
      groupLabelOf(
        { ...base, cwd: { namespace: 'wsl:Ubuntu', value: '/home/u/proj' }, cwdDisplay: 'x' },
        null,
        s
      )
    ).toBe('/home/u/proj')
    expect(groupLabelOf({ ...base, cwd: null, cwdDisplay: '表示用' }, null, s)).toBe('表示用')
    expect(groupLabelOf({ ...base, cwd: null, cwdDisplay: null }, null, s)).toBeNull()
  })

  it('unknown は行の表示用の文字列 (無ければ null)', () => {
    const group: SessionGroupDTO = { kind: 'unknown', reasonKey: 'cwd-absent', sessions: [s] }
    expect(groupLabelOf(group, null, s)).toBe('/home/u/other')
    expect(groupLabelOf(group, null, session())).toBeNull()
  })
})
