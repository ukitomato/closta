import { useId, useState } from 'react'

import {
  isElicitationContent,
  matchesElicitationSchema,
  type ElicitationAction,
  type ElicitationContent,
  type ElicitationField,
  type ElicitationPrompt
} from '@domain/session/elicitation'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

import { ELICITATION_LABELS } from './labels'

/**
 * MCP サーバーの問い (Elicitation) のカード (O-10 / US-2 / AD-053。018 data-model §3 / §5)。
 *
 * 承認カードと同じ枠・`role="alertdialog"` の**自前のカード** (Principle XIII。registry の候補は SH-002 で採らなかった)。
 * `serverName` / `title` / `message` / 項目の名前は agents が無害化・伏せ字済みの plain text で、React の既定のエスケープで
 * そのまま出す (リンク化・マークダウン化しない)。
 *
 * - form: 項目ごとの入力。パスワード欄 (`type="password"`) は出さない (入力の値はこの component の state だけに持ち、
 *   ストアにもログにも残さない。SC-004)。Enter では送らない (`form` 要素を使わない)。送る前に domain の述語
 *   (`isElicitationContent` / `matchesElicitationSchema`。main・agents と同じ関数) を通し、外れたら送らず `invalid` を出す
 * - 部分集合の外 (`fields: null`) は `unsupported` と「断る」「取り消す」だけ
 * - URL: 開けるリンク (`http:` / `https:`) を出す。押すと開いて `accept` を `content` なしで返す (U-8)。開けない URL は
 *   `cannotOpenUrl` と「断る」「取り消す」だけ。「送る」は出さない
 *
 * 応答すると呼び出し側 (`LivePane`) がカードごと外す。外す前のフォーカスの移しも呼び出し側が行う。
 */

type FieldValue = string | boolean

function initialValue(field: ElicitationField): FieldValue {
  switch (field.type) {
    case 'boolean':
      return field.default ?? false
    case 'number':
    case 'integer':
      return field.default === undefined ? '' : String(field.default)
    case 'enum':
    case 'string':
      return field.default ?? ''
  }
}

/** 入力の値 → `content` (data-model §3「form の値の組み立て」)。数が読めなければ null。 */
function buildContent(
  fields: readonly ElicitationField[],
  values: Readonly<Record<string, FieldValue>>
): ElicitationContent | null {
  const content: Record<string, string | number | boolean> = {}
  for (const field of fields) {
    const raw = values[field.key] ?? initialValue(field)
    switch (field.type) {
      case 'boolean':
        content[field.key] = raw === true
        break
      case 'string':
        if (typeof raw === 'string' && raw.trim().length > 0) content[field.key] = raw
        break
      case 'enum':
        if (typeof raw === 'string' && raw !== '') content[field.key] = raw
        break
      case 'number':
      case 'integer': {
        if (typeof raw !== 'string' || raw.trim() === '') break
        const n = Number(raw)
        if (!Number.isFinite(n)) return null
        content[field.key] = n
        break
      }
    }
  }
  return content
}

/** 項目ごとの理由 (data-model §3)。外れた項目だけ入る。 */
function fieldErrors(
  fields: readonly ElicitationField[],
  values: Readonly<Record<string, FieldValue>>
): Readonly<Record<string, string>> {
  const errors: Record<string, string> = {}
  for (const field of fields) {
    const content = buildContent([field], values)
    if (content === null) {
      errors[field.key] = ELICITATION_LABELS.fieldInvalid
    } else if (!matchesElicitationSchema([field], content)) {
      errors[field.key] = Object.hasOwn(content, field.key)
        ? ELICITATION_LABELS.fieldInvalid
        : field.required
          ? ELICITATION_LABELS.fieldRequired
          : ELICITATION_LABELS.fieldInvalid
    }
  }
  return errors
}

const STRING_INPUT_TYPES = { email: 'email', uri: 'url', date: 'date' } as const

