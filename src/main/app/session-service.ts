import type { RuntimeDescriptor, WslRuntimeDescriptor } from '@domain/runtime/descriptor'
import { isHostNamespace, type WslNamespaceId } from '@domain/runtime/namespace'
import { BROWSE_SESSION_TTL_MS, type VerifiedRunning } from '@domain/runtime/verified-running'
import { buildSessionSummary } from '@domain/session/build'
import type { SessionIndexDTO } from '@domain/session/dto'
import { groupSessions, type MatchedSession, type SessionGroup } from '@domain/session/group'
import type {
  EnumerationScope,
  EnumerationTargetFinder,
  SessionEnumerator
} from '@domain/session/interfaces'
import { matchFolder } from '@domain/session/match'
import type { SessionSummary } from '@domain/session/summary'
import {
  enumerationTargetKey,
  targetOutcome,
  unreachableOutcome,
  type EnumerationOutcome,
  type EnumerationTarget,
  type TargetOutcome
} from '@domain/session/target'
import { SESSION_PAGE_SIZE } from '@domain/validation'
import type { WorkspaceFolder } from '@domain/workspace/folder'
import { resolveFolderRuntime } from '@domain/workspace/resolution'

import { toEnumerationOutcomeDTOs, toSessionGroupDTO } from './dto-mapper'
import type { Measure } from './measure'
import { ENUMERATION_TIMEOUT_MS } from './session-enumerator'

/**
 * セッション一覧の調停 (BE-026 / data-model §7 / FR-030 〜 FR-038)。
 *
 * | 規則 | 根拠 |
 * |---|---|
 * | **ディスクに書かない。** キャッシュはプロセスの寿命 | FR-036 / SC-014 / R-10 |
 * | **自動で遷移しない。** ポーリングもファイル監視もしない | FR-033 / R-10 |
 * | 再取得は**置き換え**であり、マージしない | FR-035 |
 * | 1 つの所在の失敗を**他に波及させない** | FR-030 / SC-007 |
 * | `partial` のあいだ件数を確定値として見せない | FR-037 |
 * | **登録の変更では再列挙しない。** 対応づけだけをやり直す | data-model §7 |
 * | 取得時刻を**必ず提示する** | FR-034 / SC-012 |
 *
 * **停止中の所在も 1 行として残す** (FR-007 / FR-008)。探索も起動も発行しないが、
 * 行を落とすと利用者に「未列挙である」ことを示せない。
 */

/*
 * 列挙 1 件あたりの上限時間は `session-enumerator.ts` が持つ (C-5)。
 *
 * **ここで別の値を宣言していた。** 同じ名前の定数が 2 箇所にあり、
 * 実際に効くのは呼び出し側であるこちらだった —
 * AD-030 で待ち時間を 10 秒に詰めたつもりが、実機では 15 秒で待っていた。
 * 上限時間を決めるのは待ち行列と作り直しを持つ側であるべきなので、
 * 宣言をそちらに一本化して import する。
 */

export interface SessionService {
  /**
   * キャッシュがあれば返し、無ければ**先頭ページ**を取る。
   *
   * **先頭ページを返したあと、同じ操作の続きとして全件を取る** (FR-031 / R-06)。
   * 完了は `onChanged` で届く。**ポーリングではない** — 利用者の 1 操作に対する
   * 2 段の応答である (data-model §7 の `partial → complete`)。
   */
  list(): Promise<SessionIndexDTO>
  /** 利用者の明示操作。**置き換える** (FR-035)。 */
  refresh(): Promise<SessionIndexDTO>
  /** 続きを取る。**未知の `targetKey` はキャッシュをそのまま返す** (FR-038)。 */
  fetchMore(targetKey: string, offset: number): Promise<SessionIndexDTO>
  /**
   * 未信頼入力の照合に使う `targetKey` の集合 (FR-043)。
   *
   * **行として出したものすべてを含む** — 停止中の所在の `key` も入る。
   * 境界に出した `key` を照合の集合から外すと、
   * 「既知の `key` + 停止中」という SC-002 / SC-010 の経路が
   * 「未知の `key`」として処理され、測りたいものが測れない。
   */
  targetKeys(): readonly string[]
  /** 登録フォルダが変わった。**再列挙せず対応づけだけをやり直す。** */
  onFoldersChanged(): SessionIndexDTO
  /** ランタイムが変わった。対応づけのメモ化を破棄してやり直す。 */
  onRuntimesChanged(): SessionIndexDTO
  onChanged(listener: (index: SessionIndexDTO) => void): () => void
}

