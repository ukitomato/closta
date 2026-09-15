import { describe, expect, it, vi } from 'vitest'

/*
 * **`electron` をモックする。**
 *
 * 検査対象は `resolveRequest` と `contentSecurityPolicy` の 2 つの純粋関数だが、
 * 同じモジュールが `protocol` の登録も持つため `electron` の import が発生する。
 * 登録側を別モジュールに割ると、**配信の規則と封じ込めの規則が 2 ファイルに散る** —
 * ハンドラを読んだだけでは何が守られているか分からなくなるので、そうしない。
 */
vi.mock('electron', () => ({
  protocol: { registerSchemesAsPrivileged: () => undefined, handle: () => undefined }
}))

import { makeHostPath } from '@domain/runtime/path-types'

import { contentSecurityPolicy, resolveRequest } from './protocol'

/**
 * カスタムプロトコルハンドラの封じ込めと CSP の検証 (BE-011 / SC-016 / FR-040)。
 *
 * **スキームを `file://` から変えただけでは何も守れない。**
 * ハンドラが要求パスをそのままファイルシステムに結合すれば、任意ファイルが renderer に入る。
 * ここで見るのは「同梱ディレクトリの外へ出られないこと」である。
 *
 * 符号化形を個別に 3 つだけ並べる形にしない — 並べると、並べなかった綴りが
 * 拘束を外れる。`decodeURIComponent` した**後**にセグメント単位で検証しているため、
 * 符号化の深さや綴りに依らず同じ経路で落ちることを、代表的な綴りで確認する。
 */

const RENDERER_DIR = (() => {
  const dir = makeHostPath('C:\\app\\out\\renderer')
  if (!dir.ok) throw new Error('前提のパスが作れない')
  return dir.path
})()

/** 同梱ディレクトリの外へ出られる形。**拒否されること。** */
const REJECTED = [
  // `decodeURIComponent` 後に `..` セグメントとして現れる形。
  ['セパレータまで符号化', 'app://bundle/%2e%2e%2fmain%2findex.js'],
  ['大文字の符号化', 'app://bundle/%2E%2E%2Fmain%2Findex.js'],
  ['符号化したバックスラッシュ', 'app://bundle/%2e%2e%5cmain%5cindex.js'],
  ['バックスラッシュ区切り', 'app://bundle/..\\main\\index.js'],
  // セグメントに使えない文字を含む形。
  ['NUL の埋め込み', 'app://bundle/index.html%00.js'],
  ['不正な percent-encoding', 'app://bundle/%zz'],
  // **`:` は指すものを変える。** 接頭辞照合では捕まらない。
  ['代替データストリーム', 'app://bundle/index.html:$DATA'],
  ['名前つき代替データストリーム', 'app://bundle/index.html:hidden'],
  ['ドライブ相対の持ち込み', 'app://bundle/C:/Windows/System32/config/SAM'],
  ['ワイルドカード', 'app://bundle/*.js'],
  ['URL として読めない要求', 'not a url']
] as const

/**
 * **URL パーサが畳んでしまう形。**
 *
 * WHATWG URL は `app://` でもパスセグメントを正規化するため、
 * ハンドラに届く時点で `..` は消えており、同梱ディレクトリ配下を指している。
 * **脱出ではないので拒否しない** — ここを「拒否されるはず」と書くと、
 * 実装ではなくパーサの挙動を試していることになる。
 *
 * 畳まれた結果が**必ず配下に収まること**を確認するのが本来の検査である。
 */
const NORMALIZED_BY_URL = [
  ['素の親ディレクトリ参照', 'app://bundle/../main/index.js', 'main\\index.js'],
  [
    '多段の親ディレクトリ参照',
    'app://bundle/../../../Windows/System32/config/SAM',
    'Windows\\System32\\config\\SAM'
  ],
  ['単一符号化', 'app://bundle/%2e%2e/main/index.js', 'main\\index.js'],
  ['カレント参照との混在', 'app://bundle/./../main/index.js', 'main\\index.js'],
  ['セグメント末尾に紛れさせる', 'app://bundle/assets/../../main/index.js', 'main\\index.js'],
  // 空セグメントは落とされるため、UNC 形にはならない。
  ['UNC の持ち込み', 'app://bundle//server/share/x', 'server\\share\\x'],
  // 二重符号化は 1 回しか復号しないので、リテラルな名前として扱われる。
  ['二重符号化', 'app://bundle/%252e%252e/main/index.js', '%2e%2e\\main\\index.js']
] as const

