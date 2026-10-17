import { useId, useMemo, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { parseAskUserQuestionArgs, type Question } from '@/features/chat/ask-user-question-args'
import { ASK_USER_QUESTION_LABELS } from '@/features/chat/labels'
import { ANSWER_MAX_COUNT, isPermissionAnswers } from '@domain/session/agent-session'

import { APPROVAL_CARD_LABELS } from './labels'

/**
 * `AskUserQuestion` の答える部品 (O-10 / US-1 / AD-052。018 data-model §1 / research R-01・R-03)。
 *
 * 承認カードの中で、問いごとにラジオ (単一) かチェック (`multiSelect`) と「その他」(自由に書く) を出す。
 * 回答は**この component の state だけ**に持つ (ストアにもログにも残さない。FR-009)。
 * 全部の問いに答える (回答の文字列が前後の空白を除いて 1 コードポイント以上) まで「回答を送る」は
 * `aria-disabled` で、未回答の問いに印を出す (U-6 (a))。送る前に domain の `isPermissionAnswers`
 * (main・agents と同じ関数) を呼び、外れたら送らずに理由を出す (カードは外れない。U-6 (e) / U-9)。
 * 読めない・問いが 0 件か 5 件以上・問いの文が重なるときは `cannotAnswer` と「拒否」だけを出す。
 *
 * registry の Question flow は採らない (`header` のチップと `multiSelect` を持たない。research SH-002 の結論)。
 * 問いの表示は `ask-user-question.aui.tsx` の `parseAskUserQuestionArgs` と同じ読み方・同じ見た目の語彙を使う。
 */

interface QuestionState {
  /** 選んだ選択肢の位置 (単一は高々 1 つ)。 */
  readonly picked: readonly number[]
  /** 「その他」を選んでいるか。 */
  readonly otherOn: boolean
  readonly otherText: string
}

const EMPTY_STATE: QuestionState = { picked: [], otherOn: false, otherText: '' }

/** 問いごとの回答の文字列 (research R-03 / data-model §1)。選んでいなければ空文字。 */
function answerText(question: Question, state: QuestionState): string {
  if (!question.multiSelect) {
    if (state.otherOn) return state.otherText
    const index = state.picked[0]
    return index === undefined ? '' : (question.options[index]?.label ?? '')
  }
  const parts = [...state.picked].sort((a, b) => a - b).map((i) => question.options[i]?.label ?? '')
  if (state.otherOn && state.otherText.trim().length > 0) parts.push(state.otherText)
  return parts.join(', ')
}

/** 読めて、答えられる問いの組か (件数・問いの文の重なり)。 */
function readQuestions(input: string): readonly Question[] | null {
  const parsed = parseAskUserQuestionArgs(input)
  if (parsed === null) return null
  const { questions } = parsed
  if (questions.length < 1 || questions.length > ANSWER_MAX_COUNT) return null
  if (new Set(questions.map((q) => q.question)).size !== questions.length) return null
  return questions
}

function QuestionGroup({
  question,
  state,
  unanswered,
  onChange
}: {
  readonly question: Question
  readonly state: QuestionState
  readonly unanswered: boolean
  readonly onChange: (next: QuestionState) => void
}): React.JSX.Element {
  const name = useId()
  const type = question.multiSelect ? 'checkbox' : 'radio'

  const toggle = (index: number): void => {
    if (question.multiSelect) {
      onChange({
        ...state,
        picked: state.picked.includes(index)
          ? state.picked.filter((i) => i !== index)
          : [...state.picked, index]
      })
    } else {
      onChange({ ...state, picked: [index], otherOn: false })
    }
  }
  const toggleOther = (): void => {
    if (question.multiSelect) onChange({ ...state, otherOn: !state.otherOn })
    else onChange({ ...state, picked: [], otherOn: true })
  }

  return (
    <fieldset
      data-slot="ask-user-question-answer-group"
      data-unanswered={unanswered ? 'true' : undefined}
      className={
        unanswered
          ? 'border-destructive/60 flex flex-col gap-1.5 rounded-md border p-2'
          : 'border-border/60 flex flex-col gap-1.5 rounded-md border p-2'
      }
    >
      <legend className="flex flex-wrap items-center gap-2 px-1 text-sm">
        {question.header !== '' ? (
          <Badge variant="secondary" className="max-w-full truncate">
            {question.header}
          </Badge>
        ) : null}
        {question.multiSelect ? (
          <span className="text-muted-foreground text-xs">
            {ASK_USER_QUESTION_LABELS.multiSelect}
          </span>
        ) : null}
        <span className="text-foreground font-medium">{question.question}</span>
      </legend>
      {question.options.map((option, i) => (
        <label key={i} className="flex cursor-pointer items-start gap-2 text-sm">
          <input
            type={type}
            name={name}
            className="mt-1"
            checked={state.picked.includes(i)}
            onChange={() => toggle(i)}
          />
          <span>
            <span className="font-medium">{option.label}</span>
            {option.description !== '' ? (
              <span className="text-muted-foreground block text-xs">{option.description}</span>
            ) : null}
          </span>
        </label>
      ))}
      <div className="flex items-center gap-2 text-sm">
        <label className="flex cursor-pointer items-center gap-2">
          <input type={type} name={name} checked={state.otherOn} onChange={toggleOther} />
          <span className="font-medium">{APPROVAL_CARD_LABELS.other}</span>
        </label>
        {state.otherOn ? (
          <Input
            type="text"
            aria-label={`${question.question} ${APPROVAL_CARD_LABELS.other}`}
            placeholder={APPROVAL_CARD_LABELS.otherPlaceholder}
            value={state.otherText}
            onChange={(event) => onChange({ ...state, otherText: event.target.value })}
          />
        ) : null}
      </div>
    </fieldset>
  )
}

export function AskUserQuestionAnswer({
  input,
  onSubmit,
  onDeny
}: {
  /** agents が無害化した `input` (JSON の文字列)。 */
  readonly input: string
  readonly onSubmit: (answers: readonly string[]) => void
  readonly onDeny: () => void
}): React.JSX.Element {
  const questions = useMemo(() => readQuestions(input), [input])
  const [states, setStates] = useState<readonly QuestionState[]>([])
  const [rejected, setRejected] = useState(false)

  if (questions === null) {
    return (
      <>
        <p
          role="status"
          data-slot="ask-user-question-cannot-answer"
          className="border-border bg-muted text-foreground mt-2 rounded-md border px-2.5 py-1.5 text-xs"
        >
          {APPROVAL_CARD_LABELS.cannotAnswer}
        </p>
        <div className="mt-3 flex justify-end gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onDeny}>
            {APPROVAL_CARD_LABELS.deny}
          </Button>
        </div>
      </>
    )
  }

  const stateAt = (i: number): QuestionState => states[i] ?? EMPTY_STATE
  const answers = questions.map((q, i) => answerText(q, stateAt(i)))
  const unansweredAt = answers.map((a) => a.trim().length === 0)
  const allAnswered = !unansweredAt.some(Boolean)

  const submit = (): void => {
    if (!allAnswered) return
    // main・agents と同じ述語。外れたら送らず理由を出す (カードは外れない)。
    if (!isPermissionAnswers(answers)) {
      setRejected(true)
      return
    }
    setRejected(false)
    onSubmit(answers)
  }

  return (
    <>
      <div className="mt-2 flex flex-col gap-2" data-slot="ask-user-question-answer">
        {questions.map((question, i) => (
          <QuestionGroup
            key={i}
            question={question}
            state={stateAt(i)}
            unanswered={unansweredAt[i] === true}
            onChange={(next) => {
              setRejected(false)
              setStates((prev) => {
                const copy = questions.map((_, k) => prev[k] ?? EMPTY_STATE)
                copy[i] = next
                return copy
              })
            }}
          />
        ))}
      </div>
      {!allAnswered ? (
        <p
          role="status"
          data-slot="ask-user-question-unanswered"
          className="text-muted-foreground mt-2 text-xs"
        >
          {APPROVAL_CARD_LABELS.unanswered}
        </p>
      ) : null}
      {rejected ? (
        <p
          role="alert"
          data-slot="ask-user-question-invalid"
          className="text-destructive mt-2 text-xs"
        >
          {APPROVAL_CARD_LABELS.answerInvalid}
        </p>
      ) : null}
      <div className="mt-3 flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onDeny}>
          {APPROVAL_CARD_LABELS.deny}
        </Button>
        <Button type="button" size="sm" aria-disabled={!allAnswered} onClick={submit}>
          {APPROVAL_CARD_LABELS.sendAnswers}
        </Button>
      </div>
    </>
  )
}
