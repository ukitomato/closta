import { utilityProcess } from 'electron'

import renameSessionModulePath from '@agents/rename-session?modulePath'

/**
 * セッションの改名の**専用短命プロセス**を起こす層 (023 / [AD-062](../../../docs/decisions/0062-live-session-permission-mode-model-and-rename.md) Decision 4 / data-model §6.3)。
 *
 * **`electron` を持つ唯一の改名のモジュール** (`PROCESS_SPAWN_MODULES` の実名リスト。023 で追加)。
 * `transcript-spawner.ts` (1 要求 = 1 子・本文の port を子へ transfer) とは別にする — こちらは
 * `{ conversationId, name }` の 1 通を送り `{ ok }` の 1 通を受けるだけで、port を使わない。
 *
 * | 規則 | 根拠 |
 * |---|---|
 * | env は呼び出し側が組んだ値だけを渡す (最小の許可リスト + `CLAUDE_CONFIG_DIR`)。stdio は `ignore` | AD-034 決定 2 / C-5 |
 * | 結果は `{ ok: true }` の 1 通・子の終わり・期限 (10 秒)・`dispose` のどれか 1 つで決まる (2 回解かない) | C-5 |
 * | 同時に動く子は `MAX_CONCURRENT_RENAMES` まで。上限なら子を起こさず `write-failed` (古い子は止めない) | data-model §6.3 |
 * | `dispose()` は動いている子の全部を kill して待ちを `write-failed` で解き、確かめられなかった数を返す | AD-034 決定 2 |
 * | ログに名前・会話の id・config ディレクトリを出さない | CWE-532 |
 */

/** バンドル後の改名プロセスのファイルパス。 */
export const RENAME_SESSION_MODULE_PATH: string = renameSessionModulePath

/** 改名の子の期限 (ms)。過ぎたら子を止めて `write-failed`。 */
export const RENAME_TIMEOUT_MS = 10_000

/** 同時に動く改名の子の上限。 */
export const MAX_CONCURRENT_RENAMES = 10

export type RenameSpawnResult = { readonly ok: true } | { readonly ok: false; readonly reason: 'write-failed' }

export interface RenameSpawnRequest {
  readonly conversationId: string
  readonly name: string
}

export interface RenameSpawner {
  /**
   * 子を起こして名前を書かせる。失敗は理由キーだけで返す (子の例外の文字列は受け取らない)。
   * **メソッド名に `spawn` を使わない** (検証項目 7 は名前の文字列で探すため)。
   */
  run(env: Record<string, string>, request: RenameSpawnRequest): Promise<RenameSpawnResult>
  /** アプリ終了時に動いている子を片付ける。**kill を確かめられなかった数**を返す。 */
  dispose(): number
}

export interface RenameSpawnerOptions {
  readonly timeoutMs?: number
  readonly maxConcurrent?: number
}

interface Active {
  readonly kill: () => boolean
  readonly settle: (result: RenameSpawnResult) => void
}

const FAILED: RenameSpawnResult = { ok: false, reason: 'write-failed' }

export function createRenameSpawner(options: RenameSpawnerOptions = {}): RenameSpawner {
  const timeoutMs = options.timeoutMs ?? RENAME_TIMEOUT_MS
  const maxConcurrent = options.maxConcurrent ?? MAX_CONCURRENT_RENAMES
  const active = new Set<Active>()
  let disposed = false

  return {
    run(env, request): Promise<RenameSpawnResult> {
      if (disposed || active.size >= maxConcurrent) return Promise.resolve(FAILED)

      return new Promise<RenameSpawnResult>((resolve) => {
        let settled = false
        let timer: ReturnType<typeof setTimeout> | null = null
        let ended = false
        const child = utilityProcess.fork(RENAME_SESSION_MODULE_PATH, [], {
          env,
          // 応答は postMessage で受ける。読み手のいないパイプを作らず、SDK が出す文字列も OS 側で破棄される。
          stdio: 'ignore'
        })

        const entry: Active = {
          kill: () => (ended ? true : child.kill()),
          settle: (result) => settle(result)
        }
        function settle(result: RenameSpawnResult): void {
          if (settled) return
          settled = true
          if (timer !== null) clearTimeout(timer)
          active.delete(entry)
          resolve(result)
        }
        active.add(entry)

        child.on('message', (message: unknown) => {
          const ok =
            typeof message === 'object' &&
            message !== null &&
            (message as { ok?: unknown }).ok === true
          settle(ok ? { ok: true } : FAILED)
        })
        const onEnd = (): void => {
          ended = true
          settle(FAILED)
        }
        child.on('exit', onEnd)
        child.on('error', onEnd)

        // 子が起きてから 1 通だけ送る。
        child.once('spawn', () => {
          child.postMessage({ conversationId: request.conversationId, name: request.name })
        })

        timer = setTimeout(() => {
          child.kill()
          settle(FAILED)
        }, timeoutMs)
      })
    },

    dispose(): number {
      disposed = true
      let unconfirmed = 0
      for (const entry of [...active]) {
        if (!entry.kill()) unconfirmed += 1
        entry.settle(FAILED)
      }
      active.clear()
      return unconfirmed
    }
  }
}
