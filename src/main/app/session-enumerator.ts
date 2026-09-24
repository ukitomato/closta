import {
  PROTOCOL_VERSION,
  decodeResponse,
  encodeRequest,
  type EnumerationRequestLine
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

/**
 * 実行中要求の合流鍵 (pr-gate Round 5 / PB4-002)。
 *
 * **対象と scope の組**で合流させる。scope が違えば返す件数が違うので、
 * `page` の結果を `all` の呼び出し元に渡してはならない。
 * 内部 Map 専用で境界を渡らないため区切りは自由。
 */
function inflightKey(request: EnumerationRequest): string {
  const scope = request.scope
  const scopePart = scope.kind === 'all' ? 'all' : `page:${scope.limit}:${scope.offset}`
  return `${request.target.key}\u0000${scopePart}`
}

export interface SessionEnumeratorHandle extends SessionEnumerator {
  /**
   * 常駐プロセスを先に起こす (AD-030 §6)。
   *
   * **起動費用をアプリ起動時に払う。** 一覧を開く操作の費用を列挙だけにする。
   * 呼ばなくても動く — 最初の要求の時点で起こす (遅いが動く)。
   */
  warmUp(): void
  /**
   * 常駐プロセスを終了させる。`before-quit` から呼ぶ (C-5)。
   *
   * @returns **殺せなかったワーカの数** (pr-gate Round 2 / H2-004)。
   * 通常は 0。0 でなければ UNC ハンドルを掴んだままのプロセスが残っている。
   * 呼び出し側が記録できるようにするために返す — この層は記録の経路を持たない。
   */
  dispose(): number
}

export function createSessionEnumerator(deps: SessionEnumeratorDeps): SessionEnumeratorHandle {
  const cooldownMs = deps.cooldownMs ?? ENUMERATION_COOLDOWN_MS
  const maxCrashes = deps.maxCrashes ?? MAX_CONSECUTIVE_CRASHES

  /**
   * 実行中の要求。**同じ対象への同じ scope の並行要求だけがここに合流する**
   * (C-6 / pr-gate Round 5 / PB4-002)。
   *
   * 鍵に scope を含めないと、飛行中の `page` 要求に `all` 要求が合流し、
   * **先頭ページだけの結果が `all` として `complete: true` で確定**した
   * (FR-037 / FR-004 / SC-006 を破る)。鍵は内部 Map 専用で境界を渡らない。
   */
  const inflight = new Map<string, Promise<EnumerationResult>>()
  /** 対象ごとの最終要求時刻。逐次の連打の間隔を測る。 */
  const lastStartedAt = new Map<string, number>()

  /**
   * ワーカ 1 台の状態 (pr-gate Round 4 / 不変条件 3)。
   *
   * ## なぜ 1 つに畳んだか
   *
   * Round 1〜3 のあいだ、ワーカの生死は `worker` / `crashes` /
   * `intentionallyKilled` / `spawned` / `disposed` の 5 変数に散っていた。
   * crash の計上が**そのうち 2 つを読む条件式**で決まっており、
   * Round 2 で「現行かどうかに関わらず数える」と
   * 「殺せなかったら監視をやめる」を同時に入れた結果、
   * **送信失敗 3 回で列挙がアプリ寿命のあいだ止まる**退行が入った
   * (pr-gate Round 3 / H3-002。A/B 実行で再現)。
   *
   * 2 つの変更はそれぞれ正しく、**組み合わせだけが誤っていた**。
   * 状態を 1 つにして、crash を**単一の遷移の上で**定義する。
   *
   * ## 遷移表
   *
   * | from | 事象 | to | crash |
   * |---|---|---|---|
   * | — | spawn | `live` | 0 |
   * | `live` | `kill()` が true | `ending` | 0 |
   * | `live` | `kill()` が false | `ended` (追跡をやめる) | 0 |
   * | **`live`** | **exit 到着** | **`ended`** | **+1** |
   * | `ending` | exit 到着 | `ended` | 0 |
   * | `ending` | kill | `ending` (no-op) | 0 |
   * | `ended` / 未追跡 | exit 到着 | 無視 | 0 |
   *
   * **crash が増える遷移は 1 つだけである。** これを `session-enumerator.test.ts` の
   * 遷移表テストが固定している。
   *
   * ## 「現行かどうか」を条件から外せる理由
   *
   * `ensureWorker` が新しく起こすのは `current` が `live` でないときだけなので、
   * **`live` なワーカは常に高々 1 台**である。したがって `live → exit` は
   * 定義上つねに現行の異常終了であり、Round 2 が悩んだ
   * 「現行でないワーカの crash を数えるべきか」という問いは生じない。
   */
  type WorkerState = 'live' | 'ending' | 'ended'

  interface Tracked {
    readonly worker: EnumerationWorker
    state: WorkerState
  }

  /** 追跡中のワーカ。`ended` になった時点で外す。 */
  const tracked = new Map<EnumerationWorker, Tracked>()
  /** 要求を送ってよいワーカ。`live` のものだけがここに入る。 */
  let current: Tracked | null = null
  let crashes = 0
  let nextId = 1

  /**
   * 破棄済みか (pr-gate Round 2 / H2-004 / contracts C-5)。
   *
   * **ワーカの状態ではなく列挙器の状態**なので `Tracked` に畳まない。
   * `before-quit` の時点で鎖に要求が残っていると `ensureWorker()` に進み、
   * 殺す主体がいないのに新しいプロセスを起こしてしまう。
   */
  let disposed = false

  /** `exit` を受けた。**crash を数える唯一の場所である。** */
  function handleExit(who: EnumerationWorker): void {
    const entry = tracked.get(who)
    /* 未追跡 = 既に `ended`。何もしない。 */
    if (entry === undefined) return

    const wasLive = entry.state === 'live'
    entry.state = 'ended'
    tracked.delete(who)

    /*
     * **予期せず落ちたときだけ数える。**
     * `ending` はこちらから殺したものであり、timeout / 送信失敗 / `dispose` が該当する。
     */
    if (wasLive) crashes += 1

    if (current === entry) {
      current = null
      /*
       * **実行中だった要求はその要求の失敗にする** (AD-030 §7)。
       * 待ち行列に残っているものは、作り直した後のプロセスで処理される。
       */
      pending?.settle(failure('enumeration-failed'))
    }
  }

  /**
   * **意図して殺す。** crash と区別するための唯一の入口である。
   *
   * `kill()` の戻り値を捨てない (contracts C-5)。`false` なら `exit` は届かないので、
   * 待ち続けずに追跡から外す — 残すと「監視しているつもりの孤児」を抱える。
   *
   * @returns `exit` の到着を待てる状態にできたか。`false` なら終了を確認できない。
   */
  function killIntentionally(entry: Tracked): boolean {
    /* `ending` / `ended` への二重 kill は何もしない。 */
    if (entry.state !== 'live') return entry.state === 'ending'

    entry.state = 'ending'
    if (entry.worker.kill()) return true

    /*
     * `exit` が来ない以上、`ended` へ進める主体が他にいない。
     *
     * **追跡から外すのは地図を伸ばし続けないためである。** 状態が 1 つになったので、
     * 残しても crash の計上は狂わない (`ending` からの遷移は数えない)。
     * つまりこの `delete` は公開 API から観測できない — 変異させてもテストは緑のままである。
     * **観測できないと分かったうえで残している。**
     */
    entry.state = 'ended'
    tracked.delete(entry.worker)
    if (current === entry) current = null
    return false
  }

  /** 応答待ちの要求。**同時に 1 件だけ**である (AD-030 §3)。 */
  let pending: {
    readonly id: number
    readonly settle: (result: EnumerationResult) => void
  } | null = null

  /** 直列化の鎖。**次の要求は前の応答を待つ。** */
  let chain: Promise<unknown> = Promise.resolve()

  function handleLine(line: string): void {
    const decoded = decodeResponse(line)
    const waiting = pending
    if (waiting === null) return

    /*
     * **形が不正な応答はその場で決着させる** (pr-gate Round 4 / 不変条件 2 / H3-003)。
     *
     * 以前は解釈できない行を黙って捨てていた。その結果、子が壊れた応答を返すと
     * \`pending\` が決着せず **\`ENUMERATION_TIMEOUT_MS\` (10 秒) まで宙づり**になり、
     * 直列化されているぶん後続の所在もまるごと待たされた。
     *
     * **決着させるのは識別子が読めた行だけである**
     * (pr-gate Round 4 / A4-008 / PB4-007)。
     *
     * 初版は「JSON オブジェクトとして読めたか」で雑音と不正応答を分け、
     * 識別子が読めない行でも決着させていた。根拠は
     * 「雑音が JSON オブジェクトである見込みは薄い」だったが、**これは実測していない前提**である。
     *
     * 実際には `enumerator-spawner` が \`parentPort\` と \`stdout\` の**両方**を購読し続ける。
     * Electron 下で応答が載るのは \`parentPort\` なので、
     * **\`stdout\` は雑音専用チャネルとして生きている** — 子は Agent SDK を
     * 第三者コードとして実行しており、その依存が構造化ログを 1 行吐けば \`{...}\` である。
     * 実測で \`{}\` も \`{"level":"info"}\` も \`malformed(id: null)\` になり、
     * **ログ 1 行で当該所在が \`failed\` になっていた**。
     *
     * H3-003 (10 秒宙づり) が実害としていたのは「**我々が送った \`id\` を echo する
     * 壊れた応答**」であり、識別子の照合だけで覆える。
     * 識別子が読めない行は雑音と同じく無視する。
     */
    if (decoded.kind === 'malformed') {
      if (decoded.id !== waiting.id) return
      waiting.settle(failure('enumeration-failed'))
      return
    }
    if (decoded.kind === 'not-a-response') return

    const response = decoded.value
    /*
     * **識別子で突き合わせる。** `targetKey` では足りない —
     * 同じ対象への要求が続けて 2 回来ることがある (先頭ページ → 続き)。
     */
    if (response.id !== waiting.id) return

    crashes = 0
    if (response.kind === 'error') {
      waiting.settle(failure(response.reasonKey))
      return
    }
    waiting.settle({ ok: true, sessions: response.sessions, truncated: response.truncated })
  }

  /** `EnumerationWorker` から追跡項目を引いて殺す。呼び出し側は `Tracked` を知らない。 */
  function killEntry(victim: EnumerationWorker): void {
    const entry = tracked.get(victim)
    if (entry !== undefined) killIntentionally(entry)
  }

  function ensureWorker(): EnumerationWorker | null {
    /* **破棄後は起こさない** (H2-004)。殺す主体がもういない。 */
    if (disposed) return null
    if (current !== null && current.state === 'live') return current.worker
    /*
     * **落ち続けるプロセスを起こし続けない** (AD-030 §7)。
     * 1 回でも応答が返れば数え直す (`handleLine`)。
     */
    if (crashes >= maxCrashes) return null

    /*
     * **親環境を渡す部分をここに閉じる。** 許可リストの適用は
     * `config-dir.ts` の純粋関数が行い、この 1 行だけが親環境に触れる。
     */
    const worker = deps.launcher.launch(buildWorkerEnv(deps.parentEnv))
    /*
     * **起こした直後に追跡へ入れる** (pr-gate Round 2 / H2-004 / contracts C-5)。
     * `onLine` は `stdio` の指定が効いていないとき throw するが、
     * その時点で `fork` は既に成功している。配線の後で登録すると、
     * どこからも参照されない子プロセスが `dispose()` の対象から漏れる。
     */
    const entry: Tracked = { worker, state: 'live' }
    tracked.set(worker, entry)
    try {
      worker.onLine(handleLine)
      worker.onExit(() => handleExit(worker))
    } catch {
      /*
       * **配線できない子は自分で片付ける。** 例外を上へ投げると
       * `enumerate()` から rejection として抜け、FR-030 の
       * 「失敗は理由キーで行に落とす」を破る。呼び出し側は `null` を失敗として扱う。
       */
      killIntentionally(entry)
      return null
    }
    current = entry
    return worker
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
        /*
         * **`current` は `killIntentionally` が状態遷移の中で片付ける**
         * (pr-gate Round 4 / 不変条件 3)。ここで `worker = null` を書いていたのが
         * crash 計上の条件と噛み合って恒久停止の退行になった (H3-002)。
         */
        killEntry(active)
        settle(failure('enumeration-failed'))
      }, request.timeoutMs)

      if (!active.send(encodeRequest(buildRequestLine(id, request, envValue.path)))) {
        /*
         * **書けなかったことを無視しない。** 相手のパイプが詰まっているか閉じている。
         * 黙って待つと timeout まで気付けない。
         */
        killEntry(active)
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

      const key = inflightKey(request)
      const existing = inflight.get(key)
      if (existing !== undefined) return existing

      const promise = start(request).finally(() => {
        inflight.delete(key)
      })
      inflight.set(key, promise)
      return promise
    },

    warmUp(): void {
      ensureWorker()
    },

    dispose(): number {
      /*
       * **追跡中のワーカ全部を殺す** (contracts C-5 / platform-boundary H-003)。
       * `current` だけを見ると、参照から外れたものが
       * UNC ハンドルを掴んだ孤児として残る。
       *
       * @returns **終了を確認できない台数**。`kill()` が `false` を返したものが該当する
       * (`exit` が届かないので `ended` を確認する手段が無い)。
       * 0 でなければ UNC ハンドルを掴んだままのプロセスが残っている。
       */
      disposed = true
      let unconfirmed = 0
      for (const entry of [...tracked.values()]) {
        if (!killIntentionally(entry)) unconfirmed += 1
      }
      current = null
      return unconfirmed
    }
  }
}
