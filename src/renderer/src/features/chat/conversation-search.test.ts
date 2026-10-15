import { describe, expect, it } from 'vitest'

import type { ThreadMessageLike } from '@assistant-ui/react'

import type { TranscriptMessageDTO } from '@domain/session/transcript-dto'

import {
  createConversationScanner,
  positionOf,
  reconcileCurrent,
  sameHit,
  stepHit,
  toSearchableMessage,
  type SearchHit
} from './conversation-search'
import { toThreadMessage } from './convert'

/** O-3 FE-020 — 会話内検索の走査と移動の純関数 (spec FR-003〜FR-005 / SC-002 / data-model §2)。 */

function text(
  id: string,
  body: string,
  role: 'user' | 'assistant' = 'assistant'
): ThreadMessageLike {
  return { id, role, content: [{ type: 'text', text: body }] }
}

function dto(message: TranscriptMessageDTO): ThreadMessageLike {
  return toThreadMessage(message)
}

const hit = (messageId: string, occurrence: number): SearchHit => ({ messageId, occurrence })

describe('toSearchableMessage (対象の作り方 / FR-004)', () => {
  it('user / assistant の text part だけを取る', () => {
    const message: ThreadMessageLike = {
      id: 'm1',
      role: 'assistant',
      content: [
        { type: 'text', text: '前半' },
        { type: 'reasoning', text: '考えている過程' },
        { type: 'tool-call', toolCallId: 'c1', toolName: 'Bash', args: {}, result: 'out' },
        { type: 'text', text: '後半' }
      ]
    }
    expect(toSearchableMessage(message)).toEqual({
      id: 'm1',
      role: 'assistant',
      texts: ['前半', '後半']
    })
  })

  it('文字列の content も 1 つの text として扱う', () => {
    expect(toSearchableMessage({ id: 'u', role: 'user', content: 'こんにちは' })).toEqual({
      id: 'u',
      role: 'user',
      texts: ['こんにちは']
    })
  })

  it('system の行・システムイベントの行・id の無いメッセージは対象にしない', () => {
    expect(toSearchableMessage({ id: 's', role: 'system', content: 'x' })).toBeNull()
    expect(toSearchableMessage({ role: 'assistant', content: 'x' })).toBeNull()
    const systemEvent = dto({
      id: 'hook:1',
      role: 'system',
      parts: [
        {
          type: 'system-event',
          category: 'hook',
          opens: true,
          name: '語',
          detail: '語',
          status: 'started'
        }
      ],
      createdAt: null
    })
    expect(toSearchableMessage(systemEvent)).toBeNull()
  })
})

