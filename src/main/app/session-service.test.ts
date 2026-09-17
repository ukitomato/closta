import { describe, expect, it } from 'vitest'

import { fixedCapabilities } from '@domain/runtime/capabilities'
import type { RuntimeDescriptor } from '@domain/runtime/descriptor'
import { wslNamespace, type WslNamespaceId } from '@domain/runtime/namespace'
import { makeHostPath, makeRuntimePath, type HostPath } from '@domain/runtime/path-types'
import { createVerifiedRunning, type VerifiedRunning } from '@domain/runtime/verified-running'
import type {
  EnumerationRequest,
  EnumerationResult,
  EnumerationTargetFinder,
  RawSessionRecord,
  SessionEnumerator,
  TargetDiscovery
} from '@domain/session/interfaces'
import { enumerationTargetKey, type EnumerationTarget } from '@domain/session/target'
import { SESSION_PAGE_SIZE } from '@domain/validation'

import type { Measure } from './measure'
import { createSessionService, type SessionServiceDeps } from './session-service'

/**
 * BE-027 — 一覧の調停 (SC-007 / SC-012 / FR-030 〜 FR-038)。
 *
 * **実プロセスを起こさない。** `SessionEnumerator` と `EnumerationTargetFinder` を
 * 差し替える (contracts のテスト戦略「失敗の封じ込め」)。
 */

const NOW = 1_700_000_000_000
const UBUNTU: WslNamespaceId = wslNamespace('Ubuntu')

const measure: Measure = (_point, run) => run()

function hostHome(): HostPath {
  const result = makeHostPath('C:\\Users\\y')
  if (!result.ok) throw new Error('テストの前提が壊れている')
  return result.path
}

function hostTarget(): EnumerationTarget {
  const configDir = makeHostPath('C:\\Users\\y\\.claude')
  if (!configDir.ok) throw new Error('テストの前提が壊れている')
  return {
    key: enumerationTargetKey({ kind: 'windows' }, 0),
    location: { kind: 'windows' },
    configDir: configDir.path,
    origin: 'default',
    label: 'y'
  }
}

function wslTarget(): EnumerationTarget {
  const configDir = makeRuntimePath(UBUNTU, '/home/y/.claude')
  if (!configDir.ok) throw new Error('テストの前提が壊れている')
  const location = { kind: 'wsl', distroName: 'Ubuntu' } as const
  return {
    key: enumerationTargetKey(location, 0),
    location,
    configDir: configDir.path,
    origin: 'default',
    label: 'y'
  }
}

function ubuntu(): RuntimeDescriptor {
  return {
    id: UBUNTU,
    kind: 'wsl',
    state: 'running',
    isDefault: true,
    capabilities: fixedCapabilities(NOW),
    detectedAt: NOW,
    distroName: 'Ubuntu',
    wslVersion: 2,
    pathMapping: null
  }
}

function record(sessionId: string, cwd: string | null = 'C:\\work\\project'): RawSessionRecord {
  return {
    sessionId,
    summary: `要約 ${sessionId}`,
    firstPrompt: null,
    customTitle: null,
    lastModified: NOW,
    createdAt: NOW,
    fileSize: 100,
    gitBranch: null,
    tag: null,
    cwd,
    programmatic: false
  }
}

function discovery(
  targets: readonly EnumerationTarget[],
  issues: TargetDiscovery['issues'] = []
): TargetDiscovery {
  return { targets, issues, noHistory: targets.length === 0 && issues.length === 0 }
}

/** 対象ごとの応答表を持つ代役。**要求を記録する。** */
interface FakeEnumerator extends SessionEnumerator {
  readonly requests: EnumerationRequest[]
}

function fakeEnumerator(responses: Readonly<Record<string, EnumerationResult>>): FakeEnumerator {
  const requests: EnumerationRequest[] = []
  return {
    requests,
    async enumerate(request) {
      requests.push(request)
      return responses[request.target.key] ?? { ok: false, reasonKey: 'enumeration-failed' }
    }
  }
}

function fakeFinder(
  host: TargetDiscovery,
  wsl: TargetDiscovery = discovery([])
): EnumerationTargetFinder {
  return {
    async hostTarget() {
      return host
    },
    async wslTargets() {
      return wsl
    }
  }
}

