import { describe, expect, it } from 'vitest'

import { fixedCapabilities } from '@domain/runtime/capabilities'
import type { RuntimeDescriptor, WslRuntimeDescriptor } from '@domain/runtime/descriptor'
import { wslNamespace } from '@domain/runtime/namespace'
import { makePathMapping } from '@domain/runtime/path-mapping'
import { makeHostPath, makeRuntimePath } from '@domain/runtime/path-types'
import { hasControlCharacter } from '@domain/validation'
import type { FolderRuntimeResolutionDTO } from '@domain/workspace/dto'
import { createWin32 } from '@domain/workspace/__fixtures__/runtime'
import type { Location, WorkspaceFolder } from '@domain/workspace/folder'
import type { ResolveInput } from '@domain/workspace/resolution'

import { classifyCwd } from './cwd-origin'
import { cwdKeyOf, matchFolder, type FolderMatch, type ResolveFolderRuntime } from './match'

/**
 * 対応づけ 4 段の**全セル**を網羅する (BE-014 / SC-005)。
 *
 * **R-1 の `resolveFolderRuntime()` は注入で差し替える。** 本テストの対象は
 * 「解決結果をどう畳むか」であり、解決そのものは R-1 の `resolution.test.ts` が見ている。
 * 同じ表を 2 箇所でテストしない。
 */

const NOW = 1_700_000_000_000
const HOST = { kind: 'windows' } as const
const UBUNTU = { kind: 'wsl', distroName: 'Ubuntu' } as const
const DEBIAN = { kind: 'wsl', distroName: 'Debian' } as const
const DETECTED = new Set(['Ubuntu', 'Debian'])

function wslRuntime(distroName: string): WslRuntimeDescriptor {
  const namespace = wslNamespace(distroName)
  const mapping = makePathMapping(
    'host',
    namespace,
    [{ fromPrefix: 'C:\\', toPrefix: '/mnt/c' }],
    NOW
  )
  if (!mapping.ok) throw new Error('前提')
  return {
    id: namespace,
    kind: 'wsl',
    distroName,
    wslVersion: 2,
    state: 'running',
    isDefault: false,
    capabilities: fixedCapabilities(NOW),
    pathMapping: mapping.mapping,
    detectedAt: NOW
  }
}

function wslFolder(id: string, distroName: string, raw: string): WorkspaceFolder {
  const path = makeRuntimePath(wslNamespace(distroName), raw)
  if (!path.ok) throw new Error('前提')
  return {
    id,
    location: { kind: 'wsl' as const, distroName },
    path: path.path,
    displayName: id,
    registeredAt: NOW
  }
}

function hostFolder(id: string, raw: string): WorkspaceFolder {
  const path = makeHostPath(raw)
  if (!path.ok) throw new Error('前提')
  return { id, location: HOST, path: path.path, displayName: id, registeredAt: NOW }
}

/** 到達可能で変換後パスを返す解決結果。 */
function reachable(
  namespace: string,
  value: string,
  boundary: 'native' | 'cross'
): FolderRuntimeResolutionDTO {
  return {
    reachability: 'reachable',
    unreachableReason: null,
    blockedReason: null,
    resolutionSteps: [],
    boundary,
    runtimePath: { namespace: namespace as never, value },
    recommendation: null
  }
}

function blocked(
  reason: 'distro-not-running' | 'capabilities-not-probed' | 'probe-failed'
): FolderRuntimeResolutionDTO {
  return {
    reachability: 'blocked',
    unreachableReason: null,
    blockedReason: reason,
    resolutionSteps: [],
    boundary: 'unknown',
    runtimePath: null,
    recommendation: null
  }
}

const unreachable: FolderRuntimeResolutionDTO = {
  reachability: 'unreachable',
  unreachableReason: 'foreign-distro',
  blockedReason: null,
  resolutionSteps: [],
  boundary: 'unknown',
  runtimePath: null,
  recommendation: null
}

