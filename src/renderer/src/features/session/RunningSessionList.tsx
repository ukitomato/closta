import { useCallback } from 'react'
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

import {
  ThreadListItemsByKey,
  ThreadListNew,
  ThreadListRoot
} from '@/components/assistant-ui/elements/thread-list.aui'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { TooltipProvider } from '@/components/ui/tooltip'

import {
  activityPrefixLabel,
  awaitingCountLabel,
  elapsedLabel,
  failedCountLabel,
  formatStartedAt,
  launchFailureLabel,
  launchRejectLabel,
  MONITOR_LABELS,
  SESSION_ACTION_LABELS,
  SESSION_END_NOTICES,
  SESSION_LIST_LABELS,
  SESSION_ROW_STATUS_LABELS,
  slotUsageLabel,
  type SessionRowStatus,
  slotUsageTitle
} from './labels'
import { useRunningSessionStore, useRunningSessionStoreApi } from './running-session-context'
import type { Density } from './running-session-types'
import {
  attentionCounts,
  availableActions,
  deriveSessionView,
  formatElapsed,
  nextAwaiting,
  rowStatus,
  slotUsage
} from './session-view'
import { useSessionClock, useSessionClockTicking } from './useSessionClock'

/**
 * **稼働中セッションの一覧 = 監視ビュー** (X-5 FE-011 / O-1 FR-001〜FR-009)。session の操作 UI であり、行の形と強調の
 * 出し方はここで決める (O-1 USER 決定 2026-10-02 design-gate R2)。コード識別子は `RunningSessionList` のまま (glossary)。
 *
 * | 規則 | 根拠 |
 * |---|---|
 * | **assistant-ui の ThreadList で組む** (`thread-list.aui.tsx`)。選択と新規起動は `SessionScreen` の `ExternalStoreThreadListAdapter` を通る | Principle XIII |
 * | 行はフォルダ表示名 (表題)・ランタイム・起動時刻・状態・経過時間・直近の活動を示し、表示中の行が分かる (`aria-current`) | X-5 FR-009 / O-1 FR-005 / FR-006 |
 * | 承認待ち・失敗は**表示中かどうかにかかわらず**強調する (アイコン + 文言。色だけに頼らない)。行の並びは変えない | O-1 FR-001 / FR-003 |
 * | 見出しに枠の使用数・承認待ちの件数 (押すと表示中を除く最古へ移る)・失敗の件数・密度の切り替えを置く | O-1 FR-002 / FR-003 / FR-007 / FR-008 |
 * | **行の本体は本文の配列も時計も購読しない** — 経過時間 (`ElapsedTime`) と直近の活動 (`RowActivity`) は子が自分の値だけを選ぶ。直近の活動はストアが購読の手前で間引く | O-1 SC-006 / research R-03 |
 * | 会話由来の文字列 (直近の活動) は React のテキストノードでだけ描き、前置きと状態の文言とは別の要素に置く | O-1 FR-006 |
 * | 行の状態 (`data-row-status`) と受信の累計 (`data-received-messages`) を属性で出す。実機計測はこれだけを読む | O-1 FR-012 |
 * | 操作は状態に応じてだけ出す (`availableActions`)。「閉じる」は adapter の `onDelete` に割り当てない (正本の削除ではない。Principle X) | X-5 FR-011 |
 *
 * **本コンポーネントは `AssistantRuntimeProvider` の内側で使う** (ThreadList の primitive が runtime を要る)。
 */

export interface RunningSessionListProps {
  /** runtimeId → 表示名。 */
  readonly runtimeName: (runtimeId: string) => string
}

export function RunningSessionList({ runtimeName }: RunningSessionListProps): React.JSX.Element {
  const order = useRunningSessionStore((s) => s.order)
  const density = useRunningSessionStore((s) => s.density)
  useSessionClockTicking()

  const renderTooltip = useCallback(
    (id: string) =>
      density === 'compact' ? <RowTooltip sessionId={id} runtimeName={runtimeName} /> : null,
    [density, runtimeName]
  )

  return (
    <TooltipProvider>
      <nav
        aria-label={SESSION_LIST_LABELS.list}
        className="flex h-full min-h-0 flex-col"
        data-testid="session-list"
      >
        <div className="border-border flex shrink-0 flex-col gap-1.5 border-b px-3 py-2">
          <div className="flex items-center gap-2">
            <h2 className="flex-1 text-sm font-semibold">{SESSION_LIST_LABELS.heading}</h2>
            <ThreadListNew className="border-border border">
              {SESSION_ACTION_LABELS.newSession}
            </ThreadListNew>
          </div>
          <MonitorSummary />
          <LimitNotice />
        </div>
        <ReceivedMessagesProbe />
        {order.length === 0 ? (
          <p className="text-muted-foreground p-3 text-sm" data-testid="session-list-empty">
            {SESSION_LIST_LABELS.empty}
          </p>
        ) : (
          <ThreadListRoot className="min-h-0 flex-1 overflow-auto p-1.5">
            <ThreadListItemsByKey
              rowKeys={order}
              density={density}
              renderTooltip={renderTooltip}
              renderMeta={(id) => (
                <SessionRowMeta sessionId={id} runtimeName={runtimeName} density={density} />
              )}
              renderActions={(id) => <SessionRowActions sessionId={id} density={density} />}
            />
          </ThreadListRoot>
        )}
      </nav>
    </TooltipProvider>
  )
}

/* ── 見出し (FR-002 / FR-003 / FR-007 / FR-008) ─────────────────────── */

