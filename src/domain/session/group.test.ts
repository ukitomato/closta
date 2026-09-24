import { describe, expect, it } from 'vitest'

import { wslNamespace } from '@domain/runtime/namespace'
import { makeRuntimePath } from '@domain/runtime/path-types'
import type { WorkspaceFolder } from '@domain/workspace/folder'

import { classifyCwd } from './cwd-origin'
import { countSessions, groupSessions, type MatchedSession } from './group'
import { cwdKeyOf, type FolderMatch } from './match'
import type { SessionSummary } from './summary'

/**
 * グループ分けと**総数保存** (BE-015 / SC-006 / SC-013 / FR-051)。
 *
 * 総数保存が守ろうとしているのは 1 点である —
 * **どの分類にも当てはまらなかったセッションを黙って落とさないこと。**
 */

const NOW = 1_700_000_000_000
const UBUNTU = { kind: 'wsl', distroName: 'Ubuntu' } as const
const DETECTED = new Set(['Ubuntu'])

function folder(id: string, raw: string): WorkspaceFolder {
  const path = makeRuntimePath(wslNamespace('Ubuntu'), raw)
  if (!path.ok) throw new Error('前提')
  return {
    id,
    location: UBUNTU,
    path: path.path,
    displayName: id,
    registeredAt: NOW
  }
}

function session(
  id: string,
  cwd: string | null,
  lastModified: number | null = NOW
): SessionSummary {
  return {
    sessionId: id,
    targetKey: 'wsl:Ubuntu#0',
    targetLabel: 'y',
    summary: id,
    firstPrompt: null,
    customTitle: null,
    lastModified,
    createdAt: null,
    fileSize: null,
    gitBranch: null,
    tag: null,
    origin: classifyCwd({ cwd, targetLocation: UBUNTU, detectedDistros: DETECTED }),
    source: { programmatic: false, worktree: false },
    normalized: { truncated: false, controlCharsRemoved: false }
  }
}

function matched(s: SessionSummary, match: FolderMatch): MatchedSession {
  return { session: s, match }
}

describe('FR-051: 登録フォルダはセッション 0 件でも現れる', () => {
  it('登録 3 件 / セッション 0 件 → folder グループが 3 件', () => {
    const groups = groupSessions({
      folders: [folder('f1', '/home/a'), folder('f2', '/home/b'), folder('f3', '/home/c')],
      matched: []
    })
    const folderGroups = groups.filter((g) => g.kind === 'folder')
    expect(folderGroups).toHaveLength(3)
    expect(folderGroups.every((g) => g.sessions.length === 0)).toBe(true)
  })

  it('**セッション集合だけから導出しない** — 履歴 0 件のフォルダが消えない', () => {
    const groups = groupSessions({
      folders: [folder('empty', '/home/empty'), folder('used', '/home/used')],
      matched: [
        matched(session('s1', '/home/used/x'), {
          kind: 'folder',
          folderId: 'used',
          boundary: 'native',
          matchedPrefix: '/home/used'
        })
      ]
    })
    const ids = groups
      .filter((g) => g.kind === 'folder')
      .map((g) => (g.kind === 'folder' ? g.folderId : ''))
    expect(ids).toContain('empty')
    expect(ids).toContain('used')
  })
})

describe('SC-006: 総数が保たれる', () => {
  it('4 種のグループに散っても総数は変わらない', () => {
    const sessions: MatchedSession[] = [
      matched(session('s1', '/home/p/x'), {
        kind: 'folder',
        folderId: 'f1',
        boundary: 'native',
        matchedPrefix: '/home/p'
      }),
      matched(session('s2', '/home/q'), { kind: 'pending', reason: 'distro-not-running' }),
      matched(session('s3', '/home/r'), {
        kind: 'unregistered',
        cwdKey: cwdKeyOf(wslNamespace('Ubuntu'), '/home/r')
      }),
      matched(session('s4', null), { kind: 'unknown', reason: 'cwd-absent' }),
      matched(session('s5', '/home/r'), {
        kind: 'unregistered',
        cwdKey: cwdKeyOf(wslNamespace('Ubuntu'), '/home/r')
      })
    ]
    const groups = groupSessions({ folders: [folder('f1', '/home/p')], matched: sessions })
    expect(countSessions(groups)).toBe(sessions.length)
  })

  it('**seed に無い folderId でも落とさない** (登録解除と再取得が交差した場合)', () => {
    const groups = groupSessions({
      folders: [],
      matched: [
        matched(session('s1', '/home/p/x'), {
          kind: 'folder',
          folderId: 'removed',
          boundary: 'native',
          matchedPrefix: '/home/p'
        })
      ]
    })
    expect(countSessions(groups)).toBe(1)
  })
})

