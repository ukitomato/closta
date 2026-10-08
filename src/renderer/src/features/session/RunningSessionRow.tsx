import { useStore } from 'zustand'
import { useShallow } from 'zustand/react/shallow'

import {
  CircleAlertIcon,
  CircleStopIcon,
  OctagonXIcon,
  PauseIcon,
  ShieldAlertIcon,
  XIcon
} from 'lucide-react'

import type { LaunchFailureReason } from '@domain/session/agent-session'
import type { SessionRunState } from '@domain/session/run-state'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

import { handOffFocusFromClosingRow } from './focus-handoff'
import {
  activityPrefixLabel,
  elapsedLabel,
  formatStartedAt,
  launchFailureLabel,
  launchFailureShortLabel,
  SESSION_ACTION_LABELS,
  SESSION_END_NOTICES,
  SESSION_ROW_STATUS_LABELS
} from './labels'
import { useRunningSessionStore, useRunningSessionStoreApi } from './running-session-context'
import type { Density, SessionRowStatus } from './running-session-types'
import { availableActions, deriveSessionView, formatElapsed, rowStatus } from './session-view'
import { useSessionClock } from './useSessionClock'

/**
 * **監視ビューの行の部品と行の操作** (X-5 FE-011 / O-1 FR-001〜FR-009。O-4 FR-018 (3) で `RunningSessionList.tsx` から
 * 切り出した)。一覧 (`RunningSessionList`) は `ThreadListItemsByKey` の `renderMeta` / `renderTooltip` / `renderActions` に
 * ここの `SessionRowMeta` / `RowTooltip` / `SessionRowActions` を渡すだけ。行の規則 (購読の範囲・会話由来の文字列の描き方・
 * 操作の出し分け) の正本は `RunningSessionList.tsx` の冒頭の表。
 */

/** 行の表示に使う値だけを選ぶ (本文・下書き・時計・直近の活動では再描画しない。SC-003 / SC-006)。 */
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

/** 行の文脈 (ランタイム · 起動時刻)。詳しく の行と compact のツールチップ・読み上げで同じものを出す。 */
function rowContext(
  session: { readonly runtimeId: string; readonly startedAt: number },
  runtimeName: (runtimeId: string) => string
): string {
  return [runtimeName(session.runtimeId), formatStartedAt(session.startedAt)]
    .filter((part) => part !== '')
    .join(' · ')
}

/** 終わり方の告知 (強制停止 / 強制終了。X-5 FR-011)。詳しく は行に、compact はツールチップと読み上げに出す。 */
function endNoticeOf(session: {
  readonly endForced: boolean
  readonly killed: boolean
}): string | null {
  if (session.endForced) return SESSION_END_NOTICES.endForced
  if (session.killed) return SESSION_END_NOTICES.killed
  return null
}

/**
 * 行の状態の文言と、承認待ち・失敗の強調 (アイコン + 文言。FR-001 / FR-003)。compact の失敗は印の横に短い理由を出し、
 * 全文はツールチップと読み上げに回す (FR-008 は理由を落としてよいとしていない。pr-gate R1 po M-002)。
 */
