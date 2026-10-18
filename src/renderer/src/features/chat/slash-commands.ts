/**
 * composer のスラッシュコマンドの候補 (O-10 / 018 data-model §5「コマンドの候補」/ research R-11)。
 *
 * 純関数と、assistant-ui の trigger popover (`unstable_` の API) に渡す adapter / matcher / formatter だけを置く。
 * `unstable_` の型に触れるのは本ファイルと `composer-extensions.tsx` に閉じる (RK-05)。
 *
 * | 規則 | 値 |
 * |---|---|
 * | 当てる位置 | 入力の先頭 (offset 0) の `/` から最初の空白の手前まで (`slashMatcher`) |
 * | 比べ方 | 名前の先頭の `/` を 1 つ外して、問い合わせ (先頭の `/` を 1 つ外した形) の前方一致。大文字小文字を区別しない |
 * | 並び | 名前の昇順 (`localeCompare('en')`) |
 * | 件数 | 20 まで。超えた数は `more` |
 * | 入れる値 | `/{name} ` (末尾の空白はライブラリが足す) |
 */

/** 候補の元。`running-session-store.ts` の `SlashCommandEntry` と同じ形 (chat から session を import しないので構造だけ写す)。 */
export interface SlashCommandSource {
  readonly name: string
  readonly description: string | null
  readonly argumentHint: string | null
}

/** trigger popover の item (`Unstable_TriggerItem` と構造が同じ)。 */
export interface SlashCommandItem {
  readonly id: string
  readonly type: string
  readonly label: string
  readonly description?: string | undefined
  readonly metadata?: { readonly argumentHint: string } | undefined
}

export const SLASH_COMMAND_MAX_CANDIDATES = 20
export const SLASH_COMMAND_ITEM_TYPE = 'slash-command'

const stripOneSlash = (s: string): string => (s.startsWith('/') ? s.slice(1) : s)

export interface SlashCommandSearch {
  readonly items: readonly SlashCommandItem[]
  /** 20 件を超えた数 (「ほか N 件」)。 */
  readonly more: number
}

/** 前方一致・昇順・20 件で切る (純関数)。 */
export function searchSlashCommands(
  entries: readonly SlashCommandSource[],
  query: string
): SlashCommandSearch {
  const needle = stripOneSlash(query).toLowerCase()
  const matched = entries
    .map((e) => ({ ...e, name: stripOneSlash(e.name) }))
    .filter((e) => e.name !== '' && e.name.toLowerCase().startsWith(needle))
    .sort((a, b) => a.name.localeCompare(b.name, 'en'))
  const items = matched.slice(0, SLASH_COMMAND_MAX_CANDIDATES).map((e): SlashCommandItem => ({
    id: e.name,
    type: SLASH_COMMAND_ITEM_TYPE,
    label: e.name,
    ...(e.description !== null && e.description !== '' ? { description: e.description } : {}),
    ...(e.argumentHint !== null && e.argumentHint !== ''
      ? { metadata: { argumentHint: e.argumentHint } }
      : {})
  }))
  return { items, more: Math.max(0, matched.length - items.length) }
}

/** trigger popover の adapter。カテゴリは無く、`search` だけの平らな検索 (空の問い合わせでも全件)。 */
export function createSlashCommandAdapter(entries: readonly SlashCommandSource[]): {
  categories: () => readonly []
  categoryItems: () => readonly []
  search: (query: string) => readonly SlashCommandItem[]
} {
  return {
    categories: () => [],
    categoryItems: () => [],
    search: (query) => searchSlashCommands(entries, query).items
  }
}

/** 入力の先頭の `/` から最初の空白の手前まで。先頭以外の `/`・空白より後にカーソルがある・カーソルが `/` の前は当てない。 */
export function slashMatcher(
  text: string,
  triggerChar: string,
  cursorPosition: number
): { readonly query: string; readonly offset: number; readonly endOffset: number } | null {
  if (triggerChar !== '/' || !text.startsWith('/')) return null
  const whitespace = text.search(/\s/)
  const end = whitespace === -1 ? text.length : whitespace
  if (cursorPosition <= 0 || cursorPosition > end) return null
  return { query: text.slice(1, end), offset: 0, endOffset: end }
}

/**
 * 一覧と照合する matcher。一致が 0 件なら null を返し、popover を開かない (Enter / Tab を奪わず `/xxx` をそのまま送れる)。
 */
export function createSlashMatcher(
  entries: readonly SlashCommandSource[]
): (
  text: string,
  triggerChar: string,
  cursorPosition: number
) => { readonly query: string; readonly offset: number; readonly endOffset: number } | null {
  return (text, triggerChar, cursorPosition) => {
    const match = slashMatcher(text, triggerChar, cursorPosition)
    if (match === null) return null
    return searchSlashCommands(entries, match.query).items.length === 0 ? null : match
  }
}

/** 選んだ候補の入れ方 (`/{name}`)。`parse` は候補の表示に使わないので、全体を 1 つの text として返す。 */
export const slashFormatter = {
  serialize: (item: { readonly id: string }): string => `/${item.id}`,
  parse: (text: string): readonly { readonly kind: 'text'; readonly text: string }[] => [
    { kind: 'text', text }
  ]
}
