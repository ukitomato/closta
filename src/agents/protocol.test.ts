import { describe, expect, it } from 'vitest'

import { MAX_SESSIONS_PER_TARGET } from '@domain/validation'

import {
  PROTOCOL_VERSION,
  decodeResponse,
  encodeResponse,
  errorResponse,
  okResponse,
  parseEnumerationArgs
} from './protocol'

/** BE-024 — 親子間のプロトコル (contracts C-1 / C-2 / C-3)。 */

describe('parseEnumerationArgs', () => {
  it('全件の要求を読む', () => {
    const result = parseEnumerationArgs(['--target-key=wsl:Ubuntu#0', '--scope=all'])

    expect(result).toEqual({
      ok: true,
      args: { targetKey: 'wsl:Ubuntu#0', scope: { kind: 'all' } }
    })
  })

  it('先頭ページの要求を読む', () => {
    const result = parseEnumerationArgs([
      '--target-key=host#0',
      '--scope=page',
      '--limit=50',
      '--offset=0'
    ])

    expect(result).toEqual({
      ok: true,
      args: { targetKey: 'host#0', scope: { kind: 'page', limit: 50, offset: 0 } }
    })
  })

  it('`--target-key` が無ければ拒否する', () => {
    expect(parseEnumerationArgs(['--scope=all'])).toEqual({
      ok: false,
      reason: 'missing-target-key'
    })
  })

  it('`--target-key` が空文字なら拒否する', () => {
    expect(parseEnumerationArgs(['--target-key=', '--scope=all'])).toEqual({
      ok: false,
      reason: 'missing-target-key'
    })
  })

  it('`--scope` を省略しても既定値へ倒さない (SC-008 の予算が静かに破れる)', () => {
    expect(parseEnumerationArgs(['--target-key=host#0'])).toEqual({
      ok: false,
      reason: 'invalid-scope'
    })
  })

  it('未知の `--scope` を拒否する', () => {
    expect(parseEnumerationArgs(['--target-key=host#0', '--scope=everything'])).toEqual({
      ok: false,
      reason: 'invalid-scope'
    })
  })

  it.each([
    ['負数', '--limit=-1'],
    ['0 件', '--limit=0'],
    ['小数', '--limit=1.5'],
    ['数値でない', '--limit=abc'],
    ['上限超過', `--limit=${MAX_SESSIONS_PER_TARGET + 1}`],
    ['欠落', '--limit-typo=50']
  ])('不正な `--limit` を拒否する (%s)', (_label, arg) => {
    expect(
      parseEnumerationArgs(['--target-key=host#0', '--scope=page', arg, '--offset=0'])
    ).toEqual({ ok: false, reason: 'invalid-limit' })
  })

  it.each([
    ['負数', '--offset=-1'],
    ['小数', '--offset=0.5'],
    ['数値でない', '--offset=x'],
    ['欠落', '--offset-typo=0']
  ])('不正な `--offset` を拒否する (%s)', (_label, arg) => {
    expect(
      parseEnumerationArgs(['--target-key=host#0', '--scope=page', '--limit=50', arg])
    ).toEqual({ ok: false, reason: 'invalid-offset' })
  })

  it('`--name value` 形式を受け付けない (曖昧になる)', () => {
    expect(parseEnumerationArgs(['--target-key', 'host#0', '--scope', 'all'])).toEqual({
      ok: false,
      reason: 'missing-target-key'
    })
  })
})

describe('encodeResponse / decodeResponse', () => {
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

  it('成功応答を往復できる', () => {
    const response = okResponse('host#0', [record], false)

    expect(decodeResponse(encodeResponse(response))).toEqual(response)
  })

  it('失敗応答を往復できる', () => {
    const response = errorResponse('wsl:Ubuntu#0', 'permission-denied')

    expect(decodeResponse(encodeResponse(response))).toEqual(response)
  })

  it('1 行に収まる (要約に改行があっても行が割れない)', () => {
    const line = encodeResponse(okResponse('host#0', [{ ...record, summary: 'a\nb' }], false))

    expect(line).not.toContain('\n')
  })

  it('版が違う応答を拒否する (古いバンドルの取り違え)', () => {
    const line = JSON.stringify({
      kind: 'ok',
      version: PROTOCOL_VERSION + 1,
      targetKey: 'host#0',
      sessions: [],
      truncated: false
    })

    expect(decodeResponse(line)).toBeNull()
  })

  it('既知でない理由キーを拒否する', () => {
    const line = JSON.stringify({
      kind: 'error',
      version: PROTOCOL_VERSION,
      targetKey: 'host#0',
      reasonKey: 'something-else'
    })

    expect(decodeResponse(line)).toBeNull()
  })

  it.each([
    ['JSON でない', 'not json'],
    ['配列', '[]'],
    ['null', 'null'],
    ['kind が無い', '{"version":1,"targetKey":"host#0"}'],
    ['targetKey が空', '{"kind":"ok","version":1,"targetKey":"","sessions":[],"truncated":false}'],
    [
      'sessions が配列でない',
      '{"kind":"ok","version":1,"targetKey":"h","sessions":{},"truncated":false}'
    ],
    [
      'truncated が真偽でない',
      '{"kind":"ok","version":1,"targetKey":"h","sessions":[],"truncated":"no"}'
    ]
  ])('形が合わない応答を拒否する (%s)', (_label, line) => {
    expect(decodeResponse(line)).toBeNull()
  })

  it('打ち切りの真偽をそのまま運ぶ (FR-038)', () => {
    const decoded = decodeResponse(encodeResponse(okResponse('host#0', [], true)))

    expect(decoded).toMatchObject({ kind: 'ok', truncated: true })
  })
})