function FieldInput({
  field,
  value,
  error,
  onChange
}: {
  readonly field: ElicitationField
  readonly value: FieldValue
  readonly error: string | undefined
  readonly onChange: (next: FieldValue) => void
}): React.JSX.Element {
  const id = useId()
  const label = (
    <>
      {field.label}
      {field.required ? (
        <span className="text-muted-foreground ms-1 text-xs">({ELICITATION_LABELS.required})</span>
      ) : null}
    </>
  )
  const descId = field.description === '' ? undefined : `${id}-desc`
  const errorId = error === undefined ? undefined : `${id}-err`
  const describedBy = [descId, errorId].filter((s) => s !== undefined).join(' ') || undefined
  const invalid = error === undefined ? undefined : true
  const description = (
    <>
      {descId === undefined ? null : (
        <span id={descId} className="text-muted-foreground block text-xs">
          {field.description}
        </span>
      )}
      {error === undefined ? null : (
        <span
          id={errorId}
          data-slot="elicitation-field-error"
          className="text-destructive block text-xs"
        >
          {error}
        </span>
      )}
    </>
  )

  if (field.type === 'boolean') {
    return (
      <div data-slot="elicitation-field" className="flex flex-col gap-0.5 text-sm">
        <label className="flex cursor-pointer items-center gap-2" htmlFor={id}>
          <input
            id={id}
            type="checkbox"
            aria-describedby={describedBy}
            aria-invalid={invalid}
            checked={value === true}
            onChange={(event) => onChange(event.target.checked)}
          />
          <span className="font-medium">{label}</span>
        </label>
        {description}
      </div>
    )
  }

  return (
    <div data-slot="elicitation-field" className="flex flex-col gap-0.5 text-sm">
      <label className="font-medium" htmlFor={id}>
        {label}
      </label>
      {field.type === 'enum' ? (
        <select
          id={id}
          aria-required={field.required}
          aria-describedby={describedBy}
          aria-invalid={invalid}
          className="border-input bg-background h-8 rounded-md border px-2 text-sm"
          value={typeof value === 'string' ? value : ''}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="">{ELICITATION_LABELS.unselected}</option>
          {field.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : (
        <Input
          id={id}
          type={
            field.type === 'string'
              ? field.format === undefined || field.format === 'date-time'
                ? 'text'
                : STRING_INPUT_TYPES[field.format]
              : 'number'
          }
          inputMode={field.type === 'integer' ? 'numeric' : undefined}
          aria-required={field.required}
          aria-describedby={describedBy}
          aria-invalid={invalid}
          {...(field.type === 'string'
            ? { minLength: field.minLength, maxLength: field.maxLength }
            : {
                min: field.minimum,
                max: field.maximum,
                step: field.type === 'integer' ? 1 : 'any'
              })}
          value={typeof value === 'string' ? value : ''}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
      {description}
    </div>
  )
}

export function ElicitationCard({
  prompt,
  remaining,
  onRespond
}: {
  readonly prompt: ElicitationPrompt
  /** 先頭のこの 1 枚の後ろに待っている問いの数 (0 なら出さない)。 */
  readonly remaining: number
  /** 応答。`content` は form の `accept` のときだけ付く。URL のリンクの `accept` は `content` なし。 */
  readonly onRespond: (action: ElicitationAction, content?: ElicitationContent) => void
}): React.JSX.Element {
  const fields = prompt.mode === 'form' ? prompt.fields : null
  const [values, setValues] = useState<Readonly<Record<string, FieldValue>>>(() =>
    Object.fromEntries((fields ?? []).map((f) => [f.key, initialValue(f)]))
  )
  const [rejected, setRejected] = useState(false)
  const [errors, setErrors] = useState<Readonly<Record<string, string>>>({})

  const submit = (): void => {
    if (fields === null) return
    const content = buildContent(fields, values)
    // main・agents と同じ述語と照合の範囲。外れたら送らず理由を出す (カードは外れない。U-6 (e) / U-9)。
    if (
      content === null ||
      !isElicitationContent(content) ||
      !matchesElicitationSchema(fields, content)
    ) {
      setErrors(fieldErrors(fields, values))
      setRejected(true)
      return
    }
    setErrors({})
    setRejected(false)
    onRespond('accept', content)
  }

  const openUrl = prompt.mode === 'url' ? (prompt.url?.openUrl ?? null) : null
  const notice =
    prompt.mode === 'url'
      ? openUrl === null
        ? ELICITATION_LABELS.cannotOpenUrl
        : null
      : fields === null
        ? ELICITATION_LABELS.unsupported
        : null

  return (
    <div
      role="alertdialog"
      aria-label={ELICITATION_LABELS.heading(prompt.serverName)}
      data-slot="elicitation-card"
      className="border-border bg-card mx-auto w-full max-w-(--thread-max-width) rounded-lg border p-4 shadow-sm"
    >
      {/* 本体だけがスクロールし、ボタン行は常に見える (H-002)。 */}
      <div className="max-h-[50dvh] overflow-y-auto" data-slot="elicitation-body">
        <p className="text-sm font-medium">{ELICITATION_LABELS.heading(prompt.serverName)}</p>
        {prompt.title !== '' ? (
          <p data-slot="elicitation-title" className="mt-1 text-sm font-semibold break-words">
            {prompt.title}
          </p>
        ) : null}
        {prompt.message !== '' ? (
          <p
            data-slot="elicitation-message"
            className="text-foreground mt-1 text-sm break-words whitespace-pre-wrap"
          >
            {prompt.message}
          </p>
        ) : null}
        {remaining > 0 ? (
          <p
            role="status"
            data-slot="elicitation-remaining"
            className="text-muted-foreground mt-1 text-xs"
          >
            {ELICITATION_LABELS.remaining(remaining)}
          </p>
        ) : null}

        {prompt.mode === 'url' && prompt.url !== null ? (
          <div data-slot="elicitation-url" className="mt-2 flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground font-mono text-xs break-all">
              {prompt.url.displayUrl}
            </span>
            {openUrl !== null ? (
              <>
                <a
                  href={openUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-primary w-fit font-medium underline underline-offset-2"
                  // 開く (既定の動作は止めない) と同時に `accept` を返す。`content` は付けない (U-8)。
                  onClick={() => onRespond('accept')}
                >
                  {ELICITATION_LABELS.openUrl}
                  {prompt.url.host !== '' ? ` (${prompt.url.host})` : ''}
                </a>
                <span data-slot="elicitation-url-note" className="text-muted-foreground text-xs">
                  {ELICITATION_LABELS.openUrlNote}
                </span>
              </>
            ) : null}
          </div>
        ) : null}

        {notice !== null ? (
          <p
            role="status"
            data-slot="elicitation-notice"
            className="border-border bg-muted text-foreground mt-2 rounded-md border px-2.5 py-1.5 text-xs"
          >
            {notice}
          </p>
        ) : null}

        {fields !== null ? (
          <div className="mt-2 flex flex-col gap-2" data-slot="elicitation-fields">
            {fields.map((field) => (
              <FieldInput
                key={field.key}
                field={field}
                value={values[field.key] ?? initialValue(field)}
                error={errors[field.key]}
                onChange={(next) => {
                  setRejected(false)
                  setErrors((prev) =>
                    Object.fromEntries(Object.entries(prev).filter(([k]) => k !== field.key))
                  )
                  setValues((prev) => ({ ...prev, [field.key]: next }))
                }}
              />
            ))}
          </div>
        ) : null}

        {rejected ? (
          <p role="alert" data-slot="elicitation-invalid" className="text-destructive mt-2 text-xs">
            {ELICITATION_LABELS.invalid}
          </p>
        ) : null}
      </div>

      <div className="mt-3 flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => onRespond('cancel')}>
          {ELICITATION_LABELS.cancel}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => onRespond('decline')}>
          {ELICITATION_LABELS.decline}
        </Button>
        {fields !== null ? (
          <Button type="button" size="sm" onClick={submit}>
            {ELICITATION_LABELS.submit}
          </Button>
        ) : null}
      </div>
    </div>
  )
}
