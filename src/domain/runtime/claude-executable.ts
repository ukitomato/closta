import { hostPathOps } from './path-api'
import { makeHostPath } from './path-types'

/**
 * ホストの claude の実行ファイルの形の判定 (X-8 / data-model §1.1)。**純粋。I/O を持たない。**
 *
 * - `exe`: 絶対の HostPath で、末尾の名前の拡張子が `.exe` (大文字小文字を区別しない)
 * - `shim`: 同じく絶対の HostPath で、拡張子が `.cmd` / `.bat` / `.ps1`
 * - `invalid`: それ以外 (相対・UNC・空・制御文字・拡張子なし・知らない拡張子)
 *
 * ファイルが在るかは見ない (在るかは main の locator が見る)。
 */
export type ClaudeExecutableKind = 'exe' | 'shim' | 'invalid'

const SHIM_EXTENSIONS: ReadonlySet<string> = new Set(['.cmd', '.bat', '.ps1'])
const EXE_EXTENSION = '.exe'

export function classifyClaudeExecutable(raw: string): ClaudeExecutableKind {
  const made = makeHostPath(raw)
  if (!made.ok) return 'invalid'
  const name = hostPathOps.basename(made.path)
  const dot = name.lastIndexOf('.')
  if (dot <= 0) return 'invalid'
  const extension = name.slice(dot).toLowerCase()
  if (extension === EXE_EXTENSION) return 'exe'
  if (SHIM_EXTENSIONS.has(extension)) return 'shim'
  return 'invalid'
}
