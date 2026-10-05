import { XIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { ResolutionScreen } from '@/features/folder-runtime-resolution/ResolutionScreen'
import { ProviderScreen } from '@/features/provider/ProviderScreen'
import { RuntimeListScreen } from '@/features/runtime-list/RuntimeListScreen'
import { SessionNavBadge } from '@/features/session/SessionNavBadge'
import { WorkspaceFoldersScreen } from '@/features/workspace-folders/WorkspaceFoldersScreen'
import { cn } from '@/lib/utils'
import { SETTINGS_SECTIONS, useUiStore, type SettingsSection, type UiState } from '@/stores/ui'

import { SETTINGS_SECTION_LABELS, SHELL_LABELS } from './labels'
import { useDialogReturnFocus } from './useDialogReturnFocus'

const SETTINGS_SECTION_CONTENT: Record<SettingsSection, () => React.JSX.Element> = {
  runtimes: RuntimeListScreen,
  folders: WorkspaceFoldersScreen,
  providers: ProviderScreen,
  resolution: ResolutionScreen
}

const isSettingsOpen = (s: UiState): boolean => s.settings.open

/**
 * **設定のダイアログ** (O-7 / FR-008 / FR-009。AD-046)。全面のダイアログで、左に 4 項目とテーマの切り替え、
 * 右に選んだ項目の今の画面を中身を変えずに出す。
 *
 * | 規則 | 根拠 |
 * |---|---|
 * | Esc と閉じるボタンで閉じ、開いた元の要素 (「設定」のボタン・一覧の「登録」のボタンなど) にフォーカスを戻す。元が消えていたらサイドバーの「設定」へ | FR-008 / US-3 AC2 / pr-gate R1 a11y M-003 |
 * | 外側 (四辺の余白) の押下では閉じない — 入力中の登録・Provider のフォームを誤って捨てない | pr-gate R1 ux M-007 |
 * | 閉じたら中の画面を unmount する (Radix の Dialog は閉じると中身を外す)。覚えるのは項目の id だけ。Provider の画面の平文の秘密を残さない | FR-008 |
 * | 左の列に承認待ち・失敗の件数の印を置く (サイドバーの印はダイアログの下に隠れる) | O-1 USER 決定 (設定を開いている間も見せる) / pr-gate R1 ux H-001 |
 * | 画面をまたぐ受け渡し (`seedFolderDraft`) は「作業フォルダ」の項目で開く形にする | FR-009 |
 * | registry の `Settings` は外部の取得・画面の構成が合わないので、既存の Dialog で組む (照合の結果の正本は PR の説明) | Principle XIII / research R-04 |
 */
export function SettingsDialog(): React.JSX.Element {
  const open = useUiStore((s) => s.settings.open)
  const section = useUiStore((s) => s.settings.section)
  const closeSettings = useUiStore((s) => s.closeSettings)
  const setSection = useUiStore((s) => s.setSettingsSection)
  const dark = useUiStore((s) => s.dark)
  const toggleTheme = useUiStore((s) => s.toggleTheme)
  const returnFocus = useDialogReturnFocus(isSettingsOpen, 'settings')

  const Screen = SETTINGS_SECTION_CONTENT[section]

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) closeSettings()
      }}
    >
      <DialogContent
        showCloseButton={false}
        aria-describedby={undefined}
        className="grid h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-none grid-cols-[200px_1fr] gap-0 p-0 sm:max-w-none"
        onInteractOutside={(event) => event.preventDefault()}
        onCloseAutoFocus={returnFocus}
        data-testid="settings-dialog"
      >
        <div className="border-border flex min-h-0 flex-col gap-2 border-r p-3">
          <div className="flex flex-wrap items-center gap-1 px-2">
            <DialogTitle className="text-base">{SHELL_LABELS.settingsTitle}</DialogTitle>
            <SessionNavBadge />
          </div>
          <nav aria-label={SHELL_LABELS.settingsNav} className="flex flex-col gap-0.5">
            {SETTINGS_SECTIONS.map((id) => (
              <button
                key={id}
                type="button"
                aria-current={section === id ? 'page' : undefined}
                onClick={() => setSection(id)}
                className={cn(
                  'rounded-md px-2 py-1.5 text-start text-sm transition-colors',
                  section === id
                    ? 'bg-accent text-accent-foreground font-semibold'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {SETTINGS_SECTION_LABELS[id]}
              </button>
            ))}
          </nav>
          {/* 今の値を aria-pressed の組で示す (切り替え先の名前 1 つでは今の値か読めない。pr-gate R1 a11y L-003 / ux L-003)。 */}
          <div
            role="group"
            aria-label={SHELL_LABELS.theme}
            className="border-border mt-auto flex items-center gap-1 border-t px-2 pt-3 text-xs"
          >
            <span className="text-muted-foreground me-1" aria-hidden>
              {SHELL_LABELS.theme}
            </span>
            {([false, true] as const).map((isDark) => (
              <Button
                key={isDark ? 'dark' : 'light'}
                type="button"
                size="xs"
                variant={dark === isDark ? 'secondary' : 'ghost'}
                aria-pressed={dark === isDark}
                className="aria-pressed:font-semibold"
                onClick={() => {
                  if (dark !== isDark) toggleTheme()
                }}
              >
                {isDark ? SHELL_LABELS.themeDark : SHELL_LABELS.themeLight}
              </Button>
            ))}
          </div>
        </div>
        {/* 項目を切り替えたらスクロールの位置を先頭に戻す (pr-gate R1 ux L-004)。 */}
        <div key={section} className="relative min-h-0 overflow-auto">
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
          <div
            className="mx-auto max-w-3xl p-6"
            data-testid="settings-section"
            data-section={section}
          >
            <Screen />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
