/**
 * アプリのコマンド (O-13 / 025 data-model §7)。Claude Code に送らず、アプリが処理する composer のコマンド。
 * 本 feature では `/resume` だけ。I/O なしの純関数。
 */
import { APP_COMMAND_LABELS } from './labels'
import type { SlashCommandSource } from './slash-commands'

export type AppCommandName = 'resume'

export const APP_COMMANDS: readonly { readonly name: AppCommandName }[] = [{ name: 'resume' }]

const RESUME_PATTERN = /^\/resume(?:\s|$)/u

/** 送信された入力がアプリのコマンドか。前後の空白を除いて `/resume` か `/resume <引数>`。引数は捨てる。 */
export function parseAppCommand(text: string): AppCommandName | null {
  return RESUME_PATTERN.test(text.trim()) ? 'resume' : null
}

/** 候補の合成。アプリのコマンドを先に置き、同名の Claude Code のコマンドを落とす。 */
export function mergeCommandCandidates(
  reported: readonly SlashCommandSource[] | null
): readonly SlashCommandSource[] {
  const own: readonly SlashCommandSource[] = APP_COMMANDS.map((c) => ({
    name: c.name,
    description: APP_COMMAND_LABELS[c.name],
    argumentHint: null
  }))
  const names = new Set(own.map((c) => c.name))
  const rest = (reported ?? []).filter(
    (e) => !names.has(e.name.replace(/^\//u, '') as AppCommandName)
  )
  return [...own, ...rest]
}
