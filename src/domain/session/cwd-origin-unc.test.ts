import { describe, expect, it } from 'vitest'

import { classifyCwd, originDisplay, originPath } from './cwd-origin'

/**
 * BE-026b — 解析できない UNC 値の扱い (pr-gate Round 1 / C-001 / platform-boundary H-001)。
 *
 * **`cwd-origin.test.ts` から分けてある。** 理由は 1 つで、
 * この観点だけが**バックスラッシュとフォワードスラッシュの綴りを大量に並べる**ため、
 * 判定表 7 行の見通しを保っている既存ファイルに混ぜると読めなくなる。
 *
 * ## 何を固定しているか
 *
 * `parseWslUncPath` はディストロ名が不正 (先頭 `-` / `:` を含む / 空)、4096 文字超、
 * 制御文字を含むといった理由で失敗する。**失敗した値が UNC でなくなるわけではない。**
 * 解析の成否と接頭辞の一致を分けないと 2 つの欠陥が出る。
 *
 * 1. **生値が表示用として境界を越える** (FR-042)。
 *    `\\wsl.localhost\<distro>\home\<user>\...` はディストロ名と Linux ユーザ名を含む
 * 2. **フォワードスラッシュ綴りが「POSIX 形式」に化ける** (FR-016 / FR-018)。
 *    `//wsl.localhost/-bad/home/y` は `raw.startsWith('/')` に当たり `makeRuntimePath` も通るため、
 *    **由来 config ディレクトリの所在を継承した `wsl-inherited`** として確定してしまう。
 *    逆方向 (`\\` 始まり) は `makeRuntimePath` が拒否するので、
 *    **フォワードスラッシュ綴りだけが抜ける**非対称だった
 *
 * ## 綴りを直書きしている理由
 *
 * 検証項目 12 は UNC 接頭辞のリテラルを `path-types.ts` / `path-api.ts` に限るが、
 * **テストは除外されている** (`UNC_LITERAL_EXEMPT_SUFFIXES`)。
 * 通過しないことを証明するテストは、規則の違反ではなく遵守の証拠である。
 */

/** バックスラッシュ 1 つ。テンプレート内のエスケープを避けるために定数で持つ。 */
const B = String.fromCharCode(92)
const UNC = B + B + 'wsl.localhost' + B
const LEGACY = B + B + 'wsl$' + B

const DETECTED = new Set(['Ubuntu'])
const FROM_WSL = { kind: 'wsl', distroName: 'Ubuntu' } as const
const FROM_HOST = { kind: 'windows' } as const

function classify(
  cwd: string,
  targetLocation: typeof FROM_WSL | typeof FROM_HOST
): ReturnType<typeof classifyCwd> {
  return classifyCwd({ cwd, targetLocation, detectedDistros: DETECTED })
}

describe('解析できない UNC — 所在を推測しない', () => {
  it.each([
    ['先頭ハイフン (バックスラッシュ綴り)', UNC + '-bad' + B + 'home' + B + 'y'],
    ['先頭ハイフン (フォワードスラッシュ綴り)', '//wsl.localhost/-bad/home/y'],
    ['コロンを含む', UNC + 'a:b' + B + 'home'],
    ['ディストロ名が空 (フォワードスラッシュ綴り)', '//wsl.localhost//home/y'],
    ['旧綴り + 先頭ハイフン', LEGACY + '-bad' + B + 'home' + B + 'y']
  ])('由来 config の所在を継承しない (%s)', (_label, raw) => {
    /*
     * **由来を WSL にして試す。** これが `wsl-inherited` への誤帰属が起きる条件である。
     * ホスト由来で試すと #6 に落ちるだけで、この欠陥は再現しない。
     */
    const origin = classify(raw, FROM_WSL)

    expect(origin.kind).toBe('unknown-location')
    /* 所在が決まらないので `cwd` は持たない (DTO の `cwd` が `null` になる)。 */
    expect(originPath(origin)).toBeNull()
  })

  it.each([
    ['先頭ハイフン (バックスラッシュ綴り)', UNC + '-bad' + B + 'home' + B + 'alice'],
    ['先頭ハイフン (フォワードスラッシュ綴り)', '//wsl.localhost/-bad/home/alice'],
    ['旧綴り', LEGACY + '-bad' + B + 'home' + B + 'alice']
  ])('表示用の値に UNC 接頭辞とディストロ名を残さない (%s)', (_label, raw) => {
    const display = originDisplay(classify(raw, FROM_WSL)) ?? ''

    /* FR-042: 表示用の生値としても UNC 形式の文字列を境界に出してはならない。 */
    expect(display).not.toContain('wsl.localhost')
    expect(display).not.toContain('wsl$')
    expect(display).not.toContain(B + B)
    /* 検証を通っていないディストロ名も出さない。 */
    expect(display).not.toContain('-bad')
    /* **空欄にしない** — 残余は出す (FR-047)。 */
    expect(display).toContain('alice')
  })

  it('残余が無い値では表示を空にする (参照キーから ui が文言を出す)', () => {
    const display = originDisplay(classify(UNC + '-bad', FROM_WSL))

    expect(display).toBe('')
  })
})

