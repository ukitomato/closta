import type { HostPath, RuntimePath } from '@domain/runtime/path-types'
import type { Boundary } from '@domain/workspace/dto'
import type { Location, WorkspaceFolder } from '@domain/workspace/folder'

import { originDisplay, originLocation, originPath } from './cwd-origin'
import type { FolderMatch, PendingReason, UnknownReason } from './match'
import { byLastModifiedDesc, sessionRowKey, type SessionSummary } from './summary'

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
      /**
       * このフォルダの対応づけ全体の越境。**1 件でも `cross` があれば `cross`** である。
       *
       * **行の越境はこれではない** (pr-gate Round 1 / po H-001)。
       * 見出しに出す「このフォルダには越境が含まれる」であり、
       * どの行が越境かはここから決まらない。行単位は `boundaryOf` を使う。
       */
      readonly boundary: Boundary
      readonly sessions: readonly SessionSummary[]
      /**
       * セッションごとの越境 (pr-gate Round 1 / po H-001)。鍵は `sessionRowKey`。
       *
       * **対応づけは行単位で決まる** (`match.ts` が `FolderMatch.boundary` を
       * セッションごとに返す) のに、フォルダ単位の OR だけを境界に出していた。
       * その結果 (1) Windows 側の登録フォルダをホストと WSL (`/mnt/c/...`) の
       * 両方から使う典型ケースで**ネイティブな行まで越境と読め**、
       * (2) 1 件だけ越境している行を特定できなかった。
       *
       * US-1 AC-4 は「**そのセッション**は当該登録フォルダの配下に現れ、
       * 越境である旨が示される」と行単位を求めている。
       * AD-016 の性能崖は行ごとの性質であり、R-1 は行ごとに提示している —
       * 同じ概念の粒度を R-2 で落とさない。
       */
      readonly boundaryOf: ReadonlyMap<string, Boundary>
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
  const folderGroups = new Map<
    string,
    {
      boundary: Boundary
      sessions: SessionSummary[]
      /** セッションごとの越境。鍵は `sessionRowKey` (pr-gate Round 1 / po H-001)。 */
      boundaryOf: Map<string, Boundary>
    }
  >()
  for (const folder of input.folders) {
    folderGroups.set(folder.id, { boundary: 'unknown', sessions: [], boundaryOf: new Map() })
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
        const existing = folderGroups.get(match.folderId) ?? {
          boundary: 'unknown' as Boundary,
          sessions: [],
          boundaryOf: new Map<string, Boundary>()
        }
        folderGroups.set(match.folderId, {
          // 越境は組み合わせで決まる。同じフォルダ内で混在しうるので
          // **1 件でも `cross` があれば `cross` を表に出す** (FR-023)。
          boundary: mergeBoundary(existing.boundary, match.boundary),
          sessions: [...existing.sessions, session],
          /* **行単位も残す** (po H-001)。OR に畳むのは見出し用の値だけにする。 */
          boundaryOf: new Map(existing.boundaryOf).set(sessionRowKey(session), match.boundary)
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
      sessions: sort(value.sessions),
      boundaryOf: value.boundaryOf
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
