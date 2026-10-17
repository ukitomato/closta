import type { HelperSettings } from '@domain/provider/settings'
import type { EffortLevel } from '@domain/provider/types'
import type { WslRuntimeDescriptor } from '@domain/runtime/descriptor'
import type { VerifiedRunning } from '@domain/runtime/verified-running'
import type { WorkspaceFolder } from '@domain/workspace/folder'

import type { ElicitationPrompt, ElicitationResponse } from './elicitation'
import type { SafePermissionMode } from './launch-config'
import type { MeterUpdate } from './meter'
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
 * 起動とターンの失敗の理由 (18 種。X-1 data-model §6 の 10 種 + O-4 の 8 種)。**参照キーであり訳出は `ui`。**
 *
 * **列挙用 `FailureReason` (`./target`) とは別概念** — あちらは列挙/transcript 読み取りの語彙、
 * こちらは**起動と実行**の語彙 (design-gate H-03 で provider-error / distro-mismatch を追加)。
 * 同一名で shadow せず `LaunchFailureReason` として分ける (実装時の統合判断)。
 *
 * ターンの失敗 (O-4 / AD-047 Decision 1): SDK のエラーの result を agents の `classifyResultFailure` が
 * `max-turns` 以降の 8 つに分ける。どれにも当たらない失敗は `provider-error` (汎用)。条件と評価の順・
 * 再ログインの導線の正本は 014 data-model §1。終わり方 (失敗にする・黙って完了にしない。X-1 FR-020 /
 * US-4 AC6) は変えない。失敗の文字列 (`errors`) と HTTP の状態は運ばない。
 */
export type LaunchFailureReason =
  | 'distro-not-running'
  | 'not-verified-running'
  | 'distro-mismatch'
  | 'claude-not-found'
  | 'launch-failed'
  | 'process-crashed'
  | 'stream-protocol-error'
  /** ターンの失敗のうち、下の 8 つのどれにも当たらないもの (状態が無い・知らない subtype)。再ログインの導線あり。 */
  | 'provider-error'
  | 'interrupt-unavailable'
  /** supervisor プロセスの異常終了で、その supervisor の全セッションに付く (X-5 / FR-013)。 */
  | 'supervisor-exited'
  /** result の subtype が `error_max_turns` (O-4)。 */
  | 'max-turns'
  /** result の subtype が `error_max_budget_usd` (O-4)。 */
  | 'max-budget'
  /** result の subtype が `error_max_structured_output_retries` (O-4)。 */
  | 'structured-output-retries'
  /** result の subtype が `error_during_execution` (O-4)。 */
  | 'execution-error'
  /** 認証または権限の失敗 (assistant の認証系の `error`・HTTP 401 / 403。O-4)。再ログインの導線あり。 */
  | 'auth-failed'
  /** 請求またはアカウントの問題 (assistant の `billing_error` / `account_on_hold`。O-4)。 */
  | 'billing'
  /** レート制限 (assistant の `rate_limit`・HTTP 429。O-4)。 */
  | 'rate-limited'
  /** API がエラーを返した (上のどれにも当たらない HTTP の状態。O-4)。 */
  | 'api-error'

export const LAUNCH_FAILURE_REASONS = [
  'distro-not-running',
  'not-verified-running',
  'distro-mismatch',
  'claude-not-found',
  'launch-failed',
  'process-crashed',
  'stream-protocol-error',
  'provider-error',
  'interrupt-unavailable',
  'supervisor-exited',
  'max-turns',
  'max-budget',
  'structured-output-retries',
  'execution-error',
  'auth-failed',
  'billing',
  'rate-limited',
  'api-error'
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

/**
 * launch invoke の拒否理由 (起動とターンの失敗 18 種 + 起動前段 3 種 + 調停由来の 3 種 = 24 種)。訳出は `ui`。
 *
 * 調停由来 (X-5 / FR-005):
 * - `session-limit`: 同時実行数の上限 (10) に達している。X-1 の `session-active` (単一セッション不変) は廃止した (AD-043)
 * - `shutting-down`: アプリの終了処理中
 * - `unknown-target`: 未知の folderId / runtimeId
 */
export type SessionLaunchRejectReason =
  LaunchFailureReason | LaunchPreflightReason | 'session-limit' | 'shutting-down' | 'unknown-target'

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
  /** agents が `toolName === 'AskUserQuestion'` (無害化の前・完全一致) のときだけ付ける (AD-052)。 */
  readonly answerable?: 'ask-user-question'
}