function deps(
  overrides: Partial<SessionServiceDeps> & Pick<SessionServiceDeps, 'finder' | 'enumerator'>
): SessionServiceDeps {
  return {
    runtimes: () => [],
    folders: () => [],
    verifyRunning: async () => new Map<WslNamespaceId, VerifiedRunning>(),
    hostHome,
    now: () => NOW,
    measure,
    ...overrides
  }
}

describe('createSessionService — list / refresh', () => {
  it('先頭ページ取得では complete を立てない (FR-037)', async () => {
    const target = hostTarget()
    const service = createSessionService(
      deps({
        finder: fakeFinder(discovery([target])),
        enumerator: fakeEnumerator({
          [target.key]: { ok: true, sessions: [record('a')], truncated: false }
        })
      })
    )

    const index = await service.list()

    expect(index.complete).toBe(false)
    expect(index.fetchedAt).toBe(NOW)
  })

  it('先頭ページの要求に件数の上限が載る (R-06)', async () => {
    const target = hostTarget()
    const enumerator = fakeEnumerator({
      [target.key]: { ok: true, sessions: [], truncated: false }
    })
    const service = createSessionService(
      deps({ finder: fakeFinder(discovery([target])), enumerator })
    )

    await service.list()

    expect(enumerator.requests[0].scope).toEqual({
      kind: 'page',
      limit: SESSION_PAGE_SIZE,
      offset: 0
    })
  })

  it('2 度目の `list()` は列挙しない (キャッシュはプロセスの寿命。R-10)', async () => {
    const target = hostTarget()
    const enumerator = fakeEnumerator({
      [target.key]: { ok: true, sessions: [record('a')], truncated: false }
    })
    const service = createSessionService(
      deps({ finder: fakeFinder(discovery([target])), enumerator })
    )

    await service.list()
    await service.list()

    expect(enumerator.requests).toHaveLength(1)
  })

  it('`refresh()` で全件取得へ移り complete が立つ', async () => {
    const target = hostTarget()
    const enumerator = fakeEnumerator({
      [target.key]: { ok: true, sessions: [record('a')], truncated: false }
    })
    const service = createSessionService(
      deps({ finder: fakeFinder(discovery([target])), enumerator })
    )

    await service.list()
    const index = await service.refresh()

    expect(index.complete).toBe(true)
    expect(enumerator.requests[1].scope).toEqual({ kind: 'all' })
  })

  it('再取得は置き換えであり、消えたセッションは消える (SC-012 / FR-035)', async () => {
    const target = hostTarget()
    let sessions = [record('a'), record('b')]
    const enumerator: SessionEnumerator = {
      async enumerate() {
        return { ok: true, sessions, truncated: false }
      }
    }
    const service = createSessionService(
      deps({ finder: fakeFinder(discovery([target])), enumerator })
    )

    await service.list()
    sessions = [record('a')]
    const index = await service.refresh()

    const ids = index.groups.flatMap((group) => group.sessions.map((s) => s.sessionId))
    expect(ids).toEqual(['a'])
  })

  it('打ち切りを黙って隠さない (FR-038)', async () => {
    const target = hostTarget()
    const service = createSessionService(
      deps({
        finder: fakeFinder(discovery([target])),
        enumerator: fakeEnumerator({
          [target.key]: { ok: true, sessions: [record('a')], truncated: true }
        })
      })
    )

    const index = await service.list()

    expect(index.outcomes[0].truncated).toBe(true)
  })
})

