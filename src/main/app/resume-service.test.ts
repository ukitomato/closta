import { describe, expect, it, vi, type Mock } from 'vitest'

import type { ProviderProfile } from '@domain/provider/types'
import type { RuntimeDescriptor } from '@domain/runtime/descriptor'
import { makeHostPath, type HostPath } from '@domain/runtime/path-types'
import type { CwdOrigin } from '@domain/session/origin'
import { DEFAULT_EXTRA_AXES, type SessionLaunchConfig } from '@domain/session/launch-config'
import type { EnumerationTarget } from '@domain/session/target'
import type { FolderRuntimeResolutionDTO } from '@domain/workspace/dto'
import { createWin32 } from '@domain/workspace/__fixtures__/runtime'
import type { Location, WorkspaceFolder } from '@domain/workspace/folder'

import { createResumeService, type ResumeService, type ResumeServiceDeps } from './resume-service'
import type { ConversationRecord, ResumeOutcome } from './session-launch-service'
import type { TranscriptResult } from './transcript-service'

/**
 * 再開の調停 (過去の行。X-9 / BE-012 / data-model §3.2・§4・§8.1)。I/O は注入の偽の関数で、呼ばれた回数を数える。
 */

const NOW = 1_700_000_000_000
const HOST: Location = { kind: 'windows' }
const CONV = '22222222-2222-4222-8222-222222222222'

function hostPath(raw: string): HostPath {
  const r = makeHostPath(raw)
  if (!r.ok) throw new Error('前提')
  return r.path
}

const RUNTIMES: readonly RuntimeDescriptor[] = [createWin32(NOW)]

const FOLDER: WorkspaceFolder = {
  id: 'fh',
  location: HOST,
  path: hostPath('C:\\dev\\x'),
  displayName: 'fh',
  registeredAt: NOW
}

const REACHABLE: FolderRuntimeResolutionDTO = {
  reachability: 'reachable',
  unreachableReason: null,
  blockedReason: null,
  resolutionSteps: [],
  boundary: 'native',
  runtimePath: { namespace: 'host', value: 'C:\\dev\\x' },
  recommendation: null
}

const TARGET: EnumerationTarget = {
  key: 'host#0',
  location: HOST,
  configDir: hostPath('C:\\Users\\y\\.claude'),
  origin: 'default',
  label: 'y'
}

const ORIGIN: CwdOrigin = { kind: 'host', path: hostPath('C:\\dev\\x') }

interface Setup {
  readonly service: ResumeService
  readonly pastResumeSource: Mock<ResumeServiceDeps['pastResumeSource']>
  readonly resolve: Mock<ResumeServiceDeps['resolve']>
  readonly launchResume: Mock<ResumeServiceDeps['launchResume']>
  readonly getTranscript: Mock<ResumeServiceDeps['getTranscript']>
}

function setup(over: Partial<ResumeServiceDeps> = {}): Setup {
  const pastResumeSource = vi.fn((targetKey: string, conversationId: string) =>
    targetKey === 'host#0' && conversationId === CONV ? { target: TARGET, origin: ORIGIN } : null
  )
  const resolve = vi.fn(() => REACHABLE)
  const launchResume = vi.fn(async (): Promise<ResumeOutcome> => ({
    status: 'already-running',
    sessionId: 'sid'
  }))
  const getTranscript = vi.fn(
    async (_c: string, _t: string, requestToken: string): Promise<TranscriptResult> => ({
      handshake: { status: 'empty', requestToken },
      port: null
    })
  )
  const service = createResumeService({
    pastResumeSource,
    folders: () => [FOLDER],
    runtimes: () => RUNTIMES,
    providers: async () => [],
    resolve,
    enumerationTargets: () => [TARGET],
    launchResume,
    conversationRecord: () => null,
    getTranscript,
    ...over
  })
  return { service, pastResumeSource, resolve, launchResume, getTranscript }
}

function config(over: Partial<SessionLaunchConfig> = {}): SessionLaunchConfig {
  return {
    folderId: 'fh',
    runtimeId: 'host',
    providerId: null,
    modelId: null,
    effort: null,
    permissionMode: 'default',
    ...DEFAULT_EXTRA_AXES,
    sessionName: null,
    ...over
  }
}

const PAST = { kind: 'past', targetKey: 'host#0', conversationId: CONV } as const

