import type { HelperSettings } from '@domain/provider/settings'
import type { EffortLevel } from '@domain/provider/types'
import type { WslRuntimeDescriptor } from '@domain/runtime/descriptor'
import type { VerifiedRunning } from '@domain/runtime/verified-running'
import type { WorkspaceFolder } from '@domain/workspace/folder'

import type { SafePermissionMode } from './launch-config'
import type { SessionRunState } from './run-state'
import type { TranscriptMessageDTO } from './transcript-dto'

/**
 * X-1 単一セッション起動とストリーミングの `domain` 型 (data-model §1-8)。**I/O を持たない。**
 *
 * インタフェースは `domain` が宣言し `agents` が実装する (AD-023 §3)。境界を越えるのは値であって
 * 手続きではない。プロセス形態・port transfer・権限ゲートの正の構成は
 * [AD-036](../../../docs/decisions/0036-single-session-launch-process-and-live-stream.md) が正本。
 */

/**
 * 起動系の失敗理由 (data-model §6)。**参照キーであり訳出は `ui`。**
 *
 * **列挙用 `FailureReason` (`./target`) とは別概念** — あちらは列挙/transcript 読み取りの語彙、
 * こちらは**起動**の語彙 (design-gate H-03 で provider-error / distro-mismatch を追加)。
 * 同一名で shadow せず `LaunchFailureReason` として分ける (実装時の統合判断)。
 */
export type LaunchFailureReason =
  | 'distro-not-running'
  | 'not-verified-running'
  | 'distro-mismatch'
  | 'claude-not-found'
  | 'launch-failed'
  | 'process-crashed'
  | 'stream-protocol-error'
  | 'provider-error'
  | 'interrupt-unavailable'

export const LAUNCH_FAILURE_REASONS = [
  'distro-not-running',
  'not-verified-running',
  'distro-mismatch',
  'claude-not-found',
  'launch-failed',
  'process-crashed',
  'stream-protocol-error',
  'provider-error',
  'interrupt-unavailable'
] as const satisfies readonly LaunchFailureReason[]

export function isLaunchFailureReason(value: unknown): value is LaunchFailureReason {
  return typeof value === 'string' && (LAUNCH_FAILURE_REASONS as readonly string[]).includes(value)
}

/**
 * 起動の前段 (設定の検証・依存解決・env 導出) で拒否する理由 (X-4 / spec US-1 AC7)。訳出は `ui`。
 * - `invalid-config`: 起動設定の形が不正、または main の再評価で blocker が残った / 転送キーが規則に反した
 * - `provider-unavailable`: Provider の env 導出が null (到達不可 / config-dir 変換不能 / 規則違反)
 * - `needs-confirmation`: 確認が要る reset (Provider が既定に戻った) を未確認のまま起動しようとした
 */
export type LaunchPreflightReason = 'invalid-config' | 'provider-unavailable' | 'needs-confirmation'

export const LAUNCH_PREFLIGHT_REASONS = [
  'invalid-config',
  'provider-unavailable',
  'needs-confirmation'
] as const satisfies readonly LaunchPreflightReason[]

/** launch invoke の拒否理由 (起動失敗 9 種 + 起動前段 3 種 + 調停由来の 2 種)。訳出は `ui`。 */
export type SessionLaunchRejectReason =
  LaunchFailureReason | LaunchPreflightReason | 'session-active' | 'unknown-target'

/**
 * `session.launch` invoke の戻り値 (本文を含まない handshake。contracts C-1・C-2)。
 * 本文 (`SessionEvent`) は port 直通で届くため戻り値には載せない (main を本文経路から外す)。
 */
export type SessionLaunchHandshakeDTO =
  | { readonly status: 'launching'; readonly sessionId: string }
  | { readonly status: 'rejected'; readonly reasonKey: SessionLaunchRejectReason }

/**
 * main → agents の launch メッセージで運ぶ **query() 時の選択** (X-4 FR-005 / AD-041 (a)(g))。
 * agents の decoder が同じ述語で再検証し、未知キーを捨てる (境界通過後に型保証を再確立する。AD-040 Decision 2)。
 */
