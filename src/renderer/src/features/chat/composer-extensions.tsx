import { useMemo, type ReactNode } from 'react'

import { ComposerPrimitive, unstable_useTriggerPopoverScopeContext } from '@assistant-ui/react'

import { useComposerExtensions } from './composer-extensions-context'
import { COMPOSER_LABELS } from './labels'
import {
  createSlashCommandAdapter,
  createSlashMatcher,
  searchSlashCommands,
  slashFormatter,
  type SlashCommandSource
} from './slash-commands'

/**
 * composer の根を包む。コマンドの一覧があるときだけ trigger popover の根を足し、無ければ子をそのまま返す
 * (候補の仕組みが何も載らない)。
 */
export function ComposerCommandRoot({ children }: { readonly children: ReactNode }): ReactNode {
  const { commands } = useComposerExtensions()
  if (commands === null || commands.length === 0) return children
  return (
    <ComposerPrimitive.Unstable_TriggerPopoverRoot>
      {children}
    </ComposerPrimitive.Unstable_TriggerPopoverRoot>
  )
}

/**
 * コマンドの候補の一覧 (composer の根の中に置く)。一覧が無いときは何も描かない。
 * 名前・説明・引数の形は**平文**で描く (markdown にしない)。
 */
export function ComposerCommandPopover(): ReactNode {
  const { commands } = useComposerExtensions()
  const adapter = useMemo(
    () => (commands === null ? null : createSlashCommandAdapter(commands)),
    [commands]
  )
  const matcher = useMemo(
    () => (commands === null ? null : createSlashMatcher(commands)),
    [commands]
  )
  if (commands === null || commands.length === 0 || adapter === null || matcher === null)
    return null
  return (
    <ComposerPrimitive.Unstable_TriggerPopover
      char="/"
      adapter={adapter}
      matcher={matcher}
      role="listbox"
      aria-label={COMPOSER_LABELS.commandCandidates}
      data-slot="composer-command-popover"
      className="border-border bg-popover text-popover-foreground absolute right-0 bottom-full left-0 z-20 mb-2 max-h-72 overflow-y-auto rounded-lg border p-1 shadow-md"
    >
      <ComposerPrimitive.Unstable_TriggerPopover.Directive formatter={slashFormatter} />
      <ComposerPrimitive.Unstable_TriggerPopoverItems>
        {(items) => (
          <>
            {items.map((item, index) => {
              const hint = item.metadata?.['argumentHint']
              return (
                <ComposerPrimitive.Unstable_TriggerPopoverItem
                  key={item.id}
                  item={item}
                  index={index}
                  role="option"
                  className="data-[highlighted]:bg-accent hover:bg-accent flex w-full flex-col items-start gap-0.5 rounded-md px-2 py-1.5 text-start text-sm"
                >
                  <span className="font-medium">
                    /{item.label}
                    {typeof hint === 'string' && hint !== '' ? (
                      <span className="text-muted-foreground ms-1 font-normal">{hint}</span>
                    ) : null}
                  </span>
                  {item.description !== undefined && item.description !== '' ? (
                    <span className="text-muted-foreground text-xs">{item.description}</span>
                  ) : null}
                </ComposerPrimitive.Unstable_TriggerPopoverItem>
              )
            })}
            <MoreCommands commands={commands} />
          </>
        )}
      </ComposerPrimitive.Unstable_TriggerPopoverItems>
    </ComposerPrimitive.Unstable_TriggerPopover>
  )
}

/** 20 件を超えた数 (「ほか N 件」)。問い合わせは popover の scope から読む。 */
function MoreCommands({
  commands
}: {
  readonly commands: readonly SlashCommandSource[]
}): ReactNode {
  const { query } = unstable_useTriggerPopoverScopeContext()
  const { more } = searchSlashCommands(commands, query)
  if (more === 0) return null
  return (
    <div className="text-muted-foreground px-2 py-1 text-xs" data-slot="composer-command-more">
      {COMPOSER_LABELS.moreCommands(more)}
    </div>
  )
}
