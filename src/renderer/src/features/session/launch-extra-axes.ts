/**
 * 起動ダイアログの「残りの軸」(024) の純関数。入力の解釈は US-2 / US-3 で足す。
 * パスは扱わない — 追加ディレクトリは登録フォルダの id だけ (FR-001 / Principle I)。
 */

import { isValidMaxBudgetUsd, isValidMaxTurns } from '@domain/session/launch-config'
import { normalizeSessionName } from '@domain/session/live-settings'

/** 入力の解釈の結果 (data-model §9.2)。空 (trim 後) は `null` = 上限なし。外れたら `ok: false`。 */
export type LimitParse =
  { readonly ok: true; readonly value: number | null } | { readonly ok: false }

const INVALID: LimitParse = { ok: false }

/** ターン数の入力の解釈。`/^\d+$/` で `isValidMaxTurns` を通る値だけ。 */
export function parseMaxTurnsInput(raw: string): LimitParse {
  const text = raw.trim()
  if (text === '') return { ok: true, value: null }
  if (!/^[0-9]+$/.test(text)) return INVALID
  const value = Number(text)
  return isValidMaxTurns(value) ? { ok: true, value } : INVALID
}

/** 費用の入力の解釈。`/^\d+(\.\d{1,2})?$/` で `isValidMaxBudgetUsd` を通る値だけ。 */
export function parseMaxBudgetInput(raw: string): LimitParse {
  const text = raw.trim()
  if (text === '') return { ok: true, value: null }
  if (!/^[0-9]+(\.[0-9]{1,2})?$/.test(text)) return INVALID
  const value = Number(text)
  return isValidMaxBudgetUsd(value) ? { ok: true, value } : INVALID
}

/** セッション名の入力の解釈の結果 (data-model §9.2)。空 (trim 後) は `null` = 名前なし。外れたら `ok: false`。 */
export type SessionNameParse =
  { readonly ok: true; readonly value: string | null } | { readonly ok: false }

/** セッション名の入力の解釈。023 の `normalizeSessionName` を通る値だけ (前後の空白は除く)。 */
export function parseSessionNameInput(raw: string): SessionNameParse {
  if (raw.trim() === '') return { ok: true, value: null }
  const value = normalizeSessionName(raw)
  return value === null ? { ok: false } : { ok: true, value }
}

/** 入力の文字列の初期値 (data-model §9.2.1)。解釈を通すと元の値に戻る。 */
export function limitInputOf(value: number | null): string {
  return value === null ? '' : String(value)
}

/** 追加ディレクトリの選択肢に要るフォルダの形 (`WorkspaceFolderDTO` の部分集合)。 */
export interface DirectoryChoiceFolder {
  readonly id: string
  readonly displayName: string
}

/**
 * 「フォルダを追加」の選択肢 (data-model §9.1)。作業フォルダの選択肢と同じ並びから、作業フォルダ自身と
 * 選択済みの項目を除く。
 */
export function additionalDirectoryChoices<T extends DirectoryChoiceFolder>(
  folders: readonly T[],
  folderId: string | null,
  selected: readonly string[]
): readonly T[] {
  return folders.filter((f) => f.id !== folderId && !selected.includes(f.id))
}