export interface LaunchQueryOptions {
  readonly permissionMode: SafePermissionMode
  readonly model?: string
  readonly effort?: EffortLevel
  /** helper 委譲の 2 キー射影 (AD-040)。 */
  readonly settings?: HelperSettings
}

/**
 * 起動の検証済み入力 (`SessionLaunchConfig` を依存解決 + main の再評価に通した結果。data-model §2 / X-4)。
 *
 * **`permissionMode` は `SafePermissionMode`** — 6 値ユニオンにしない。昇格 3 値を型で渡せなくする
 * (正の構成 P1。AD-041 (a))。
 */
export interface LaunchInput {
  readonly folder: WorkspaceFolder
  /** 実行中確認済みの WslRuntime に限る (FR-003)。 */
  readonly runtime: WslRuntimeDescriptor
  readonly verified: VerifiedRunning
  readonly options: LaunchQueryOptions
}

/**
 * agents を WSL-free に保つための起動指示の値 (data-model §8)。
 * WSL 起動コマンドの argv / リテラルは `infra/runtime` (WSL_CALLER_MODULES) に閉じ、agents は値で受ける。
 */
export interface RuntimeLaunchSpec {
  /** WSL 内 claude の実行パス (RuntimePath)。起動時に 1 回解決 (AD-018 §4)。 */
  readonly pathToClaudeCodeExecutable: string
  /** 起動コマンド (WSL ランチャの絶対パス。`WSL_BINARY`)。値。agents はこの文字列リテラルを持たない。 */
  readonly command: string
  /**
   * `['--cd', cwd, '-d', distro, '--exec']` (X-4 / AD-041 (f))。配列で構成し、シェルを経由しない (H-05)。
   * cwd は `--cd` 引数で渡す (H-03)。
   */
  readonly prefixArgs: readonly string[]
  /**
   * wsl.exe の spawn env (`composeLaunchEnv` の結果。X-4 / AD-041 (b)(e))。curated base (§7 の許可リスト) +
   * 導出 env と、転送キー (`forwardKeys`) から生成した `WSLENV`。agents はこれ以外の env を混ぜない。
   */
  readonly env: Record<string, string>
}

/** `canUseTool` 由来の permission 要求 (data-model §5)。 */
export interface PermissionRequest {
  /** 相関鍵 (control plane の応答と突き合わせる)。 */
  readonly requestId: string
  /** MCP 由来で攻撃者制御しうる。サニタイズ済み文字列で運ぶ (H-05)。 */
  readonly toolName: string
  /** R-4 と同じ argsText サニタイズを通した表示用入力。 */
  readonly input: string
  /** 単発承認と capability 付与の区別 (glossary Approval card)。 */
  readonly scope: 'once' | 'capability'
}

/** 利用者の許可 / 拒否の決定 (data-model §5)。main が enum 検証する。 */
export interface PermissionDecision {
  readonly requestId: string
  readonly outcome: 'allow' | 'deny'
  readonly scope: 'once' | 'capability'
  /** 任意の拒否理由 (表示用)。 */
  readonly message?: string
}

/** 聞かれずに拒否された操作 (`SDKPermissionDeniedMessage` 由来。FR-014)。 */
export interface PermissionDeniedInfo {
  readonly toolName: string
  readonly reason: string
}

/**
 * `agents → renderer` の一方向データ (data plane。data-model §3)。
 * **制御はここに載せない** (制御は control plane の検証済み IPC を通す。C-2)。
 */
export type SessionEvent =
  | { readonly kind: 'message'; readonly message: TranscriptMessageDTO }
  | { readonly kind: 'state'; readonly state: SessionRunState }
  | { readonly kind: 'permission-request'; readonly request: PermissionRequest }
  | { readonly kind: 'permission-denied'; readonly denied: PermissionDeniedInfo }
  | {
      readonly kind: 'interrupt-receipt'
      readonly stillQueued: readonly string[]
      readonly cancelled: readonly string[]
    }
  | { readonly kind: 'failure'; readonly reasonKey: LaunchFailureReason }

