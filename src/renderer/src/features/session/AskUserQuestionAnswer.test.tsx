import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { axe } from 'vitest-axe'

import { AskUserQuestionAnswer } from './AskUserQuestionAnswer'
import { APPROVAL_CARD_LABELS } from './labels'

const AXE_RULES = { rules: { 'color-contrast': { enabled: false } } }

/** O-10 / US-1 AC1・AC3〜AC6 / SC-001 — 答える部品 (component)。回答は state だけに持つ。 */

const q = (
  question: string,
  labels: readonly string[],
  extra: Record<string, unknown> = {}
): Record<string, unknown> => ({
  question,
  header: 'h',
  options: labels.map((label) => ({ label, description: '' })),
  ...extra
})

const input = (...questions: Record<string, unknown>[]): string => JSON.stringify({ questions })

function setup(raw: string): {
  onSubmit: ReturnType<typeof vi.fn>
  onDeny: ReturnType<typeof vi.fn>
} {
  const onSubmit = vi.fn()
  const onDeny = vi.fn()
  render(<AskUserQuestionAnswer input={raw} onSubmit={onSubmit} onDeny={onDeny} />)
  return { onSubmit, onDeny }
}

const send = (): HTMLElement => screen.getByText(APPROVAL_CARD_LABELS.sendAnswers)

describe('AskUserQuestionAnswer', () => {
  it('問い 1 件・4 件で問いごとのグループが出て、群に問いの文の名前がある', () => {
    setup(input(q('A?', ['a1', 'a2'])))
    expect(screen.getByRole('group', { name: /A\?/ })).toBeInTheDocument()
  })

  it('4 件の問いで 4 つのグループが出る', () => {
    const { container } = render(
      <AskUserQuestionAnswer
        input={input(q('1', ['x']), q('2', ['x']), q('3', ['x']), q('4', ['x']))}
        onSubmit={() => {}}
        onDeny={() => {}}
      />
    )
    expect(container.querySelectorAll('fieldset')).toHaveLength(4)
  })

  it('単一: 選んだ選択肢の label を回答にして送る', () => {
    const { onSubmit } = setup(input(q('色は?', ['赤', '青'])))
    fireEvent.click(screen.getByLabelText(/青/))
    fireEvent.click(send())
    expect(onSubmit).toHaveBeenCalledWith(['青'])
  })

  it('複数: label を ", " でつなぎ、その他の自由記述を末尾に足す', () => {
    const { onSubmit } = setup(
      input(q('果物は?', ['りんご', 'みかん', 'ぶどう'], { multiSelect: true }))
    )
    fireEvent.click(screen.getByLabelText(/りんご/))
    fireEvent.click(screen.getByLabelText(/ぶどう/))
    fireEvent.click(screen.getByLabelText(APPROVAL_CARD_LABELS.other))
    fireEvent.change(screen.getByPlaceholderText(APPROVAL_CARD_LABELS.otherPlaceholder), {
      target: { value: 'もも' }
    })
    fireEvent.click(send())
    expect(onSubmit).toHaveBeenCalledWith(['りんご, ぶどう, もも'])
  })

  it('単一のその他: 書いた文が回答になる', () => {
    const { onSubmit } = setup(input(q('色は?', ['赤'])))
    fireEvent.click(screen.getByLabelText(APPROVAL_CARD_LABELS.other))
    fireEvent.change(screen.getByPlaceholderText(APPROVAL_CARD_LABELS.otherPlaceholder), {
      target: { value: '緑' }
    })
    fireEvent.click(send())
    expect(onSubmit).toHaveBeenCalledWith(['緑'])
  })

  it('未回答では押せず (aria-disabled)、未回答の問いが分かる', () => {
    const { onSubmit } = setup(input(q('A?', ['a']), q('B?', ['b'])))
    expect(send()).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByText(APPROVAL_CARD_LABELS.unanswered)).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('a'))
    fireEvent.click(send())
    expect(onSubmit).not.toHaveBeenCalled()
    const groups = document.querySelectorAll('fieldset')
    expect(groups[0]).not.toHaveAttribute('data-unanswered')
    expect(groups[1]).toHaveAttribute('data-unanswered', 'true')
    fireEvent.click(screen.getByLabelText('b'))
    expect(send()).toHaveAttribute('aria-disabled', 'false')
    fireEvent.click(send())
    expect(onSubmit).toHaveBeenCalledWith(['a', 'b'])
  })

  it('その他を選んで空白だけを書いた問いは未回答として扱われ押せない', () => {
    const { onSubmit } = setup(input(q('色は?', ['赤'])))
    fireEvent.click(screen.getByLabelText(APPROVAL_CARD_LABELS.other))
    fireEvent.change(screen.getByPlaceholderText(APPROVAL_CARD_LABELS.otherPlaceholder), {
      target: { value: '   ' }
    })
    expect(send()).toHaveAttribute('aria-disabled', 'true')
    fireEvent.click(send())
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('multiSelect で選択肢なし・その他が空白だけなら未回答', () => {
    const { onSubmit } = setup(input(q('果物は?', ['りんご'], { multiSelect: true })))
    fireEvent.click(screen.getByLabelText(APPROVAL_CARD_LABELS.other))
    fireEvent.change(screen.getByPlaceholderText(APPROVAL_CARD_LABELS.otherPlaceholder), {
      target: { value: '  ' }
    })
    expect(send()).toHaveAttribute('aria-disabled', 'true')
    fireEvent.click(send())
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('1,001 コードポイントのその他は送らず、理由が出てカードが残る', () => {
    const { onSubmit } = setup(input(q('色は?', ['赤'])))
    fireEvent.click(screen.getByLabelText(APPROVAL_CARD_LABELS.other))
    fireEvent.change(screen.getByPlaceholderText(APPROVAL_CARD_LABELS.otherPlaceholder), {
      target: { value: 'a'.repeat(1001) }
    })
    fireEvent.click(send())
    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByText(APPROVAL_CARD_LABELS.answerInvalid)).toBeInTheDocument()
    expect(send()).toBeInTheDocument()
  })

  it('「拒否」は onDeny を呼ぶ', () => {
    const { onDeny } = setup(input(q('A?', ['a'])))
    fireEvent.click(screen.getByText(APPROVAL_CARD_LABELS.deny))
    expect(onDeny).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['壊れた JSON', '{"questions":['],
    ['問いが 0 件', JSON.stringify({ questions: [] })],
    [
      '問いが 5 件',
      input(q('1', ['x']), q('2', ['x']), q('3', ['x']), q('4', ['x']), q('5', ['x']))
    ],
    ['重なる問いの文', input(q('A?', ['x']), q('A?', ['y']))]
  ])('読めない・答えられない (%s) では cannotAnswer と「拒否」だけ', (_name, raw) => {
    const { onDeny } = setup(raw)
    expect(screen.getByText(APPROVAL_CARD_LABELS.cannotAnswer)).toBeInTheDocument()
    expect(screen.queryByText(APPROVAL_CARD_LABELS.sendAnswers)).toBeNull()
    fireEvent.click(screen.getByText(APPROVAL_CARD_LABELS.deny))
    expect(onDeny).toHaveBeenCalledTimes(1)
  })

  it('vitest-axe の違反 0 (単一・複数・未回答)', async () => {
    const { container } = render(
      <AskUserQuestionAnswer
        input={input(q('A?', ['a', 'b']), q('B?', ['c'], { multiSelect: true }))}
        onSubmit={() => {}}
        onDeny={() => {}}
      />
    )
    expect((await axe(container, AXE_RULES)).violations).toEqual([])
  })
})
