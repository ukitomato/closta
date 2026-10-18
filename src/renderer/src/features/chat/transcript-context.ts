import { createContext, useCallback, useContext, useEffect, useSyncExternalStore } from 'react'

import { useAuiState, type ToolCallMessagePartStatus } from '@assistant-ui/react'

import type { SessionRunState } from '@domain/session/run-state'

import { useUiStore, type TranscriptDensity } from '@/stores/ui'

import {
  isToolResultPending,
  toolResultState,
  toolStatusInput,
  type ToolResultState
} from './tool-result-state'

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

/**
 * **tool の結果の状態の前提** (O-6 / 016 data-model §3)。実行中は `LivePane` が `runState` つきで渡し、過去ログ
 * (`ChatScreen`) は `live: false`。`latestTurn` / `orphanResult` は part ごとの値なので `useToolResultState` が thread から引く。
 */
export interface ToolResultThreadContext {
  readonly live: boolean
  readonly runState: SessionRunState | null
}

export const ToolResultThreadContext = createContext<ToolResultThreadContext>({
  live: false,
  runState: null
})

/**
 * **名前を伏せた Hook の番号** (O-11 / 019 data-model §1.3。メッセージの id → 番号)。`Thread` が thread のメッセージから
 * `maskedHookOrdinals` で作って渡す。provider の外は空 (番号なし)。
 */
export const MaskedHookOrdinalsContext = createContext<ReadonlyMap<string, number>>(new Map())

/**
 * tool の part 1 つの結果の状態・状態のアイコンの入力・O-4 の `ToolResultMarks` の `pending` (結果待ちのときだけ真) を返す。
 * 並列の tool は part ごとに判定する。
 */
export function useToolResultState(part: {
  readonly toolCallId: string
  readonly result?: unknown
  readonly isError?: boolean
}): {
  readonly state: ToolResultState
  readonly status: ToolCallMessagePartStatus
  readonly pending: boolean
} {
  const thread = useContext(ToolResultThreadContext)
  const messageId = useAuiState((s) => s.message.id)
  // 末尾から自分のメッセージまで見る (結果だけのメッセージは後ろに付く)。primitive を返して再描画を絞る。
  const flags = useAuiState((s) => {
    const orphanId = `result:${part.toolCallId}`
    const messages = s.thread.messages
    let orphan = false
    let latest = true
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const m = messages[i]
      if (m === undefined) continue
      if (m.id === orphanId) orphan = true
      if (m.id === messageId) {
        return `${latest ? 1 : 0}${orphan ? 1 : 0}`
      }
      if (m.role === 'user') latest = false
    }
    return `${latest ? 1 : 0}${orphan ? 1 : 0}`
  })
  const state = toolResultState(part, {
    live: thread.live,
    runState: thread.runState,
    latestTurn: flags[0] === '1',
    orphanResult: flags[1] === '1'
  })
  return {
    state,
    status: toolStatusInput(state, part.isError),
    pending: isToolResultPending(state)
  }
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
  /**
   * 表示中のセッションの構成 (`init-report`) が報告した MCP サーバーの名前 (O-5 / 015 data-model §1。MCP の tool の名前を
   * 解く `parseMcpToolName` の `knownServers`)。構成が替わるまで同じ参照を返す (`useSyncExternalStore` の snapshot)。
   */
  mcpServerNames(): readonly string[]
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

/** MCP サーバーの名前が無いときの値 (過去ログ・構成がまだ無い。同じ参照を返す)。 */
export const NO_MCP_SERVER_NAMES: readonly string[] = Object.freeze([])

/**
 * 構成から MCP サーバーの名前の一覧を引く関数を作る (購読元の `mcpServerNames` の実装)。`readReport` が返す構成が
 * **同じ参照のあいだは同じ配列を返す** — 構成と無関係な計量 (`context` など) の更新で snapshot を変えない (015 research R-05)。
 */
export function createMcpServerNamesReader(
  readReport: () => { readonly mcpServers: readonly { readonly name: string }[] } | null
): () => readonly string[] {
  let lastReport: ReturnType<typeof readReport> | undefined
  let lastNames: readonly string[] = NO_MCP_SERVER_NAMES
  return () => {
    const report = readReport()
    if (report !== lastReport) {
      lastReport = report
      lastNames =
        report === null || report.mcpServers.length === 0
          ? NO_MCP_SERVER_NAMES
          : Object.freeze(report.mcpServers.map((s) => s.name))
    }
    return lastNames
  }
}

/**
 * 購読元から MCP サーバーの名前を購読する。購読元が null (過去ログ) なら空の配列 (同じ参照)。
 * transcript の外 (承認カードを置く `LivePane`) が購読元を直接持つときに使う。
 */
export function useMcpServerNamesOf(source: LiveProgressSource | null): readonly string[] {
  const subscribe = useCallback(
    (listener: () => void) => (source === null ? noopUnsubscribe : source.subscribe(listener)),
    [source]
  )
  const snapshot = useCallback(
    () => (source === null ? NO_MCP_SERVER_NAMES : source.mcpServerNames()),
    [source]
  )
  return useSyncExternalStore(subscribe, snapshot, snapshot)
}

/** 表示中のセッションの MCP サーバーの名前 (transcript の element が読む)。購読元が無いとき (過去ログ) は空。 */
export function useLiveMcpServerNames(): readonly string[] {
  return useMcpServerNamesOf(useContext(LiveProgressContext))
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
