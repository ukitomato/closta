import type { WslRuntimeDescriptor } from '@domain/runtime/descriptor'
import type { ListDirErrorReason, WslFileSystem } from '@domain/runtime/interfaces'
import { hostPathOps, runtimePathOps } from '@domain/runtime/path-api'
import { makeRuntimePath, type HostPath, type RuntimePath } from '@domain/runtime/path-types'
import { checkVerified, type VerifiedRunning } from '@domain/runtime/verified-running'
/* **値の import は型と分ける。** 序数の予約値は定数である。 */
import { DISCOVERY_ISSUE_ORDINAL } from '@domain/session/interfaces'
import { normalizeText, TEXT_MAX_BYTES } from '@domain/session/normalize'
import type {
  EnumerationTargetFinder,
  TargetDiscovery,
  TargetIssue
} from '@domain/session/interfaces'
import {
  enumerationTargetKey,
  type EnumerationTarget,
  type FailureReason
} from '@domain/session/target'
import type { Location } from '@domain/workspace/folder'

import type { HostFileSystem } from '../fs/host-fs'
import { hostConfigDir, runtimeConfigDir } from './config-dir'

/**
 * 由来候補の表示名 (pr-gate Round 2 / H2-002、Round 4 / 不変条件 4 / FR-049 / FR-052)。
 *
 * **ここが未信頼入力の入口である。** 値の出どころはディストロ内の `/home` を
 * UNC 経由で読んだディレクトリ名であり、**アプリ外が作った名前**である。
 *
 * **`makeRuntimePath` の検査では足りない。** `hasForbiddenCharacter` が落とすのは
 * C0 / C1 / DEL だけで、**双方向制御文字 (U+202E 等) を通す**。
 *
 * ## 正規化だけでは FR-052 を守れない
 *
 * FR-052 は「**どのユーザの履歴を見ているかが分からない状態を作ってはならない**」であり、
 * これは `[USER]` が「1 ディストロ内の全ユーザを集約する」判断を受け入れた**唯一の代償**である
 * (`spec.md` の Assumptions)。正規化は偽装を止めるが、その副作用で 2 つ壊れる。
 *
 * | 入力 | 正規化だけ | 破れる性質 |
 * |---|---|---|
 * | `alice` と `al<U+202E>ice` | どちらも `alice` | **一意性** — 2 候補が同じ表示になる |
 * | 制御文字だけの名前 | `''` | **非空性** — `SourceLabel` が `null` を返し痕跡なく消える |
 *
 * どちらも pr-gate Round 3 で指摘された (H3-008 / A11Y3-008)。
 *
 * ## 印を載せない理由
 *
 * FR-049 が「切り詰め・除去が起きたことを payload 上で示す」ことを求めている対象は
 * **会話由来文字列の 6 項目**であり、`targetLabel` は入っていない (ディレクトリ名である)。
 * 印を足しても潰れも消失も直らないので、**直すべき性質のほうを直す**。
 */
function normalizedLabel(raw: string): string {
  return normalizeText(raw, TEXT_MAX_BYTES).value
}

/**
 * 候補集合の中で**一意かつ非空**な表示名に整える (不変条件 4 / FR-052)。
 *
 * **候補集合を見られるのはここだけである。** 正規化は値ごとに掛けられるが、
 * 衝突は集合の性質なので、候補一覧を持つ側でしか判定できない。
 *
 * 序数は `enumerationTargetKey` が既に使っている値であり、**新しい状態ではない**。
 */
function disambiguate(labels: readonly string[]): string[] {
  const counts = new Map<string, number>()
  for (const label of labels) counts.set(label, (counts.get(label) ?? 0) + 1)

  const isPlain = (label: string): boolean => label.length > 0 && counts.get(label) === 1

  /*
   * **平明な名前を先に予約する** (pr-gate Round 4 / PO4-001)。
   *
   * 初版は生ラベルの重複だけを数え、**生成した名前が既存の名前と衝突しないかを見ていなかった**。
   * `/home` に `alice` / `al<U+202E>ice` / `alice (#0)` の 3 つがあると
   * 正規化後は `alice` / `alice` / `alice (#0)` になり、
   * 出力は `alice (#0)` / `alice (#1)` / `alice (#0)` — **1 番目と 3 番目が同じ**になった。
   *
   * 一意化は集合に対する操作なので、**生成後の集合で閉じている**必要がある。
   */
  const used = new Set<string>()
  for (const label of labels) {
    if (isPlain(label)) used.add(label)
  }

  return labels.map((label, ordinal) => {
    if (isPlain(label)) return label

    /*
     * 正規化で空になった名前は消さずに序数で示す。衝突した名前も序数で分ける。
     * **序数は候補ごとに一意**なので、生成した名前どうしは必ず異なる。
     */
    let name = label.length === 0 ? `候補 #${ordinal}` : `${label} (#${ordinal})`

    /*
     * 残る衝突は「生成した名前と**実在する**候補名が一致する」場合だけである
     * (`/home/候補 #0` が実在しうる)。**一致しなくなるまで伸ばす。**
     * 1 周ごとに必ず長くなり、候補は有限なので停止する。
     */
    while (used.has(name)) name = `${name} (#${ordinal})`

    used.add(name)
    return name
  })
}

