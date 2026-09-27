import { describe, expect, it } from 'vitest'

import { fixedCapabilities } from '@domain/runtime/capabilities'
import type { WslRuntimeDescriptor } from '@domain/runtime/descriptor'
import { wslNamespace } from '@domain/runtime/namespace'
import { makeHostPath, makeRuntimePath } from '@domain/runtime/path-types'
import { createVerifiedRunning, type VerifiedRunning } from '@domain/runtime/verified-running'
import type { WorkspaceFolder } from '@domain/workspace/folder'

import { evaluateLaunch } from './launch-gate'

const NOW = 1_000_000

function wslRuntime(
  distroName: string,
  state: 'running' | 'stopped' = 'running'
): WslRuntimeDescriptor {
  return {
    id: wslNamespace(distroName),
    kind: 'wsl',
    state,
    isDefault: false,
    capabilities: fixedCapabilities(NOW),
    detectedAt: NOW,
    distroName,
    wslVersion: 2,
    pathMapping: null
  }
}

function wslFolder(distroName: string, path: string): WorkspaceFolder {
  const rp = makeRuntimePath(wslNamespace(distroName), path)
  if (!rp.ok) throw new Error('fixture path invalid')
  return {
    id: `f-${distroName}`,
    location: { kind: 'wsl', distroName },
    path: rp.path,
    displayName: distroName,
    registeredAt: NOW
  }
}

function windowsFolder(path: string): WorkspaceFolder {
  const hp = makeHostPath(path)
  if (!hp.ok) throw new Error('fixture path invalid')
  return {
    id: 'f-win',
    location: { kind: 'windows' },
    path: hp.path,
    displayName: 'win',
    registeredAt: NOW
  }
}

function verifiedFor(distroName: string, at: number = NOW): VerifiedRunning {
  return createVerifiedRunning(wslNamespace(distroName), at)
}

describe('evaluateLaunch (BE-007 / SC-002 / H-09)', () => {
  it('実行中確認済み + 同一 distro の WSL フォルダは ok', () => {
    const result = evaluateLaunch({
      folder: wslFolder('Ubuntu', '/home/u/proj'),
      runtime: wslRuntime('Ubuntu'),
      verified: verifiedFor('Ubuntu'),
      now: NOW
    })
    expect(result.ok).toBe(true)
  })

  it('停止中 (verify で実行中を確認できない) は distro-not-running で拒否 (SC-002)', () => {
    // 実際に停止していれば verifyRunning は当該 distro を返さない → verified=null。
    const result = evaluateLaunch({
      folder: wslFolder('Ubuntu', '/home/u/proj'),
      runtime: wslRuntime('Ubuntu', 'stopped'),
      verified: null,
      now: NOW
    })
    expect(result).toEqual({ ok: false, reason: 'distro-not-running' })
  })

  it('**キャッシュが stopped でも verified があれば起動可** (実機の stale cache 不具合の回帰。quickstart V-1)', () => {
    // R-1 の descriptor.state が古く stopped でも、起動時の verifyRunning が running を確認していれば起動する。
    const result = evaluateLaunch({
      folder: wslFolder('Ubuntu', '/home/u/proj'),
      runtime: wslRuntime('Ubuntu', 'stopped'),
      verified: verifiedFor('Ubuntu'),
      now: NOW
    })
    expect(result.ok).toBe(true)
  })

  it('cache は running だが verify 失敗なら not-verified-running (再検出が要る)', () => {
    const result = evaluateLaunch({
      folder: wslFolder('Ubuntu', '/home/u/proj'),
      runtime: wslRuntime('Ubuntu', 'running'),
      verified: null,
      now: NOW
    })
    expect(result).toEqual({ ok: false, reason: 'not-verified-running' })
  })

  it('別 distro の verified 流用は not-verified-running で拒否', () => {
    const result = evaluateLaunch({
      folder: wslFolder('Ubuntu', '/home/u/proj'),
      runtime: wslRuntime('Ubuntu'),
      verified: verifiedFor('Debian'),
      now: NOW
    })
    expect(result).toEqual({ ok: false, reason: 'not-verified-running' })
  })

  it('期限切れの verified は not-verified-running で拒否', () => {
    const result = evaluateLaunch({
      folder: wslFolder('Ubuntu', '/home/u/proj'),
      runtime: wslRuntime('Ubuntu'),
      verified: verifiedFor('Ubuntu', NOW - 60_000),
      now: NOW
    })
    expect(result).toEqual({ ok: false, reason: 'not-verified-running' })
  })

  it('WSL フォルダの distro が選択ランタイムと不一致なら distro-mismatch (H-09)', () => {
    const result = evaluateLaunch({
      folder: wslFolder('Debian', '/home/u/proj'),
      runtime: wslRuntime('Ubuntu'),
      verified: verifiedFor('Ubuntu'),
      now: NOW
    })
    expect(result).toEqual({ ok: false, reason: 'distro-mismatch' })
  })

  it('Windows フォルダは越境として許可される (別 distro を騙らないため mismatch にしない)', () => {
    const result = evaluateLaunch({
      folder: windowsFolder('C:\\dev\\proj'),
      runtime: wslRuntime('Ubuntu'),
      verified: verifiedFor('Ubuntu'),
      now: NOW
    })
    expect(result.ok).toBe(true)
  })
})