const BASE = 'C:\\app\\out\\renderer\\'

describe('resolveRequest — 同梱ディレクトリの外へ出られない (SC-016)', () => {
  it.each(REJECTED)('%s を拒否する', (_label, url) => {
    expect(resolveRequest(RENDERER_DIR, url)).toBeNull()
  })

  it.each(NORMALIZED_BY_URL)('%s は URL 正規化で畳まれ、配下に収まる', (_label, url, expected) => {
    expect(resolveRequest(RENDERER_DIR, url)?.value).toBe(`${BASE}${expected}`)
  })

  it('解決できた場合は必ず同梱ディレクトリ配下である', () => {
    /*
     * 拒否の網羅だけでは「常に null を返す実装」でも通ってしまう。
     * **正常系が解決できること**と、**解決結果が必ず配下に収まること**を同時に見る。
     */
    const allowed = resolveRequest(RENDERER_DIR, 'app://bundle/assets/index.js')
    expect(allowed).not.toBeNull()
    expect(allowed?.value.startsWith(BASE)).toBe(true)
  })

  it('パスが空なら index.html に解決する', () => {
    expect(resolveRequest(RENDERER_DIR, 'app://bundle/')?.value).toBe(`${BASE}index.html`)
  })

  it('先頭ドットの名前は許す', () => {
    // 「`.` を含まない」と書くと `.vite` や `Ubuntu-26.04` を弾き、実装時に必ず緩められる。
    expect(resolveRequest(RENDERER_DIR, 'app://bundle/.vite/manifest.json')?.value).toBe(
      `${BASE}.vite\\manifest.json`
    )
  })
})

describe('contentSecurityPolicy — FR-040 の directive 集合', () => {
  /** FR-040 が名指す directive。**1 つでも欠けると「絞った」と言えない。** */
  const REQUIRED_DIRECTIVES = [
    'default-src',
    'script-src',
    'style-src',
    'img-src',
    'font-src',
    'connect-src',
    'object-src',
    'frame-ancestors',
    'base-uri',
    'form-action'
  ]

  it.each([
    ['パッケージ済み', null],
    ['開発', 'http://localhost:5173']
  ])('%s ビルドで必要な directive がすべて現れる', (_label, origin) => {
    const csp = contentSecurityPolicy(origin)
    for (const directive of REQUIRED_DIRECTIVES) {
      expect(csp).toContain(`${directive} `)
    }
  })

  it('パッケージ済みビルドは unsafe-inline を含まない', () => {
    expect(contentSecurityPolicy(null)).not.toContain('unsafe-inline')
  })

  it.each([
    ['パッケージ済み', null],
    ['開発', 'http://localhost:5173']
  ])('%s ビルドは unsafe-eval を含まない', (_label, origin) => {
    // **両環境で禁じる。** 緩和は `unsafe-inline` の dev 分岐に限る (AD-025 §7)。
    expect(contentSecurityPolicy(origin)).not.toContain('unsafe-eval')
  })

  it('開発ビルドの unsafe-inline は script-src と style-src に限られる', () => {
    /*
     * 「dev なら緩い」ではなく「dev の **どこが** 緩いか」を固定する。
     * `connect-src` や `img-src` に波及していれば、緩和の範囲が設計と食い違っている。
     */
    const csp = contentSecurityPolicy('http://localhost:5173')
    const relaxed = csp
      .split('; ')
      .filter((directive) => directive.includes("'unsafe-inline'"))
      .map((directive) => directive.split(' ')[0])
    expect(relaxed).toEqual(['script-src', 'style-src'])
  })

  it('パッケージ済みビルドは接続先を持たない', () => {
    expect(contentSecurityPolicy(null)).toContain("connect-src 'none'")
  })

  it('開発ビルドの接続先は dev サーバの http と ws に限られる', () => {
    const csp = contentSecurityPolicy('http://localhost:5173')
    expect(csp).toContain('connect-src http://localhost:5173 ws://localhost:5173')
  })
})