export interface SessionServiceDeps {
  readonly finder: EnumerationTargetFinder
  readonly enumerator: SessionEnumerator
  /** 検出済み descriptor の現在値。**R-2 は新たに検出しない** (C-7)。 */
  readonly runtimes: () => readonly RuntimeDescriptor[]
  /** 登録フォルダの現在値。**グループの生成源の片方**である (FR-051)。 */
  readonly folders: () => readonly WorkspaceFolder[]
  /** 実行中確認。**R-1 の経路をそのまま使う** (C-7。`wsl.exe` を新たに呼ばない)。 */
  readonly verifyRunning: () => Promise<ReadonlyMap<WslNamespaceId, VerifiedRunning>>
  /** ホストのホームディレクトリ。composition root が `app.getPath('home')` から渡す。 */
  readonly hostHome: () => ReturnType<EnumerationTargetFinder['hostTarget']> extends never
    ? never
    : Parameters<EnumerationTargetFinder['hostTarget']>[0]
  readonly now: () => number
  readonly measure: Measure
}

/** 1 つの所在の結果。**行と、対象ごとのセッションを分けて返す。** */
interface LocationResult {
  readonly outcome: EnumerationOutcome
  readonly collected: readonly {
    readonly target: EnumerationTarget
    readonly sessions: readonly SessionSummary[]
  }[]
}

/** 1 つの列挙対象から取れたセッションと、その行。 */
interface TargetResult {
  readonly target: EnumerationTarget | null
  readonly outcome: TargetOutcome
  readonly sessions: readonly SessionSummary[]
}

