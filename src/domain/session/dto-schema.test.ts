import { describe, expect, it } from 'vitest'

import {
  ENUMERATION_OUTCOME_DTO_FIELDS,
  SESSION_SUMMARY_DTO_FIELDS,
  type EnumerationOutcomeDTO,
  type SessionSummaryDTO
} from './dto'

/**
 * DTO のフィールド集合が**許可リストと完全一致**することを固定する (BE-016c / SC-011)。
 *
 * **項目が増えたら落ちる形にする。** FR-044 の実効性は「payload に何が載るか」で決まり、
 * 型だけでは実行時に増えた項目を止められない。
 *
 * あわせて、**表示用の生値を運ぶフィールドが `cwdDisplay` の 1 種類だけ**であることを
 * 固定する — `rawCwd` のような名前で UNC 形式を境界に出す穴を作らないため (FR-042 / C-007)。
 */

/** 実装が返す形の代表例。**リストと 1 対 1 でなければ落ちる。** */
const sessionSample: SessionSummaryDTO = {
  sessionId: '97937955-0000-4000-8000-000000000000',
  targetKey: 'wsl:Ubuntu#0',
  targetLabel: 'y',
  summary: 'NDB 10本を E2E 書き直し',
  firstPrompt: null,
  customTitle: null,
  lastModified: 1_700_000_000_000,
  createdAt: null,
  fileSize: 25_767_786,
  gitBranch: 'HEAD',
  tag: null,
  cwd: { namespace: 'wsl:Ubuntu', value: '/home/y/p' },
  cwdDisplay: null,
  originKind: 'wsl-inherited',
  programmatic: false,
  worktree: false,
  normalized: { truncated: false, controlCharsRemoved: false }
}

const outcomeSample: EnumerationOutcomeDTO = {
  location: { kind: 'wsl', distroName: 'Ubuntu' },
  targetKey: 'wsl:Ubuntu#0',
  targetLabel: 'y',
  status: 'ok',
  reasonKey: null,
  count: 269,
  truncated: false,
  fetchedAt: 1_700_000_000_000
}

describe('SessionSummaryDTO', () => {
  it('フィールド集合が許可リストと完全一致する', () => {
    expect(Object.keys(sessionSample).sort()).toEqual([...SESSION_SUMMARY_DTO_FIELDS].sort())
  })

  it('**transcript の本文に相当する項目を持たない** (FR-044)', () => {
    const forbidden = ['messages', 'transcript', 'body', 'content', 'text', 'toolOutput']
    for (const key of forbidden) {
      expect(SESSION_SUMMARY_DTO_FIELDS as readonly string[]).not.toContain(key)
    }
  })

  it('**`rawCwd` という名前を持たない** (FR-042 / C-007)', () => {
    expect(SESSION_SUMMARY_DTO_FIELDS as readonly string[]).not.toContain('rawCwd')
  })

  it('表示用の生値を運ぶフィールドは `cwdDisplay` の 1 種類だけである', () => {
    const rawish = (SESSION_SUMMARY_DTO_FIELDS as readonly string[]).filter(
      (key) => key.toLowerCase().includes('raw') || key.toLowerCase().includes('display')
    )
    expect(rawish).toEqual(['cwdDisplay'])
  })

  it('所在が決まらない出自では `cwd` が null になり `cwdDisplay` が立つ', () => {
    const unknownLocation: SessionSummaryDTO = {
      ...sessionSample,
      cwd: null,
      cwdDisplay: '/home/y/p',
      originKind: 'unknown-location'
    }
    expect(unknownLocation.cwd).toBeNull()
    expect(unknownLocation.cwdDisplay).not.toBeNull()
    // **UNC 接頭辞を含まない** (FR-042)。
    expect(unknownLocation.cwdDisplay).not.toContain('wsl.localhost')
  })
})

describe('EnumerationOutcomeDTO', () => {
  it('フィールド集合が許可リストと完全一致する', () => {
    expect(Object.keys(outcomeSample).sort()).toEqual([...ENUMERATION_OUTCOME_DTO_FIELDS].sort())
  })

  it('**config ディレクトリの実体パスを持たない** (FR-042)', () => {
    const forbidden = ['configDir', 'path', 'home', 'uncPath']
    for (const key of forbidden) {
      expect(ENUMERATION_OUTCOME_DTO_FIELDS as readonly string[]).not.toContain(key)
    }
  })

  it('停止中の所在も `targetKey` を持つ行として表せる (SC-002 / SC-010 の経路)', () => {
    const stopped: EnumerationOutcomeDTO = {
      ...outcomeSample,
      status: 'failed',
      reasonKey: 'distro-not-running',
      count: 0
    }
    expect(stopped.targetKey).not.toBe('')
  })

  it('履歴なしは失敗と区別できる (FR-012)', () => {
    const noHistory: EnumerationOutcomeDTO = {
      ...outcomeSample,
      status: 'no-history',
      reasonKey: null,
      count: 0
    }
    expect(noHistory.status).toBe('no-history')
    expect(noHistory.reasonKey).toBeNull()
  })
})
