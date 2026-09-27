import type { WslRuntimeDescriptor } from '@domain/runtime/descriptor'
import { checkVerified, type VerifiedRunning } from '@domain/runtime/verified-running'
import { isNamespaceConsistent, isWslFolder, type WorkspaceFolder } from '@domain/workspace/folder'

import type { LaunchFailureReason } from './agent-session'

/**
 * 起動ゲートの**純粋判定** (BE-007 の核。data-model / FR-003 / SC-002 / AD-036 §7)。
 *
 * **起動は実行中確認済み (`VerifiedRunning`) の WslRuntime に対してのみ許す** (SC-002) — プロセス起動自体が
 * UNC アクセスを引き起こすため、「確認を経た値が無ければ起動できない」形にする。加えて **folder の所在ディストロと
 * 選択ランタイムのディストロの不一致を拒否**する (H-09。別 distro で走る / transcript が別 distro に書かれるのを防ぐ)。
 *
 * 単一セッション不変 (SC-011) は registry の状態に依存するため、判定は service 側が行う
 * (`session-launch-service` が **生存 worker プロセス数** `active.size > 0` で拒否する。run-state 連動ではない。
 * pr-gate arch M-001)。ここは folder / runtime / verified だけで決まる純粋部分に限る。
 */

export type LaunchGateResult =
  { readonly ok: true } | { readonly ok: false; readonly reason: LaunchFailureReason }

export interface LaunchGateParams {
  readonly folder: WorkspaceFolder
  readonly runtime: WslRuntimeDescriptor
  readonly verified: VerifiedRunning | null
  readonly now: number
}

export function evaluateLaunch(params: LaunchGateParams): LaunchGateResult {
  // **実行中判定は `verified` (起動時の verifyRunning 結果) を正とする** — `runtime.state` は R-1 の
  // キャッシュ値で古くなりうる (実行中のディストロが `stopped` と表示される)。`verified` があれば起動時点で
  // 実行中が確認できているので、キャッシュが `stopped` でも起動を許す (FR-003 / SC-002 / quickstart V-1 の実機不具合)。
  // `verified` が無いときだけ、キャッシュ state で「停止 (distro-not-running)」と「確認失敗 (not-verified-running)」を
  // 区別する — 前者は「起動が要る」、後者は「再検出が要る」で利用者への次操作が違う。
  if (params.verified === null) {
    return {
      ok: false,
      reason: params.runtime.state === 'running' ? 'not-verified-running' : 'distro-not-running'
    }
  }

  // 確認済みの値が当該ランタイムのもので、かつ期限内であること。
  // (別ランタイムの verified 流用 / 期限切れは「このランタイムは未確認」として扱う。)
  const verification = checkVerified(params.verified, params.runtime.id, params.now)
  if (!verification.ok) return { ok: false, reason: 'not-verified-running' }

  // 所在ディストロの一致 (H-09)。WSL フォルダは **canonical な名前空間照合 (`isNamespaceConsistent`) で**
  // distro 完全一致を要求する — 照合を 1 つの純粋関数に集約する不変条件 (AD-025 §1 / FR-003 / SC-002)。
  // インライン文字列比較にすると照合が 2 箇所に分裂し、将来 distro 照合の意味変更が launch ゲートに
  // 反映されず別 distro 起動が再発しうる (pr-gate arch H-001)。`runtime.id` は wslNamespace(distroName)。
  // Windows フォルダは越境 (/mnt/c) であり別 distro を騙らないため mismatch にしない
  // (cwd の RuntimePath 変換は呼び出し側が PathMapping 経由で行う。Principle I)。
  if (
    isWslFolder(params.folder) &&
    !isNamespaceConsistent(params.folder.location, { namespace: params.runtime.id })
  ) {
    return { ok: false, reason: 'distro-mismatch' }
  }

  return { ok: true }
}
