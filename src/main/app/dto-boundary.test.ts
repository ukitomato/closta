import { describe, expect, it } from 'vitest'

import { PROTOCOL_VERSION, decodeResponse } from '@agents/protocol'
import { makeHostPath, makeRuntimePath } from '@domain/runtime/path-types'
import { wslNamespace } from '@domain/runtime/namespace'
import { buildSessionSummary } from '@domain/session/build'
import { SESSION_GROUP_DTO_FIELDS } from '@domain/session/dto'
import type { SessionGroup } from '@domain/session/group'
import type { RawSessionRecord } from '@domain/session/interfaces'
import { cwdKeyOf } from '@domain/session/match'
import { enumerationTargetKey, type EnumerationTarget } from '@domain/session/target'
import { hasControlCharacter } from '@domain/validation'

import { toEnumerationOutcomeDTOs, toSessionGroupDTO, toSessionSummaryDTO } from './dto-mapper'

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
 *
 * ## 覆っている写像を実名で書く (pr-gate Round 4 / A4-007)
 *
 * このファイルは初版で「フィールド名を知らないので漏れない」と主張していたが、
 * **`dto-mapper` の 3 つの写像のうち `toSessionGroupDTO` を呼んでいなかった**。
 * そしてその未走査の経路が `cwdKey` を素通しで載せ、`cwdKeyOf` は
 * **構造上必ず U+0000 を含む値**を返していた。
 * つまり「もう漏れない」という主張そのものが偽だった。
 *
 * **走査は自分が何を呼んでいるかを知らない。** だから覆っている範囲は
 * 人間が書くしかない。現在覆っているのは次の 3 つで、これが `dto-mapper` の
 * R-2 用 export の全部である。
 *
 * | 写像 | 走査 |
 * |---|---|
 * | `toSessionSummaryDTO` | ○ |
 * | `toSessionGroupDTO` (4 variant すべて) | ○ |
 * | `toEnumerationOutcomeDTOs` | ○ |
 *
 * **4 つ目を足したらここに行を足す。** 足し忘れを機械で捕まえる手段は無い。
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

  /*
   * **グループの 4 variant** (pr-gate Round 4 / A4-007)。
   *
   * `unregistered` が `cwdKey` を運ぶ。以前はこの経路が無走査で、
   * `cwdKeyOf` が返す U+0000 入りの値が境界を渡っていた。
   */
  it.each(['folder', 'pending', 'unregistered', 'unknown'] as const)(
    'グループ (%s) の全文字列に制御文字が残らない',
    (kind) => {
      const session = buildSessionSummary({
        record: recordWith(`pre${RLO}post`),
        target: wslTarget(`lbl${NUL}x`),
        detectedDistros: new Set(['Ubuntu'])
      })
      const cwd = makeRuntimePath(wslNamespace('Ubuntu'), '/home/alice/p')
      if (!cwd.ok) throw new Error('テストの前提が壊れている')

      const group: SessionGroup =
        kind === 'folder'
          ? {
              kind: 'folder',
              folderId: 'f1',
              boundary: 'cross',
              sessions: [session],
              boundaryOf: new Map()
            }
          : kind === 'pending'
            ? {
                kind: 'pending',
                location: { kind: 'wsl', distroName: 'Ubuntu' },
                reasonKey: 'distro-not-running',
                sessions: [session]
              }
            : kind === 'unregistered'
              ? {
                  kind: 'unregistered',
                  /* **実際の生成関数を通す。** 手書きの鍵だと欠陥を再現しない。 */
                  cwdKey: cwdKeyOf(wslNamespace('Ubuntu'), '/home/alice/p'),
                  cwd: cwd.path,
                  cwdDisplay: `disp${BEL}lay`,
                  location: { kind: 'wsl', distroName: 'Ubuntu' },
                  sessions: [session]
                }
              : { kind: 'unknown', reasonKey: 'cwd-absent', sessions: [session] }

      const dto = toSessionGroupDTO(group)

      const offenders = collectStrings(dto).filter((s) => hasControlCharacter(s.value))
      expect(offenders).toEqual([])
    }
  )

  it('グループの各 variant のフィールドが許可リストと一致する (SC-011)', () => {
    /*
     * **項目が増えたら落ちる形にする。** 表示用の生値を運ぶフィールドが
     * 増えたことに誰も気づかない、という経路をここで塞ぐ。
     */
    const session = buildSessionSummary({
      record: recordWith('ok'),
      target: wslTarget('alice'),
      detectedDistros: new Set(['Ubuntu'])
    })
    const cwd = makeRuntimePath(wslNamespace('Ubuntu'), '/home/alice/p')
    if (!cwd.ok) throw new Error('テストの前提が壊れている')

    const groups: readonly SessionGroup[] = [
      {
        kind: 'folder',
        folderId: 'f1',
        boundary: 'native',
        sessions: [session],
        boundaryOf: new Map()
      },
      {
        kind: 'pending',
        location: { kind: 'windows' },
        reasonKey: 'probe-failed',
        sessions: [session]
      },
      {
        kind: 'unregistered',
        cwdKey: cwdKeyOf(wslNamespace('Ubuntu'), '/home/alice/p'),
        cwd: cwd.path,
        cwdDisplay: '/home/alice/p',
        location: { kind: 'wsl', distroName: 'Ubuntu' },
        sessions: [session]
      },
      { kind: 'unknown', reasonKey: 'location-unknown', sessions: [session] }
    ]

    /* 4 variant すべてを見ている (1 つ書き忘れたら落ちる)。 */
    expect(groups.map((g) => g.kind).sort()).toEqual(Object.keys(SESSION_GROUP_DTO_FIELDS).sort())

    for (const group of groups) {
      const dto = toSessionGroupDTO(group)
      expect(Object.keys(dto).sort()).toEqual([...SESSION_GROUP_DTO_FIELDS[dto.kind]].sort())
    }
  })

  it('セッション行の作業ディレクトリ表示値も関門を通る', () => {
    /*
     * `build.ts` は `classifyCwd` の**前**に正規化するので、通常の経路では
     * ここに制御文字は来ない。だが `SessionSummary` は `domain` の型であり
     * **「正規化済みである」という保証を型が持たない** —
     * `targetLabel` でまったく同じ前提が崩れたのが不変条件 4 の出発点だった。
     *
     * 出自を直接差し替えて、関門が実在することを確かめる (変異 I で発火を確認した)。
     */
    const built = buildSessionSummary({
      record: recordWith('ok'),
      target: wslTarget('alice'),
      detectedDistros: new Set(['Ubuntu'])
    })
    const dto = toSessionSummaryDTO({
      ...built,
      origin: { kind: 'unknown-location', display: `d${NUL}i${RLO}r` }
    })

    expect(collectStrings(dto).filter((s) => hasControlCharacter(s.value))).toEqual([])
  })

  it('作業ディレクトリの予算は表示名の予算より大きい (末尾を落とさない)', () => {
    /*
     * **パスに `TEXT_MAX_BYTES` (512) を当てない** (pr-gate Round 4 / PB4-013)。
     * 切ると表示値として意味を失うだけでなく、末尾が一意性を担っている場合
     * (`disambiguate` の序数接尾辞など) に**境界の向こうで再び衝突する**。
     *
     * 512 と 1024 のあいだの長さで、切られていないことを固定する
     * (変異 L で発火を確認した)。
     */
    const long = `/home/alice/${'p'.repeat(600)}`
    const built = buildSessionSummary({
      record: recordWith('ok'),
      target: wslTarget('alice'),
      detectedDistros: new Set(['Ubuntu'])
    })
    const dto = toSessionSummaryDTO({
      ...built,
      origin: { kind: 'unknown-location', display: long }
    })

    expect(dto.cwdDisplay).toBe(long)
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
