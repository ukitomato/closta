import { describe, expect, it } from 'vitest'

import { MAX_SESSION_OFFSET, MAX_SESSIONS_PER_TARGET } from '@domain/validation'

import {
  PROTOCOL_VERSION,
  createLineAssembler,
  decodeRequest,
  decodeResponse,
  encodeRequest,
  encodeResponse,
  errorResponse,
  okResponse,
  type EnumerationResponseLine
} from './protocol'

/** BE-024 — 親子間のプロトコル (AD-030 / contracts C-1 / C-2 / C-3)。 */

const record = {
  sessionId: 'a-b-c',
  summary: 'まとめ',
  firstPrompt: null,
  customTitle: null,
  lastModified: 1,
  createdAt: null,
  fileSize: null,
  gitBranch: null,
  tag: null,
  cwd: '/home/y/project',
  programmatic: false
}

function request(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    kind: 'enumerate',
    version: PROTOCOL_VERSION,
    id: 1,
    targetKey: 'host#0',
    configDir: 'C:\\Users\\y\\.claude',
    scope: { kind: 'all' },
    ...overrides
  })
}

describe('decodeRequest', () => {
  it('全件の要求を読む', () => {
    expect(decodeRequest(request())).toEqual({
      kind: 'enumerate',
      version: PROTOCOL_VERSION,
      id: 1,
      targetKey: 'host#0',
      configDir: 'C:\\Users\\y\\.claude',
      scope: { kind: 'all' }
    })
  })

  it('先頭ページの要求を読む', () => {
    const decoded = decodeRequest(request({ scope: { kind: 'page', limit: 50, offset: 100 } }))

    expect(decoded?.scope).toEqual({ kind: 'page', limit: 50, offset: 100 })
  })

  it('要求を往復できる', () => {
    const line = encodeRequest({
      kind: 'enumerate',
      version: PROTOCOL_VERSION,
      id: 7,
      targetKey: 'wsl:Ubuntu#0',
      configDir: '\\\\wsl.localhost\\Ubuntu\\home\\y\\.claude',
      scope: { kind: 'page', limit: 10, offset: 0 }
    })

    expect(decodeRequest(line)?.configDir).toBe('\\\\wsl.localhost\\Ubuntu\\home\\y\\.claude')
  })

  it('版が違う要求を拒否する (古いバンドルの取り違え)', () => {
    expect(decodeRequest(request({ version: PROTOCOL_VERSION + 1 }))).toBeNull()
  })

  it.each([
    ['kind が違う', { kind: 'something' }],
    ['id が無い', { id: undefined }],
    ['id が負数', { id: -1 }],
    ['id が小数', { id: 1.5 }],
    ['targetKey が空', { targetKey: '' }],
    ['configDir が空', { configDir: '' }],
    ['configDir が文字列でない', { configDir: 123 }],
    ['scope が無い', { scope: undefined }],
    ['scope の kind が未知', { scope: { kind: 'everything' } }],
    ['limit が 0', { scope: { kind: 'page', limit: 0, offset: 0 } }],
    [
      'limit が上限超過',
      { scope: { kind: 'page', limit: MAX_SESSIONS_PER_TARGET + 1, offset: 0 } }
    ],
    ['offset が負数', { scope: { kind: 'page', limit: 10, offset: -1 } }],
    ['offset が上限超過', { scope: { kind: 'page', limit: 10, offset: MAX_SESSION_OFFSET + 1 } }]
  ])('形の合わない要求を拒否する (%s)', (_label, overrides) => {
    expect(decodeRequest(request(overrides))).toBeNull()
  })

  it.each([
    ['JSON でない', 'not json'],
    ['配列', '[]'],
    ['null', 'null']
  ])('解釈できない行を拒否する (%s)', (_label, line) => {
    expect(decodeRequest(line)).toBeNull()
  })
})

