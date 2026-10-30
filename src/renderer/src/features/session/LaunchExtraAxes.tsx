import { Button } from '@/components/ui/button'

import { EXTRA_AXES_LABELS, LIVE_SETTING_LABELS } from './labels'

/**
 * 起動ダイアログの「残りの軸」の部品 (024 data-model §9.1)。いまは追加ディレクトリだけ (上限と名前は US-2 / US-3)。
 *
 * 追加ディレクトリは**登録済みのフォルダから選ぶ**。パスの入力欄と参照のダイアログを置かない (FR-001)。
 * 状態は持たない — 下書きの書き換えは `LaunchDialog` が行い、ここは選択肢と一覧を描くだけ。
 */

const selectClass = 'border-border bg-background rounded-md border px-2 py-1.5 text-sm'

export interface AdditionalDirectoryItem {
  readonly id: string
  /** 表示名 (登録が解除されて引けないときは呼び出し側が `EXTRA_AXES_LABELS.deletedFolder` を渡す) */
  readonly name: string
}

export interface LaunchExtraAxesProps {
  /** 「フォルダを追加」の選択肢 (`additionalDirectoryChoices` の結果) */
  readonly choices: readonly { readonly id: string; readonly displayName: string }[]
  /** 選んだ項目 (依存解決の後に残ったもの) */
  readonly items: readonly AdditionalDirectoryItem[]
  /** 上限 (10 件) に達している */
  readonly full: boolean
  readonly onAdd: (folderId: string) => void
  readonly onRemove: (folderId: string) => void
  /** 上限の入力の文字列 (state は `LaunchDialog` が持つ。data-model §9.2) */
  readonly maxTurnsInput: string
  readonly maxBudgetInput: string
  /** 入力が不正 (範囲の文言を出し、起動を止める) */
  readonly maxTurnsInvalid: boolean
  readonly maxBudgetInvalid: boolean
  readonly onMaxTurnsChange: (raw: string) => void
  readonly onMaxBudgetChange: (raw: string) => void
  /** セッション名の入力の文字列 (state は `LaunchDialog` が持つ。下書きに入れない) */
  readonly sessionNameInput: string
  readonly sessionNameInvalid: boolean
  readonly onSessionNameChange: (raw: string) => void
  /** 名前の入力で Enter (IME の変換中を除く) を押した */
  readonly onSessionNameSubmit: () => void
  /** false なら名前の部品を出さない (再開の形。名前は渡さない。024 FR-012)。省略は出す。 */
  readonly showSessionName?: boolean
}

const inputClass = 'border-border bg-background rounded-md border px-2 py-1.5 text-sm'

export function LaunchExtraAxes(props: LaunchExtraAxesProps): React.JSX.Element {
  return (
    <>
      <AdditionalDirectories {...props} />
      <div className="flex flex-col gap-1 text-sm">
        <label className="flex flex-col gap-1">
          <span className="font-medium">{EXTRA_AXES_LABELS.maxTurns}</span>
          <input
            type="text"
            inputMode="numeric"
            value={props.maxTurnsInput}
            placeholder={EXTRA_AXES_LABELS.unlimitedPlaceholder}
            onChange={(e) => props.onMaxTurnsChange(e.target.value)}
            className={inputClass}
            aria-invalid={props.maxTurnsInvalid ? true : undefined}
            aria-describedby={props.maxTurnsInvalid ? 'max-turns-range' : undefined}
          />
        </label>
        {props.maxTurnsInvalid && (
          <span id="max-turns-range" role="alert" className="text-destructive text-xs">
            {EXTRA_AXES_LABELS.maxTurnsRange}
          </span>
        )}
      </div>
      <div className="flex flex-col gap-1 text-sm">
        <label className="flex flex-col gap-1">
          <span className="font-medium">{EXTRA_AXES_LABELS.maxBudgetUsd}</span>
          <input
            type="text"
            inputMode="decimal"
            value={props.maxBudgetInput}
            placeholder={EXTRA_AXES_LABELS.unlimitedPlaceholder}
            onChange={(e) => props.onMaxBudgetChange(e.target.value)}
            className={inputClass}
            aria-invalid={props.maxBudgetInvalid ? true : undefined}
            aria-describedby={props.maxBudgetInvalid ? 'max-budget-range' : undefined}
          />
        </label>
        {props.maxBudgetInvalid && (
          <span id="max-budget-range" role="alert" className="text-destructive text-xs">
            {EXTRA_AXES_LABELS.maxBudgetRange}
          </span>
        )}
      </div>
      {props.showSessionName !== false && (
        <div className="flex flex-col gap-1 text-sm">
          <label className="flex flex-col gap-1">
            <span className="font-medium">{EXTRA_AXES_LABELS.sessionName}</span>
            <input
              type="text"
              value={props.sessionNameInput}
              placeholder={EXTRA_AXES_LABELS.namePlaceholder}
              onChange={(e) => props.onSessionNameChange(e.target.value)}
              onKeyDown={(e) => {
                // IME の変換中の Enter は確定に任せる (起動しない。Principle VIII / AD-037)。
                if (e.nativeEvent.isComposing || e.keyCode === 229) return
                if (e.key === 'Enter') {
                  e.preventDefault()
                  props.onSessionNameSubmit()
                }
              }}
              className={inputClass}
              aria-invalid={props.sessionNameInvalid ? true : undefined}
              aria-describedby={props.sessionNameInvalid ? 'session-name-rule' : undefined}
            />
          </label>
          {props.sessionNameInvalid && (
            <span id="session-name-rule" role="alert" className="text-destructive text-xs">
              {LIVE_SETTING_LABELS.nameRule}
            </span>
          )}
        </div>
      )}
    </>
  )
}

function AdditionalDirectories(props: LaunchExtraAxesProps): React.JSX.Element {
  const { choices, items, full, onAdd, onRemove } = props
  return (
    <fieldset className="flex flex-col gap-2 text-sm" data-testid="additional-directories">
      <legend className="font-medium">{EXTRA_AXES_LABELS.additionalDirectories}</legend>
      <select
        value=""
        onChange={(e) => {
          if (e.target.value !== '') onAdd(e.target.value)
        }}
        disabled={full || choices.length === 0}
        className={selectClass}
        aria-label={EXTRA_AXES_LABELS.addFolder}
      >
        <option value="">{EXTRA_AXES_LABELS.addFolder}</option>
        {choices.map((f) => (
          <option key={f.id} value={f.id}>
            {f.displayName}
          </option>
        ))}
      </select>
      {items.length > 0 && (
        <ul className="flex flex-col gap-1" aria-label={EXTRA_AXES_LABELS.additionalDirectories}>
          {items.map((item) => (
            <li key={item.id} className="flex items-center gap-2">
              <span className="flex-1">{item.name}</span>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => onRemove(item.id)}
                aria-label={`${EXTRA_AXES_LABELS.removeFolder}: ${item.name}`}
              >
                {EXTRA_AXES_LABELS.removeFolder}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </fieldset>
  )
}