describe('resolvePast', () => {
  it('知らない行は source-unknown', async () => {
    expect(await setup().service.resolvePast('host#0', 'nope')).toEqual({
      ok: false,
      reason: 'source-unknown'
    })
  })

  it('決まる行は 3 つの id だけを返す (パス・config ディレクトリを含まない)', async () => {
    const r = await setup().service.resolvePast('host#0', CONV)
    expect(r).toEqual({ ok: true, folderId: 'fh', runtimeId: 'host', providerId: null })
    const text = JSON.stringify(r)
    expect(text).not.toContain('C:\\')
    expect(text).not.toContain('.claude')
  })

  it('決まらない行はその理由 (代表 4 行)', async () => {
    const noFolder = await setup({ folders: () => [] }).service.resolvePast('host#0', CONV)
    expect(noFolder).toEqual({ ok: false, reason: 'folder-unregistered' })
    const noRuntime = await setup({ runtimes: () => [] }).service.resolvePast('host#0', CONV)
    expect(noRuntime).toEqual({ ok: false, reason: 'runtime-missing' })
    const mismatch = await setup({
      pastResumeSource: () => ({
        target: TARGET,
        origin: { kind: 'wsl-from-unc' } as unknown as CwdOrigin
      })
    }).service.resolvePast('host#0', CONV)
    expect(mismatch).toEqual({ ok: false, reason: 'location-mismatch' })
    const under = await setup({
      pastResumeSource: () => ({
        target: TARGET,
        origin: { kind: 'host', path: hostPath('C:\\dev\\x\\sub') }
      })
    }).service.resolvePast('host#0', CONV)
    expect(under).toEqual({ ok: false, reason: 'cwd-mismatch' })
  })
})

describe('resolveResumeSource', () => {
  it('3 軸の一致で通り、会話の id と targetKey を返す', async () => {
    const { service } = setup()
    expect(await service.resolveResumeSource({ source: PAST, config: config() })).toEqual({
      ok: true,
      resolved: {
        conversationId: CONV,
        folderId: 'fh',
        runtimeId: 'host',
        providerId: null,
        targetKey: 'host#0'
      }
    })
  })

  it('フォルダ / ランタイム / Provider のどれか 1 つが違えば invalid-config (renderer の軸は使わない)', async () => {
    const { service } = setup()
    for (const over of [{ folderId: 'other' }, { runtimeId: 'wsl:X' }, { providerId: 'p1' }]) {
      expect(await service.resolveResumeSource({ source: PAST, config: config(over) })).toEqual({
        ok: false,
        reason: 'invalid-config'
      })
    }
  })

  it('source の解決が失敗したらその理由', async () => {
    const { service } = setup({ pastResumeSource: () => null })
    expect(await service.resolveResumeSource({ source: PAST, config: config() })).toEqual({
      ok: false,
      reason: 'source-unknown'
    })
  })
})

describe('resolveResumeSource (稼働中の行 / BE-020)', () => {
  const SID = '00000000-0000-4000-8000-000000000001'
  const LIVE = { kind: 'live', sessionId: SID } as const
  const rec = (over: Partial<ConversationRecord> = {}): ConversationRecord => ({
    conversationId: CONV,
    folderId: 'fh',
    runtimeId: 'host',
    providerId: null,
    targetKey: null,
    ...over
  })

  it('レコードが無い行は source-unknown', async () => {
    const { service } = setup()
    expect(await service.resolveResumeSource({ source: LIVE, config: config() })).toEqual({
      ok: false,
      reason: 'source-unknown'
    })
  })

  it('3 軸が 1 つでも違えば invalid-config', async () => {
    const { service } = setup({ conversationRecord: () => rec() })
    for (const over of [{ folderId: 'other' }, { runtimeId: 'wsl:X' }, { providerId: 'p1' }]) {
      expect(await service.resolveResumeSource({ source: LIVE, config: config(over) })).toEqual({
        ok: false,
        reason: 'invalid-config'
      })
    }
  })

  it('(1) 列挙のキャッシュに会話の行がある対象を読む対象にする。元の行を replacesSessionId で返す', async () => {
    const { service } = setup({ conversationRecord: () => rec() })
    expect(await service.resolveResumeSource({ source: LIVE, config: config() })).toEqual({
      ok: true,
      resolved: {
        conversationId: CONV,
        folderId: 'fh',
        runtimeId: 'host',
        providerId: null,
        targetKey: 'host#0',
        replacesSessionId: SID
      }
    })
  })

  it('(2) キャッシュに無ければ、既定の対象がその所在に 1 つだけならそれ。2 つで決まらない', async () => {
    const none = (): null => null
    const one = setup({ conversationRecord: () => rec(), pastResumeSource: none })
    const r1 = await one.service.resolveResumeSource({ source: LIVE, config: config() })
    expect(r1.ok && r1.resolved.targetKey).toBe('host#0')

    const two = setup({
      conversationRecord: () => rec(),
      pastResumeSource: none,
      enumerationTargets: () => [TARGET, { ...TARGET, key: 'host#1' }]
    })
    const r2 = await two.service.resolveResumeSource({ source: LIVE, config: config() })
    expect(r2.ok && r2.resolved.targetKey).toBeNull()
  })

  it('(2) Provider の configDir が一致する対象を読む対象にする', async () => {
    const other: EnumerationTarget = {
      ...TARGET,
      key: 'host#1',
      configDir: hostPath('C:\\Users\\y\\.claude-p1'),
      origin: 'config-dir' as EnumerationTarget['origin']
    }
    const p1 = {
      id: 'p1',
      displayName: 'p1',
      backend: 'anthropic',
      configDir: hostPath('C:\\Users\\y\\.claude-p1'),
      credential: { source: 'config-dir' },
      models: { models: [] }
    } as unknown as ProviderProfile
    const s = setup({
      conversationRecord: () => rec({ providerId: 'p1' }),
      pastResumeSource: () => null,
      enumerationTargets: () => [TARGET, other],
      providers: async () => [p1]
    })
    const r = await s.service.resolveResumeSource({
      source: LIVE,
      config: config({ providerId: 'p1' })
    })
    expect(r.ok && r.resolved.targetKey).toBe('host#1')
  })

  it('ランタイムの所在の対象が無ければ targetKey は null', async () => {
    const s = setup({ conversationRecord: () => rec(), enumerationTargets: () => [] })
    const r = await s.service.resolveResumeSource({ source: LIVE, config: config() })
    expect(r.ok && r.resolved.targetKey).toBeNull()
  })

  it('再開した行をさらに再開すると targetKey が引き継がれる (決め直さない)', async () => {
    const s = setup({
      conversationRecord: () => rec({ targetKey: 'carried#9' }),
      enumerationTargets: () => []
    })
    const r = await s.service.resolveResumeSource({ source: LIVE, config: config() })
    expect(r.ok && r.resolved.targetKey).toBe('carried#9')
  })
})

