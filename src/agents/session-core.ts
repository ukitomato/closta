import { isEffortLevel, isValidModelId } from '@domain/provider/model-catalog'
import { assertHelperSettings, type HelperSettings } from '@domain/provider/settings'
import type { EffortLevel } from '@domain/provider/types'
import { assertSafePermissionMode, type SafePermissionMode } from '@domain/session/launch-config'
import {
  boundDecisionScope,
  toPermissionResult,
  type PermissionDecision,
  type PermissionRequest,
  type PermissionResultLike,
  type RuntimeLaunchSpec,
  type SessionControl
} from '@domain/session/agent-session'

/**
 * X-1 の agents 層の**検証可能な核** (SDK を import しない・注入式)。
 *
 * `enumerate.ts` が `enumerate-sessions.ts` から論理を分けたのと同じ形
 * (`sdk-agent-session.ts` は SDK の実 import と Electron の `parentPort` 配線を持つため
 * Vitest から読むと副作用が走る)。**権限ゲートの正の構成 (P1-P3) と spawn 合成という、
 * 4 ラウンドの design-gate が固めた security-critical な不変条件をここで検証する。**
 *
 * 参照: [AD-036](../../docs/decisions/0036-single-session-launch-process-and-live-stream.md) §3-§5 /
 * contracts C-4 / spec FR-013 / SC-006(a)。
 */

/* ── P1: query() options の正の構成 ───────────────────────────────── */

/**
 * `query()` に渡してよい options のキー**許可リスト** (contracts C-4 P1)。
 *
 * **これ以外のキー (`extraArgs` / `allowedTools` / `disallowedTools` /
 * `permissionPromptToolName` / `allowDangerouslySkipPermissions` / `mcpServers` の escalating 設定 等) を
 * 一切含めない** — denylist で個別 API を追わず、キー集合を allowlist に固定して未知の昇格 option も締め出す
 * (design-gate R1→R3 で denylist が 3 度漏れたことへの class-closing 対応)。
 *
 * **`settings` は X-3 の [AD-040](../../docs/decisions/0040-provider-settings-constrained-projection.md) で
 * 追加された** — helper 委譲 (`api-key-helper` / `aws-credential-export`) のため。ただし値は `HelperSettings`
 * (2 キー限定) に型で閉じ、`buildQueryOptions` が `assertHelperSettings` で `permissions`/`permissionMode`/`env` の
 * 混入を実行時に締め出す (昇格面は維持)。`settings` を許すのはこの制約付き射影に限る。
 *
 * **`model` / `effort` は X-4 の [AD-041](../../docs/decisions/0041-x4-launch-config-on-x1-launch-gate.md) (g) で
 * 追加された** — モデルの選択と思考量を変えるだけで、権限面・tool 集合・env を変えない (escalation-neutral)。
 * **集合を変えるには ADR が要る** — `session-core.test.ts` の pin テストがリテラルで固定する。
 */
export const QUERY_OPTION_KEYS = [
  'permissionMode',
  'canUseTool',
  'pathToClaudeCodeExecutable',
  'spawnClaudeCodeProcess',
  'abortController',
  'settings',
  'model',
  'effort'
] as const

/** SDK の `SpawnOptions` の構造だけ (SDK を import しない)。 */
export interface AgentSpawnOptions {
  readonly command: string
  readonly args: readonly string[]
  readonly cwd?: string
  readonly env?: Record<string, string | undefined>
  readonly signal?: AbortSignal
}

/**
 * SDK の `SpawnedProcess` を満たす最小構造 (`child_process.ChildProcess` が充足)。
 * kill の signal 型は `ChildProcess.kill` (`number | NodeJS.Signals`) に合わせる —
 * `string` にすると `Signals` (狭い文字列 union) と双方向に代入不能になり ChildProcess を返せない。
 */
export interface SpawnedLike {
  kill(signal?: NodeJS.Signals | number): boolean
}

/** agents の `spawnClaudeCodeProcess` コールバック型 (構造。SDK 非 import)。 */
export type SpawnClaudeCodeProcess = (options: AgentSpawnOptions) => SpawnedLike

/** `query()` の `canUseTool` コールバック型 (構造。SDK 非 import)。 */
export type CanUseToolLike = (
  toolName: string,
  input: Record<string, unknown>,
  options: { signal: AbortSignal }
) => Promise<PermissionResultLike>

