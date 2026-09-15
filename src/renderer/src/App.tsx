import { TooltipProvider } from '@/components/ui/tooltip'
import { RuntimeListScreen } from '@/features/runtime-list/RuntimeListScreen'
import { WorkspaceFoldersScreen } from '@/features/workspace-folders/WorkspaceFoldersScreen'
import { ResolutionScreen } from '@/features/folder-runtime-resolution/ResolutionScreen'
import { ChatScreen } from '@/features/chat/ChatScreen'
import { SCREEN_LABELS, SCREENS, useUiStore, type ScreenId } from '@/stores/ui'
import { cn } from '@/lib/utils'

/**
 * FE-001 アプリシェル。
 *
 * 画面の切り替えとテーマだけを持ち、業務ロジック・IPC・永続化を持たない。
 * 各 feature の中身は FE-010 / FE-020 / FE-030 が実装する。
 *
 * UI 文言は日本語を第一言語とする (FR-047)。
 */

const SCREEN_COMPONENTS: Record<ScreenId, () => React.JSX.Element> = {
  runtimes: RuntimeListScreen,
  folders: WorkspaceFoldersScreen,
  resolution: ResolutionScreen,
  chat: ChatScreen
}

function App(): React.JSX.Element {
  const screen = useUiStore((s) => s.screen)
  const dark = useUiStore((s) => s.dark)
  const setScreen = useUiStore((s) => s.setScreen)
  const toggleTheme = useUiStore((s) => s.toggleTheme)

  const Screen = SCREEN_COMPONENTS[screen]
  const isChat = screen === 'chat'

  return (
    <TooltipProvider>
      <div className="bg-background text-foreground flex h-dvh flex-col">
        <header className="border-border flex shrink-0 items-center gap-4 border-b px-4 py-2.5">
          <span className="text-sm font-semibold tracking-tight">Closta</span>
          <nav className="flex gap-1">
            {SCREENS.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => setScreen(id)}
                aria-current={screen === id ? 'page' : undefined}
                className={cn(
                  'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                  screen === id
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {SCREEN_LABELS[id]}
              </button>
            ))}
          </nav>
          <button
            type="button"
            onClick={toggleTheme}
            className="text-muted-foreground hover:text-foreground ml-auto rounded-md px-2 py-1 text-xs"
          >
            {dark ? 'ライト' : 'ダーク'}
          </button>
        </header>

        <main className={cn('min-h-0 flex-1', isChat ? 'overflow-hidden' : 'overflow-auto')}>
          <div className={cn(isChat ? 'h-full' : 'mx-auto max-w-3xl p-6')}>
            <Screen />
          </div>
        </main>
      </div>
    </TooltipProvider>
  )
}

export default App
