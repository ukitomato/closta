import { describe, expect, it } from 'vitest'

import {
  beginProbing,
  fixedCapabilities,
  probeFailed,
  probedCapabilities
} from '@domain/runtime/capabilities'
import type { RuntimeDescriptor, WslRuntimeDescriptor } from '@domain/runtime/descriptor'
import { wslNamespace, type WslNamespaceId } from '@domain/runtime/namespace'
import { makePathMapping, type PathMapping } from '@domain/runtime/path-mapping'
import { makeHostPath, makeRuntimePath } from '@domain/runtime/path-types'

import { createWin32 } from './__fixtures__/runtime'
import type { WorkspaceFolder } from './folder'
import { fold, stage0, type ExistenceCheck } from './reachability'
import { resolveFolderRuntime, toFolderReachability } from './resolution'

/**
 * 判定 3 段の**全セル**を網羅するテスト (BE-051 / SC-006 / SC-007)。
 *
 * **順序が固定されていることを確かめるのが要点である。**
 * 実行状態を到達可否より先に見ると、起動しても使えない組み合わせに
 * 「起動して再検出せよ」と案内することになる。
 */

const NOW = 1_700_000_000_000
const UBUNTU = wslNamespace('Ubuntu')

function mapping(to: WslNamespaceId): PathMapping {
  const result = makePathMapping('host', to, [{ fromPrefix: 'C:\\', toPrefix: '/mnt/c' }], NOW)
  if (!result.ok) throw new Error('前提')
  return result.mapping
}

function hostFolder(raw = 'C:\\dev\\x'): WorkspaceFolder {
  const path = makeHostPath(raw)
  if (!path.ok) throw new Error('前提')
  return {
    id: 'wf_0123456789ab',
    location: { kind: 'windows' },
    path: path.path,
    displayName: 'x',
    registeredAt: NOW
  }
}

function wslFolder(distro: string, raw: string): WorkspaceFolder {
  const path = makeRuntimePath(wslNamespace(distro), raw)
  if (!path.ok) throw new Error('前提')
  return {
    id: 'wf_0123456789ab',
    location: { kind: 'wsl', distroName: distro },
    path: path.path,
    displayName: 'x',
    registeredAt: NOW
  }
}

function wslRuntime(overrides: Partial<WslRuntimeDescriptor> = {}): WslRuntimeDescriptor {
  return {
    id: UBUNTU,
    kind: 'wsl',
    distroName: 'Ubuntu',
    wslVersion: 2,
    state: 'running',
    isDefault: true,
    capabilities: probedCapabilities({
      sandbox: 'bubblewrap',
      missingDependencies: [],
      probedAt: NOW
    }),
    pathMapping: mapping(UBUNTU),
    detectedAt: NOW,
    ...overrides
  }
}

const WIN32: RuntimeDescriptor = createWin32(NOW)

/* ── 第 1 段: 到達可否 ──────────────────────────────────────────────── */

describe('第 1 段: 到達可否 (実行状態と probe の進行を見ない)', () => {
  it('所在 wsl × Win32Runtime は到達不可 (unc-cwd-unsupported)', () => {
    const result = resolveFolderRuntime({
      folder: wslFolder('Ubuntu', '/home/u/x'),
      runtime: WIN32
    })
    expect(result.reachability).toBe('unreachable')
    expect(result.unreachableReason).toBe('unc-cwd-unsupported')
    expect(result.runtimePath).toBeNull()
  })

  it('所在 wsl:<A> × WslRuntime(<B>) は到達不可 (foreign-distro)', () => {
    const result = resolveFolderRuntime({
      folder: wslFolder('Debian', '/home/u/x'),
      runtime: wslRuntime()
    })
    expect(result.unreachableReason).toBe('foreign-distro')
  })

  it('**停止中でも別ディストロなら「到達不可」で選択肢に出ない** (順序の固定)', () => {
    // 実行状態を先に見ると「起動して再検出せよ」と案内し、起動しても第 1 段で消える。
    const result = resolveFolderRuntime({
      folder: wslFolder('Debian', '/home/u/x'),
      runtime: wslRuntime({ state: 'stopped', pathMapping: null, capabilities: beginProbing() })
    })
    expect(result.reachability).toBe('unreachable')
    expect(result.unreachableReason).toBe('foreign-distro')
    expect(result.blockedReason).toBeNull()
    expect(result.resolutionSteps).toEqual([])
  })

  it('所在 windows は第 1 段を通る (どのランタイムでも)', () => {
    expect(resolveFolderRuntime({ folder: hostFolder(), runtime: WIN32 }).reachability).toBe(
      'reachable'
    )
    expect(resolveFolderRuntime({ folder: hostFolder(), runtime: wslRuntime() }).reachability).toBe(
      'reachable'
    )
  })
})

