import { useMemo } from 'react'

import { EFFORT_LABELS } from '@/features/provider/labels'
import { useProviders } from '@/features/provider/useProviders'
import { groupLabelOf, locationIndexOf, locationLabelOf } from '@/features/session-list/group-label'
import { buildSessionRows, findRow, formatSessionTime } from '@/features/session-list/rows'
import { useFolderLabels } from '@/features/session-list/useFolderLabels'
import { PERMISSION_MODE_LABELS } from '@/features/session/labels'
import { useRunningSessionsView } from '@/features/session/running-sessions-view'
import { useSessionsStore } from '@/stores/sessions'
import { useUiStore } from '@/stores/ui'

import { OVERVIEW_LABELS, SHELL_LABELS } from './labels'

/**
 * 右のペインの「概要」のタブ (O-7 / FR-015 / data-model §5)。
 *
 * | 規則 | 根拠 |
 * |---|---|
 * | renderer が既に持つ値だけで描く。新しい IPC・preload の関数を足さない | FR-015 |
 * | 中央のヘッダと重なる項目 (フォルダの表示名・ランタイム・開始の時刻・題) は稼働中では出さない | data-model §5 |
 * | 値の無い項目は行ごと出さない。Provider の一覧の読み込み中は Provider の行を出さない (断定しない) | data-model §5 / X-4 po M-102 |
 * | 会話由来・パス由来の文字列は DTO の時点で正規化済みの値を**テキストとして**描く (HTML として解釈しない) | US-4 AC5 |
 */
export function OverviewTab(): React.JSX.Element {
  const focus = useUiStore((s) => s.focus)
  if (focus === 'running') return <RunningOverview />
  if (focus === 'past') return <PastOverview />
  return <Empty />
}

function Empty(): React.JSX.Element {
  return (
    <p className="text-muted-foreground p-3 text-sm" data-testid="overview-empty">
      {SHELL_LABELS.overviewEmpty}
    </p>
  )
}

interface Item {
  readonly label: string
  readonly value: string
}

function Items({ items }: { readonly items: readonly Item[] }): React.JSX.Element {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 p-3 text-xs" data-testid="overview">
      {items.map((item) => (
        <div key={item.label} className="contents">
          <dt className="text-muted-foreground">{item.label}</dt>
          <dd className="min-w-0 break-words">{item.value}</dd>
        </div>
      ))}
    </dl>
  )
}

function RunningOverview(): React.JSX.Element {
  const view = useRunningSessionsView()
  const providers = useProviders()
  const live = view.live
  if (live === null) return <Empty />
  const config = live.state.config

  const items: Item[] = []
  const provider =
    config.providerId === null
      ? null
      : (providers.providers?.find((p) => p.id === config.providerId) ?? null)
  if (config.providerId === null) {
    items.push({ label: OVERVIEW_LABELS.provider, value: OVERVIEW_LABELS.providerDefault })
  } else if (providers.providers !== null) {
    items.push({
      label: OVERVIEW_LABELS.provider,
      value: provider?.displayName ?? OVERVIEW_LABELS.providerRemoved
    })
  }
  // 起動時に選んだ値 (実行中の変化は O-4 / O-5 が対応表の行で扱う)。表示は起動ダイアログと同じ表示名と訳
  // (Provider のモデルカタログの displayName・EFFORT_LABELS。引けなければ ID。pr-gate R1 ux M-006 / ui-coverage M-004)。
  items.push({
    label: OVERVIEW_LABELS.model,
    value:
      config.modelId === null
        ? OVERVIEW_LABELS.modelDefault
        : (provider?.models.find((m) => m.id === config.modelId)?.displayName ?? config.modelId)
  })
  if (config.effort !== null)
    items.push({ label: OVERVIEW_LABELS.effort, value: EFFORT_LABELS[config.effort] })
  items.push({
    label: OVERVIEW_LABELS.permissionMode,
    value: PERMISSION_MODE_LABELS[config.permissionMode]
  })
  // 所在は登録フォルダの一覧から引く。読み込み中・引けないとき (登録の解除) は行ごと出さない (所在の欄にフォルダの
  // 状態の文を入れない。pr-gate R1 ux M-006)。
  const folder = view.folders?.folders.find((f) => f.id === config.folderId)
  if (folder !== undefined) {
    items.push({ label: OVERVIEW_LABELS.folderLocation, value: locationLabelOf(folder.location) })
  }
  return <Items items={items} />
}

function PastOverview(): React.JSX.Element {
  const index = useSessionsStore((s) => s.index)
  const selectedRowKey = useSessionsStore((s) => s.selectedRowKey)
  const folderLabels = useFolderLabels()
  const found = useMemo(
    () => findRow(buildSessionRows(index), selectedRowKey),
    [index, selectedRowKey]
  )
  const locationOf = useMemo(() => locationIndexOf(index?.outcomes ?? []), [index])
  if (found === null) return <Empty />
  const { session } = found.row
  const group = found.section.group
  const folderName = group.kind === 'folder' ? folderLabels.nameOf(group.folderId) : null

  const items: Item[] = []
  const push = (label: string, value: string | null): void => {
    if (value !== null && value !== '') items.push({ label, value })
  }
  push(OVERVIEW_LABELS.folder, groupLabelOf(group, folderName, session))
  push(OVERVIEW_LABELS.location, locationOf.get(session.targetKey) ?? null)
  push(OVERVIEW_LABELS.branch, session.gitBranch)
  push(
    OVERVIEW_LABELS.createdAt,
    session.createdAt === null ? null : formatSessionTime(session.createdAt)
  )
  push(
    OVERVIEW_LABELS.lastModified,
    session.lastModified === null ? null : formatSessionTime(session.lastModified)
  )
  push(
    OVERVIEW_LABELS.origin,
    session.worktree ? `${session.targetLabel} (${OVERVIEW_LABELS.worktree})` : session.targetLabel
  )
  return <Items items={items} />
}
