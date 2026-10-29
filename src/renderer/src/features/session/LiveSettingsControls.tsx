import { useEffect, useId, useRef, useState } from 'react'

import {
  SAFE_PERMISSION_MODES,
  isSafePermissionMode,
  type SafePermissionMode
} from '@domain/session/launch-config'
import {
  liveSettingBlocker,
  normalizeSessionName,
  type LiveSettingBlocker,
  type LiveSettingKind,
  type LiveSettingRow
} from '@domain/session/live-settings'
import type { PermissionModeKey } from '@domain/session/meter'

import { PERMISSION_MODE_NAMES } from '@/features/chat/labels'
import { LIVE_SETTING_LABELS, PERMISSION_MODE_LABELS } from '@/features/session/labels'

/**
 * **実行中の設定の選択** (023 / data-model §8.1 / §8.2)。稼働中のセッションだけで描く。025 から置き場所は composer の左の群
 * (`ComposerExtensions.settings`。中央のヘッダには置かない。名前の変更 `EditableSessionTitle` と失敗の 1 行はヘッダに残る)。
 *
 * | 規則 | 根拠 |
 * |---|---|
 * | 権限モードは native の `<select>` (起動ダイアログと同じ部品)。選択肢は安全 3 値だけ | 起動ダイアログ / FR-001 |
 * | 押せるかは domain の `liveSettingBlocker` (main と同じ関数)。外れたら `aria-disabled` と理由を `aria-describedby` で結ぶ | data-model §5.1 |
 * | 変更中 (`changing`) は押せない | FR-013 |
 * | 今の値が安全 3 値の外なら先頭に選べない項目として出す (警告の帯は `UnsafeModeBanner` が出す) | 014 data-model §4 |
 * | 表示は `meters` から読む。選んだ値をここでは保持しない (成功は `meter` の更新で変わる) | contracts C-1 / FR-014 |
 */
export interface LiveSettingsControlsProps {
  /** 今の権限モード (`meters.permissionMode ?? config.permissionMode`)。 */
  readonly permissionMode: PermissionModeKey
  /** 受け付けの判定の入力 (`changing` は結果を待つ変更があるか)。 */
  readonly row: LiveSettingRow
  readonly onSelectPermissionMode: (mode: SafePermissionMode) => void
  /** モデルの選択 (023 / data-model §8.2)。無ければモデルの選択を描かない。 */
  readonly model?: LiveModelSelect
  /**
   * マウスの選択と Enter で確定した後に呼ぶ (LivePane が composer の入力へフォーカスを戻す。025 data-model §6.2)。
   * blur での確定では呼ばない。
   */
  readonly onConfirmed?: (() => void) | undefined
}

/** 切り替えられるモデルの選択肢と今の値 (選択肢は `switchableModels` の結果。表示は `displayName`)。 */
export interface LiveModelSelect {
  /** 今のモデルの id (`currentModelId ?? config.modelId`)。既定なら null。 */
  readonly value: string | null
  readonly options: readonly { readonly id: string; readonly displayName: string }[]
  /** Provider が null・一覧に無い・一覧の読み込み中・選択肢 0 のとき false (押せない。理由は「モデルの一覧がありません」)。 */
  readonly available: boolean
  /**
   * 既定の Provider の一覧が使えないときの理由の文言 (025 / data-model §6.3。読み込み中・空・失敗)。
   * 受け付けの判定 (`liveSettingBlocker`) の理由が先に出る。無ければ `available` / 選択肢 0 で `noModelList`。
   */
  readonly unavailableReason?: string | null
  readonly onSelect: (modelId: string) => void
  /** 選択にフォーカスが入ったとき (失敗した一覧の聞き直し。025 data-model §6.3)。 */
  readonly onFocus?: (() => void) | undefined
}

const DEFAULT_MODEL_VALUE = ''

/** 押せない select の見た目 (pr-gate R1 H-001。`aria-disabled` だけでは見た目が変わらない)。 */
const DISABLED_SELECT_CLASS = 'aria-disabled:cursor-not-allowed aria-disabled:opacity-50'

/**
 * 閉じた native `<select>` の矢印キーは通過した値ごとに `onChange` が走る。実セッションの設定を通過した値ごとに
 * 変えないため、キー操作の変更は保留し、Enter か blur で 1 回だけ確定する (pr-gate R1 H-003 / WCAG 3.2.2)。
 * マウスの選択 (キー操作を伴わない変更) はその場で確定する。
 */
