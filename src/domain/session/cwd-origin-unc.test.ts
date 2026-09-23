import { describe, expect, it } from 'vitest'

import { classifyCwd, originDisplay, originPath } from './cwd-origin'

/**
 * BE-026b — UNC 形の作業ディレクトリ (pr-gate Round 4 / 不変条件 1)。
 *
 * ## ケース列挙をやめた理由
 *
 * このファイルは Round 1〜3 のあいだ**綴りのケース表**だった。
 * 毎ラウンド新しい綴りが指摘され、そのたびに行を足し、そのたびに別の何かが壊れた。
 *
 * | Round | 足した綴り | 壊れたもの |
 * |---|---|---|
 * | 1 | 先頭ハイフン / フォワードスラッシュ | — |
 * | 2 | デバイス名前空間 (`\\?\UNC\`) | FR-017 (`parseWslUncPath` への接続漏れ) |
 * | 3 | 区切りの重なり | 正当な POSIX 表示 (一括ガード) |
 *
 * **表に行を足す形である限り、表に無い綴りは守れない。**
 * `classifyRawPath` が「先頭区切りの本数」で決める構造に変わったので、
 * テストも**組み合わせで生成した全入力に対する性質**に変える。
 *
 * ## 守る性質
 *
 * > 先頭の区切りが 2 本以上の**任意の**入力について、
 * > 境界を渡る表示値 (`cwdDisplay` = `originDisplay`) に
 * > 接頭辞・共有名・検証を通っていないディストロ名が現れない。
 *
 * 綴りが増えてもこのテストは書き換えなくてよい。組み合わせに 1 要素足すだけである。
 *
 * ## 綴りを直書きしている理由
 *
 * 検証項目 12 は UNC 接頭辞のリテラルを `path-types.ts` / `path-api.ts` に限るが、
 * **テストは除外されている** (`UNC_LITERAL_EXEMPT_SUFFIXES`)。
 * 通過しないことを証明するテストは、規則の違反ではなく遵守の証拠である。
 */

/** バックスラッシュ 1 つ。テンプレート内のエスケープを避けるために定数で持つ。 */
const B = String.fromCharCode(92)

const DETECTED = new Set(['Ubuntu'])
const FROM_WSL = { kind: 'wsl', distroName: 'Ubuntu' } as const
const FROM_HOST = { kind: 'windows' } as const

function classify(
  cwd: string,
  targetLocation: typeof FROM_WSL | typeof FROM_HOST
): ReturnType<typeof classifyCwd> {
  return classifyCwd({ cwd, targetLocation, detectedDistros: DETECTED })
}

/* ── 組み合わせの素 ──────────────────────────────────────────── */

/**
 * 先頭の区切り (2 本以上)。**デバイス名前空間と GLOBALROOT を含む。**
 *
 * これらは実測されていない綴りである (research R-02 で現れたのは `\\wsl.localhost\` のみ)。
 * **実装に分岐を作らないかわりに、安全側へ落ちることをここで縛る。**
 */
const LEADS = [
  B + B,
  '//',
  B + B + B,
  '///',
  B + '/',
  B + B + '?' + B + 'UNC' + B,
  '//?/UNC/',
  B + B + '.' + B + 'UNC' + B,
  B + B + '??' + B + 'UNC' + B,
  B + B + '?' + B + 'GLOBALROOT' + B + 'Device' + B + 'Mup' + B
] as const

/** 共有名。WSL のものと、そうでないもの。 */
const SHARES = [
  'wsl.localhost',
  'wsl$',
  'WSL.LOCALHOST',
  'wsl.localhost@ssl',
  'fileserver'
] as const

/** ディストロ名 / 共有名の第 2 セグメント。妥当なものと不正なもの。 */
const SECONDS = ['Ubuntu', 'Fedora', '-bad', 'a:b', 'c$'] as const

/**
 * 残余。
 *
 * **変換に失敗する形を含める。** `parseWslUncPath` が成功しても
 * `fromUnc` は長さ超過や制御文字で失敗しうる。その分岐に入ったときも
 * 生値を出してはならない (変異 D で発火を確認した)。
 */
const RESTS = [
  B + 'home' + B + 'alice' + B + 'p',
  '/home/alice/p',
  '',
  /* 4096 バイトの上限を超える。 */
  B + 'home' + B + 'a'.repeat(5000),
  /* C0 制御文字。`makeRuntimePath` が拒む。 */
  B + 'home' + B + String.fromCharCode(1) + 'alice'
] as const

/** 表示値に**決して**現れてはならない断片。 */
const FORBIDDEN = [
  'wsl.localhost',
  'WSL.LOCALHOST',
  'wsl$',
  'UNC',
  'GLOBALROOT',
  'fileserver',
  B + B,
  '//'
] as const

function combinations(): { raw: string; label: string }[] {
  const out: { raw: string; label: string }[] = []
  for (const lead of LEADS) {
    for (const share of SHARES) {
      for (const second of SECONDS) {
        for (const rest of RESTS) {
          const raw = lead + share + B + second + rest
          out.push({ raw, label: JSON.stringify(raw) })
        }
      }
    }
  }
  return out
}

