import { describe, expect, it } from 'vitest'

import { applyEntry, findLongestMatch } from '@domain/workspace/prefix-match'

import { wslNamespace, uncNamespace } from './namespace'
import { compose, makePathMapping, type PathMapping } from './path-mapping'
import { hostPathOps, runtimePathOps } from './path-api'
import {
  makeHostPath,
  makeRuntimePath,
  makeWslUncPath,
  type HostPath,
  type RuntimePath
} from './path-types'

/**
 * パス変換の性質テスト (BE-050 / SC-001 の 12 ケース)。
 *
 * **モックゼロ。** 値を渡して戻り値を見るだけで足りる。
 */

const UBUNTU = wslNamespace('Ubuntu-26.04')
const DEBIAN = wslNamespace('Debian')
const NOW = 1_700_000_000_000

function mapping(
  entries: readonly { fromPrefix: string; toPrefix: string }[],
  to = UBUNTU
): PathMapping {
  const result = makePathMapping('host', to, entries, NOW)
  if (!result.ok) throw new Error(`テストの前提が壊れている: ${result.reason}`)
  return result.mapping
}

/** 逆向き (`wsl:<D> → host`)。`toHost` はこの向きを要求する。 */
function reverse(m: PathMapping): PathMapping {
  return {
    from: m.to,
    to: m.from,
    entries: m.entries.map((e) => ({ fromPrefix: e.toPrefix, toPrefix: e.fromPrefix })),
    acquiredAt: m.acquiredAt
  }
}

const DEFAULT = mapping([{ fromPrefix: 'C:\\', toPrefix: '/mnt/c' }])

function host(raw: string): HostPath {
  const p = makeHostPath(raw)
  if (!p.ok) throw new Error(`テストの前提が壊れている: ${raw}`)
  return p.path
}

function wsl(raw: string, ns = UBUNTU): RuntimePath {
  const p = makeRuntimePath(ns, raw)
  if (!p.ok) throw new Error(`テストの前提が壊れている: ${raw}`)
  return p.path
}

describe('1. 往復不変 (host → wsl → host)', () => {
  it('変換して戻すと元に一致する', () => {
    const original = makeHostPath('C:\\dev\\closta')
    expect(original.ok).toBe(true)
    if (!original.ok) return

    const toWsl = runtimePathOps.fromHost(original.path, DEFAULT)
    expect(toWsl.ok).toBe(true)
    if (!toWsl.ok) return
    expect(toWsl.path.value).toBe('/mnt/c/dev/closta')

    const back = runtimePathOps.toHost(toWsl.path, reverse(DEFAULT))
    expect(back.ok).toBe(true)
    if (!back.ok) return
    expect(back.path.value).toBe(original.path.value)
  })
})

describe('2. UNC 往復', () => {
  it('UNC に変換して戻すと元に一致する', () => {
    const original = makeRuntimePath(UBUNTU, '/home/u/repo')
    expect(original.ok).toBe(true)
    if (!original.ok) return

    const unc = runtimePathOps.toUnc(original.path)
    expect(unc.ok).toBe(true)
    if (!unc.ok) return
    expect(unc.path.value).toBe('\\\\wsl.localhost\\Ubuntu-26.04\\home\\u\\repo')
    expect(unc.path.namespace).toBe(uncNamespace('Ubuntu-26.04'))

    const back = runtimePathOps.fromUnc(unc.path)
    expect(back.ok).toBe(true)
    if (!back.ok) return
    expect(back.path.value).toBe('/home/u/repo')
    expect(back.path.namespace).toBe(UBUNTU)
  })

  it('ルートも往復する', () => {
    const root = makeRuntimePath(UBUNTU, '/')
    if (!root.ok) throw new Error('前提')
    const unc = runtimePathOps.toUnc(root.path)
    if (!unc.ok) throw new Error('前提')
    const back = runtimePathOps.fromUnc(unc.path)
    expect(back.ok).toBe(true)
    if (!back.ok) return
    expect(back.path.value).toBe('/')
  })
})

