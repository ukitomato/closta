import { describe, expect, it } from 'vitest'

import type { SessionIndexDTO, SessionSummaryDTO } from '@domain/session/dto'

import { GROUP_KIND_LABELS } from '@/features/session-list/labels'
import { buildSessionRows } from '@/features/session-list/rows'

import {
  buildPastSearchIndex,
  createPastSearchIndexer,
  matchingPastRowKeys,
  matchingRunningIds,
  pastRowMatches,
  runningSessionMatches,
  type FolderNameOf
} from './session-search'
import { toTerms } from './text-search'

/** O-3 FE-002 — Thread search と palette のセッションの候補の対象 (data-model §1)。 */

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

const S1 = session('s1', {
  customTitle: 'ログイン画面の改修',
  gitBranch: 'feature/login',
  tag: 'ＵＲＧＥＮＴ'
})
const S2 = session('s2', {
  summary: 'API の設計',
  // パス (PathDTO の値) にだけある語は一致の対象にしない (Principle I)。
  cwd: { namespace: 'wsl:Ubuntu', value: '/home/u/secretpath' },
  cwdDisplay: '/home/u/proj'
})
const S3 = session('s3', { firstPrompt: 'テストを直して' })
const S4 = session('s4', { summary: '保留中の行' })
// フィールドがすべて null の行 (見出しだけで探せる)。
const S5 = session('s5')
const S6 = session('s6', { cwdDisplay: 'C:\\work\\不明の場所' })

const INDEX: SessionIndexDTO = {
  groups: [
    { kind: 'unknown', reasonKey: 'cwd-absent', sessions: [S6] },
    {
      kind: 'unregistered',
      cwdKey: '["wsl:Ubuntu","/home/u/未登録の作業"]',
      cwd: { namespace: 'wsl:Ubuntu', value: '/home/u/未登録の作業' },
      cwdDisplay: '/home/u/未登録の作業',
      suggestedDisplayName: '未登録の作業',
      location: { kind: 'wsl', distroName: 'Ubuntu' },
      sessions: [S5]
    },
    {
      kind: 'pending',
      location: { kind: 'wsl', distroName: 'Debian' },
      reasonKey: 'distro-not-running',
      sessions: [S4]
    },
    { kind: 'folder', folderId: 'f1', boundary: 'native', sessions: [S1, S2, S3] }
  ],
  outcomes: [],
  fetchedAt: 0,
  complete: true
}

const view = buildSessionRows(INDEX)
const nameOf: FolderNameOf = (folderId) => (folderId === 'f1' ? '顧客ポータル' : null)

function keyOf(s: SessionSummaryDTO): string {
  const row = view.rows.find((r) => r.session === s)
  if (row === undefined) throw new Error('行が無い')
  return row.rowKey
}

function matched(query: string, index = buildPastSearchIndex(view, nameOf)): readonly string[] {
  return matchingPastRowKeys(view, index, toTerms(query))
}

