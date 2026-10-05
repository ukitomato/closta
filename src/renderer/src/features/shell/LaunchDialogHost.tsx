import { XIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { LaunchDialogContent } from '@/features/session/LivePane'
import {
  useRunningSessionStore,
  useRunningSessionStoreApi
} from '@/features/session/running-session-context'
import { useUiStore, type UiState } from '@/stores/ui'

import { SHELL_LABELS } from './labels'
import { useDialogReturnFocus } from './useDialogReturnFocus'

const isLaunchOpen = (s: UiState): boolean => s.launchOpen

/**
 * **起動ダイアログ** (O-7 / FR-007。中身は X-4 の `LaunchDialog`)。サイドバーの「新規起動」・中央の空の状態のボタン・
 * 失敗したセッションの「閉じて起動し直す」から開く。
 *
 * - 起動が受け付けられたら閉じ、そのセッションを中央に出す (`useShellFocus`)。閉じたら元の面に戻る
 * - **起動中は閉じられない** (Esc・閉じるボタンを効かせない)。拒否・失敗は閉じずに理由を出す
 * - **外側の押下では閉じない** — 選びかけの起動の設定を誤って捨てない。設定のダイアログと同じ (pr-gate R2 ux M-104)
 * - **起動せずに閉じたら、拒否と前回の失敗の告知を消す** (開き直したときに古い告知を出さない。`lastConfig` は残す。
 *   pr-gate R1 po M-001 / ux M-004)
 * - 閉じたら開いた元へフォーカスを戻す。元が消えていたらサイドバーの「新規起動」へ (pr-gate R1 a11y H-001)
 */
export function LaunchDialogHost(): React.JSX.Element {
  const open = useUiStore((s) => s.launchOpen)
  const setOpen = useUiStore((s) => s.setLaunchOpen)
  const store = useRunningSessionStoreApi()
  const launching = useRunningSessionStore((s) => s.launch.phase === 'launching')
  const returnFocus = useDialogReturnFocus(isLaunchOpen, 'new-session')

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && launching) return
        if (!next) store.dismissLaunchNotice()
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
        onInteractOutside={(event) => event.preventDefault()}
        onCloseAutoFocus={returnFocus}
        data-testid="launch-dialog-host"
      >
        {/*
         * 名前は中身の見える見出し (「セッションを起動」) と同じ文言。題は見出しにしない (span) — 見える h2 と同じ名前の見出しが
         * 2 つ並ばないように (pr-gate R1 a11y L-002 / ux L-001)。
         */}
        <DialogTitle asChild>
          <span className="sr-only">{SHELL_LABELS.launchDialogTitle}</span>
        </DialogTitle>
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