describe('3. ドライブレターの大小非依存', () => {
  it('小文字のドライブでも同じ結果になる', () => {
    const lower = makeHostPath('c:\\dev\\x')
    const upper = makeHostPath('C:\\dev\\x')
    if (!lower.ok || !upper.ok) throw new Error('前提')

    const a = runtimePathOps.fromHost(lower.path, DEFAULT)
    const b = runtimePathOps.fromHost(upper.path, DEFAULT)
    expect(a.ok && b.ok && a.path.value === b.path.value).toBe(true)
  })
})

describe('4. 末尾セパレータ非依存', () => {
  it('末尾の `\\` があっても同じ結果になる', () => {
    const withSep = makeHostPath('C:\\dev\\x\\')
    const without = makeHostPath('C:\\dev\\x')
    if (!withSep.ok || !without.ok) throw new Error('前提')

    const a = runtimePathOps.fromHost(withSep.path, DEFAULT)
    const b = runtimePathOps.fromHost(without.path, DEFAULT)
    expect(a.ok && b.ok && a.path.value === b.path.value).toBe(true)
  })
})

describe('5. 非既定のマウント位置', () => {
  it('`/windows/c` でも変換できる (位置を決め打ちしない)', () => {
    const custom = mapping([{ fromPrefix: 'C:\\', toPrefix: '/windows/c' }])
    const original = makeHostPath('C:\\dev\\x')
    if (!original.ok) throw new Error('前提')

    const converted = runtimePathOps.fromHost(original.path, custom)
    expect(converted.ok).toBe(true)
    if (!converted.ok) return
    expect(converted.path.value).toBe('/windows/c/dev/x')
  })
})

describe('6. マッピングに無い接頭辞で変換不能', () => {
  it('未マウントのドライブは `not-mapped` を返す (推測で対応を作らない)', () => {
    const original = makeHostPath('Z:\\share\\x')
    if (!original.ok) throw new Error('前提')

    const converted = runtimePathOps.fromHost(original.path, DEFAULT)
    expect(converted).toEqual({ ok: false, reason: 'not-mapped' })
  })
})

describe('7. 接頭辞が互いに前方一致するマウント位置の共存', () => {
  const both = mapping([
    { fromPrefix: 'C:\\', toPrefix: '/mnt/c' },
    { fromPrefix: 'D:\\', toPrefix: '/mnt/cdrom' }
  ])

  it('`/mnt/cdrom` が `/mnt/c` に吸われない (セグメント境界照合)', () => {
    const fromCdrom = makeRuntimePath(UBUNTU, '/mnt/cdrom/disc/x')
    if (!fromCdrom.ok) throw new Error('前提')

    const converted = runtimePathOps.toHost(fromCdrom.path, reverse(both))
    expect(converted.ok).toBe(true)
    if (!converted.ok) return
    expect(converted.path.value).toBe('D:\\disc\\x')
  })

  it('最長一致を採る', () => {
    const nested = mapping([
      { fromPrefix: 'C:\\', toPrefix: '/mnt' },
      { fromPrefix: 'D:\\', toPrefix: '/mnt/data' }
    ])
    const fromData = makeRuntimePath(UBUNTU, '/mnt/data/x')
    if (!fromData.ok) throw new Error('前提')

    const converted = runtimePathOps.toHost(fromData.path, reverse(nested))
    expect(converted.ok).toBe(true)
    if (!converted.ok) return
    expect(converted.path.value).toBe('D:\\x')
  })
})

