import { describe, expect, it } from 'vitest'

import { fixedCapabilities } from '@domain/runtime/capabilities'
import type { WslRuntimeDescriptor } from '@domain/runtime/descriptor'
import type { ListDirErrorReason, ListDirResult, WslFileSystem } from '@domain/runtime/interfaces'
import { wslNamespace, type WslNamespaceId } from '@domain/runtime/namespace'
import { runtimePathOps } from '@domain/runtime/path-api'
import { makeHostPath, type HostPath } from '@domain/runtime/path-types'
import { createVerifiedRunning, type VerifiedRunning } from '@domain/runtime/verified-running'

import type { HostFileSystem } from '../fs/host-fs'
import { DISCOVERY_ISSUE_ORDINAL } from '@domain/session/interfaces'

import { createEnumerationTargetFinder } from './target-finder'

/**
 * BE-022 — 列挙対象の探索 (FR-008 / FR-011 / FR-012 / FR-030 / SC-007)。
 *
 * **実ファイルシステムに触らない。** `WslFileSystem` / `HostFileSystem` を
 * パスごとの応答表で差し替える。
 */

const NOW = 1_700_000_000_000
const UBUNTU: WslNamespaceId = wslNamespace('Ubuntu')
const DEBIAN: WslNamespaceId = wslNamespace('Debian')

function descriptor(id: WslNamespaceId, distroName: string): WslRuntimeDescriptor {
  return {
    id,
    kind: 'wsl',
    state: 'running',
    isDefault: true,
    capabilities: fixedCapabilities(NOW),
    detectedAt: NOW,
    distroName,
    wslVersion: 2,
    pathMapping: null
  }
}

function verified(namespace: WslNamespaceId, at: number = NOW): VerifiedRunning {
  return createVerifiedRunning(namespace, at)
}

/** ディレクトリごとの応答表。**未登録のパスは `not-found`** とする。 */
type Responses = Readonly<Record<string, readonly string[] | ListDirErrorReason>>

function fakeWslFs(responses: Responses): WslFileSystem {
  return {
    async listDirectory(target): Promise<ListDirResult> {
      const response = responses[target.value]
      if (response === undefined) return { ok: false, reason: 'not-found' }
      if (typeof response === 'string') return { ok: false, reason: response }

      const entries = response.map((name) => {
        const child = runtimePathOps.join(target, name)
        if (!child.ok) throw new Error(`テストの前提が壊れている: ${name}`)
        return { name, isDirectory: true, path: child.path }
      })
      return { ok: true, cwd: target, parent: runtimePathOps.parent(target), entries }
    },

    async exists(target): Promise<boolean> {
      return responses[target.value] !== undefined
    }
  }
}

function fakeHostFs(present: readonly string[]): HostFileSystem {
  return {
    async exists(path): Promise<boolean> {
      return present.includes(path.value)
    }
  }
}

function hostPath(value: string): HostPath {
  const result = makeHostPath(value)
  if (!result.ok) throw new Error(`テストの前提が壊れている: ${value}`)
  return result.path
}

describe('createEnumerationTargetFinder — hostTarget', () => {
  it('`.claude` があれば所在 windows の対象を 1 件返す', async () => {
    const finder = createEnumerationTargetFinder({
      hostFs: fakeHostFs(['C:\\Users\\y\\.claude']),
      wslFs: fakeWslFs({})
    })

    const result = await finder.hostTarget(hostPath('C:\\Users\\y'))

    expect(result.targets).toHaveLength(1)
    expect(result.targets[0].location).toEqual({ kind: 'windows' })
    expect(result.targets[0].configDir.value).toBe('C:\\Users\\y\\.claude')
    expect(result.noHistory).toBe(false)
  })

  it('表示用の名前にホームの basename を使う (FR-052)', async () => {
    const finder = createEnumerationTargetFinder({
      hostFs: fakeHostFs(['C:\\Users\\yuki\\.claude']),
      wslFs: fakeWslFs({})
    })

    const result = await finder.hostTarget(hostPath('C:\\Users\\yuki'))

    expect(result.targets[0].label).toBe('yuki')
  })

  it('`.claude` が無ければ対象を作らず「履歴なし」とする (M-001 / FR-012)', async () => {
    const finder = createEnumerationTargetFinder({
      hostFs: fakeHostFs([]),
      wslFs: fakeWslFs({})
    })

    const result = await finder.hostTarget(hostPath('C:\\Users\\y'))

    expect(result.targets).toHaveLength(0)
    expect(result.issues).toHaveLength(0)
    expect(result.noHistory).toBe(true)
  })

  it('`key` に config ディレクトリの値を含めない (data-model §1)', async () => {
    const finder = createEnumerationTargetFinder({
      hostFs: fakeHostFs(['C:\\Users\\y\\.claude']),
      wslFs: fakeWslFs({})
    })

    const result = await finder.hostTarget(hostPath('C:\\Users\\y'))

    expect(result.targets[0].key).not.toContain('Users')
    expect(result.targets[0].key).not.toContain('.claude')
  })
})

