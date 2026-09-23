import { describe, expect, it } from 'vitest'

import { fixedCapabilities } from '@domain/runtime/capabilities'
import type { RuntimeDescriptor } from '@domain/runtime/descriptor'
import { wslNamespace, type WslNamespaceId } from '@domain/runtime/namespace'
import { makeHostPath, makeRuntimePath, type HostPath } from '@domain/runtime/path-types'
import {
  BROWSE_SESSION_TTL_MS,
  createVerifiedRunning,
  type VerifiedRunning
} from '@domain/runtime/verified-running'
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

/** 序数を指定した WSL の列挙対象。**衝突の検証に序数を明示する必要がある。** */
function wslTargetAt(ordinal: number, posixPath: string): EnumerationTarget {
  const configDir = makeRuntimePath(UBUNTU, posixPath)
  if (!configDir.ok) throw new Error('テストの前提が壊れている')
  const location = { kind: 'wsl', distroName: 'Ubuntu' } as const
  return {
    key: enumerationTargetKey(location, ordinal),
    location,
    configDir: configDir.path,
    origin: 'default',
    label: posixPath
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

/**
 * 先頭ページの要求だけを数える。
 *
 * **全体の件数を数えない。** `list()` は先頭ページを返したあと同じ操作の続きとして
 * 全件を取る (BE-070) ため、全体の件数はマイクロタスクの進み方で変わる。
 * 「先頭ページだけを取ったか」を見たいなら scope で絞るのが正しい。
 */
function pageRequests(enumerator: FakeEnumerator): EnumerationRequest[] {
  return enumerator.requests.filter((request) => request.scope.kind === 'page')
}

/**
 * 背景で走る全件取得を待つ。
 *
 * **実時間を待たない。** `list()` は全件を待たずに返るため、
 * マイクロタスクを流して背景の 1 本が終わるのを待つだけで足りる
 * (列挙器の代役は同期的に応答する)。
 */
async function settle(): Promise<void> {
  for (let i = 0; i < 20; i += 1) await Promise.resolve()
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

  it('先頭ページを返したあと全件を取りに行く (BE-070 / FR-031 / R-06)', async () => {
    const target = hostTarget()
    const enumerator = fakeEnumerator({
      [target.key]: { ok: true, sessions: [record('a')], truncated: false }
    })
    const service = createSessionService(
      deps({ finder: fakeFinder(discovery([target])), enumerator })
    )

    const first = await service.list()

    // **先頭ページは全件を待たずに返る。**
    expect(first.complete).toBe(false)
    expect(enumerator.requests[0].scope).toEqual({
      kind: 'page',
      limit: SESSION_PAGE_SIZE,
      offset: 0
    })

    await settle()

    // 続けて全件が走り、通知で `complete` が立つ。
    expect(enumerator.requests).toHaveLength(2)
    expect(enumerator.requests[1].scope).toEqual({ kind: 'all' })
  })

  it('完了前に重なった `list()` を束ねる (開発ビルドの二重 effect)', async () => {
    const target = hostTarget()
    const enumerator = fakeEnumerator({
      [target.key]: { ok: true, sessions: [record('a')], truncated: false }
    })
    const service = createSessionService(
      deps({ finder: fakeFinder(discovery([target])), enumerator })
    )

    /*
     * `loaded` は取得の**完了後**に立つので、完了前の 2 本目はキャッシュに当たらない。
     * 実測で先頭ページの取得が 2 回起きた (7,743 ms と 7,390 ms が並んだ)。
     */
    const [a, b] = await Promise.all([service.list(), service.list()])
    await settle()

    expect(pageRequests(enumerator)).toHaveLength(1)
    expect(a).toEqual(b)
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
    await settle()
    const before = enumerator.requests.length

    await service.list()
    await settle()

    expect(enumerator.requests).toHaveLength(before)
  })

  it('全件の完了を購読者へ通知する (BE-070)', async () => {
    const target = hostTarget()
    const seen: boolean[] = []
    const service = createSessionService(
      deps({
        finder: fakeFinder(discovery([target])),
        enumerator: fakeEnumerator({
          [target.key]: { ok: true, sessions: [record('a')], truncated: false }
        })
      })
    )
    service.onChanged((value) => seen.push(value.complete))

    await service.list()
    await settle()

    /*
     * **回数で縛らない。** 先頭ページは**所在ごとに段階的に**通知するため、
     * 通知の本数は所在の数で変わる (2026-09-18 の人間判断)。
     * 見たいのは「最後が全件である」ことと「その前に未完了が届く」ことである。
     */
    expect(seen.at(-1)).toBe(true)
    expect(seen.slice(0, -1).every((value) => value === false)).toBe(true)
    expect(seen.length).toBeGreaterThanOrEqual(2)
  })

  it('所在 `windows` は実行中確認を待たずに描く (SC-008)', async () => {
    const host = hostTarget()
    const wsl = wslTarget()
    let releaseVerify = (): void => {}
    const verifyGate = new Promise<void>((resolve) => {
      releaseVerify = resolve
    })
    const rowCounts: number[] = []

    const service = createSessionService(
      deps({
        runtimes: () => [ubuntu()],
        verifyRunning: async () => {
          await verifyGate
          return new Map([[UBUNTU, createVerifiedRunning(UBUNTU, NOW)]])
        },
        finder: fakeFinder(discovery([host]), discovery([wsl])),
        enumerator: fakeEnumerator({
          [host.key]: { ok: true, sessions: [record('a')], truncated: false },
          [wsl.key]: { ok: true, sessions: [record('b')], truncated: false }
        })
      })
    )
    service.onChanged((index) => rowCounts.push(index.outcomes.length))

    const listing = service.list()
    await settle()

    /*
     * **確認が返る前にホストの行が届いている。**
     * `wsl.exe` の固定費は実測 1,185〜1,373 ms あり、待つと
     * 先頭 50 件の予算 2 秒から丸ごと引かれる (実測で余裕が 21 ms まで詰まった)。
     */
    expect(rowCounts[0]).toBe(1)

    releaseVerify()
    await listing
    await settle()

    expect(rowCounts.at(-1)).toBe(2)
  })

  it('`warmUp()` が実行中確認を先に済ませ、一覧で払い直さない (SC-008)', async () => {
    const host = hostTarget()
    const wsl = wslTarget()
    let calls = 0
    const service = createSessionService(
      deps({
        runtimes: () => [ubuntu()],
        verifyRunning: async () => {
          calls += 1
          return new Map([[UBUNTU, createVerifiedRunning(UBUNTU, NOW)]])
        },
        finder: fakeFinder(discovery([host]), discovery([wsl])),
        enumerator: fakeEnumerator({
          [host.key]: { ok: true, sessions: [record('a')], truncated: false },
          [wsl.key]: { ok: true, sessions: [record('b')], truncated: false }
        })
      })
    )

    service.warmUp()
    await settle()
    expect(calls).toBe(1)

    /*
     * **一覧を開いても払い直さない。** 暖機の値は有効期間内なのでそのまま使う。
     * 払い直すと `wsl.exe` の固定費 (実測 1,185〜1,373 ms) が
     * 先頭 50 件の予算に戻ってくる。
     */
    await service.list()
    await settle()

    expect(calls).toBe(1)
  })

  it('所在ごとに段階的に通知する (SC-008)', async () => {
    const host = hostTarget()
    const wsl = wslTarget()
    const rowCounts: number[] = []
    const service = createSessionService(
      deps({
        runtimes: () => [ubuntu()],
        verifyRunning: async () => new Map([[UBUNTU, createVerifiedRunning(UBUNTU, NOW)]]),
        finder: fakeFinder(discovery([host]), discovery([wsl])),
        enumerator: fakeEnumerator({
          [host.key]: { ok: true, sessions: [record('a')], truncated: false },
          [wsl.key]: { ok: true, sessions: [record('b')], truncated: false }
        })
      })
    )
    service.onChanged((index) => rowCounts.push(index.outcomes.length))

    await service.list()

    /*
     * **2 所在ぶんが揃うのを待たずに 1 所在ぶんが届く。**
     * WSL は 1 所在あたり 1.3〜1.6 秒の UNC I/O を要し、
     * 揃うのを待つと所在が増えるだけで SC-008 の 2 秒予算を超える。
     */
    expect(rowCounts[0]).toBe(1)
    expect(rowCounts.at(-1)).toBe(2)
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

  /*
   * 例外は行に落とす (pr-gate Round 2 / H2-003 / FR-030 / SC-007)。
   *
   * 「失敗は行に落とし、例外にしない」は**コメントだけの約束**で、
   * `enumerateTarget` 〜 `fetchAll` の経路に catch が 1 つも無かった。
   * 列挙器は `{ ok: false }` を返す設計なので普段は例外が出ないが、
   * **未信頼入力が起点の例外は出る** — config ディレクトリの JSONL に
   * 型の違う値が 1 つあれば `normalizeText` が TypeError を投げ、
   * 1 所在どころか**一覧全体**が落ちていた。
   */
  it('列挙中の例外は所在の行に落ちる (FR-030 / SC-007)', async () => {
    const host = hostTarget()
    const wsl = wslTarget()
    const enumerator: SessionEnumerator = {
      async enumerate(request) {
        if (request.target.key === wsl.key) throw new TypeError('raw is not iterable')
        return { ok: true, sessions: [record('a')], truncated: false }
      }
    }
    const service = createSessionService(
      deps({
        finder: fakeFinder(discovery([host]), discovery([wsl])),
        enumerator,
        runtimes: () => [ubuntu()],
        verifyRunning: async () => new Map([[UBUNTU, createVerifiedRunning(UBUNTU, NOW)]])
      })
    )

    const index = await service.list()
    await settle()

    /* **他の所在は消えない。** */
    expect(index.groups.flatMap((g) => g.sessions).map((s) => s.sessionId)).toEqual(['a'])
    const row = index.outcomes.find((o) => o.targetKey === wsl.key)
    expect(row).toMatchObject({ status: 'failed', reasonKey: 'enumeration-failed' })
  })

  it('背景の全件取得が例外で終わっても main に rejection を投げない (H2-003)', async () => {
    const target = hostTarget()
    let calls = 0
    const enumerator: SessionEnumerator = {
      async enumerate() {
        calls += 1
        /* 先頭ページは成功、背景の全件取得で壊れる。 */
        if (calls > 1) throw new TypeError('壊れた応答')
        return { ok: true, sessions: [record('a')], truncated: false }
      }
    }
    const service = createSessionService(
      deps({ finder: fakeFinder(discovery([target])), enumerator })
    )

    const first = await service.list()
    await settle()

    expect(first.groups.flatMap((g) => g.sessions).map((s) => s.sessionId)).toEqual(['a'])
    /* 例外が抜けていれば unhandled rejection になり、vitest がこのテストを落とす。 */
    expect(calls).toBeGreaterThan(1)
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
    // 列挙対象は windows の 1 件だけ。**停止中の所在には 1 件も発行しない。**
    expect(pageRequests(enumerator)).toHaveLength(1)
    expect(enumerator.requests.every((r) => r.target.location.kind === 'windows')).toBe(true)
  })

  it('`.claude` が無い所在を失敗にせず「履歴なし」にする (FR-012)', async () => {
    const service = createSessionService(
      deps({ finder: fakeFinder(discovery([])), enumerator: fakeEnumerator({}) })
    )

    const index = await service.list()

    expect(index.outcomes[0]).toMatchObject({ status: 'no-history', reasonKey: null })
  })

  it('候補の一部が失敗しても行の `targetKey` が重複しない (security H-003 / SC-010)', async () => {
    /*
     * **序数の払い出しが 2 通りあった。**
     * 対象は `target-finder` が候補一覧の位置で作り、失敗行は呼び出し側が
     * `targets.length + index` で作っていた。
     *
     * 候補が alice(0) / bob(1) / root(2) で bob が権限拒否のとき、
     * 対象は `#0`(alice) と `#2`(root)、失敗行は `2 + 0 = #2` で **root と一致した**。
     *
     * `targetKey` は未信頼入力の照合に使う唯一の鍵である (FR-043 / SC-010)。
     * 一意でないと `fetchMoreSessions` が**利用者が指した行とは別の対象**を列挙し、
     * 行の帰属も書き換わる — FR-052 が全ユーザ集約の代償として置いた
     * 「どのユーザの履歴を見ているか」が行単位で崩れる。
     * `/root` が UNC 経由で Access denied になることは実測済である。
     */
    const alice = wslTargetAt(0, '/home/alice/.claude')
    const root = wslTargetAt(2, '/root/.claude')

    const service = createSessionService(
      deps({
        finder: fakeFinder(
          discovery([]),
          /* bob は候補 1 で権限拒否。対象は 0 と 2 だけが残る。 */
          discovery([alice, root], [{ label: 'bob', reasonKey: 'permission-denied', ordinal: 1 }])
        ),
        enumerator: fakeEnumerator({
          [alice.key]: { ok: true, sessions: [], truncated: false },
          [root.key]: { ok: true, sessions: [], truncated: false }
        }),
        runtimes: () => [ubuntu()],
        verifyRunning: async () => new Map([[UBUNTU, createVerifiedRunning(UBUNTU, NOW)]])
      })
    )

    await service.list()

    const keys = service.targetKeys()
    expect(new Set(keys).size).toBe(keys.length)

    /* 失敗行は候補 1 の位置を持つ。root (候補 2) と別物である。 */
    expect(keys).toContain('wsl:Ubuntu#1')
    expect(keys).toContain('wsl:Ubuntu#2')
  })

  it('候補ごとの失敗を所在の行として残す (FR-011 / FR-030)', async () => {
    const host = hostTarget()
    const service = createSessionService(
      deps({
        finder: fakeFinder(
          discovery([host]),
          discovery([], [{ label: 'root', reasonKey: 'permission-denied', ordinal: 2 }])
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
    await settle()
    const before = enumerator.requests.length

    const index = service.onFoldersChanged()
    await settle()

    // **1 件も増えない。** 対応づけだけをやり直す (data-model §7)。
    expect(enumerator.requests).toHaveLength(before)
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
    await settle()
    const before = enumerator.requests.length

    service.onRuntimesChanged()
    await settle()

    expect(enumerator.requests).toHaveLength(before)
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
    const during = seen.length
    off()
    await service.refresh()

    /*
     * **本数で縛らない。** 先頭ページは所在ごとに段階的に通知する。
     * 見たいのは (a) 通知が届くこと、(b) 取得時刻は DTO が運ぶ値であること、
     * (c) **解除したあとは届かないこと**である。
     */
    expect(during).toBeGreaterThan(0)
    expect(seen.every((value) => value === NOW)).toBe(true)
    expect(seen).toHaveLength(during)
  })
})

describe('createSessionService — 実行中確認の持ち回し', () => {
  it('有効期間内は実行状態を取り直さない (SC-008)', async () => {
    const target = hostTarget()
    let calls = 0
    const service = createSessionService(
      deps({
        finder: fakeFinder(discovery([target])),
        enumerator: fakeEnumerator({
          [target.key]: { ok: true, sessions: [record('a')], truncated: false }
        }),
        runtimes: () => [ubuntu()],
        verifyRunning: async () => {
          calls += 1
          return new Map([[UBUNTU, createVerifiedRunning(UBUNTU, NOW)]])
        }
      })
    )

    await service.list()
    await settle()
    await service.refresh()

    /*
     * **`wsl.exe` の固定費は約 1.5 秒** (AD-015)。一覧を開くたびに払うと
     * SC-008 の 2 秒予算を超える。値の側が期限を持つので持ち回してよい。
     */
    expect(calls).toBe(1)
  })

  it('有効期間を過ぎたら取り直す', async () => {
    const target = hostTarget()
    let calls = 0
    let clock = NOW
    const service = createSessionService(
      deps({
        finder: fakeFinder(discovery([target])),
        enumerator: fakeEnumerator({
          [target.key]: { ok: true, sessions: [record('a')], truncated: false }
        }),
        runtimes: () => [ubuntu()],
        now: () => clock,
        verifyRunning: async () => {
          calls += 1
          return new Map([[UBUNTU, createVerifiedRunning(UBUNTU, clock)]])
        }
      })
    )

    await service.list()
    await settle()
    clock = NOW + BROWSE_SESSION_TTL_MS + 1
    await service.refresh()

    expect(calls).toBe(2)
  })
})

/*
 * **見出しに実行ファイル名を書かない。** 検証項目 3 は許可リスト外のモジュールに
 * 現れた文字列リテラルを拾うため、テスト名に書くと**それ自体が違反になる** (実測)。
 * 迂回を防ぐために名前で見る作りなので、こちらが書き方を譲る。
 */
describe('createSessionService — 外部プロセスの呼び出し (SC-003 / SH-082)', () => {
  it('R-2 の経路が起こす外部プロセスは R-1 の実行状態確認だけである', async () => {
    const host = hostTarget()
    const wsl = wslTarget()
    let verifyCalls = 0
    const enumerator = fakeEnumerator({
      [host.key]: { ok: true, sessions: [record('a')], truncated: false },
      [wsl.key]: { ok: true, sessions: [record('b', '/home/y/x')], truncated: false }
    })

    /*
     * **依存を全部差し替えている。** CLI レイヤは注入されていないので、
     * R-2 の経路から `wsl.exe` へ到達する手段が**そもそも無い**。
     * 唯一の外部プロセスは R-1 の `verifyRunning()` であり、その回数を数える
     * (contracts C-7。R-2 は新たに呼ばない)。
     */
    const service = createSessionService(
      deps({
        finder: fakeFinder(discovery([host]), discovery([wsl])),
        enumerator,
        runtimes: () => [ubuntu()],
        verifyRunning: async () => {
          verifyCalls += 1
          return new Map([[UBUNTU, createVerifiedRunning(UBUNTU, NOW)]])
        }
      })
    )

    await service.list()
    await settle()
    await service.fetchMore(host.key, SESSION_PAGE_SIZE)
    await service.fetchMore(wsl.key, SESSION_PAGE_SIZE)

    // **1 回だけ。** 有効期間内は持ち回す (BE-061)。
    expect(verifyCalls).toBe(1)
    // 列挙はすべて差し替えた列挙器を通っている。
    expect(enumerator.requests.length).toBeGreaterThan(0)
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
    await settle()
    const before = enumerator.requests.length

    const index = await service.fetchMore('wsl:Nope#0', 50)

    // **列挙を発行しない。** キャッシュをそのまま返す。
    expect(enumerator.requests).toHaveLength(before)
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

  it('途中まで取れていれば部分結果と理由の双方を返す (BE-062 / US-3 AC-6)', async () => {
    const target = hostTarget()
    let fail = false
    const enumerator: SessionEnumerator = {
      async enumerate() {
        if (fail) return { ok: false, reasonKey: 'distro-not-running' }
        return { ok: true, sessions: [record('a')], truncated: true }
      }
    }
    const service = createSessionService(
      deps({ finder: fakeFinder(discovery([target])), enumerator })
    )

    await service.list()
    await settle()
    fail = true
    const after = await service.fetchMore(target.key, SESSION_PAGE_SIZE)

    // **取得済みの行は残る。**
    expect(after.groups.flatMap((g) => g.sessions).map((session) => session.sessionId)).toEqual([
      'a'
    ])
    // **理由は「途中で止まった」に差し替わる** — 「今読めない」とは示すべきことが違う。
    const row = after.outcomes.find((o) => o.targetKey === target.key)
    expect(row).toMatchObject({ status: 'failed', reasonKey: 'stopped-midway', count: 1 })
  })

  /*
   * 続きの取得と「上限で打ち切りました」の整合 (pr-gate Round 1 / ux H-204 / FR-038)。
   *
   * 列挙器が返す `truncated` は「**1 回の応答**が `MAX_SESSIONS_PER_TARGET` を超えたか」
   * であり、`SESSION_PAGE_SIZE` のページでは決して真にならない。
   * そのまま行へ写すと**続きの取得を 1 度行った時点で「続きを取る」が消える**。
   */
  it('ページが満杯で返れば打ち切りの旗を保つ (FR-038)', async () => {
    const target = hostTarget()
    const full = Array.from({ length: SESSION_PAGE_SIZE }, (_, i) => record(`p${i}`))
    let page: readonly RawSessionRecord[] = [record('a')]
    const enumerator: SessionEnumerator = {
      /* **列挙器はページでは打ち切りを立てない** — 上限は 1 応答あたり 5000 件である。 */
      async enumerate() {
        return { ok: true, sessions: page, truncated: false }
      }
    }
    const service = createSessionService(
      deps({ finder: fakeFinder(discovery([target])), enumerator })
    )

    await service.list()
    await settle()
    page = full
    const after = await service.fetchMore(target.key, SESSION_PAGE_SIZE)

    const row = after.outcomes.find((o) => o.targetKey === target.key)
    // **満杯 = まだ続きがありうる。** 押した直後に手段が消えてはならない。
    expect(row?.truncated).toBe(true)
  })

  it('ページが満たずに返れば打ち切りを解く (FR-038)', async () => {
    const target = hostTarget()
    let page: readonly RawSessionRecord[] = Array.from({ length: SESSION_PAGE_SIZE }, (_, i) =>
      record(`p${i}`)
    )
    const enumerator: SessionEnumerator = {
      async enumerate() {
        return { ok: true, sessions: page, truncated: true }
      }
    }
    const service = createSessionService(
      deps({ finder: fakeFinder(discovery([target])), enumerator })
    )

    await service.list()
    await settle()
    page = [record('tail')]
    const after = await service.fetchMore(target.key, SESSION_PAGE_SIZE)

    const row = after.outcomes.find((o) => o.targetKey === target.key)
    // **末尾に達した。** ここで初めて件数が確定する。
    expect(row?.truncated).toBe(false)
  })

  it('続きの取得が失敗しても打ち切りの旗を落とさない (FR-038 / US-3 AC-6)', async () => {
    const target = hostTarget()
    let fail = false
    const enumerator: SessionEnumerator = {
      async enumerate() {
        if (fail) return { ok: false, reasonKey: 'distro-not-running' }
        return { ok: true, sessions: [record('a')], truncated: true }
      }
    }
    const service = createSessionService(
      deps({ finder: fakeFinder(discovery([target])), enumerator })
    )

    await service.list()
    await settle()
    fail = true
    const after = await service.fetchMore(target.key, SESSION_PAGE_SIZE)

    const row = after.outcomes.find((o) => o.targetKey === target.key)
    // 一時的な失敗から復帰する手段を残す。
    expect(row?.truncated).toBe(true)
  })

  it('1 件も取れていなければ列挙器の理由をそのまま返す', async () => {
    const target = hostTarget()
    let fail = false
    const enumerator: SessionEnumerator = {
      async enumerate() {
        if (fail) return { ok: false, reasonKey: 'permission-denied' }
        return { ok: true, sessions: [], truncated: false }
      }
    }
    const service = createSessionService(
      deps({ finder: fakeFinder(discovery([target])), enumerator })
    )

    await service.list()
    await settle()
    fail = true
    const after = await service.fetchMore(target.key, SESSION_PAGE_SIZE)

    const row = after.outcomes.find((o) => o.targetKey === target.key)
    expect(row).toMatchObject({ status: 'failed', reasonKey: 'permission-denied', count: 0 })
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
