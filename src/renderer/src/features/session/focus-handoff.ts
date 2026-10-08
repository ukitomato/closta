/**
 * **押したボタンが自分ごと消えるときのフォーカスの行き先** (O-4 FR-019 / 014 data-model §8 / research R-10。WCAG 2.4.3)。
 *
 * 押した部品が、消える操作を呼ぶ**前**に呼ぶ。消えた後に拾う形 (`focusout` / `MutationObserver`) にしないのは research R-10
 * のとおり (Chromium は要素の削除で blur を出さず、本文のクリックでも `relatedTarget === null` の focusout が出る)。
 *
 * | 押すもの | 行き先 | 関数 |
 * |---|---|---|
 * | サイドバーの稼働中の行の「閉じる」 | 次の行の Trigger → 前の行の Trigger → 稼働中の区画の見出し | `handOffFocusFromClosingRow` |
 * | 承認カードの「許可」「拒否」・キューの拒否の告知の「閉じる」・積んだ入力の「キューから削除」・「さらに表示」の最後の押下 | 表示中のペインの composer | `handOffFocusToComposer` |
 *
 * - 押した要素 (またはその部品) の中にフォーカスがあるときだけ移す。別の場所で入力している利用者のフォーカスを奪わない
 * - composer が無効 (終了済みなど) なら移さない (今のまま)
 * - セレクタは下の固定の文字列だけで組む。外部由来の id をセレクタに入れない (O-3 の `findMessageElement` と同じ規則)
 * - O-7 の `useFocusRescue` (面の中身の切り替えで拾う) とは別の仕組みで、そちらの規則は変えない
 */

/** 稼働中の行 (`thread-list.aui.tsx` の `ThreadListItem`) と、その一覧・Trigger。 */
const ROW = '[data-slot="aui_thread-list-item"]'
const ROW_LIST = '[data-slot="aui_thread-list-items"]'
const ROW_TRIGGER = '[data-slot="aui_thread-list-item-trigger"]'
/** 稼働中の区画 (`RunningSessionList` の `section`) の見出し。`tabIndex={-1}` で移せる。 */
const SECTION = 'section'
const SECTION_HEADING = '[data-session-list-heading]'
/** 表示中のペイン (`LivePane` の `LiveSessionPane` の根) と、その中の composer の入力 (`thread.aui.tsx` の `Composer`)。 */
const LIVE_PANE = '[data-live-pane]'
const ENABLED_COMPOSER_INPUT = '[data-composer-input]:not(:disabled)'

function hasFocusWithin(scope: Element): boolean {
  const active = scope.ownerDocument.activeElement
  return active !== null && scope.contains(active)
}

/** 閉じる行の次の行の Trigger、無ければ前の行の Trigger。 */
function neighbourTrigger(row: Element): HTMLElement | null {
  const rows = Array.from(row.closest(ROW_LIST)?.querySelectorAll(ROW) ?? [])
  const at = rows.indexOf(row)
  if (at < 0) return null
  const neighbour = rows[at + 1] ?? rows[at - 1]
  return neighbour?.querySelector<HTMLElement>(ROW_TRIGGER) ?? null
}

/**
 * サイドバーの稼働中の行を閉じる**前**に呼ぶ (`origin` は押した「閉じる」)。フォーカスが閉じる行の中にあれば、次の行の Trigger
 * → 前の行の Trigger → 稼働中の区画の見出しへ移す。
 */
export function handOffFocusFromClosingRow(origin: Element): void {
  const row = origin.closest(ROW)
  if (!hasFocusWithin(row ?? origin)) return
  const target =
    (row === null ? null : neighbourTrigger(row)) ??
    origin.closest(SECTION)?.querySelector<HTMLElement>(SECTION_HEADING) ??
    null
  target?.focus()
}

/**
 * 中央の本体の部品が自分ごと消える**前**に呼ぶ (`scope` は押した要素かその部品)。フォーカスが `scope` の中にあれば、表示中の
 * ペインの composer へ移す。composer が無効なら移さない。
 */
export function handOffFocusToComposer(scope: Element | null): void {
  if (scope === null || !hasFocusWithin(scope)) return
  scope.closest(LIVE_PANE)?.querySelector<HTMLElement>(ENABLED_COMPOSER_INPUT)?.focus()
}
