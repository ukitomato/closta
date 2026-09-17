import {
  ARG_LIMIT,
  ARG_OFFSET,
  ARG_SCOPE,
  ARG_TARGET_KEY,
  decodeResponse,
  type EnumerationResponse
} from '@agents/protocol'
import { checkVerified } from '@domain/runtime/verified-running'
import type {
  EnumerationRequest,
  EnumerationResult,
  SessionEnumerator
} from '@domain/session/interfaces'
import type { FailureReason } from '@domain/session/target'

import { buildEnumerationEnv, configDirEnvValue } from '../infra/session/config-dir'

/**
 * 列挙プロセスの起動と結線 (BE-025 / BE-025b / contracts C-1 / C-5 / C-6)。
 *
 * | 規則 | 根拠 |
 * |---|---|
 * | 列挙対象 1 件につき 1 プロセス。結果を返して終了する | AD-028 §1 (「要求 1 回」の寿命) |
 * | **確認済みの値が無ければ `wsl:<D>` の起動を発行しない** | FR-008 / SC-002 / C-1 |
 * | 環境変数は**許可リストのみ**。親環境を継承させない | FR-050 / SC-016 |
 * | timeout は**列挙対象ごと**に持つ | C-5 |
 * | 終了は `kill()` のみ。**シグナルを選べる API は無い** | C-5 |
 * | 同じ対象への並行要求は**束ねる**。逐次の連打には最小間隔 | C-6 |
 * | 同時プロセス数に上限 | C-6 |
 *
 * **`electron` を import しない。** 子プロセスを実際に起こす層は
 * `enumerator-spawner.ts` に分けてあり、本ファイルは `EnumerationLauncher` を注入で受け取る。
 * そうしないと方針 (timeout / 上限 / 束ね / クールダウン / ゲート) を
 * **Electron を立てずに検証できない** (BE-025c / AD-028 §4 の訂正)。
 *
 * **所在の判別は `Location` の値で行う。** 文字列リテラルを条件に書かない —
 * 判別が 2 つの表現を持つと、名前空間の追加時に片方だけが残る。
 *
 * **`before-quit` の登録はここで行わない。** `killAll()` を公開し、
 * 登録は `composition-root.ts` が行う (BE-031)。ここで `app` の event を掴むと
 * `electron` への依存が戻る。
 */

/**
 * 終了を要求したあと、終了の通知を待つ猶予 (C-5)。
 *
 * **戻り値と終了通知の両方を確認する。** 猶予内に来なければ記録して
 * 監視対象から外す — 掴んだままにすると同時数の枠が永久に埋まる。
 */
export const KILL_GRACE_MS = 2_000

/** 同時に起こす列挙プロセスの上限 (C-6)。所在が多いホストで数十プロセスを同時に起こさない。 */
export const MAX_CONCURRENT_ENUMERATIONS = 3

/**
 * 同一列挙対象への連続要求の最小間隔 (C-6)。
 *
 * **束ねは並行要求にしか効かない。** 1 本ずつ待ってから連打されると、
 * 束ねを通り抜けて UNC I/O を伴う子プロセスが無制限に起きる。
 * renderer は未信頼であり (AD-023)、UI のバグでも侵害でも同じ経路になる。
 */
export const ENUMERATION_COOLDOWN_MS = 1_000

/**
 * 子プロセス 1 つ分の窓。**テストで差し替える**ため型で切る。
 *
 * **メソッド名に `spawn` を使わない。** 検証項目 7 (Principle VI) は
 * プロセス起動 API の名前を**文字列として**探すため、同名のメソッドを置くと
 * 許可リスト外のモジュールでの起動として発火する。実測で発火した。
 * 迂回を防ぐために名前で見る作りになっており、こちらが名前を譲るのが正しい。
 */