/**
 * デバイス名前空間の綴りと区切りの重なり (pr-gate Round 2 / H2-001)。
 *
 * **Round 1 の修正は綴りを 2 つしか見ていなかった。**
 * `looksLikeWslUnc` が照合するのは `\\wsl.localhost\` と `\\wsl$\` の 2 つだけで、
 * Win32 のデバイス名前空間を経由した綴りは素通りしていた。実測での到達先:
 *
 * | 入力 | 修正前の結果 |
 * |---|---|
 * | `//?/UNC/wsl.localhost/Ubuntu/home/alice` | `wsl-inherited` (namespace: `wsl:Ubuntu`) |
 * | `\\?\UNC\wsl.localhost\Ubuntu\home\alice` | `unknown-location` (display に UNC 全文) |
 * | `\\wsl.localhost\\-bad\home\alice` | display `/-bad/home/alice` |
 *
 * 1 行目が最も重い — **値が Ubuntu を名指しているのに、判定したのは由来 config の所在**
 * であり、別ディストロの config から来ていれば別ディストロに帰属していた (FR-016)。
 * 3 行目は Round 1 が書いた `not.toContain('-bad')` が、
 * **区切りを 1 つ増やすだけで破れる**ことを示す。
 */
describe('デバイス名前空間の綴りと区切りの重なり (H2-001)', () => {
  const DEVICE = B + B + '?' + B + 'UNC' + B
  const DEVICE_DOT = B + B + '.' + B + 'UNC' + B

  it.each([
    [
      'デバイス綴り (バックスラッシュ)',
      DEVICE + 'wsl.localhost' + B + 'Ubuntu' + B + 'home' + B + 'alice'
    ],
    [
      'デバイス綴り (ドット)',
      DEVICE_DOT + 'wsl.localhost' + B + 'Ubuntu' + B + 'home' + B + 'alice'
    ],
    ['デバイス綴り (フォワードスラッシュ)', '//?/UNC/wsl.localhost/Ubuntu/home/alice']
  ])('UNC の綴りとして扱う (%s)', (_label, raw) => {
    const origin = classify(raw, FROM_WSL)

    /*
     * **由来 config の所在を継承しない。** `FROM_WSL` は Ubuntu なので、
     * 継承すると「たまたま正しい」結果になって欠陥が見えない。
     * 見るべきは `wsl-inherited` に落ちていないことである。
     */
    expect(origin.kind).not.toBe('wsl-inherited')
    expect(originPath(origin)).toBeNull()

    const display = originDisplay(origin) ?? ''
    expect(display).not.toContain('wsl.localhost')
    expect(display).not.toContain('UNC')
    expect(display).not.toContain(B + B)
    /* 残余は出す。 */
    expect(display).toContain('alice')
  })

  it('区切りが重なっても検証を通っていないディストロ名を出さない', () => {
    const raw = B + B + 'wsl.localhost' + B + B + '-bad' + B + 'home' + B + 'alice'

    const display = originDisplay(classify(raw, FROM_WSL)) ?? ''

    expect(display).not.toContain('-bad')
    expect(display).toContain('alice')
  })

  it.each([
    ['非 WSL の UNC (フォワードスラッシュ)', '//localhost/c$/Users/y'],
    ['サーバ共有 (フォワードスラッシュ)', '//fileserver/share/project']
  ])('WSL 以外の UNC も POSIX 絶対パスとして扱わない (%s)', (_label, raw) => {
    /*
     * `looksLikeWslUnc` は WSL の共有名を持つ綴りだけを捕まえる。
     * **綴りの網羅では守れない**ので、`//` 始まりという形の性質で落とす。
     */
    const origin = classify(raw, FROM_WSL)

    expect(origin.kind).not.toBe('wsl-inherited')
    expect(originPath(origin)).toBeNull()
  })
})

describe('解析できる UNC は従来どおり', () => {
  it('検出済みディストロは `wsl-from-unc` になる', () => {
    const origin = classify(UNC + 'Ubuntu' + B + 'home' + B + 'y', FROM_HOST)

    expect(origin.kind).toBe('wsl-from-unc')
    expect(originPath(origin)?.value).toBe('/home/y')
  })

  it('未検出ディストロは `undetected-distro` になり、表示は変換後の POSIX パスである', () => {
    const origin = classify(UNC + 'Fedora' + B + 'home' + B + 'y', FROM_HOST)

    expect(origin.kind).toBe('undetected-distro')
    expect(originDisplay(origin)).toBe('/home/y')
  })
})

describe('双方向制御文字と長さ (FR-049 / SC-015)', () => {
  /*
   * **`classifyCwd` は正規化しない。** 正規化は `buildSessionSummary` が
   * `classifyCwd` に渡す前に行う (印を `normalized` に畳む必要があるため)。
   * ここでは「正規化済みの値を渡せば判定が素直に通る」ことだけを固定する。
   */
  it('正規化で U+202E が落ちた値は素直に判定される', () => {
    const withBidi = '/home/' + String.fromCharCode(0x202e) + 'y'
    const cleaned = '/home/y'

    expect(classify(withBidi, FROM_WSL).kind).toBe('wsl-inherited')
    expect(originPath(classify(cleaned, FROM_WSL))?.value).toBe('/home/y')
  })
})