describe('8. 別名前空間のパスで変換不能', () => {
  it('マッピングの向きが合わなければ `namespace-mismatch`', () => {
    const fromWsl = makeRuntimePath(UBUNTU, '/mnt/c/dev/x')
    if (!fromWsl.ok) throw new Error('前提')

    // `toHost` は `from === path.namespace` を要求する。host→wsl の向きを渡す。
    expect(runtimePathOps.toHost(fromWsl.path, DEFAULT)).toEqual({
      ok: false,
      reason: 'namespace-mismatch'
    })
  })

  it('別ディストロ向けのマッピングでは変換できない', () => {
    const forDebian = mapping([{ fromPrefix: 'C:\\', toPrefix: '/mnt/c' }], DEBIAN)
    const fromUbuntu = makeRuntimePath(UBUNTU, '/mnt/c/dev/x')
    if (!fromUbuntu.ok) throw new Error('前提')

    expect(runtimePathOps.toHost(fromUbuntu.path, reverse(forDebian)).ok).toBe(false)
  })
})

describe('9. 別ディストロの UNC 値を渡すと変換不能', () => {
  it('識別子に埋め込まれたディストロ名との不一致を生成時に弾く', () => {
    // `unc:Debian` を主張しつつ値が `Ubuntu-26.04` の share を指す。
    const forged = makeWslUncPath(
      uncNamespace('Debian'),
      '\\\\wsl.localhost\\Ubuntu-26.04\\home\\u'
    )
    expect(forged.ok).toBe(false)
  })

  it('正規の UNC 値でも share が識別子と違えば `fromUnc` が弾く', () => {
    const ubuntuUnc = makeWslUncPath(
      uncNamespace('Ubuntu-26.04'),
      '\\\\wsl.localhost\\Ubuntu-26.04\\home\\u'
    )
    if (!ubuntuUnc.ok) throw new Error('前提')

    // 識別子だけ差し替えた値は生成関数を通らないので、そもそも作れない。
    const forged = makeWslUncPath(uncNamespace('Debian'), ubuntuUnc.path.value)
    expect(forged.ok).toBe(false)
  })
})

describe('10. `Win32Runtime` の恒等変換', () => {
  /*
   * **`Win32Runtime` の恒等は「変換しない」ことで実現している。**
   * 解決関数 (`resolution.ts` 第 3 段) が所在 `windows` × `Win32Runtime` で
   * ホスト値をそのまま返す。マッピングを通さないので `toHost` / `fromHost` では
   * 表現できない (どちらも host ↔ wsl の向きを要求する)。
   * 解決側の振る舞いは `workspace/resolution.test.ts` が見る。
   *
   * ここで確かめるのは**恒等であるべき値が経路の途中で変質しないこと**である。
   */
  it('ホスト名前空間の値は生成と操作を通しても変質しない', () => {
    const original = host('Z:\\anywhere\\x')
    expect(original.value).toBe('Z:\\anywhere\\x')

    // 親へ上がって子へ戻ると元に一致する。
    const parent = hostPathOps.parent(original)
    expect(parent).not.toBeNull()
    if (parent === null) return

    const back = hostPathOps.join(parent, hostPathOps.basename(original))
    expect(back.ok).toBe(true)
    if (!back.ok) return
    expect(back.path.value).toBe(original.value)
  })

  it('`from === to` のマッピングは entries の形式だけを検証して受け付ける', () => {
    /*
     * 恒等マッピングは R-1 の公開 API からは使わない
     * (`toHost` / `fromHost` が host ↔ wsl を要求するため到達しない)。
     * **I-1 の 2 ホップ合成で恒等ホップが現れうる**ので生成だけは通す。
     */
    const identity = makePathMapping(
      'host',
      'host',
      [{ fromPrefix: 'C:\\', toPrefix: 'C:\\' }],
      NOW
    )
    expect(identity.ok).toBe(true)
  })
})

describe('11. バックスラッシュを含む POSIX 値で変換不能', () => {
  it('生成時に弾く', () => {
    // POSIX では `\` は通常の文字であり `..` の解決規則が発火しない。
    expect(makeRuntimePath(UBUNTU, '/home/u/a\\b').ok).toBe(false)
  })

  it('`.` / `..` を成分に含む値も弾く', () => {
    expect(makeRuntimePath(UBUNTU, '/home/../etc').ok).toBe(false)
    expect(makeRuntimePath(UBUNTU, '/home/./u').ok).toBe(false)
  })
})

