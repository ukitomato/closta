import { describe, expect, it } from 'vitest'

import { PROTOCOL_VERSION, decodeResponse } from '@agents/protocol'
import { makeHostPath, makeRuntimePath } from '@domain/runtime/path-types'
import { wslNamespace } from '@domain/runtime/namespace'
import { buildSessionSummary } from '@domain/session/build'
import type { RawSessionRecord } from '@domain/session/interfaces'
import { enumerationTargetKey, type EnumerationTarget } from '@domain/session/target'
import { hasControlCharacter } from '@domain/validation'

import { toEnumerationOutcomeDTOs, toSessionSummaryDTO } from './dto-mapper'

/**
 * 境界を渡る文字列の性質 (pr-gate Round 4 / 不変条件 4 / FR-049 / SC-015)。
 *
 * ## なぜフィールドを列挙せずに走査するか
 *
 * Round 1〜3 のあいだ、「正規化を通っていないフィールド」が**毎ラウンド 1 つずつ**見つかった。
 *
 * | Round | 漏れていたフィールド |
 * |---|---|
 * | 1 | 作業ディレクトリの生値 (`cwd` / `cwdDisplay`) |
 * | 2 | `targetLabel` (C-001 の合意事項 ③ が未実施だった) |
 * | 3 | `sessionId` |
 *
 * いずれも**フィールド名を列挙したテスト**では見つからなかった。列挙する側が
 * 漏らしたフィールドは、テストも同じように漏らすためである。実際に見つけたのは
 * 毎回 reviewer で、6 track がかりだった回もある。
 *
 * **DTO を再帰的に走査して全文字列を見る。** あとから誰かがフィールドを足しても、
 * その値が関門を通っていなければここが落ちる。
 */

const NOW = 1_700_000_000_000
const RLO = String.fromCharCode(0x202e)
const NUL = String.fromCharCode(0)
const BEL = String.fromCharCode(7)

/** DTO から文字列を全部集める。**フィールド名を知らない。** */
function collectStrings(value: unknown, path = '$'): { path: string; value: string }[] {
  if (typeof value === 'string') return [{ path, value }]
  if (Array.isArray(value)) {
    return value.flatMap((item, i) => collectStrings(item, `${path}[${i}]`))
  }
  if (typeof value === 'object' && value !== null) {
    return Object.entries(value).flatMap(([key, item]) => collectStrings(item, `${path}.${key}`))
  }
  return []
}

function hostTarget(label: string): EnumerationTarget {
  const configDir = makeHostPath('C:\\Users\\y\\.claude')
  if (!configDir.ok) throw new Error('テストの前提が壊れている')
  return {
    key: enumerationTargetKey({ kind: 'windows' }, 0),
    location: { kind: 'windows' },
    configDir: configDir.path,
    origin: 'default',
    label
  }
}

function wslTarget(label: string): EnumerationTarget {
  const configDir = makeRuntimePath(wslNamespace('Ubuntu'), '/home/y/.claude')
  if (!configDir.ok) throw new Error('テストの前提が壊れている')
  const location = { kind: 'wsl', distroName: 'Ubuntu' } as const
  return {
    key: enumerationTargetKey(location, 0),
    location,
    configDir: configDir.path,
    origin: 'default',
    label
  }
}

/** 敵対的な値の素。**型の違う値も混ぜる** (`RawSessionRecord` は `unknown` を許す)。 */
const HOSTILE: readonly unknown[] = [
  'ok',
  `pre${RLO}post`,
  `${NUL}${BEL}`,
  'a'.repeat(5000),
  RLO.repeat(50),
  123,
  null,
  undefined,
  {},
  [],
  true
]

function recordWith(value: unknown): RawSessionRecord {
  return {
    sessionId: '11111111-2222-3333-4444-555555555555',
    summary: value,
    firstPrompt: value,
    customTitle: value,
    lastModified: NOW,
    createdAt: NOW,
    fileSize: 100,
    gitBranch: value,
    tag: value,
    cwd: value,
    programmatic: false
  }
}