/** フォルダ id ごとに解決結果を差し替える。 */
function resolverOf(table: Record<string, FolderRuntimeResolutionDTO>): ResolveFolderRuntime {
  return (input: ResolveInput) => table[input.folder.id] ?? unreachable
}

function match(
  cwd: string | null,
  targetLocation: Location,
  folders: readonly WorkspaceFolder[],
  runtimes: readonly RuntimeDescriptor[],
  table: Record<string, FolderRuntimeResolutionDTO>
): FolderMatch {
  const origin = classifyCwd({ cwd, targetLocation, detectedDistros: DETECTED })
  return matchFolder({ origin, folders, runtimes, resolve: resolverOf(table) })
}

describe('第 0 段: 出自が確定しない値は登録フォルダを走査しない', () => {
  it.each([
    [null, HOST, 'cwd-absent'],
    ['/home/y/p', HOST, 'location-unknown'],
    ['\\\\wsl.localhost\\Fedora\\home\\y', HOST, 'distro-undetected']
  ])('cwd=%p → unknown(%s)', (cwd, location, reason) => {
    const result = match(cwd as string | null, location as Location, [], [], {})
    expect(result).toEqual({ kind: 'unknown', reason })
  })

  it('**未登録と混ぜない** — 走査した結果として一致しなかったのではない', () => {
    const folders = [wslFolder('f1', 'Ubuntu', '/home/y/p')]
    const result = match('/home/y/p', HOST, folders, [wslRuntime('Ubuntu')], {
      f1: reachable(wslNamespace('Ubuntu'), '/home/y/p', 'native')
    })
    // 由来 config がホストなので所在が決まらない。**一致させてはならない。**
    expect(result.kind).toBe('unknown')
  })
})

describe('第 1 段: 所在に対応する RuntimeDescriptor が引けないとき', () => {
  it('検出済み集合に無い所在は distro-undetected', () => {
    const result = match('/home/y/p', UBUNTU, [], [createWin32(NOW)], {})
    expect(result).toEqual({ kind: 'unknown', reason: 'distro-undetected' })
  })
})

describe('第 2 / 3 段: 所在の名前空間へ変換して照合する', () => {
  it('同じ所在の直接一致', () => {
    const folders = [wslFolder('f1', 'Ubuntu', '/home/y/p')]
    const result = match('/home/y/p/sub', UBUNTU, folders, [wslRuntime('Ubuntu')], {
      f1: reachable(wslNamespace('Ubuntu'), '/home/y/p', 'native')
    })
    expect(result).toEqual({
      kind: 'folder',
      folderId: 'f1',
      boundary: 'native',
      matchedPrefix: '/home/y/p'
    })
  })

  it('**越境経路での一致** — 所在 windows の登録フォルダが `/mnt/c/...` として一致する', () => {
    // 所在が違うことだけを理由に未登録扱いにしない (FR-020)。
    const folders = [hostFolder('f1', 'C:\\dev\\x')]
    const result = match('/mnt/c/dev/x/sub', UBUNTU, folders, [wslRuntime('Ubuntu')], {
      f1: reachable(wslNamespace('Ubuntu'), '/mnt/c/dev/x', 'cross')
    })
    expect(result).toEqual({
      kind: 'folder',
      folderId: 'f1',
      boundary: 'cross',
      matchedPrefix: '/mnt/c/dev/x'
    })
  })

  it('前方一致する登録フォルダの共存では**最長一致**を採る', () => {
    const folders = [
      wslFolder('short', 'Ubuntu', '/home/y'),
      wslFolder('long', 'Ubuntu', '/home/y/p')
    ]
    const result = match('/home/y/p/sub', UBUNTU, folders, [wslRuntime('Ubuntu')], {
      short: reachable(wslNamespace('Ubuntu'), '/home/y', 'native'),
      long: reachable(wslNamespace('Ubuntu'), '/home/y/p', 'native')
    })
    expect(result.kind).toBe('folder')
    if (result.kind !== 'folder') return
    expect(result.folderId).toBe('long')
  })

  it('セグメント境界で照合する — `/home/y/project2` を `/home/y/project` に吸わせない', () => {
    const folders = [wslFolder('f1', 'Ubuntu', '/home/y/project')]
    const result = match('/home/y/project2', UBUNTU, folders, [wslRuntime('Ubuntu')], {
      f1: reachable(wslNamespace('Ubuntu'), '/home/y/project', 'native')
    })
    expect(result.kind).toBe('unregistered')
  })

  it('同じパスが 2 ディストロにあるとき、所在の合う側だけに一致する', () => {
    const folders = [
      wslFolder('ubuntu', 'Ubuntu', '/home/y/p'),
      wslFolder('debian', 'Debian', '/home/y/p')
    ]
    const result = match(
      '/home/y/p',
      UBUNTU,
      folders,
      [wslRuntime('Ubuntu'), wslRuntime('Debian')],
      {
        ubuntu: reachable(wslNamespace('Ubuntu'), '/home/y/p', 'native'),
        // Debian のフォルダは Ubuntu ランタイムからは到達不可 (foreign-distro)。
        debian: unreachable
      }
    )
    expect(result.kind).toBe('folder')
    if (result.kind !== 'folder') return
    expect(result.folderId).toBe('ubuntu')
  })

  it('変換後パスの名前空間が所在と食い違う結果は採らない', () => {
    const folders = [wslFolder('f1', 'Ubuntu', '/home/y/p')]
    const result = match('/home/y/p', UBUNTU, folders, [wslRuntime('Ubuntu')], {
      // 別ディストロの名前空間で返ってきた値は無視する。
      f1: reachable(wslNamespace('Debian'), '/home/y/p', 'native')
    })
    expect(result.kind).toBe('unregistered')
  })
})

