import { TRANSCRIPT_DENSITY_LABELS } from '@/features/chat/labels'
import {
  matchingPastRowKeys,
  matchingRunningIds,
  type FolderNameOf,
  type PastSearchIndex,
  type RunningSearchNames,
  type RunningSearchSource
} from '@/features/search/session-search'
import { matchesAllTerms, toTerms } from '@/features/search/text-search'
import { groupLabelOf } from '@/features/session-list/group-label'
import {
  formatSessionTime,
  rowTitleText,
  type SessionRow,
  type SessionRowsView,
  type SessionSection
} from '@/features/session-list/rows'
import { formatStartedAt } from '@/features/session/labels'
import { useSessionsStore } from '@/stores/sessions'
import {
  SETTINGS_SECTIONS,
  useUiStore,
  type SettingsSection,
  type TranscriptDensity,
  type UiState
} from '@/stores/ui'

import { PALETTE_LABELS, SETTINGS_SECTION_LABELS, SHELL_LABELS } from './labels'

/**
 * **Command palette の操作の表と候補の組み立て** (O-3 / spec FR-007 / 012 data-model §3「操作の表」)。
 *
 * | 規則 | 根拠 |
 * |---|---|
 * | 操作の表は 1 か所 (`PALETTE_ACTIONS`)。行は id・文言・使える条件・実行を持ち、文言は `labels.ts` の表から取る | spec FR-007 / AD-045 Decision 2 |
 * | 操作の候補は文言を `matchesAllTerms` (FR-002) に通して絞る。セッションの候補は FE-002 の対象 (`session-search.ts`) で絞る | data-model §1 / §3 |
 * | **語が空のときは操作だけ** (セッションの候補は出さない) | data-model §3 |
 * | 並びは 操作 → 稼働中 → 過去。合わせて最大 50 件 (`PALETTE_MAX_CANDIDATES`)。セッションの候補には種別を添える | spec FR-007 |
 * | **稼働中と過去の候補は結ばない** — 稼働中の id はアプリが振る値で、過去の行の `sessionId` とは名前空間が違う | research R-07 |
 * | 候補の id (`session:past:<rowKey>` など) は表の中の鍵で、外部由来の値を含む。React の `key` には使ってよいが、DOM の id・IDREF・セレクタに入れない (DOM の id は `CommandPalette` が `useId()` と添字で作る) | data-model §2「外部由来の値と DOM の id・セレクタ」/ §3 |
 * | セッションの候補の実行は session のストアの選択の操作 (稼働中 `select`・過去 `sessions.select`) を呼ぶだけ。中央の `focus` は書かない (`useShellFocus` が選択の通知から決める) | spec FR-007 / ui charter「面の状態」 |
 */

/** 候補の実行の中身。候補を作った時点の値 (畳む / 開く・次の密度) を持ち、表示した文言のとおりに実行する。 */
export type PaletteAction =
  | { readonly kind: 'launch' }
  | { readonly kind: 'settings'; readonly section: SettingsSection }
  | { readonly kind: 'sidebar'; readonly collapsed: boolean }
  | { readonly kind: 'panel'; readonly collapsed: boolean }
  | { readonly kind: 'chat-search' }
  | { readonly kind: 'density'; readonly density: TranscriptDensity }
  | { readonly kind: 'running'; readonly sessionId: string }
  | { readonly kind: 'past'; readonly rowKey: string }

/** 候補の種別。`action` は操作の表の行。 */
export type PaletteCandidateKind = 'action' | 'running' | 'past'

export interface PaletteCandidate {
  /** 表の中の鍵 (data-model §3 の id)。外部由来の値を含むので DOM の id・IDREF・セレクタに入れない。 */
  readonly id: string
  readonly kind: PaletteCandidateKind
  readonly label: string
  /** 補足 (稼働中はランタイムと起動の時刻、過去はグループの表示)。操作は `null`。 */
  readonly detail: string | null
  readonly action: PaletteAction
}

/** 操作の表が読む面の状態。 */
export interface PaletteState {
  readonly sidebarCollapsed: boolean
  readonly panelCollapsed: boolean
  /** 中央に会話を出しているか (`CenterPane` の出している中身が `running` / `past`)。 */
  readonly conversationShown: boolean
  readonly transcriptDensity: TranscriptDensity
}

/** 稼働中のセッションのうち、候補が読む値 (稼働中のストアの `sessions` の値はこの形を満たす)。 */
export interface RunningPaletteSession extends RunningSearchSource {
  readonly startedAt: number
}