function useConfirmedSelect(
  current: string,
  commit: (value: string) => void,
  onConfirmed?: () => void
): {
  readonly value: string
  readonly onChange: (value: string) => void
  readonly onKeyDown: (event: React.KeyboardEvent) => void
  readonly onKeyUp: (event: React.KeyboardEvent) => void
  readonly onBlur: () => void
} {
  const [pending, setPending] = useState<string | null>(null)
  const byKeyboard = useRef(false)
  // 確定の後の `onConfirmed` (フォーカスを composer に戻す。025 data-model §6.2) はマウスの選択と Enter の確定だけ。
  // blur の確定ではフォーカスがすでに別の要素に移っているので呼ばない (利用者が移した先を奪わない)。
  const flush = (confirm: boolean): void => {
    byKeyboard.current = false
    if (pending !== null && pending !== current) {
      commit(pending)
      // Enter の keydown の中で移すと、続く keypress が移した先の入力欄に届いて改行・送信になりうる。次の tick に回す。
      if (confirm && onConfirmed !== undefined) setTimeout(onConfirmed, 0)
    }
    setPending(null)
  }
  return {
    value: pending ?? current,
    onChange: (value) => {
      if (byKeyboard.current) {
        setPending(value)
        return
      }
      setPending(null)
      commit(value)
      onConfirmed?.()
    },
    onKeyDown: (event) => {
      if (event.key === 'Enter') flush(true)
      else if (
        !event.ctrlKey &&
        !event.metaKey &&
        (event.key.startsWith('Arrow') ||
          ['Home', 'End', 'PageUp', 'PageDown'].includes(event.key) ||
          event.key.length === 1)
      )
        byKeyboard.current = true
    },
    onKeyUp: (event) => {
      // 開いた選択肢の一覧で Enter を押すと、change は keydown の後に届く。
      if (event.key === 'Enter') flush(true)
    },
    onBlur: () => flush(false)
  }
}

function ModelSelect({
  row,
  model,
  onConfirmed
}: {
  readonly row: LiveSettingRow
  readonly model: LiveModelSelect
  readonly onConfirmed?: (() => void) | undefined
}): React.JSX.Element {
  const reasonId = useId()
  const blocker = liveSettingBlocker('model', row)
  const noList = !model.available || model.options.length === 0
  const reason =
    blocker !== null
      ? LIVE_SETTING_LABELS.blocker[blocker]
      : (model.unavailableReason ?? null) !== null
        ? (model.unavailableReason ?? null)
        : noList
          ? LIVE_SETTING_LABELS.noModelList
          : null
  const known = model.value !== null && model.options.some((o) => o.id === model.value)
  const confirmed = useConfirmedSelect(
    model.value ?? DEFAULT_MODEL_VALUE,
    (id) => {
      if (model.options.some((o) => o.id === id)) model.onSelect(id)
    },
    onConfirmed
  )
  return (
    <label className="flex min-w-0 flex-wrap items-center gap-x-1 text-xs">
      <span className="text-muted-foreground">{LIVE_SETTING_LABELS.model}</span>
      <select
        value={confirmed.value}
        aria-label={LIVE_SETTING_LABELS.model}
        aria-disabled={reason !== null || undefined}
        aria-describedby={reason !== null ? reasonId : undefined}
        title={reason ?? undefined}
        onChange={(e) => {
          if (reason !== null) return
          confirmed.onChange(e.target.value)
        }}
        onFocus={model.onFocus}
        onKeyDown={confirmed.onKeyDown}
        onKeyUp={confirmed.onKeyUp}
        onBlur={confirmed.onBlur}
        className={`border-border bg-background max-w-36 min-w-0 truncate rounded-md border px-1.5 py-0.5 text-xs ${DISABLED_SELECT_CLASS}`}
        data-testid="live-model"
      >
        {model.value === null && (
          <option value={DEFAULT_MODEL_VALUE} disabled>
            {LIVE_SETTING_LABELS.defaultModel}
          </option>
        )}
        {model.value !== null && !known && (
          <option value={model.value} disabled>
            {model.value}
          </option>
        )}
        {model.options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.displayName}
          </option>
        ))}
      </select>
      {reason !== null && (
        <span id={reasonId} className="text-muted-foreground basis-full text-xs">
          {reason}
        </span>
      )}
    </label>
  )
}

export function LiveSettingsControls({
  permissionMode,
  row,
  onSelectPermissionMode,
  model,
  onConfirmed
}: LiveSettingsControlsProps): React.JSX.Element {
  const reasonId = useId()
  const blocker = liveSettingBlocker('permission-mode', row)
  const unsafe = !isSafePermissionMode(permissionMode)
  return (
    <div
      className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5"
      data-testid="live-settings"
    >
      <PermissionModeSelect
        permissionMode={permissionMode}
        blocker={blocker}
        unsafe={unsafe}
        reasonId={reasonId}
        onSelectPermissionMode={onSelectPermissionMode}
        onConfirmed={onConfirmed}
      />
      {model !== undefined && <ModelSelect row={row} model={model} onConfirmed={onConfirmed} />}
    </div>
  )
}