export interface EnumerationChild {
  /** 標準出力の 1 行ごと。 */
  onLine(listener: (line: string) => void): void
  /** 終了。`code` が `null` なら異常終了。 */
  onExit(listener: (code: number | null) => void): void
  /** 終了させる。**戻り値を捨てない** (C-5)。 */
  kill(): boolean
}

export interface EnumerationLauncher {
  launch(args: readonly string[], env: Record<string, string>): EnumerationChild
}

export interface SessionEnumeratorDeps {
  readonly launcher: EnumerationLauncher
  /** 待機。**注入する** — 実時間を待つテストを書かないため。 */
  readonly wait: (ms: number) => Promise<void>
  readonly now: () => number
  /** 親環境。**注入する** — グローバル参照は lint も検証スクリプトも素通りする。 */
  readonly parentEnv: Readonly<Record<string, string | undefined>>
  readonly maxConcurrent?: number
  readonly cooldownMs?: number
}

function failure(reasonKey: FailureReason): EnumerationResult {
  return { ok: false, reasonKey }
}

/**
 * 応答を結果に写す。
 *
 * **`targetKey` の一致を確かめる。** 子プロセスの取り違え (古いバンドルや
 * 枠の使い回し) を、値の検査で気付ける形にする。
 */
function toResult(response: EnumerationResponse, targetKey: string): EnumerationResult {
  if (response.targetKey !== targetKey) return failure('enumeration-failed')
  if (response.kind === 'error') return failure(response.reasonKey)
  return { ok: true, sessions: response.sessions, truncated: response.truncated }
}

/**
 * 起動引数を組み立てる (C-2)。**純粋関数**であり、プロセスを起こさずに検証できる。
 *
 * **config ディレクトリを引数に載せない。** 環境変数で渡す唯一の経路を保つ
 * (FR-042 / ipc-session-list.md の「境界に出さない値」)。
 */
export function buildEnumerationArgs(request: EnumerationRequest): readonly string[] {
  const args = [`${ARG_TARGET_KEY}=${request.target.key}`]
  if (request.scope.kind === 'all') {
    args.push(`${ARG_SCOPE}=all`)
    return args
  }
  args.push(`${ARG_SCOPE}=page`)
  args.push(`${ARG_LIMIT}=${request.scope.limit}`)
  args.push(`${ARG_OFFSET}=${request.scope.offset}`)
  return args
}

/**
 * 起動してよいかを判定する (BE-025b / FR-008)。**純粋関数**である。
 *
 * 所在が `windows` なら確認済みの値は要らない。それ以外なら
 * **期限内であり、かつ同じディストロについての確認である**ことを要求する。
 */
export function checkLaunchAllowed(request: EnumerationRequest): FailureReason | null {
  if (request.target.location.kind === 'windows') return null
  if (request.verified === null) return 'distro-not-running'

  const namespace = request.target.configDir.namespace
  return checkVerified(request.verified, namespace, request.now).ok ? null : 'distro-not-running'
}

/**
 * チャンクを行に切る。
 *
 * **改行で完結した分だけを渡す。** 応答は 1 行の JSON なので、
 * 途中のチャンクで解釈を試すと必ず失敗する。
 */
export function createLineAssembler(onLine: (line: string) => void): (chunk: string) => void {
  let buffer = ''
  return (chunk) => {
    buffer += chunk
    let index = buffer.indexOf('\n')
    while (index >= 0) {
      const line = buffer.slice(0, index).trim()
      buffer = buffer.slice(index + 1)
      if (line.length > 0) onLine(line)
      index = buffer.indexOf('\n')
    }
  }
}

export interface SessionEnumeratorHandle extends SessionEnumerator {
  /** 生存中のプロセスをすべて終了させる。`before-quit` から呼ぶ (C-5)。 */
  killAll(): void
}

