import type { MessagePortMain } from 'electron'
import { describe, expect, it } from 'vitest'

import {
  createTranscriptService,
  type TranscriptSpawn,
  type TranscriptSpawner,
  type TranscriptSpawnRequest,
  type TranscriptTargetResolution
} from './transcript-service'

/**
 * transcript 取得の調停 (R-3 / AD-034)。**プロセスを起こさずに検証する** —
 * spawner と resolveTarget を注入で差し替える (session-enumerator と同じ形)。
 *
 * 核心は **BE-027b の env レース回帰** (contracts C-2 / platform-boundary H-102):
 * 各要求が **自分の targetKey で解決した config ディレクトリ env で spawn される**こと。
 * env は spawn 時固定であり、共有可変 env を持たない (別ディストロ読みが構造的に起きない)。
 */

/** テスト用の launch 記録。 */
interface LaunchRecord {
  readonly env: Record<string, string>
  readonly request: TranscriptSpawnRequest
  killed: boolean
  exit: (() => void) | null
}

function fakeSpawner(): { spawner: TranscriptSpawner; launches: LaunchRecord[] } {
  const launches: LaunchRecord[] = []
  const spawner: TranscriptSpawner = {
    launch(env, request): TranscriptSpawn {
      const record: LaunchRecord = { env, request, killed: false, exit: null }
      launches.push(record)
      return {
        port: {} as unknown as MessagePortMain,
        kill(): boolean {
          record.killed = true
          return true
        },
        onExit(listener): void {
          record.exit = listener
        }
      }
    }
  }
  return { spawner, launches }
}

/** targetKey → 解決を map で与える簡易 resolveTarget。 */
function resolverOf(
  map: Record<string, TranscriptTargetResolution>
): (targetKey: string) => Promise<TranscriptTargetResolution> {
  return async (targetKey) => map[targetKey] ?? null
}

const buildEnv = (configDirEnv: string): Record<string, string> => ({
  CLAUDE_CONFIG_DIR: configDirEnv
})

