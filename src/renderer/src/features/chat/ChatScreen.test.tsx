import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

import type { ThreadMessageLike } from '@assistant-ui/react'

import type { TranscriptMessageDTO } from '@domain/session/transcript-dto'
import type { FailureReason } from '@domain/session/target'

import { toThreadMessage } from './convert'

/**
 * FE-032 / FE-034 — `ChatScreen` の状態別描画と XSS 境界、及び composer 回帰 (SC-001/SC-005/SC-008)。
 *
 * `useTranscript` は mock し、view の状態を直接与える (取得配線の検証は `useTranscript.test.tsx`)。
 * **描画経路 (assistant-ui の Thread / MarkdownText / urlTransform) は本物**を通す — XSS 境界は
 * 実際のレンダリングでしか確かめられない。
 *
 * **composer 送信経路が閉じていることの回帰** (Principle VIII / [AD-024](docs/decisions/0024-constitution-verification-paths.md) #18) も
 * ここで維持する。R-1 から続くこの番人が、`isDisabled: true` の退行で送信経路が黙って復活するのを止める。
 */

const { view } = vi.hoisted(() => ({
  view: {
    messages: [] as readonly ThreadMessageLike[],
    status: 'idle' as 'idle' | 'loading' | 'ready' | 'empty' | 'failed',
    reasonKey: null as FailureReason | null,
    retry: (): void => {},
    hasSelection: false
  }
}))

vi.mock('./useTranscript', () => ({ useTranscript: () => view }))

import { ChatScreen } from './ChatScreen'

function textDto(id: string, text: string): TranscriptMessageDTO {
  return { id, role: 'assistant', parts: [{ type: 'text', text }], createdAt: null }
}

function ready(messages: readonly TranscriptMessageDTO[]): void {
  view.messages = messages.map(toThreadMessage)
  view.status = 'ready'
  view.hasSelection = true
}

beforeEach(() => {
  view.messages = []
  view.status = 'idle'
  view.reasonKey = null
  view.retry = () => {}
  view.hasSelection = false
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ChatScreen の状態別描画', () => {
  it('選択が無ければ案内を出し composer は描画しない', () => {
    render(<ChatScreen />)

    expect(screen.getByText('セッションを選ぶと会話が表示されます')).toBeInTheDocument()
    expect(screen.queryByLabelText('Message input')).not.toBeInTheDocument()
  })

  it('loading は読み込み表示を出す', () => {
    view.status = 'loading'
    view.hasSelection = true

    render(<ChatScreen />)

    expect(screen.getByText('transcript を読み込み中…')).toBeInTheDocument()
  })

  it('empty はメッセージ無しの案内を出す', () => {
    view.status = 'empty'
    view.hasSelection = true

    render(<ChatScreen />)

    expect(screen.getByText('このセッションにはメッセージがありません')).toBeInTheDocument()
  })

  it('failed はエラーと再取得ボタンを出し、押すと retry を呼ぶ', () => {
    const retry = vi.fn()
    view.status = 'failed'
    view.hasSelection = true
    view.retry = retry

    render(<ChatScreen />)

    expect(screen.getByText('transcript を取得できませんでした')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '再取得' }))
    expect(retry).toHaveBeenCalledTimes(1)
  })

  it('failed は reasonKey を transcript 向けの理由文言にする (AC-4 / 列挙語彙を出さない)', () => {
    view.status = 'failed'
    view.hasSelection = true
    view.reasonKey = 'distro-not-running'

    render(<ChatScreen />)

    expect(screen.getByText(/所在 \(WSL ディストロ\) が停止/)).toBeInTheDocument()
    // enumeration-failed でも「列挙」文言を出さない (transcript は列挙ではない)。
    view.reasonKey = 'enumeration-failed'
    const { container } = render(<ChatScreen />)
    expect(container.textContent).not.toContain('列挙')
  })
})

