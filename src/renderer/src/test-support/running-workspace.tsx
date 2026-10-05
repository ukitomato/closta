import { LiveCenter } from '@/features/session/LivePane'
import { RunningSessionList } from '@/features/session/RunningSessionList'
import { RunningSessionsProvider } from '@/features/session/RunningSessionsProvider'
import { useRunningSessionsView } from '@/features/session/running-sessions-view'

/**
 * 稼働中の区画と中央の実行中の Chat だけを並べるテスト用の面 (O-7 FE-002)。
 *
 * X-5 の `SessionScreen` (一覧 + 表示中のセッションの 2 ペイン) のテストの観点を、シェル (サイドバー・設定・右のペイン)
 * を通さずに保つために使う。runtime はシェルと同じ `RunningSessionsProvider` を通す。
 */
export function RunningWorkspace(): React.JSX.Element {
  return (
    <RunningSessionsProvider>
      <Panes />
    </RunningSessionsProvider>
  )
}

function Panes(): React.JSX.Element {
  const view = useRunningSessionsView()
  return (
    <div className="flex h-full min-h-0">
      <div className="w-64 shrink-0">
        <RunningSessionList runtimeName={view.runtimeName} />
      </div>
      <div className="min-w-0 flex-1">
        <LiveCenter />
      </div>
    </div>
  )
}
