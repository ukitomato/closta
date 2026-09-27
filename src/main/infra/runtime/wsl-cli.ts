import { spawn } from 'node:child_process'

import { PROBE_SCRIPT } from './probe-script'

/**
 * `wsl.exe` を呼ぶ**唯一の**モジュール (FR-041 / contracts/runtime-detection.md C-3 / C-4)。
 *
 * 許可リストの正本は `scripts/constitution/allowlists.mjs` である。
 * `WSL_CALLER_MODULES` と `PROCESS_SPAWN_MODULES` の両方がこのファイル 1 つを指す。
 * **追加には ADR を要する。**
 *
 * ここが守る規則 (C-4):
 * - 引数は**配列**で渡す。シェル文字列を組み立てない
 * - **バックスラッシュを含む任意の引数を渡さない** — `wsl.exe` の引数処理は
 *   バックスラッシュを消すため (AD-015 §5)、含めると静かに壊れた形で実行される。
 *   パスに限った制約ではない
 * - **スクリプトは引数ではなく標準入力で渡す** (同上)
 * - すべての呼び出しで UTF-8 出力を要求する (既定は UTF-16LE。AD-015 §4)
 */

/**
 * 実行ファイル名。`PATH` 上の `wsl.exe` を使う。
 *
 * **`wsl.exe` の文字列リテラルは本モジュールに閉じる** (WSL_CALLER_MODULES / check.mjs 項目 3)。
 * X-1 の起動 argv builder (`launch-spec.ts`) はこの定数を import して使い、リテラルを持たない
 * ため WSL_CALLER_MODULES を増やさない (AD-036 §8 / SH-上流4)。
 */
export const WSL_BINARY = 'wsl.exe'

/**
 * `wsl.exe` を**絶対パスで解決する** (CWE-426。裸名 + PATH 探索を廃す。pr-gate platform-boundary H-001)。
 *
 * `%SystemRoot%\System32\wsl.exe` を返す。`SystemRoot` (無ければ `windir`) が解決できないときは `null`。
 * `wsl.exe` のリテラルは本モジュールの `WSL_BINARY` に閉じ、`System32` 接頭だけを足す (検証項目 3 を触らない)。
 * **起動 (worker / stripped env)** は `null` を fail-closed に倒す (launch-spec.ts)。
 * **検出 (main / PATH あり)** は `null` のとき裸名にフォールバックしてよい (下の invoke)。
 */
export function resolveWslBinary(systemRoot: string | undefined): string | null {
  return systemRoot !== undefined && systemRoot.length > 0
    ? `${systemRoot}\\System32\\${WSL_BINARY}`
    : null
}

/**
 * 検出 spawn の env を **allowlist** で組む純関数 (pr-gate security M-001/M-101 / platform M-201/L-002)。
 *
 * **PATH と WSLENV を含めない。** WSL interop は WSLENV で列挙された host env を distro へ透過し
 * (`sh -l` の profile 実行時に秘密が漏れる)、appendWindowsPath は host PATH を distro PATH 末尾へ透過して
 * `command -v claude` の解決先を汚染しうる (攻撃者が Windows PATH に偽 claude を置く。CWE-426 env 面)。
 * allowlist に絞ればどちらの透過経路も断てる。`wsl.exe` は `resolveWslBinary` の絶対パスで起動するため PATH 不要、
 * distro 内コマンド (bwrap/socat/claude) は `sh -l` が復元する distro native PATH で解決される (実測)。
 *
 * 起動 (`buildLaunchEnv`。launch-spec.ts) と同一集合だが、**launch-spec との相互 import は circular になるため
 * 定数を共有せず複製する** (両者は infra/runtime 内の別 spawn 点)。純関数なので unit test 可能。
 */
const DETECTION_ENV_ALLOWLIST = ['SystemRoot', 'windir', 'TEMP', 'TMP'] as const