describe('性質: 区切り 2 本以上で始まる値は接頭辞も共有名も境界に出さない (FR-042)', () => {
  const cases = combinations()

  it('組み合わせを網羅している (表の大きさを固定する)', () => {
    expect(cases).toHaveLength(LEADS.length * SHARES.length * SECONDS.length * RESTS.length)
    expect(cases.length).toBeGreaterThan(500)
  })

  it.each([FROM_WSL, FROM_HOST])('由来 %o のとき、表示値に禁止断片が現れない', (from) => {
    const leaked: string[] = []

    for (const { raw, label } of cases) {
      const origin = classify(raw, from)
      const display = originDisplay(origin) ?? ''

      for (const fragment of FORBIDDEN) {
        if (display.includes(fragment)) leaked.push(`${label} → ${JSON.stringify(display)}`)
      }
      /*
       * **検証を通っていない第 2 セグメントも出さない。**
       * 解析に成功した値のディストロ名は検証済みなので対象外。
       */
      if (origin.kind === 'unknown-location' && display.includes('-bad')) {
        leaked.push(`${label} → ${JSON.stringify(display)}`)
      }
    }

    expect(leaked).toEqual([])
  })

  it.each([FROM_WSL, FROM_HOST])('由来 %o のとき、由来の所在を継承しない', (from) => {
    /*
     * **UNC 形は POSIX ではない。** Round 2 の欠陥は、綴りを 1 つ変えると
     * `raw.startsWith('/')` に当たって `wsl-inherited` になることだった。
     * 先頭区切りが 2 本以上なら、どの綴りでも継承は起きない。
     */
    const inherited = cases
      .map(({ raw, label }) => ({ label, kind: classify(raw, from).kind }))
      .filter((r) => r.kind === 'wsl-inherited')

    expect(inherited).toEqual([])
  })
})

describe('実測された綴りは所在を特定する (FR-017 / US-1 AC-5)', () => {
  const UNC = B + B + 'wsl.localhost' + B
  const LEGACY = B + B + 'wsl$' + B

  it.each([
    ['新しい共有名', UNC + 'Ubuntu' + B + 'home' + B + 'y'],
    ['旧共有名', LEGACY + 'Ubuntu' + B + 'home' + B + 'y'],
    ['フォワードスラッシュ綴り', '//wsl.localhost/Ubuntu/home/y'],
    ['共有名の大小を問わない', B + B + 'WSL.localhost' + B + 'Ubuntu' + B + 'home' + B + 'y']
  ])('検出済みディストロは `wsl-from-unc` になる (%s)', (_label, raw) => {
    const origin = classify(raw, FROM_HOST)

    expect(origin.kind).toBe('wsl-from-unc')
    expect(originPath(origin)?.value).toBe('/home/y')
    expect(originPath(origin)?.namespace).toBe('wsl:Ubuntu')
  })

  it('未検出ディストロは `undetected-distro` になり、表示は変換後の POSIX パスである', () => {
    const origin = classify(UNC + 'Fedora' + B + 'home' + B + 'y', FROM_HOST)

    expect(origin.kind).toBe('undetected-distro')
    expect(originDisplay(origin)).toBe('/home/y')
  })

  it('解析できない UNC は所在を持たず、表示値も持たない', () => {
    /* **残余を推測しない。** 参照キーが意味を運ぶ (訳出は `ui` の責務 / FR-047)。 */
    const origin = classify(UNC + '-bad' + B + 'home' + B + 'y', FROM_WSL)

    expect(origin.kind).toBe('unknown-location')
    expect(originPath(origin)).toBeNull()
    expect(originDisplay(origin)).toBe('')
  })
})

describe('区切り 1 本以下は UNC ではない', () => {
  it('POSIX 形式 + 由来が WSL は所在を継承する (FR-018)', () => {
    const origin = classify('/home/y/p', FROM_WSL)

    expect(origin.kind).toBe('wsl-inherited')
    expect(originPath(origin)?.value).toBe('/home/y/p')
  })

  it('POSIX 形式 + 由来がホストは所在を決めず、生値を表示する', () => {
    /*
     * **生値を出してよい。** 区切りが 1 本の値は定義上 UNC ではなく、
     * 共有名もサーバ名も含まない。Round 3 の一括ガードはここを壊した。
     */
    const origin = classify('/home/y/p', FROM_HOST)

    expect(origin.kind).toBe('unknown-location')
    expect(originDisplay(origin)).toBe('/home/y/p')
  })

  it.each(['foo/bar', 'relative', '.', '..'])('相対パス %p は生値を表示する', (raw) => {
    expect(originDisplay(classify(raw, FROM_HOST))).toBe(raw)
  })
})

describe('双方向制御文字と長さ (FR-049 / SC-015)', () => {
  /*
   * **`classifyCwd` は正規化しない。** 正規化は `buildSessionSummary` が
   * `classifyCwd` に渡す前に行う (印を `normalized` に畳む必要があるため)。
   * ここでは「正規化済みの値を渡せば判定が素直に通る」ことだけを固定する。
   */
  it('正規化済みの値は素直に判定される', () => {
    expect(originPath(classify('/home/y', FROM_WSL))?.value).toBe('/home/y')
  })
})