/**
 * 正の構成で組んだ query() options。**キーは `QUERY_OPTION_KEYS` の完全部分集合**である。
 * `permissionMode` は安全 3 値 (`SafePermissionMode`。AD-041 (a))。
 */
export interface BuiltQueryOptions {
  readonly permissionMode: SafePermissionMode
  readonly canUseTool: CanUseToolLike
  readonly pathToClaudeCodeExecutable: string
  readonly spawnClaudeCodeProcess: SpawnClaudeCodeProcess
  readonly abortController: AbortController
  /** helper 委譲の制約付き射影 (X-3。AD-040)。無指定なら helper 委譲なし。 */
  readonly settings?: HelperSettings
  /** モデル (X-4。AD-041 (g))。無指定なら Claude Code の既定。 */
  readonly model?: string
  /** effort (X-4。AD-041 (g))。無指定なら既定。 */
  readonly effort?: EffortLevel
}

export interface BuildQueryOptionsDeps {
  /** 起動設定の権限モード。境界を越えて来るため下で assert する (安全 3 値外は throw)。 */
  readonly permissionMode: SafePermissionMode
  readonly canUseTool: CanUseToolLike
  readonly pathToClaudeCodeExecutable: string
  readonly spawnClaudeCodeProcess: SpawnClaudeCodeProcess
  readonly abortController: AbortController
  /** provider が導出した helper 委譲設定 (X-3。AD-040)。未検証で来るため下で assert する。 */
  readonly settings?: HelperSettings
  readonly model?: string
  readonly effort?: EffortLevel
}

/**
 * query() options を allowlist キーのみで構成する (P1)。
 *
 * **spread / merge / 別変数からの追加キーを作らない** — オブジェクトリテラルで allowlist キーだけを書く。
 * これにより SH-010 の「options のキー集合 ⊆ allowlist」が構造的に満たされる。
 *
 * **`settings` は `assertHelperSettings` を通して載せる** (X-3。AD-040 Decision 3/4) — キー集合 ⊆
 * `{apiKeyHelper, awsCredentialExport}` を実行時に検証し、`permissions`/`permissionMode`/`env` の混入を throw で締め出す
 * (境界通過後に型保証が消えるため。load-bearing gate)。`settings` 無指定なら `undefined` を載せる (helper 委譲なし)。
 *
 * **`permissionMode` は `assertSafePermissionMode` を通す** (X-4 / AD-041 (a))。`model` / `effort` は文字種と enum を
 * 再検証し、外れれば throw する (agents は renderer 由来の値を二重に確かめる。defense-in-depth)。
 */
export function buildQueryOptions(deps: BuildQueryOptionsDeps): BuiltQueryOptions {
  if (deps.model !== undefined && !isValidModelId(deps.model)) {
    throw new Error('buildQueryOptions: model ID が文字種 allowlist の外です (AD-041 (g))')
  }
  if (deps.effort !== undefined && !isEffortLevel(deps.effort)) {
    throw new Error('buildQueryOptions: effort が EffortLevel の外です (AD-041 (g))')
  }
  return {
    permissionMode: assertSafePermissionMode(deps.permissionMode),
    canUseTool: deps.canUseTool,
    pathToClaudeCodeExecutable: deps.pathToClaudeCodeExecutable,
    spawnClaudeCodeProcess: deps.spawnClaudeCodeProcess,
    abortController: deps.abortController,
    settings: assertHelperSettings(deps.settings),
    model: deps.model,
    effort: deps.effort
  }
}

/* ── P2: canUseTool の応答を toPermissionResult に一意化する ───────── */

export interface CanUseToolDeps {
  /** requestId を採番する (相関鍵)。 */
  readonly nextRequestId: () => string
  /** tool 入力を表示用にサニタイズ + JSON 文字列化する。 */
  readonly sanitizeInput: (input: Record<string, unknown>) => string
  /** tool 名をサニタイズする (MCP 由来の表示偽装を防ぐ。H-05)。 */
  readonly sanitizeToolName: (name: string) => string
  /** permission-request を renderer へ発行する。 */
  readonly emitRequest: (request: PermissionRequest) => void
  /** requestId に対する利用者の決定を待つ。 */
  readonly awaitDecision: (requestId: string, signal: AbortSignal) => Promise<PermissionDecision>
}

