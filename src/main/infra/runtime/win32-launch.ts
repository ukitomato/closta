import {
  isDerivationForwardKey,
  isValidForwardKeyName,
  makeForbiddenForwardKey
} from '@domain/provider/forward-env'
import type { DerivedLaunchEnv } from '@domain/provider/types'
import { classifyClaudeExecutable } from '@domain/runtime/claude-executable'
import { hostPathOps } from '@domain/runtime/path-api'
import { makeHostPath } from '@domain/runtime/path-types'
import {
  WIN32_TREE_STOP_ARGS,
  WIN32_TREE_STOP_COMMAND_NAME,
  type Win32LaunchSpec
} from '@domain/session/agent-session'
import { hasControlCharacter } from '@domain/validation'

import { LAUNCH_ENV_DENY_PATTERN } from './launch-spec'

/**
 * Win32Runtime の起動の値と env の組み立て (X-8 / data-model §5.1 / §6)。**純粋。I/O を持たない。**
 *
 * このファイルはプロセスを起こさない (値を組むだけ)。起こすのは agents のセッションスレッドで、
 * agents はここが組んだ値を検査して写す (Windows 固有の値を agents に持たせない。FR-014)。
 */

/**
 * Win32 の起動の env の許可リスト (実名。data-model §6.1 が正本。30 キー)。
 * `WSLENV` / `WSL_UTF8` を含まない。集合を変えるには ADR が要る (AD-058)。
 */
export const WIN32_LAUNCH_ENV_ALLOWLIST = [
  'PATH',
  'PATHEXT',
  'ComSpec',
  'SystemRoot',
  'SystemDrive',
  'windir',
  'OS',
  'NUMBER_OF_PROCESSORS',
  'PROCESSOR_ARCHITECTURE',
  'TEMP',
  'TMP',
  'USERPROFILE',
  'USERNAME',
  'USERDOMAIN',
  'HOMEDRIVE',
  'HOMEPATH',
  'APPDATA',
  'LOCALAPPDATA',
  'ProgramData',
  'ProgramFiles',
  'ProgramFiles(x86)',
  'ProgramW6432',
  'CommonProgramFiles',
  'CommonProgramFiles(x86)',
  'CommonProgramW6432',
  'CLAUDE_CODE_GIT_BASH_PATH',
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'NO_PROXY',
  'NODE_EXTRA_CA_CERTS'
] as const

/**
 * Provider が上書きしてよいキー (proxy の 3 キー。data-model §6.1)。許可リストの部分集合で、
 * `NODE_EXTRA_CA_CERTS` を含まない (値がファイルのパスで、登録時の値は WSL の POSIX パスのため)。
 * 集合を変えるには ADR が要る (AD-058)。
 */
export const WIN32_PROVIDER_OVERRIDABLE_KEYS = ['HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY'] as const

/** Win32 の transport のキー (許可リスト − 上書きしてよいキー。27 キー)。 */
export const WIN32_TRANSPORT_KEYS: readonly string[] = WIN32_LAUNCH_ENV_ALLOWLIST.filter(
  (key) => !(WIN32_PROVIDER_OVERRIDABLE_KEYS as readonly string[]).includes(key)
)

/**
 * Win32 の転送禁止キーの述語 (domain の述語に Win32 の transport のキーを注入する。AD-041 (e) と同じ構え)。
 * 起動の env の合成 (`composeWin32LaunchEnv`) と、到達可能性の判定 (BE-040) の両方がこれを使う。
 */
export const isWin32ForbiddenKey = makeForbiddenForwardKey(WIN32_TRANSPORT_KEYS)

/**
 * 許可リストのキーだけを親の env から拾う。キーの照合は大文字小文字を区別せず、出力は表の綴り。
 * `LAUNCH_ENV_DENY_PATTERN` に当たるキーは入れない (二重の網)。
 */