/** 稼働中のセッションの候補の出所 (稼働中のストアの `order` / `sessions` と `RunningSessionsView` の表示名)。 */
export interface PaletteRunningSource {
  readonly order: readonly string[]
  readonly sessions: Readonly<Record<string, RunningPaletteSession>>
  readonly names: RunningSearchNames
}

/** 過去のセッションの候補の出所 (`buildSessionRows` の結果と、その検索の索引)。 */
export interface PalettePastSource {
  readonly view: SessionRowsView
  readonly index: PastSearchIndex
  readonly folderNameOf: FolderNameOf
}

/** 候補の上限 (spec FR-007 [ASSUMED])。 */
export const PALETTE_MAX_CANDIDATES = 50

interface PaletteActionRow {
  readonly id: string
  readonly label: (state: PaletteState) => string
  readonly available: (state: PaletteState) => boolean
  readonly action: (state: PaletteState) => PaletteAction
}

const always = (): boolean => true
const withConversation = (state: PaletteState): boolean => state.conversationShown
const nextDensity = (state: PaletteState): TranscriptDensity =>
  state.transcriptDensity === 'comfortable' ? 'compact' : 'comfortable'

/** 操作の表 (data-model §3)。並びは候補の並び。 */
export const PALETTE_ACTIONS: readonly PaletteActionRow[] = [
  {
    id: 'launch:open',
    label: () => PALETTE_LABELS.paletteLaunch,
    available: always,
    action: () => ({ kind: 'launch' })
  },
  ...SETTINGS_SECTIONS.map((section): PaletteActionRow => ({
    id: `settings:${section}`,
    label: () => PALETTE_LABELS.paletteSettings(SETTINGS_SECTION_LABELS[section]),
    available: always,
    action: () => ({ kind: 'settings', section })
  })),
  {
    id: 'shell:sidebar',
    // 今の状態の反対の操作。
    label: (state) =>
      state.sidebarCollapsed ? SHELL_LABELS.expandSidebar : SHELL_LABELS.collapseSidebar,
    available: always,
    action: (state) => ({ kind: 'sidebar', collapsed: !state.sidebarCollapsed })
  },
  {
    id: 'shell:panel',
    label: (state) =>
      state.panelCollapsed ? SHELL_LABELS.expandPanel : SHELL_LABELS.collapsePanel,
    available: always,
    action: (state) => ({ kind: 'panel', collapsed: !state.panelCollapsed })
  },
  {
    id: 'chat:search',
    label: () => PALETTE_LABELS.paletteChatSearch,
    available: withConversation,
    action: () => ({ kind: 'chat-search' })
  },
  {
    id: 'chat:density',
    label: (state) => PALETTE_LABELS.paletteDensity(TRANSCRIPT_DENSITY_LABELS[nextDensity(state)]),
    available: withConversation,
    action: (state) => ({ kind: 'density', density: nextDensity(state) })
  }
]

function actionCandidates(state: PaletteState, terms: readonly string[]): PaletteCandidate[] {
  const candidates: PaletteCandidate[] = []
  for (const row of PALETTE_ACTIONS) {
    if (!row.available(state)) continue
    const label = row.label(state)
    if (!matchesAllTerms([label], terms)) continue
    candidates.push({ id: row.id, kind: 'action', label, detail: null, action: row.action(state) })
  }
  return candidates
}

function runningCandidates(
  source: PaletteRunningSource,
  terms: readonly string[],
  limit: number
): PaletteCandidate[] {
  const candidates: PaletteCandidate[] = []
  for (const id of matchingRunningIds(source.order, source.sessions, source.names, terms)) {
    if (candidates.length >= limit) break
    const session = source.sessions[id]
    if (session === undefined) continue
    // 補足は中央のヘッダと同じ (ランタイム・起動の時刻)。
    const detail = [
      source.names.runtimeName(session.config.runtimeId),
      formatStartedAt(session.startedAt)
    ]
      .filter((part) => part !== '')
      .join(' · ')
    candidates.push({
      id: `session:running:${id}`,
      kind: 'running',
      label: source.names.folderName(session.config.folderId),
      detail: detail === '' ? null : detail,
      action: { kind: 'running', sessionId: id }
    })
  }
  return candidates
}

