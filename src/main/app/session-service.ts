import type { RuntimeDescriptor, WslRuntimeDescriptor } from '@domain/runtime/descriptor'
import { isHostNamespace, type WslNamespaceId } from '@domain/runtime/namespace'
import type { VerifiedRunning } from '@domain/runtime/verified-running'
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

/** 列挙 1 件あたりの上限時間。**列挙対象ごとに持つ** (C-5)。 */
export const ENUMERATION_TIMEOUT_MS = 15_000

export interface SessionService {
  /** キャッシュがあれば返し、無ければ先頭ページを取る。 */
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

/** 1 つの列挙対象から取れたセッションと、その行。 */
interface TargetResult {
  readonly target: EnumerationTarget | null
  readonly outcome: TargetOutcome
  readonly sessions: readonly SessionSummary[]
}

export function createSessionService(deps: SessionServiceDeps): SessionService {
  const listeners = new Set<(index: SessionIndexDTO) => void>()

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

  /** 所在ごとに探索して列挙する。**1 所在の失敗が他を消さない** (SC-007)。 */
  async function fetchAll(scope: EnumerationScope): Promise<void> {
    const verifiedMap = await deps.verifyRunning()
    const nextTargets: EnumerationTarget[] = []
    const nextOutcomes: EnumerationOutcome[] = []
    const nextSessions = new Map<string, readonly SessionSummary[]>()
    const at = deps.now()

    /* ── 所在 windows ────────────────────────────────────────── */
    const hostDiscovery = await deps.finder.hostTarget(deps.hostHome())
    nextOutcomes.push(
      await collectLocation({ kind: 'windows' }, hostDiscovery, null, scope, at, {
        nextTargets,
        nextSessions
      })
    )

    /* ── 所在 wsl:<D> ────────────────────────────────────────── */
    for (const runtime of deps.runtimes()) {
      if (runtime.kind !== 'wsl') continue
      const wsl: WslRuntimeDescriptor = runtime
      const location = { kind: 'wsl', distroName: wsl.distroName } as const
      const verified = verifiedMap.get(wsl.id)

      /*
       * **停止中なら探索も起動も発行しないが、行は作る** (FR-007 / FR-008)。
       * 行を落とすと (a) 「未列挙である」ことを示せず、
       * (b) 「既知の `key` + 停止中」という SC-002 / SC-010 の経路が踏めない。
       */
      if (verified === undefined) {
        nextOutcomes.push(unreachableOutcome(location, 'distro-not-running', at))
        continue
      }

      const discovery = await deps.finder.wslTargets(wsl, verified, deps.now())
      nextOutcomes.push(
        await collectLocation(location, discovery, verified, scope, at, {
          nextTargets,
          nextSessions
        })
      )
    }

    targets = nextTargets
    sessionsByTarget = nextSessions
    outcomes = nextOutcomes
    fetchedAt = at
    complete = scope.kind === 'all'
    loaded = true
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
    verified: VerifiedRunning | null,
    scope: EnumerationScope,
    at: number,
    sink: {
      nextTargets: EnumerationTarget[]
      nextSessions: Map<string, readonly SessionSummary[]>
    }
  ): Promise<EnumerationOutcome> {
    const rows: TargetOutcome[] = []

    for (const target of discovery.targets) {
      const result = await enumerateTarget(target, verified, scope)
      sink.nextTargets.push(target)
      sink.nextSessions.set(target.key, result.sessions)
      rows.push(result.outcome)
    }

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

    return { location, outcomes: rows, fetchedAt: at }
  }

  return {
    async list(): Promise<SessionIndexDTO> {
      if (loaded) return snapshot()
      await deps.measure('list-sessions-first-page', () =>
        fetchAll({ kind: 'page', limit: SESSION_PAGE_SIZE, offset: 0 })
      )
      return publish()
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
          row.key === targetKey ? { ...result.outcome, count: countFor(targetKey) } : row
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

  /** 対象の所在に対応する確認済みの値。**所在 `windows` では `null`** である。 */
  async function verifiedFor(target: EnumerationTarget): Promise<VerifiedRunning | null> {
    if (isHostNamespace(target.configDir.namespace)) return null
    const map = await deps.verifyRunning()
    return map.get(target.configDir.namespace) ?? null
  }
}