describe('createSessionService — 失敗の封じ込め', () => {
  it('1 所在の失敗が他の所在の結果を消さない (SC-007 / FR-030)', async () => {
    const host = hostTarget()
    const wsl = wslTarget()
    const service = createSessionService(
      deps({
        finder: fakeFinder(discovery([host]), discovery([wsl])),
        enumerator: fakeEnumerator({
          [host.key]: { ok: true, sessions: [record('a')], truncated: false },
          [wsl.key]: { ok: false, reasonKey: 'permission-denied' }
        }),
        runtimes: () => [ubuntu()],
        verifyRunning: async () => new Map([[UBUNTU, createVerifiedRunning(UBUNTU, NOW)]])
      })
    )

    const index = await service.list()

    const ids = index.groups.flatMap((group) => group.sessions.map((s) => s.sessionId))
    expect(ids).toEqual(['a'])
    expect(index.outcomes.map((o) => o.status)).toEqual(['ok', 'failed'])
    expect(index.outcomes[1].reasonKey).toBe('permission-denied')
  })

  it('停止中の所在は探索も列挙も発行せず、行だけを残す (FR-007 / SC-002)', async () => {
    const host = hostTarget()
    const enumerator = fakeEnumerator({
      [host.key]: { ok: true, sessions: [], truncated: false }
    })
    const service = createSessionService(
      deps({
        finder: fakeFinder(discovery([host])),
        enumerator,
        runtimes: () => [ubuntu()],
        // 実行中確認の結果が空 = 停止中。
        verifyRunning: async () => new Map<WslNamespaceId, VerifiedRunning>()
      })
    )

    const index = await service.list()

    const wslRow = index.outcomes.find((o) => o.location.kind === 'wsl')
    expect(wslRow).toMatchObject({ status: 'failed', reasonKey: 'distro-not-running' })
    // 列挙対象は windows の 1 件だけ。
    expect(enumerator.requests).toHaveLength(1)
  })

  it('`.claude` が無い所在を失敗にせず「履歴なし」にする (FR-012)', async () => {
    const service = createSessionService(
      deps({ finder: fakeFinder(discovery([])), enumerator: fakeEnumerator({}) })
    )

    const index = await service.list()

    expect(index.outcomes[0]).toMatchObject({ status: 'no-history', reasonKey: null })
  })

  it('候補ごとの失敗を所在の行として残す (FR-011 / FR-030)', async () => {
    const host = hostTarget()
    const service = createSessionService(
      deps({
        finder: fakeFinder(
          discovery([host]),
          discovery([], [{ label: 'root', reasonKey: 'permission-denied' }])
        ),
        enumerator: fakeEnumerator({
          [host.key]: { ok: true, sessions: [], truncated: false }
        }),
        runtimes: () => [ubuntu()],
        verifyRunning: async () => new Map([[UBUNTU, createVerifiedRunning(UBUNTU, NOW)]])
      })
    )

    const index = await service.list()

    const rootRow = index.outcomes.find((o) => o.targetLabel === 'root')
    expect(rootRow).toMatchObject({ status: 'failed', reasonKey: 'permission-denied' })
  })
})

describe('createSessionService — 再対応づけ', () => {
  it('`onFoldersChanged` は再列挙せず対応づけだけをやり直す', async () => {
    const target = hostTarget()
    const enumerator = fakeEnumerator({
      [target.key]: { ok: true, sessions: [record('a')], truncated: false }
    })
    const service = createSessionService(
      deps({ finder: fakeFinder(discovery([target])), enumerator })
    )

    await service.list()
    const index = service.onFoldersChanged()

    expect(enumerator.requests).toHaveLength(1)
    expect(index.groups.flatMap((g) => g.sessions).map((s) => s.sessionId)).toEqual(['a'])
  })

  it('`onRuntimesChanged` も再列挙しない', async () => {
    const target = hostTarget()
    const enumerator = fakeEnumerator({
      [target.key]: { ok: true, sessions: [record('a')], truncated: false }
    })
    const service = createSessionService(
      deps({ finder: fakeFinder(discovery([target])), enumerator })
    )

    await service.list()
    service.onRuntimesChanged()

    expect(enumerator.requests).toHaveLength(1)
  })

  it('総数が保たれる (SC-006)', async () => {
    const target = hostTarget()
    const service = createSessionService(
      deps({
        finder: fakeFinder(discovery([target])),
        enumerator: fakeEnumerator({
          [target.key]: {
            ok: true,
            sessions: [record('a'), record('b', null), record('c', 'relative/path')],
            truncated: false
          }
        })
      })
    )

    const index = await service.list()

    expect(index.groups.reduce((total, g) => total + g.sessions.length, 0)).toBe(3)
  })

  it('購読者に通知する', async () => {
    const target = hostTarget()
    const seen: number[] = []
    const service = createSessionService(
      deps({
        finder: fakeFinder(discovery([target])),
        enumerator: fakeEnumerator({
          [target.key]: { ok: true, sessions: [], truncated: false }
        })
      })
    )
    const off = service.onChanged((index) => seen.push(index.fetchedAt))

    await service.list()
    off()
    await service.refresh()

    expect(seen).toEqual([NOW])
  })
})

