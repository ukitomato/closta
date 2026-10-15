import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'

import type { ToolCallMessagePartProps, ToolCallMessagePartStatus } from '@assistant-ui/react'

import { ASK_USER_QUESTION_LABELS, TOOL_RESULT_LABELS } from '@/features/chat/labels'
import { LiveProgressContext, type LiveProgressSource } from '@/features/chat/transcript-context'
import { setToolResultContext } from '@/test-support/tool-result-mock'

import { AskUserQuestion } from './ask-user-question.aui'
import { ToolFallback } from './tool-fallback.aui'

vi.mock('@/features/chat/transcript-context', async (importOriginal) =>
  (await import('@/test-support/tool-result-mock')).withToolResultMock(await importOriginal())
)

beforeEach(() => {
  setToolResultContext({})
})

/**
 * O-5 FE-013 — `AskUserQuestion` の読み取り専用の表示 (015 spec US-1 AC7 / AC9。data-model §1)。
 */

const AXE_RULES = { rules: { 'color-contrast': { enabled: false } } }

const QUESTIONS = [
  {
    question: '日付の形式はどれにしますか?',
    header: '形式',
    options: [
      { label: 'ISO', description: '2026-10-10 の形', preview: 'PREVIEW_SECRET' },
      { label: '和暦', description: '令和の形' }
    ],
    multiSelect: false
  },
  {
    question: 'どの機能を有効にしますか?',
    header: '機能',
    options: [
      { label: '検索', description: '会話内の検索' },
      { label: '通知', description: '終了の通知' },
      { label: '共有', description: '' }
    ],
    multiSelect: true
  }
]

function partProps(
  input: unknown,
  over: Partial<ToolCallMessagePartProps> = {}
): ToolCallMessagePartProps {
  return {
    type: 'tool-call',
    toolCallId: 'toolu_q',
    toolName: 'AskUserQuestion',
    args: {},
    argsText: typeof input === 'string' ? input : JSON.stringify(input),
    result: undefined,
    isError: false,
    status: { type: 'complete' },
    addResult: () => {},
    resume: () => {},
    ...over
  } as unknown as ToolCallMessagePartProps
}

function liveSource(elapsed: number | null): LiveProgressSource {
  return {
    toolElapsed: () => elapsed,
    thinkingTokens: () => null,
    mcpServerNames: () => [],
    subscribe: () => () => {}
  }
}

const slots = (root: ParentNode, name: string): HTMLElement[] =>
  Array.from(root.querySelectorAll<HTMLElement>(`[data-slot="${name}"]`))

describe('AskUserQuestion の表示 (US-1 AC7)', () => {
  it('問い・見出し・選択肢と説明・複数選択の印が出て、preview は出さない', () => {
    const { container } = render(<AskUserQuestion {...partProps({ questions: QUESTIONS })} />)
    expect(slots(container, 'ask-user-question-text').map((el) => el.textContent)).toEqual([
      '日付の形式はどれにしますか?',
      'どの機能を有効にしますか?'
    ])
    expect(slots(container, 'ask-user-question-header').map((el) => el.textContent)).toEqual([
      '形式',
      '機能'
    ])
    expect(slots(container, 'ask-user-question-option')).toHaveLength(5)
    expect(container).toHaveTextContent('2026-10-10 の形')
    expect(container).toHaveTextContent('終了の通知')
    expect(slots(container, 'ask-user-question-multi')).toHaveLength(1)
    expect(slots(container, 'ask-user-question-multi')[0]).toHaveTextContent(
      ASK_USER_QUESTION_LABELS.multiSelect
    )
    expect(container.textContent).not.toContain('PREVIEW_SECRET')
    expect(container.querySelector('[data-selected="true"]')).toBeNull()
  })

  it('ボタンや入力欄が DOM に無い (回答は O-10)', () => {
    const { container } = render(
      <AskUserQuestion
        {...partProps(
          { questions: QUESTIONS },
          { status: { type: 'requires-action', reason: 'interrupt' } }
        )}
      />
    )
    expect(container.querySelector('button, input, textarea, select, [role="button"]')).toBeNull()
  })

  it('answers のある過去ログで選ばれた選択肢が分かる (単一・複数選択)', () => {
    const { container } = render(
      <AskUserQuestion
        {...partProps({
          questions: QUESTIONS,
          answers: {
            '日付の形式はどれにしますか?': '和暦',
            'どの機能を有効にしますか?': '検索, 共有'
          }
        })}
      />
    )
    const selected = Array.from(container.querySelectorAll<HTMLElement>('[data-selected="true"]'))
    expect(selected.map((el) => el.querySelector('.font-medium')?.textContent)).toEqual([
      '和暦',
      '検索',
      '共有'
    ])
    for (const el of selected)
      expect(el).toHaveTextContent(ASK_USER_QUESTION_LABELS.selectedAnswer)
  })

  it('選択肢に当たらない回答は回答の文をそのまま出す', () => {
    const { container } = render(
      <AskUserQuestion
        {...partProps({
          questions: QUESTIONS.slice(0, 1),
          answers: { '日付の形式はどれにしますか?': '自由に書いた答え' }
        })}
      />
    )
    expect(slots(container, 'ask-user-question-answer')[0]).toHaveTextContent('自由に書いた答え')
  })

  it('answers のキーが問いに無い・__proto__ / constructor のキーで例外が出ない', () => {
    const argsText = `{"questions":${JSON.stringify(QUESTIONS)},"answers":{"__proto__":"ISO","constructor":"x","無い問い":"ISO","toString":1}}`
    const { container } = render(<AskUserQuestion {...partProps(argsText)} />)
    expect(container.querySelector('[data-slot="aui_ask-user-question"]')).not.toBeNull()
    expect(container.querySelector('[data-selected="true"]')).toBeNull()
  })

  it('問いの文が __proto__ でも Map で引けて例外が出ない', () => {
    const argsText = `{"questions":[{"question":"__proto__","header":"h","options":[{"label":"A","description":""},{"label":"B","description":""}],"multiSelect":false}],"answers":{"__proto__":"B"}}`
    const { container } = render(<AskUserQuestion {...partProps(argsText)} />)
    const selected = container.querySelector<HTMLElement>('[data-selected="true"]')
    expect(selected).toHaveTextContent('B')
  })

  it.each([
    'not json',
    '{}',
    '{"questions":[]}',
    '{"questions":[{"question":1,"options":[]}]}',
    '{"questions":[{"question":"q","options":[{"description":"no label"}]}]}',
    '[1,2]'
  ])('形の外れた入力 %s は ToolFallback (JSON の表示) に倒す', (argsText) => {
    const { container } = render(<AskUserQuestion {...partProps(argsText)} />)
    expect(container.querySelector('[data-slot="aui_ask-user-question"]')).toBeNull()
    expect(container.querySelector('[data-slot="tool-fallback-root"]')).not.toBeNull()
  })

  it('vitest-axe の違反 0', async () => {
    const { container } = render(
      <AskUserQuestion
        {...partProps({
          questions: QUESTIONS,
          answers: { '日付の形式はどれにしますか?': 'ISO' }
        })}
      />
    )
    expect((await axe(container, AXE_RULES)).violations).toEqual([])
  })
})