export function createSessionService(deps: SessionServiceDeps): SessionService {
  const listeners = new Set<(index: SessionIndexDTO) => void>()

  /*
   * 実行中確認の結果。**R-1 のブラウズと同じ有効期間で持ち回す** (`BROWSE_SESSION_TTL_MS`)。
   *
   * **毎回取り直さない理由は費用である。** `wsl.exe` の呼び出しは固定で約 1.5 秒かかる
   * (AD-015)。一覧を開くたびに払うと、先頭 50 件の列挙 (実測 1.8 秒) と合わせて
   * SC-008 の 2 秒予算を確実に超える。
   *
   * **持ち回してよい根拠は値の側にある。** `VerifiedRunning` は確認時刻を保持し、
   * `checkVerified` がアクセス直前に期限を検査する。
   * 有効期間内に実体が停止する窓は残るが、これは **R-1 が §5 で明示的に受け入れた残余**
   * と同じものである (窓を消すには操作ごとに確認を発行するほかなく、予算と両立しない)。
   */
  let verifiedCache: ReadonlyMap<WslNamespaceId, VerifiedRunning> = new Map()
  let verifiedAt = 0

  async function verified(): Promise<ReadonlyMap<WslNamespaceId, VerifiedRunning>> {
    if (deps.now() - verifiedAt <= BROWSE_SESSION_TTL_MS && verifiedCache.size > 0) {
      return verifiedCache
    }
    verifiedCache = await deps.verifyRunning()
    verifiedAt = deps.now()
    return verifiedCache
  }

  /** 列挙対象の現在値。`fetchMore` が `targetKey` から引くために保持する。 */
  let targets: readonly EnumerationTarget[] = []
  /** 対象ごとのセッション。**再取得で置き換える** (FR-035)。 */
  let sessionsByTarget = new Map<string, readonly SessionSummary[]>()
  let outcomes: readonly EnumerationOutcome[] = []
  let groups: readonly SessionGroup[] = []
  let fetchedAt = 0
  let complete = false
  let loaded = false

  /**
   * 対応づけの解決のメモ化 (data-model §4 の不変条件)。
   *
   * **ランタイムが変わったら捨てる。** capability 判定の完了で `pathMapping` が
   * 現れた所在は、**再列挙なしに**「保留」から確定へ移れる。
   */
  let resolutionCache = new Map<string, ReturnType<typeof resolveFolderRuntime>>()

  function resolve(
    input: Parameters<typeof resolveFolderRuntime>[0]
  ): ReturnType<typeof resolveFolderRuntime> {
    const key = `${input.folder.id}\u0000${input.runtime.id}`
    const hit = resolutionCache.get(key)
    if (hit !== undefined) return hit
    const value = resolveFolderRuntime(input)
    resolutionCache.set(key, value)
    return value
  }

  /** 検出済みディストロ名の集合。**出自判定が完全一致で照合する。** */
  function detectedDistros(): ReadonlySet<string> {
    const names = new Set<string>()
    for (const runtime of deps.runtimes()) {
      if (runtime.kind === 'wsl') names.add(runtime.distroName)
    }
    return names
  }

  /**
   * 対応づけとグループ分けをやり直す。
   *
   * **列挙をしない。** 登録フォルダの増減もランタイムの変化も、
   * 「既に取ったセッションをどう束ねるか」だけを変える (data-model §7)。
   */
  function regroup(): void {
    const folders = deps.folders()
    const runtimes = deps.runtimes()
    const matched: MatchedSession[] = []

    for (const sessions of sessionsByTarget.values()) {
      for (const session of sessions) {
        matched.push({
          session,
          match: matchFolder({ origin: session.origin, folders, runtimes, resolve })
        })
      }
    }

    groups = groupSessions({ folders, matched })
  }

  /**
   * 先頭ページのあとに全件を取る (BE-070)。
   *
   * **同時に 1 本だけ走らせる。** 画面を開き直すたびに走らせると、
   * 同じ対象へ子プロセスが重なる (列挙器の束ねが効くのは同じ対象への並行要求だけで、
   * ここは所在をまたぐ)。
   */
  let completing = false

  /** 実行中の先頭ページ取得。**完了前の 2 本目はここに合流する。** */
  let firstPage: Promise<SessionIndexDTO> | null = null

  async function completeInBackground(): Promise<void> {
    if (completing || complete) return
    completing = true
    try {
      await deps.measure('list-sessions-all', () => fetchAll({ kind: 'all' }))
      publish()
    } finally {
      completing = false
    }
  }

  function snapshot(): SessionIndexDTO {
    return {
      groups: groups.map(toSessionGroupDTO),
      outcomes: outcomes.flatMap(toEnumerationOutcomeDTOs),
      fetchedAt,
      complete
    }
  }

  function publish(): SessionIndexDTO {
    const index = snapshot()
    for (const listener of listeners) listener(index)
    return index
  }

  /** 1 つの列挙対象を列挙する。**失敗は行に落とし、例外にしない** (FR-030)。 */
  async function enumerateTarget(
    target: EnumerationTarget,
    verified: VerifiedRunning | null,
    scope: EnumerationScope
  ): Promise<TargetResult> {
    const result = await deps.enumerator.enumerate({
      target,
      scope,
      timeoutMs: ENUMERATION_TIMEOUT_MS,
      verified,
      now: deps.now()
    })

    if (!result.ok) {
      return {
        target,
        outcome: targetOutcome(target, 'failed', result.reasonKey, 0, false),
        sessions: []
      }
    }

    const distros = detectedDistros()
    const sessions = result.sessions.map((record) =>
      buildSessionSummary({ record, target, detectedDistros: distros })
    )

    return {
      target,
      outcome: targetOutcome(target, 'ok', null, sessions.length, result.truncated),
      sessions
    }
  }

  /**
   * 所在ごとに探索して列挙する。**1 所在の失敗が他を消さない** (SC-007)。
   *
   * **所在も対象も直列に処理する** (contracts C-6 / AD-030 §1)。
   * 初版は並行に走らせていたが取り消した — 列挙は**常駐 1 プロセス**が
   * 要求を直列に処理するため、呼び出し側で重ねても待ち行列に並ぶだけである。
   * 並行に子プロセスを起こしていた頃は**並行のほうが遅かった**
   * (WSL 単独 4,193 ms がホストと同時だと 10,470 ms)。
   *
   * **届いた所在から画面へ流す** (SC-008 / 2026-09-18 の人間判断)。
   * 全所在ぶんが揃うのを待つと、WSL 1 所在あたり 1.3〜1.6 秒の UNC I/O が積み上がり、
   * **所在が増えるだけで 2 秒予算を超える** (実測: 3 所在で 4,537 ms)。
   * 並行化では解決しない (上記のとおり遅くなる) ので、**描画の開始点を前に出す**。
   *
   * **結果の順序は所在の順に固定する。** 完了順に並べると、
   * 取得のたびに行の順番が変わって利用者が同じ行を同じ位置で探せない。
   *
   * @param onFirstRows 先頭 50 件が画面に届いた時点で呼ぶ。SC-008 の計測点の終端である。
   */
  async function fetchAll(scope: EnumerationScope, onFirstRows?: () => void): Promise<void> {
    const at = deps.now()

    /*
     * ── 第 1 相: 探索 ──────────────────────────────────────────
     *
     * **列挙と分ける。** 分けないと内訳が計れず、予算を超えたときに
     * どこが重いのか分からない (R-1 が `probe-batch-verify` / `probe-batch-run` を
     * 分けたのと同じ理由)。
     *
     * **所在 `windows` の探索は実行中確認を待たない。**
     * ホストに確認は要らないので、`wsl.exe` の固定費 (約 1.2 秒) と重ねられる。
     */
    const discovered = await deps.measure('list-sessions-discover', async () => {
      const hostWork = deps.finder
        .hostTarget(deps.hostHome())
        .then((discovery) => ({ location: { kind: 'windows' } as const, discovery, running: null }))

      const verifiedMap = await deps.measure('list-sessions-verify', () => verified())

      const wslWork = deps
        .runtimes()
        .filter((runtime): runtime is WslRuntimeDescriptor => runtime.kind === 'wsl')
        .map(async (wsl) => {
          const location = { kind: 'wsl', distroName: wsl.distroName } as const
          const running = verifiedMap.get(wsl.id) ?? null

          /*
           * **停止中なら探索も起動も発行しないが、行は作る** (FR-007 / FR-008)。
           * 行を落とすと (a) 「未列挙である」ことを示せず、
           * (b) 「既知の `key` + 停止中」という SC-002 / SC-010 の経路が踏めない。
           */
          if (running === null) return { location, discovery: null, running: null }

          return {
            location,
            discovery: await deps.finder.wslTargets(wsl, running, deps.now()),
            running
          }
        })

      return [await hostWork, ...(await Promise.all(wslWork))]
    })

    /*
     * ── 第 2 相: 列挙 ──────────────────────────────────────────
     *
     * **所在の順に直列で回す** (contracts C-6 / AD-030 §1)。
     * 列挙は常駐 1 プロセスが直列に処理するため、ここで重ねても待ち行列に並ぶだけである。
     */

    /*
     * **まだ何も出ていないときだけ段階的に出す。**
     * 一覧が既に出ている状態で段階反映すると、行がいったん減ってから増える —
     * 全件取得と `refresh` は**置き換え**でなければならない (FR-035)。
     */
    const progressive = !loaded

    const nextTargets: EnumerationTarget[] = []
    const nextSessions = new Map<string, readonly SessionSummary[]>()
    const nextOutcomes: EnumerationOutcome[] = []
    let shown = 0

    await deps.measure('list-sessions-enumerate', async () => {
      for (const entry of discovered) {
        const result =
          entry.discovery === null
            ? {
                outcome: unreachableOutcome(entry.location, 'distro-not-running', at),
                collected: []
              }
            : await measuredLocation(entry.location, entry.discovery, entry.running, scope, at)

        for (const { target, sessions } of result.collected) {
          nextTargets.push(target)
          nextSessions.set(target.key, sessions)
          shown += sessions.length
        }
        nextOutcomes.push(result.outcome)

        if (!progressive) continue

        /*
         * **所在 1 件ぶんを画面へ流す。** 残りの所在はまだ行を持たないが、
         * `complete: false` が「出そろっていない」ことを運ぶ (FR-037)。
         * 停止中の所在の行を落とさない保証 (FR-007 / FR-008) は**出そろった時点**の
         * 話であり、途中の状態はそれを壊さない。
         */
        commit(nextTargets, nextSessions, nextOutcomes, at, scope, false)
        publish()

        /*
         * **先頭 50 件が出そろった時点が SC-008 の言う描画である。**
         * 何度呼んでも構わない — 受け側は解決済みの約束を無視する。
         */
        if (shown >= SESSION_PAGE_SIZE) onFirstRows?.()
      }
    })

    commit(nextTargets, nextSessions, nextOutcomes, at, scope, true)
    loaded = true

    /* **50 件に届かなくても終端は打つ。** 打たないと計測が永久に開いたままになる。 */
    onFirstRows?.()
  }

  /**
   * 1 所在の全件取得を**所在ごとに**計測する (SC-008)。
   *
   * **合計では測らない。** SC-008 が定めているのは 1 所在あたりであり、
   * 合計に予算を与えると所在が増えるだけで超過を報告する
   * (実測: 3 所在合計 11,023 ms に対し、最大の 1 所在は 277 件で約 7 秒)。
   *
   * 先頭ページの取得には SC-008 の全件予算が当たらないので計測点を置かない
   * — 置くと別の計測点の予算を流用したことになる (`measure.ts` の規則 (2))。
   */
  async function measuredLocation(
    location: EnumerationOutcome['location'],
    discovery: Awaited<ReturnType<EnumerationTargetFinder['wslTargets']>>,
    running: VerifiedRunning | null,
    scope: EnumerationScope,
    at: number
  ): Promise<LocationResult> {
    const run = (): Promise<LocationResult> =>
      collectLocation(location, discovery, running, scope, at)

    return scope.kind === 'all' ? deps.measure('list-sessions-all-location', run) : run()
  }

  /**
   * 積み上げた結果を現在値にする。**所在の順のまま写す。**
   *
   * @param done 全所在を回し終えたか。**途中の反映で `complete` を立ててはならない** —
   *   件数を確定値として見せることになる (FR-037)。
   */
  function commit(
    nextTargets: readonly EnumerationTarget[],
    nextSessions: ReadonlyMap<string, readonly SessionSummary[]>,
    nextOutcomes: readonly EnumerationOutcome[],
    at: number,
    scope: EnumerationScope,
    done: boolean
  ): void {
    targets = [...nextTargets]
    sessionsByTarget = new Map(nextSessions)
    outcomes = [...nextOutcomes]
    fetchedAt = at
    complete = done && scope.kind === 'all'
    regroup()
  }

  /**
   * 1 つの所在の探索結果を列挙して行に畳む。
   *
   * **候補ごとの失敗も行として残す** (FR-030)。
   * `.claude` が 1 件も無い所在は `no-history` の行を 1 つ作る — **失敗ではない** (FR-012)。
   */
  async function collectLocation(
    location: EnumerationOutcome['location'],
    discovery: Awaited<ReturnType<EnumerationTargetFinder['wslTargets']>>,
    running: VerifiedRunning | null,
    scope: EnumerationScope,
    at: number
  ): Promise<LocationResult> {
    /*
     * **候補も直列に列挙する** (C-6 / AD-030 §1)。
     * 列挙は常駐 1 プロセスが直列に処理するため、ここで重ねても待ち行列に並ぶだけである。
     *
     * **呼び出し側の配列を書かない。** 結果を返し、組み立ては呼び出し側が所在の順で行う。
     */
    const collected: TargetResult[] = []
    for (const target of discovery.targets) {
      collected.push(await enumerateTarget(target, running, scope))
    }

    const rows: TargetOutcome[] = collected.map((result) => result.outcome)

    /*
     * 候補ごとの失敗。**対象を作れなかったので `configDir` は `null`** である
     * (推測で埋めると「探索した」と読める値ができる)。
     */
    for (const [index, issue] of discovery.issues.entries()) {
      rows.push({
        key: enumerationTargetKey(location, discovery.targets.length + index),
        location,
        label: issue.label,
        configDir: null,
        status: 'failed',
        reasonKey: issue.reasonKey,
        count: 0,
        truncated: false
      })
    }

    if (rows.length === 0) {
      rows.push({
        key: enumerationTargetKey(location, 0),
        location,
        label: '',
        configDir: null,
        status: 'no-history',
        reasonKey: null,
        count: 0,
        truncated: false
      })
    }

    return {
      outcome: { location, outcomes: rows, fetchedAt: at },
      collected: collected.flatMap((result) =>
        result.target === null ? [] : [{ target: result.target, sessions: result.sessions }]
      )
    }
  }

  return {
    async list(): Promise<SessionIndexDTO> {
      /*
       * **キャッシュヒットも計測する** (SC-008 の 100 ミリ秒)。
       * 計測点を置かないと「速いはず」を確かめる手段が無い。
       */
      if (loaded) return deps.measure('list-sessions-cached', async () => snapshot())

      /*
       * **同時に走る要求を束ねる。**
       * `loaded` は取得の**完了後**に立つので、完了前の 2 本目はキャッシュに当たらない。
       * 開発ビルドの二重 effect で実際に 2 本走り、**先頭ページの取得が 2 回**起きた
       * (実測: 7,743 ms と 7,390 ms が並んだ)。
       * 列挙器の束ねは同じ対象への並行要求にしか効かず、ここは所在をまたぐ。
       */
      if (firstPage !== null) return firstPage

      /*
       * **SC-008 の「描画」は先頭 50 件が画面に届いた時点で測る**
       * (2026-09-18 の人間判断)。所在ごとの段階描画にしたため、
       * 全所在ぶんが揃うまでを測ると所在が増えるだけで予算を超える。
       *
       * `deps.measure` は呼んだ時点で計り始めるので、**探索を含む**。
       * 終端は `fetchAll` が呼び返す。待たないのは、この計測が
       * 先頭ページの取得そのものを遅らせてはならないためである。
       */
      let reachedFirstRows = (): void => {}
      void deps.measure(
        'list-sessions-first-rows',
        () =>
          new Promise<void>((resolve) => {
            reachedFirstRows = resolve
          })
      )

      firstPage = deps
        .measure('list-sessions-first-page', () =>
          fetchAll({ kind: 'page', limit: SESSION_PAGE_SIZE, offset: 0 }, () => reachedFirstRows())
        )
        .then(() => publish())
        .finally(() => {
          /* **例外で抜けても終端を打つ。** 打たないと計測が開いたままになる。 */
          reachedFirstRows()
          firstPage = null
        })

      const first = await firstPage

      /*
       * **全件は待たない。** 先頭ページを返してから続けて取り、`onChanged` で通知する
       * (FR-031 / FR-037)。待つと先頭描画が全件の所要時間 (実測 3.3 秒) に縛られる。
       *
       * **失敗しても先頭ページを壊さない。** 例外は握らずに理由を行へ落とすのは
       * `fetchAll` の側であり、ここに来るのは想定外の例外だけである。
       */
      void completeInBackground()
      return first
    },

    async refresh(): Promise<SessionIndexDTO> {
      // **置き換えである** (FR-035)。前回の結果とマージしない。
      await deps.measure('list-sessions-all', () => fetchAll({ kind: 'all' }))
      return publish()
    },

    async fetchMore(targetKey: string, offset: number): Promise<SessionIndexDTO> {
      const target = targets.find((candidate) => candidate.key === targetKey)
      /*
       * **未知の `targetKey` はキャッシュをそのまま返す。**
       * 例外にしない — renderer は未信頼であり (AD-023)、
       * 登録解除と再取得が交差しただけでも未知の値が来る。
       */
      if (target === undefined) return snapshot()

      const verified = await verifiedFor(target)
      const result = await deps.measure('fetch-more-sessions', () =>
        enumerateTarget(target, verified, { kind: 'page', limit: SESSION_PAGE_SIZE, offset })
      )

      if (result.outcome.status === 'ok') {
        const existing = sessionsByTarget.get(targetKey) ?? []
        /*
         * **続きの取得だけはマージする。** `refresh` の置き換えとは別の操作である
         * (FR-038)。同じセッションが 2 度来たら後勝ちにせず、**行の同一性で畳む**。
         */
        const merged = new Map(existing.map((session) => [session.sessionId, session]))
        for (const session of result.sessions) merged.set(session.sessionId, session)
        sessionsByTarget.set(targetKey, [...merged.values()])
      }

      outcomes = outcomes.map((outcome) => ({
        ...outcome,
        outcomes: outcome.outcomes.map((row) =>
          row.key === targetKey ? rowAfterFetchMore(row, result) : row
        )
      }))
      regroup()
      return publish()
    },

    targetKeys(): readonly string[] {
      return outcomes.flatMap((outcome) => outcome.outcomes.map((row) => row.key))
    },

    onFoldersChanged(): SessionIndexDTO {
      // **再列挙しない** (data-model §7)。対応づけだけをやり直す。
      regroup()
      return publish()
    },

    onRuntimesChanged(): SessionIndexDTO {
      /*
       * **メモ化を破棄する。** capability 判定の完了で `pathMapping` が現れた所在は、
       * 再列挙なしに「保留」から `folder` / `unregistered` へ確定できる。
       * 破棄しないと、前回の `blocked` が残って永久に保留のままになる。
       */
      resolutionCache = new Map()
      regroup()
      return publish()
    },

    onChanged(listener): () => void {
      listeners.add(listener)
      return () => listeners.delete(listener)
    }
  }

  function countFor(targetKey: string): number {
    return sessionsByTarget.get(targetKey)?.length ?? 0
  }

  /**
   * 続きの取得のあとの行 (BE-062 / US-3 AC-6)。
   *
   * **取得済みの部分結果と失敗理由の双方を返す。**
   * 途中まで取れているのに行を `failed` / 0 件へ差し替えると、
   * 画面に残っているセッションと行の件数が食い違う。
   *
   * **理由キーを `stopped-midway` に差し替える。** 列挙器が返すのは
   * 「今この対象が読めない」理由 (`distro-not-running` 等) だが、
   * **すでに一部が取れている**状況はそれとは別の意味を持つ —
   * 利用者に示すべきは「途中までは見えている」ことであり、
   * 再取得で残りが取れるという行動である。
   */
  function rowAfterFetchMore(row: TargetOutcome, result: TargetResult): TargetOutcome {
    const retained = countFor(row.key)
    if (result.outcome.status === 'ok') {
      return { ...result.outcome, count: retained }
    }
    if (retained === 0) return result.outcome
    return { ...result.outcome, reasonKey: 'stopped-midway', count: retained }
  }

  /** 対象の所在に対応する確認済みの値。**所在 `windows` では `null`** である。 */
  async function verifiedFor(target: EnumerationTarget): Promise<VerifiedRunning | null> {
    if (isHostNamespace(target.configDir.namespace)) return null
    const map = await verified()
    return map.get(target.configDir.namespace) ?? null
  }
}
