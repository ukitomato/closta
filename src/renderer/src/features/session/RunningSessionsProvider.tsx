import { useCallback, useMemo, useState } from 'react'

import {
  AssistantRuntimeProvider,
  useExternalStoreRuntime,
  type AppendMessage,
  type ExternalStoreThreadListAdapter,
  type ThreadMessageLike
} from '@assistant-ui/react'

import type { AutoModeStatus } from '@domain/runtime/capabilities'
import type { SessionLaunchConfig } from '@domain/session/launch-config'
import type { LaunchOrigin } from '@domain/session/launch-usage'
import type { SessionResumeRequest } from '@domain/session/resume'

import { runtimeTitle } from '@/features/runtime-list/labels'
import { useRuntimes } from '@/features/runtime-list/useRuntimes'
import { useFolders } from '@/features/workspace-folders/useFolders'
import { useUiStore } from '@/stores/ui'

import { isRunBusy } from './composer-queue'
import { SESSION_NAME_FALLBACKS } from './labels'
import { useRunningSessionStore, useRunningSessionStoreApi } from './running-session-context'
import { RunningSessionsViewContext, type RunningSessionsView } from './running-sessions-view'
import { MESSAGE_WINDOW, windowMessages } from './session-view'
import { useLiveSession, type LiveSession } from './useLiveSession'
import { useRunningThreadList } from './useRunningThreadList'

/**
 * **稼働中のセッションの assistant-ui の runtime をシェル全体に張る** (O-7 / FE-002。X-5 の `SessionScreen` から切り出した)。
 *
 * サイドバーの稼働中の区画 (`RunningSessionList`。ThreadList の primitive が runtime を要る) と、中央の本体の実行中の
 * Chat (`LivePane`) が**同じ runtime** を使う。面の切り替え (過去の会話・設定) でこの provider を外さない —
 * 外すと runtime と thread が作り直される (X-5 FR-008 / O-7 FR-004)。
 *
 * 過去の一覧と transcript は自分の provider を内側に持つ (入れ子の provider は内側が勝つ。plan RK-02)。
 * 面に渡す値の型と読み口 (`useRunningSessionsView`) は `running-sessions-view.ts`。
 */

export function RunningSessionsProvider({
  children
}: {
  readonly children: React.ReactNode
}): React.JSX.Element {
  const store = useRunningSessionStoreApi()
  const selectedId = useRunningSessionStore((s) => s.selectedId)
  const folders = useFolders()
  const runtimes = useRuntimes()

  // 一覧をまだ持たない (読み込み中・失敗) 間は名前を空にし、「登録が解除された」と断定しない
  // (一覧があって引けないときだけ fallback。X-4 po M-102 の規則の継承 / pr-gate R2 po L-101)。
  const folderName = useCallback(
    (id: string) =>
      folders.list === null
        ? ''
        : (folders.list.folders.find((f) => f.id === id)?.displayName ??
          SESSION_NAME_FALLBACKS.folder),
    [folders.list]
  )
  const runtimeName = useCallback(
    (id: string) => {
      if (runtimes.list === null) return ''
      const r = runtimes.list.runtimes.find((x) => x.id === id)
      return r === undefined ? SESSION_NAME_FALLBACKS.runtime : runtimeTitle(r.kind, r.distroName)
    },
    [runtimes.list]
  )
  // 表示用の 3 値だけを返す。一覧が無い・引けないときは `undetermined` (O-4 / 014 data-model §4「権限モード」)。
  const runtimeAutoMode = useCallback(
    (id: string): AutoModeStatus =>
      runtimes.list?.runtimes.find((r) => r.id === id)?.capabilities.autoModeStatus ??
      'undetermined',
    [runtimes.list]
  )

  // **稼働中セッション = assistant-ui の thread** (Principle XIII。契約は useRunningThreadList.ts)。
  const threadList = useRunningThreadList(folderName)
  const live = useLiveSession(selectedId ?? '')
  const runtime = useLiveRuntime(live, threadList)

  const launch = useCallback(
    (config: SessionLaunchConfig, origin: LaunchOrigin) =>
      store.launch(config, folders.list === null ? null : folderName(config.folderId), origin),
    [store, folders.list, folderName]
  )

  const resume = useCallback(
    async (request: SessionResumeRequest, origin: LaunchOrigin) => {
      const outcome = await store.resume(
        request,
        folders.list === null ? null : folderName(request.config.folderId),
        origin
      )
      // 既に動いている行を選ぶだけのとき、シェルは「起動の受け付け」と読まない (行が前から在る) ので、ここで閉じる。
      if (outcome === 'already-running') useUiStore.getState().setLaunchOpen(false)
    },
    [store, folders.list, folderName]
  )

  const view = useMemo<RunningSessionsView>(
    () => ({
      live,
      hiddenCount: runtime.hiddenCount,
      showMore: runtime.showMore,
      revealMessage: runtime.revealMessage,
      folderName,
      runtimeName,
      runtimeAutoMode,
      folders: folders.list,
      launch,
      resume
    }),
    [
      live,
      runtime.hiddenCount,
      runtime.showMore,
      runtime.revealMessage,
      folderName,
      runtimeName,
      runtimeAutoMode,
      folders.list,
      launch,
      resume
    ]
  )

  return (
    <AssistantRuntimeProvider runtime={runtime.runtime}>
      <RunningSessionsViewContext.Provider value={view}>
        {children}
      </RunningSessionsViewContext.Provider>
    </AssistantRuntimeProvider>
  )
}

function extractText(message: AppendMessage): string {
  return message.content
    .map((part) => (part.type === 'text' ? part.text : ''))
    .join('')
    .trim()
}

