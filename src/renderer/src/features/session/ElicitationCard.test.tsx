import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { axe } from 'vitest-axe'

import type { ElicitationField, ElicitationPrompt } from '@domain/session/elicitation'

import { ElicitationCard } from './ElicitationCard'
import { ELICITATION_LABELS } from './labels'

const AXE_RULES = { rules: { 'color-contrast': { enabled: false } } }

/** O-10 FE-021 — MCP サーバーの問いのカード (018 data-model §3 / §5。SC-003 / SC-004)。 */

const REQ = '11111111-1111-4111-8111-111111111111'

function formPrompt(
  fields: readonly ElicitationField[] | null,
  over: Partial<ElicitationPrompt> = {}
): ElicitationPrompt {
  return {
    requestId: REQ,
    serverName: 'github',
    title: '',
    message: '',
    mode: 'form',
    url: null,
    fields,
    ...over
  }
}

const strField = (over: Partial<ElicitationField> = {}): ElicitationField =>
  ({
    key: 'name',
    label: 'お名前',
    description: '',
    required: false,
    type: 'string',
    ...over
  }) as ElicitationField

function urlPrompt(openUrl: string | null): ElicitationPrompt {
  return {
    requestId: REQ,
    serverName: 'github',
    title: '',
    message: '',
    mode: 'url',
    url: { openUrl, displayUrl: openUrl ?? 'javascript:x', host: openUrl === null ? '' : 'example.com' },
    fields: null
  }
}

describe('ElicitationCard — 見出しと本文 (plain text)', () => {
  it('サーバー名の見出し・title・message を plain text で出し、HTML として解釈しない', () => {
    const payload = '<img src=x onerror="alert(1)">'
    const { container } = render(
      <ElicitationCard
        prompt={formPrompt([strField()], { title: payload, message: '[link](https://x.test)' })}
        remaining={0}
        onRespond={() => {}}
      />
    )
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('a')).toBeNull()
    expect(screen.getByText('github からの問い')).toBeTruthy()
    expect(screen.getByText(payload)).toBeTruthy()
    expect(screen.getByRole('alertdialog')).toBeTruthy()
  })

  it('サーバー名が空なら「MCP サーバー」・残りがあれば件数を出す', () => {
    render(
      <ElicitationCard
        prompt={formPrompt([strField()], { serverName: '' })}
        remaining={2}
        onRespond={() => {}}
      />
    )
    expect(screen.getByText('MCP サーバー からの問い')).toBeTruthy()
    expect(screen.getByText(ELICITATION_LABELS.remaining(2))).toBeTruthy()
  })
})

