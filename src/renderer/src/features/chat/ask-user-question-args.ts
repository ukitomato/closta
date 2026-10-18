/**
 * `AskUserQuestion` の入力 (無害化済みの JSON の文字列) の読み取り (O-5 / 015 data-model §1。O-10 で答える部品と共有)。
 *
 * 読み取り専用の表示 (`ask-user-question.aui.tsx`) と答える部品 (`features/session/AskUserQuestionAnswer.tsx`) が
 * 同じ読み方をするために、component のファイルから分けた (react-refresh の「component だけを export する」規則)。
 */

export interface QuestionOption {
  readonly label: string
  readonly description: string
}

export interface Question {
  readonly question: string
  readonly header: string
  readonly options: readonly QuestionOption[]
  readonly multiSelect: boolean
}

export interface AskUserQuestionArgs {
  readonly questions: readonly Question[]
  /** 問いの文 → 回答 (過去ログ。`Map` で引く)。 */
  readonly answers: ReadonlyMap<string, string>
}

type Rec = Record<string, unknown>

function asRecord(value: unknown): Rec | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Rec)
    : null
}

function parseOption(raw: unknown): QuestionOption | null {
  const o = asRecord(raw)
  if (o === null || typeof o.label !== 'string') return null
  return {
    label: o.label,
    description: typeof o.description === 'string' ? o.description : ''
  }
}

function parseQuestion(raw: unknown): Question | null {
  const q = asRecord(raw)
  if (q === null || typeof q.question !== 'string' || !Array.isArray(q.options)) return null
  const options: QuestionOption[] = []
  for (const item of q.options as readonly unknown[]) {
    const option = parseOption(item)
    if (option === null) return null
    options.push(option)
  }
  if (options.length === 0) return null
  return {
    question: q.question,
    header: typeof q.header === 'string' ? q.header : '',
    options,
    multiSelect: q.multiSelect === true
  }
}

/** `argsText` (無害化済みの JSON) を読む。形が合わなければ null (ToolFallback に倒す)。 */
export function parseAskUserQuestionArgs(argsText: string): AskUserQuestionArgs | null {
  let value: unknown
  try {
    value = JSON.parse(argsText)
  } catch {
    return null
  }
  const o = asRecord(value)
  if (o === null || !Array.isArray(o.questions)) return null
  const questions: Question[] = []
  for (const item of o.questions as readonly unknown[]) {
    const question = parseQuestion(item)
    if (question === null) return null
    questions.push(question)
  }
  if (questions.length === 0) return null
  const answers = new Map<string, string>()
  const rawAnswers = asRecord(o.answers)
  if (rawAnswers !== null) {
    for (const [key, answer] of Object.entries(rawAnswers)) {
      if (typeof answer === 'string') answers.set(key, answer)
    }
  }
  return { questions, answers }
}