describe('過去の行の対象 (Thread search)', () => {
  it('登録フォルダの表示名で、その区画の行がすべて一致する', () => {
    expect(matched('顧客')).toEqual([keyOf(S1), keyOf(S2), keyOf(S3)])
  })

  it('保留の区画は所在で一致する', () => {
    expect(matched('debian')).toEqual([keyOf(S4)])
  })

  it('未登録の区画は見出し (groupLabelOf の文字列) で一致する', () => {
    expect(matched('未登録の作業')).toEqual([keyOf(S5)])
  })

  it('不明の区画は行の表示用の文字列で一致する', () => {
    expect(matched('不明の場所')).toEqual([keyOf(S6)])
  })

  it('cwdDisplay・customTitle・summary・firstPrompt・gitBranch・tag で一致する', () => {
    expect(matched('proj')).toEqual([keyOf(S2)])
    expect(matched('ログイン')).toEqual([keyOf(S1)])
    expect(matched('設計')).toEqual([keyOf(S2)])
    expect(matched('テスト')).toEqual([keyOf(S3)])
    expect(matched('feature/login')).toEqual([keyOf(S1)])
    expect(matched('urgent')).toEqual([keyOf(S1)])
  })

  it('cwd.value にだけある語では一致しない (Principle I)', () => {
    expect(matched('secretpath')).toEqual([])
  })

  it('null のフィールドを持つ行は落ちない (語が空なら残り、見出しで一致し、ほかの語で例外を出さない)', () => {
    const index = buildPastSearchIndex(view, nameOf)
    expect(pastRowMatches(index, keyOf(S5), [])).toBe(true)
    expect(pastRowMatches(index, keyOf(S5), toTerms('未登録'))).toBe(true)
    expect(pastRowMatches(index, keyOf(S5), toTerms('ログイン'))).toBe(false)
  })

  it('複数の語は AND で、フィールドをまたいでよい', () => {
    expect(matched('顧客 ログイン')).toEqual([keyOf(S1)])
    expect(matched('顧客 debian')).toEqual([])
  })

  it('語が空なら全行を一覧の並びのまま返す', () => {
    expect(matched('   ')).toEqual(view.rows.map((r) => r.rowKey))
    // 区画の並び (folder → pending → unregistered → unknown) と区画の中の行の並びを保つ。
    expect(matched('')).toEqual([keyOf(S1), keyOf(S2), keyOf(S3), keyOf(S4), keyOf(S5), keyOf(S6)])
  })

  it('索引に無い行 (読み込まれていない行) は語があれば一致しない', () => {
    const index = buildPastSearchIndex(view, nameOf)
    expect(pastRowMatches(index, 'missing', toTerms('顧客'))).toBe(false)
    expect(pastRowMatches(index, 'missing', [])).toBe(true)
  })

  it('表示名が引けない登録フォルダは種別名の見出しで探せる (作り話をしない)', () => {
    const index = buildPastSearchIndex(view, () => null)
    expect(matched('顧客', index)).toEqual([])
    expect(matched(GROUP_KIND_LABELS.folder, index)).toEqual([keyOf(S1), keyOf(S2), keyOf(S3)])
  })
})

describe('索引の作り直し (createPastSearchIndexer)', () => {
  it('索引とフォルダの表示名が同じなら、前回の索引を返す (nameOf は別の関数でよい)', () => {
    const indexer = createPastSearchIndexer()
    const first = indexer(view, nameOf)
    expect(indexer(view, (id) => nameOf(id))).toBe(first)
  })

  it('フォルダの表示名が変わったら作り直す', () => {
    const indexer = createPastSearchIndexer()
    const first = indexer(view, nameOf)
    const renamed = indexer(view, (id) => (id === 'f1' ? '社内ツール' : null))
    expect(renamed).not.toBe(first)
    expect(matchingPastRowKeys(view, renamed, toTerms('社内'))).toEqual([
      keyOf(S1),
      keyOf(S2),
      keyOf(S3)
    ])
    expect(matchingPastRowKeys(view, renamed, toTerms('顧客'))).toEqual([])
  })

  it('索引 (buildSessionRows の結果) が変わったら作り直す', () => {
    const indexer = createPastSearchIndexer()
    const first = indexer(view, nameOf)
    const next = buildSessionRows({ ...INDEX, groups: INDEX.groups.slice(0, 1) })
    const rebuilt = indexer(next, nameOf)
    expect(rebuilt).not.toBe(first)
    expect(rebuilt.size).toBe(1)
  })
})

describe('稼働中の行の対象 (palette)', () => {
  const names = {
    folderName: (id: string) => (id === 'f1' ? '顧客ポータル' : '社内ツール'),
    runtimeName: (id: string) => (id === 'r1' ? 'Ubuntu-24.04' : 'Windows')
  }
  const sessions = {
    a: { config: { folderId: 'f1', runtimeId: 'r1' } },
    b: { config: { folderId: 'f2', runtimeId: 'r2' } }
  }

  it('作業フォルダの表示名とランタイムの表示名で一致する', () => {
    expect(runningSessionMatches(sessions.a, names, toTerms('顧客'))).toBe(true)
    expect(runningSessionMatches(sessions.a, names, toTerms('ＵＢＵＮＴＵ'))).toBe(true)
    expect(runningSessionMatches(sessions.a, names, toTerms('顧客 ubuntu'))).toBe(true)
    expect(runningSessionMatches(sessions.a, names, toTerms('社内'))).toBe(false)
  })

  it('一致した id を起動順のまま返し、ストアに無い id は飛ばす', () => {
    expect(matchingRunningIds(['b', 'missing', 'a'], sessions, names, [])).toEqual(['b', 'a'])
    expect(matchingRunningIds(['b', 'a'], sessions, names, toTerms('windows'))).toEqual(['b'])
    expect(matchingRunningIds(['toString'], sessions, names, [])).toEqual([])
  })
})
