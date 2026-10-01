import type { RuntimeDescriptor } from '@domain/runtime/descriptor'
import { isSameDistro } from '@domain/runtime/namespace'
import { runtimePathOps } from '@domain/runtime/path-api'
import {
  makeHostPath,
  makeRuntimePath,
  type HostPath,
  type RuntimePath,
  type WslUncPath
} from '@domain/runtime/path-types'

/**
 * helper 系 Provider の helperPath を**選択ランタイムの名前空間で分類する**純粋関数 (X-4 FR-014 / AD-042)。
 *
 * **到達可能性判定 (`assessReachability`) と起動時の解決 (main/app/provider-service の `helperRuntimePath`) の両方がこの 1 関数を呼ぶ**
 * — 判定する関数と実行する関数を同じにし、「選択肢には出るが起動で必ず拒否される Provider」を作らない。
 *
 * | 生値 | 結果 |
 * |---|---|
 * | POSIX 絶対パス (`/...`) | そのまま選択ランタイムの RuntimePath (停止中は `blocked`) |
 * | HostPath (`C:\...`) | PathMapping で変換 (mapping 未取得 / 停止中は `blocked`、配下でなければ `unreachable`) |
 * | UNC・相対・その他 | `unreachable` (同一 distro の UNC も X-4 では扱わない) |
 *
 * 変換後の値は**文字種 allowlist** で照合する (空白・括弧・引用符・`$` を含むパスは X-4 では使えない)。
 * helper は Claude Code がセッション中に繰り返し実行するため、シェル経由の実行でも崩れない形に限る (CWE-78)。
 */

const HELPER_RUNTIME_PATH = /^\/[A-Za-z0-9._/+@-]+$/

export type HelperPathClassification =
  | { readonly ok: true; readonly path: RuntimePath }
  | { readonly ok: false; readonly reason: 'blocked' | 'unreachable' }

function accept(path: RuntimePath): HelperPathClassification {
  return HELPER_RUNTIME_PATH.test(path.value)
    ? { ok: true, path }
    : { ok: false, reason: 'unreachable' }
}

export function classifyHelperPath(
  raw: string,
  runtime: RuntimeDescriptor
): HelperPathClassification {
  // X-4 の起動は WSL 限定 (FR-001)。win32 ランタイムは helper の実行先にならない。
  if (runtime.kind !== 'wsl') return { ok: false, reason: 'unreachable' }

  if (raw.startsWith('/') && !raw.startsWith('//')) {
    // 停止中は HostPath 分岐・resolveConfigDirPath と同じく `blocked` (判定と実行を状態でも対称に。pr-gate R1 PB L-302)。
    if (runtime.state === 'stopped') return { ok: false, reason: 'blocked' }
    const posix = makeRuntimePath(runtime.id, raw)
    return posix.ok ? accept(posix.path) : { ok: false, reason: 'unreachable' }
  }

  const host = makeHostPath(raw)
  if (!host.ok) return { ok: false, reason: 'unreachable' }
  if (runtime.state === 'stopped' || runtime.pathMapping === null) {
    return { ok: false, reason: 'blocked' }
  }
  const converted = runtimePathOps.fromHost(host.path, runtime.pathMapping)
  return converted.ok ? accept(converted.path) : { ok: false, reason: 'unreachable' }
}

/**
 * config-dir 方式の configDir を**選択ランタイムの RuntimePath** へ変換する (X-4 FR-012 / BE-030)。
 *
 * 到達可能性判定と起動 (X-3 `resolveConfigDirRuntimePath` の実装) の両方がこれを呼ぶ。
 * 変換は domain のパス API だけで行う (新しい prefix-match 実装を作らない。Principle I / AD-025 §3)。
 * - host: `runtimePathOps.fromHost` (mapping 未取得・停止中は `blocked`)
 * - UNC: `runtimePathOps.fromUnc` + 選択ランタイムとの**同一 distro 照合** (`isSameDistro`)
 */
export type ConfigDirResolution =
  | { readonly ok: true; readonly path: RuntimePath }
  | { readonly ok: false; readonly reason: 'blocked' | 'unreachable' }

export function resolveConfigDirPath(
  configDir: HostPath | WslUncPath,
  runtime: RuntimeDescriptor
): ConfigDirResolution {
  if (runtime.kind !== 'wsl') return { ok: false, reason: 'unreachable' }
  if (runtime.state === 'stopped') return { ok: false, reason: 'blocked' }

  if (configDir.namespace === 'host') {
    if (runtime.pathMapping === null) return { ok: false, reason: 'blocked' }
    const r = runtimePathOps.fromHost(configDir, runtime.pathMapping)
    return r.ok ? { ok: true, path: r.path } : { ok: false, reason: 'unreachable' }
  }

  // WSL 内の config dir は同一ディストロからのみ到達できる (別 distro の ~/.claude は不可視)。
  if (!isSameDistro(configDir.namespace, runtime.id)) return { ok: false, reason: 'unreachable' }
  const r = runtimePathOps.fromUnc(configDir)
  return r.ok ? { ok: true, path: r.path } : { ok: false, reason: 'unreachable' }
}
