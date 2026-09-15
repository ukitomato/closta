import type { RuntimeDescriptor } from '@domain/runtime/descriptor'
import { locationNamespace, type FolderReachability, type WorkspaceFolder } from './folder'

/**
 * 一覧側の到達可能性の導出 (BE-047 / data-model §6)。
 *
 * §8 の 3 段は **(フォルダ × ランタイム) の対**に対して定義される。
 * 一覧にはランタイム軸が無いため、**第 0 段**を置いて畳み込む。
 * **第 0 段で決まったら §8 を見ない。**
 *
 * **純粋関数である。** 実在確認 (I/O) の結果を引数で受け取る。
 * `domain` は I/O を持てないため、呼び出し元が `infra/fs` で確認して渡す。
 */

/**
 * 実在確認の結果。**3 値である。**
 *
 * `unknown` が要るのは、**確認済みの値を持たないときに確認を行わない**ためである。
 * `false` と混ぜると、停止を削除と誤認して「解除を勧める」側へ落ちる (data-model §6)。
 */
export type ExistenceCheck = 'exists' | 'missing' | 'unknown'

export interface Stage0Input {
  readonly folder: WorkspaceFolder
  readonly runtimes: readonly RuntimeDescriptor[]
  /** 実在確認の結果。呼び出し元が `infra/fs` (所在 `wsl`) か `infra` (所在 `windows`) で得る。 */
  readonly existence: ExistenceCheck
}

function unreachable(reason: FolderReachability['unreachableReason']): FolderReachability {
  return {
    reachability: 'unreachable',
    unreachableReason: reason,
    blockedReason: null,
    resolutionSteps: []
  }
}

function blocked(
  reason: FolderReachability['blockedReason'],
  steps: FolderReachability['resolutionSteps']
): FolderReachability {
  return {
    reachability: 'blocked',
    unreachableReason: null,
    blockedReason: reason,
    resolutionSteps: steps
  }
}

const REACHABLE: FolderReachability = {
  reachability: 'reachable',
  unreachableReason: null,
  blockedReason: null,
  resolutionSteps: []
}

/**
 * 第 0 段: フォルダ自体の存在 (ランタイムを見ない)。
 *
 * | 条件 | 判定 |
 * |---|---|
 * | 所在ディストロが検出結果に無い | **unreachable** (`distro-absent`) — 起動しても解消しない |
 * | 所在ディストロが `stopped` | **blocked** (`distro-not-running`) |
 * | 所在 `windows` でパスが存在しない | **unreachable** (`folder-missing`) |
 * | 所在 `wsl:<D>` が `running` でパスが存在しない | **unreachable** (`folder-missing`) |
 * | 上記以外 | `null` を返す (第 1 段へ) |
 */
export function stage0(input: Stage0Input): FolderReachability | null {
  const { folder, runtimes, existence } = input

  if (folder.location.kind === 'windows') {
    if (existence === 'missing') return unreachable('folder-missing')
    // 所在 `windows` は常に到達可能 (ホストは常に在る)。
    return existence === 'exists' ? REACHABLE : null
  }

  const namespace = locationNamespace(folder.location)
  const descriptor = runtimes.find((runtime) => runtime.id === namespace)

  /*
   * **検出結果に無い = 改名・削除。** 起動しても解消しないので `unreachable`。
   * `blocked` にすると「起動してください」という解消しない手順を出すことになる。
   */
  if (descriptor === undefined) return unreachable('distro-absent')

  if (descriptor.state === 'stopped') {
    return blocked('distro-not-running', ['start-distro', 'rescan-runtimes'])
  }

  /*
   * 実行中でも**確認済みの値を持たないときは実在確認を行わない**。
   * その場合は `unknown` が来るので、ここで `folder-missing` を出してはならない —
   * 停止を削除と誤認させ、FR-017 の「解除を勧める」側に誤って落とす。
   */
  if (existence === 'missing') return unreachable('folder-missing')
  if (existence === 'unknown') {
    return blocked('distro-not-running', ['start-distro', 'rescan-runtimes'])
  }

  return null
}

/**
 * 畳み込み。
 *
 * 検出済みランタイムのいずれかで `reachable` なら `reachable`、
 * 無ければ `blocked` があれば `blocked`、いずれも無ければ `unreachable`。
 */
export function fold(results: readonly FolderReachability[]): FolderReachability {
  const reachable = results.find((r) => r.reachability === 'reachable')
  if (reachable !== undefined) return reachable

  const blockedResult = results.find((r) => r.reachability === 'blocked')
  if (blockedResult !== undefined) return blockedResult

  const unreachableResult = results.find((r) => r.reachability === 'unreachable')
  if (unreachableResult !== undefined) return unreachableResult

  /*
   * 対が 0 件。ランタイムが 1 つも検出できていない状態であり、
   * **「到達可能」と言える根拠が無い**。`Win32Runtime` は常に検出されるので
   * 実際にはここへ来ないが、来たときに `reachable` へ倒さないことが要点である。
   */
  return blocked('capabilities-not-probed', ['rescan-runtimes'])
}

/**
 * 一覧 1 件の到達可能性を決める。
 *
 * @param pairResults 第 1 段以降 (§8) の対ごとの結果。第 0 段で決まる場合は評価しない。
 */
export function folderReachability(
  input: Stage0Input,
  pairResults: () => readonly FolderReachability[]
): FolderReachability {
  const stage0Result = stage0(input)
  if (stage0Result !== null) return stage0Result
  return fold(pairResults())
}
