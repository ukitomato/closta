import type { HostPath, RuntimePath } from '@domain/runtime/path-types'
import type { Boundary } from '@domain/workspace/dto'
import type { Location, WorkspaceFolder } from '@domain/workspace/folder'

import { originDisplay, originLocation, originPath } from './cwd-origin'
import type { FolderMatch, PendingReason, UnknownReason } from './match'
import { byLastModifiedDesc, type SessionSummary } from './summary'

/**
 * 一覧のまとまり (data-model §5)。
 *
 * **4 種を 2 種に潰さない** (FR-022 / FR-025 / FR-028)。
 * 保留は「今は決められない」、未登録は「決めた結果として対応が無い」、
 * 不明は「作業ディレクトリから所在が決まらない」であり、示すべきことが違う。
 */

export type SessionGroup =
  | {
      readonly kind: 'folder'
      readonly folderId: string
      readonly boundary: Boundary
      readonly sessions: readonly SessionSummary[]
    }
  | {
      readonly kind: 'pending'
      readonly location: Location
      readonly reasonKey: PendingReason
      readonly sessions: readonly SessionSummary[]
    }
  | {
      readonly kind: 'unregistered'
      readonly cwdKey: string
      readonly cwd: HostPath | RuntimePath | null
      readonly cwdDisplay: string | null
      readonly location: Location | null
      readonly sessions: readonly SessionSummary[]
    }
  | {
      readonly kind: 'unknown'
      readonly reasonKey: UnknownReason
      readonly sessions: readonly SessionSummary[]
    }

/** 1 セッションと、その対応づけの結果。 */
export interface MatchedSession {
  readonly session: SessionSummary
  readonly match: FolderMatch
}

export interface GroupInput {
  /**
   * **登録フォルダの一覧。** グループの生成源の片方である (FR-051)。
   * セッション集合だけから導出すると、履歴 0 件の登録フォルダが画面から消える。
   */
  readonly folders: readonly WorkspaceFolder[]
  readonly matched: readonly MatchedSession[]
}

/**
 * グループへまとめる。
 *
 * **`folder` グループは登録フォルダ一覧から seed する** (FR-051) —
 * `sessions` が空でもグループを落とさない。
 *
 * **総数が保たれる**: `Σ 各グループの件数 = 入力セッションの総数` (SC-006)。
 * セッションは必ずどれか 1 つのグループに入る。
 */
export function groupSessions(input: GroupInput): readonly SessionGroup[] {
  // ── folder: 登録フォルダから seed する (FR-051) ───────────────────
  const folderGroups = new Map<string, { boundary: Boundary; sessions: SessionSummary[] }>()
  for (const folder of input.folders) {
    folderGroups.set(folder.id, { boundary: 'unknown', sessions: [] })
  }

  const pendingGroups = new Map<
    string,
    { location: Location; reasonKey: PendingReason; sessions: SessionSummary[] }
  >()
  const unregisteredGroups = new Map<
    string,
    {
      cwd: HostPath | RuntimePath | null
      cwdDisplay: string | null
      location: Location | null
      sessions: SessionSummary[]
    }
  >()
  const unknownGroups = new Map<UnknownReason, SessionSummary[]>()

  for (const { session, match } of input.matched) {
    switch (match.kind) {
      case 'folder': {
        // seed に無い `folderId` は、登録解除と再取得が交差した場合に起こりうる。
        // **落とさない** — 総数保存 (SC-006) を破るため、その場で枠を作る。
        const existing = folderGroups.get(match.folderId) ?? { boundary: 'unknown', sessions: [] }
        folderGroups.set(match.folderId, {
          // 越境は組み合わせで決まる。同じフォルダ内で混在しうるので
          // **1 件でも `cross` があれば `cross` を表に出す** (FR-023)。
          boundary: mergeBoundary(existing.boundary, match.boundary),
          sessions: [...existing.sessions, session]
        })
        break
      }

      case 'pending': {
        const location = originLocation(session.origin)
        if (location === null) {
          push(unknownGroups, 'location-unknown', session)
          break
        }
        const key = `${location.kind === 'wsl' ? location.distroName : 'windows'}\u0000${match.reason}`
        const bucket = pendingGroups.get(key)
        if (bucket === undefined) {
          pendingGroups.set(key, { location, reasonKey: match.reason, sessions: [session] })
        } else {
          bucket.sessions.push(session)
        }
        break
      }

      case 'unregistered': {
        const bucket = unregisteredGroups.get(match.cwdKey)
        if (bucket === undefined) {
          unregisteredGroups.set(match.cwdKey, {
            cwd: originPath(session.origin),
            cwdDisplay: originDisplay(session.origin),
            location: originLocation(session.origin),
            sessions: [session]
          })
        } else {
          bucket.sessions.push(session)
        }
        break
      }

      case 'unknown':
        push(unknownGroups, match.reason, session)
        break
    }
  }

  const groups: SessionGroup[] = []

  for (const [folderId, value] of folderGroups) {
    groups.push({
      kind: 'folder',
      folderId,
      boundary: value.boundary,
      sessions: sort(value.sessions)
    })
  }
  for (const value of pendingGroups.values()) {
    groups.push({
      kind: 'pending',
      location: value.location,
      reasonKey: value.reasonKey,
      sessions: sort(value.sessions)
    })
  }
  for (const [cwdKey, value] of unregisteredGroups) {
    groups.push({
      kind: 'unregistered',
      cwdKey,
      cwd: value.cwd,
      cwdDisplay: value.cwdDisplay,
      location: value.location,
      sessions: sort(value.sessions)
    })
  }
  for (const [reasonKey, sessions] of unknownGroups) {
    groups.push({ kind: 'unknown', reasonKey, sessions: sort(sessions) })
  }

  return groups
}

/** グループ全体の件数。**入力の総数と一致しなければならない** (SC-006)。 */
export function countSessions(groups: readonly SessionGroup[]): number {
  return groups.reduce((total, group) => total + group.sessions.length, 0)
}

function mergeBoundary(a: Boundary, b: Boundary): Boundary {
  if (a === 'cross' || b === 'cross') return 'cross'
  if (a === 'native' || b === 'native') return 'native'
  return 'unknown'
}

function push<K>(map: Map<K, SessionSummary[]>, key: K, session: SessionSummary): void {
  const bucket = map.get(key)
  if (bucket === undefined) map.set(key, [session])
  else bucket.push(session)
}

function sort(sessions: readonly SessionSummary[]): readonly SessionSummary[] {
  return [...sessions].sort(byLastModifiedDesc)
}