describe('encodeResponse / decodeResponse', () => {
  /** `response` のときだけ中身を返す。判定を素通しさせないため他は `null`。 */
  function responseOf(line: string): EnumerationResponseLine | null {
    const decoded = decodeResponse(line)
    return decoded.kind === 'response' ? decoded.value : null
  }

  it('成功応答を往復できる', () => {
    const response = okResponse(3, 'host#0', [record], false)

    expect(responseOf(encodeResponse(response))).toEqual(response)
  })

  it('失敗応答を往復できる', () => {
    const response = errorResponse(4, 'wsl:Ubuntu#0', 'permission-denied')

    expect(responseOf(encodeResponse(response))).toEqual(response)
  })

  it('1 行に収まる (要約に改行があっても行が割れない)', () => {
    const line = encodeResponse(okResponse(1, 'host#0', [{ ...record, summary: 'a\nb' }], false))

    expect(line).not.toContain('\n')
  })

  it('識別子を運ぶ (同じ対象への 2 要求を区別するため)', () => {
    expect(responseOf(encodeResponse(okResponse(42, 'host#0', [], false)))?.id).toBe(42)
  })

  it('版が違う応答は `malformed` になる', () => {
    const line = JSON.stringify({
      kind: 'ok',
      version: PROTOCOL_VERSION + 1,
      id: 1,
      targetKey: 'host#0',
      sessions: [],
      truncated: false
    })

    expect(decodeResponse(line)).toEqual({ kind: 'malformed', id: 1 })
  })

  /*
   * 要素の扱い (pr-gate Round 4 / 不変条件 2 / FR-049 / FR-004)。
   *
   * ## 前ラウンドから反転した点
   *
   * Round 2 は全項目を検査し、**1 件でも合わなければ応答ごと落として**
   * その所在を `failed` にしていた。`spec.md` の FR-049 は逆を決めている —
   * 「満たさない値は『不明』として扱う (**行は落とさない**)」。
   *
   * 落とすと (a) FR-004 / SC-006 の総数一致が所在単位で崩れ、
   * (b) 利用者には「再取得してください」しか出ないが**再取得しても同じ**である。
   *
   * したがって型違いは通し、`normalize.ts` が「不明」に倒す。
   * 落とすのは `sessionId` が使えない要素だけ — 鍵も表示も作れないためである。
   */
  function okLine(sessions: readonly unknown[]): string {
    return JSON.stringify({
      kind: 'ok',
      version: PROTOCOL_VERSION,
      id: 1,
      targetKey: 'host#0',
      sessions,
      truncated: false
    })
  }

  it.each([
    ['cwd が数値', { ...record, cwd: 123 }],
    ['summary が数値', { ...record, summary: 99 }],
    ['gitBranch がオブジェクト', { ...record, gitBranch: {} }],
    ['tag が配列', { ...record, tag: [] }],
    ['lastModified が文字列', { ...record, lastModified: 'いつか' }],
    ['fileSize が null', { ...record, fileSize: null }]
  ])('型の違う値を持つ要素も通す (行は落とさない) (%s)', (_label, odd) => {
    const decoded = responseOf(okLine([record, odd]))

    expect(decoded?.kind).toBe('ok')
    /* **2 件とも残る。** 値の不明さは `normalize.ts` が扱う。 */
    expect(decoded?.kind === 'ok' ? decoded.sessions : []).toHaveLength(2)
  })

  it.each([
    ['sessionId が数値', { ...record, sessionId: 12345 }],
    ['sessionId が空文字', { ...record, sessionId: '' }],
    ['sessionId が無い', { summary: 'x' }],
    ['要素が null', null],
    ['要素が配列', []]
  ])('識別子を作れない要素だけ間引く (%s)', (_label, bad) => {
    const decoded = responseOf(okLine([record, bad]))

    expect(decoded?.kind).toBe('ok')
    expect(decoded?.kind === 'ok' ? decoded.sessions : []).toHaveLength(1)
  })

  it('上限を超える件数の応答は `malformed` になる', () => {
    const many = Array.from({ length: MAX_SESSIONS_PER_TARGET + 1 }, (_, i) => ({
      ...record,
      sessionId: String(i)
    }))

    expect(decodeResponse(okLine(many))).toMatchObject({ kind: 'malformed' })
  })

  it('既知でない理由キーは `malformed` になる', () => {
    const line = JSON.stringify({
      kind: 'error',
      version: PROTOCOL_VERSION,
      id: 1,
      targetKey: 'host#0',
      reasonKey: 'something-else'
    })

    expect(decodeResponse(line)).toEqual({ kind: 'malformed', id: 1 })
  })

  /*
   * **「雑音」と「我々の応答だが形が不正」を分ける** (不変条件 2 / H3-003)。
   *
   * 以前はどちらも `null` で、`handleLine` が黙って捨てた結果
   * **10 秒の timeout まで宙づり**になっていた。`malformed` は即座に決着させ、
   * `not-a-response` は無視する (雑音で実行中の要求を巻き添えにしない)。
   */
  it.each([
    ['JSON でない', 'not json'],
    ['配列', '[]'],
    ['数値', '42'],
    ['null', 'null']
  ])('プロトコル行ですらない行は無視する (%s)', (_label, line) => {
    expect(decodeResponse(line)).toEqual({ kind: 'not-a-response' })
  })

  it.each([
    ['kind が無い', '{"version":2,"id":1,"targetKey":"host#0"}'],
    ['id が無い', '{"kind":"ok","version":2,"targetKey":"h","sessions":[],"truncated":false}'],
    [
      'targetKey が空',
      '{"kind":"ok","version":2,"id":1,"targetKey":"","sessions":[],"truncated":false}'
    ],
    [
      'sessions が配列でない',
      '{"kind":"ok","version":2,"id":1,"targetKey":"h","sessions":{},"truncated":false}'
    ],
    [
      'truncated が真偽でない',
      '{"kind":"ok","version":2,"id":1,"targetKey":"h","sessions":[],"truncated":"no"}'
    ]
  ])('封筒は読めるが形が合わない行は `malformed` になる (%s)', (_label, line) => {
    expect(decodeResponse(line)).toMatchObject({ kind: 'malformed' })
  })

  it('打ち切りの真偽をそのまま運ぶ (FR-038)', () => {
    expect(responseOf(encodeResponse(okResponse(1, 'host#0', [], true)))).toMatchObject({
      kind: 'ok',
      truncated: true
    })
  })
})

describe('createLineAssembler', () => {
  it('チャンクを跨いだ 1 行を組み立てる', () => {
    const lines: string[] = []
    const assemble = createLineAssembler((line) => lines.push(line))

    assemble('{"a"')
    assemble(':1}\n')

    expect(lines).toEqual(['{"a":1}'])
  })

  it('改行が来るまで渡さない', () => {
    const lines: string[] = []
    const assemble = createLineAssembler((line) => lines.push(line))

    assemble('incomplete')

    expect(lines).toEqual([])
  })

  it('1 チャンクに複数行あれば全部渡す', () => {
    const lines: string[] = []
    const assemble = createLineAssembler((line) => lines.push(line))

    assemble('a\nb\n\nc\n')

    expect(lines).toEqual(['a', 'b', 'c'])
  })
})