/** 利用者の許可 / 拒否の決定 (data-model §5)。main が enum 検証する。 */
export interface PermissionDecision {
  readonly requestId: string
  readonly outcome: 'allow' | 'deny'
  readonly scope: 'once' | 'capability'
  /** 任意の拒否理由 (表示用)。 */
  readonly message?: string
  /** `AskUserQuestion` の問いの位置ごとの回答 (AD-052)。`outcome: 'allow'` のときだけ意味を持つ。 */
  readonly answers?: readonly string[]
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
  /** 穏当な終了 (`end`) が期限内に終わらず、強制終了に落ちた (X-5 / FR-011。X-1 FR-016 の警告の趣旨を黙って外さない)。 */
  | { readonly kind: 'end-forced' }
  /**
   * 計量の最新の値 (O-4 / AD-047 Decision 2。形と許可リストの正本は `./meter.ts` と 014 data-model §2)。
   * 数・真偽・列挙・モデルの id・形を検証した tool の id だけを運ぶ。状態通知 (`SessionStatusUpdate`) には載せない。
   */
  | { readonly kind: 'meter'; readonly meter: MeterUpdate }
  /** MCP サーバーの問い (Elicitation) の要求 (O-10 / AD-053 Decision 2。形と上限は `./elicitation.ts`)。 */
  | { readonly kind: 'elicitation-request'; readonly request: ElicitationPrompt }

export const SESSION_EVENT_KINDS = [
  'message',
  'state',
  'permission-request',
  'permission-denied',
  'interrupt-receipt',
  'failure',
  'end-forced',
  'meter',
  'elicitation-request'
] as const satisfies readonly SessionEvent['kind'][]

/**
 * `renderer → main` の制御要求 (control plane。data-model §5 / contracts C-1)。
 * renderer → main の検証済み IPC のみが発行できる。起動 (launch) は含まない。
 *
 * - `end` (X-5 / FR-011): 応答待ち (`done`) か中断済み (`interrupted`) のセッションの `claude` を、プロンプトの入力を
 *   閉じて正常終了させる穏当な「終了」。破損の警告は出さない。期限内に終わらなければ強制終了に落ち、`end-forced` を流す
 */
export type SessionControl =
  | { readonly kind: 'send-prompt'; readonly text: string }
  | { readonly kind: 'respond-permission'; readonly decision: PermissionDecision }
  | { readonly kind: 'respond-elicitation'; readonly response: ElicitationResponse }
  | { readonly kind: 'interrupt' }
  | { readonly kind: 'end' }
  | { readonly kind: 'kill' }

/**
 * 稼働セッションの**操作面の概念契約** (data-model §1)。操作語彙は `SessionControl` と一致させる
 * (X-5 で `stop()` を削除した。AD-023 §3 の例示は古くなった — AD-043 Decision 1)。
 *
 * **実体はクラスでなく `agents` のセッションスレッド (`sdk-agent-session.ts` を `worker_threads` の Worker として
 * 起こしたもの)** が実現する — 調停役スレッド経由の制御メッセージ (launch/control) と、文字列化した `SessionEvent`
 * で本 interface の各操作に対応づける (クラス `SdkAgentSession` は持たない)。したがって本 interface は
 * 「宣言 (domain) / 実装 (agents)」の分担 (AD-023 §3) を**操作の語彙**として担い、メッセージ契約の設計基準になる。
 */
export interface AgentSession {
  /** 起動 + stream。yield は逐次 `SessionEvent`。 */
  start(input: LaunchInput): AsyncIterable<SessionEvent>
  /** canUseTool の応答を稼働中セッションへ反映する (`respond-permission`)。 */
  respondPermission(decision: PermissionDecision): void
  /** Elicitation (MCP サーバーの問い) への応答を稼働中セッションへ反映する (`respond-elicitation`。O-10)。 */
  respondElicitation(response: ElicitationResponse): void
  /** AsyncIterable prompt へ push (stdin を開いたまま保つ。FR-011。`send-prompt`)。 */
  sendPrompt(text: string): void
  /** SDK interrupt (stdin 越し control_request。FR-015。`interrupt`)。 */
  interrupt(): Promise<void>
  /** 穏当な終了 (`end`)。プロンプトの入力を閉じて `claude` を正常終了させる。 */
  end(): Promise<void>
  /** 強制終了 (`kill`)。保持している子 (`wsl.exe`) を kill する。 */
  kill(): void
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

/** `AskUserQuestion` の許可の戻り値 (AD-052。元の入力 + `answers` だけを `updatedInput` に載せる)。 */
export interface AskUserQuestionResult {
  readonly behavior: 'allow'
  readonly updatedInput: Readonly<Record<string, unknown>>
}

/** `canUseTool` が返しうる戻り値 (`toPermissionResult` か `toAskUserQuestionResult` の出力)。 */
export type CanUseToolResult = PermissionResultLike | AskUserQuestionResult

/** SDK の tool 名 (無害化の前・完全一致で比較する)。 */
export const ASK_USER_QUESTION_TOOL_NAME = 'AskUserQuestion'
/** 回答の件数の上限 (SDK の問いの数の上限)。 */
export const ANSWER_MAX_COUNT = 4
/** 1 つの回答・Elicitation の文字列の値の上限 (コードポイント)。 */
export const ANSWER_MAX_CODE_POINTS = 1000

function codePointLength(value: string): number {
  return Array.from(value).length
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const proto: unknown = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

/**
 * 回答の検証の述語 (data-model §1。renderer の送る前・main・agents が同じ関数を呼ぶ)。
 * 1〜`ANSWER_MAX_COUNT` 件・全部が文字列・各値が前後の空白を除いて 1 コードポイント以上かつ
 * (除く前で) `ANSWER_MAX_CODE_POINTS` 以下。
 */
export function isPermissionAnswers(value: unknown): value is readonly string[] {
  if (!Array.isArray(value)) return false
  if (value.length < 1 || value.length > ANSWER_MAX_COUNT) return false
  for (const item of value as readonly unknown[]) {
    if (typeof item !== 'string') return false
    if (item.trim().length === 0) return false
    if (codePointLength(item) > ANSWER_MAX_CODE_POINTS) return false
  }
  return true
}

/**
 * `AskUserQuestion` の入力に回答を載せた `updatedInput` を組む純関数 (AD-052)。
 * 形が外れたら `null` (= 拒否として返す)。元の入力の他のキーは変えない (浅い複製)。
 */
export function projectAskUserQuestionAnswer(
  rawInput: unknown,
  answers: readonly string[]
): Record<string, unknown> | null {
  if (!isPlainRecord(rawInput)) return null
  const questions = rawInput.questions
  if (!Array.isArray(questions)) return null
  if (questions.length < 1 || questions.length > ANSWER_MAX_COUNT) return null
  const texts: string[] = []
  for (const q of questions as readonly unknown[]) {
    if (typeof q !== 'object' || q === null) return null
    const text: unknown = (q as { readonly question?: unknown }).question
    if (typeof text !== 'string' || text.length === 0) return null
    texts.push(text)
  }
  if (new Set(texts).size !== texts.length) return null
  if (answers.length !== texts.length) return null
  if (!isPermissionAnswers(answers)) return null
  return {
    ...rawInput,
    answers: Object.fromEntries(texts.map((text, i) => [text, answers[i]]))
  }
}

/**
 * `AskUserQuestion` の決定 → 戻り値の写像 (AD-052)。許可で射影が成功したときだけ `updatedInput` を出す。
 * それ以外は `toPermissionResult` を通る (回答の無い許可・射影の失敗は拒否)。
 */
export function toAskUserQuestionResult(
  decision: PermissionDecision,
  rawInput: unknown
): CanUseToolResult {
  if (decision.outcome === 'deny') return toPermissionResult(decision)
  if (decision.answers === undefined) {
    return toPermissionResult({ ...decision, outcome: 'deny', message: '回答がありません' })
  }
  const updatedInput = projectAskUserQuestionAnswer(rawInput, decision.answers)
  if (updatedInput === null) {
    return toPermissionResult({
      ...decision,
      outcome: 'deny',
      message: '回答を Claude に渡せませんでした。本文で答えてください'
    })
  }
  return { behavior: 'allow', updatedInput }
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
