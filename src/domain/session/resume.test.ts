import { describe, expect, it } from 'vitest'

import { fixedCapabilities } from '@domain/runtime/capabilities'
import type { RuntimeDescriptor, WslRuntimeDescriptor } from '@domain/runtime/descriptor'
import { wslNamespace, type WslNamespaceId } from '@domain/runtime/namespace'
import { makePathMapping } from '@domain/runtime/path-mapping'
import { makeHostPath, makeRuntimePath, type HostPath, type RuntimePath } from '@domain/runtime/path-types'
import type { ProviderProfile } from '@domain/provider/types'
import type { FolderRuntimeResolutionDTO } from '@domain/workspace/dto'
import { createWin32 } from '@domain/workspace/__fixtures__/runtime'
import type { Location, WorkspaceFolder } from '@domain/workspace/folder'
import type { ResolveInput } from '@domain/workspace/resolution'

import type { CwdOrigin } from './origin'
import type { ResolveFolderRuntime } from './match'
import { RESUME_UNAVAILABLE_REASONS } from './resume'
import { resolvePastResumeAxes, type PastResumeInput } from './resume-axes'
import type { EnumerationTarget } from './target'

/**
 * 過去の行の軸の解決 (X-9 / data-model §3.1 / SC-003)。表を全行で回す。
 * フォルダの解決 (`resolve`) は注入で差し替える (match.test.ts と同じ方針)。
 */

const NOW = 1_700_000_000_000
const HOST: Location = { kind: 'windows' }
const UBUNTU: Location = { kind: 'wsl', distroName: 'Ubuntu' }
const DEBIAN: Location = { kind: 'wsl', distroName: 'Debian' }
const NS_UBUNTU = wslNamespace('Ubuntu')
const NS_DEBIAN = wslNamespace('Debian')

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

const RUNTIMES: readonly RuntimeDescriptor[] = [
  createWin32(NOW),
  wslRuntime('Ubuntu'),
  wslRuntime('Debian')
]

function hostPath(raw: string): HostPath {
  const r = makeHostPath(raw)
  if (!r.ok) throw new Error('前提')
  return r.path
}

function runtimePath(namespace: WslNamespaceId, raw: string): RuntimePath {
  const r = makeRuntimePath(namespace, raw)
  if (!r.ok) throw new Error('前提')
  return r.path
}

function hostFolder(id: string, raw: string): WorkspaceFolder {
  return {
    id,
    location: { kind: 'windows' },
    path: hostPath(raw),
    displayName: id,
    registeredAt: NOW
  }
}

function wslFolder(id: string, distroName: string, raw: string): WorkspaceFolder {
  return {
    id,
    location: { kind: 'wsl', distroName },
    path: runtimePath(wslNamespace(distroName), raw),
    displayName: id,
    registeredAt: NOW
  }
}

function reachable(namespace: string, value: string): FolderRuntimeResolutionDTO {
  return {
    reachability: 'reachable',
    unreachableReason: null,
    blockedReason: null,
    resolutionSteps: [],
    boundary: 'native',
    runtimePath: { namespace: namespace as never, value },
    recommendation: null
  }
}

const BLOCKED: FolderRuntimeResolutionDTO = {
  reachability: 'blocked',
  unreachableReason: null,
  blockedReason: 'distro-not-running',
  resolutionSteps: [],
  boundary: 'unknown',
  runtimePath: null,
  recommendation: null
}

const UNREACHABLE: FolderRuntimeResolutionDTO = {
  reachability: 'unreachable',
  unreachableReason: 'foreign-distro',
  blockedReason: null,
  resolutionSteps: [],
  boundary: 'unknown',
  runtimePath: null,
  recommendation: null
}

function resolverOf(table: Record<string, FolderRuntimeResolutionDTO>): ResolveFolderRuntime {
  return (input: ResolveInput) => table[input.folder.id] ?? UNREACHABLE
}

function targetOf(location: Location, configDir: EnumerationTarget['configDir']): EnumerationTarget {
  return { key: 'k#0', location, configDir, origin: 'default', label: 'u' }
}