function PermissionModeSelect({
  permissionMode,
  blocker,
  unsafe,
  reasonId,
  onSelectPermissionMode,
  onConfirmed
}: {
  readonly permissionMode: PermissionModeKey
  readonly blocker: LiveSettingBlocker | null
  readonly unsafe: boolean
  readonly reasonId: string
  readonly onSelectPermissionMode: (mode: SafePermissionMode) => void
  readonly onConfirmed?: (() => void) | undefined
}): React.JSX.Element {
  const confirmed = useConfirmedSelect(
    permissionMode,
    (value) => {
      const mode: unknown = value
      if (isSafePermissionMode(mode)) onSelectPermissionMode(mode)
    },
    onConfirmed
  )
  return (
    <label className="flex min-w-0 flex-wrap items-center gap-x-1 text-xs">
      <span className="text-muted-foreground">{LIVE_SETTING_LABELS.permissionMode}</span>
      <select
        value={confirmed.value}
        aria-label={LIVE_SETTING_LABELS.permissionMode}
        aria-disabled={blocker !== null || undefined}
        aria-describedby={blocker !== null ? reasonId : undefined}
        title={blocker !== null ? LIVE_SETTING_LABELS.blocker[blocker] : undefined}
        onChange={(e) => {
          if (blocker !== null) return
          confirmed.onChange(e.target.value)
        }}
        onKeyDown={confirmed.onKeyDown}
        onKeyUp={confirmed.onKeyUp}
        onBlur={confirmed.onBlur}
        className={`border-border bg-background rounded-md border px-1.5 py-0.5 text-xs ${DISABLED_SELECT_CLASS}`}
        data-testid="live-permission-mode"
      >
        {unsafe && (
          <option value={permissionMode} disabled>
            {PERMISSION_MODE_NAMES[permissionMode]}
          </option>
        )}
        {SAFE_PERMISSION_MODES.map((mode) => (
          <option key={mode} value={mode}>
            {PERMISSION_MODE_LABELS[mode]}
          </option>
        ))}
      </select>
      {blocker !== null && (
        <span id={reasonId} className="text-muted-foreground basis-full text-xs">
          {LIVE_SETTING_LABELS.blocker[blocker]}
        </span>
      )}
    </label>
  )
}

/** IME の変換中のキーか (Principle VIII / AD-037 の `isComposing` / 229)。変換中は確定・取り消しに任せる。 */
function isComposingKey(event: React.KeyboardEvent): boolean {
  return event.nativeEvent.isComposing || event.keyCode === 229
}

export interface EditableSessionTitleProps {
  /** 表示する題 (`name ?? フォルダ名`)。 */
  readonly title: string
  /** 付けた名前 (編集の初期値。無ければ空)。 */
  readonly name: string | null
  readonly titleTestId: string
  readonly row: LiveSettingRow
  /** 名前の変更の操作。成功なら `true` (編集を閉じる)。 */
  readonly onRename: (name: string) => Promise<boolean>
}

/**
 * **中央のヘッダの見出し + 「名前を変更」** (023 / data-model §8.2 / spec FR-009〜FR-012 / U-7)。
 *
 * | 規則 | 根拠 |
 * |---|---|
 * | 見出し (`h2`) の隣のボタンで 1 行の入力に変わる。初期値は今の名前か空。「保存」「キャンセル」 | data-model §8.2 |
 * | Enter は IME の変換中 (`isComposing` / 229) なら確定しない。Escape で取り消す | Principle VIII / AD-037 |
 * | 保存は `normalizeSessionName` が null なら押せず、規則の文言を出す。main と同じ関数 | data-model §5.3 |
 * | 押せるかは `liveSettingBlocker('name', row)`。外れたら `aria-disabled` と理由を `aria-describedby` で結ぶ | data-model §5.1 |
 * | composer に触れない | spec U-7 |
 */