/* ── 第 2 段: 変換材料の有無 ────────────────────────────────────────── */

describe('第 2 段: 変換材料の有無 (鍵は pathMapping、probeState ではない)', () => {
  it('Win32Runtime は材料を要さず第 3 段へ進む (恒等変換)', () => {
    const result = resolveFolderRuntime({ folder: hostFolder(), runtime: WIN32 })
    expect(result.reachability).toBe('reachable')
    expect(result.boundary).toBe('native')
  })

  it('**到達可能な組み合わせの停止中ランタイムは「一時的に解決不能」で選択肢に残る**', () => {
    const result = resolveFolderRuntime({
      folder: hostFolder(),
      runtime: wslRuntime({ state: 'stopped', pathMapping: null, capabilities: beginProbing() })
    })
    expect(result.reachability).toBe('blocked')
    expect(result.blockedReason).toBe('distro-not-running')
    // **`blocked` は必ず手順を 1 つ以上伴う。**
    expect(result.resolutionSteps).toEqual(['start-distro', 'rescan-runtimes'])
    expect(result.boundary).toBe('unknown')
    expect(result.runtimePath).toBeNull()
  })

  it('**実行中かつ判定未完了は「一時的に解決不能」**', () => {
    for (const capabilities of [
      beginProbing(),
      { ...beginProbing(), probeState: 'idle' as const }
    ]) {
      const result = resolveFolderRuntime({
        folder: hostFolder(),
        runtime: wslRuntime({ pathMapping: null, capabilities })
      })
      expect(result.blockedReason).toBe('capabilities-not-probed')
      expect(result.resolutionSteps).toEqual(['wait-for-probe'])
    }
  })

  it('**実行中かつ判定失敗は「一時的に解決不能」**', () => {
    const result = resolveFolderRuntime({
      folder: hostFolder(),
      runtime: wslRuntime({ pathMapping: null, capabilities: probeFailed() })
    })
    expect(result.blockedReason).toBe('probe-failed')
    expect(result.resolutionSteps).toEqual(['rescan-runtimes'])
  })

  it('**実行中 WSL1 はマッピングを持つので第 3 段に進む** (probeState で分岐しない)', () => {
    /*
     * WSL1 は capabilities を固定値で表明する (`probeState: done` / `sandbox: none`) が、
     * マッピングは取得する。`probeState` を鍵にすると「材料あり」と誤判定され、
     * 所在 windows のフォルダがすべて `path-not-mapped` として消える。
     */
    const wsl1 = wslRuntime({
      wslVersion: 1,
      capabilities: fixedCapabilities(NOW),
      pathMapping: mapping(UBUNTU)
    })
    const result = resolveFolderRuntime({ folder: hostFolder(), runtime: wsl1 })

    expect(result.reachability).toBe('reachable')
    expect(result.boundary).toBe('cross')
    expect(result.runtimePath).toEqual({ namespace: UBUNTU, value: '/mnt/c/dev/x' })
  })
})

/* ── 第 3 段: 変換と越境 ────────────────────────────────────────────── */