describe('createEnumerationTargetFinder — wslTargets', () => {
  const ubuntu = descriptor(UBUNTU, 'Ubuntu')

  it('`.claude` を持つ候補すべてを対象にする (FR-011)', async () => {
    const finder = createEnumerationTargetFinder({
      hostFs: fakeHostFs([]),
      wslFs: fakeWslFs({
        '/home': ['alice', 'bob', 'carol'],
        '/home/alice/.claude': [],
        '/home/carol/.claude': []
      })
    })

    const result = await finder.wslTargets(ubuntu, verified(UBUNTU), NOW)

    expect(result.targets.map((t) => t.label)).toEqual(['alice', 'carol'])
    expect(result.targets.every((t) => t.location.kind === 'wsl')).toBe(true)
  })

  /*
   * 由来候補の表示名は未信頼入力である (pr-gate Round 2 / H2-002 / FR-049 / FR-052)。
   *
   * 値の出どころはディストロ内の `/home` を UNC 経由で読んだディレクトリ名であり、
   * **アプリ外が作った名前**である。`makeRuntimePath` の `hasForbiddenCharacter` は
   * C0 / C1 / DEL しか落とさず、**双方向制御文字を通す**。
   * FR-052 によりこの値は一覧の全行に出るので、偽装の的としては `cwdDisplay` と同格である。   *
   * **長さは見ていない。** パス API が 1 セグメントの上限を既に縛っており
   * (`runtimePathOps.join` が長すぎる名前を拒む)、この入口から長い `label` は作れない。
   * 到達しない状態のテストは書かない。
   */
  it('候補の表示名から双方向制御文字を落とす (FR-049 / FR-052)', async () => {
    const RLO = String.fromCharCode(0x202e)
    const name = 'al' + RLO + 'ice'
    const finder = createEnumerationTargetFinder({
      hostFs: fakeHostFs([]),
      wslFs: fakeWslFs({ '/home': [name], ['/home/' + name + '/.claude']: [] })
    })

    const result = await finder.wslTargets(ubuntu, verified(UBUNTU), NOW)

    expect(result.targets).toHaveLength(1)
    expect(result.targets[0].label).toBe('alice')
    /*
     * **境界を渡る 2 項目で見る。** `configDir` は実在するパスそのものなので
     * 制御文字を含んでよい — `dto-mapper` が意図的に捨てており境界を渡らない。
     */
    expect(result.targets[0].key).not.toContain(RLO)
    expect(JSON.stringify(result.issues)).not.toContain(RLO)
  })

  it('`.claude` が 1 件も無い場合は失敗ではなく「履歴なし」とする (FR-012)', async () => {
    const finder = createEnumerationTargetFinder({
      hostFs: fakeHostFs([]),
      wslFs: fakeWslFs({ '/home': ['alice'] })
    })

    const result = await finder.wslTargets(ubuntu, verified(UBUNTU), NOW)

    expect(result.targets).toHaveLength(0)
    expect(result.issues).toHaveLength(0)
    expect(result.noHistory).toBe(true)
  })

  it('候補 0 件 (`/home` が空) でも失敗にしない', async () => {
    const finder = createEnumerationTargetFinder({
      hostFs: fakeHostFs([]),
      wslFs: fakeWslFs({ '/home': [] })
    })

    const result = await finder.wslTargets(ubuntu, verified(UBUNTU), NOW)

    expect(result.targets).toHaveLength(0)
    expect(result.noHistory).toBe(true)
  })

  it('候補ごとの権限拒否を記録し、他の候補を消さない (FR-030 / SC-007)', async () => {
    const finder = createEnumerationTargetFinder({
      hostFs: fakeHostFs([]),
      wslFs: fakeWslFs({
        '/home': ['alice', 'bob'],
        '/home/alice/.claude': [],
        '/home/bob/.claude': 'permission-denied'
      })
    })

    const result = await finder.wslTargets(ubuntu, verified(UBUNTU), NOW)

    expect(result.targets.map((t) => t.label)).toEqual(['alice'])
    /* **候補由来の失敗は候補一覧の位置を持つ** (security H-003)。bob は alice の次。 */
    expect(result.issues).toEqual([{ label: 'bob', reasonKey: 'permission-denied', ordinal: 1 }])
    expect(result.noHistory).toBe(false)
  })

  it('`/home` 自体が読めなくても `/root` の探索を続ける (FR-030)', async () => {
    const finder = createEnumerationTargetFinder({
      hostFs: fakeHostFs([]),
      wslFs: fakeWslFs({
        '/home': 'permission-denied',
        '/root/.claude': []
      })
    })

    const result = await finder.wslTargets(ubuntu, verified(UBUNTU), NOW)

    expect(result.targets.map((t) => t.label)).toEqual(['root'])
    /* `/home` 自体が読めない失敗は候補を特定できていない → 予約した序数。 */
    expect(result.issues).toEqual([
      { label: 'home', reasonKey: 'permission-denied', ordinal: DISCOVERY_ISSUE_ORDINAL }
    ])
  })

  it('`/root` を候補に含める (FR-011)', async () => {
    const finder = createEnumerationTargetFinder({
      hostFs: fakeHostFs([]),
      wslFs: fakeWslFs({ '/home': [], '/root/.claude': [] })
    })

    const result = await finder.wslTargets(ubuntu, verified(UBUNTU), NOW)

    expect(result.targets.map((t) => t.configDir.value)).toEqual(['/root/.claude'])
  })

  it('`/root` の Access denied を候補の失敗として記録する (research R-03)', async () => {
    const finder = createEnumerationTargetFinder({
      hostFs: fakeHostFs([]),
      wslFs: fakeWslFs({ '/home': [], '/root/.claude': 'permission-denied' })
    })

    const result = await finder.wslTargets(ubuntu, verified(UBUNTU), NOW)

    expect(result.issues).toEqual([{ label: 'root', reasonKey: 'permission-denied', ordinal: 0 }])
  })

  it('項目数の上限超過は「在る」として対象にする', async () => {
    const finder = createEnumerationTargetFinder({
      hostFs: fakeHostFs([]),
      wslFs: fakeWslFs({ '/home': ['alice'], '/home/alice/.claude': 'too-many-entries' })
    })

    const result = await finder.wslTargets(ubuntu, verified(UBUNTU), NOW)

    expect(result.targets.map((t) => t.label)).toEqual(['alice'])
    expect(result.issues).toHaveLength(0)
  })

  it('UNC に届かない場合を停止中として記録する', async () => {
    const finder = createEnumerationTargetFinder({
      hostFs: fakeHostFs([]),
      wslFs: fakeWslFs({ '/home': 'distro-unreachable' })
    })

    const result = await finder.wslTargets(ubuntu, verified(UBUNTU), NOW)

    expect(result.issues).toEqual([
      { label: 'home', reasonKey: 'distro-not-running', ordinal: DISCOVERY_ISSUE_ORDINAL }
    ])
  })

  it('別ディストロの確認済みの値を流用できない (FR-008)', async () => {
    const finder = createEnumerationTargetFinder({
      hostFs: fakeHostFs([]),
      wslFs: fakeWslFs({ '/home': ['alice'], '/home/alice/.claude': [] })
    })

    const result = await finder.wslTargets(ubuntu, verified(DEBIAN), NOW)

    expect(result.targets).toHaveLength(0)
    expect(result.issues).toEqual([
      { label: 'Ubuntu', reasonKey: 'distro-not-running', ordinal: DISCOVERY_ISSUE_ORDINAL }
    ])
  })

  it('期限切れの確認済みの値では探索を発行しない (FR-008 / SC-002)', async () => {
    let calls = 0
    const base = fakeWslFs({ '/home': ['alice'], '/home/alice/.claude': [] })
    const counting: WslFileSystem = {
      async listDirectory(target, v, now) {
        calls += 1
        return base.listDirectory(target, v, now)
      },
      exists: base.exists
    }
    const finder = createEnumerationTargetFinder({ hostFs: fakeHostFs([]), wslFs: counting })

    const result = await finder.wslTargets(ubuntu, verified(UBUNTU, NOW - 60_000), NOW)

    expect(calls).toBe(0)
    expect(result.issues).toEqual([
      { label: 'Ubuntu', reasonKey: 'distro-not-running', ordinal: DISCOVERY_ISSUE_ORDINAL }
    ])
  })

  it('`key` は候補一覧の位置で決まり、対象の増減で前の対象がずれない', async () => {
    const withBob = createEnumerationTargetFinder({
      hostFs: fakeHostFs([]),
      wslFs: fakeWslFs({
        '/home': ['alice', 'bob'],
        '/home/alice/.claude': [],
        '/home/bob/.claude': [],
        '/root/.claude': []
      })
    })
    const withoutBob = createEnumerationTargetFinder({
      hostFs: fakeHostFs([]),
      wslFs: fakeWslFs({
        '/home': ['alice', 'bob'],
        '/home/alice/.claude': [],
        '/home/bob/.claude': 'permission-denied',
        '/root/.claude': []
      })
    })

    const before = await withBob.wslTargets(ubuntu, verified(UBUNTU), NOW)
    const after = await withoutBob.wslTargets(ubuntu, verified(UBUNTU), NOW)

    const keyOf = (
      r: { targets: readonly { label: string; key: string }[] },
      label: string
    ): string | undefined => r.targets.find((t) => t.label === label)?.key

    expect(keyOf(before, 'root')).toBe(keyOf(after, 'root'))
  })

  it('候補の順序を名前で固定する (`readdir` の順に依存しない)', async () => {
    const shuffled = createEnumerationTargetFinder({
      hostFs: fakeHostFs([]),
      wslFs: fakeWslFs({
        '/home': ['carol', 'alice', 'bob'],
        '/home/alice/.claude': [],
        '/home/bob/.claude': [],
        '/home/carol/.claude': []
      })
    })

    const result = await shuffled.wslTargets(ubuntu, verified(UBUNTU), NOW)

    expect(result.targets.map((t) => t.label)).toEqual(['alice', 'bob', 'carol'])
  })

  it('config ディレクトリの名前空間が所在と一致する (data-model §1 の不変条件)', async () => {
    const finder = createEnumerationTargetFinder({
      hostFs: fakeHostFs([]),
      wslFs: fakeWslFs({ '/home': ['alice'], '/home/alice/.claude': [] })
    })

    const result = await finder.wslTargets(ubuntu, verified(UBUNTU), NOW)

    expect(result.targets[0].configDir.namespace).toBe(UBUNTU)
    expect(result.targets[0].configDir.value).toBe('/home/alice/.claude')
  })

  it('`key` に UNC 形式もホームのパスも含めない (FR-042)', async () => {
    const finder = createEnumerationTargetFinder({
      hostFs: fakeHostFs([]),
      wslFs: fakeWslFs({ '/home': ['alice'], '/home/alice/.claude': [] })
    })

    const result = await finder.wslTargets(ubuntu, verified(UBUNTU), NOW)

    expect(result.targets[0].key).not.toContain('alice')
    expect(result.targets[0].key).not.toContain('\\\\')
  })
})
