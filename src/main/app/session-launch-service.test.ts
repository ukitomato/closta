import type { MessagePortMain } from 'electron'
import { describe, expect, it, vi } from 'vitest'

import type { LaunchInput, RuntimeLaunchSpec, SessionControl } from '@domain/session/agent-session'
import type { SessionLaunchConfig } from '@domain/session/launch-config'

import {
  createSessionLaunchService,
  type LaunchPreparation,
  type SessionSpawn,
  type SessionSpawner
} from './session-launch-service'

const fakePort = {} as unknown as MessagePortMain
const fakeInput = {} as unknown as LaunchInput
const fakeSpec = {} as unknown as RuntimeLaunchSpec

function cfg(folderId: string, runtimeId: string): SessionLaunchConfig {
  return {
    folderId,
    runtimeId,
    providerId: null,
    modelId: null,
    effort: null,
    permissionMode: 'default'
  }
}

/** 制御・kill・exit を記録する fake spawn。 */
function makeSpawn(sessionId: string): SessionSpawn & {
  emitExit: () => void
  controls: SessionControl[]
  killed: number
} {
  let exitListener: (() => void) | null = null
  const controls: SessionControl[] = []
  let killed = 0
  return {
    sessionId,
    port: fakePort,
    sendControl: (c) => controls.push(c),
    kill: () => {
      killed += 1
      exitListener?.()
      return true
    },
    onExit: (l) => {
      exitListener = l
    },
    emitExit: () => exitListener?.(),
    controls,
    get killed() {
      return killed
    }
  }
}

function okPrep(): LaunchPreparation {
  return { ok: true, input: fakeInput, spec: fakeSpec, env: { SystemRoot: 'C:\\Windows' } }
}

describe('createSessionLaunchService', () => {
  it('launch 成功で sessionId と port を返す', async () => {
    const spawn = makeSpawn('s1')
    const spawner: SessionSpawner = { launch: () => spawn }
    const service = createSessionLaunchService({
      spawner,
      prepareLaunch: async () => okPrep()
    })
    const outcome = await service.launch(cfg('f1', 'r1'))
    expect(outcome).toEqual({ status: 'launching', sessionId: 's1', port: fakePort })
  })

  it('単一セッション不変: 生存中は 2 回目の launch を session-active で拒否 (SC-011)', async () => {
    const spawner: SessionSpawner = { launch: () => makeSpawn('s1') }
    const service = createSessionLaunchService({ spawner, prepareLaunch: async () => okPrep() })
    await service.launch(cfg('f1', 'r1'))
    const second = await service.launch(cfg('f2', 'r2'))
    expect(second).toEqual({ status: 'rejected', reason: 'session-active' })
  })

  it('終了 (onExit) 後は再 launch できる (M-102)', async () => {
    const first = makeSpawn('s1')
    const second = makeSpawn('s2')
    let count = 0
    const spawner: SessionSpawner = {
      launch: () => (count++ === 0 ? first : second)
    }
    const service = createSessionLaunchService({ spawner, prepareLaunch: async () => okPrep() })
    await service.launch(cfg('f1', 'r1'))
    first.emitExit() // プロセス終了
    const again = await service.launch(cfg('f1', 'r1'))
    expect(again).toEqual({ status: 'launching', sessionId: 's2', port: fakePort })
  })

  it('prepareLaunch が失敗理由を返すと rejected', async () => {
    const spawner: SessionSpawner = { launch: () => makeSpawn('s1') }
    const service = createSessionLaunchService({
      spawner,
      prepareLaunch: async () => ({ ok: false, reason: 'distro-not-running' })
    })
    const outcome = await service.launch(cfg('f1', 'r1'))
    expect(outcome).toEqual({ status: 'rejected', reason: 'distro-not-running' })
  })

  it('未知の target (prep=null) は unknown-target で拒否', async () => {
    const launch = vi.fn(() => makeSpawn('s1'))
    const service = createSessionLaunchService({
      spawner: { launch },
      prepareLaunch: async () => null
    })
    const outcome = await service.launch(cfg('f1', 'r1'))
    expect(outcome).toEqual({ status: 'rejected', reason: 'unknown-target' })
    expect(launch).not.toHaveBeenCalled()
  })

  it('control は該当セッションへ送り、kill も agents へ sendControl で送る。未知 sessionId は false', async () => {
    const spawn = makeSpawn('s1')
    const service = createSessionLaunchService({
      spawner: { launch: () => spawn },
      prepareLaunch: async () => okPrep()
    })
    await service.launch(cfg('f1', 'r1'))

    expect(service.control('s1', { kind: 'send-prompt', text: 'hi' })).toBe(true)
    expect(service.control('s1', { kind: 'interrupt' })).toBe(true)
    // **kill も agents へ送る** — worker プロセスの kill だけでは孫 (wsl.exe) が孤児化する。
    // agents が SpawnedProcess を直接 kill する (AD-036 §3 / security H-001)。control は spawn.kill() を呼ばない。
    expect(service.control('s1', { kind: 'kill' })).toBe(true)
    expect(spawn.controls).toEqual([
      { kind: 'send-prompt', text: 'hi' },
      { kind: 'interrupt' },
      { kind: 'kill' }
    ])
    expect(spawn.killed).toBe(0) // control(kill) は worker プロセスを直接 kill しない
    expect(service.control('unknown', { kind: 'interrupt' })).toBe(false)
  })

  it('kill 後に worker が exit (onExit) すると registry が空き再 launch できる (ソフトロック解消。C-001)', async () => {
    const first = makeSpawn('s1')
    const second = makeSpawn('s2')
    let count = 0
    const service = createSessionLaunchService({
      spawner: { launch: () => (count++ === 0 ? first : second) },
      prepareLaunch: async () => okPrep()
    })
    await service.launch(cfg('f1', 'r1'))
    service.control('s1', { kind: 'kill' }) // agents へ kill 伝播
    first.emitExit() // agents が wsl.exe を kill して自 exit → onExit
    const again = await service.launch(cfg('f1', 'r1'))
    expect(again).toEqual({ status: 'launching', sessionId: 's2', port: fakePort })
  })

  it('dispose は全 in-flight に kill を伝播し worker プロセスも回収する (二段構成)', async () => {
    const spawn = makeSpawn('s1')
    const service = createSessionLaunchService({
      spawner: { launch: () => spawn },
      prepareLaunch: async () => okPrep()
    })
    await service.launch(cfg('f1', 'r1'))
    const unconfirmed = service.dispose()
    expect(unconfirmed).toBe(0)
    expect(spawn.controls).toContainEqual({ kind: 'kill' }) // 孫 kill を agents へ
    expect(spawn.killed).toBe(1) // worker プロセスの回収 (backstop)
  })
})
