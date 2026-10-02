import { Worker } from 'node:worker_threads'

import { runSupervisor } from './supervisor-core'
import { createTransport } from './transport'

/**
 * **supervisor の entry** (X-5 / AD-043)。本物の transport・Worker・時計・終了を `runSupervisor` に渡すだけの結線。
 *
 * | 規則 | 根拠 |
 * |---|---|
 * | **`electron` を import しない。** Electron の utilityProcess としても、素の `node` としても起動できる | Principle VII / AD-010 / AD-043 Decision 6 |
 * | worker entry のパスは起動引数 `--worker-entry=<絶対パス>` で受ける (位置に依存しない)。main は `?modulePath` で得たバンドル済みのパスだけを渡す — IPC・env・利用者入力から決まらない | AD-043 Decision 6 / SH-000 (4a) |
 * | Worker は `env` を指定せずに起こし (supervisor の curated base の複製)、`SHARE_ENV` を使わない。`resourceLimits` を指定する | AD-043 Decision 7 / Principle V |
 * | Worker の標準出力は受け取って読み捨てる (標準入出力経路のプロトコル行に混ぜない) | Principle VII / pr-gate R1 platform-boundary L-002 |
 * | 子プロセスは起こさない (spawn はセッションスレッドの `spawnClaudeCodeProcess` だけ) | `PROCESS_SPAWN_MODULES` |
 *
 * 単独起動: `node <このファイルのビルド成果物> --worker-entry=<sdk-agent-session のビルド成果物の絶対パス>`。
 * 標準入出力で 1 行 1 メッセージを話す (`supervisor-protocol.ts`)。標準入力を閉じると全セッションを止めて終わる。
 */

/** セッションスレッド 1 本あたりの V8 ヒープ上限 (spec Assumptions [ASSUMED] 1GB)。超えた Worker だけが落ちる (SH-000 (3d))。 */
const SESSION_THREAD_HEAP_MB = 1024

const WORKER_ENTRY_FLAG = '--worker-entry='

function workerEntryFromArgv(argv: readonly string[]): string | null {
  const arg = argv.find((a) => a.startsWith(WORKER_ENTRY_FLAG))
  const value = arg?.slice(WORKER_ENTRY_FLAG.length) ?? ''
  return value.length > 0 ? value : null
}

function main(): void {
  const workerEntry = workerEntryFromArgv(process.argv)
  if (workerEntry === null) {
    // worker entry が無ければセッションを起こせない。理由だけを出して終わる (値は出さない)。
    process.exitCode = 2
    return
  }
  runSupervisor({
    transport: createTransport(),
    createWorker: () => {
      /*
       * **Worker の標準出力を親の標準出力へ流さない** (pr-gate R1 platform-boundary L-002)。既定では Worker の
       * `process.stdout` が親の stdout にそのまま流れ、単独起動の標準入出力経路のプロトコル行に SDK などの出力が混ざる。
       * `stdout: true` で受け取り、読み捨てる (Principle VII の「標準入出力でプロトコルを話せる形」を依存先の挙動に左右させない)。
       */
      const worker = new Worker(workerEntry, {
        stdout: true,
        resourceLimits: { maxOldGenerationSizeMb: SESSION_THREAD_HEAP_MB }
      })
      worker.stdout.resume()
      return worker
    },
    timer: {
      setTimeout: (fn, ms) => setTimeout(fn, ms),
      clearTimeout: (h) => clearTimeout(h as never)
    },
    exit: (code) => process.exit(code)
  })
}

main()
