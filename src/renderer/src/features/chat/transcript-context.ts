import { createContext, useCallback, useContext, useEffect, useSyncExternalStore } from 'react'

import { useUiStore, type TranscriptDensity } from '@/stores/ui'

/**
 * transcript の element (`thread.aui.tsx`。過去ログと実行中で共有) に画面から渡す表示の前提 (O-2)。
 */

/**
 * **記録にこれ以上の終わりが来ないか** (FR-009 / US-2 AC6 / data-model §2「結果不明」)。
 * - 実行中: セッションが終了済み・失敗のとき true (`LivePane` の `LiveSessionPane` が store のセッションの状態から渡す)
 * - 過去ログ: 常に true (`ChatScreen`)。過去ログを開いた時点でまだ動いている task も同じ (記録に結果が無いことは事実)
 *
 * true のとき、終わりを表さない状態のシステムイベントの行は「結果不明」で描く (DTO は変えない)。
 */
export const TranscriptSettledContext = createContext<boolean>(false)

export function useTranscriptSettled(): boolean {
  return useContext(TranscriptSettledContext)
}

/** transcript の情報密度 (FR-012。`stores/ui` の値。監視ビューの行の密度とは別)。 */
export function useTranscriptDensity(): TranscriptDensity {
  return useUiStore((s) => s.transcriptDensity)
}

/* ── 実行中の進み具合 (O-4 / 014 data-model §4「進み具合」) ─────────────────────────────── */

/**
 * **実行中の進み具合の購読元** (tool の経過時間と思考のトークン数の推定)。実行中のペイン (`LivePane` の `LiveSessionPane`)
 * が稼働中のストアの購読から作り、Thread の外側から渡す (`TranscriptSettledContext` と同じ形。chat は session を
 * import しない)。値は数だけ。
 *
 * | 規則 | 根拠 |
 * |---|---|
 * | 過去ログ (`ChatScreen`) は渡さない (null)。過去ログには経過時間も思考の印も出ない | 014 data-model §4 |
 * | 読む側は自分の値だけを `useSyncExternalStore` で購読する — 他の tool の更新・思考の更新で描き直さない | 014 data-model §4 / plan Performance Goals |
 * | 値は表示中のセッションのものだけ (別のセッションの値を引かない) | 014 spec US-3 AC4 と同じ規則 |
 */
export interface LiveProgressSource {
  /** tool の呼び出しの id → 経過時間 (秒)。値が無ければ null。 */
  toolElapsed(toolCallId: string): number | null
  /** 思考のトークン数の推定。値が無ければ null。 */
  thinkingTokens(): number | null
  /** 値が変わったときに呼ぶ listener を登録し、解除する関数を返す。 */
  subscribe(listener: () => void): () => void
}

export const LiveProgressContext = createContext<LiveProgressSource | null>(null)

const noopUnsubscribe = (): void => {}

/**
 * tool の呼び出し 1 つの経過時間 (秒)。`active` (結果待ち) の間だけ購読し、それ以外と購読元が無いとき (過去ログ) は null。
 */
export function useLiveToolElapsed(toolCallId: string, active: boolean): number | null {
  const context = useContext(LiveProgressContext)
  const source = active && toolCallId !== '' ? context : null
  const subscribe = useCallback(
    (listener: () => void) => (source === null ? noopUnsubscribe : source.subscribe(listener)),
    [source]
  )
  const snapshot = useCallback(
    () => (source === null ? null : source.toolElapsed(toolCallId)),
    [source, toolCallId]
  )
  return useSyncExternalStore(subscribe, snapshot, snapshot)
}

/** 思考のトークン数の推定。購読元が無いとき (過去ログ) は null。 */
export function useLiveThinkingTokens(): number | null {
  const source = useContext(LiveProgressContext)
  const subscribe = useCallback(
    (listener: () => void) => (source === null ? noopUnsubscribe : source.subscribe(listener)),
    [source]
  )
  const snapshot = useCallback(() => (source === null ? null : source.thinkingTokens()), [source])
  return useSyncExternalStore(subscribe, snapshot, snapshot)
}