describe('保留 (blocked) の扱い', () => {
  it('変換材料が無い所在は pending になる', () => {
    const folders = [wslFolder('f1', 'Ubuntu', '/home/y/p')]
    const result = match('/home/y/p', UBUNTU, folders, [wslRuntime('Ubuntu')], {
      f1: blocked('capabilities-not-probed')
    })
    expect(result).toEqual({ kind: 'pending', reason: 'capabilities-not-probed' })
  })

  it('**保留を未登録より優先する** — 未登録として見せると再登録を促してしまう', () => {
    const folders = [
      wslFolder('blockedFolder', 'Ubuntu', '/home/y/other'),
      wslFolder('reachableFolder', 'Ubuntu', '/home/y/elsewhere')
    ]
    const result = match('/home/y/p', UBUNTU, folders, [wslRuntime('Ubuntu')], {
      blockedFolder: blocked('probe-failed'),
      reachableFolder: reachable(wslNamespace('Ubuntu'), '/home/y/elsewhere', 'native')
    })
    expect(result).toEqual({ kind: 'pending', reason: 'probe-failed' })
  })

  it('一致が見つかれば保留より一致を優先する', () => {
    const folders = [
      wslFolder('blockedFolder', 'Ubuntu', '/home/y/other'),
      wslFolder('hit', 'Ubuntu', '/home/y/p')
    ]
    const result = match('/home/y/p', UBUNTU, folders, [wslRuntime('Ubuntu')], {
      blockedFolder: blocked('distro-not-running'),
      hit: reachable(wslNamespace('Ubuntu'), '/home/y/p', 'native')
    })
    expect(result.kind).toBe('folder')
  })

  it('保留理由は**解消手順が最も明確なもの**を出す', () => {
    const folders = [
      wslFolder('a', 'Ubuntu', '/home/a'),
      wslFolder('b', 'Ubuntu', '/home/b'),
      wslFolder('c', 'Ubuntu', '/home/c')
    ]
    const result = match('/home/y/p', UBUNTU, folders, [wslRuntime('Ubuntu')], {
      a: blocked('capabilities-not-probed'),
      b: blocked('distro-not-running'),
      c: blocked('probe-failed')
    })
    expect(result).toEqual({ kind: 'pending', reason: 'distro-not-running' })
  })
})

