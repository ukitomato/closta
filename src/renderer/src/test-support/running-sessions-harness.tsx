import { RunningSessionList } from '@/features/session/RunningSessionList'
import { RunningSessionsProvider } from '@/features/session/RunningSessionsProvider'
import { useRunningSessionsView } from '@/features/session/running-sessions-view'
import { RunningCenter } from '@/features/shell/CenterPane'

/**
 * 稼働中の区画と中央の実行中の会話 (中央のヘッダ + 実行中の Chat) だけを並べるテスト用の面 (O-7 FE-002)。
 *
 * X-5 の `SessionScreen` (一覧 + 表示中のセッションの 2 ペイン) のテストの観点を、シェルの残り (サイドバーの他の区画・
 * 設定・右のペイン) を通さずに保つために使う。runtime はシェルと同じ `RunningSessionsProvider` を通す。
 *
 * **中央はシェルの `RunningCenter` を通す** — 中央のヘッダ (`CenterHeader`) は O-7 からシェルの部品で、本番と同じ合成で
 * 確かめるため。テストだけが session → shell の向きの依存を持つ (本番の依存は shell → session)。
 */
export function RunningSessionsHarness(): React.JSX.Element {
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
        <RunningCenter />
      </div>
    </div>
  )
}
