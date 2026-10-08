import { useCallback } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { CircleAlertIcon, ShieldAlertIcon } from 'lucide-react'

import {
  ThreadListItemsByKey,
  ThreadListRoot
} from '@/components/assistant-ui/elements/thread-list.aui'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useUiStore, watchedIdOf } from '@/stores/ui'

import {
  awaitingCountLabel,
  failedCountLabel,
  launchRejectLabel,
  MONITOR_LABELS,
  SESSION_LIST_LABELS,
  slotUsageLabel,
  slotUsageTitle
} from './labels'
import { useRunningSessionStore, useRunningSessionStoreApi } from './running-session-context'
import type { Density } from './running-session-types'
import { RowTooltip, SessionRowActions, SessionRowMeta } from './RunningSessionRow'
import { attentionCounts, nextAwaiting, slotUsage } from './session-view'
import { SessionNavBadge } from './SessionNavBadge'
import { useSessionClockTicking } from './useSessionClock'

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
 * | 行の部品 (状態の印・経過時間・直近の活動・付帯情報・ツールチップ) と行の操作は `RunningSessionRow.tsx` に置く。ここは見出しと一覧の枠だけ | O-4 FR-018 (3) |
 * | 行の「閉じる」は行ごと消えるので、消す前に隣の行の Trigger か区画の見出し (`tabIndex={-1}`) へフォーカスを移す (`focus-handoff.ts`) | O-4 FR-019 |
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
            {/* 行を閉じて移す先の行が無いときのフォーカスの行き先 (O-4 FR-019。`focus-handoff.ts`)。 */}
            <h2 className="flex-1 text-sm font-semibold" tabIndex={-1} data-session-list-heading="">
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
  // 「表示中を除く」の表示中は見ているセッション (中央に稼働中の会話を出していて、設定も起動ダイアログも palette も
  // 開いていないときの選択中。O-7 FR-006 / O-3 FR-006)。
  const focus = useUiStore((s) => s.focus)
  const settingsOpen = useUiStore((s) => s.settings.open)
  const launchOpen = useUiStore((s) => s.launchOpen)
  const paletteOpen = useUiStore((s) => s.paletteOpen)
  const watchedId = useRunningSessionStore((s) =>
    watchedIdOf({ focus, settings: { open: settingsOpen }, launchOpen, paletteOpen }, s.selectedId)
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
