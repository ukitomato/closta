import {
  PROTOCOL_VERSION,
  decodeResponse,
  encodeRequest,
  type EnumerationRequestLine,
  type EnumerationResponseLine
} from '@agents/protocol'
import { checkVerified } from '@domain/runtime/verified-running'
import type {
  EnumerationRequest,
  EnumerationResult,
  SessionEnumerator
} from '@domain/session/interfaces'
import type { FailureReason } from '@domain/session/target'

import { buildWorkerEnv, configDirEnvValue } from '../infra/session/config-dir'

/**
 * 常駐した列挙プロセスの結線 (BE-025 / BE-025b / AD-030)。
 *
 * | 規則 | 根拠 |
 * |---|---|
 * | **プロセスは 1 つ。要求を直列に処理する** | AD-030 §1 |
 * | **確認済みの値が無ければ `wsl:<D>` の要求を出さない** | FR-008 / SC-002 / C-1 |
 * | 環境変数は**許可リストのみ**。親環境を継承させない | FR-050 / SC-016 |
 * | timeout は**要求ごと**に持つ | C-5 |
 * | 同じ対象への並行要求は**束ねる**。逐次の連打には最小間隔 | C-6 |
 * | **落ちたら作り直す。** ただし無限には作り直さない | AD-030 §7 |
 *
 * **直列であることが環境変数のレースを消している** (AD-030 §3)。
 * 子は要求ごとに config ディレクトリを環境変数へ設定するため、
 * **2 件を重ねて送ってはならない。** ここで 1 件ずつ送ることが唯一の担保である。
 *
 * **`electron` を import しない。** 子プロセスを実際に起こす層は
 * `enumerator-spawner.ts` に分けてあり、本ファイルは `EnumerationWorkerLauncher` を
 * 注入で受け取る。そうしないと方針 (待ち行列 / timeout / 作り直し / ゲート) を
 * **Electron を立てずに検証できない** (BE-025c)。
 *
 * **所在の判別は `Location` の値で行う。** 文字列リテラルを条件に書かない。
 *
 * **`before-quit` の登録はここで行わない。** `dispose()` を公開し、
 * 登録は `composition-root.ts` が行う (BE-031)。
 */

/**
 * 要求 1 件の上限時間 (C-5)。
 *
 * **短命プロセスだった頃より短くてよい。** 起動費用を含まないため、
 * 実測では 2 所在で 600 ms 程度である (AD-030 の実測)。
 */
export const ENUMERATION_TIMEOUT_MS = 10_000

/**
 * 同一列挙対象への連続要求の最小間隔 (C-6)。
 *
 * **束ねは並行要求にしか効かない。** 1 本ずつ待ってから連打されると、
 * 束ねを通り抜けて UNC I/O が無制限に走る。
 * renderer は未信頼であり (AD-023)、UI のバグでも侵害でも同じ経路になる。
 */
export const ENUMERATION_COOLDOWN_MS = 1_000

/**
 * 連続して落ちたときに作り直すのをやめる回数 (AD-030 §7)。
 *
 * **落ち続けるプロセスを起こし続けない。** 1 回でもうまく動いたら数え直す。
 */
export const MAX_CONSECUTIVE_CRASHES = 3

/**
 * 常駐プロセス 1 つ分の窓。**テストで差し替える**ため型で切る。
 *
 * **メソッド名に `spawn` を使わない。** 検証項目 7 (Principle VI) は
 * プロセス起動 API の名前を**文字列として**探すため、同名のメソッドを置くと
 * 許可リスト外のモジュールでの起動として発火する。実測で発火した。
 */