/**
 * `canUseTool` を生成する (P2)。
 *
 * **全 return を `toPermissionResult` に通す** — インラインで `PermissionResult` を組まない
 * (`updatedPermissions` / `updatedInput` を構造的に出さない。H-401)。
 */
export function createCanUseTool(deps: CanUseToolDeps): CanUseToolLike {
  return async (toolName, input, options): Promise<PermissionResultLike> => {
    const requestId = deps.nextRequestId()
    // 要求 scope は `once` 固定 (capability 付与は I-3。AD-041 (c))。
    const requestScope = 'once' as const
    deps.emitRequest({
      requestId,
      toolName: deps.sanitizeToolName(toolName),
      input: deps.sanitizeInput(input),
      scope: requestScope
    })
    const decision = await deps.awaitDecision(requestId, options.signal)
    // **scope 上限を強制する** — 決定 scope が要求 scope を超えないよう bound してから写像する
    // (`once` 要求に `capability` を受理しない。FR-012 / H-04 / SC-004)。要求 scope を知る唯一の場所。
    return toPermissionResult(boundDecisionScope(decision, requestScope))
  }
}

/* ── 承認往復の照合 (X-5 / FR-007 / SC-005) ─────────────────────── */

export interface PermissionRegistry {
  /** 新しい requestId を採番する (`createCanUseTool` の `nextRequestId` に渡す)。 */
  issue(): string
  /** requestId に決定の受け口を登録する (`createCanUseTool` の `awaitDecision` から呼ぶ)。 */
  register(requestId: string, resolve: (decision: PermissionDecision) => void): void
  /**
   * 決定を該当の受け口へ渡す。**pending に無い requestId (別セッション宛て・未知・応答済み) は何もせず `false`** —
   * SDK のコールバックを解決しない (FR-007)。
   */
  settle(decision: PermissionDecision): boolean
  /** requestId の受け口を外す (中断の signal など)。外したときだけ `true`。 */
  drop(requestId: string): boolean
  /** 残っている受け口をすべて拒否で解決する (kill / end の後始末)。 */
  denyAll(): void
}

/**
 * 承認要求の requestId と決定の受け口の対応を持つ (X-5)。requestId の生成器は注入する —
 * 本番は `globalThis.crypto.randomUUID` (暗号論的乱数。X-1 pr-gate sec L-001 の繰越)。
 */
export function createPermissionRegistry(nextRequestId: () => string): PermissionRegistry {
  const pending = new Map<string, (decision: PermissionDecision) => void>()
  return {
    issue: nextRequestId,
    register(requestId, resolve) {
      pending.set(requestId, resolve)
    },
    settle(decision) {
      const resolve = pending.get(decision.requestId)
      if (resolve === undefined) return false
      pending.delete(decision.requestId)
      resolve(decision)
      return true
    },
    drop(requestId) {
      return pending.delete(requestId)
    },
    denyAll() {
      for (const [requestId, resolve] of pending)
        resolve({ requestId, outcome: 'deny', scope: 'once' })
      pending.clear()
    }
  }
}

/* ── 制御のデコード (調停役スレッドとセッションスレッドで共有。X-5) ─────── */

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

/** 承認の決定を復元する。main が enum 検証済みだが、境界を越えた値として型を回復する。 */
export function decodeDecision(value: unknown): PermissionDecision | null {
  const record = asRecord(value)
  if (record === null) return null
  const { requestId, outcome, scope, message } = record
  if (typeof requestId !== 'string') return null
  if (outcome !== 'allow' && outcome !== 'deny') return null
  if (scope !== 'once' && scope !== 'capability') return null
  return {
    requestId,
    outcome,
    scope,
    ...(typeof message === 'string' ? { message } : {})
  }
}

/** `SessionControl` を復元する。未知の kind・形の崩れは `null`。 */
export function decodeSessionControl(value: unknown): SessionControl | null {
  const control = asRecord(value)
  if (control === null) return null
  switch (control.kind) {
    case 'send-prompt':
      return typeof control.text === 'string' ? { kind: 'send-prompt', text: control.text } : null
    case 'interrupt':
      return { kind: 'interrupt' }
    case 'end':
      return { kind: 'end' }
    case 'kill':
      return { kind: 'kill' }
    case 'respond-permission': {
      const decision = decodeDecision(control.decision)
      return decision === null ? null : { kind: 'respond-permission', decision }
    }
    default:
      return null
  }
}