describe('境界を渡る DTO の全文字列に制御文字が残らない (FR-049 / SC-015)', () => {
  it.each(HOSTILE.map((v) => [JSON.stringify(v) ?? String(v), v] as const))(
    'セッション行 — 会話由来の値が %s でも残らない',
    (_label, hostile) => {
      const dto = toSessionSummaryDTO(
        buildSessionSummary({
          record: recordWith(hostile),
          target: wslTarget('y'),
          detectedDistros: new Set(['Ubuntu'])
        })
      )

      const offenders = collectStrings(dto).filter((s) => hasControlCharacter(s.value))
      expect(offenders).toEqual([])
    }
  )

  it.each(HOSTILE.filter((v): v is string => typeof v === 'string'))(
    'セッション行 — 由来候補の表示名が %s でも残らない',
    (hostileLabel) => {
      const dto = toSessionSummaryDTO(
        buildSessionSummary({
          record: recordWith('ok'),
          target: wslTarget(hostileLabel),
          detectedDistros: new Set(['Ubuntu'])
        })
      )

      const offenders = collectStrings(dto).filter((s) => hasControlCharacter(s.value))
      expect(offenders).toEqual([])
    }
  )

  it.each(HOSTILE.filter((v): v is string => typeof v === 'string'))(
    '所在の行 — 表示名が %s でも残らない',
    (hostileLabel) => {
      const dtos = toEnumerationOutcomeDTOs({
        location: { kind: 'windows' },
        fetchedAt: NOW,
        outcomes: [
          {
            key: hostTarget(hostileLabel).key,
            location: { kind: 'windows' },
            label: hostileLabel,
            configDir: hostTarget(hostileLabel).configDir,
            status: 'ok',
            reasonKey: null,
            count: 1,
            truncated: false
          }
        ]
      })

      const offenders = collectStrings(dtos).filter((s) => hasControlCharacter(s.value))
      expect(offenders).toEqual([])
    }
  )

  /*
   * **識別子は倒せないので、境界の手前で間引く** (不変条件 4 / S3-005)。
   *
   * 他の項目と違い `sessionId` は `null` にできない — 行の同一性が消えるためである。
   * したがって `protocol.ts` が「識別子として使えない要素」を拒む。
   * ここでは**その規則が実際に効いていること**を、境界を渡る値の側から確かめる。
   */
  it.each([
    ['制御文字を含む', `id${RLO}x`],
    ['NUL を含む', `id${NUL}x`],
    ['長すぎる', 'a'.repeat(5000)]
  ])('識別子として使えない要素は境界に出ない (%s)', (_label, badId) => {
    const line = JSON.stringify({
      kind: 'ok',
      version: PROTOCOL_VERSION,
      id: 1,
      targetKey: 'host#0',
      sessions: [{ ...recordWith('ok'), sessionId: badId }, recordWith('ok')],
      truncated: false
    })

    const decoded = decodeResponse(line)
    expect(decoded.kind).toBe('response')
    const sessions =
      decoded.kind === 'response' && decoded.value.kind === 'ok' ? decoded.value.sessions : []

    /* **使える識別子の行だけが残る。** */
    expect(sessions).toHaveLength(1)

    const dtos = sessions.map((record) =>
      toSessionSummaryDTO(
        buildSessionSummary({
          record,
          target: wslTarget('y'),
          detectedDistros: new Set(['Ubuntu'])
        })
      )
    )
    expect(collectStrings(dtos).filter((s) => hasControlCharacter(s.value))).toEqual([])
  })

  it('走査がフィールドを実際に見ている (テスト自身の健全性)', () => {
    /*
     * **走査が空を返していないことを確かめる。** `collectStrings` が 0 件しか
     * 返さないなら、上の 3 つは何も検査していないのに緑になる。
     */
    const dto = toSessionSummaryDTO(
      buildSessionSummary({
        record: recordWith('ok'),
        target: wslTarget('alice'),
        detectedDistros: new Set(['Ubuntu'])
      })
    )

    const found = collectStrings(dto)
    expect(found.length).toBeGreaterThan(5)
    expect(found.map((s) => s.path)).toContain('$.targetLabel')
    expect(found.map((s) => s.path)).toContain('$.sessionId')
  })
})