export interface EnumerationWorker {
  /**
   * 応答の 1 行ごと。
   *
   * **実装は 2 つの経路の両方を購読しなければならない**
   * (AD-030 §5 の訂正 / code-gate iteration 1 / test track)。
   *
   * 子は**要求を受け取った経路で返す** (`src/agents/transport.ts` が経路を 1 つ選ぶ)。
   * Electron 下では要求が `parentPort` に載るので応答も `parentPort` に載る。
   * 標準出力だけを購読していたため**要求は届いて応答だけが捨てられ**、
   * 実機で全要求が上限時間に当たった (先頭ページ 31,420 ms)。
   *
   * **この義務がここに書かれていなかった。** 「応答の 1 行ごと」だけでは、
   * 次に実装する人がインタフェースから経路が 2 本あることを知れない。
   * 経路を決めるのは子であり、親が先読みして片方だけを見ると
   * **選択が変わった瞬間に無言で壊れる**。
   *
   * **この義務はテストの外にある。** ここを差し替えて書くテスト
   * (`session-enumerator.test.ts`) では代役の `onLine` が 1 本しかなく、
   * 経路が 2 本あること自体が現れない。`enumerator-spawner.ts` は
   * `electron` と仮想モジュールを import するため Vitest で読めない。
   * 代わりに `tests/docs/spawner-channels.test.ts` が
   * **ソースのテキストを突き合わせて**この 2 経路を固定している。
   */
  onLine(listener: (line: string) => void): void
  /** 終了。`code` が `null` なら異常終了。 */
  onExit(listener: (code: number | null) => void): void
  /** 要求の 1 行を送る。**書けたかどうかを返す。** */
  send(line: string): boolean
  /** 終了させる。**戻り値を捨てない** (C-5)。 */
  kill(): boolean
}

export interface EnumerationWorkerLauncher {
  launch(env: Record<string, string>): EnumerationWorker
}

export interface SessionEnumeratorDeps {
  readonly launcher: EnumerationWorkerLauncher
  /** 待機。**注入する** — 実時間を待つテストを書かないため。 */
  readonly wait: (ms: number) => Promise<void>
  readonly now: () => number
  /** 親環境。**注入する** — グローバル参照は lint も検証スクリプトも素通りする。 */
  readonly parentEnv: Readonly<Record<string, string | undefined>>
  readonly cooldownMs?: number
  readonly maxCrashes?: number
}

function failure(reasonKey: FailureReason): EnumerationResult {
  return { ok: false, reasonKey }
}

/**
 * 要求を出してよいかを判定する (BE-025b / FR-008)。**純粋関数**である。
 *
 * 所在が `windows` なら確認済みの値は要らない。それ以外なら
 * **期限内であり、かつ同じディストロについての確認である**ことを要求する。
 *
 * **常駐プロセスでも要求ごとに掛ける。** ゲートの対象はプロセスの起動ではなく
 * **UNC へのアクセスを起こす行為**であり、それは要求ごとに起きる。
 */
export function checkLaunchAllowed(request: EnumerationRequest): FailureReason | null {
  if (request.target.location.kind === 'windows') return null
  if (request.verified === null) return 'distro-not-running'

  const namespace = request.target.configDir.namespace
  return checkVerified(request.verified, namespace, request.now).ok ? null : 'distro-not-running'
}

/**
 * 要求の行を組み立てる (C-2)。**純粋関数**であり、プロセスを起こさずに検証できる。
 *
 * **config ディレクトリは要求に載る** (AD-030 §2)。起動時の環境変数から外れたので、
 * 1 つのプロセスが複数の config ディレクトリを扱える。
 */
export function buildRequestLine(
  id: number,
  request: EnumerationRequest,
  configDir: string
): EnumerationRequestLine {
  return {
    kind: 'enumerate',
    version: PROTOCOL_VERSION,
    id,
    targetKey: request.target.key,
    configDir,
    scope: request.scope
  }
}

export interface SessionEnumeratorHandle extends SessionEnumerator {
  /**
   * 常駐プロセスを先に起こす (AD-030 §6)。
   *
   * **起動費用をアプリ起動時に払う。** 一覧を開く操作の費用を列挙だけにする。
   * 呼ばなくても動く — 最初の要求の時点で起こす (遅いが動く)。
   */
  warmUp(): void
  /** 常駐プロセスを終了させる。`before-quit` から呼ぶ (C-5)。 */
  dispose(): void
}