/**
 * `renderer → main` の制御要求 (control plane。data-model §5 / contracts C-1)。
 * renderer → main の検証済み IPC のみが発行できる。
 */
export type SessionControl =
  | { readonly kind: 'send-prompt'; readonly text: string }
  | { readonly kind: 'respond-permission'; readonly decision: PermissionDecision }
  | { readonly kind: 'interrupt' }
  | { readonly kind: 'kill' }

/**
 * 稼働セッションの**操作面の概念契約** (data-model §1)。AD-023 §3 の宣言 (start/interrupt/stop) を土台に拡張。
 *
 * **実体はクラスでなく `agents` の module worker (`sdk-agent-session.ts`)** が実現する — parentPort の
 * 制御メッセージ (launch/control) と転送 port の `SessionEvent` で本 interface の各操作に対応づける
 * (`read-transcript` / `enumerate-sessions` と同じ module-worker の構え。クラス `SdkAgentSession` は持たない)。
 * したがって本 interface は「宣言 (domain) / 実装 (agents)」の分担 (AD-023 §3) を**操作の語彙**として担い、
 * worker のメッセージ契約の設計基準になる。
 */
export interface AgentSession {
  /** 起動 + stream。yield は逐次 `SessionEvent`。 */
  start(input: LaunchInput): AsyncIterable<SessionEvent>
  /** canUseTool の応答を稼働中セッションへ反映する。 */
  respondPermission(decision: PermissionDecision): void
  /** AsyncIterable prompt へ push (stdin を開いたまま保つ。FR-011)。 */
  sendPrompt(text: string): void
  /** SDK interrupt (stdin 越し control_request。FR-015)。 */
  interrupt(): Promise<void>
  /** graceful 停止。 */
  stop(): Promise<void>
}

/**
 * 権限ゲートの**正の構成 (P2)**: `canUseTool` 応答は `{ behavior, message? }` の完全部分集合に固定する。
 * `updatedPermissions` (全 6 variant) と `updatedInput` を**型として持たない** — これにより
 * モード昇格・ルール書換・入力書換の全経路を構造的に締め出す (C-101/C-201/H-201/L-201 一括閉鎖)。
 * capability 付与はアプリ内 in-memory 状態で実現し、ここには載せない (AD-036 §4)。
 */
export interface PermissionResultLike {
  readonly behavior: 'allow' | 'deny'
  readonly message?: string
}

/**
 * `PermissionDecision → PermissionResultLike` の唯一の写像 (正の構成 P2)。
 *
 * **出力は `{behavior, message}` のみ。** `canUseTool` の全 return はこの関数を通し、
 * インライン構築を禁じる (H-401。SH-010 が静的に強制)。
 */
export function toPermissionResult(decision: PermissionDecision): PermissionResultLike {
  return decision.outcome === 'allow'
    ? { behavior: 'allow' }
    : { behavior: 'deny', message: decision.message ?? '拒否しました' }
}

/**
 * 決定 scope を**要求 scope の上限に丸める** (FR-012 / H-04 / SC-004)。
 *
 * **`once` 要求に `capability` 決定を受理しない** — capability を要求 scope (`once`) に下げる
 * (`allow`/`deny` の判断は保つ)。capability 付与は要求 scope が `capability` のときだけ通る (I-3 で実装。AD-041 (c))。
 * X-1 の要求は常に `once` (`createCanUseTool` が固定) なので、ここが capability 昇格の唯一の締め出し点である。
 * main は本文経路 (port) を持たず要求 scope を保持できないため、要求 scope を知る agents がこの写像を通す。
 */
export function boundDecisionScope(
  decision: PermissionDecision,
  requestScope: 'once' | 'capability'
): PermissionDecision {
  if (requestScope === 'once' && decision.scope === 'capability') {
    return { ...decision, scope: 'once' }
  }
  return decision
}
