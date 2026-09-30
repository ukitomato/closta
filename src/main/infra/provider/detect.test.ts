import { makeHostPath, type HostPath } from '@domain/runtime/path-types'
import { describe, expect, it } from 'vitest'

import { detectCandidates, parseAwsProfiles } from './detect'

const home = (() => {
  const r = makeHostPath('C:\\Users\\y')
  if (!r.ok) throw new Error('bad')
  return r.path as HostPath
})()

describe('parseAwsProfiles', () => {
  it('[profile X] と [default] を抽出する', () => {
    const content =
      '[default]\nregion=us-east-1\n\n[profile prod]\nregion=us-west-2\n[profile stg]\n'
    expect(parseAwsProfiles(content)).toEqual(['default', 'prod', 'stg'])
  })

  it('破損行はスキップして読める分を返す (SC-009)', () => {
    const content = '[profile ok]\n[[[garbage\nrandom text\n[profile ok2]\n'
    expect(parseAwsProfiles(content)).toEqual(['ok', 'ok2'])
  })

  it('重複プロファイルを dedup する', () => {
    expect(parseAwsProfiles('[profile a]\n[profile a]\n')).toEqual(['a'])
  })
})

describe('detectCandidates', () => {
  it('config dir 存在時に config-dir 候補を出す (host/.claude)', () => {
    const out = detectCandidates({
      home,
      configDirExists: true,
      awsConfigContent: null,
      credentialEnvNames: []
    })
    const c = out.find((x) => x.kind === 'config-dir')
    expect(c?.kind === 'config-dir' && c.configDirValue).toBe('C:\\Users\\y\\.claude')
    expect(c?.kind === 'config-dir' && c.namespace).toBe('host')
  })

  it('config dir 非存在時は config-dir 候補を出さない (自動登録しない・提示のみ)', () => {
    const out = detectCandidates({
      home,
      configDirExists: false,
      awsConfigContent: null,
      credentialEnvNames: []
    })
    expect(out.find((x) => x.kind === 'config-dir')).toBeUndefined()
  })

  it('aws profiles と env 候補を組み立てる。env 候補は変数名のみ (H-10)', () => {
    const out = detectCandidates({
      home,
      configDirExists: false,
      awsConfigContent: '[profile prod]\n',
      credentialEnvNames: ['ANTHROPIC_API_KEY']
    })
    expect(out.find((x) => x.kind === 'aws-profile' && x.profileName === 'prod')).toBeDefined()
    const env = out.find((x) => x.kind === 'env-passthrough')
    expect(env?.kind === 'env-passthrough' && env.varNames).toEqual(['ANTHROPIC_API_KEY'])
    // 値を運ばない: candidate に 'value' フィールドが無い。
    expect(env && Object.keys(env)).not.toContain('value')
  })

  it('破損 ~/.aws/config でも例外を投げず他候補を継続する (SC-009)', () => {
    const out = detectCandidates({
      home,
      configDirExists: true,
      awsConfigContent: '[[[broken',
      credentialEnvNames: []
    })
    // config-dir 候補は継続。aws-profile は 0。
    expect(out.find((x) => x.kind === 'config-dir')).toBeDefined()
    expect(out.filter((x) => x.kind === 'aws-profile')).toHaveLength(0)
  })
})