function RowStatusBadge({
  status,
  failureReason,
  compact = false
}: {
  readonly status: SessionRowStatus
  readonly failureReason: LaunchFailureReason | null
  readonly compact?: boolean
}): React.JSX.Element {
  const label = SESSION_ROW_STATUS_LABELS[status]
  // `data-row-status` は実機計測の観測点 (行の状態の 9 値。会話由来の値を含まない。FR-012)。
  if (status === 'awaiting') {
    return (
      <Badge data-testid="session-row-status" data-row-status={status} data-attention="approval">
        <ShieldAlertIcon aria-hidden />
        {label}
      </Badge>
    )
  }
  if (status === 'failed') {
    const badge = (
      <Badge
        variant="destructive"
        data-testid="session-row-status"
        data-row-status={status}
        data-attention="failure"
      >
        <CircleAlertIcon aria-hidden />
        {label}
      </Badge>
    )
    if (compact) {
      return (
        <span className="flex min-w-0 items-center gap-1">
          {badge}
          {failureReason !== null && (
            // 読み上げは全文 (SessionRowMeta の sr-only) に任せ、短い理由は見た目だけにする (二重に読ませない)。
            <span aria-hidden className="max-w-24 truncate" data-testid="session-row-failure-short">
              {launchFailureShortLabel(failureReason)}
            </span>
          )}
        </span>
      )
    }
    return (
      <span className="flex min-w-0 flex-col gap-0.5">
        {badge}
        {failureReason !== null && (
          <span className="text-foreground whitespace-normal" data-testid="session-row-failure">
            {launchFailureLabel(failureReason)}
          </span>
        )}
      </span>
    )
  }
  return (
    <span className="text-foreground" data-testid="session-row-status" data-row-status={status}>
      {label}
    </span>
  )
}

/** 経過時間。**時計を読むのはこの子だけ** (行の本体は時計で再描画されない。research R-03)。 */
function ElapsedTime({ sessionId }: { readonly sessionId: string }): React.JSX.Element | null {
  const at = useRunningSessionStore((s) => s.statusSince[sessionId]?.at)
  const label = useSessionClock((now) =>
    at === undefined ? '' : elapsedLabel(formatElapsed(now - at))
  )
  if (label === '') return null
  return (
    <span className="tabular-nums" data-testid="session-row-elapsed">
      {label}
    </span>
  )
}

/** 直近の活動 (FR-006)。前置き (固定の文言) と会話由来の部分を別の要素で出す。 */
function RowActivity({ sessionId }: { readonly sessionId: string }): React.JSX.Element | null {
  const activity = useRunningSessionStore((s) => s.activity[sessionId] ?? null)
  if (activity === null) return null
  const subject =
    activity.tool === null ? activity.detail : `${activity.tool} ${activity.detail}`.trim()
  return (
    <span className="flex min-w-0 gap-1" data-testid="session-row-activity">
      <span className="shrink-0">{activityPrefixLabel(activity.kind)}</span>
      <span className="min-w-0 truncate" data-testid="session-row-activity-text">
        {subject}
      </span>
    </span>
  )
}

/** 行の付帯情報。行の Trigger の内側に描かれる (a11y H-005)。 */
export function SessionRowMeta({
  sessionId,
  runtimeName,
  density
}: {
  readonly sessionId: string
  readonly runtimeName: (runtimeId: string) => string
  readonly density: Density
}): React.JSX.Element | null {
  const { session, view } = useRowFacts(sessionId)
  if (session === undefined) return null
  const status = rowStatus(view)
  const context = rowContext(session, runtimeName)
  const endNotice = endNoticeOf(session)

  if (density === 'compact') {
    return (
      <span className="flex items-center gap-1.5">
        {/* I-2: 隔離バッジはここ (状態の印の前) に置く。SC-003 の E2E が行の幅を守る (pr-gate R1 architecture L-001)。 */}
        <RowStatusBadge status={status} failureReason={view.failureReason} compact />
        <ElapsedTime sessionId={sessionId} />
        {/* 行から外した情報はフォーカス時にも読まれる (FR-008)。見た目はツールチップ。 */}
        <span className="sr-only">
          {context}
          {status === 'failed' && view.failureReason !== null && (
            <span>{launchFailureLabel(view.failureReason)}</span>
          )}
          {endNotice !== null && <span>{endNotice}</span>}
          <RowActivity sessionId={sessionId} />
        </span>
      </span>
    )
  }

  return (
    <span className="flex flex-col gap-0.5">
      <span className="truncate">{context}</span>
      <span className="flex items-center gap-1.5">
        <RowStatusBadge status={status} failureReason={view.failureReason} />
        <ElapsedTime sessionId={sessionId} />
      </span>
      <RowActivity sessionId={sessionId} />
      {endNotice !== null && <span data-testid="session-row-end-notice">{endNotice}</span>}
    </span>
  )
}