export function buildDetectionEnv(
  source: Record<string, string | undefined>
): Record<string, string> {
  const env: Record<string, string> = {}
  for (const key of DETECTION_ENV_ALLOWLIST) {
    const value = source[key]
    if (typeof value === 'string') env[key] = value
  }
  // **UTF-8 出力を要求する。** 既定は UTF-16LE (AD-015 §4)。固定値であり source 由来ではない。
  env.WSL_UTF8 = '1'
  return env
}

/**
 * 列挙の期限。AD-015 の実測で固定起動コストは約 1.5 秒。
 * 期限が無いと `probing` のまま留まり、利用者への解消手順が「待て」だけになる (C-5)。
 */
const LIST_TIMEOUT_MS = 10_000

/** 判定の期限。ディストロ内でのコマンド実行を含むため列挙より長く取る。 */
const PROBE_TIMEOUT_MS = 20_000

export type WslFailureReason = 'not-installed' | 'nonzero-exit' | 'timeout' | 'io-error'

export type WslResult =
  | { readonly ok: true; readonly stdout: string }
  | { readonly ok: false; readonly reason: WslFailureReason; readonly exitCode: number | null }

/**
 * `wsl.exe` の呼び出し面。
 *
 * **インタフェースにしてあるのはテストのためである。** プロセス起動レイヤを差し替えれば
 * WSL が無いホストの挙動 (FR-012 / SC-015) も出力の解釈も Vitest で検証できる。
 */
export interface WslCli {
  /** 名前だけを返す列挙。**名前の正本** (C-2)。 */
  listNames(): Promise<WslResult>
  /** 実行中のものだけを返す列挙。**実行状態の正本** (C-2)。 */
  listRunning(): Promise<WslResult>
  /** バージョンを含む表形式の列挙。 */
  listVerbose(): Promise<WslResult>
  /** ディストロ内で定義済みスクリプトを実行する。**標準入力で渡す。** */
  runProbe(distroName: string): Promise<WslResult>
}

/** 引数にバックスラッシュが混じっていないことを確認する (C-4)。 */
function assertNoBackslash(args: readonly string[]): void {
  for (const arg of args) {
    if (arg.includes('\\')) {
      throw new Error(`wsl.exe の引数にバックスラッシュを含められない: ${arg}`)
    }
  }
}

interface InvokeOptions {
  readonly timeoutMs: number
  /**
   * 標準入力へ定義済みスクリプトを流すか。
   *
   * **内容を引数で受け取らない。** 受け取る形にすると書き込み箇所が
   * `child.stdin.end(options.stdin)` になり、「標準入力へ書く式が定数の識別子そのもの」
   * という検証 (項目 6 の (ii)) を満たせなくなる。
   * 満たせない形は、定数を加工して流す経路をそのまま許す形でもある。
   */
  readonly writeProbeScript?: boolean
}

