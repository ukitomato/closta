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
  ThreadListRoot
} from '@/components/assistant-ui/elements/thread-list.aui'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useUiStore, watchedIdOf } from '@/stores/ui'

import {
  activityPrefixLabel,
  awaitingCountLabel,
  elapsedLabel,
  failedCountLabel,
  formatStartedAt,
  launchFailureLabel,
  launchFailureShortLabel,
  launchRejectLabel,
  MONITOR_LABELS,
  SESSION_ACTION_LABELS,
  SESSION_END_NOTICES,
  SESSION_LIST_LABELS,
  SESSION_ROW_STATUS_LABELS,
  slotUsageLabel,
  slotUsageTitle,
  type SessionRowStatus
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
import { SessionNavBadge } from './SessionNavBadge'
import { useSessionClock, useSessionClockTicking } from './useSessionClock'

/**
 * **稼働中セッションの一覧 = 監視ビュー** (X-5 FE-011 / O-1 FR-001〜FR-009)。session の操作 UI であり、行の形と強調の
 * 出し方はここで決める (O-1 USER 決定 2026-10-02 design-gate R2)。コード識別子は `RunningSessionList` のまま (glossary)。
 *
 * | 規則 | 根拠 |
 * |---|---|
 * | **assistant-ui の ThreadList で組む** (`thread-list.aui.tsx`)。選択は `RunningSessionsProvider` の `ExternalStoreThreadListAdapter` を通る。新規起動はシェルのサイドバーの上のボタンに一本化する (区画の中に置かない) | Principle XIII / O-7 FR-002 |
 * | **サイドバーの稼働中の区画** (O-7)。要素は `section` (トップレベルの `nav` はサイドバーの 1 つだけ)。見出しに注意の件数の印 (`SessionNavBadge`) | O-7 data-model §3 |
 * | 承認待ちの件数のボタンの移動先は「見ているセッション」(`watchedIdOf`) を除く | O-7 FR-006 |
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
  /** 選択中の行を強調するか (O-7。中央に稼働中の会話を出しているときだけ強調する)。省略時は強調する。 */
  readonly highlightSelected?: boolean
}

export function RunningSessionList({
  runtimeName,
  highlightSelected = true
}: RunningSessionListProps): React.JSX.Element {
  const store = useRunningSessionStoreApi()
  // 選択中の行の押し直しも選択の操作として通知する (シェルが中央を稼働中の会話に戻す。O-7 data-model §1)。
  const selectRow = useCallback((id: string) => store.select(id), [store])
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
      <section
        aria-label={SESSION_LIST_LABELS.list}
        className="flex h-full min-h-0 flex-col"
        data-testid="session-list"
      >
        <div className="border-border flex shrink-0 flex-col gap-1.5 border-b px-3 py-2">
          <div className="flex items-center gap-2">
            <h2 className="flex-1 text-sm font-semibold">
              {SESSION_LIST_LABELS.heading}
              <SessionNavBadge />
            </h2>
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
              highlightSelected={highlightSelected}
              onSelectRow={selectRow}
              renderTooltip={renderTooltip}
              renderMeta={(id) => (
                <SessionRowMeta sessionId={id} runtimeName={runtimeName} density={density} />
              )}
              renderActions={(id) => <SessionRowActions sessionId={id} density={density} />}
            />
          </ThreadListRoot>
        )}
      </section>
    </TooltipProvider>
  )
}

/* ── 見出し (FR-002 / FR-003 / FR-007 / FR-008) ─────────────────────── */

function MonitorSummary(): React.JSX.Element {
  const store = useRunningSessionStoreApi()
  const usage = useRunningSessionStore(useShallow((s) => slotUsage(s)))
  const counts = useRunningSessionStore(useShallow((s) => attentionCounts(s)))
  // 「表示中を除く」の表示中は見ているセッション (中央に稼働中の会話を出していて、設定も起動ダイアログも開いていないときの
  // 選択中。O-7 FR-006)。
  const focus = useUiStore((s) => s.focus)
  const settingsOpen = useUiStore((s) => s.settings.open)
  const launchOpen = useUiStore((s) => s.launchOpen)
  const watchedId = useRunningSessionStore((s) =>
    watchedIdOf({ focus, settings: { open: settingsOpen }, launchOpen }, s.selectedId)
  )
  const hasTarget = useRunningSessionStore((s) => nextAwaiting(s, watchedId) !== null)
  const density = useRunningSessionStore((s) => s.density)
  // 押せない理由: 承認待ちが表示中のセッションだけか、1 件も無いか (spec Edge Cases。pr-gate R1 po L-003)。
  const noTarget =
    counts.awaiting > 0 ? MONITOR_LABELS.awaitingOnlyWatched : MONITOR_LABELS.awaitingNoTarget

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
        title={hasTarget ? MONITOR_LABELS.awaitingNext : noTarget}
        aria-describedby={hasTarget ? undefined : 'monitor-awaiting-no-target'}
        onClick={() => store.selectNextAwaiting(watchedId)}
        data-testid="awaiting-count"
      >
        <ShieldAlertIcon aria-hidden />
        {awaitingCountLabel(counts.awaiting)}
      </Button>
      {!hasTarget && (
        <span id="monitor-awaiting-no-target" className="sr-only">
          {noTarget}
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
            // 選択を背景差だけに頼らず太字でも示す (SessionListScreen の FilterChip と同じ。O-2 pr-gate R2 a11y H-002)
            className="aria-pressed:font-semibold"
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
function RowTooltip({
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