describe('第 3 段: 変換と越境', () => {
  it('所在 windows × Win32Runtime は native / 恒等', () => {
    const result = resolveFolderRuntime({ folder: hostFolder(), runtime: WIN32 })
    expect(result.boundary).toBe('native')
    expect(result.runtimePath).toEqual({ namespace: 'host', value: 'C:\\dev\\x' })
    expect(result.recommendation).toBeNull()
  })

  it('所在 windows × WslRuntime (接頭辞あり) は cross / 3 要素の案内つき', () => {
    const result = resolveFolderRuntime({ folder: hostFolder(), runtime: wslRuntime() })

    expect(result.boundary).toBe('cross')
    expect(result.runtimePath).toEqual({ namespace: UBUNTU, value: '/mnt/c/dev/x' })
    // **`cross` でも選択可能である** (FR-030)。
    expect(result.reachability).toBe('reachable')

    expect(result.recommendation).not.toBeNull()
    expect(result.recommendation?.impact.length).toBeGreaterThan(0)
    expect(result.recommendation?.suggestedLocation).toEqual({ namespace: UBUNTU, value: '/home' })
    // **旧エントリの登録解除を含む** (FR-031)。
    expect(result.recommendation?.steps).toEqual([
      'clone-to-suggested-location',
      'register-new-folder',
      'unregister-old-folder'
    ])
  })

  it('**マッピングに無いドライブは WslRuntime との組み合わせで到達不可**', () => {
    const result = resolveFolderRuntime({
      folder: hostFolder('Z:\\share\\x'),
      runtime: wslRuntime()
    })
    expect(result.reachability).toBe('unreachable')
    expect(result.unreachableReason).toBe('path-not-mapped')
  })

  it('同じフォルダは Win32Runtime からは恒等で開ける (到達不可にならない)', () => {
    const result = resolveFolderRuntime({ folder: hostFolder('Z:\\share\\x'), runtime: WIN32 })
    expect(result.reachability).toBe('reachable')
    expect(result.boundary).toBe('native')
  })

  it('所在 wsl:<D> × WslRuntime(<D>) で Windows マウント配下**でない**なら native', () => {
    const result = resolveFolderRuntime({
      folder: wslFolder('Ubuntu', '/home/u/repo'),
      runtime: wslRuntime()
    })
    expect(result.boundary).toBe('native')
    expect(result.runtimePath).toEqual({ namespace: UBUNTU, value: '/home/u/repo' })
    expect(result.recommendation).toBeNull()
  })

  it('**所在 WSL かつ Windows マウント配下は越境になる** (AD-016 の性能崖)', () => {
    const result = resolveFolderRuntime({
      folder: wslFolder('Ubuntu', '/mnt/c/dev/x'),
      runtime: wslRuntime()
    })
    expect(result.boundary).toBe('cross')
    // 値は恒等 (同じディストロの中を指しているため)。
    expect(result.runtimePath).toEqual({ namespace: UBUNTU, value: '/mnt/c/dev/x' })
    expect(result.recommendation).not.toBeNull()
  })

  it('マウント位置を決め打ちしない (非既定の位置でも越境と判定する)', () => {
    const custom = makePathMapping(
      'host',
      UBUNTU,
      [{ fromPrefix: 'C:\\', toPrefix: '/windows/c' }],
      NOW
    )
    if (!custom.ok) throw new Error('前提')

    const result = resolveFolderRuntime({
      folder: wslFolder('Ubuntu', '/windows/c/dev/x'),
      runtime: wslRuntime({ pathMapping: custom.mapping })
    })
    expect(result.boundary).toBe('cross')
  })
})

/* ── 不変条件 ───────────────────────────────────────────────────────── */

describe('不変条件', () => {
  const cases: readonly { folder: WorkspaceFolder; runtime: RuntimeDescriptor }[] = [
    { folder: hostFolder(), runtime: WIN32 },
    { folder: hostFolder(), runtime: wslRuntime() },
    { folder: hostFolder('Z:\\x'), runtime: wslRuntime() },
    { folder: hostFolder(), runtime: wslRuntime({ state: 'stopped', pathMapping: null }) },
    { folder: wslFolder('Ubuntu', '/home/u/x'), runtime: wslRuntime() },
    { folder: wslFolder('Ubuntu', '/mnt/c/x'), runtime: wslRuntime() },
    { folder: wslFolder('Debian', '/home/u/x'), runtime: wslRuntime() },
    { folder: wslFolder('Ubuntu', '/home/u/x'), runtime: WIN32 }
  ]

  it('unreachableReason と blockedReason は同時に非 null にならない', () => {
    for (const input of cases) {
      const result = resolveFolderRuntime(input)
      const both = result.unreachableReason !== null && result.blockedReason !== null
      expect(both).toBe(false)
    }
  })

  it('blocked は必ず手順を 1 つ以上伴う', () => {
    for (const input of cases) {
      const result = resolveFolderRuntime(input)
      if (result.reachability !== 'blocked') continue
      expect(result.resolutionSteps.length).toBeGreaterThan(0)
    }
  })

  it('cross のとき recommendation の 3 要素がすべて非空', () => {
    for (const input of cases) {
      const result = resolveFolderRuntime(input)
      if (result.boundary !== 'cross') continue
      expect(result.recommendation?.impact.length).toBeGreaterThan(0)
      expect(result.recommendation?.suggestedLocation.value.length).toBeGreaterThan(0)
      expect(result.recommendation?.steps.length).toBeGreaterThan(0)
    }
  })

  it('runtimePath が非 null のとき名前空間はランタイムの id と一致する', () => {
    for (const input of cases) {
      const result = resolveFolderRuntime(input)
      if (result.runtimePath === null) continue
      expect(result.runtimePath.namespace).toBe(input.runtime.id)
    }
  })

  it('blocked / unreachable では runtimePath が null', () => {
    for (const input of cases) {
      const result = resolveFolderRuntime(input)
      if (result.reachability === 'reachable') continue
      expect(result.runtimePath).toBeNull()
    }
  })
})