// **合成 fixture による描画・順序の検証** (SC-001 の SDK 等価性・実データ突合は quickstart V-1 実機。pr-gate H-003)。
describe('ChatScreen の変換済みメッセージ描画 (順序・fallback)', () => {
  it('メッセージを記録順に並べる', () => {
    ready([textDto('m1', '最初のメッセージ'), textDto('m2', '次のメッセージ')])

    render(<ChatScreen />)

    const first = screen.getByText('最初のメッセージ')
    const second = screen.getByText('次のメッセージ')
    expect(first).toBeInTheDocument()
    expect(second).toBeInTheDocument()
    // DOM 上で first が second より前にある (記録順)。
    expect(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('未定義 tool は fallback (tool group) で表示され潰れない', async () => {
    ready([
      {
        id: 'm-tool',
        role: 'assistant',
        parts: [
          {
            type: 'tool-call',
            toolCallId: 'call-1',
            toolName: 'mystery_tool',
            argsText: '{"q":1}',
            result: 'ok',
            isError: false
          }
        ],
        createdAt: null
      }
    ])

    render(<ChatScreen />)

    // 未登録の tool でも fallback の tool group が出る (件数トリガ)。
    const trigger = screen.getByText('1 tool call')
    expect(trigger).toBeInTheDocument()
    // 展開すると tool 名がそのまま出る (fallback)。
    fireEvent.click(trigger)
    expect(await screen.findByText('mystery_tool')).toBeInTheDocument()
  })
})

describe('ChatScreen の XSS 境界 (FR-020 / SC-008)', () => {
  it('生 HTML を描画せず javascript: リンクの href を無害化する', () => {
    ready([
      textDto(
        'm-xss',
        [
          '[危険リンク](javascript:alert(1))',
          '',
          '<script>window.__pwned=1</script>',
          '',
          '<img src=x onerror="window.__pwned=1">'
        ].join('\n')
      )
    ])

    const { container } = render(<ChatScreen />)

    // 生 HTML は要素化されない (rehype-raw 不採用)。
    expect(container.querySelector('script')).toBeNull()
    expect(container.querySelector('img')).toBeNull()

    // markdown リンクの href から javascript: が除去されている。
    const link = screen.getByText('危険リンク')
    expect(link.tagName).toBe('A')
    expect(link.getAttribute('href') ?? '').not.toContain('javascript')
  })
})

describe('ChatScreen の未完 markdown 耐性 (FR-010 / SC-005 / FE-051)', () => {
  it('未閉鎖コードフェンス・未閉鎖強調でも描画がクラッシュせず本文が出る', () => {
    ready([
      textDto(
        'm-partial',
        ['本文の途中', '', '```ts', 'const x = 1', '未閉鎖のフェンスと **強調が閉じない'].join('\n')
      )
    ])

    // 未完 markdown で throw しないこと自体が確認事項 (逐次伸長中の一瞬を模す)。
    expect(() => render(<ChatScreen />)).not.toThrow()
    expect(screen.getByText(/本文の途中/)).toBeInTheDocument()
    // コードフェンス内の文字列も失われない。
    expect(screen.getByText(/const x = 1/)).toBeInTheDocument()
  })
})

describe('ChatScreen の composer (Principle VIII 回帰)', () => {
  beforeEach(() => {
    // composer を検査するには Thread を mount する ready 状態が要る。
    ready([textDto('m1', 'こんにちは')])
  })

  it('composer は描画されるが入力が無効である', async () => {
    render(<ChatScreen />)

    const input = await screen.findByLabelText('Message input')

    expect(input).toBeDisabled()
  })

  it('変換確定直後の Enter が送信経路に届かない', async () => {
    render(<ChatScreen />)
    const input = await screen.findByLabelText('Message input')

    fireEvent.compositionStart(input)
    fireEvent.compositionEnd(input, { data: 'にほんご' })

    /*
     * `onNew` は到達時に throw する (未接続のまま送信できる状態を黙らせないため)。
     * したがって送信経路に届けば、この keyDown が例外として現れる。
     */
    expect(() => fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' })).not.toThrow()
    expect(screen.queryByText('にほんご')).not.toBeInTheDocument()
  })
})