/**
 * 列挙対象の探索 (BE-021 / data-model §1 の探索手順 / FR-008 〜 FR-012)。
 *
 * | 規則 | 根拠 |
 * |---|---|
 * | **`wsl.exe` を使わない。** UNC 経路の浅い列挙で完結する | FR-006 / SC-003 (実測 69 ms) |
 * | **実行中確認済みの値に対してのみ発行する** | FR-008 / SC-002 |
 * | **`.claude` を持つ候補すべて**を対象にする。1 つを暗黙に選ばない | FR-011 |
 * | `.claude` が 1 件も無いことは**失敗ではなく「履歴なし」** | FR-012 |
 * | 候補ごとの失敗は**所在全体の失敗にしない** | FR-030 / SC-007 |
 * | `os` / `process` / `electron` を import しない。ホームは**注入で受け取る** | R-1 の許可行列 |
 *
 * **パスの組み立てはすべてパス API 経由**であり、文字列連結をしない (Principle I)。
 */

/** WSL 側のユーザホームの親。POSIX の慣習であり、UNC の綴りとは無関係である。 */
const WSL_HOME_ROOT = '/home'

/**
 * `root` のホーム。**候補に含める** (FR-011)。
 *
 * 実測では UNC 経由で Access denied になる (research R-03)。
 * それでも候補から外さないのは、**読めない理由を利用者に示す**ためである。
 * 外すと「root で走らせたセッションが理由もなく現れない」状態になる。
 */
const WSL_ROOT_HOME = '/root'

export interface TargetFinderDeps {
  readonly hostFs: HostFileSystem
  readonly wslFs: WslFileSystem
}

/**
 * 列挙の結果を `TargetDiscovery` に落とす。
 *
 * **`noHistory` は「対象 0 件 かつ 失敗 0 件」のときだけ真にする。**
 * 失敗があるのに `noHistory` を立てると、権限拒否で読めなかった所在が
 * 「Claude Code を使っていない」と表示される。
 */
function discovery(
  targets: readonly EnumerationTarget[],
  issues: readonly TargetIssue[]
): TargetDiscovery {
  return { targets, issues, noHistory: targets.length === 0 && issues.length === 0 }
}

/**
 * 列挙の失敗理由を所在ごとの失敗理由へ写す。
 *
 * **`not-found` はここに来ない** — 呼び出し側が「履歴なし」として先に分岐する。
 * `too-many-entries` も来ない — 項目数が多いことは**ディレクトリが在ること**の証拠であり、
 * 存在確認としては成功である。
 */
function toFailureReason(reason: ListDirErrorReason): FailureReason {
  switch (reason) {
    case 'permission-denied':
      return 'permission-denied'
    case 'path-too-long':
      return 'path-too-long'
    case 'distro-unreachable':
      return 'distro-not-running'
    default:
      return 'enumeration-failed'
  }
}