const HOST_CONFIG = hostPath('C:\\Users\\y\\.claude')
const UBUNTU_CONFIG = runtimePath(NS_UBUNTU, '/home/y/.claude')
const DEBIAN_CONFIG = runtimePath(NS_DEBIAN, '/home/y/.claude')

const HOST_ORIGIN: CwdOrigin = { kind: 'host', path: hostPath('C:\\dev\\x') }
const UBUNTU_ORIGIN: CwdOrigin = {
  kind: 'wsl-inherited',
  path: runtimePath(NS_UBUNTU, '/home/y/p'),
  namespace: NS_UBUNTU
}

function input(over: Partial<PastResumeInput>): PastResumeInput {
  return {
    target: targetOf(HOST, HOST_CONFIG),
    origin: HOST_ORIGIN,
    folders: [hostFolder('fh', 'C:\\dev\\x')],
    runtimes: RUNTIMES,
    providers: [],
    resolve: resolverOf({ fh: reachable('host', 'C:\\dev\\x') }),
    ...over
  }
}

function provider(
  id: string,
  configDir: ProviderProfile['configDir'],
  source = 'config-dir'
): ProviderProfile {
  return {
    id,
    displayName: id,
    backend: 'anthropic',
    configDir,
    credential: { source } as ProviderProfile['credential'],
    models: { models: [] }
  } as ProviderProfile
}

describe('ResumeUnavailableReason', () => {
  it('9 値の pin (集合を変えるには ADR が要る: AD-059)', () => {
    expect([...RESUME_UNAVAILABLE_REASONS]).toEqual([
      'source-unknown',
      'runtime-missing',
      'location-mismatch',
      'folder-unregistered',
      'cwd-mismatch',
      'folder-pending',
      'location-unknown',
      'provider-missing',
      'provider-ambiguous'
    ])
  })
})

describe('resolvePastResumeAxes: 決まる行', () => {
  it('所在 windows → runtime host。Provider なし (既定の config ディレクトリ)', () => {
    expect(resolvePastResumeAxes(input({}))).toEqual({
      ok: true,
      folderId: 'fh',
      runtimeId: 'host',
      providerId: null
    })
  })

  it('所在 wsl:Ubuntu → runtime wsl:Ubuntu', () => {
    const result = resolvePastResumeAxes(
      input({
        target: targetOf(UBUNTU, UBUNTU_CONFIG),
        origin: UBUNTU_ORIGIN,
        folders: [wslFolder('fw', 'Ubuntu', '/home/y/p')],
        resolve: resolverOf({ fw: reachable(NS_UBUNTU, '/home/y/p') })
      })
    )
    expect(result).toEqual({ ok: true, folderId: 'fw', runtimeId: NS_UBUNTU, providerId: null })
  })

  it('config-dir の Provider が 1 つ → その Provider', () => {
    const result = resolvePastResumeAxes(input({ providers: [provider('p1', HOST_CONFIG)] }))
    expect(result).toMatchObject({ ok: true, providerId: 'p1' })
  })

  it('in-app-login の Provider も候補になる', () => {
    const result = resolvePastResumeAxes(
      input({ providers: [provider('p1', HOST_CONFIG, 'in-app-login')] })
    )
    expect(result).toMatchObject({ ok: true, providerId: 'p1' })
  })

  it('WSL: host の configDir が mapping 経由で列挙対象の config と一致する Provider', () => {
    const mapped = runtimePath(NS_UBUNTU, '/mnt/c/Users/y/cfg')
    const result = resolvePastResumeAxes(
      input({
        target: targetOf(UBUNTU, mapped),
        origin: UBUNTU_ORIGIN,
        folders: [wslFolder('fw', 'Ubuntu', '/home/y/p')],
        resolve: resolverOf({ fw: reachable(NS_UBUNTU, '/home/y/p') }),
        providers: [provider('p1', hostPath('C:\\Users\\y\\cfg'))]
      })
    )
    expect(result).toMatchObject({ ok: true, runtimeId: NS_UBUNTU, providerId: 'p1' })
  })

  it('戻り値にパスの文字列が無い (ok: true は 3 つの id だけ)', () => {
    const result = resolvePastResumeAxes(input({}))
    expect(Object.keys(result).sort()).toEqual(['folderId', 'ok', 'providerId', 'runtimeId'])
  })
})

