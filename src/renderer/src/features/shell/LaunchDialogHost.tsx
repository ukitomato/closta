import { XIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { LaunchDialogContent } from '@/features/session/LivePane'
import { useRunningSessionStore } from '@/features/session/running-session-context'
import { useUiStore } from '@/stores/ui'

import { SHELL_LABELS } from './labels'

/**
 * **起動ダイアログ** (O-7 / FR-007。中身は X-4 の `LaunchDialog`)。サイドバーの「新規起動」・中央の空の状態のボタン・
 * 失敗したセッションの「閉じて起動し直す」から開く。
 *
 * - 起動が受け付けられたら閉じ、そのセッションを中央に出す (`useShellFocus`)。閉じたら元の面に戻る
 * - **起動中は閉じられない** (Esc・外側の押下・閉じるボタンを効かせない)。拒否・失敗は閉じずに理由を出す
 */
export function LaunchDialogHost(): React.JSX.Element {
  const open = useUiStore((s) => s.launchOpen)
  const setOpen = useUiStore((s) => s.setLaunchOpen)
  const launching = useRunningSessionStore((s) => s.launch.phase === 'launching')

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && launching) return
        setOpen(next)
      }}
    >
      <DialogContent
        showCloseButton={false}
        aria-describedby={undefined}
        className="max-h-[calc(100dvh-2rem)] overflow-auto sm:max-w-2xl"
        onEscapeKeyDown={(event) => {
          if (launching) event.preventDefault()
        }}
        onInteractOutside={(event) => {
          if (launching) event.preventDefault()
        }}
        data-testid="launch-dialog-host"
      >
        <DialogTitle className="sr-only">{SHELL_LABELS.launchDialogTitle}</DialogTitle>
        {!launching && (
          <DialogClose asChild>
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              className="absolute top-3 right-3"
              aria-label={SHELL_LABELS.close}
              title={SHELL_LABELS.close}
            >
              <XIcon aria-hidden />
            </Button>
          </DialogClose>
        )}
        <LaunchDialogContent />
      </DialogContent>
    </Dialog>
  )
}
