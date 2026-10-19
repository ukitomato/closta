import { useMemo } from 'react'

import type { ThreadMessageLike } from '@assistant-ui/react'

import type { BackgroundTaskEntry } from '@domain/session/meter'
import { systemEventPartOf } from '@domain/session/system-event'

import { fromSystemEventData } from '@/features/chat/convert'
import { taskTypeLabel } from '@/features/chat/labels'
import { useRunningSessionsView } from '@/features/session/running-sessions-view'
import { useSessionMeters } from '@/features/session/useSessionMeters'
import { useUiStore } from '@/stores/ui'

import { BACKGROUND_TASKS_LABELS, formatCount } from './labels'

/**
 * 右のペインの「背景の task」のタブ (O-11 / 019 spec FR-006 / US-2 AC3〜AC5。data-model §2.5)。今動いている背景の task の
 * 一覧 (`background-tasks` の `meter`) を出す。**操作 (止める・前面に戻す) を付けない。**
 *
 * | 規則 | 根拠 |
 * |---|---|
 * | 値は表示中の稼働中のセッションの `meters.backgroundTasks` だけを selector で読む。新しい IPC を足さない | data-model §2.5 |
 * | 行は届いた順。名前は同じセッションの transcript の `task:<taskId>` の行の `name`、無い・空なら種類のラベルだけ | data-model §2.5 |
 * | 動いていない (終了・失敗・過去)・未選択は一覧を出さず「セッションは動いていません」 | spec US-2 AC4 |
 * | 名前は decoder の検査と無害化を通った値を**テキストとして**描く。`description` は運ばれない | AD-056 Decision 2 |
 */
export function BackgroundTasksTab(): React.JSX.Element {
  const focus = useUiStore((s) => s.focus)
  if (focus !== 'running') return <NotRunning />
  return <RunningBackgroundTasks />
}

function NotRunning(): React.JSX.Element {
  return (
    <div className="space-y-2 p-3 text-xs" data-testid="background-tasks">
      <h3 className="font-medium">{BACKGROUND_TASKS_LABELS.heading(null)}</h3>
      <p className="text-muted-foreground" data-testid="background-tasks-not-running">
        {BACKGROUND_TASKS_LABELS.notRunning}
      </p>
    </div>
  )
}

/** transcript の `task:<taskId>` の行の `name` (空は除く)。 */
function taskNamesOf(messages: readonly ThreadMessageLike[]): ReadonlyMap<string, string> {
  const names = new Map<string, string>()
  for (const message of messages) {
    if (message.id === undefined || !message.id.startsWith('task:')) continue
    const dto = fromSystemEventData(message)
    const part = systemEventPartOf(dto)
    if (part === null || part.name === '') continue
    names.set(message.id.slice('task:'.length), part.name)
  }
  return names
}

function RunningBackgroundTasks(): React.JSX.Element {
  const live = useRunningSessionsView().live
  const sessionId = live?.sessionId ?? null
  const tasks = useSessionMeters(sessionId, (m) => m.backgroundTasks)
  const messages = live?.state.messages
  const names = useMemo(
    () => (messages === undefined ? new Map() : taskNamesOf(messages)),
    [messages]
  )
  if (live === null || live.terminal) return <NotRunning />
  return (
    <div className="space-y-2 p-3 text-xs" data-testid="background-tasks">
      <h3 className="font-medium" data-testid="background-tasks-heading">
        {BACKGROUND_TASKS_LABELS.heading(tasks === null ? null : formatCount(tasks.length))}
      </h3>
      {tasks === null ? (
        <p className="text-muted-foreground" data-testid="background-tasks-awaiting">
          {BACKGROUND_TASKS_LABELS.awaiting}
        </p>
      ) : tasks.length === 0 ? (
        <p className="text-muted-foreground" data-testid="background-tasks-empty">
          {BACKGROUND_TASKS_LABELS.empty}
        </p>
      ) : (
        <ul className="space-y-1">
          {tasks.map((task, index) => (
            <TaskItem key={`${index}:${task.taskId}`} task={task} name={names.get(task.taskId)} />
          ))}
        </ul>
      )}
    </div>
  )
}

function TaskItem({
  task,
  name
}: {
  readonly task: BackgroundTaskEntry
  readonly name: string | undefined
}): React.JSX.Element {
  const kind = taskTypeLabel(task.taskType)
  return (
    <li className="flex min-w-0 gap-2" data-testid="background-task">
      <span className="shrink-0">{kind}</span>
      {name !== undefined && name !== '' && (
        <span className="text-muted-foreground min-w-0 truncate" title={name}>
          {`「${name}」`}
        </span>
      )}
    </li>
  )
}