describe('createConversationScanner (走査 / SC-002)', () => {
  it('語全体の出現をメッセージの並び → 出現の順で数える (重ならない出現)', () => {
    const scanner = createConversationScanner()
    const hits = scanner.scan(
      [text('a', 'りんご と りんご'), text('b', 'みかん'), text('c', 'りんごりんご')],
      'りんご'
    )
    expect(hits).toEqual([hit('a', 0), hit('a', 1), hit('c', 0), hit('c', 1)])
    // 重なる出現は数えない (`aa` の中の `aa` は 2 つでなく 1 つ)。
    expect(scanner.scan([text('x', 'aaa')], 'aa')).toEqual([hit('x', 0)])
  })

  it('語は FR-002 の正規化で比べ、語全体で探す (AND にしない)', () => {
    const scanner = createConversationScanner()
    const messages = [text('a', 'ＡＢＣ の 確認'), text('b', 'abc'), text('c', 'ｶﾞｲﾄﾞ')]
    expect(scanner.scan(messages, 'abc')).toEqual([hit('a', 0), hit('b', 0)])
    // 語全体の出現なので「abc 確認」は a の「ａｂｃ の 確認」に一致しない (AND ではない)。
    expect(scanner.scan(messages, 'abc 確認')).toEqual([])
    expect(scanner.scan(messages, 'ガイド')).toEqual([hit('c', 0)])
  })

  it('正規化した語が空 (空白・制御文字だけ) なら 0 件で、走査しない', () => {
    const scanner = createConversationScanner()
    expect(scanner.scan([text('a', 'x')], '   ')).toEqual([])
    expect(scanner.scan([text('a', 'x')], '​\u0007')).toEqual([])
    expect(scanner.counts()).toEqual({ fullScans: 0, messageScans: 0, normalizations: 0 })
  })

  it('検索語の正規表現の記号を字面で扱う', () => {
    const scanner = createConversationScanner()
    expect(scanner.scan([text('a', 'a.*b と (a+)+ と [')], '.*')).toEqual([hit('a', 0)])
    expect(scanner.scan([text('a', 'a.*b と (a+)+ と [')], '(a+)+')).toEqual([hit('a', 0)])
    expect(scanner.scan([text('a', 'a.*b と (a+)+ と [')], '[')).toEqual([hit('a', 0)])
  })

  it('語の変化では全件の走査が 1 回 (各メッセージを 1 回ずつ)、同じ語の走査し直しでは走査しない', () => {
    const scanner = createConversationScanner()
    const messages = [text('a', 'x'), text('b', 'y'), text('c', 'x')]
    scanner.scan(messages, 'x')
    expect(scanner.counts()).toEqual({ fullScans: 1, messageScans: 3, normalizations: 3 })
    scanner.scan(messages, 'x')
    expect(scanner.counts()).toEqual({ fullScans: 1, messageScans: 3, normalizations: 3 })
    // 語が変わっても正規化は覚えたものを使う (indexOf だけを回す)。
    scanner.scan(messages, 'y')
    expect(scanner.counts()).toEqual({ fullScans: 2, messageScans: 6, normalizations: 3 })
  })

  it('メッセージの追加・本文の伸び・送り直しでは、object が変わったメッセージだけを走査する', () => {
    const scanner = createConversationScanner()
    const a = text('a', '語')
    const b = text('b', 'ほか')
    scanner.scan([a, b], '語')
    expect(scanner.counts().messageScans).toBe(2)

    // 追加: 新しい 1 つだけ。
    const c = text('c', '語 と 語')
    expect(scanner.scan([a, b, c], '語')).toEqual([hit('a', 0), hit('c', 0), hit('c', 1)])
    expect(scanner.counts().messageScans).toBe(3)

    // ストリーミングで b の本文が伸びた (同じ id の別の object)。
    const b2 = text('b', 'ほか 語')
    expect(scanner.scan([a, b2, c], '語')).toEqual([
      hit('a', 0),
      hit('b', 0),
      hit('c', 0),
      hit('c', 1)
    ])
    expect(scanner.counts()).toEqual({ fullScans: 1, messageScans: 4, normalizations: 4 })

    // 送り直し (a が別の object に置き換わり、語を含まなくなった)。
    const a2 = text('a', 'なし')
    expect(scanner.scan([a2, b2, c], '語')).toEqual([hit('b', 0), hit('c', 0), hit('c', 1)])
    expect(scanner.counts()).toEqual({ fullScans: 1, messageScans: 5, normalizations: 5 })
  })

  it('tool の入力・結果・Reasoning・data part・システムイベントの行に一致しない (FR-004)', () => {
    const scanner = createConversationScanner()
    const messages = [
      dto({
        id: 't',
        role: 'assistant',
        parts: [
          {
            type: 'tool-call',
            toolCallId: 'c1',
            toolName: 'Bash',
            argsText: '{"command":"語"}',
            result: '語',
            isError: false,
            truncated: false,
            children: []
          },
          { type: 'reasoning', text: '語' }
        ],
        createdAt: null
      }),
      dto({
        id: 'hook:1',
        role: 'system',
        parts: [
          {
            type: 'system-event',
            category: 'hook',
            opens: true,
            name: '語',
            detail: '語',
            status: 'started'
          }
        ],
        createdAt: null
      }),
      { id: 'd', role: 'assistant', content: [{ type: 'data', name: 'x', data: { v: '語' } }] }
    ] satisfies ThreadMessageLike[]
    expect(scanner.scan(messages, '語')).toEqual([])
  })

  it('実行中の境界の行 (isSystemEventMessage) と他の data part は対象にしない', () => {
    const scanner = createConversationScanner()
    const messages = [
      dto({
        id: 'live',
        role: 'system',
        parts: [
          {
            type: 'system-event',
            category: 'compact-boundary',
            opens: true,
            name: '',
            detail: 'auto 10 5',
            status: 'marked'
          }
        ],
        createdAt: null
      })
    ]
    expect(scanner.scan(messages, '圧縮')).toEqual([])
  })

  it('添付のファイル名と圧縮の境界 (data part の見出し) は対象にする', () => {
    const scanner = createConversationScanner()
    const messages = [
      dto({
        id: 'u',
        role: 'user',
        parts: [{ type: 'file', filename: 'report.pdf', text: '' }],
        createdAt: null
      }),
      dto({
        id: 's',
        role: 'system',
        parts: [
          { type: 'divider', label: 'コンテキストを圧縮' },
          { type: 'text', text: '続き' }
        ],
        createdAt: null
      })
    ]
    expect(scanner.scan(messages, 'report')).toEqual([hit('u', 0)])
    // divider は compact-boundary の data part に写される (convert.ts)。検索は描かれる見出しを読む (O-6 FE-011)。
    expect(scanner.scan(messages, '圧縮')).toEqual([hit('s', 0)])
  })

  it('1,000 メッセージの走査の時間を参考値として出す (合否に使わない)', () => {
    const scanner = createConversationScanner()
    const messages = Array.from({ length: 1000 }, (_, i) =>
      text(
        `m${i}`,
        `メッセージ ${i} の本文。ＡＢＣ と ｶﾞｲﾄﾞ と 検索の語 を含む長めの文章 ${'あ'.repeat(200)}`
      )
    )
    const start = performance.now()
    const hits = scanner.scan(messages, '検索の語')
    const firstMs = performance.now() - start
    const again = performance.now()
    scanner.scan(messages, 'ガイド')
    const secondMs = performance.now() - again
    console.info(
      `[conversation-search] 1,000 メッセージ: 初回 (正規化を含む) ${firstMs.toFixed(1)}ms / 語の変化 ${secondMs.toFixed(1)}ms`
    )
    expect(hits).toHaveLength(1000)
  })
})

