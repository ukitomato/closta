import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { SessionIndexDTO, SessionSummaryDTO } from '@domain/session/dto'
import { sessionRowKey } from '@domain/session/summary'

import { TRANSCRIPT_DENSITY_LABELS } from '@/features/chat/labels'
import { buildPastSearchIndex } from '@/features/search/session-search'
import { buildSessionRows } from '@/features/session-list/rows'
import { useSessionsStore } from '@/stores/sessions'
import { useUiStore } from '@/stores/ui'

import { PALETTE_LABELS, SETTINGS_SECTION_LABELS, SHELL_LABELS } from './labels'
import {
  buildPaletteCandidates,
  createPaletteEffects,
  PALETTE_MAX_CANDIDATES,
  runPaletteAction,
  type PaletteCandidate,
  type PalettePastSource,
  type PaletteRunningSource,
  type PaletteState
} from './palette-commands'

/** O-3 FE-030 — Command palette の操作の表と候補の組み立て (spec FR-007 / 012 data-model §3)。 */

const FOLDERS: Readonly<Record<string, string>> = { f1: '案件フォルダ', f2: '起動の検証' }

function session(sessionId: string, overrides: Partial<SessionSummaryDTO> = {}): SessionSummaryDTO {
  return {
    sessionId,
    targetKey: 'wsl:Ubuntu#0',
    targetLabel: 'u',
    summary: null,
    firstPrompt: null,
    customTitle: null,
    lastModified: 0,
    createdAt: null,
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

function indexOf(sessions: readonly SessionSummaryDTO[], folderId = 'f1'): SessionIndexDTO {
  return {
    groups: [{ kind: 'folder', folderId, boundary: 'native', sessions }],
    outcomes: [],
    fetchedAt: 0,
    complete: true
  }
}

function pastSource(index: SessionIndexDTO): PalettePastSource {
  const view = buildSessionRows(index)
  const folderNameOf = (id: string): string | null => FOLDERS[id] ?? null
  return { view, index: buildPastSearchIndex(view, folderNameOf), folderNameOf }
}

const NO_PAST = pastSource(indexOf([]))

function runningSource(
  sessions: Readonly<
    Record<string, { readonly folderId: string; readonly startedAt?: number }>
  > = {}
): PaletteRunningSource {
  return {
    order: Object.keys(sessions),
    sessions: Object.fromEntries(
      Object.entries(sessions).map(([id, s]) => [
        id,
        { config: { folderId: s.folderId, runtimeId: 'wsl:Ubuntu' }, startedAt: s.startedAt ?? 0 }
      ])
    ),
    names: {
      folderName: (id) => FOLDERS[id] ?? '',
      runtimeName: (id) => (id === 'wsl:Ubuntu' ? 'Ubuntu' : '')
    }
  }
}

const NO_RUNNING = runningSource()

const STATE: PaletteState = {
  sidebarCollapsed: false,
  panelCollapsed: true,
  conversationShown: true,
  transcriptDensity: 'comfortable'
}

const ids = (candidates: readonly PaletteCandidate[]): string[] => candidates.map((c) => c.id)
const kinds = (candidates: readonly PaletteCandidate[]): string[] => candidates.map((c) => c.kind)

describe('操作の表 (data-model §3)', () => {
  it('語が空のときは操作だけを表の並びで出す (セッションの候補は出さない)', () => {
    const candidates = buildPaletteCandidates(
      '',
      STATE,
      runningSource({ r1: { folderId: 'f1' } }),
      pastSource(indexOf([session('p1', { summary: '過去の作業' })]))
    )
    expect(ids(candidates)).toEqual([
      'launch:open',
      'settings:runtimes',
      'settings:folders',
      'settings:providers',
      'settings:resolution',
      'shell:sidebar',
      'shell:panel',
      'chat:search',
      'chat:density'
    ])
    expect(new Set(kinds(candidates))).toEqual(new Set(['action']))
    // 空白だけの語も空として扱う。
    expect(ids(buildPaletteCandidates('  　 ', STATE, NO_RUNNING, NO_PAST))).toHaveLength(9)
  })

  it('文言は文言の表から取る。設定の 4 項目・新規起動・会話内検索', () => {
    const labels = Object.fromEntries(
      buildPaletteCandidates('', STATE, NO_RUNNING, NO_PAST).map((c) => [c.id, c.label])
    )
    expect(labels['launch:open']).toBe(PALETTE_LABELS.paletteLaunch)
    expect(labels['settings:providers']).toBe(
      PALETTE_LABELS.paletteSettings(SETTINGS_SECTION_LABELS.providers)
    )
    expect(labels['settings:providers']).toBe('設定: プロバイダ')
    expect(labels['chat:search']).toBe('会話内を検索')
  })

  it('中央に会話が無いとき chat:* は出ない', () => {
    const candidates = buildPaletteCandidates(
      '',
      { ...STATE, conversationShown: false },
      NO_RUNNING,
      NO_PAST
    )
    expect(ids(candidates)).not.toContain('chat:search')
    expect(ids(candidates)).not.toContain('chat:density')
    // 語で探しても出ない。
    expect(
      buildPaletteCandidates('会話内', { ...STATE, conversationShown: false }, NO_RUNNING, NO_PAST)
    ).toEqual([])
  })

  it('密度の操作の文言と実行は次の値。畳む / 開くは今の状態の反対', () => {
    const at = (state: PaletteState, id: string): PaletteCandidate | undefined =>
      buildPaletteCandidates('', state, NO_RUNNING, NO_PAST).find((c) => c.id === id)

    expect(at(STATE, 'chat:density')).toMatchObject({
      label: `transcript を「${TRANSCRIPT_DENSITY_LABELS.compact}」にする`,
      action: { kind: 'density', density: 'compact' }
    })
    expect(at({ ...STATE, transcriptDensity: 'compact' }, 'chat:density')).toMatchObject({
      label: `transcript を「${TRANSCRIPT_DENSITY_LABELS.comfortable}」にする`,
      action: { kind: 'density', density: 'comfortable' }
    })

    expect(at(STATE, 'shell:sidebar')).toMatchObject({
      label: SHELL_LABELS.collapseSidebar,
      action: { kind: 'sidebar', collapsed: true }
    })
    expect(at({ ...STATE, sidebarCollapsed: true }, 'shell:sidebar')).toMatchObject({
      label: SHELL_LABELS.expandSidebar,
      action: { kind: 'sidebar', collapsed: false }
    })
    expect(at(STATE, 'shell:panel')).toMatchObject({
      label: SHELL_LABELS.expandPanel,
      action: { kind: 'panel', collapsed: false }
    })
    expect(at({ ...STATE, panelCollapsed: false }, 'shell:panel')).toMatchObject({
      label: SHELL_LABELS.collapsePanel,
      action: { kind: 'panel', collapsed: true }
    })
  })
})

describe('候補の組み立て (data-model §1 / §3)', () => {
  it('並びは 操作 → 稼働中 → 過去。セッションの候補には補足と種別がある', () => {
    const candidates = buildPaletteCandidates(
      '起動',
      STATE,
      runningSource({ r1: { folderId: 'f2', startedAt: Date.UTC(2026, 9, 5, 0, 0, 0) } }),
      pastSource(indexOf([session('p1', { summary: '起動の修正' })]))
    )
    expect(kinds(candidates)).toEqual(['action', 'running', 'past'])
    expect(candidates[0]).toMatchObject({ id: 'launch:open', detail: null })
    expect(candidates[1]).toMatchObject({
      id: 'session:running:r1',
      label: '起動の検証',
      action: { kind: 'running', sessionId: 'r1' }
    })
    expect(candidates[1]?.detail).toMatch(/^Ubuntu · /)
    expect(candidates[2]).toMatchObject({
      kind: 'past',
      label: '起動の修正',
      detail: '案件フォルダ'
    })
  })

  it('合わせて最大 50 件。上限の中でも並び (操作 → 過去) と一覧の順を保つ', () => {
    const many = Array.from({ length: 60 }, (_, n) =>
      session(`p${String(n).padStart(2, '0')}`, { summary: `設定の見直し ${n}` })
    )
    const candidates = buildPaletteCandidates('設定', STATE, NO_RUNNING, pastSource(indexOf(many)))
    expect(candidates).toHaveLength(PALETTE_MAX_CANDIDATES)
    expect(PALETTE_MAX_CANDIDATES).toBe(50)
    // 設定の 4 項目が先、過去の行は一覧の並びのまま 46 件。
    expect(kinds(candidates.slice(0, 4))).toEqual(['action', 'action', 'action', 'action'])
    expect(candidates.slice(4).map((c) => c.label)).toEqual(many.slice(0, 46).map((s) => s.summary))
  })

  it('稼働中の候補だけで上限に届いたら過去の候補は出さない', () => {
    const running = Object.fromEntries(
      Array.from({ length: 55 }, (_, n) => [`r${n}`, { folderId: 'f1' }] as const)
    )
    const candidates = buildPaletteCandidates(
      '案件',
      STATE,
      runningSource(running),
      pastSource(indexOf([session('p1', { summary: '案件の整理' })]))
    )
    expect(candidates).toHaveLength(PALETTE_MAX_CANDIDATES)
    expect(new Set(kinds(candidates))).toEqual(new Set(['running']))
  })

  it('同じ会話の稼働中と過去の候補は結ばずに両方出す (research R-07)', () => {
    // 稼働中の id はアプリが振る値で、過去の行の sessionId とは別の名前空間 (同じ文字列でも結ばない)。
    const same = '11111111-1111-4111-8111-111111111111'
    const candidates = buildPaletteCandidates(
      '案件フォルダ',
      STATE,
      runningSource({ [same]: { folderId: 'f1' } }),
      pastSource(indexOf([session(same, { summary: 'ログインの修正' })]))
    )
    expect(kinds(candidates)).toEqual(['running', 'past'])
    expect(candidates.map((c) => c.action)).toEqual([
      { kind: 'running', sessionId: same },
      { kind: 'past', rowKey: sessionRowKey({ targetKey: 'wsl:Ubuntu#0', sessionId: same }) }
    ])
  })

  it('FR-002 の正規化で一致する (半角カナと濁点・全角英数・大文字小文字・複数語の AND)', () => {
    const past = pastSource(
      indexOf([
        session('p1', { customTitle: 'ログイン画面', gitBranch: 'Feature/Login' }),
        session('p2', { customTitle: 'ログアウト' })
      ])
    )
    const labels = (query: string): string[] =>
      buildPaletteCandidates(query, STATE, NO_RUNNING, past).map((c) => c.label)

    expect(labels('ﾛｸﾞｲﾝ')).toEqual(['ログイン画面'])
    expect(labels('ＦＥＡＴＵＲＥ')).toEqual(['ログイン画面'])
    expect(labels('ログ login')).toEqual(['ログイン画面'])
    // 操作の文言も同じ規則 (半角カナの「ﾌﾟﾛﾊﾞｲﾀﾞ」が「設定: プロバイダ」に一致する)。
    expect(labels('ﾌﾟﾛﾊﾞｲﾀﾞ')).toEqual(['設定: プロバイダ'])
    // 検索語から RegExp を組まない (字面で扱う)。
    expect(labels('.*')).toEqual([])
  })

  it('rowKey に NUL・" ・ ]・ : を含む過去の行でも候補が 1 件ずつ出て、実行がその rowKey で select を呼ぶ', () => {
    const odd = [
      session('a"],[data-x="b', { summary: '特殊な行 1' }),
      session('c:d]e"f', { summary: '特殊な行 2', targetKey: 'wsl:Ubuntu#1' })
    ]
    const candidates = buildPaletteCandidates('特殊', STATE, NO_RUNNING, pastSource(indexOf(odd)))
    const rowKeys = odd.map((s) => sessionRowKey(s))
    expect(rowKeys.every((key) => key.includes('\u0000'))).toBe(true)
    expect(candidates.map((c) => c.label)).toEqual(['特殊な行 1', '特殊な行 2'])
    expect(candidates.map((c) => c.action)).toEqual(
      rowKeys.map((rowKey) => ({ kind: 'past', rowKey }))
    )

    const selectPast = vi.fn()
    const effects = { ...createPaletteEffects({ select: vi.fn() }), selectPast }
    for (const candidate of candidates) runPaletteAction(candidate.action, effects)
    expect(selectPast.mock.calls).toEqual(rowKeys.map((rowKey) => [rowKey]))
  })
})

describe('実行 (createPaletteEffects。本物のストア)', () => {
  beforeEach(() => {
    useUiStore.setState({
      settings: { open: false, section: 'runtimes' },
      sidebarCollapsed: false,
      panel: { collapsed: true, tab: 'overview' },
      launchOpen: false,
      transcriptDensity: 'comfortable',
      conversationSearchRequest: 0
    })
    useSessionsStore.setState({ selectedRowKey: null, selectionSeq: 0 })
  })

  it('操作は面の状態の操作を、セッションの候補は session のストアの選択の操作を呼ぶ (focus は書かない)', () => {
    const select = vi.fn()
    const effects = createPaletteEffects({ select })
    const focusBefore = useUiStore.getState().focus

    runPaletteAction({ kind: 'launch' }, effects)
    expect(useUiStore.getState().launchOpen).toBe(true)
    runPaletteAction({ kind: 'settings', section: 'providers' }, effects)
    expect(useUiStore.getState().settings).toEqual({ open: true, section: 'providers' })
    runPaletteAction({ kind: 'sidebar', collapsed: true }, effects)
    expect(useUiStore.getState().sidebarCollapsed).toBe(true)
    runPaletteAction({ kind: 'panel', collapsed: false }, effects)
    expect(useUiStore.getState().panel.collapsed).toBe(false)
    runPaletteAction({ kind: 'density', density: 'compact' }, effects)
    expect(useUiStore.getState().transcriptDensity).toBe('compact')
    runPaletteAction({ kind: 'chat-search' }, effects)
    runPaletteAction({ kind: 'chat-search' }, effects)
    expect(useUiStore.getState().conversationSearchRequest).toBe(2)

    runPaletteAction({ kind: 'running', sessionId: 'r1' }, effects)
    expect(select.mock.calls).toEqual([['r1']])
    const rowKey = sessionRowKey({ targetKey: 'wsl:Ubuntu#0', sessionId: 'x"]:y' })
    runPaletteAction({ kind: 'past', rowKey }, effects)
    expect(useSessionsStore.getState()).toMatchObject({ selectedRowKey: rowKey, selectionSeq: 1 })
    // palette は focus を書かない (シェルの useShellFocus が選択の通知から決める)。
    expect(useUiStore.getState().focus).toBe(focusBefore)
  })
})
