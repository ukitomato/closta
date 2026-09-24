import { describe, expect, it } from 'vitest'

import { hasControlCharacter } from '@domain/validation'

import { buildSessionSummary } from './build'
import type { RawSessionRecord } from './interfaces'
import { PATH_DISPLAY_MAX_BYTES } from './normalize'
import { enumerationTargetKey, type EnumerationTarget } from './target'

/**
 * BE-026c — 作業ディレクトリの正規化 (pr-gate Round 1 / C-001 / FR-049 / SC-015)。
 *
 * **security / architecture / platform-boundary の 3 reviewer が独立に到達した指摘である。**
 *
 * FR-049 は正規化対象に**作業ディレクトリの生値**を明記しているが、
 * 会話由来の 5 項目 (`summary` / `firstPrompt` / `customTitle` / `gitBranch` / `tag`) にしか
 * 配線されていなかった。そのために用意された `PATH_DISPLAY_MAX_BYTES` は
 * **定義 1 件・参照 0 件で死んでいた**。
 *
 * 脅威は `normalize.ts` 自身が書いている —
 * 「`cwdDisplay` に `U+202E` を仕込むと、『未登録フォルダ』の行が
 * 登録済みフォルダのパスに見える形に偽装でき、**FR-026 の登録導線で
 * 利用者に誤った判断をさせられる**」。
 *
 * 本 feature は `[USER]` 判断として **1 ディストロ内の全ユーザの `~/.claude` を読む**ので、
 * 「アプリ外のプロセスが書いた値」は**ホスト利用者以外が書ける値**を含む。
 */

const RLO = String.fromCharCode(0x202e)
const LRI = String.fromCharCode(0x2066)
const NUL = String.fromCharCode(0)

function target(): EnumerationTarget {
  return {
    key: enumerationTargetKey({ kind: 'windows' }, 0),
    location: { kind: 'windows' },
    configDir: { namespace: 'host', value: 'C:' + String.fromCharCode(92) + '.claude' } as never,
    origin: 'default',
    label: 'y'
  }
}

function record(cwd: string | null): RawSessionRecord {
  return {
    sessionId: 's-1',
    summary: '要約',
    firstPrompt: null,
    customTitle: null,
    lastModified: 1,
    createdAt: null,
    fileSize: null,
    gitBranch: null,
    tag: null,
    cwd,
    programmatic: false
  }
}

function build(cwd: string | null): ReturnType<typeof buildSessionSummary> {
  return buildSessionSummary({
    record: record(cwd),
    target: target(),
    detectedDistros: new Set(['Ubuntu'])
  })
}

describe('作業ディレクトリの正規化', () => {
  it('双方向制御文字を落とす (U+202E による行の偽装を防ぐ)', () => {
    const summary = build('/home/' + RLO + 'y/project')

    const shown = summary.origin.kind === 'host' ? '' : JSON.stringify(summary.origin)
    expect(shown).not.toContain(RLO)
    expect(JSON.stringify(summary)).not.toContain(RLO)
  })

  it.each([
    ['RLO (U+202E)', RLO],
    ['LRI (U+2066)', LRI],
    ['NUL', NUL]
  ])('除去したことを payload 上で示す (%s)', (_label, ch) => {
    const summary = build('/home/' + ch + 'y')

    /* FR-049: 切り詰め・除去が起きたことを payload 上で示さなければならない。 */
    expect(summary.normalized.controlCharsRemoved).toBe(true)
  })

  it('制御文字を含まない値では印を立てない', () => {
    expect(build('/home/y/project').normalized.controlCharsRemoved).toBe(false)
  })

  it('バイト長上限で切り詰め、印を立てる', () => {
    const long = '/home/' + 'a'.repeat(PATH_DISPLAY_MAX_BYTES + 100)

    const summary = build(long)

    expect(summary.normalized.truncated).toBe(true)
  })

  it('上限以内なら切り詰めない', () => {
    expect(build('/home/y').normalized.truncated).toBe(false)
  })

  it('`cwd` が無くても落ちない (印も立てない)', () => {
    const summary = build(null)

    expect(summary.origin.kind).toBe('absent')
    expect(summary.normalized.controlCharsRemoved).toBe(false)
    expect(summary.normalized.truncated).toBe(false)
  })
})

describe('登録・永続化の入口も双方向制御文字を拒む', () => {
  /*
   * **フィルタが 2 系統に分かれていた。**
   * `normalize.ts` の `isRemovable` は双方向制御文字を落とすが、
   * 登録と永続化の入口を守る `hasControlCharacter` は落としていなかった。
   * **弱い側がパスに当たっていた。**
   *
   * 一覧の表示値を正規化しても、FR-026 の登録導線から渡るのは `PathDTO` であり、
   * その `value` は `makeHostPath` / `makeRuntimePath` を通っただけの値である。
   * 入口を揃えないと**塞いだ穴の隣に同じ穴が開いたまま残る**。
   */
  it.each([
    ['RLO (U+202E)', RLO],
    ['LRM (U+200E)', String.fromCharCode(0x200e)],
    ['ALM (U+061C)', String.fromCharCode(0x061c)],
    ['LRI (U+2066)', LRI],
    ['PDI (U+2069)', String.fromCharCode(0x2069)]
  ])('拒否する (%s)', (_label, ch) => {
    expect(hasControlCharacter('C:' + String.fromCharCode(92) + 'work' + ch)).toBe(true)
  })

  it('従来の C0 / C1 / DEL も引き続き拒否する', () => {
    expect(hasControlCharacter('a' + NUL)).toBe(true)
    expect(hasControlCharacter('a' + String.fromCharCode(0x7f))).toBe(true)
    expect(hasControlCharacter('a' + String.fromCharCode(0x85))).toBe(true)
  })

  it('通常の文字列は通す', () => {
    expect(
      hasControlCharacter(
        'C:' + String.fromCharCode(92) + 'work' + String.fromCharCode(92) + 'プロジェクト'
      )
    ).toBe(false)
    expect(hasControlCharacter('/home/y/プロジェクト 🎉')).toBe(false)
  })
})
