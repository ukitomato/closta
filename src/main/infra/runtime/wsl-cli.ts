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

/** 実行ファイル名。`PATH` 上の `wsl.exe` を使う。 */
const WSL_BINARY = 'wsl.exe'

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
      child = spawn(WSL_BINARY, [...args], {
        windowsHide: true,
        // **UTF-8 出力を要求する。** 既定は UTF-16LE (AD-015 §4)。
        env: { ...process.env, WSL_UTF8: '1' }
      })
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
       * `sh` を起動してスクリプトを標準入力から読ませる。
       * ログインシェル (`bash -lc`) を経由しない — 必須依存の確認に要るコマンドは
       * 標準のパスにあり、AD-015 §7 の話は起動 (X-1) の文脈である (research R-02)。
       */
      return invoke(['-d', distroName, '--', 'sh'], {
        timeoutMs: PROBE_TIMEOUT_MS,
        writeProbeScript: true
      })
    }
  }
}
