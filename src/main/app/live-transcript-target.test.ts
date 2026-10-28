import { describe, expect, it } from 'vitest'

import type { ProviderProfile } from '@domain/provider/types'
import type { RuntimeDescriptor } from '@domain/runtime/descriptor'
import { makeHostPath, type HostPath } from '@domain/runtime/path-types'
import type { CwdOrigin } from '@domain/session/origin'
import type { EnumerationTarget } from '@domain/session/target'
import { createWin32 } from '@domain/workspace/__fixtures__/runtime'
import type { Location } from '@domain/workspace/folder'

import {
  resolveLiveTranscriptTarget,
  type LiveTranscriptTargetDeps
} from './live-transcript-target'
import type { ConversationRecord } from './session-launch-service'

/** 稼働中の行の列挙対象の決め方の表 (021 data-model §8.1。resume-service から移した。BE-031)。 */

const NOW = 1_700_000_000_000
const HOST: Location = { kind: 'windows' }
const CONV = '22222222-2222-4222-8222-222222222222'

function hostPath(raw: string): HostPath {
  const r = makeHostPath(raw)
  if (!r.ok) throw new Error('前提')
  return r.path
}

const TARGET: EnumerationTarget = {
  key: 'host#0',
  location: HOST,
  configDir: hostPath('C:\\Users\\y\\.claude'),
  origin: 'default',
  label: 'y'
}
const ORIGIN: CwdOrigin = { kind: 'host', path: hostPath('C:\\dev\\x') }
const RUNTIMES: readonly RuntimeDescriptor[] = [createWin32(NOW)]

const rec = (over: Partial<ConversationRecord> = {}): ConversationRecord => ({
  conversationId: CONV,
  folderId: 'fh',
  runtimeId: 'host',
  providerId: null,
  targetKey: null,
  ...over
})

function deps(over: Partial<LiveTranscriptTargetDeps> = {}): LiveTranscriptTargetDeps {
  return {
    runtimes: () => RUNTIMES,
    enumerationTargets: () => [TARGET],
    pastResumeSource: (key, conv) =>
      key === 'host#0' && conv === CONV ? { target: TARGET, origin: ORIGIN } : null,
    providers: async () => [],
    ...over
  }
}

describe('resolveLiveTranscriptTarget', () => {
  it('(1) 列挙のキャッシュに会話の行がある対象を返す', async () => {
    expect(await resolveLiveTranscriptTarget(rec(), deps())).toBe('host#0')
  })

  it('(2) キャッシュに無ければ、既定の対象が所在に 1 つだけならそれ、2 つで null', async () => {
    const none = (): null => null
    expect(await resolveLiveTranscriptTarget(rec(), deps({ pastResumeSource: none }))).toBe(
      'host#0'
    )
    expect(
      await resolveLiveTranscriptTarget(
        rec(),
        deps({
          pastResumeSource: none,
          enumerationTargets: () => [TARGET, { ...TARGET, key: 'host#1' }]
        })
      )
    ).toBeNull()
  })

  it('(2) Provider の configDir が一致する対象を返す', async () => {
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
    const key = await resolveLiveTranscriptTarget(
      rec({ providerId: 'p1' }),
      deps({
        pastResumeSource: () => null,
        enumerationTargets: () => [TARGET, other],
        providers: async () => [p1]
      })
    )
    expect(key).toBe('host#1')
  })

  it('ランタイムが無い・所在の対象が無ければ null', async () => {
    expect(await resolveLiveTranscriptTarget(rec(), deps({ runtimes: () => [] }))).toBeNull()
    expect(
      await resolveLiveTranscriptTarget(rec(), deps({ enumerationTargets: () => [] }))
    ).toBeNull()
  })
})