/** compact の行のツールチップ (行から外した情報。FR-008)。 */
export function RowTooltip({
  sessionId,
  runtimeName
}: {
  readonly sessionId: string
  readonly runtimeName: (runtimeId: string) => string
}): React.JSX.Element | null {
  const { session, view } = useRowFacts(sessionId)
  if (session === undefined) return null
  const endNotice = endNoticeOf(session)
  // 理由を出す条件は 詳しく の行と読み上げにそろえる (失敗の行だけ。code-gate R2 convention M-002)。
  const failure = rowStatus(view) === 'failed' ? view.failureReason : null
  return (
    <span className="flex max-w-64 flex-col gap-0.5">
      <span>{rowContext(session, runtimeName)}</span>
      {failure !== null && <span>{launchFailureLabel(failure)}</span>}
      {endNotice !== null && <span>{endNotice}</span>}
      <RowActivity sessionId={sessionId} />
    </span>
  )
}

/** 行の操作 (X-5 FR-011)。行の Trigger の外に描かれる (ボタンを入れ子にしない)。compact はアイコンのボタン。 */
export function SessionRowActions({
  sessionId,
  density
}: {
  readonly sessionId: string
  readonly density: Density
}): React.JSX.Element | null {
  const store = useRunningSessionStoreApi()
  const { session, view } = useRowFacts(sessionId)
  if (session === undefined) return null
  const actions = availableActions(view, session)
  if (!actions.end && !actions.interrupt && !actions.kill && !actions.close) return null
  const compact = density === 'compact'
  const size = compact ? 'icon-xs' : 'sm'
  return (
    <>
      {actions.end && (
        <Button
          type="button"
          size={size}
          variant="outline"
          disabled={actions.endPending}
          title={SESSION_ACTION_LABELS.endTitle}
          aria-label={
            compact
              ? actions.endPending
                ? SESSION_ACTION_LABELS.ending
                : SESSION_ACTION_LABELS.end
              : undefined
          }
          onClick={() => store.end(sessionId)}
        >
          {compact ? (
            <CircleStopIcon aria-hidden />
          ) : actions.endPending ? (
            SESSION_ACTION_LABELS.ending
          ) : (
            SESSION_ACTION_LABELS.end
          )}
        </Button>
      )}
      {actions.interrupt && (
        <Button
          type="button"
          size={size}
          variant="outline"
          title={compact ? SESSION_ACTION_LABELS.interrupt : undefined}
          aria-label={compact ? SESSION_ACTION_LABELS.interrupt : undefined}
          onClick={() => store.interrupt(sessionId)}
        >
          {compact ? <PauseIcon aria-hidden /> : SESSION_ACTION_LABELS.interrupt}
        </Button>
      )}
      {actions.kill && (
        <Button
          type="button"
          size={size}
          variant="destructive"
          title={SESSION_ACTION_LABELS.killTitle}
          aria-label={compact ? SESSION_ACTION_LABELS.kill : undefined}
          onClick={() => store.kill(sessionId)}
        >
          {compact ? <OctagonXIcon aria-hidden /> : SESSION_ACTION_LABELS.kill}
        </Button>
      )}
      {actions.close && (
        <Button
          type="button"
          size={size}
          variant="ghost"
          title={compact ? SESSION_ACTION_LABELS.close : undefined}
          aria-label={compact ? SESSION_ACTION_LABELS.close : undefined}
          onClick={(event) => {
            // 行ごと消えるので、消す前に隣の行か区画の見出しへフォーカスを移す (O-4 FR-019 / 014 data-model §8)。
            handOffFocusFromClosingRow(event.currentTarget)
            store.close(sessionId)
          }}
        >
          {compact ? <XIcon aria-hidden /> : SESSION_ACTION_LABELS.close}
        </Button>
      )}
    </>
  )
}
