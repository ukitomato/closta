import { useMemo, useRef } from 'react'

import { EmptyState, EmptyStateGreeting } from '@/components/assistant-ui/elements/empty-state'
import { Button } from '@/components/ui/button'
import { ChatScreenBody } from '@/features/chat/ChatScreen'
import { ConversationSearchProvider } from '@/features/chat/ConversationSearchProvider'
import { ConversationTimeProvider } from '@/features/chat/ConversationTimeProvider'
import { useTranscript } from '@/features/chat/useTranscript'
import { groupLabelOf } from '@/features/session-list/group-label'
import {
  buildSessionRows,
  findRow,
  formatSessionTime,
  rowTitleText
} from '@/features/session-list/rows'
import { useFolderLabels } from '@/features/session-list/useFolderLabels'
import { formatStartedAt, SESSION_ROW_STATUS_LABELS } from '@/features/session/labels'
import { isRunBusy } from '@/features/session/composer-queue'
import { LivePane } from '@/features/session/LivePane'
import { useRunningSessionsView } from '@/features/session/running-sessions-view'
import { rowStatus } from '@/features/session/session-view'
import { useSessionsStore } from '@/stores/sessions'
import { useUiStore } from '@/stores/ui'

import { CenterHeader } from './CenterHeader'
import { centerShownOf } from './center-shown'
import { SHELL_LABELS } from './labels'
import { CENTER_ID } from './shell-layout'
import { useFocusRescue } from './useFocusRescue'

/**
 * **中央** (O-7 / FR-003 / FR-005)。`main` のランドマーク。`focus` に応じて次のどれか 1 つを出す:
 *
 * - `running` → 中央のヘッダ + 実行中の Chat (`LivePane`)
 * - `past` → 中央のヘッダ (一覧の行と同じ題とグループの表示) + 過去ログの transcript (`ChatScreen`)
 * - `none` → 空の状態 (新規起動と、フォルダが未登録なら「作業フォルダを登録する」を主な操作に)
 *
 * 稼働中の会話の状態 (接続・transcript・下書き・キュー) はストアと `RunningSessionsProvider` が持つので、面を切り替えても
 * 保たれる (X-5 FR-008 / FR-004)。スクロールの位置は保たない (戻ると下端に追従する)。
 */
export function CenterPane(): React.JSX.Element {
  const focus = useUiStore((s) => s.focus)
  const view = useRunningSessionsView()
  const shown = centerShownOf(focus, view.live !== null)
  // 押した「閉じる」や表示中の過去の行が中身ごと消えたら、空の状態の主な操作へフォーカスを移す (pr-gate R2 a11y M-102)。
  const mainRef = useRef<HTMLElement>(null)
  useFocusRescue(
    mainRef,
    shown,
    () => mainRef.current?.querySelector<HTMLElement>('[data-center-primary]') ?? null
  )
  return (
    <main
      ref={mainRef}
      // スキップリンクの行き先。`tabindex` は常には付けない — 付けると本文のクリックで `main` がフォーカスを取り、
      // キーボードでの transcript のスクロールが効かなくなる (移す間だけ付ける。`AppShell` の focusCenter。pr-gate R2 a11y M-103)。
      id={CENTER_ID}
      aria-label={SHELL_LABELS.center}
      // 移った先の印 (`tabindex` を付けている間だけフォーカスを受けるので、スキップリンクの後にだけ出る。pr-gate R3 a11y L-201)。
      className="focus-visible:ring-ring flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-inset"
      data-testid="center"
      data-focus={focus}
    >
      {shown === 'running' ? (
        <RunningCenter />
      ) : shown === 'past' ? (
        <PastCenter />
      ) : (
        <CenterEmpty />
      )}
    </main>
  )
}

/**
 * 稼働中の会話。中央のヘッダ (作業フォルダの表示名・ランタイム・起動時刻・状態) と実行中の Chat。
 * どのセッションを表示しているかをヘッダでも示す (一覧の aria-current だけに頼らない。X-5 pr-gate R1 po L-001)。
 * 状態は一覧の行と同じラベル。選択が無いときは何も描かない。
 */