describe('未登録', () => {
  it('登録フォルダが 0 件なら未登録になり、鍵は (所在, パス) の組である', () => {
    const result = match('/home/y/p', UBUNTU, [], [wslRuntime('Ubuntu')], {})
    expect(result.kind).toBe('unregistered')
    if (result.kind !== 'unregistered') return
    expect(result.cwdKey).toBe(cwdKeyOf(wslNamespace('Ubuntu'), '/home/y/p'))

    /*
     * **鍵に制御文字を入れない** (pr-gate Round 4 / A4-007)。
     * この値は `SessionGroupDTO.unregistered.cwdKey` として IPC を渡るので、
     * FR-049 / SC-015 の「境界を渡る文字列に制御文字を残さない」が掛かる。
     * 以前は区切りが U+0000 で、**構造上必ず違反していた**。
     */
    expect(hasControlCharacter(result.cwdKey)).toBe(false)
  })

  it('鍵は (所在, パス) について単射である', () => {
    /*
     * 区切りを変えるなら、変えた先が曖昧でないことを縛る。
     * 素朴な連結だと `('wsl:a', 'b')` と `('wsl:a"b', '')` のような衝突が作れる。
     */
    const keys = [
      cwdKeyOf(wslNamespace('a'), '/b'),
      cwdKeyOf(wslNamespace('a/b'), ''),
      cwdKeyOf(wslNamespace('a'), ''),
      cwdKeyOf(wslNamespace(''), '/a'),
      cwdKeyOf(wslNamespace('a"'), '/b')
    ]

    expect(new Set(keys).size).toBe(keys.length)
  })

  it('到達不可のフォルダしか無ければ未登録 (保留にしない)', () => {
    const folders = [wslFolder('f1', 'Debian', '/home/y/p')]
    const result = match('/home/y/p', UBUNTU, folders, [wslRuntime('Ubuntu')], { f1: unreachable })
    expect(result.kind).toBe('unregistered')
  })

  it('所在が違えば同じパスでも別の鍵になる', () => {
    const ubuntu = match('/home/y/p', UBUNTU, [], [wslRuntime('Ubuntu')], {})
    const debian = match('/home/y/p', DEBIAN, [], [wslRuntime('Debian')], {})
    expect(ubuntu.kind).toBe('unregistered')
    expect(debian.kind).toBe('unregistered')
    if (ubuntu.kind !== 'unregistered' || debian.kind !== 'unregistered') return
    expect(ubuntu.cwdKey).not.toBe(debian.cwdKey)
  })

  it('ホスト側の履歴もホストの登録フォルダに一致する', () => {
    const folders = [hostFolder('f1', 'C:\\dev\\x')]
    const result = match('C:\\dev\\x\\sub', HOST, folders, [createWin32(NOW)], {
      f1: reachable('host', 'C:\\dev\\x', 'native')
    })
    expect(result.kind).toBe('folder')
  })
})

describe('fixedCapabilities を使うランタイムでも判定は同じ形になる', () => {
  it('WSL1 相当 (実地判定なし) でもマッピングがあれば一致する', () => {
    const namespace = wslNamespace('Ubuntu')
    const mapping = makePathMapping(
      'host',
      namespace,
      [{ fromPrefix: 'C:\\', toPrefix: '/mnt/c' }],
      NOW
    )
    if (!mapping.ok) throw new Error('前提')
    const runtime: WslRuntimeDescriptor = {
      id: namespace,
      kind: 'wsl',
      distroName: 'Ubuntu',
      wslVersion: 1,
      state: 'running',
      isDefault: false,
      capabilities: fixedCapabilities(NOW),
      pathMapping: mapping.mapping,
      detectedAt: NOW
    }
    const folders = [wslFolder('f1', 'Ubuntu', '/home/y/p')]
    const result = match('/home/y/p', UBUNTU, folders, [runtime], {
      f1: reachable(namespace, '/home/y/p', 'native')
    })
    expect(result.kind).toBe('folder')
  })
})