function pastCandidates(
  source: PalettePastSource,
  terms: readonly string[],
  limit: number
): PaletteCandidate[] {
  if (limit <= 0) return []
  const rows = new Map<string, SessionRow>(source.view.rows.map((row) => [row.rowKey, row]))
  const sections = new Map<string, SessionSection>()
  for (const section of source.view.sections) {
    for (const rowKey of section.rowKeys) sections.set(rowKey, section)
  }
  const candidates: PaletteCandidate[] = []
  for (const rowKey of matchingPastRowKeys(source.view, source.index, terms)) {
    if (candidates.length >= limit) break
    const row = rows.get(rowKey)
    const section = sections.get(rowKey)
    if (row === undefined || section === undefined) continue
    // 補足は中央のヘッダと同じグループの表示 (`groupLabelOf`)。
    const folderName =
      section.group.kind === 'folder' ? source.folderNameOf(section.group.folderId) : null
    candidates.push({
      id: `session:past:${rowKey}`,
      kind: 'past',
      label: rowTitleText(row.title, formatSessionTime),
      detail: groupLabelOf(section.group, folderName, row.session),
      action: { kind: 'past', rowKey }
    })
  }
  return candidates
}

/**
 * palette の候補を組み立てる (data-model §3)。並びは 操作 → 稼働中 → 過去 で、合わせて最大 `PALETTE_MAX_CANDIDATES` 件。
 * 語が空 (空白だけを含む) なら操作だけを返す。
 */
export function buildPaletteCandidates(
  query: string,
  state: PaletteState,
  running: PaletteRunningSource,
  past: PalettePastSource
): readonly PaletteCandidate[] {
  const terms = toTerms(query)
  const actions = actionCandidates(state, terms).slice(0, PALETTE_MAX_CANDIDATES)
  if (terms.length === 0) return actions
  const live = runningCandidates(running, terms, PALETTE_MAX_CANDIDATES - actions.length)
  const old = pastCandidates(past, terms, PALETTE_MAX_CANDIDATES - actions.length - live.length)
  return [...actions, ...live, ...old]
}

/** 候補の実行が呼ぶ操作。 */
export interface PaletteEffects {
  readonly openLaunch: () => void
  readonly openSettings: (section: SettingsSection) => void
  readonly setSidebarCollapsed: (collapsed: boolean) => void
  readonly setPanelCollapsed: (collapsed: boolean) => void
  readonly requestConversationSearch: () => void
  readonly setTranscriptDensity: (density: TranscriptDensity) => void
  /** 稼働中のストアの `select`。 */
  readonly selectRunning: (sessionId: string) => void
  /** 過去の一覧のストアの `select`。 */
  readonly selectPast: (rowKey: string) => void
}

/** 候補を実行する (data-model §3 の表の「実行」)。 */
export function runPaletteAction(action: PaletteAction, effects: PaletteEffects): void {
  switch (action.kind) {
    case 'launch':
      effects.openLaunch()
      return
    case 'settings':
      effects.openSettings(action.section)
      return
    case 'sidebar':
      effects.setSidebarCollapsed(action.collapsed)
      return
    case 'panel':
      effects.setPanelCollapsed(action.collapsed)
      return
    case 'chat-search':
      effects.requestConversationSearch()
      return
    case 'density':
      effects.setTranscriptDensity(action.density)
      return
    case 'running':
      effects.selectRunning(action.sessionId)
      return
    case 'past':
      effects.selectPast(action.rowKey)
      return
  }
}

/**
 * 本物のストアに繋いだ操作。面の状態は `stores/ui.ts`、過去の選択は `stores/sessions.ts`、稼働中の選択は渡された
 * 稼働中のストア (`select`)。値は呼んだ時点のストアから読む。
 */
export function createPaletteEffects(running: {
  readonly select: (sessionId: string | null) => void
}): PaletteEffects {
  const ui = (): UiState => useUiStore.getState()
  return {
    openLaunch: () => ui().setLaunchOpen(true),
    openSettings: (section) => ui().openSettings(section),
    setSidebarCollapsed: (collapsed) => ui().setSidebarCollapsed(collapsed),
    setPanelCollapsed: (collapsed) => ui().setPanelCollapsed(collapsed),
    requestConversationSearch: () => ui().requestConversationSearch(),
    setTranscriptDensity: (density) => ui().setTranscriptDensity(density),
    selectRunning: (sessionId) => running.select(sessionId),
    selectPast: (rowKey) => useSessionsStore.getState().select(rowKey)
  }
}