export function createEnumerationTargetFinder(deps: TargetFinderDeps): EnumerationTargetFinder {
  /**
   * 候補 1 件を判定する。
   *
   * **存在確認に `exists()` を使わない。** `exists()` は真偽しか返さないため、
   * 「`.claude` が無い」と「読む権限が無い」を区別できない。前者は履歴なしで、
   * 後者は利用者に示すべき失敗である (FR-012 / FR-030)。
   * `.claude` の直下は十数件であり、列挙の費用は無視できる。
   */
  async function probeCandidate(
    home: RuntimePath,
    /**
     * 表示名。**候補集合の中で一意に整えたものを受け取る** (不変条件 4)。
     * 衝突は集合の性質なので、ここでは決められない。
     */
    label: string,
    verified: VerifiedRunning,
    now: number
  ): Promise<
    | { readonly kind: 'target'; readonly configDir: RuntimePath; readonly label: string }
    | { readonly kind: 'no-history' }
    /**
     * **序数を持たない。** 候補一覧の位置を知っているのは呼び出し側である
     * (pr-gate Round 1 / security H-003)。
     */
    | { readonly kind: 'issue'; readonly issue: Omit<TargetIssue, 'ordinal'> }
  > {
    const configDir = runtimeConfigDir(home)
    if (!configDir.ok) {
      return { kind: 'issue', issue: { label, reasonKey: 'enumeration-failed' } }
    }

    const listed = await deps.wslFs.listDirectory(configDir.path, verified, now)
    if (listed.ok) return { kind: 'target', configDir: configDir.path, label }

    if (listed.reason === 'not-found') return { kind: 'no-history' }
    // 項目数の上限超過は「在る」ことの証拠である。
    if (listed.reason === 'too-many-entries') {
      return { kind: 'target', configDir: configDir.path, label }
    }

    return { kind: 'issue', issue: { label, reasonKey: toFailureReason(listed.reason) } }
  }

  return {
    async hostTarget(hostHome: HostPath): Promise<TargetDiscovery> {
      const location: Location = { kind: 'windows' }
      /* 候補は 1 件だが、**非空性の規則は共通**にする。 */
      const [label] = disambiguate([normalizedLabel(hostPathOps.basename(hostHome))])

      const configDir = hostConfigDir(hostHome)
      if (!configDir.ok) {
        /* 候補を 1 件も特定できていない失敗。予約した序数を使う (security H-003)。 */
        return discovery(
          [],
          [{ label, reasonKey: 'enumeration-failed', ordinal: DISCOVERY_ISSUE_ORDINAL }]
        )
      }

      /*
       * **存在しないなら対象を作らない** (design-gate M-001)。
       * 対象を作ると `CLAUDE_CONFIG_DIR` が不在のディレクトリを指し、
       * SDK がそれを作った場合に FR-013 / Principle VI に触れる。
       * ホスト側の `exists()` は真偽しか返さないが、ホームは利用者自身のものであり
       * 権限拒否は想定しない。WSL 側と非対称なのはこの 1 点である。
       */
      if (!(await deps.hostFs.exists(configDir.path))) return discovery([], [])

      return discovery(
        [
          {
            key: enumerationTargetKey(location, 0),
            location,
            configDir: configDir.path,
            origin: 'default',
            label
          }
        ],
        []
      )
    },

    async wslTargets(
      descriptor: WslRuntimeDescriptor,
      verified: VerifiedRunning,
      now: number
    ): Promise<TargetDiscovery> {
      const location: Location = { kind: 'wsl', distroName: descriptor.distroName }

      /*
       * **入口で確認済みの値を検査する** (FR-008)。
       * 期限切れと**別ディストロへの流用**の両方を止める。
       * `wsl-fs` 側も検査するが、ここで止めないと停止中の所在に対して
       * 浅い列挙を発行する呼び出し自体が成立してしまう。
       */
      if (!checkVerified(verified, descriptor.id, now).ok) {
        return discovery(
          [],
          [
            {
              label: normalizedLabel(descriptor.distroName),
              reasonKey: 'distro-not-running',
              /* 所在ごと列挙していない。予約した序数を使う (security H-003)。 */
              ordinal: DISCOVERY_ISSUE_ORDINAL
            }
          ]
        )
      }

      const homeRoot = makeRuntimePath(descriptor.id, WSL_HOME_ROOT)
      const rootHome = makeRuntimePath(descriptor.id, WSL_ROOT_HOME)

      const candidates: RuntimePath[] = []
      const issues: TargetIssue[] = []

      if (homeRoot.ok) {
        const listed = await deps.wslFs.listDirectory(homeRoot.path, verified, now)
        if (listed.ok) {
          for (const entry of listed.entries) {
            if (entry.isDirectory) candidates.push(entry.path)
          }
        } else if (listed.reason !== 'not-found') {
          /*
           * `/home` そのものが読めない。**候補探索の失敗として記録し、
           * `/root` の探索は続ける** — 所在全体を失敗にしない (FR-030 / SC-007)。
           */
          issues.push({
            label: normalizedLabel(runtimePathOps.basename(homeRoot.path)),
            reasonKey: toFailureReason(listed.reason),
            /* **候補を 1 件も特定できていない。** 予約した序数を使う (security H-003)。 */
            ordinal: DISCOVERY_ISSUE_ORDINAL
          })
        }
      }

      if (rootHome.ok) candidates.push(rootHome.path)

      /*
       * **候補の順序を名前で固定する。** `key` は序数を含むため、
       * 列挙順が `readdir` の返す順に依存すると再取得で `key` がずれ、
       * `fetchMoreSessions` が別の対象を指す (data-model §1 の `key` の規則)。
       */
      candidates.sort((a, b) => (a.value < b.value ? -1 : a.value > b.value ? 1 : 0))

      /*
       * **表示名は候補集合を見てから決める** (不変条件 4 / FR-052)。
       * 正規化だけだと `alice` と `al<U+202E>ice` が同じ表示に潰れ、
       * 「どのユーザの履歴か分からない状態」になる。序数は `key` と同じものを使う。
       */
      const labels = disambiguate(
        candidates.map((home) => normalizedLabel(runtimePathOps.basename(home)))
      )

      const targets: EnumerationTarget[] = []
      for (const [ordinal, home] of candidates.entries()) {
        const result = await probeCandidate(home, labels[ordinal], verified, now)
        /* **候補の序数をそのまま載せる** (security H-003)。呼び出し側に計算させない。 */
        if (result.kind === 'issue') issues.push({ ...result.issue, ordinal })
        if (result.kind !== 'target') continue
        /*
         * **序数は候補一覧の位置であり、対象一覧の位置ではない。**
         * 対象の位置にすると、ある候補が権限拒否に転じた回で
         * それ以降の対象の `key` が全部 1 つずれる。
         */
        targets.push({
          key: enumerationTargetKey(location, ordinal),
          location,
          configDir: result.configDir,
          origin: 'default',
          label: result.label
        })
      }

      return discovery(targets, issues)
    }
  }
}