export function buildWin32LaunchEnv(
  source: Readonly<Record<string, string | undefined>>
): Record<string, string> {
  const upperSource = new Map<string, string>()
  for (const [key, value] of Object.entries(source)) {
    if (typeof value !== 'string') continue
    const upper = key.toUpperCase()
    // 同じ綴りの重複 (Path / PATH) は先に見たほうを採る。
    if (!upperSource.has(upper)) upperSource.set(upper, value)
  }
  const env: Record<string, string> = {}
  for (const key of WIN32_LAUNCH_ENV_ALLOWLIST) {
    if (LAUNCH_ENV_DENY_PATTERN.test(key)) continue
    const value = upperSource.get(key.toUpperCase())
    if (value !== undefined) env[key] = value
  }
  return env
}

/**
 * 起動の env = ホストの許可リストの env に、`derived.forwardKeys` の値だけを重ねる (data-model §6.2)。
 * `derived.env` の残り (WSL の curated base) は使わない。規則に反すれば throw (呼び出し側が `invalid-config`)。
 * 値はメッセージに入れない (秘密を含みうる)。
 */
export function composeWin32LaunchEnv(
  baseEnv: Record<string, string>,
  derived: Pick<DerivedLaunchEnv, 'env' | 'forwardKeys'>
): Record<string, string> {
  const env: Record<string, string> = { ...baseEnv }
  for (const key of derived.forwardKeys) {
    const value = derived.env[key]
    if (!isValidForwardKeyName(key) || typeof value !== 'string') {
      throw new Error('composeWin32LaunchEnv: 転送キーが名前規則に反するか env に在りません')
    }
    if (isWin32ForbiddenKey(key) && !isDerivationForwardKey(key)) {
      throw new Error('composeWin32LaunchEnv: 転送禁止キーは転送できません')
    }
    if (hasControlCharacter(value)) {
      throw new Error('composeWin32LaunchEnv: 転送キーの値に制御文字があります')
    }
    env[key] = value
  }
  return env
}

export interface Win32LaunchSpecParams {
  /** 作業フォルダの HostPath の文字列。 */
  readonly cwd: string
  /** claude.exe の絶対パス (HostPath の文字列)。 */
  readonly claudePath: string
  /** `buildWin32LaunchEnv` の結果 (停止のコマンドの解決と env に使う)。 */
  readonly baseEnv: Record<string, string>
  /** `composeWin32LaunchEnv` の結果。 */
  readonly launchEnv: Record<string, string>
}

function resolveStopCommand(baseEnv: Record<string, string>): string {
  const rawRoot = baseEnv.SystemRoot ?? baseEnv.windir
  const root = typeof rawRoot === 'string' ? makeHostPath(rawRoot) : null
  if (root === null || !root.ok) {
    // 裸名にしない (CWE-426)。値はメッセージに入れない。
    throw new Error('SystemRoot/windir が解決できず停止のコマンドを絶対パスで組めません')
  }
  const joined = hostPathOps.join(root.path, 'System32', WIN32_TREE_STOP_COMMAND_NAME)
  if (!joined.ok) throw new Error('停止のコマンドのパスを組めません')
  return joined.path.value
}

/** Win32 の起動の値を組む (data-model §5.1)。満たさなければ throw (呼び出し側が `launch-failed`)。 */
export function buildWin32LaunchSpec(params: Win32LaunchSpecParams): Win32LaunchSpec {
  if (!makeHostPath(params.cwd).ok) throw new Error('作業フォルダが HostPath ではありません')
  if (classifyClaudeExecutable(params.claudePath) !== 'exe') {
    throw new Error('claude の実行ファイルが .exe の絶対パスではありません')
  }
  const stopEnv: Record<string, string> = {}
  for (const key of ['SystemRoot', 'windir'] as const) {
    const value = params.baseEnv[key]
    if (typeof value === 'string') stopEnv[key] = value
  }
  return {
    kind: 'win32',
    pathToClaudeCodeExecutable: params.claudePath,
    command: params.claudePath,
    cwd: params.cwd,
    env: params.launchEnv,
    windowsHide: true,
    stop: {
      command: resolveStopCommand(params.baseEnv),
      argsBeforePid: [...WIN32_TREE_STOP_ARGS],
      env: stopEnv
    }
  }
}