describe('resolvePastResumeAxes: 段 1 (ランタイム)', () => {
  it('descriptor が無ければ runtime-missing', () => {
    expect(resolvePastResumeAxes(input({ runtimes: [wslRuntime('Ubuntu')] }))).toEqual({
      ok: false,
      reason: 'runtime-missing'
    })
    expect(
      resolvePastResumeAxes(
        input({ target: targetOf(DEBIAN, DEBIAN_CONFIG), runtimes: [createWin32(NOW)] })
      )
    ).toEqual({ ok: false, reason: 'runtime-missing' })
  })
})

describe('resolvePastResumeAxes: 段 1b (出自の一致)', () => {
  const unc = (ns: WslNamespaceId, value: string): CwdOrigin => ({
    kind: 'wsl-from-unc',
    path: runtimePath(ns, value),
    namespace: ns
  })

  const rows: ReadonlyArray<readonly [string, Partial<PastResumeInput>]> = [
    [
      'ホストの対象 × UNC の cwd が WSL のフォルダに対応づく',
      {
        origin: unc(NS_UBUNTU, '/home/y/p'),
        folders: [wslFolder('fw', 'Ubuntu', '/home/y/p')],
        resolve: resolverOf({ fw: reachable(NS_UBUNTU, '/home/y/p') })
      }
    ],
    [
      'ホストの対象 × UNC の cwd が /mnt/c を経てホストのフォルダに対応づく',
      {
        origin: unc(NS_UBUNTU, '/mnt/c/dev/x'),
        folders: [hostFolder('fh', 'C:\\dev\\x')],
        resolve: resolverOf({ fh: reachable(NS_UBUNTU, '/mnt/c/dev/x') })
      }
    ],
    [
      'wsl:Ubuntu の対象 × wsl:Debian の UNC の cwd',
      {
        target: targetOf(UBUNTU, UBUNTU_CONFIG),
        origin: unc(NS_DEBIAN, '/home/y/p'),
        folders: [wslFolder('fd', 'Debian', '/home/y/p')],
        resolve: resolverOf({ fd: reachable(NS_DEBIAN, '/home/y/p') })
      }
    ],
    [
      'wsl:Ubuntu の対象 × wsl:Ubuntu の UNC の cwd',
      {
        target: targetOf(UBUNTU, UBUNTU_CONFIG),
        origin: unc(NS_UBUNTU, '/home/y/p'),
        folders: [wslFolder('fw', 'Ubuntu', '/home/y/p')],
        resolve: resolverOf({ fw: reachable(NS_UBUNTU, '/home/y/p') })
      }
    ],
    [
      'wsl:Ubuntu の対象 × host の出自',
      {
        target: targetOf(UBUNTU, UBUNTU_CONFIG),
        origin: HOST_ORIGIN
      }
    ],
    [
      'ホストの対象 × wsl-inherited の出自',
      { target: targetOf(HOST, HOST_CONFIG), origin: UBUNTU_ORIGIN }
    ],
    [
      'wsl:Ubuntu の対象 × wsl:Debian の wsl-inherited の出自',
      {
        target: targetOf(UBUNTU, UBUNTU_CONFIG),
        origin: {
          kind: 'wsl-inherited',
          path: runtimePath(NS_DEBIAN, '/home/y/p'),
          namespace: NS_DEBIAN
        }
      }
    ]
  ]

  it.each(rows)('%s → location-mismatch (ok にならない)', (_name, over) => {
    expect(resolvePastResumeAxes(input(over))).toEqual({ ok: false, reason: 'location-mismatch' })
  })

  it.each<[string, CwdOrigin]>([
    ['absent', { kind: 'absent' }],
    ['unknown-location', { kind: 'unknown-location', display: '/x' }],
    [
      'undetected-distro',
      { kind: 'undetected-distro', distroName: 'Fedora', display: 'Fedora:/x' }
    ]
  ])('出自が %s は段 1b を素通りして段 2 の理由 (location-unknown) になる', (_k, origin) => {
    expect(resolvePastResumeAxes(input({ origin }))).toEqual({
      ok: false,
      reason: 'location-unknown'
    })
  })
})