/* ── 終わらせ方の制御 (X-5 / FR-011 / design-gate R3-H-04) ──────────── */

/** 穏当な終了 (`end`) を受け付ける状態。規則の正本は domain (`run-state.ts`。pr-gate R2 architecture L-104)。 */
export { canEnd } from '@domain/session/run-state'

/**
 * 終了処理中 (kill / `end` を受けた後、`ended` を送るまで) に受け付ける制御か。
 *
 * **終了処理中は `kill` だけを受け付ける** (穏当な終了の途中で強制終了へ切り替えられるようにする)。
 * `send-prompt` / `respond-permission` / `interrupt` / `end` は無視する — `done` で受けた送信が `running` に
 * 戻して run-state を巻き戻し、閉じたキューに入って消えるのを防ぐ (R3-H-04)。
 */
export function acceptsWhileClosing(control: SessionControl): boolean {
  return control.kind === 'kill'
}

/* ── spawnClaudeCodeProcess の合成 (env は spec のみ・argv は配列) ── */

export interface ClaudeSpawnPlan {
  readonly command: string
  readonly args: readonly string[]
  readonly env: Record<string, string>
}

/**
 * WSL 起動の spawn 計画を組む (data-model §8 / AD-036 §3)。
 *
 * - **env は `spec.env` のみ**から構成する — SDK 提供の `options.env` や `process.env` を spread/マージしない
 *   (WSLENV/資格情報の透過を防ぐ。H-01/H-102)。
 * - **argv は配列**で構成し、`command` は `spec.command` (= WSL 起動コマンド。infra 供給。agents はリテラルを持たない)。
 *   cwd は `spec.prefixArgs` の `--cd` で渡し、ホスト cwd に RuntimePath を渡さない (H-03)。
 * - claude の実行パスの後ろに SDK が要求した引数 (`options.args`) を並べる (シェル補間しない。H-05)。
 */
export function composeClaudeSpawn(
  spec: RuntimeLaunchSpec,
  options: AgentSpawnOptions
): ClaudeSpawnPlan {
  return {
    command: spec.command,
    args: [...spec.prefixArgs, spec.pathToClaudeCodeExecutable, ...options.args],
    env: { ...spec.env }
  }
}

/* ── SDK `result` の終端分類 (V-11 / FR-030 / SC-010(H-03)) ─────────── */

export type ResultTermination = { readonly kind: 'complete' } | { readonly kind: 'provider-error' }

/**
 * SDK の `result` メッセージを終端アクションに分類する純関数 (SDK 非 import・テスト可能)。
 *
 * **`subtype==='success'` かつ `is_error===false` のときだけ正常完了**とし、それ以外
 * (認証失敗 / API エラー / max_turns / 実行中エラー等) は terminal な `provider-error` に倒す。
 * **黙って `done` にしない** — 利用者に理由と再ログイン導線を出すため (V-11 / FR-030)。
 * 判定を `sdk-agent-session.ts` にインラインで置かず切り出すのは、この一点が「認証失敗が
 * サイレントに成功扱いされない」ことを保証する security-relevant な分岐だからである。
 */
export function classifyResult(subtype: string, isError: boolean): ResultTermination {
  return subtype === 'success' && isError === false
    ? { kind: 'complete' }
    : { kind: 'provider-error' }
}

/**
 * 分類した `result` をセッションへどう反映するか (X-5 / pr-gate R1 architecture L-001・R2 L-006)。
 * 正常完了は終了処理中でも `complete` (状態は終端の `done` のまま変わらない)。エラー結果は、終了・強制終了の
 * 処理中なら `ignore` — 終わらせた結果として届いたエラーで、終了済みのセッションを「失敗」と出さない。
 */
export function resultAction(
  result: ResultTermination,
  closing: boolean
): 'complete' | 'fail' | 'ignore' {
  if (result.kind === 'complete') return 'complete'
  return closing ? 'ignore' : 'fail'
}