describe('4 種を潰さない', () => {
  it('未登録は作業ディレクトリごとにまとまる', () => {
    const keyR = cwdKeyOf(wslNamespace('Ubuntu'), '/home/r')
    const keyS = cwdKeyOf(wslNamespace('Ubuntu'), '/home/s')
    const groups = groupSessions({
      folders: [],
      matched: [
        matched(session('s1', '/home/r'), { kind: 'unregistered', cwdKey: keyR }),
        matched(session('s2', '/home/r'), { kind: 'unregistered', cwdKey: keyR }),
        matched(session('s3', '/home/s'), { kind: 'unregistered', cwdKey: keyS })
      ]
    })
    const unregistered = groups.filter((g) => g.kind === 'unregistered')
    expect(unregistered).toHaveLength(2)
    const byKey = new Map(
      unregistered.map((g) => [g.kind === 'unregistered' ? g.cwdKey : '', g.sessions.length])
    )
    expect(byKey.get(keyR)).toBe(2)
    expect(byKey.get(keyS)).toBe(1)
  })

  it('不明は**理由ごとに**分かれる (記録がない / 所在が分からない)', () => {
    const groups = groupSessions({
      folders: [],
      matched: [
        matched(session('s1', null), { kind: 'unknown', reason: 'cwd-absent' }),
        matched(session('s2', '/home/y'), { kind: 'unknown', reason: 'location-unknown' }),
        matched(session('s3', null), { kind: 'unknown', reason: 'cwd-absent' })
      ]
    })
    const unknown = groups.filter((g) => g.kind === 'unknown')
    expect(unknown).toHaveLength(2)
  })

  it('保留は (所在, 理由) ごとに分かれる', () => {
    const groups = groupSessions({
      folders: [],
      matched: [
        matched(session('s1', '/home/a'), { kind: 'pending', reason: 'distro-not-running' }),
        matched(session('s2', '/home/b'), { kind: 'pending', reason: 'probe-failed' })
      ]
    })
    expect(groups.filter((g) => g.kind === 'pending')).toHaveLength(2)
  })

  it('未登録グループは所在と変換済みパスを持つ (登録導線に渡す値)', () => {
    const key = cwdKeyOf(wslNamespace('Ubuntu'), '/home/r')
    const groups = groupSessions({
      folders: [],
      matched: [matched(session('s1', '/home/r'), { kind: 'unregistered', cwdKey: key })]
    })
    const group = groups.find((g) => g.kind === 'unregistered')
    expect(group?.kind).toBe('unregistered')
    if (group?.kind !== 'unregistered') return
    expect(group.location).toEqual(UBUNTU)
    expect(group.cwd?.value).toBe('/home/r')
    // 所在が決まる出自なので表示用の生値は要らない。
    expect(group.cwdDisplay).toBeNull()
  })
})

describe('越境の表示', () => {
  it('1 件でも cross があればグループは cross を出す', () => {
    const groups = groupSessions({
      folders: [folder('f1', '/home/p')],
      matched: [
        matched(session('s1', '/home/p/a'), {
          kind: 'folder',
          folderId: 'f1',
          boundary: 'native',
          matchedPrefix: '/home/p'
        }),
        matched(session('s2', '/home/p/b'), {
          kind: 'folder',
          folderId: 'f1',
          boundary: 'cross',
          matchedPrefix: '/home/p'
        })
      ]
    })
    const group = groups.find((g) => g.kind === 'folder')
    expect(group?.kind === 'folder' ? group.boundary : null).toBe('cross')
  })
})

describe('並び順', () => {
  it('最終更新の新しい順。**不明は端に置き、落とさない**', () => {
    const groups = groupSessions({
      folders: [folder('f1', '/home/p')],
      matched: [
        matched(session('old', '/home/p/a', NOW - 1000), {
          kind: 'folder',
          folderId: 'f1',
          boundary: 'native',
          matchedPrefix: '/home/p'
        }),
        matched(session('unknownTime', '/home/p/b', null), {
          kind: 'folder',
          folderId: 'f1',
          boundary: 'native',
          matchedPrefix: '/home/p'
        }),
        matched(session('new', '/home/p/c', NOW), {
          kind: 'folder',
          folderId: 'f1',
          boundary: 'native',
          matchedPrefix: '/home/p'
        })
      ]
    })
    const group = groups.find((g) => g.kind === 'folder')
    expect(group?.sessions.map((s) => s.sessionId)).toEqual(['new', 'old', 'unknownTime'])
  })
})
