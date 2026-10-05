import { useMemo } from 'react'

import { EmptyState, EmptyStateGreeting } from '@/components/assistant-ui/elements/empty-state'
import { Button } from '@/components/ui/button'
import { ChatScreen } from '@/features/chat/ChatScreen'
import { TranscriptDensityToggle } from '@/features/chat/TranscriptDensityToggle'
import { groupLabelOf } from '@/features/session-list/group-label'
import { buildSessionRows, findRow, rowTitleText } from '@/features/session-list/rows'
import { useFolderLabels } from '@/features/session-list/useFolderLabels'
import { LiveCenter } from '@/features/session/LivePane'
import { useRunningSessionsView } from '@/features/session/running-sessions-view'
import { useSessionsStore } from '@/stores/sessions'
import { useUiStore } from '@/stores/ui'

import { SHELL_LABELS } from './labels'

/**
 * **中央** (O-7 / FR-003 / FR-005)。`main` のランドマーク。`focus` に応じて次のどれか 1 つを出す:
 *
 * - `running` → 実行中の Chat (`LiveCenter`。中央のヘッダは `SessionHeader`)
 * - `past` → 過去ログの transcript (`ChatScreen`。中央のヘッダは一覧の行と同じ題とグループの表示)
 * - `none` → 空の状態 (新規起動と、フォルダが未登録なら「設定 → 作業フォルダ」)
 *
 * 稼働中の会話の状態 (接続・transcript・下書き・キュー) はストアと `RunningSessionsProvider` が持つので、面を切り替えても
 * 保たれる (X-5 FR-008 / FR-004)。スクロールの位置は保たない (戻ると下端に追従する)。
 */
export function CenterPane(): React.JSX.Element {
  const focus = useUiStore((s) => s.focus)
  const view = useRunningSessionsView()
  return (
    <main
      aria-label={SHELL_LABELS.center}
      className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
      data-testid="center"
      data-focus={focus}
    >
      {focus === 'running' && view.live !== null ? (
        <LiveCenter />
      ) : focus === 'past' ? (
        <PastCenter />
      ) : (
        <CenterEmpty />
      )}
    </main>
  )
}

function CenterEmpty(): React.JSX.Element {
  const view = useRunningSessionsView()
  const setLaunchOpen = useUiStore((s) => s.setLaunchOpen)
  const openSettings = useUiStore((s) => s.openSettings)
  // 一覧を読み込み中は「登録されていない」と断定しない (X-4 po M-102 の規則)。
  const noFolders = view.folders !== null && view.folders.folders.length === 0
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center p-6" data-testid="center-empty">
      <EmptyState>
        <EmptyStateGreeting className="text-lg">{SHELL_LABELS.centerEmpty}</EmptyStateGreeting>
        {noFolders && (
          <p className="text-muted-foreground text-sm">{SHELL_LABELS.centerEmptyNoFolders}</p>
        )}
        <div className="flex flex-wrap justify-center gap-2">
          <Button type="button" onClick={() => setLaunchOpen(true)}>
            {SHELL_LABELS.centerEmptyLaunch}
          </Button>
          {noFolders && (
            <Button type="button" variant="outline" onClick={() => openSettings('folders')}>
              {SHELL_LABELS.centerEmptyFolders}
            </Button>
          )}
        </div>
      </EmptyState>
    </div>
  )
}

const TIME_FORMAT = new Intl.DateTimeFormat('ja-JP', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit'
})

function formatTime(ms: number): string {
  return TIME_FORMAT.format(new Date(ms))
}

/** 過去の会話。中央のヘッダ (題・グループ・読み取り専用・密度) と transcript。 */
function PastCenter(): React.JSX.Element {
  const index = useSessionsStore((s) => s.index)
  const selectedRowKey = useSessionsStore((s) => s.selectedRowKey)
  const folderLabels = useFolderLabels()
  const found = useMemo(
    () => findRow(buildSessionRows(index), selectedRowKey),
    [index, selectedRowKey]
  )

  const title = found === null ? '' : rowTitleText(found.row.title, formatTime)
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
    <div className="flex h-full min-h-0 flex-col">
      <div
        className="border-border flex shrink-0 items-center gap-3 border-b px-4 py-2"
        data-testid="center-header"
      >
        {/* 題・グループは DTO の時点で正規化済みの表示用の値をテキストとして描く (US-4 AC5)。 */}
        <span className="min-w-0 truncate text-xs font-medium" data-testid="past-title">
          {title}
        </span>
        {group !== null && (
          <span className="text-muted-foreground min-w-0 truncate text-xs">{group}</span>
        )}
        <span className="text-muted-foreground ms-auto shrink-0 text-xs">
          {SHELL_LABELS.pastReadOnly}
        </span>
        <TranscriptDensityToggle />
      </div>
      <div className="min-h-0 flex-1">
        <ChatScreen densityToggle={false} />
      </div>
    </div>
  )
}