export function createSessionEnumerator(deps: SessionEnumeratorDeps): SessionEnumeratorHandle {
  const maxConcurrent = deps.maxConcurrent ?? MAX_CONCURRENT_ENUMERATIONS
  const cooldownMs = deps.cooldownMs ?? ENUMERATION_COOLDOWN_MS

  /** 実行中の要求。**同じ対象への並行要求はここに合流する** (C-6)。 */
  const inflight = new Map<string, Promise<EnumerationResult>>()
  /** 対象ごとの最終起動時刻。逐次の連打の間隔を測る。 */
  const lastStartedAt = new Map<string, number>()
  /** 生存中のプロセス。`killAll()` の対象。 */
  const alive = new Set<EnumerationChild>()

  let running = 0
  const waiters: (() => void)[] = []

  async function acquireSlot(): Promise<void> {
    if (running < maxConcurrent) {
      running += 1
      return
    }
    await new Promise<void>((resolve) => waiters.push(resolve))
    running += 1
  }

  function releaseSlot(): void {
    running -= 1
    const next = waiters.shift()
    if (next !== undefined) next()
  }

  async function runOnce(request: EnumerationRequest): Promise<EnumerationResult> {
    const envValue = configDirEnvValue(request.target.configDir)
    if (!envValue.ok) return failure('enumeration-failed')

    const env = buildEnumerationEnv(envValue.path, deps.parentEnv)

    await acquireSlot()
    try {
      return await new Promise<EnumerationResult>((resolve) => {
        const child = deps.launcher.launch(buildEnumerationArgs(request), env)
        alive.add(child)

        let settled = false
        let response: EnumerationResponse | null = null
        let timer: ReturnType<typeof setTimeout> | null = null
        let graceTimer: ReturnType<typeof setTimeout> | null = null

        const settle = (result: EnumerationResult): void => {
          if (settled) return
          settled = true
          if (timer !== null) clearTimeout(timer)
          if (graceTimer !== null) clearTimeout(graceTimer)
          alive.delete(child)
          resolve(result)
        }

        // **最初の妥当な 1 行だけを採る。** 以降は無視する。
        child.onLine((line) => {
          if (response === null) response = decodeResponse(line)
        })

        child.onExit(() => {
          if (response === null) {
            settle(failure('enumeration-failed'))
            return
          }
          settle(toResult(response, request.target.key))
        })

        timer = setTimeout(() => {
          /*
           * **終了要求の戻り値と終了通知の両方を見る** (C-5)。
           * 猶予内に通知が来なければ、掴んだままにせず枠を返す —
           * 返さないと 1 つの固まったプロセスが以降の列挙を全部止める。
           */
          child.kill()
          graceTimer = setTimeout(() => settle(failure('enumeration-failed')), KILL_GRACE_MS)
        }, request.timeoutMs)
      })
    } finally {
      releaseSlot()
    }
  }

  async function start(request: EnumerationRequest): Promise<EnumerationResult> {
    const key = request.target.key

    /*
     * 逐次の連打に最小間隔を掛ける (C-6)。**拒否ではなく待たせる** —
     * 理由キーの語彙を増やさずに、起動の頻度だけを縛る。
     */
    const last = lastStartedAt.get(key)
    if (last !== undefined) {
      const elapsed = deps.now() - last
      if (elapsed < cooldownMs) await deps.wait(cooldownMs - elapsed)
    }
    lastStartedAt.set(key, deps.now())

    return runOnce(request)
  }

  return {
    async enumerate(request: EnumerationRequest): Promise<EnumerationResult> {
      /*
       * **ゲートを最初に通す** (BE-025b)。探索 / 起動 / 追加取得の 3 つの入口のうち、
       * 起動と追加取得はどちらもこの関数を通る。
       */
      const denied = checkLaunchAllowed(request)
      if (denied !== null) return failure(denied)

      const existing = inflight.get(request.target.key)
      if (existing !== undefined) return existing

      const promise = start(request).finally(() => {
        inflight.delete(request.target.key)
      })
      inflight.set(request.target.key, promise)
      return promise
    },

    killAll(): void {
      for (const child of alive) child.kill()
      alive.clear()
    }
  }
}