describe('createTranscriptService', () => {
  it('未知の targetKey では取得プロセスを起こさず failed handshake を返す', async () => {
    const { spawner, launches } = fakeSpawner()
    const service = createTranscriptService({ spawner, resolveTarget: resolverOf({}), buildEnv })

    const result = await service.getTranscript(
      '11111111-1111-4111-8111-111111111111',
      'unknown',
      'tok'
    )

    expect(result.port).toBeNull()
    expect(result.handshake).toEqual({
      status: 'failed',
      requestToken: 'tok',
      reasonKey: 'enumeration-failed'
    })
    expect(launches).toHaveLength(0)
  })

  it('起動ゲート失敗 (distro-not-running) では起こさず理由つき failed を返す', async () => {
    const { spawner, launches } = fakeSpawner()
    const service = createTranscriptService({
      spawner,
      resolveTarget: resolverOf({ 'wsl:Ubuntu#0': { ok: false, reasonKey: 'distro-not-running' } }),
      buildEnv
    })

    const result = await service.getTranscript(
      '11111111-1111-4111-8111-111111111111',
      'wsl:Ubuntu#0',
      'tok'
    )

    expect(result.port).toBeNull()
    expect(result.handshake).toMatchObject({ status: 'failed', reasonKey: 'distro-not-running' })
    expect(launches).toHaveLength(0)
  })

  it('成功時は streaming handshake と port を返し、解決した config dir env で起こす', async () => {
    const { spawner, launches } = fakeSpawner()
    const service = createTranscriptService({
      spawner,
      resolveTarget: resolverOf({ 'host#0': { ok: true, configDirEnv: 'C:\\Users\\y\\.claude' } }),
      buildEnv
    })

    const result = await service.getTranscript(
      '11111111-1111-4111-8111-111111111111',
      'host#0',
      'tok'
    )

    expect(result.handshake).toEqual({ status: 'streaming', requestToken: 'tok' })
    expect(result.port).not.toBeNull()
    expect(launches).toHaveLength(1)
    expect(launches[0].env.CLAUDE_CONFIG_DIR).toBe('C:\\Users\\y\\.claude')
    expect(launches[0].request).toEqual({
      sessionId: '11111111-1111-4111-8111-111111111111',
      requestToken: 'tok'
    })
  })

  it('[BE-027b] env レース回帰: 各要求は自分の targetKey で解決した config dir env で起こされる', async () => {
    const { spawner, launches } = fakeSpawner()
    const service = createTranscriptService({
      spawner,
      resolveTarget: resolverOf({
        'wsl:Ubuntu#0': { ok: true, configDirEnv: '\\\\wsl.localhost\\Ubuntu\\home\\y\\.claude' },
        'wsl:Debian#0': { ok: true, configDirEnv: '\\\\wsl.localhost\\Debian\\home\\y\\.claude' }
      }),
      buildEnv,
      maxConcurrent: 4
    })

    await service.getTranscript('aaaaaaaa-1111-4111-8111-111111111111', 'wsl:Ubuntu#0', 't1')
    await service.getTranscript('bbbbbbbb-2222-4222-8222-222222222222', 'wsl:Debian#0', 't2')

    // 各 launch の CLAUDE_CONFIG_DIR が要求した所在の config dir と 1:1 で一致する
    // (共有可変 env なら踏み合って別ディストロを読む。ここが構造ガードの番人)。
    const ubuntu = launches.find((l) => l.request.requestToken === 't1')
    const debian = launches.find((l) => l.request.requestToken === 't2')
    expect(ubuntu?.env.CLAUDE_CONFIG_DIR).toBe('\\\\wsl.localhost\\Ubuntu\\home\\y\\.claude')
    expect(debian?.env.CLAUDE_CONFIG_DIR).toBe('\\\\wsl.localhost\\Debian\\home\\y\\.claude')
  })

  it('同時取得数の上限を超えたら最も古いプロセスを kill する (S-003)', async () => {
    const { spawner, launches } = fakeSpawner()
    const service = createTranscriptService({
      spawner,
      resolveTarget: resolverOf({ 'host#0': { ok: true, configDirEnv: 'C:\\a\\.claude' } }),
      buildEnv,
      maxConcurrent: 1
    })

    await service.getTranscript('11111111-1111-4111-8111-111111111111', 'host#0', 't1')
    await service.getTranscript('22222222-2222-4222-8222-222222222222', 'host#0', 't2')

    expect(launches).toHaveLength(2)
    expect(launches[0].killed).toBe(true) // 上限超過で最古を kill
    expect(launches[1].killed).toBe(false)
  })

  it('exit した取得プロセスは追跡から外れ、上限に数えられない', async () => {
    const { spawner, launches } = fakeSpawner()
    const service = createTranscriptService({
      spawner,
      resolveTarget: resolverOf({ 'host#0': { ok: true, configDirEnv: 'C:\\a\\.claude' } }),
      buildEnv,
      maxConcurrent: 1
    })

    await service.getTranscript('11111111-1111-4111-8111-111111111111', 'host#0', 't1')
    launches[0].exit?.() // 1 frame 返して自然終了
    await service.getTranscript('22222222-2222-4222-8222-222222222222', 'host#0', 't2')

    // t1 は既に exit しているので kill されない (上限に数えられない)
    expect(launches[0].killed).toBe(false)
  })

  it('dispose は in-flight のプロセスをすべて kill する', async () => {
    const { spawner, launches } = fakeSpawner()
    const service = createTranscriptService({
      spawner,
      resolveTarget: resolverOf({ 'host#0': { ok: true, configDirEnv: 'C:\\a\\.claude' } }),
      buildEnv,
      maxConcurrent: 4
    })

    await service.getTranscript('11111111-1111-4111-8111-111111111111', 'host#0', 't1')
    await service.getTranscript('22222222-2222-4222-8222-222222222222', 'host#0', 't2')
    const unconfirmed = service.dispose()

    expect(unconfirmed).toBe(0)
    expect(launches.every((l) => l.killed)).toBe(true)
  })
})
