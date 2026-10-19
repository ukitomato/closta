import { pathTail } from './path-tail'

/**
 * Bash のコマンドの名前の切り出し (O-2 / FR-014。O-11 で renderer から domain へ移した)。
 *
 * **会話由来の本文の文字列の切り出しで、アプリのパスの値ではない。切った値を IPC・port の入力に戻さない (AD-049 Decision 5)。**
 */

/** コマンド名・subagent の種類として出してよい文字の形。 */
const SAFE_NAME = /^[A-Za-z0-9._+-]{1,64}$/
/** 既知の秘密の接頭辞 (これで始まる名前は出さない)。 */
const SECRET_PREFIX = /^(sk-|ghp_|gho_|glpat-|AIza|xox)/
/** コマンドの文字列にあれば何も出さない文字 (クォート・バックスラッシュ・`$`・backtick・`(`。design-gate R2 security L-102)。 */
const UNSAFE_COMMAND_CHARS = /["'\\$`(]/
/** 先頭の環境変数の代入 (`NAME=...`)。 */
const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/

export function safeName(value: string): string {
  return SAFE_NAME.test(value) && !SECRET_PREFIX.test(value) ? value : ''
}

export function bashCommandName(command: string): string {
  if (UNSAFE_COMMAND_CHARS.test(command)) return ''
  const words = command.trim().split(/\s+/)
  let index = 0
  while (index < words.length && ASSIGNMENT.test(words[index] ?? '')) index += 1
  const first = words[index]
  return first === undefined || first === '' ? '' : safeName(pathTail(first))
}