function invoke(args: readonly string[], options: InvokeOptions): Promise<WslResult> {
  assertNoBackslash(args)

  return new Promise<WslResult>((resolve) => {
    let child: ReturnType<typeof spawn>
    try {
      // **絶対パスで起動する** (CWE-426。裸名 + PATH 探索を避ける)。検出は main 文脈で PATH が
      // 使えるため、SystemRoot が解決できない稀なケースは裸名にフォールバックして検出自体は続ける。
      // SystemRoot/windir の参照は Windows 環境値の読み取りであり OS 分岐ではないため、項目8 (プラットフォーム
      // 分岐) の対象式ではない — platform-ok 注記は付けない (read-transcript.ts と同じ扱い。pr-gate platform L-102)。
      const command = resolveWslBinary(process.env.SystemRoot ?? process.env.windir) ?? WSL_BINARY
      // **検出 env は allowlist で組む** (buildDetectionEnv。PATH/WSLENV 非透過。pr-gate security M-001/M-101)。
      child = spawn(command, [...args], { windowsHide: true, env: buildDetectionEnv(process.env) })
    } catch {
      return resolve({ ok: false, reason: 'not-installed', exitCode: null })
    }

    let stdout = ''
    let settled = false
    const settle = (result: WslResult): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(result)
    }

    const timer = setTimeout(() => {
      child.kill()
      settle({ ok: false, reason: 'timeout', exitCode: null })
    }, options.timeoutMs)

    child.stdout?.setEncoding('utf8')
    child.stdout?.on('data', (chunk: string) => {
      stdout += chunk
    })
    // stderr は読み捨てる。**内容を UI へ直達させない** (ランタイム由来の文字列である)。
    child.stderr?.resume()

    child.on('error', (error: NodeJS.ErrnoException) => {
      // `ENOENT` は WSL 未搭載。**例外にしない** (FR-012 / SC-015)。
      settle({
        ok: false,
        reason: error.code === 'ENOENT' ? 'not-installed' : 'io-error',
        exitCode: null
      })
    })

    child.on('close', (code) => {
      if (code === 0) return settle({ ok: true, stdout })
      settle({ ok: false, reason: 'nonzero-exit', exitCode: code })
    })

    if (options.writeProbeScript === true) {
      /*
       * **標準入力へ書くのは定数の識別子そのものである。**
       * 連結・補間・変数経由を挟むと検証項目 6 (ii) が通らない。
       * 形の検査でしかないが、形を崩せる構造は内容を加工できる構造でもある。
       */
      child.stdin?.end(PROBE_SCRIPT)
    } else {
      child.stdin?.end()
    }
  })
}

export function createWslCli(): WslCli {
  return {
    listNames() {
      return invoke(['-l', '-q'], { timeoutMs: LIST_TIMEOUT_MS })
    },

    listRunning() {
      return invoke(['-l', '-q', '--running'], { timeoutMs: LIST_TIMEOUT_MS })
    },

    listVerbose() {
      return invoke(['-l', '-v'], { timeoutMs: LIST_TIMEOUT_MS })
    },

    runProbe(distroName) {
      /*
       * ディストロ名は列挙の時点で文字種を検証済みである (data-model §4)。
       * `assertNoBackslash` が二重の網になる。
       *
       * **ログインシェル (`sh -l`) を起動してスクリプトを標準入力から読ませる。**
       * `claude` はログインシェルの PATH にしかない (AD-015 §7 / AD-018 §4。native installer は
       * `~/.local/bin/claude` に置き、PATH は `~/.profile` がログイン時に足す)。probe の `command -v claude`
       * を非ログイン `sh` で走らせると導入済みでも解決できず `claude-not-found` に倒れる (quickstart V-1 の実機不具合)。
       * `bash -lc 'script'` はスクリプトを引数で渡す形になり stdin 不変条件 (C-4 / AD-015 §5) を破るため使わない。
       * `sh -l` なら stdin からスクリプトを読みつつ `/etc/profile` + `~/.profile` を source できる。
       * bwrap / socat / userns は `/usr/bin` にあり PATH に依らないのでログイン化の影響を受けない (実測確認済)。
       *
       * **既知の制約 (pr-gate platform-boundary M-003)**: profile が stdin を読む処理 (`read` / 対話プロンプト等)
       * を含むと `sh -l` が PROBE_SCRIPT の先頭を食い `done=1` が出ず判定失敗しうる (AD-018 §4 の stdin パイプの罠)。
       * その場合 `wsl-detector` は `probeFailed()` に **fail-safe** に倒れる (capabilities を楽観側に丸めない・
       * claudePath は null → `claude-not-found`)。unit test 不能 (実 WSL 依存) のため quickstart V-1 手動が番人。
       */
      return invoke(['-d', distroName, '--', 'sh', '-l'], {
        timeoutMs: PROBE_TIMEOUT_MS,
        writeProbeScript: true
      })
    }
  }
}