describe('ElicitationCard — form', () => {
  it('入力を送ると accept と content を渡す。空の任意の string はキーごと省く', () => {
    const onRespond = vi.fn()
    render(
      <ElicitationCard
        prompt={formPrompt([
          strField(),
          strField({ key: 'memo', label: 'メモ' }),
          { key: 'n', label: '数', description: '', required: false, type: 'integer' },
          { key: 'ok', label: '同意', description: '', required: false, type: 'boolean' }
        ])}
        remaining={0}
        onRespond={onRespond}
      />
    )
    fireEvent.change(screen.getByLabelText('お名前'), { target: { value: 'O10-MARKER-xyz' } })
    fireEvent.change(screen.getByLabelText('数'), { target: { value: '3' } })
    fireEvent.click(screen.getByLabelText('同意'))
    fireEvent.click(screen.getByText(ELICITATION_LABELS.submit))
    expect(onRespond).toHaveBeenCalledWith('accept', { name: 'O10-MARKER-xyz', n: 3, ok: true })
  })

  it('全部が任意で何も入れなければ content は boolean だけ ({} になりうる)', () => {
    const onRespond = vi.fn()
    render(<ElicitationCard prompt={formPrompt([strField()])} remaining={0} onRespond={onRespond} />)
    fireEvent.click(screen.getByText(ELICITATION_LABELS.submit))
    expect(onRespond).toHaveBeenCalledWith('accept', {})
  })

  it('必須が空なら送らず invalid を出し、カードは残る。入力し直すと消える', () => {
    const onRespond = vi.fn()
    render(
      <ElicitationCard
        prompt={formPrompt([strField({ required: true })])}
        remaining={0}
        onRespond={onRespond}
      />
    )
    expect(screen.getByText(`(${ELICITATION_LABELS.required})`)).toBeTruthy()
    fireEvent.click(screen.getByText(ELICITATION_LABELS.submit))
    expect(onRespond).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toBe(ELICITATION_LABELS.invalid)
    fireEvent.change(screen.getByLabelText(/お名前/), { target: { value: 'x' } })
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('範囲外の数・整数でない値は送らない', () => {
    const onRespond = vi.fn()
    render(
      <ElicitationCard
        prompt={formPrompt([
          { key: 'n', label: '数', description: '', required: false, type: 'integer', maximum: 5 }
        ])}
        remaining={0}
        onRespond={onRespond}
      />
    )
    fireEvent.change(screen.getByLabelText('数'), { target: { value: '9' } })
    fireEvent.click(screen.getByText(ELICITATION_LABELS.submit))
    fireEvent.change(screen.getByLabelText('数'), { target: { value: '1.5' } })
    fireEvent.click(screen.getByText(ELICITATION_LABELS.submit))
    expect(onRespond).not.toHaveBeenCalled()
  })

  it('列挙は未選択ならキーを省き、選ぶと値を送る', () => {
    const onRespond = vi.fn()
    render(
      <ElicitationCard
        prompt={formPrompt([
          {
            key: 'c',
            label: '色',
            description: '',
            required: false,
            type: 'enum',
            options: [{ value: 'r', label: '赤' }]
          }
        ])}
        remaining={0}
        onRespond={onRespond}
      />
    )
    fireEvent.click(screen.getByText(ELICITATION_LABELS.submit))
    expect(onRespond).toHaveBeenLastCalledWith('accept', {})
    fireEvent.change(screen.getByLabelText('色'), { target: { value: 'r' } })
    fireEvent.click(screen.getByText(ELICITATION_LABELS.submit))
    expect(onRespond).toHaveBeenLastCalledWith('accept', { c: 'r' })
  })

  it('Enter では送らない・パスワード欄を出さない', () => {
    const onRespond = vi.fn()
    const { container } = render(
      <ElicitationCard prompt={formPrompt([strField()])} remaining={0} onRespond={onRespond} />
    )
    fireEvent.keyDown(screen.getByLabelText('お名前'), { key: 'Enter' })
    expect(onRespond).not.toHaveBeenCalled()
    expect(container.querySelector('input[type="password"]')).toBeNull()
    expect(container.querySelector('form')).toBeNull()
  })

  it('断る・取り消すは content なし', () => {
    const onRespond = vi.fn()
    render(<ElicitationCard prompt={formPrompt([strField()])} remaining={0} onRespond={onRespond} />)
    fireEvent.click(screen.getByText(ELICITATION_LABELS.decline))
    fireEvent.click(screen.getByText(ELICITATION_LABELS.cancel))
    expect(onRespond).toHaveBeenNthCalledWith(1, 'decline')
    expect(onRespond).toHaveBeenNthCalledWith(2, 'cancel')
  })

  it('fields が null (部分集合の外) は unsupported と断る・取り消すだけ', () => {
    render(<ElicitationCard prompt={formPrompt(null)} remaining={0} onRespond={() => {}} />)
    expect(screen.getByText(ELICITATION_LABELS.unsupported)).toBeTruthy()
    expect(screen.queryByText(ELICITATION_LABELS.submit)).toBeNull()
    expect(screen.getByText(ELICITATION_LABELS.decline)).toBeTruthy()
    expect(screen.getByText(ELICITATION_LABELS.cancel)).toBeTruthy()
  })

  it('axe の違反が無い', async () => {
    const { container } = render(
      <ElicitationCard
        prompt={formPrompt([strField({ required: true, description: '説明' })], {
          title: 't',
          message: 'm'
        })}
        remaining={1}
        onRespond={() => {}}
      />
    )
    expect((await axe(container, AXE_RULES)).violations).toEqual([])
  })
})

describe('ElicitationCard — URL', () => {
  it('リンクは新しいタブ・noopener で、押すと content なしの accept を渡し、既定の動作は止めない', () => {
    const onRespond = vi.fn()
    render(<ElicitationCard prompt={urlPrompt('https://example.com/x')} remaining={0} onRespond={onRespond} />)
    const link = screen.getByRole('link')
    expect(link.getAttribute('href')).toBe('https://example.com/x')
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toBe('noreferrer noopener')
    expect(screen.getByText(ELICITATION_LABELS.openUrlNote)).toBeTruthy()
    expect(screen.queryByText(ELICITATION_LABELS.submit)).toBeNull()
    const notPrevented = fireEvent.click(link)
    expect(notPrevented).toBe(true)
    expect(onRespond).toHaveBeenCalledWith('accept')
  })

  it('開けない URL はリンクを出さず cannotOpenUrl と断る・取り消すだけ', () => {
    render(<ElicitationCard prompt={urlPrompt(null)} remaining={0} onRespond={() => {}} />)
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.getByText(ELICITATION_LABELS.cannotOpenUrl)).toBeTruthy()
    expect(screen.getByText(ELICITATION_LABELS.decline)).toBeTruthy()
  })
})
