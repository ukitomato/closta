import { uncNamespace } from '@domain/runtime/namespace'
import { makeWslUncPath } from '@domain/runtime/path-types'
import { describe, expect, it } from 'vitest'

import { normalizeDetectedCandidates } from './detect'
import type { DetectedCandidate, ProviderProfile } from './types'

const uncNs = uncNamespace('Ubuntu')
const uncPath = (() => {
  const r = makeWslUncPath(uncNs, '\\\\wsl.localhost\\Ubuntu\\home\\y\\.claude')
  if (!r.ok) throw new Error('bad')
  return r.path
})()

const registered: ProviderProfile[] = [
  {
    id: 'r1',
    displayName: 'Reg config',
    backend: 'anthropic',
    configDir: uncPath,
    credential: { source: 'config-dir' },
    models: { models: [] }
  },
  {
    id: 'r2',
    displayName: 'Reg aws',
    backend: 'bedrock',
    credential: { source: 'aws-profile', profileName: 'prod' },
    models: { models: [] }
  }
]

describe('normalizeDetectedCandidates', () => {
  it('登録済みと一致する候補に alreadyRegistered を立てる (二重登録を促さない)', () => {
    const candidates: DetectedCandidate[] = [
      {
        kind: 'config-dir',
        displayLabel: 'Ubuntu ~/.claude',
        configDirValue: uncPath.value,
        namespace: uncNs,
        alreadyRegistered: false
      },
      { kind: 'aws-profile', displayLabel: 'prod', profileName: 'prod', alreadyRegistered: false },
      {
        kind: 'aws-profile',
        displayLabel: 'staging',
        profileName: 'staging',
        alreadyRegistered: false
      }
    ]
    const out = normalizeDetectedCandidates(candidates, registered)
    expect(out.find((c) => c.kind === 'config-dir')?.alreadyRegistered).toBe(true)
    expect(
      out.find((c) => c.kind === 'aws-profile' && c.profileName === 'prod')?.alreadyRegistered
    ).toBe(true)
    expect(
      out.find((c) => c.kind === 'aws-profile' && c.profileName === 'staging')?.alreadyRegistered
    ).toBe(false)
  })

  it('同一候補を dedup する', () => {
    const dup: DetectedCandidate = {
      kind: 'aws-profile',
      displayLabel: 'x',
      profileName: 'x',
      alreadyRegistered: false
    }
    const out = normalizeDetectedCandidates([dup, { ...dup }], [])
    expect(out).toHaveLength(1)
  })

  it('env-passthrough 候補は変数名のみを持ち値を持たない (H-10)', () => {
    const c: DetectedCandidate = {
      kind: 'env-passthrough',
      displayLabel: 'env',
      varNames: ['ANTHROPIC_BASE_URL'],
      alreadyRegistered: false
    }
    const out = normalizeDetectedCandidates([c], [])
    // 型として value フィールドが存在しない (コンパイル時保証)。実行時も varNames のみ。
    expect(Object.keys(out[0])).not.toContain('value')
    expect(out[0].kind === 'env-passthrough' && out[0].varNames).toEqual(['ANTHROPIC_BASE_URL'])
  })
})