/* ── 会話内検索の navigator (O-3 / 012 data-model §2「移動」「メッセージの要素の引き方」) ─────────────── */

/**
 * メッセージの root の印 (`data-message-id`。値はメッセージの id を React の属性として渡す) と、text part の描画の外側の印
 * (`data-search-text`)。**`querySelector` 系に渡すのはこの固定の文字列だけ** — 外部由来の id をセレクタに埋め込まない
 * (`"` `\` `]` で投げ、`a"],[data-message-id="b` のような id はセレクタの結合として別のメッセージに当たる。CWE-74)。
 */
export const MESSAGE_ELEMENT_SELECTOR = '[data-message-id]'
export const SEARCH_TEXT_SELECTOR = '[data-search-text]'

/**
 * メッセージの要素を引く (移動と強調で共有)。`root` の中の `[data-message-id]` を並びの順に回し、`dataset.messageId === id`
 * の最初の要素を返す。無ければ null。id を CSS セレクタの文字列に埋め込まず、`CSS.escape` でも組まない (data-model §2)。
 */
export function findMessageElement(root: ParentNode, id: string): HTMLElement | null {
  const elements = root.querySelectorAll<HTMLElement>(MESSAGE_ELEMENT_SELECTOR)
  for (let i = 0; i < elements.length; i += 1) {
    const element = elements[i]
    if (element !== undefined && element.dataset.messageId === id) return element
  }
  return null
}

/**
 * transcript が登録する移動の口 (data-model §2「移動」)。`thread.aui.tsx` の仮想パスと非仮想パスがそれぞれ登録する。
 */
export interface TranscriptNavigator {
  /**
   * id のメッセージへ移る (画面の中央に入れる)。移るときに最下部への追従を切る。assistant-ui に渡したメッセージに
   * その id が無ければ何もせず false。
   */
  scrollToMessage(id: string): boolean
  /** 描かれたメッセージを含む要素 (強調の対象を引く・描画の変化を見る範囲)。まだ描かれていなければ null。 */
  root(): HTMLElement | null
}

/**
 * navigator の登録先 (会話内検索の provider が 1 つ持つ)。transcript の作り直し (仮想 / 非仮想の切り替え・メッセージの
 * 変化) のたびに登録し直されるので、購読して最新の navigator を引く。
 */
export interface TranscriptNavigatorRegistry {
  set(navigator: TranscriptNavigator): void
  /** `navigator` が今の登録のときだけ外す (後から登録したものを消さない)。 */
  clear(navigator: TranscriptNavigator): void
  current(): TranscriptNavigator | null
  /** 今の navigator の `root()` (`useSyncExternalStore` の snapshot に使う)。 */
  root(): HTMLElement | null
  subscribe(listener: () => void): () => void
}

export function createTranscriptNavigatorRegistry(): TranscriptNavigatorRegistry {
  let current: TranscriptNavigator | null = null
  const listeners = new Set<() => void>()
  const notify = (): void => {
    for (const listener of Array.from(listeners)) listener()
  }
  return {
    set(navigator) {
      if (current === navigator) return
      current = navigator
      notify()
    },
    clear(navigator) {
      if (current !== navigator) return
      current = null
      notify()
    },
    current: () => current,
    root: () => current?.root() ?? null,
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    }
  }
}

/** 会話内検索の provider が transcript に渡す登録先。provider の外 (単体の画面・テスト) では null で、登録しない。 */
export const TranscriptNavigatorContext = createContext<TranscriptNavigatorRegistry | null>(null)

/** transcript が navigator を登録する (`navigator` が変わるたびに登録し直し、外れたら解除する)。 */
export function useRegisterTranscriptNavigator(navigator: TranscriptNavigator): void {
  const registry = useContext(TranscriptNavigatorContext)
  useEffect(() => {
    if (registry === null) return
    registry.set(navigator)
    return () => registry.clear(navigator)
  }, [registry, navigator])
}
