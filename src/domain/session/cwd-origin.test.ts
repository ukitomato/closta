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
 * 出自判定の**判定表 8 行を全数**網羅する (BE-012 / SC-005)。
 *
 * **正本は `cwd-origin.ts` の `classifyCwd` docstring の 8 行**である (AD-032 §6)。
 * ここの describe 番号はその正本と 1 対 1 に対応させる —
 * 以前は旧 7 行番号の写しで、正本 #4 (`opaque-unc`) と test #4 (`host`) が食い違っていた
 * (pr-gate Round 5 / architecture H-001)。
 * #4 (`opaque-unc`) の綴り × 接頭の全数は `cwd-origin-unc.test.ts` の性質テストが持つ。
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

  it('**UNC 接頭辞は含めず、ディストロ名は含める** (FR-042 / FR-017)', () => {
    /*
     * **FR-042 が禁じているのは UNC の綴りであってディストロ名ではない**
     * (pr-gate Round 4 / PO4-002)。`EnumerationOutcomeDTO.location` は
     * 既にディストロ名を平文で運んでいる。
     * 名前が出ないと `unknown-location` との差が訳語だけになり、
     * 「改名前に戻す」「再導入する」を利用者が決められない。
     */
    const origin = classify('\\\\wsl.localhost\\Debian\\home\\y\\p')
    const display = originDisplay(origin)
    expect(display).toBe('Debian: /home/y/p')
    expect(display).not.toContain('wsl.localhost')
    expect(display).not.toContain('\\\\')
  })

  it('所在は決まらない。**推測で埋めない**', () => {
    const origin = classify('\\\\wsl.localhost\\Debian\\home\\y')
    expect(originLocation(origin)).toBeNull()
    expect(originPath(origin)).toBeNull()
  })

  it('**大小だけが違う綴りは未検出にしない** (pr-gate Round 4 / PB4-001)', () => {
    /*
     * Windows は共有名を大小無視で解決する (実機で確認)。
     * `\\wsl.localhost\ubuntu\home` は検出済みの `Ubuntu` を指しているので、
     * 実行中のディストロを「未検出」に落としてはならない。
     *
     * **このテストは以前、逆を期待値にしていた** —
     * 「ディストロ名の大小は区別する」として PB4-001 のバグを固定していた。
     */
    const origin = classify('\\\\wsl.localhost\\ubuntu\\home\\y')
    expect(origin.kind).toBe('wsl-from-unc')

    /* **名前空間は検出済みの綴りで組む。** 割れると同じディストロが 2 つになる。 */
    expect(originLocation(origin)).toEqual({ kind: 'wsl', distroName: 'Ubuntu' })
  })

  it('検出済み集合に無い名前は大小を問わず未検出になる', () => {
    /* 大小無視にしたことで「何でも通る」ようになっていないことを固定する。 */
    for (const raw of ['Debian', 'debian', 'DEBIAN']) {
      const origin = classify(`\\\\wsl.localhost\\${raw}\\home\\y`)
      expect(origin.kind).toBe('undetected-distro')
    }
  })
})

describe('判定表 #4: 解析できない UNC 形 (opaque-unc) → unknown-location (表示値なし)', () => {
  /*
   * **正本 #4。** 綴り × 接頭の全数は `cwd-origin-unc.test.ts` の性質テストが持つ。
   * ここでは代表例で「所在も表示値も持たない」ことだけ固定する。
   */
  it('解析できない UNC は所在も表示値も持たない', () => {
    const origin = classify('\\\\?\\UNC\\wsl.localhost\\Ubuntu\\home\\y')
    expect(origin.kind).toBe('unknown-location')
    expect(originLocation(origin)).toBeNull()
    expect(originDisplay(origin)).toBe('')
  })

  it('先頭 1 本 + 内部バックスラッシュの綴りも #4 に落ちる (PB5-001)', () => {
    /* `/x\wsl.localhost\...` は先頭区切り 1 本だが、バックスラッシュ混入で opaque。 */
    const origin = classify('/x\\wsl.localhost\\Ubuntu\\home')
    expect(origin.kind).toBe('unknown-location')
    expect(originDisplay(origin)).toBe('')
    expect(originDisplay(origin)).not.toContain('wsl.localhost')
  })
})

describe('判定表 #5: ドライブレター始まり → host', () => {
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

describe('判定表 #6: POSIX 形式 かつ 由来 config が wsl:<D> → wsl-inherited', () => {
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

describe('判定表 #7: POSIX 形式 かつ 由来 config が windows → unknown-location', () => {
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

describe('判定表 #8: other (相対等) → unknown-location', () => {
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
