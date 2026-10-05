import { useEffect, useRef } from 'react'

import { XIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { ResolutionScreen } from '@/features/folder-runtime-resolution/ResolutionScreen'
import { ProviderScreen } from '@/features/provider/ProviderScreen'
import { RuntimeListScreen } from '@/features/runtime-list/RuntimeListScreen'
import { WorkspaceFoldersScreen } from '@/features/workspace-folders/WorkspaceFoldersScreen'
import { cn } from '@/lib/utils'
import { SETTINGS_SECTIONS, useUiStore, type SettingsSection } from '@/stores/ui'

import { SETTINGS_SECTION_LABELS, SHELL_LABELS } from './labels'

const SETTINGS_SECTION_CONTENT: Record<SettingsSection, () => React.JSX.Element> = {
  runtimes: RuntimeListScreen,
  folders: WorkspaceFoldersScreen,
  providers: ProviderScreen,
  resolution: ResolutionScreen
}

/**
 * **設定のダイアログ** (O-7 / FR-008 / FR-009。AD-046)。全面のダイアログで、左に 4 項目とテーマの切り替え、
 * 右に選んだ項目の今の画面を中身を変えずに出す。
 *
 * | 規則 | 根拠 |
 * |---|---|
 * | Esc と閉じるボタンで閉じ、開いた元の要素 (「設定」のボタン・一覧の「登録」のボタンなど) にフォーカスを戻す | FR-008 / US-3 AC2 |
 * | 閉じたら中の画面を unmount する (Radix の Dialog は閉じると中身を外す)。覚えるのは項目の id だけ。Provider の画面の平文の秘密を残さない | FR-008 |
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

  // 開いた元の要素。開く操作 (クリック) の同期の中で store が変わるので、その時点のフォーカスを覚える。
  const openerRef = useRef<HTMLElement | null>(null)
  useEffect(
    () =>
      useUiStore.subscribe((next, prev) => {
        if (next.settings.open && !prev.settings.open) {
          openerRef.current =
            document.activeElement instanceof HTMLElement ? document.activeElement : null
        }
      }),
    []
  )

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
        onCloseAutoFocus={(event) => {
          const opener = openerRef.current
          if (opener !== null && opener.isConnected) {
            event.preventDefault()
            opener.focus()
          }
        }}
        data-testid="settings-dialog"
      >
        <div className="border-border flex min-h-0 flex-col gap-2 border-r p-3">
          <DialogTitle className="px-2 text-base">{SHELL_LABELS.settingsTitle}</DialogTitle>
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
          <div className="border-border mt-auto flex items-center gap-2 border-t px-2 pt-3 text-xs">
            <span className="text-muted-foreground">{SHELL_LABELS.theme}</span>
            <Button type="button" size="xs" variant="outline" onClick={toggleTheme}>
              {dark ? SHELL_LABELS.themeLight : SHELL_LABELS.themeDark}
            </Button>
          </div>
        </div>
        <div className="relative min-h-0 overflow-auto">
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
