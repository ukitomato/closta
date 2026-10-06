import { TooltipProvider } from '@/components/ui/tooltip'
import { AppShell } from '@/features/shell/AppShell'
import { SessionAttentionAnnouncer } from '@/features/session/SessionAttentionAnnouncer'
import { useRunningSessionStoreWiring } from '@/features/session/running-session-context'

/**
 * アプリのルート (O-7 / AD-046)。シェル (`AppShell`: サイドバー・中央・右のペインと、設定・起動のダイアログ) を描くだけにする。
 *
 * App の寿命で 1 回だけ持つもの:
 * - 稼働中セッションの port と状態通知の購読 (`useRunningSessionStoreWiring`。面の切り替えで外さない。X-5 / FR-008・O-7 FR-004)
 * - 支援技術への通知 (`SessionAttentionAnnouncer`。どの面を表示していても・設定のダイアログを開いていても働く。O-1 FR-004 / O-7 FR-006)
 *
 * UI 文言は日本語を第一言語とする (FR-047)。
 */
function App(): React.JSX.Element {
  useRunningSessionStoreWiring()
  return (
    <TooltipProvider>
      <div className="bg-background text-foreground flex h-dvh flex-col">
        <SessionAttentionAnnouncer />
        <div className="min-h-0 flex-1">
          <AppShell />
        </div>
      </div>
    </TooltipProvider>
  )
}

export default App