describe('createSessionService — fetchMore', () => {
  it('未知の `targetKey` はキャッシュをそのまま返す', async () => {
    const target = hostTarget()
    const enumerator = fakeEnumerator({
      [target.key]: { ok: true, sessions: [record('a')], truncated: false }
    })
    const service = createSessionService(
      deps({ finder: fakeFinder(discovery([target])), enumerator })
    )

    await service.list()
    const index = await service.fetchMore('wsl:Nope#0', 50)

    expect(enumerator.requests).toHaveLength(1)
    expect(index.groups.flatMap((g) => g.sessions).map((s) => s.sessionId)).toEqual(['a'])
  })

  it('続きの取得は既存に足す (FR-038)', async () => {
    const target = hostTarget()
    let page: readonly RawSessionRecord[] = [record('a')]
    const enumerator: SessionEnumerator = {
      async enumerate() {
        return { ok: true, sessions: page, truncated: false }
      }
    }
    const service = createSessionService(
      deps({ finder: fakeFinder(discovery([target])), enumerator })
    )

    await service.list()
    page = [record('b')]
    const index = await service.fetchMore(target.key, SESSION_PAGE_SIZE)

    const ids = index.groups.flatMap((g) => g.sessions).map((s) => s.sessionId)
    expect(ids.sort()).toEqual(['a', 'b'])
  })

  it('同じ識別子が 2 度来ても重複しない', async () => {
    const target = hostTarget()
    const enumerator: SessionEnumerator = {
      async enumerate() {
        return { ok: true, sessions: [record('a')], truncated: false }
      }
    }
    const service = createSessionService(
      deps({ finder: fakeFinder(discovery([target])), enumerator })
    )

    await service.list()
    const index = await service.fetchMore(target.key, SESSION_PAGE_SIZE)

    expect(index.groups.flatMap((g) => g.sessions).map((s) => s.sessionId)).toEqual(['a'])
  })

  it('停止中の所在の `targetKey` でも行は引けるが列挙は拒否される (SC-002 / SC-010)', async () => {
    const host = hostTarget()
    const service = createSessionService(
      deps({
        finder: fakeFinder(discovery([host])),
        enumerator: fakeEnumerator({
          [host.key]: { ok: true, sessions: [], truncated: false }
        }),
        runtimes: () => [ubuntu()],
        verifyRunning: async () => new Map<WslNamespaceId, VerifiedRunning>()
      })
    )

    const index = await service.list()
    const wslRow = index.outcomes.find((o) => o.location.kind === 'wsl')
    expect(wslRow).toBeDefined()

    // 対象を作れていないので `targets` に無く、キャッシュがそのまま返る。
    const after = await service.fetchMore(wslRow?.targetKey ?? '', 0)
    expect(after.outcomes).toEqual(index.outcomes)
  })
})

describe('createSessionService — 境界に出す値', () => {
  it('config ディレクトリの実体パスを行に載せない (FR-042)', async () => {
    const target = wslTarget()
    const service = createSessionService(
      deps({
        finder: fakeFinder(discovery([]), discovery([target])),
        enumerator: fakeEnumerator({
          [target.key]: { ok: true, sessions: [], truncated: false }
        }),
        runtimes: () => [ubuntu()],
        verifyRunning: async () => new Map([[UBUNTU, createVerifiedRunning(UBUNTU, NOW)]])
      })
    )

    const index = await service.list()

    const serialized = JSON.stringify(index.outcomes)
    expect(serialized).not.toContain('.claude')
    expect(serialized).not.toContain('wsl.localhost')
  })

  it('作業ディレクトリの出自を値の形から判定する (FR-016 〜 FR-018)', async () => {
    const target = wslTarget()
    const service = createSessionService(
      deps({
        finder: fakeFinder(discovery([]), discovery([target])),
        enumerator: fakeEnumerator({
          [target.key]: {
            ok: true,
            // 由来は wsl だが、値はホスト形式。**由来から名前空間を推定しない。**
            sessions: [record('a', 'C:\\work\\project')],
            truncated: false
          }
        }),
        runtimes: () => [ubuntu()],
        verifyRunning: async () => new Map([[UBUNTU, createVerifiedRunning(UBUNTU, NOW)]])
      })
    )

    const index = await service.list()

    const session = index.groups.flatMap((g) => g.sessions)[0]
    expect(session.originKind).toBe('host')
    expect(session.cwd).toEqual({ namespace: 'host', value: 'C:\\work\\project' })
  })
})
