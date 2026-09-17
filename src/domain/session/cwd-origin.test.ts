import { describe, expect, it } from 'vitest'

import { wslNamespace } from '@domain/runtime/namespace'
import type { Location } from '@domain/workspace/folder'

import {
  classifyCwd,
  originDisplay,
  originLocation,
  originPath,
  type CwdOrigin
} from './cwd-origin'

/**
 * 出自判定の**判定表 7 行を全数**網羅する (BE-012 / SC-005)。
 *
 * 判定表が守ろうとしているのは 1 点である —
 * **由来 config ディレクトリの所在から、セッションの所在を推定しないこと。**
 * 実測でホスト側の 1 つの config ディレクトリに 3 形式が混在した (research R-02)。
 */

const HOST: Location = { kind: 'windows' }
const WSL_UBUNTU: Location = { kind: 'wsl', distroName: 'Ubuntu' }
const DETECTED = new Set(['Ubuntu', 'Ubuntu-26.04'])

function classify(cwd: string | null | undefined, targetLocation: Location = HOST): CwdOrigin {
  return classifyCwd({ cwd, targetLocation, detectedDistros: DETECTED })
}

describe('判定表 #1: 値が無い / 空 → absent', () => {
  it.each([undefined, null, '', '   '])('%p は absent', (cwd) => {
    expect(classify(cwd).kind).toBe('absent')
  })
})

describe('判定表 #2: UNC 形式 かつ 検出済み → wsl-from-unc', () => {
  /**
   * **3 綴りすべてを受理する。** research R-01 で同じ config ディレクトリに対して
   * 3 形式すべてが成立することを実測した。
   * 接頭辞の大小は問わない (UNC のホスト名は大小を区別しない)。
   */
  it.each([
    ['新しい共有名', '\\\\wsl.localhost\\Ubuntu\\home\\y\\p'],
    ['legacy 共有名', '\\\\wsl$\\Ubuntu\\home\\y\\p'],
    ['フォワードスラッシュ', '//wsl.localhost/Ubuntu/home/y/p'],
    ['接頭辞が大文字', '\\\\WSL.LOCALHOST\\Ubuntu\\home\\y\\p']
  ])('%s: %s', (_label, cwd) => {
    const origin = classify(cwd)
    expect(origin.kind).toBe('wsl-from-unc')
    if (origin.kind !== 'wsl-from-unc') return
    expect(origin.namespace).toBe(wslNamespace('Ubuntu'))
    expect(origin.path.value).toBe('/home/y/p')
  })

  it('ホスト側の履歴に現れても、所在はディストロとして特定される', () => {
    // 実測: ホスト側 43 件のうち 7 件が UNC 形式だった。
    const origin = classify('\\\\wsl.localhost\\Ubuntu\\home\\y\\p', HOST)
    expect(originLocation(origin)).toEqual({ kind: 'wsl', distroName: 'Ubuntu' })
  })

  it('share のルートだけなら `/` になる', () => {
    const origin = classify('\\\\wsl.localhost\\Ubuntu')
    expect(origin.kind).toBe('wsl-from-unc')
    if (origin.kind !== 'wsl-from-unc') return
    expect(origin.path.value).toBe('/')
  })
})

describe('判定表 #3: UNC 形式 かつ 未検出 → undetected-distro', () => {
  it('所在不明とは区別される', () => {
    const origin = classify('\\\\wsl.localhost\\Debian\\home\\y\\p')
    expect(origin.kind).toBe('undetected-distro')
    if (origin.kind !== 'undetected-distro') return
    expect(origin.distroName).toBe('Debian')
  })

  it('**表示用の値に UNC 接頭辞を含めない** (FR-042)', () => {
    const origin = classify('\\\\wsl.localhost\\Debian\\home\\y\\p')
    const display = originDisplay(origin)
    expect(display).toBe('/home/y/p')
    expect(display).not.toContain('wsl.localhost')
    expect(display).not.toContain('\\\\')
  })

  it('所在は決まらない。**推測で埋めない**', () => {
    const origin = classify('\\\\wsl.localhost\\Debian\\home\\y')
    expect(originLocation(origin)).toBeNull()
    expect(originPath(origin)).toBeNull()
  })

  it('ディストロ名の大小は区別する (検出時の表記と完全一致)', () => {
    // `ubuntu` は検出済み集合 (`Ubuntu`) に無いので未検出として扱う。
    const origin = classify('\\\\wsl.localhost\\ubuntu\\home\\y')
    expect(origin.kind).toBe('undetected-distro')
  })
})