export function createSessionEnumerator(deps: SessionEnumeratorDeps): SessionEnumeratorHandle {
  const cooldownMs = deps.cooldownMs ?? ENUMERATION_COOLDOWN_MS
  const maxCrashes = deps.maxCrashes ?? MAX_CONSECUTIVE_CRASHES

  /** 実行中の要求。**同じ対象への並行要求はここに合流する** (C-6)。 */
  const inflight = new Map<string, Promise<EnumerationResult>>()
  /** 対象ごとの最終要求時刻。逐次の連打の間隔を測る。 */
  const lastStartedAt = new Map<string, number>()

  let worker: EnumerationWorker | null = null
  let crashes = 0
  let nextId = 1

  /**
   * **こちらから殺したワーカ** (pr-gate Round 1 / platform-boundary H-004)。
   *
   * timeout と送信失敗と `dispose` は `kill()` を呼ぶが、その `exit` は**後の tick で届く**。
   * 区別しないと `crashes` が増え、**3 回で列挙がアプリ寿命のあいだ恒久停止する** —
   * `crashes` が 0 に戻るのは応答が届いたときだけで、
   * ワーカを起こせなければ応答は永久に来ないためである。
   *
   * `ENUMERATION_TIMEOUT_MS` は SC-008 の全件予算と同値なので、
   * **予算ちょうどの所在は必ず timeout に当たる**。「遅い要求 3 件で機能停止」は
   * AD-030 §7 の「落ち続けるプロセスを起こし続けない」の意図ではない。
   */
  const intentionallyKilled = new Set<EnumerationWorker>()

  /**
   * **起こしたワーカ全部** (pr-gate Round 1 / platform-boundary H-003)。
   *
   * `dispose()` が `worker` 1 つしか見ないと、参照から外れたワーカが
   * **UNC ハンドルを掴んだ孤児として残る** (contracts C-5 違反)。
   * 「1 つしか無いはず」を前提にしない。
   */
  const spawned = new Set<EnumerationWorker>()

  /** 応答待ちの要求。**同時に 1 件だけ**である (AD-030 §3)。 */
  let pending: {
    readonly id: number
    readonly settle: (result: EnumerationResult) => void
  } | null = null

  /** 直列化の鎖。**次の要求は前の応答を待つ。** */
  let chain: Promise<unknown> = Promise.resolve()

  function handleLine(line: string): void {
    const response: EnumerationResponseLine | null = decodeResponse(line)
    const current = pending
    if (current === null || response === null) return
    /*
     * **識別子で突き合わせる。** `targetKey` では足りない —
     * 同じ対象への要求が続けて 2 回来ることがある (先頭ページ → 続き)。
     */
    if (response.id !== current.id) return

    crashes = 0
    if (response.kind === 'error') {
      current.settle(failure(response.reasonKey))
      return
    }
    current.settle({ ok: true, sessions: response.sessions, truncated: response.truncated })
  }

  /**
   * ワーカが終了した。
   *
   * **どのワーカが終わったかを見る** (pr-gate Round 1 / platform-boundary H-003)。
   * 見ないと次の順序で壊れる。
   *
   * 1. 要求 A が timeout → worker#1 を `kill()` → `worker = null` → A は失敗
   * 2. 鎖の次の要求 B → `ensureWorker()` が **worker#2 を起こす** → `pending = {B}`
   * 3. worker#1 の `exit` が届く → **worker#2 の参照を捨て**、
   *    **B を巻き添えで失敗**させ、worker#2 が孤児になる
   *
   * `UtilityProcess.kill()` の `exit` は後の tick で届くので、この順序は必ず起きうる。
   * 実機では「先頭ページが 2 回失敗する」形で現れる。
   */
  function handleExit(who: EnumerationWorker): void {
    spawned.delete(who)
    const wasIntentional = intentionallyKilled.delete(who)

    /* **現行でないワーカの終了は、現在の状態に触れない。** */
    if (worker !== who) return

    worker = null
    /*
     * **こちらから殺したものは crash に数えない** (platform-boundary H-004)。
     * timeout / 送信失敗 / `dispose` は異常終了ではない。
     */
    if (!wasIntentional) crashes += 1
    /*
     * **実行中だった要求はその要求の失敗にする** (AD-030 §7)。
     * 待ち行列に残っているものは、作り直した後のプロセスで処理される。
     */
    pending?.settle(failure('enumeration-failed'))
  }

  /** **意図して殺す。** crash と区別するための唯一の入口である。 */
  function killIntentionally(victim: EnumerationWorker): void {
    intentionallyKilled.add(victim)
    victim.kill()
  }

  function ensureWorker(): EnumerationWorker | null {
    if (worker !== null) return worker
    /*
     * **落ち続けるプロセスを起こし続けない** (AD-030 §7)。
     * 1 回でも応答が返れば数え直す (`handleLine`)。
     */
    if (crashes >= maxCrashes) return null

    /*
     * **親環境を渡す部分をここに閉じる。** 許可リストの適用は
     * `config-dir.ts` の純粋関数が行い、この 1 行だけが親環境に触れる。
     */
    const next = deps.launcher.launch(buildWorkerEnv(deps.parentEnv))
    next.onLine(handleLine)
    next.onExit(() => handleExit(next))
    spawned.add(next)
    worker = next
    return next
  }

  /** 1 件を送って応答を待つ。**呼び出しは鎖の中に限る** (直列化の担保)。 */
  async function exchange(request: EnumerationRequest): Promise<EnumerationResult> {
    const envValue = configDirEnvValue(request.target.configDir)
    if (!envValue.ok) return failure('enumeration-failed')

    const active = ensureWorker()
    if (active === null) return failure('enumeration-failed')

    const id = nextId
    nextId += 1

    return new Promise<EnumerationResult>((resolve) => {
      let settled = false
      let timer: ReturnType<typeof setTimeout> | null = null

      const settle = (result: EnumerationResult): void => {
        if (settled) return
        settled = true
        if (timer !== null) clearTimeout(timer)
        pending = null
        resolve(result)
      }

      pending = { id, settle }

      timer = setTimeout(() => {
        /*
         * **応答が来ない常駐プロセスは作り直す。**
         * 掴んだままにすると以降の要求が全部この 1 件に引っかかる。
         */
        killIntentionally(active)
        worker = null
        settle(failure('enumeration-failed'))
      }, request.timeoutMs)

      if (!active.send(encodeRequest(buildRequestLine(id, request, envValue.path)))) {
        /*
         * **書けなかったことを無視しない。** 相手のパイプが詰まっているか閉じている。
         * 黙って待つと timeout まで気付けない。
         */
        killIntentionally(active)
        worker = null
        settle(failure('enumeration-failed'))
      }
    })
  }

  async function start(request: EnumerationRequest): Promise<EnumerationResult> {
    const key = request.target.key

    /*
     * 逐次の連打に最小間隔を掛ける (C-6)。**拒否ではなく待たせる** —
     * 理由キーの語彙を増やさずに、要求の頻度だけを縛る。
     */
    const last = lastStartedAt.get(key)
    if (last !== undefined) {
      const elapsed = deps.now() - last
      if (elapsed < cooldownMs) await deps.wait(cooldownMs - elapsed)
    }
    lastStartedAt.set(key, deps.now())

    /*
     * **鎖に繋いで直列化する。** 前の要求の応答を待ってから次を送る。
     * これが config ディレクトリのレースを消している唯一の仕掛けである (AD-030 §3)。
     */
    const result = chain.then(() => exchange(request))
    chain = result.catch(() => undefined)
    return result
  }

  return {
    async enumerate(request: EnumerationRequest): Promise<EnumerationResult> {
      /*
       * **ゲートを最初に通す** (BE-025b)。探索 / 要求 / 追加取得の 3 つの入口のうち、
       * 要求と追加取得はどちらもこの関数を通る。
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

    warmUp(): void {
      ensureWorker()
    },

    dispose(): void {
      /*
       * **起こしたワーカ全部を殺す** (contracts C-5 / platform-boundary H-003)。
       * `worker` だけを見ると、参照から外れたものが
       * UNC ハンドルを掴んだ孤児として残る。
       */
      for (const victim of [...spawned]) killIntentionally(victim)
      worker = null
    }
  }
}
