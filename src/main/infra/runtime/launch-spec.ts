import type { RuntimeLaunchSpec } from '@domain/session/agent-session'

import { resolveWslBinary } from './wsl-cli'

/**
 * X-1 の WSL 起動 argv / env を組み立てる**純粋関数** (data-model §7-§8 / AD-036 §3・§8)。
 *
 * `wsl.exe` の argv 構築は AD-023 §7 では agents に置かれていたが、Principle VI の機械強制
 * (`WSL_FREE_DIRECTORIES` に `src/agents/`) のため **infra/runtime へ移した** (AD-036 §8 の調停)。
 * `wsl.exe` のリテラルは `wsl-cli.ts` の `WSL_BINARY` に閉じ、本モジュールは import して使うため
 * WSL_CALLER_MODULES を増やさない。agents はここが返す `RuntimeLaunchSpec` を**値**で受け取る。
 *
 * **I/O を持たない。** claude 実行パスの解決 (probe) と cwd の HostPath→RuntimePath 変換は
 * 呼び出し側 (composition) が domain のパス API 経由で行い (Principle I)、解決済みの文字列を渡す。
 */

/**
 * 起動 env の許可リスト (実名。data-model §7 / M-201)。
 *
 * R-2 の `ENUMERATION_ENV_ALLOWLIST` と同一集合。**`PATH` を含めない** —
 * wsl.exe / claude を絶対パス相当で起動するため不要で、WSL interop が Windows `PATH` を
 * WSL 内へ透過する経路 (攻撃者が prepend しうる) を作らない (L-102/M-201 / config-dir.ts の根拠と同じ)。
 */
export const LAUNCH_ENV_ALLOWLIST = ['SystemRoot', 'windir', 'TEMP', 'TMP'] as const

/**
 * 許可リストに現れてはならないパターン (denylist)。**`WSLENV` と資格情報系** (AD-036 §6)。
 * WSL は `WSLENV` 列挙変数を WSL 内へ透過するため、混ざると秘密がアプリを通って `claude` に渡る。
 */
export const LAUNCH_ENV_DENY_PATTERN = /^(WSLENV|.*(API_?KEY|TOKEN|SECRET|PASSWORD)|AWS_.*)$/i

/**
 * 起動 env を組み立てる共有純関数 (M-202)。
 *
 * **allowlist のキーだけを source から拾い、denylist に当たるキーは決して含めない。**
 * utilityProcess.fork の env (app) と wsl.exe spawn の env (この spec.env) の**両 spawn 点**が
 * この 1 関数を呼ぶことで、両点で同一の許可/denylist を保証する。
 */
export function buildLaunchEnv(source: Record<string, string | undefined>): Record<string, string> {
  const env: Record<string, string> = {}
  for (const key of LAUNCH_ENV_ALLOWLIST) {
    if (LAUNCH_ENV_DENY_PATTERN.test(key)) continue // 二重の網 (allowlist は既に安全だが防御的)
    const value = source[key]
    if (typeof value === 'string') env[key] = value
  }
  // wsl.exe の出力を UTF-8 に固定する (既定は UTF-16LE。AD-015 §4)。固定値であり source 由来ではない。
  env.WSL_UTF8 = '1'
  return env
}

/**
 * 起動用に `wsl.exe` を**絶対パスで解決する** (CWE-426 / data-model §8 L-102 / quickstart V-1 実機不具合)。
 *
 * 起動 worker (`utilityProcess`) は stripped env (**PATH なし**) で走るため、裸名 `wsl.exe` を spawn すると
 * libuv が PATH 探索に失敗して `spawn wsl.exe ENOENT` になる。加えて PATH 探索は攻撃者が prepend した
 * `wsl.exe` を掴みうる (CWE-426)。`resolveWslBinary` (wsl-cli.ts) が `%SystemRoot%\System32\wsl.exe` を
 * 絶対指定して**探索自体を無くす** — LAUNCH_ENV_ALLOWLIST コメントが述べる「wsl.exe / claude を絶対パス相当で
 * 起動する」設計意図の履行である。`SystemRoot` (無ければ `windir`) は allowlist に含まれ stripped env に必ず在る。
 *
 * **解決できないときは throw (fail-closed)。** 裸名にフォールバックしない — 起動 env は PATH を持たないので
 * 裸名では ENOENT になり、かつ CWE-426 の趣旨に反する。claudePath 不在を `claude-not-found` で起動拒否するのと
 * 同じ fail-closed に揃える (pr-gate platform-boundary M-001)。呼び出し側は throw を launch-failed に倒す。
 */
function resolveWslCommand(env: Record<string, string>): string {
  const command = resolveWslBinary(env.SystemRoot ?? env.windir)
  if (command === null) {
    throw new Error('SystemRoot/windir が解決できず WSL ランチャを絶対パスで起動できません')
  }
  return command
}

/** 起動引数にバックスラッシュを含めない (WSL ランチャは引数のバックスラッシュを消す。AD-015 §5 / wsl-cli.ts C-4)。 */
function assertNoBackslash(values: readonly string[]): void {
  for (const value of values) {
    if (value.includes('\\')) {
      throw new Error(`起動引数にバックスラッシュを含められない: ${value}`)
    }
  }
}

export interface RuntimeLaunchSpecParams {
  readonly distroName: string
  /** 選択ランタイムの distro 名前空間の作業ディレクトリ (RuntimePath の文字列。呼び出し側が変換済み)。 */
  readonly cwd: string
  /** WSL 内の claude 実行パス (RuntimePath の文字列。起動時に 1 回解決済み。AD-018 §4)。 */
  readonly claudePath: string
  /** `buildLaunchEnv` で組み立て済みの env。 */
  readonly env: Record<string, string>
}

/**
 * `RuntimeLaunchSpec` を組み立てる (data-model §8)。
 *
 * - `command` は **`%SystemRoot%\System32\wsl.exe` の絶対パス** (`resolveWslCommand`。CWE-426 回避 +
 *   PATH なし worker での ENOENT 回避)。`wsl.exe` のリテラルは `WSL_BINARY` (wsl-cli.ts) に閉じる。
 * - **cwd は `--cd` 引数で渡す** — ホスト `child_process.spawn` の cwd に RuntimePath を渡さない (H-03)。
 * - argv は配列。distro 名・cwd・claude パスをそれぞれ独立要素にする (シェル補間しない。H-05)。
 *   **`command` はバックスラッシュを含む (絶対パス)** ため `assertNoBackslash` の対象に入れない —
 *   CreateProcess は実行ファイルパスのバックスラッシュを解釈し、WSL 引数のような消去は起きない (AD-015 §5 は引数の話)。
 */
export function buildRuntimeLaunchSpec(params: RuntimeLaunchSpecParams): RuntimeLaunchSpec {
  const prefixArgs = ['--cd', params.cwd, '-d', params.distroName, '--']
  assertNoBackslash([...prefixArgs, params.claudePath])
  return {
    pathToClaudeCodeExecutable: params.claudePath,
    command: resolveWslCommand(params.env),
    prefixArgs,
    env: params.env
  }
}