describe('resolvePastResumeAxes: 段 2 (フォルダ)', () => {
  it('登録フォルダに対応づかなければ folder-unregistered', () => {
    expect(resolvePastResumeAxes(input({ folders: [] }))).toEqual({
      ok: false,
      reason: 'folder-unregistered'
    })
  })

  it('判定が保留なら folder-pending', () => {
    expect(resolvePastResumeAxes(input({ resolve: resolverOf({ fh: BLOCKED }) }))).toEqual({
      ok: false,
      reason: 'folder-pending'
    })
  })

  it('フォルダの下のディレクトリは cwd-mismatch', () => {
    expect(
      resolvePastResumeAxes(input({ origin: { kind: 'host', path: hostPath('C:\\dev\\x\\sub') } }))
    ).toEqual({ ok: false, reason: 'cwd-mismatch' })
  })

  it('大文字小文字だけ違う cwd は ok にならない (完全一致)', () => {
    const result = resolvePastResumeAxes(
      input({ origin: { kind: 'host', path: hostPath('C:\\dev\\X') } })
    )
    expect(result.ok).toBe(false)
  })
})

describe('resolvePastResumeAxes: 段 3 (Provider)', () => {
  it('候補が 2 つなら provider-ambiguous', () => {
    expect(
      resolvePastResumeAxes(
        input({ providers: [provider('p1', HOST_CONFIG), provider('p2', HOST_CONFIG, 'in-app-login')] })
      )
    ).toEqual({ ok: false, reason: 'provider-ambiguous' })
  })

  it('configDir を持たない Provider・別の config の Provider・helper 方式の Provider は候補にならない', () => {
    const result = resolvePastResumeAxes(
      input({
        providers: [
          provider('none', undefined),
          provider('other', hostPath('C:\\Users\\y\\other')),
          provider('helper', HOST_CONFIG, 'api-key-helper')
        ]
      })
    )
    expect(result).toMatchObject({ ok: true, providerId: null })
  })

  it('resolveConfigDirPath が ok でない Provider は候補にならない (WSL が停止中)', () => {
    const stopped: WslRuntimeDescriptor = { ...wslRuntime('Ubuntu'), state: 'stopped' }
    const mapped = runtimePath(NS_UBUNTU, '/mnt/c/Users/y/cfg')
    const result = resolvePastResumeAxes(
      input({
        target: targetOf(UBUNTU, mapped),
        origin: UBUNTU_ORIGIN,
        runtimes: [createWin32(NOW), stopped],
        folders: [wslFolder('fw', 'Ubuntu', '/home/y/p')],
        resolve: resolverOf({ fw: reachable(NS_UBUNTU, '/home/y/p') }),
        providers: [provider('p1', hostPath('C:\\Users\\y\\cfg'))]
      })
    )
    expect(result).toMatchObject({ ok: true, providerId: null })
  })

  it('候補 0 で origin が default 以外なら provider-missing (RK-03)', () => {
    const t = { ...targetOf(HOST, HOST_CONFIG), origin: 'provider' } as unknown as EnumerationTarget
    expect(resolvePastResumeAxes(input({ target: t }))).toEqual({
      ok: false,
      reason: 'provider-missing'
    })
  })
})

describe('resolvePastResumeAxes: ok の全行でランタイムの名前空間がずれない', () => {
  it('所在 × ランタイムの組', () => {
    const cases: Array<[Partial<PastResumeInput>, string]> = [
      [{}, 'host'],
      [
        {
          target: targetOf(UBUNTU, UBUNTU_CONFIG),
          origin: UBUNTU_ORIGIN,
          folders: [wslFolder('fw', 'Ubuntu', '/home/y/p')],
          resolve: resolverOf({ fw: reachable(NS_UBUNTU, '/home/y/p') })
        },
        NS_UBUNTU
      ]
    ]
    for (const [over, ns] of cases) {
      const result = resolvePastResumeAxes(input(over))
      expect(result.ok && result.runtimeId).toBe(ns)
    }
  })
})