export function RunningCenter(): React.JSX.Element | null {
  const view = useRunningSessionsView()
  const live = view.live
  if (live === null) return null
  const detail = [
    view.runtimeName(live.state.config.runtimeId),
    formatStartedAt(live.state.startedAt)
  ]
    .filter((part) => part !== '')
    .join(' · ')
  return (
    /*
     * 会話内検索 (O-3 / 012 data-model §2「本文の供給元」)。本文は表示中のセッションのストアの全件 (窓で切る前) で、
     * 窓の外の一致へは `revealMessage` で窓を広げて移る。セッションを切り替えると `key` で作り直して閉じる。
     */
    <ConversationSearchProvider
      key={live.sessionId}
      messages={live.state.messages}
      reveal={view.revealMessage}
    >
      <ConversationTimeProvider
        conversationKey={live.sessionId}
        messages={live.state.messages}
        lastTurnOpen={isRunBusy(live.state.runState, live.terminal)}
      >
        <div className="flex h-full min-h-0 flex-col">
          <CenterHeader
            title={view.folderName(live.state.config.folderId)}
            detail={detail}
            status={SESSION_ROW_STATUS_LABELS[rowStatus(live)]}
            titleTestId="session-title"
            live={{
              sessionId: live.sessionId,
              runtimeId: live.state.config.runtimeId,
              modelId: live.state.config.modelId,
              terminal: live.terminal
            }}
          />
          <div className="min-h-0 flex-1">
            <LivePane />
          </div>
        </div>
      </ConversationTimeProvider>
    </ConversationSearchProvider>
  )
}

function CenterEmpty(): React.JSX.Element {
  const view = useRunningSessionsView()
  const setLaunchOpen = useUiStore((s) => s.setLaunchOpen)
  const openSettings = useUiStore((s) => s.openSettings)
  // 一覧を読み込み中は「登録されていない」と断定しない (X-4 po M-102 の規則)。
  const noFolders = view.folders !== null && view.folders.folders.length === 0
  // フォルダが 0 件のときは起動できないので、登録を主な操作にし、見出しも状態に合わせる (pr-gate R1 ux M-001)。
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center p-6" data-testid="center-empty">
      <EmptyState>
        <EmptyStateGreeting className="text-lg">
          {noFolders ? SHELL_LABELS.centerEmptyNoFolders : SHELL_LABELS.centerEmpty}
        </EmptyStateGreeting>
        <div className="flex flex-wrap justify-center gap-2">
          {noFolders && (
            <Button type="button" onClick={() => openSettings('folders')} data-center-primary>
              {SHELL_LABELS.centerEmptyFolders}
            </Button>
          )}
          <Button
            type="button"
            variant={noFolders ? 'outline' : 'default'}
            onClick={() => setLaunchOpen(true)}
            data-center-primary={noFolders ? undefined : true}
          >
            {SHELL_LABELS.centerEmptyLaunch}
          </Button>
        </div>
      </EmptyState>
    </div>
  )
}

/** 過去の会話。中央のヘッダ (題・グループ・読み取り専用・密度) と transcript。 */
function PastCenter(): React.JSX.Element {
  const index = useSessionsStore((s) => s.index)
  const selectedRowKey = useSessionsStore((s) => s.selectedRowKey)
  const folderLabels = useFolderLabels()
  /*
   * 過去ログの取得はここで 1 回だけ行い、会話内検索の供給元と transcript の本体の両方に渡す (O-3 / 012 data-model §2)。
   * 検索の provider の `key` の外で呼ぶので、選択を切り替えて provider を作り直しても取得は増えない。
   */
  const transcript = useTranscript()
  const found = useMemo(
    () => findRow(buildSessionRows(index), selectedRowKey),
    [index, selectedRowKey]
  )

  const title = found === null ? '' : rowTitleText(found.row.title, formatSessionTime)
  const group =
    found === null
      ? null
      : groupLabelOf(
          found.section.group,
          found.section.group.kind === 'folder'
            ? folderLabels.nameOf(found.section.group.folderId)
            : null,
          found.row.session
        )

  return (
    // 選んだ行を切り替えると `key` で作り直して検索を閉じる (spec FR-003)。
    <ConversationSearchProvider key={selectedRowKey ?? ''} messages={transcript.messages}>
      <ConversationTimeProvider
        conversationKey={selectedRowKey ?? ''}
        messages={transcript.messages}
        lastTurnOpen={false}
        publish={transcript.status === 'ready' || transcript.status === 'empty'}
      >
        <div className="flex h-full min-h-0 flex-col">
          <CenterHeader
            title={title}
            detail={group}
            status={SHELL_LABELS.pastReadOnly}
            titleTestId="past-title"
          />
          <div className="min-h-0 flex-1">
            <ChatScreenBody transcript={transcript} densityToggle={false} />
          </div>
        </div>
      </ConversationTimeProvider>
    </ConversationSearchProvider>
  )
}