const EMPTY_MESSAGES: readonly ThreadMessageLike[] = []

/**
 * **assistant-ui の runtime は 1 つ** (X-5 / Principle XIII。`AgentRuntime` のランタイムではない)。表示中のセッションの本文・状態・キューを渡し、稼働中セッションを
 * `adapters.threadList` で並べる。adapter の `threadId` が変わると assistant-ui はスレッドの中身 (composer を含む) を
 * 作り直す。選択なしは本文なし・composer 無効。
 */
function useLiveRuntime(
  session: LiveSession | null,
  threadList: ExternalStoreThreadListAdapter
): {
  readonly runtime: ReturnType<typeof useExternalStoreRuntime>
  readonly hiddenCount: number
  readonly showMore: () => void
  readonly revealMessage: (messageId: string) => void
} {
  /*
   * **assistant-ui に渡すのは末尾の窓だけにする** (X-5 / SC-003)。assistant-ui の ThreadClient は messages が変わるたびに
   * 全メッセージぶんの MessageClient を作り直す (件数に比例。仮想化は DOM にしか効かない) ため、表示中のセッションが
   * 伸び続けると 1 件ごとの更新が 50ms を超える (実測: 約 280 件で 51〜76ms)。窓で切れば 1 回の更新は件数によらず一定になる。
   * **本文の保持は store に全件残す** (FR-008)。省略した分は「さらに表示」で窓を広げて辿れる (Principle XII)。
   * 配列は messages と窓が変わったときだけ作り直す — 下書きの入力などの再描画で毎回作ると、毎打鍵で窓ぶんの再構築が走る。
   * 窓の広さはセッションごとに持つ。
   */
  const [windows, setWindows] = useState<Readonly<Record<string, number>>>({})
  const sessionId = session?.sessionId ?? null
  const messages = session?.state.messages ?? EMPTY_MESSAGES
  const windowSize = sessionId === null ? MESSAGE_WINDOW : (windows[sessionId] ?? MESSAGE_WINDOW)
  const { windowed, hiddenCount } = useMemo(
    () => windowMessages(messages, windowSize),
    [messages, windowSize]
  )
  const showMore = useCallback(() => {
    if (sessionId === null) return
    setWindows((w) => ({ ...w, [sessionId]: (w[sessionId] ?? MESSAGE_WINDOW) + MESSAGE_WINDOW }))
  }, [sessionId])
  /*
   * **id のメッセージが入るところまで窓を広げる** (O-3 / 012 data-model §2「移動」/ research R-03 / plan RK-04)。
   * 「さらに表示」と同じ操作 (`MESSAGE_WINDOW` ずつ) を、そのメッセージが窓に入るまで重ねる。会話内検索が窓の外の一致へ
   * 移るときだけ呼ばれる。窓の中の id・知らない id では窓を変えない (同じ state を返して再描画させない)。
   * 窓を元に戻す操作は足さない (「さらに表示」と同じ)。
   */
  const revealMessage = useCallback(
    (messageId: string) => {
      if (sessionId === null) return
      const index = messages.findIndex((message) => message.id === messageId)
      if (index === -1) return
      const needed = messages.length - index
      setWindows((w) => {
        const current = w[sessionId] ?? MESSAGE_WINDOW
        if (needed <= current) return w
        const steps = Math.ceil((needed - current) / MESSAGE_WINDOW)
        return { ...w, [sessionId]: current + steps * MESSAGE_WINDOW }
      })
    },
    [sessionId, messages]
  )

  // **turn が in-flight な間 = busy** (`running` / `awaiting_permission`)。終端では busy にしない。
  const busy = session !== null && isRunBusy(session.runState, session.terminal)

  const runtime = useExternalStoreRuntime({
    messages: windowed as ThreadMessageLike[],
    // `launching` は busy にしない — 「利用者の初回プロンプト待ち」であり (claude は初回 user メッセージが届くまで
    // `system/init` すら出さない — 実測)、composer を送信ボタンにしておかないと最初のプロンプトを送れない。
    isRunning: busy,
    // **送信できない終端では composer を無効化する** (失敗 / 終了済み / 強制終了 / 終了処理中。X-1 pr-gate po H-001 /
    // FR-010 / R3-H-04)。有効なままだと「打っても応答が来ない」dead-end を再生産する。done / interrupted かつ生存中は有効。
    isDisabled: session === null || session.terminal,
    // **native message queue (capped adapter)** (X-2 FR-004)。**セッションごとに store が持つ** (FR-010) — 表示していない
    // 間も状態の変化で dispatch / 取り消しが進む (完了 trigger は store の syncQueue)。`driver.cancel` を渡さないので
    // 実行中の送信 (steer lane) は「現ターン完了後に処理」に degrade する (FR-005)。
    ...(session?.queue != null ? { queue: session.queue.adapter } : {}),
    convertMessage: (message) => message,
    // queue 提供時 runtime は送信を queue に回すため onNew は呼ばれない (append 実装)。queue 非提供時の fallback。
    onNew: (message) => {
      const text = extractText(message)
      if (session !== null && session.interceptAppCommand(text)) return Promise.resolve()
      if (session !== null && text.length > 0) {
        session.appendUser(text)
        session.send(text)
      }
      return Promise.resolve()
    },
    // composer の停止ボタンは中断に割り当てる (強制終了は一覧の別ボタン。X-1 FR-015/016)。
    // **中断の単一 locus** (X-2 FR-006 / po-N-001): store の interrupt が notifyCancelled → interrupt の順で呼ぶ。
    onCancel: () => {
      session?.interrupt()
      return Promise.resolve()
    },
    adapters: { threadList }
  })

  return { runtime, hiddenCount, showMore, revealMessage }
}
