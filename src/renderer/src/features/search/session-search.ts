import type { SessionLaunchConfig } from '@domain/session/launch-config'

import { groupLabelOf } from '@/features/session-list/group-label'
import type { SessionRowsView } from '@/features/session-list/rows'

import { matchesAllNormalizedTerms, normalizeForSearch } from './text-search'

/**
 * Thread search と palette のセッションの候補の対象 (O-3 / spec FR-001・FR-007 / data-model §1)。
 *
 * | 規則 | 根拠 |
 * |---|---|
 * | 過去の行の対象は要約行の `customTitle` / `summary` / `firstPrompt` / `gitBranch` / `tag` / `cwdDisplay` と、行が属するグループの見出しの文字列 (`groupLabelOf`。新しい導出を作らない) | data-model §1「Thread search の対象」 |
 * | **`cwd.value` (PathDTO) を直接は読まない** — 未登録の見出しは `groupLabelOf` が返す表示用の文字列として入る | Principle I |
 * | transcript の本文は読まない。読み込み済みの行 (索引にある行) だけを探す | spec FR-001 |
 * | 行ごとの正規化したフィールドは、索引 (`buildSessionRows` の結果) とフォルダの表示名が変わったときだけ作り直す (`createPastSearchIndexer`) | data-model §1 |
 * | 稼働中の対象は作業フォルダの表示名とランタイムの表示名 | data-model §1「palette のセッションの候補」 |
 * | 並びは一覧の既存の並びを保つ (一致の度合いで並べ替えない) | data-model §1「並び」 |
 *
 * 一致の規則そのものは `text-search.ts` にある。`terms` はどれも `toTerms` の結果を渡す。
 */

/** 過去の行の検索の索引。行の鍵 (`rowKey`) → 正規化したフィールド。 */
export type PastSearchIndex = ReadonlyMap<string, readonly string[]>

/** 登録フォルダの表示名を引く関数 (`useFolderLabels().nameOf`)。引けなければ `null`。 */
export type FolderNameOf = (folderId: string) => string | null

/** 区画ごとのフォルダの表示名 (登録フォルダの区画だけ。ほかは `null`)。区画の添字と揃う。 */
function folderNamesOf(view: SessionRowsView, nameOf: FolderNameOf): readonly (string | null)[] {
  return view.sections.map((section) =>
    section.group.kind === 'folder' ? nameOf(section.group.folderId) : null
  )
}

function buildIndex(
  view: SessionRowsView,
  folderNames: readonly (string | null)[]
): PastSearchIndex {
  const index = new Map<string, readonly string[]>()
  // 同じ見出しを区画の行の数だけ正規化しない。
  const normalizedLabels = new Map<string, string>()
  const normalizeLabel = (label: string): string => {
    const known = normalizedLabels.get(label)
    if (known !== undefined) return known
    const normalized = normalizeForSearch(label)
    normalizedLabels.set(label, normalized)
    return normalized
  }

  view.sections.forEach((section, sectionAt) => {
    const folderName = folderNames[sectionAt] ?? null
    section.sessions.forEach((session, at) => {
      const rowKey = section.rowKeys[at]
      if (rowKey === undefined) return
      const fields: string[] = []
      for (const value of [
        session.customTitle,
        session.summary,
        session.firstPrompt,
        session.gitBranch,
        session.tag,
        session.cwdDisplay
      ]) {
        if (value !== null) fields.push(normalizeForSearch(value))
      }
      const label = groupLabelOf(section.group, folderName, session)
      if (label !== null) fields.push(normalizeLabel(label))
      index.set(rowKey, fields)
    })
  })
  return index
}

/** 過去の行の検索の索引を作る (毎回作り直す。描画のたびに呼ぶなら `createPastSearchIndexer` を使う)。 */
export function buildPastSearchIndex(view: SessionRowsView, nameOf: FolderNameOf): PastSearchIndex {
  return buildIndex(view, folderNamesOf(view, nameOf))
}

function sameNames(a: readonly (string | null)[], b: readonly (string | null)[]): boolean {
  return a.length === b.length && a.every((name, at) => name === b[at])
}

/**
 * 索引を覚えておく作り手。`view` が同じ object で、区画ごとのフォルダの表示名が前回と同じなら、前回の索引を返す
 * (入力のたびに正規化しない。data-model §1)。`nameOf` は描画のたびに別の関数でよい (表示名の値で比べる)。
 */
export function createPastSearchIndexer(): (
  view: SessionRowsView,
  nameOf: FolderNameOf
) => PastSearchIndex {
  let last: {
    readonly view: SessionRowsView
    readonly folderNames: readonly (string | null)[]
    readonly index: PastSearchIndex
  } | null = null
  return (view, nameOf) => {
    const folderNames = folderNamesOf(view, nameOf)
    if (last !== null && last.view === view && sameNames(last.folderNames, folderNames)) {
      return last.index
    }
    const index = buildIndex(view, folderNames)
    last = { view, folderNames, index }
    return index
  }
}

/** 過去の行が語に一致するか。語が空なら常に一致。索引に無い行 (読み込まれていない行) は語があれば一致しない。 */
export function pastRowMatches(
  index: PastSearchIndex,
  rowKey: string,
  terms: readonly string[]
): boolean {
  if (terms.length === 0) return true
  const fields = index.get(rowKey)
  return fields !== undefined && matchesAllNormalizedTerms(fields, terms)
}

/** 語に一致した過去の行の鍵を、一覧の並び (区画の順 → 区画の中の行の順) のまま返す (palette の候補)。 */
export function matchingPastRowKeys(
  view: SessionRowsView,
  index: PastSearchIndex,
  terms: readonly string[]
): readonly string[] {
  const keys: string[] = []
  for (const section of view.sections) {
    for (const rowKey of section.rowKeys) {
      if (pastRowMatches(index, rowKey, terms)) keys.push(rowKey)
    }
  }
  return keys
}

/** 稼働中のセッションの表示名を引く関数 (`RunningSessionsView` の `folderName` / `runtimeName`)。 */
export interface RunningSearchNames {
  readonly folderName: (folderId: string) => string
  readonly runtimeName: (runtimeId: string) => string
}

/** 稼働中のセッションのうち、検索が読む値 (稼働中のストアの `sessions` の値はこの形を満たす)。 */
export interface RunningSearchSource {
  readonly config: Pick<SessionLaunchConfig, 'folderId' | 'runtimeId'>
}

/** 稼働中のセッションが語に一致するか (作業フォルダの表示名・ランタイムの表示名)。語が空なら常に一致。 */
export function runningSessionMatches(
  session: RunningSearchSource,
  names: RunningSearchNames,
  terms: readonly string[]
): boolean {
  if (terms.length === 0) return true
  const fields = [
    normalizeForSearch(names.folderName(session.config.folderId)),
    normalizeForSearch(names.runtimeName(session.config.runtimeId))
  ]
  return matchesAllNormalizedTerms(fields, terms)
}

/** 語に一致した稼働中のセッションの id を、一覧の並び (`order`。起動順) のまま返す (palette の候補)。 */
export function matchingRunningIds(
  order: readonly string[],
  sessions: Readonly<Record<string, RunningSearchSource>>,
  names: RunningSearchNames,
  terms: readonly string[]
): readonly string[] {
  const ids: string[] = []
  for (const id of order) {
    if (!Object.hasOwn(sessions, id)) continue
    const session = sessions[id]
    if (session !== undefined && runningSessionMatches(session, names, terms)) ids.push(id)
  }
  return ids
}