describe('AskUserQuestion の状態の印は ToolFallback と同じ (US-1 AC9)', () => {
  const cases: readonly {
    readonly name: string
    readonly status: ToolCallMessagePartStatus
    readonly ctx: Parameters<typeof setToolResultContext>[0]
    readonly result: unknown
    readonly isError: boolean
  }[] = [
    {
      name: '結果待ち',
      status: { type: 'running' },
      ctx: { live: true, runState: 'running' },
      result: undefined,
      isError: false
    },
    {
      name: '承認待ち',
      status: { type: 'requires-action', reason: 'interrupt' },
      ctx: { live: true, runState: 'awaiting_permission' },
      result: undefined,
      isError: false
    },
    {
      name: '結果不明',
      status: { type: 'incomplete', reason: 'cancelled' },
      ctx: { live: false },
      result: undefined,
      isError: false
    },
    {
      name: 'incomplete のエラー',
      status: { type: 'incomplete', reason: 'error', error: 'boom' },
      ctx: { live: false },
      result: 'boom',
      isError: true
    }
  ]

  it.each(cases)('$name', (c) => {
    setToolResultContext(c.ctx)
    const props = partProps(
      { questions: QUESTIONS },
      { status: c.status, result: c.result, isError: c.isError }
    )
    const fallback = render(
      <LiveProgressContext.Provider value={liveSource(9)}>
        <ToolFallback {...props} />
      </LiveProgressContext.Provider>
    )
    const q = (root: ParentNode, name: string): HTMLElement | null =>
      root.querySelector<HTMLElement>(`[data-slot="${name}"]`)
    const fbIcon = q(fallback.container, 'tool-fallback-trigger-icon')!.outerHTML
    const fbCancelled = q(fallback.container, 'tool-fallback-trigger-label')!.classList.contains(
      'line-through'
    )
    const fbElapsed = q(fallback.container, 'tool-result-elapsed')?.textContent ?? null
    const fbError = q(fallback.container, 'tool-result-error') !== null
    fallback.unmount()

    const view = render(
      <LiveProgressContext.Provider value={liveSource(9)}>
        <AskUserQuestion {...props} />
      </LiveProgressContext.Provider>
    )
    expect(q(view.container, 'tool-fallback-trigger-icon')!.outerHTML).toBe(fbIcon)
    expect(
      q(view.container, 'ask-user-question-heading')!.classList.contains('line-through')
    ).toBe(fbCancelled)
    expect(q(view.container, 'tool-result-elapsed')?.textContent ?? null).toBe(fbElapsed)
    expect(q(view.container, 'tool-result-error') !== null).toBe(fbError)
    if (c.name === '結果待ち') expect(fbElapsed).toBe(TOOL_RESULT_LABELS.toolElapsed(9))
  })
})