describe('resume / getResumedTranscript', () => {
  const record = {
    conversationId: CONV,
    folderId: 'fh',
    runtimeId: 'host',
    providerId: null,
    targetKey: 'host#0'
  }

  it('解けたら launchResume に config と解いた値を渡し、解けなければ起動しない', async () => {
    const ok = setup()
    await ok.service.resume({ source: PAST, config: config() })
    expect(ok.launchResume).toHaveBeenCalledTimes(1)
    const bad = setup({ pastResumeSource: () => null })
    expect(await bad.service.resume({ source: PAST, config: config() })).toEqual({
      status: 'rejected',
      reason: 'source-unknown'
    })
    expect(bad.launchResume).not.toHaveBeenCalled()
  })

  it('Auto の確認の印 (ack) をそのまま launchResume の 3 つ目に渡す (026)', async () => {
    const s = setup()
    await s.service.resume({ source: PAST, config: config() }, true)
    await s.service.resume({ source: PAST, config: config() })
    expect(s.launchResume.mock.calls[0]?.[2]).toBe(true)
    expect(s.launchResume.mock.calls[1]?.[2]).toBeUndefined()
  })

  it('引き継ぐ軸が消えて起動ゲートが拒否したら、その理由だけを返す (稼働中 / 過去。別の軸の候補を含めない。FR-008)', async () => {
    for (const reason of [
      'unknown-target',
      'provider-unavailable',
      'distro-not-running',
      'claude-not-found'
    ] as const) {
      const launchResume = vi.fn(async (): Promise<ResumeOutcome> => ({
        status: 'rejected',
        reason
      }))
      const live = setup({ conversationRecord: () => record, launchResume })
      const SID = '00000000-0000-4000-8000-000000000001'
      expect(
        await live.service.resume({ source: { kind: 'live', sessionId: SID }, config: config() })
      ).toEqual({ status: 'rejected', reason })
      const past = setup({ launchResume })
      expect(await past.service.resume({ source: PAST, config: config() })).toEqual({
        status: 'rejected',
        reason
      })
    }
  })

  it('それまでの会話は record の会話の id と targetKey で今の取得を呼ぶ', async () => {
    const s = setup({ conversationRecord: () => record })
    await s.service.getResumedTranscript('sid', 'tok')
    expect(s.getTranscript).toHaveBeenCalledWith(CONV, 'host#0', 'tok')
  })

  it('知らない行・対象が決まらない行は transcript-read-failed (取得を呼ばない)', async () => {
    const unknown = setup()
    const a = await unknown.service.getResumedTranscript('sid', 'tok')
    expect(a.handshake).toEqual({
      status: 'failed',
      requestToken: 'tok',
      reasonKey: 'transcript-read-failed'
    })
    const noTarget = setup({ conversationRecord: () => ({ ...record, targetKey: null }) })
    const b = await noTarget.service.getResumedTranscript('sid', 'tok')
    expect(b.handshake.status).toBe('failed')
    expect(unknown.getTranscript).not.toHaveBeenCalled()
    expect(noTarget.getTranscript).not.toHaveBeenCalled()
  })
})

describe('resumedTranscriptTarget', () => {
  it('過去の行は record.targetKey', () => {
    const { service } = setup()
    const record = {
      conversationId: CONV,
      folderId: 'fh',
      runtimeId: 'host',
      providerId: null,
      targetKey: 'host#0'
    }
    expect(service.resumedTranscriptTarget(record)).toBe('host#0')
    expect(service.resumedTranscriptTarget({ ...record, targetKey: null })).toBeNull()
  })
})
