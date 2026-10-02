import { useStore } from 'zustand'
import { useShallow } from 'zustand/react/shallow'

import type { LaunchFailureReason } from '@domain/session/agent-session'
import type { SessionRunState } from '@domain/session/run-state'

import {
  ThreadListItemsByKey,
  ThreadListNew,
  ThreadListRoot
} from '@/components/assistant-ui/elements/thread-list.aui'
import { Button } from '@/components/ui/button'

import {
  formatStartedAt,
  SESSION_ACTION_LABELS,
  SESSION_END_NOTICES,
  SESSION_LIST_LABELS,
  SESSION_ROW_STATUS_LABELS
} from './labels'
import { useRunningSessionStore, useRunningSessionStoreApi } from './running-session-context'
import { availableActions, deriveSessionView, rowStatus } from './session-view'

/**
 * **稼働中セッションの一覧** (X-5 / FE-011 / FR-009 / FR-011)。最小の一覧と切り替えだけを持つ — 状態の強調表示・
 * 情報密度の切替・監視ビューは O-1 の領分。
 *
 * | 規則 | 根拠 |
 * |---|---|
 * | **assistant-ui の ThreadList で組む** (`thread-list.aui.tsx` の `ThreadListRoot` / `ThreadListItemsByKey` / `ThreadListNew`)。選択と新規起動は `SessionScreen` の `ExternalStoreThreadListAdapter` (`onSwitchToThread` / `onSwitchToNewThread`) を通る。R-2 のセッション一覧と同じ形 | Principle XIII |
 * | 行はフォルダ表示名 (表題)・ランタイム・起動時刻 (秒まで)・状態を示し、表示中の行が分かる (`aria-current`) | FR-009 |
 * | 状態は run-state と生存フラグの組から決める (`rowStatus`。`done` は応答待ち / 終了済みに分かれる) | FR-009 |
 * | 操作は状態に応じてだけ出す (`availableActions`): 終了 / 停止 (中断・強制終了。起動中は強制終了だけ) / 閉じる。**「閉じる」は adapter の `onDelete` に割り当てない** — `onDelete` は正本の削除を意味する (R-2 `thread-list-adapter.ts` の注記 / Principle X)。行の中の操作として置く | FR-011 |
 * | 行が 0 件のときは空状態と新規起動の導線を出す | FR-009 |
 *
 * **本コンポーネントは `AssistantRuntimeProvider` の内側で使う** (ThreadList の primitive が runtime を要る)。
 */

export interface RunningSessionListProps {
  /** runtimeId → 表示名。 */
  readonly runtimeName: (runtimeId: string) => string
}

export function RunningSessionList({ runtimeName }: RunningSessionListProps): React.JSX.Element {
  const order = useRunningSessionStore((s) => s.order)

  return (
    <nav aria-label={SESSION_LIST_LABELS.list} className="flex h-full min-h-0 flex-col">
      <div className="border-border flex shrink-0 items-center gap-2 border-b px-3 py-2">
        <h2 className="flex-1 text-sm font-semibold">{SESSION_LIST_LABELS.heading}</h2>
        <ThreadListNew className="border-border border">
          {SESSION_ACTION_LABELS.newSession}
        </ThreadListNew>
      </div>
      {order.length === 0 ? (
        <p className="text-muted-foreground p-3 text-sm" data-testid="session-list-empty">
          {SESSION_LIST_LABELS.empty}
        </p>
      ) : (
        <ThreadListRoot className="min-h-0 flex-1 overflow-auto p-1.5">
          <ThreadListItemsByKey
            rowKeys={order}
            renderMeta={(id) => <SessionRowMeta sessionId={id} runtimeName={runtimeName} />}
            renderActions={(id) => <SessionRowActions sessionId={id} />}
          />
        </ThreadListRoot>
      )}
    </nav>
  )
}

/** 行の表示に使う値だけを選ぶ (本文・下書きの更新では再描画しない。SC-003)。 */
function useRowFacts(sessionId: string): {
  readonly session:
    | {
        readonly runtimeId: string
        readonly startedAt: number
        readonly runState: SessionRunState
        readonly failureReason: LaunchFailureReason | null
        readonly killed: boolean
        readonly ending: boolean
        readonly endForced: boolean
        readonly promptSent: boolean
      }
    | undefined
  readonly view: ReturnType<typeof deriveSessionView>
} {
  const store = useRunningSessionStoreApi()
  const session = useStore(
    store,
    useShallow((s) => {
      const v = s.sessions[sessionId]
      return v === undefined
        ? undefined
        : {
            runtimeId: v.config.runtimeId,
            startedAt: v.startedAt,
            runState: v.runState,
            failureReason: v.failureReason,
            killed: v.killed,
            ending: v.ending,
            endForced: v.endForced,
            promptSent: v.promptSent
          }
    })
  )
  const status = useStore(store, (s) => s.statuses[sessionId])
  return { session, view: deriveSessionView(session, status) }
}

/** 行の付帯情報 (ランタイム・起動時刻・状態・終わり方)。行の Trigger の内側に描かれる (a11y H-005)。 */
function SessionRowMeta({
  sessionId,
  runtimeName
}: {
  readonly sessionId: string
  readonly runtimeName: (runtimeId: string) => string
}): React.JSX.Element | null {
  const { session, view } = useRowFacts(sessionId)
  if (session === undefined) return null
  return (
    <span className="flex flex-col">
      <span className="truncate">
        {[runtimeName(session.runtimeId), formatStartedAt(session.startedAt)]
          .filter((part) => part !== '')
          .join(' · ')}
      </span>
      <span className="text-foreground" data-testid="session-row-status">
        {SESSION_ROW_STATUS_LABELS[rowStatus(view)]}
      </span>
      {(session.endForced || session.killed) && (
        <span data-testid="session-row-end-notice">
          {session.endForced ? SESSION_END_NOTICES.endForced : SESSION_END_NOTICES.killed}
        </span>
      )}
    </span>
  )
}

/** 行の操作 (FR-011)。行の Trigger の外に描かれる (ボタンを入れ子にしない)。 */
function SessionRowActions({
  sessionId
}: {
  readonly sessionId: string
}): React.JSX.Element | null {
  const store = useRunningSessionStoreApi()
  const { session, view } = useRowFacts(sessionId)
  if (session === undefined) return null
  const actions = availableActions(view, session)
  if (!actions.end && !actions.interrupt && !actions.kill && !actions.close) return null
  return (
    <>
      {actions.end && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={actions.endPending}
          title={SESSION_ACTION_LABELS.endTitle}
          onClick={() => store.end(sessionId)}
        >
          {actions.endPending ? SESSION_ACTION_LABELS.ending : SESSION_ACTION_LABELS.end}
        </Button>
      )}
      {actions.interrupt && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => store.interrupt(sessionId)}
        >
          {SESSION_ACTION_LABELS.interrupt}
        </Button>
      )}
      {actions.kill && (
        <Button
          type="button"
          size="sm"
          variant="destructive"
          title={SESSION_ACTION_LABELS.killTitle}
          onClick={() => store.kill(sessionId)}
        >
          {SESSION_ACTION_LABELS.kill}
        </Button>
      )}
      {actions.close && (
        <Button type="button" size="sm" variant="ghost" onClick={() => store.close(sessionId)}>
          {SESSION_ACTION_LABELS.close}
        </Button>
      )}
    </>
  )
}