describe('current の維持と移動 (data-model §2「走査」「移動」)', () => {
  it('同じキーが残っていれば同じ object を指し続ける (US-2 AC5)', () => {
    const current = hit('b', 0)
    const next = [hit('a', 0), hit('b', 0), hit('c', 0)]
    expect(reconcileCurrent([hit('b', 0)], next, current)).toBe(current)
  })

  it('消えたら一番近い前の一致、前が無ければ最初の一致', () => {
    const previous = [hit('a', 0), hit('b', 0), hit('c', 0), hit('c', 1)]
    // c の 2 つめが消えた → 前の c の 1 つめ。
    expect(
      reconcileCurrent(previous, [hit('a', 0), hit('b', 0), hit('c', 0)], hit('c', 1))
    ).toEqual(hit('c', 0))
    // c がまるごと消えた → b。
    expect(reconcileCurrent(previous, [hit('a', 0), hit('b', 0)], hit('c', 0))).toEqual(hit('b', 0))
    // 前の一致がすべて消えた → 最初の一致。
    expect(reconcileCurrent(previous, [hit('z', 0)], hit('b', 0))).toEqual(hit('z', 0))
    // 一致が無くなった → null。
    expect(reconcileCurrent(previous, [], hit('a', 0))).toBeNull()
  })

  it('指していなかったところに一致が出たら最初の一致', () => {
    expect(reconcileCurrent([], [hit('a', 0)], null)).toEqual(hit('a', 0))
  })

  it('次 / 前で動き、端では反対の端へ戻る (US-2 AC2)', () => {
    const hits = [hit('a', 0), hit('a', 1), hit('b', 0)]
    expect(stepHit(hits, hit('a', 0), 1)).toEqual(hit('a', 1))
    expect(stepHit(hits, hit('b', 0), 1)).toEqual(hit('a', 0))
    expect(stepHit(hits, hit('a', 0), -1)).toEqual(hit('b', 0))
    expect(stepHit(hits, null, 1)).toEqual(hit('a', 0))
    expect(stepHit(hits, null, -1)).toEqual(hit('b', 0))
    expect(stepHit([], null, 1)).toBeNull()
  })

  it('位置は 1 から。指していなければ 0', () => {
    const hits = [hit('a', 0), hit('b', 0)]
    expect(positionOf(hits, hit('b', 0))).toBe(2)
    expect(positionOf(hits, null)).toBe(0)
    expect(positionOf(hits, hit('z', 0))).toBe(0)
  })

  it('sameHit はキーで比べる', () => {
    expect(sameHit(hit('a', 0), hit('a', 0))).toBe(true)
    expect(sameHit(hit('a', 0), hit('a', 1))).toBe(false)
    expect(sameHit(null, null)).toBe(true)
    expect(sameHit(hit('a', 0), null)).toBe(false)
  })
})
