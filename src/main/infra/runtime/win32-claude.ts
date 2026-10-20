import { classifyClaudeExecutable } from '@domain/runtime/claude-executable'
import { hostPathOps } from '@domain/runtime/path-api'
import { makeHostPath, type HostPath } from '@domain/runtime/path-types'

/**
 * ホストの claude の探索の結果 (X-8 / data-model §2)。
 *
 * - `found`: 採った `.exe` がある (`overridden` は設定の指定を採ったか)
 * - `not-found` / `shim-only`: 指定なしで見つからない / shim だけ
 * - `override-invalid`: 指定ありで、指定が使えない (自動の探索に戻らない。FR-006)
 */
export type Win32ClaudeLocation =
  | { readonly status: 'found'; readonly path: HostPath; readonly overridden: boolean }
  | { readonly status: 'not-found' | 'shim-only'; readonly overridden: false }
  | { readonly status: 'override-invalid'; readonly overridden: true }

/** locator の依存 (data-model §2)。 */
export interface Win32ClaudeLocatorDeps {
  /** 実在するファイルか (`fs.stat` の `isFile()`。リンクはたどる)。失敗は false。 */
  readonly isFile: (path: HostPath) => Promise<boolean>
  /** 親の env の読み取り (`USERPROFILE` と `PATH` だけを読む)。 */
  readonly env: () => Readonly<Record<string, string | undefined>>
  /** 設定の上書き (§3)。無ければ null。 */
  readonly override: () => Promise<string | null>
}

/** PATH の要素の上限 (data-model §2)。 */
const MAX_PATH_ELEMENTS = 64
const SHIM_NAMES = ['claude.cmd', 'claude.bat', 'claude.ps1'] as const

function joinHost(base: HostPath, ...segments: string[]): HostPath | null {
  const joined = hostPathOps.join(base, ...segments)
  return joined.ok ? joined.path : null
}

/**
 * ホストの claude の探索 (X-8 / data-model §2)。手順は上書き → 既知の場所 → PATH → shim / not-found。
 * パスはログに出さない。プロセスを起こさない (`isFile` の呼び出しだけ)。
 */
export function createWin32ClaudeLocator(
  deps: Win32ClaudeLocatorDeps
): () => Promise<Win32ClaudeLocation> {
  return async () => {
    const override = await deps.override()
    if (override !== null) {
      if (classifyClaudeExecutable(override) === 'exe') {
        const made = makeHostPath(override)
        if (made.ok && (await deps.isFile(made.path))) {
          return { status: 'found', path: made.path, overridden: true }
        }
      }
      return { status: 'override-invalid', overridden: true }
    }

    const env = deps.env()

    const profile = env['USERPROFILE']
    if (profile !== undefined) {
      const root = makeHostPath(profile)
      if (root.ok) {
        const known = joinHost(root.path, '.local', 'bin', 'claude.exe')
        if (known !== null && (await deps.isFile(known))) {
          return { status: 'found', path: known, overridden: false }
        }
      }
    }

    let sawShim = false
    const pathValue = env['PATH']
    if (pathValue !== undefined) {
      const elements = pathValue.split(';').slice(0, MAX_PATH_ELEMENTS)
      for (const rawElement of elements) {
        const trimmed = rawElement.trim().replace(/^"+|"+$/g, '').trim()
        if (trimmed.length === 0) continue
        const dir = makeHostPath(trimmed)
        if (!dir.ok) continue
        const exe = joinHost(dir.path, 'claude.exe')
        if (exe !== null && (await deps.isFile(exe))) {
          return { status: 'found', path: exe, overridden: false }
        }
        for (const name of SHIM_NAMES) {
          const shim = joinHost(dir.path, name)
          if (shim !== null && (await deps.isFile(shim))) sawShim = true
        }
      }
    }

    return { status: sawShim ? 'shim-only' : 'not-found', overridden: false }
  }
}