/* ── 解消手順の後に unreachable へ確定する列 ───────────────────────── */

describe('blocked から解消手順を経て unreachable に確定する場合 (FR-028)', () => {
  it('**理由が返る** (黙って消さない)', () => {
    /*
     * `blocked` の段階ではマッピングが無いため第 3 段を先取りできない。
     * 「起動して再検出せよ」と案内したうえで `path-not-mapped` に落ちる列が必ず残る。
     */
    const stopped = wslRuntime({
      state: 'stopped',
      pathMapping: null,
      capabilities: beginProbing()
    })
    const before = resolveFolderRuntime({ folder: hostFolder('Z:\\share\\x'), runtime: stopped })
    expect(before.reachability).toBe('blocked')
    expect(before.resolutionSteps).toEqual(['start-distro', 'rescan-runtimes'])

    // 手順を実行した後 (起動 + 再検出でマッピングを取得)。
    const after = resolveFolderRuntime({
      folder: hostFolder('Z:\\share\\x'),
      runtime: wslRuntime()
    })
    expect(after.reachability).toBe('unreachable')
    // **理由が非 null であること** — これが無いと利用者は行き止まりに着く。
    expect(after.unreachableReason).toBe('path-not-mapped')
  })
})

/* ── 一覧側の第 0 段と畳み込み ──────────────────────────────────────── */

describe('一覧側の第 0 段 (data-model §6)', () => {
  function stage0For(
    folder: WorkspaceFolder,
    runtimes: readonly RuntimeDescriptor[],
    existence: ExistenceCheck
  ): ReturnType<typeof stage0> {
    return stage0({ folder, runtimes, existence })
  }

  it('所在ディストロが検出結果に無ければ unreachable (distro-absent)', () => {
    const result = stage0For(wslFolder('Ghost', '/home/u/x'), [WIN32], 'unknown')
    expect(result?.reachability).toBe('unreachable')
    expect(result?.unreachableReason).toBe('distro-absent')
  })

  it('所在ディストロが停止中なら blocked (distro-not-running)', () => {
    const stopped = wslRuntime({ state: 'stopped' })
    const result = stage0For(wslFolder('Ubuntu', '/home/u/x'), [stopped], 'unknown')
    expect(result?.reachability).toBe('blocked')
    expect(result?.blockedReason).toBe('distro-not-running')
  })

  it('**確認済みの値を持たないときに folder-missing を出さない**', () => {
    // 停止を削除と誤認させ、「解除を勧める」側に誤って落とす経路を塞ぐ。
    const result = stage0For(wslFolder('Ubuntu', '/home/u/x'), [wslRuntime()], 'unknown')
    expect(result?.reachability).toBe('blocked')
    expect(result?.unreachableReason).toBeNull()
  })

  it('実行中でパスが無ければ unreachable (folder-missing)', () => {
    const result = stage0For(wslFolder('Ubuntu', '/home/u/x'), [wslRuntime()], 'missing')
    expect(result?.reachability).toBe('unreachable')
    expect(result?.unreachableReason).toBe('folder-missing')
  })

  it('所在 windows でパスが無ければ unreachable (folder-missing)', () => {
    const result = stage0For(hostFolder(), [WIN32], 'missing')
    expect(result?.unreachableReason).toBe('folder-missing')
  })

  it('実行中で存在すれば第 1 段へ渡す (null を返す)', () => {
    expect(stage0For(wslFolder('Ubuntu', '/home/u/x'), [wslRuntime()], 'exists')).toBeNull()
  })
})

describe('畳み込み (data-model §6)', () => {
  const reachable = toFolderReachability(
    resolveFolderRuntime({ folder: hostFolder(), runtime: WIN32 })
  )
  const blocked = toFolderReachability(
    resolveFolderRuntime({
      folder: hostFolder(),
      runtime: wslRuntime({ state: 'stopped', pathMapping: null })
    })
  )
  const unreachable = toFolderReachability(
    resolveFolderRuntime({ folder: hostFolder('Z:\\x'), runtime: wslRuntime() })
  )

  it('いずれかで reachable なら reachable', () => {
    expect(fold([unreachable, blocked, reachable]).reachability).toBe('reachable')
  })

  it('reachable が無く blocked があれば blocked', () => {
    expect(fold([unreachable, blocked]).reachability).toBe('blocked')
  })

  it('いずれも無ければ unreachable', () => {
    expect(fold([unreachable]).reachability).toBe('unreachable')
  })

  it('**対が 0 件のときに reachable へ倒さない**', () => {
    const result = fold([])
    expect(result.reachability).toBe('blocked')
    expect(result.resolutionSteps.length).toBeGreaterThan(0)
  })
})