describe('12. 2 つのマッピングの合成が逐次適用と一致', () => {
  /** `host → wsl:Ubuntu` と `wsl:Ubuntu → wsl:Debian` の 2 ホップ (I-1 の拡張点)。 */
  const first = mapping([{ fromPrefix: 'C:\\', toPrefix: '/mnt/c' }])

  function secondHop(): PathMapping {
    const result = makePathMapping(
      UBUNTU,
      DEBIAN,
      [{ fromPrefix: '/mnt/c', toPrefix: '/shared/c' }],
      NOW
    )
    if (!result.ok) throw new Error('前提')
    return result.mapping
  }

  it('`compose` の結果が逐次適用と一致する', () => {
    const second = secondHop()
    const original = host('C:\\dev\\x')

    // 逐次適用: 1 ホップ目をパス API で、2 ホップ目を照合モジュールで当てる。
    const step1 = runtimePathOps.fromHost(original, first)
    expect(step1.ok).toBe(true)
    if (!step1.ok) return
    expect(step1.path.value).toBe('/mnt/c/dev/x')

    const hit = findLongestMatch(second, step1.path.value)
    expect(hit).not.toBeNull()
    if (hit === null) return
    const sequential = applyEntry(second, hit, step1.path.value)
    expect(sequential).toBe('/shared/c/dev/x')

    // 合成を 1 回適用した結果。**照合関数を引数で渡す** (再実装しない設計の帰結)。
    const composed = compose(first, second, findLongestMatch, applyEntry)
    expect(composed.ok).toBe(true)
    if (!composed.ok) return

    const once = runtimePathOps.fromHost(original, composed.mapping)
    expect(once.ok).toBe(true)
    if (!once.ok) return
    expect(once.path.value).toBe(sequential)
  })

  it('`a.to !== b.from` の合成は成立しない', () => {
    const unrelated = makePathMapping(DEBIAN, 'host', [{ fromPrefix: '/x', toPrefix: 'C:\\' }], NOW)
    if (!unrelated.ok) throw new Error('前提')

    expect(compose(first, unrelated.mapping, findLongestMatch, applyEntry)).toEqual({
      ok: false,
      reason: 'not-composable'
    })
  })
})

describe('ホスト名前空間の操作', () => {
  it('join / parent / basename が win32 の意味論で動く', () => {
    const base = host('C:\\dev')
    const joined = hostPathOps.join(base, 'closta')
    expect(joined.ok).toBe(true)
    if (!joined.ok) return
    expect(joined.path.value).toBe('C:\\dev\\closta')

    expect(hostPathOps.basename(joined.path)).toBe('closta')
    expect(hostPathOps.parent(joined.path)?.value).toBe('C:\\dev')
  })

  it('セパレータを含む名前を join で弾く', () => {
    const base = host('C:\\dev')
    expect(hostPathOps.join(base, 'a\\b').ok).toBe(false)
    expect(hostPathOps.join(base, '..').ok).toBe(false)
  })
})

describe('ランタイム名前空間の操作', () => {
  it('join / parent / basename が posix の意味論で動く', () => {
    const base = wsl('/home/u')
    const joined = runtimePathOps.join(base, 'repo')
    expect(joined.ok).toBe(true)
    if (!joined.ok) return
    expect(joined.path.value).toBe('/home/u/repo')

    expect(runtimePathOps.basename(joined.path)).toBe('repo')
    expect(runtimePathOps.parent(joined.path)?.value).toBe('/home/u')
  })

  it('ルートの親は `null`', () => {
    const root = wsl('/')
    expect(runtimePathOps.parent(root)).toBeNull()
  })

  it('equals は名前空間まで一致を要求する (別ディストロを同一視しない)', () => {
    const a = wsl('/home/u', UBUNTU)
    const b = wsl('/home/u', DEBIAN)
    expect(runtimePathOps.equals(a, b)).toBe(false)
  })
})