describe('判定表 #4: ドライブレター始まり → host', () => {
  it('小文字のドライブレターは正規化される (実測で混在)', () => {
    const origin = classify('c:\\dev\\x')
    expect(origin.kind).toBe('host')
    if (origin.kind !== 'host') return
    expect(origin.path.value).toBe('C:\\dev\\x')
  })

  it('末尾セパレータは除去される', () => {
    const origin = classify('C:\\dev\\x\\')
    expect(origin.kind).toBe('host')
    if (origin.kind !== 'host') return
    expect(origin.path.value).toBe('C:\\dev\\x')
  })

  it('由来 config が WSL でも、値がホスト形式ならホストとして扱う', () => {
    expect(classify('C:\\dev\\x', WSL_UBUNTU).kind).toBe('host')
  })
})

describe('判定表 #5: POSIX 形式 かつ 由来 config が wsl:<D> → wsl-inherited', () => {
  it('由来の所在を継承する', () => {
    const origin = classify('/home/y/p', WSL_UBUNTU)
    expect(origin.kind).toBe('wsl-inherited')
    if (origin.kind !== 'wsl-inherited') return
    expect(origin.namespace).toBe(wslNamespace('Ubuntu'))
    expect(origin.path.value).toBe('/home/y/p')
  })

  it('`/mnt/c/...` も同じ所在の値として扱う (越境判定は対応づけ側の仕事)', () => {
    const origin = classify('/mnt/c/dev/x', WSL_UBUNTU)
    expect(origin.kind).toBe('wsl-inherited')
    if (origin.kind !== 'wsl-inherited') return
    expect(origin.path.value).toBe('/mnt/c/dev/x')
  })
})

describe('判定表 #6: POSIX 形式 かつ 由来 config が windows → unknown-location', () => {
  /**
   * **これが本 feature で最も重要な 1 行である。**
   * 同じ `/home/y/p` は複数のディストロに存在しうる。いずれかに帰属させると、
   * 別のディストロの登録フォルダにセッションが紛れ込む。
   */
  it('所在を推測しない', () => {
    const origin = classify('/home/y/p', HOST)
    expect(origin.kind).toBe('unknown-location')
    expect(originLocation(origin)).toBeNull()
    expect(originPath(origin)).toBeNull()
  })

  it('検出済みディストロが 1 つだけでも推測しない', () => {
    const origin = classifyCwd({
      cwd: '/home/y/p',
      targetLocation: HOST,
      detectedDistros: new Set(['Ubuntu'])
    })
    expect(origin.kind).toBe('unknown-location')
  })

  it('表示用の値は記録されていた値のまま', () => {
    expect(originDisplay(classify('/home/y/p', HOST))).toBe('/home/y/p')
  })
})

describe('判定表 #7: それ以外 → unknown-location', () => {
  it.each(['foo/bar', 'relative', '.', '..', 'C:', '\\\\server\\share\\x'])(
    '%p は unknown-location',
    (cwd) => {
      expect(classify(cwd).kind).toBe('unknown-location')
    }
  )
})

describe('所在が決まる出自では表示用の値を持たない', () => {
  it.each([
    ['host', 'C:\\dev\\x', HOST],
    ['wsl-from-unc', '\\\\wsl.localhost\\Ubuntu\\home\\y', HOST],
    ['wsl-inherited', '/home/y', WSL_UBUNTU]
  ])('%s は cwd 側で足りる', (_kind, cwd, location) => {
    const origin = classify(cwd, location as Location)
    expect(originPath(origin)).not.toBeNull()
    expect(originDisplay(origin)).toBeNull()
  })
})