function MonitorSummary(): React.JSX.Element {
  const store = useRunningSessionStoreApi()
  const usage = useRunningSessionStore(useShallow((s) => slotUsage(s)))
  const counts = useRunningSessionStore(useShallow((s) => attentionCounts(s)))
  const hasTarget = useRunningSessionStore((s) => nextAwaiting(s) !== null)
  const density = useRunningSessionStore((s) => s.density)

  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs">
      <Badge
        variant="outline"
        title={slotUsageTitle(usage.used, usage.limit)}
        data-testid="slot-usage"
      >
        {slotUsageLabel(usage.used, usage.limit)}
      </Badge>
      <Button
        type="button"
        size="xs"
        variant={counts.awaiting > 0 ? 'default' : 'outline'}
        disabled={!hasTarget}
        title={hasTarget ? MONITOR_LABELS.awaitingNext : MONITOR_LABELS.awaitingNoTarget}
        aria-describedby={hasTarget ? undefined : 'monitor-awaiting-no-target'}
        onClick={() => store.selectNextAwaiting()}
        data-testid="awaiting-count"
      >
        <ShieldAlertIcon aria-hidden />
        {awaitingCountLabel(counts.awaiting)}
      </Button>
      {!hasTarget && (
        <span id="monitor-awaiting-no-target" className="sr-only">
          {MONITOR_LABELS.awaitingNoTarget}
        </span>
      )}
      <Badge variant={counts.failed > 0 ? 'destructive' : 'outline'} data-testid="failed-count">
        <CircleAlertIcon aria-hidden />
        {failedCountLabel(counts.failed)}
      </Badge>
      <div role="group" aria-label={MONITOR_LABELS.density} className="ms-auto flex gap-0.5">
        {(['comfortable', 'compact'] as const satisfies readonly Density[]).map((d) => (
          <Button
            key={d}
            type="button"
            size="xs"
            variant={density === d ? 'secondary' : 'ghost'}
            aria-pressed={density === d}
            onClick={() => store.setDensity(d)}
          >
            {d === 'comfortable'
              ? MONITOR_LABELS.densityComfortable
              : MONITOR_LABELS.densityCompact}
          </Button>
        ))}
      </div>
    </div>
  )
}

/** 枠が上限に達しているときの案内 (FR-007)。空け方は X-5 の `session-limit` の拒否文言を正本として再利用する。 */
function LimitNotice(): React.JSX.Element | null {
  const full = useRunningSessionStore((s) => {
    const usage = slotUsage(s)
    return usage.used >= usage.limit
  })
  if (!full) return null
  return (
    <p className="text-muted-foreground text-xs" data-testid="limit-notice">
      {MONITOR_LABELS.limitReached} {launchRejectLabel('session-limit')}
    </p>
  )
}

/** 実機計測の観測点 (FR-012)。受信の累計を購読するのはこの要素だけ (一覧と行を本文の到着で再描画させない)。 */
function ReceivedMessagesProbe(): React.JSX.Element {
  const count = useRunningSessionStore((s) => s.receivedMessages)
  return (
    <span
      hidden
      data-testid="received-messages"
      data-received-messages={count}
      title={MONITOR_LABELS.receivedMessages}
    />
  )
}

/* ── 行 ─────────────────────────────────────────────────────────── */

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

/** 行の状態の文言と、承認待ち・失敗の強調 (アイコン + 文言。FR-001 / FR-003)。 */
function RowStatusBadge({
  status,
  failureReason
}: {
  readonly status: SessionRowStatus
  readonly failureReason: LaunchFailureReason | null
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
    return (
      <span className="flex min-w-0 flex-col gap-0.5">
        <Badge
          variant="destructive"
          data-testid="session-row-status"
          data-row-status={status}
          data-attention="failure"
        >
          <CircleAlertIcon aria-hidden />
          {label}
        </Badge>
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
function SessionRowMeta({
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
  const context = [runtimeName(session.runtimeId), formatStartedAt(session.startedAt)]
    .filter((part) => part !== '')
    .join(' · ')

  if (density === 'compact') {
    return (
      <span className="flex items-center gap-1.5">
        <RowStatusBadge status={status} failureReason={null} />
        <ElapsedTime sessionId={sessionId} />
        {/* 行から外した情報はフォーカス時にも読まれる (FR-008)。見た目はツールチップ。 */}
        <span className="sr-only">
          {context}
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
      {(session.endForced || session.killed) && (
        <span data-testid="session-row-end-notice">
          {session.endForced ? SESSION_END_NOTICES.endForced : SESSION_END_NOTICES.killed}
        </span>
      )}
    </span>
  )
}

/** compact の行のツールチップ (行から外した情報。FR-008)。 */
function RowTooltip({
  sessionId,
  runtimeName
}: {
  readonly sessionId: string
  readonly runtimeName: (runtimeId: string) => string
}): React.JSX.Element | null {
  const { session, view } = useRowFacts(sessionId)
  if (session === undefined) return null
  return (
    <span className="flex max-w-64 flex-col gap-0.5">
      <span>
        {[runtimeName(session.runtimeId), formatStartedAt(session.startedAt)]
          .filter((part) => part !== '')
          .join(' · ')}
      </span>
      {view.failureReason !== null && <span>{launchFailureLabel(view.failureReason)}</span>}
      <RowActivity sessionId={sessionId} />
    </span>
  )
}

/** 行の操作 (X-5 FR-011)。行の Trigger の外に描かれる (ボタンを入れ子にしない)。compact はアイコンのボタン。 */
function SessionRowActions({
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
          onClick={() => store.close(sessionId)}
        >
          {compact ? <XIcon aria-hidden /> : SESSION_ACTION_LABELS.close}
        </Button>
      )}
    </>
  )
}