export function EditableSessionTitle({
  title,
  name,
  titleTestId,
  row,
  onRename
}: EditableSessionTitleProps): React.JSX.Element {
  const reasonId = useId()
  const ruleId = useId()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [touched, setTouched] = useState(false)
  const renameButton = useRef<HTMLButtonElement>(null)
  const wasEditing = useRef(false)

  const blocker = liveSettingBlocker('name', row)
  const normalized = normalizeSessionName(draft)
  const invalid = normalized === null
  const canSave = !invalid && blocker === null
  // 入力を 1 度でも変えたら、空でも規則の文言を出す (US-3 AC4 / pr-gate R1 H-004)。
  const showRule = invalid && touched

  useEffect(() => {
    // 編集を閉じたら開いたボタンへフォーカスを戻す。
    if (wasEditing.current && !editing) renameButton.current?.focus()
    wasEditing.current = editing
  }, [editing])

  const open = (): void => {
    if (blocker !== null) return
    setDraft(name ?? '')
    setTouched(false)
    setEditing(true)
  }
  const save = (): void => {
    if (!canSave) return
    void onRename(normalized).then((ok) => {
      if (ok) setEditing(false)
    })
  }

  if (!editing) {
    return (
      <>
        <h2
          className="min-w-0 truncate text-xs font-medium"
          title={title}
          data-testid={titleTestId}
        >
          {title}
        </h2>
        <button
          ref={renameButton}
          type="button"
          onClick={open}
          aria-disabled={blocker !== null || undefined}
          aria-describedby={blocker !== null ? reasonId : undefined}
          title={blocker !== null ? LIVE_SETTING_LABELS.blocker[blocker] : undefined}
          className="text-muted-foreground hover:text-foreground aria-disabled:hover:text-muted-foreground shrink-0 text-xs underline-offset-2 hover:underline aria-disabled:cursor-not-allowed aria-disabled:opacity-50 aria-disabled:hover:no-underline"
          data-testid="live-rename"
        >
          {LIVE_SETTING_LABELS.rename}
        </button>
        {blocker !== null && (
          <span id={reasonId} className="text-muted-foreground text-xs">
            {LIVE_SETTING_LABELS.blocker[blocker]}
          </span>
        )}
      </>
    )
  }

  return (
    <form
      className="flex shrink-0 items-center gap-1"
      onSubmit={(e) => {
        e.preventDefault()
      }}
    >
      <input
        type="text"
        value={draft}
        autoFocus
        aria-label={LIVE_SETTING_LABELS.nameField}
        aria-invalid={showRule ? true : undefined}
        aria-describedby={
          [showRule ? ruleId : null, blocker !== null ? reasonId : null]
            .filter((id): id is string => id !== null)
            .join(' ') || undefined
        }
        onChange={(e) => {
          setTouched(true)
          setDraft(e.target.value)
        }}
        onKeyDown={(e) => {
          // 変換中の Enter / Escape は確定・取り消しに任せる (`preventDefault` もしない)。
          if (isComposingKey(e)) return
          if (e.key === 'Enter') {
            e.preventDefault()
            save()
          } else if (e.key === 'Escape') {
            e.preventDefault()
            setEditing(false)
          }
        }}
        className="border-border bg-background w-40 min-w-0 rounded-md border px-1.5 py-0.5 text-xs"
        data-testid="live-rename-input"
      />
      <button
        type="button"
        onClick={save}
        disabled={!canSave}
        className="shrink-0 rounded-md border px-2 py-0.5 text-xs disabled:opacity-50"
        data-testid="live-rename-save"
      >
        {LIVE_SETTING_LABELS.save}
      </button>
      <button
        type="button"
        onClick={() => setEditing(false)}
        className="shrink-0 rounded-md border px-2 py-0.5 text-xs"
        data-testid="live-rename-cancel"
      >
        {LIVE_SETTING_LABELS.cancel}
      </button>
      {showRule && (
        <span id={ruleId} className="text-destructive shrink-0 text-xs">
          {LIVE_SETTING_LABELS.nameRule}
        </span>
      )}
      {blocker !== null && (
        <span id={reasonId} className="text-muted-foreground shrink-0 text-xs">
          {LIVE_SETTING_LABELS.blocker[blocker]}
        </span>
      )}
    </form>
  )
}

/**
 * 直前の変更の失敗の 1 行 (ヘッダの下。`role="status"`)。次の変更の開始で `settingError` が消えると一緒に消える。
 * 失敗が無いときは何も描かない (ヘッダと帯・検索のバーの並びを変えない。`CenterBanners.test.tsx`)。
 */
export function LiveSettingError({
  settingError
}: {
  readonly settingError: LiveSettingKind | null
}): React.JSX.Element | null {
  if (settingError === null) return null
  return (
    <p
      role="status"
      data-testid="live-setting-error"
      className="text-destructive border-border border-b px-4 py-1 text-xs"
    >
      {LIVE_SETTING_LABELS.failure[settingError]}
    </p>
  )
}
