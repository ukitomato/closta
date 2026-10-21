import { spawn } from 'node:child_process'
import { parentPort } from 'node:worker_threads'

import {
  query,
  type EffortLevel as SdkEffortLevel,
  type McpServerStatus,
  type Options,
  type PermissionMode as SdkPermissionMode,
  type Query,
  type SDKAssistantMessageError,
  type SDKAuthStatusMessage,
  type SDKCommandsChangedMessage,
  type SDKMessage,
  type SDKPluginInstallMessage,
  type SDKRateLimitInfo,
  type SDKResultError,
  type SDKSystemMessage
} from '@anthropic-ai/claude-agent-sdk'

import { isEffortLevel, isValidModelId } from '@domain/provider/model-catalog'
import { assertHelperSettings, isHelperSettings } from '@domain/provider/settings'
import type { EffortLevel } from '@domain/provider/types'
import { classifyClaudeExecutable } from '@domain/runtime/claude-executable'
import { hostPathOps } from '@domain/runtime/path-api'
import { makeHostPath } from '@domain/runtime/path-types'
import { isValidSessionId } from '@domain/validation'
import {
  WIN32_TREE_STOP_ARGS,
  WIN32_TREE_STOP_COMMAND_NAME,
  WSL_LAUNCH_KIND,
  type LaunchFailureReason,
  type LaunchQueryOptions,
  type PermissionDecision,
  type RuntimeLaunchSpec,
  type SessionControl,
  type SessionEvent,
  type Win32LaunchSpec
} from '@domain/session/agent-session'
import {
  assertSafePermissionMode,
  isSafePermissionMode,
  type SafePermissionMode
} from '@domain/session/launch-config'
import { toLiveAssistantMessage } from '@domain/session/live-message'
import type {
  AssistantErrorKey,
  PermissionModeKey,
  RateLimitStatus,
  RateLimitType
} from '@domain/session/meter'
import { nextState, type SessionRunState } from '@domain/session/run-state'
import { sanitizeBody } from '@domain/session/sanitize-body'
import type {
  AuthStatusInput,
  CommandsChangedInput,
  McpStatusKey,
  PluginInstallInput,
  SessionInitReportInput
} from '@domain/session/session-init-report'
import { createForegroundTaskMemory, createTaskRowBuilder } from '@domain/session/foreground-tasks'

import { createLiveSignals } from './live-signals'
import { createLiveToolResultTracker } from './live-tool-results'
import {
  acceptsWhileClosing,
  buildQueryOptions,
  canEnd,
  classifyResult,
  composeClaudeSpawn,
  createCanUseTool,
  createElicitationRegistry,
  createOnElicitation,
  createPermissionRegistry,
  decodeSessionControl,
  resultAction,
  type AgentSpawnOptions,
  type ResultErrorSubtype,
  type SpawnedLike
} from './session-core'

/**
 * **セッションスレッド** — supervisor の中で 1 セッションを受け持つ `worker_threads` の Worker (X-5 / AD-043)。
 * X-1 の per-session `utilityProcess` の SDK 入口を、Worker として動く形に作り替えた。
 *
 * `enumerate-sessions.ts` / `read-transcript.ts` と同じ構え — **SDK の実 import・`child_process.spawn`・
 * 末尾の `main()` を持つため Vitest から読むと副作用が走る**。固定したい不変条件は SDK 非 import の
 * `session-core.ts` (権限ゲートの正の構成 P1-P3 / spawn 合成 / 承認往復の照合 / 終わらせ方) と `@domain/session/*`
 * に切り出して注入で繋ぐ。本ファイルは「配線」だけを持つ。
 *
 * | 規則 | 根拠 |
 * |---|---|
 * | **Agent SDK を呼ぶ場所。`query()` のみ** (戻り値 `Query` のメソッドは `interrupt()` だけ。P3) | Principle IV / contracts C-4 |
 * | **spawn 主体は本ファイル。** `spawnClaudeCodeProcess` コールバックで `child_process.spawn` する | AD-036 §3 / C-7 (`PROCESS_SPAWN_MODULES`) |
 * | **起動コマンド・接頭引数・claude パス・cwd・env は値 (`RuntimeLaunchSpec`) で受ける。リテラルを持たない** | `WSL_FREE_DIRECTORIES` / 検証項目 3 |
 * | **`electron` を import しない** | Principle VII / AD-010 |
 * | **本文・toolName はセッションスレッドでサニタイズ**し、**本文を文字列に直列化して**調停役スレッドへ送る (調停役は解釈しない) | FR-002 / FR-009 (X-1) / AD-043 Decision 2 |
 * | 状態通知の `claudeAlive` は常に true を送る (false にするのは調停役スレッドと main だけ) | FR-004 |
 * | 子の exit は即時に `child-exited` で知らせる。終わるときは必ず子の exit を待ってから `ended` を送る | FR-005 / FR-012 / R3-H-03 |
 * | 終了処理中 (kill / `end` の後) は kill 以外の制御を無視する | FR-011 / R3-H-04 |
 *
 * ## 調停役スレッドとのメッセージ
 *
 * - 受信: `{ kind: 'launch', spec, options }` (最初の 1 回) / `{ kind: 'control', control }`
 * - 送信: `{ kind: 'event', payload: string }` (本文) / `{ kind: 'status', state, reasonKey, claudeAlive: true }` /
 *   `{ kind: 'child-exited' }` / `{ kind: 'ended' }`。sessionId は載せない — 調停役スレッドが Worker から付ける
 */

/*
 * ── domain が手で持つ型と SDK 型の一致 (X-4 / AD-042 / design-gate R1 arch L-003) ──
 * domain は SDK を import できないため `EffortLevel` / `SafePermissionMode` を手書きしている。
 * SDK を更新して値域が変わったら、ここが tsc で落ちる (AD-020 Consequences「版が上がれば型は増減する」)。
 */
type Equal<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false
const effortLevelMatchesSdk: Equal<EffortLevel, SdkEffortLevel> = true
const safeModeIsSdkMode: SafePermissionMode extends SdkPermissionMode ? true : false = true
void effortLevelMatchesSdk
void safeModeIsSdkMode
// 計量と失敗の理由の列挙 (O-4 / 014 data-model §2 / plan RK-05)。値域は domain の `meter.ts` と `session-core.ts` が持つ。
type KnownPermissionModeKey = Exclude<PermissionModeKey, 'unknown'>
type SdkRateLimitType = NonNullable<SDKRateLimitInfo['rateLimitType']>
const permissionModeKeyMatchesSdk: Equal<KnownPermissionModeKey, SdkPermissionMode> = true
const rateLimitStatusMatchesSdk: Equal<RateLimitStatus, SDKRateLimitInfo['status']> = true
const rateLimitTypeMatchesSdk: Equal<RateLimitType, SdkRateLimitType> = true
const assistantErrorMatchesSdk: Equal<AssistantErrorKey, SDKAssistantMessageError> = true
const resultErrorSubtypeMatchesSdk: Equal<ResultErrorSubtype, SDKResultError['subtype']> = true
void permissionModeKeyMatchesSdk
void rateLimitStatusMatchesSdk
void rateLimitTypeMatchesSdk
void assistantErrorMatchesSdk
void resultErrorSubtypeMatchesSdk
// 構成と出来事の入力型 (O-5 / 015 data-model §2)。domain が手で書いた「読むフィールドだけ」の型に SDK の型が代入できる
// (一方向)。SDK がフィールドを消す・型を変えると tsc で落ちる。MCP の状態の値域は `unknown` を除いて SDK と一致させる。
const initInputFromSdk: SDKSystemMessage extends SessionInitReportInput ? true : false = true
const commandsInputFromSdk: SDKCommandsChangedMessage extends CommandsChangedInput ? true : false =
  true
const authInputFromSdk: SDKAuthStatusMessage extends AuthStatusInput ? true : false = true
const pluginInputFromSdk: SDKPluginInstallMessage extends PluginInstallInput ? true : false = true
const mcpStatusMatchesSdk: Equal<Exclude<McpStatusKey, 'unknown'>, McpServerStatus['status']> = true
void initInputFromSdk
void commandsInputFromSdk
void authInputFromSdk
void pluginInputFromSdk
void mcpStatusMatchesSdk
// `Query` の自前のメソッドの網羅 (O-5 / 015 research R-06 (2) / AD-036 §4 P3 / AD-048 Decision 2)。
// 呼ぶのは `interrupt` だけ。残りを項目 16 の denylist (`QueryMutationMethod`。変更系と、accepted の ADR が呼ばないと
// 決めた読み取り = AD-047 Decision 4 の `getContextUsage` / `usage_EXPERIMENTAL…`) と、それ以外の呼ばないメソッド
// (`QueryUnusedReadMethod`) に分ける。`QueryUnusedReadMethod` の分類は呼び出しを禁じない (項目 16 の検査の対象外)。
// `close` は後始末で、`promptQueue.close()` と綴りが衝突するため denylist に足せない。
// SDK の版上げでメソッドが増減すると tsc で落ちる — 分類を決め直し、denylist なら `allowlists.mjs` の
// `QUERY_MUTATION_METHODS` にも同じ PR で足す (`tests/docs/query-mutation-methods.test.ts` が union と配列の一致を見る)。
// `QueryMutationMethod` は 1 行に 1 つのリテラルで書く (pin テストがソースから抜き出す)。
type QueryOwnMethod = Exclude<keyof Query, keyof AsyncGenerator<SDKMessage, void>>
type QueryMutationMethod =
  | 'setPermissionMode'
  | 'setMcpPermissionModeOverride'
  | 'applyFlagSettings'
  | 'updateSettings'
  | 'setModel'
  | 'setMaxThinkingTokens'
  | 'mcpServerStatus'
  | 'reconnectMcpServer'
  | 'toggleMcpServer'
  | 'setMcpServers'
  | 'reloadPlugins'
  | 'reloadSkills'
  | 'rewindFiles'
  | 'stopTask'
  | 'seedReadState'
  | 'streamInput'
  | 'reinitialize'
  | 'reloadOutputStyles'
  | 'backgroundTasks'
  | 'getContextUsage'
  | 'usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET'
  | 'readFile'
type QueryUnusedReadMethod =
  | 'initializationResult'
  | 'supportedCommands'
  | 'supportedModels'
  | 'supportedAgents'
  | 'accountInfo'
  | 'close'
type QueryClassifiedMethod = 'interrupt' | QueryMutationMethod | QueryUnusedReadMethod
const queryMethodsAreClassified: Equal<Exclude<QueryOwnMethod, QueryClassifiedMethod>, never> = true
const queryClassifiedMethodsExist: QueryClassifiedMethod extends keyof Query ? true : false = true
void queryMethodsAreClassified
void queryClassifiedMethodsExist

/** 子 (`wsl.exe`) の exit を待つ期限 (kill / `end` / 終了時。spec Assumptions [ASSUMED])。 */
const CHILD_EXIT_TIMEOUT_MS = 3000

/** Win32 のプロセス木の停止 (停止のコマンドの実行 + 子の exit) の期限 (X-8 / data-model §9.3)。過ぎたら記録して先へ進む。 */
const TREE_STOP_TIMEOUT_MS = 5000

/* ── 調停役スレッドとの経路 (worker_threads の parentPort。構造だけで受ける) ── */

interface CoordinatorPort {
  on(event: 'message', listener: (data: unknown) => void): void
  postMessage(message: unknown): void
}

/* ── 開いたまま保つ prompt キュー (FR-011。stdin を閉じない) ───────────── */

interface PromptItem {
  readonly type: 'user'
  readonly message: { readonly role: 'user'; readonly content: string }
  readonly parent_tool_use_id: null
}

/**
 * 未消費プロンプトの件数上限 (defense-in-depth。CWE-770)。1 件あたりのバイト長は main が
 * `MAX_PROMPT_BYTES` で縛るが、件数は縛らないため上限を設ける。超過時は最古を落とす
 * (X-5 でも据え置き。超過の通知は X-6)。
 */
const MAX_QUEUED_PROMPTS = 1000

/**
 * `query({ prompt })` に渡す AsyncIterable。**`close()` まで開いたまま**にして次の `sendPrompt` を待つ
 * (`sendPrompt` は同一セッションへの継続。FR-011 / data-model §4)。`close()` すると SDK の入力が終わり、
 * `claude` は正常終了する (穏当な終了 `end` の実体)。
 */
class PromptQueue {
  private readonly buffered: PromptItem[] = []
  private waiting: ((item: PromptItem | null) => void) | null = null
  private closed = false

  push(text: string): void {
    const item: PromptItem = {
      type: 'user',
      message: { role: 'user', content: text },
      parent_tool_use_id: null
    }
    const resume = this.waiting
    if (resume !== null) {
      this.waiting = null
      resume(item)
    } else {
      if (this.buffered.length >= MAX_QUEUED_PROMPTS) this.buffered.shift()
      this.buffered.push(item)
    }
  }

  close(): void {
    this.closed = true
    const resume = this.waiting
    if (resume !== null) {
      this.waiting = null
      resume(null)
    }
  }

  async *iterate(): AsyncGenerator<PromptItem> {
    for (;;) {
      const next = this.buffered.shift()
      if (next !== undefined) {
        yield next
        continue
      }
      if (this.closed) return
      const item = await new Promise<PromptItem | null>((resolve) => {
        this.waiting = resolve
      })
      if (item === null) return
      yield item
    }
  }
}

/* ── サニタイズ (会話由来値は境界へ出す前に必ず通す。C-3) ─────────────── */

function sanitizeToolName(name: string): string {
  return sanitizeBody(name).value
}

function sanitizeToolInput(input: Record<string, unknown>): string {
  let json: string
  try {
    json = JSON.stringify(input) ?? ''
  } catch {
    json = ''
  }
  return sanitizeBody(json).value
}

/** interrupt 応答から `still_queued` を構造的に取り出す (無ければ空。AD-018 Open Q)。 */
function extractStillQueued(receipt: unknown): readonly string[] {
  if (typeof receipt !== 'object' || receipt === null) return []
  const queued = (receipt as { still_queued?: unknown }).still_queued
  if (!Array.isArray(queued)) return []
  return queued.filter((id): id is string => typeof id === 'string')
}

/* ── 入口メッセージのデコード (調停役スレッド経由で main 検証済みだが型を回復する) ─ */

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null
}

/**
 * launch メッセージの `options` を復元する (X-4 FR-005 / AD-040 Decision 2)。
 *
 * **main と同じ述語で再検証し、未知キーを捨てる。** 不正なら `null` (起動しない)。
 * permissionMode は既定値を補わない — 欠けていれば拒否する (昇格の余地を作らない)。
 * settings の値にバックスラッシュが無いこと (HostPath / UNC の漏出でない) も確かめる (AD-036 §3)。
 */
function decodeLaunchOptions(value: unknown): LaunchQueryOptions | null {
  const o = asRecord(value)
  if (o === null) return null
  if (!isSafePermissionMode(o.permissionMode)) return null
  if (o.model !== undefined && !isValidModelId(o.model)) return null
  if (o.effort !== undefined && !isEffortLevel(o.effort)) return null
  // 再開する会話の id (X-9 / AD-059)。UUID の形でなければ起動しない。
  if (o.resume !== undefined && !isValidSessionId(o.resume)) return null
  if (o.settings !== undefined) {
    if (!isHelperSettings(o.settings)) return null
    if (Object.values(o.settings).some((v) => typeof v === 'string' && v.includes('\\')))
      return null
  }
  return {
    permissionMode: assertSafePermissionMode(o.permissionMode),
    ...(o.model !== undefined ? { model: o.model } : {}),
    ...(o.effort !== undefined ? { effort: o.effort } : {}),
    ...(o.settings !== undefined ? { settings: assertHelperSettings(o.settings) } : {}),
    ...(o.resume !== undefined ? { resume: o.resume } : {})
  }
}

interface DecodedLaunch {
  readonly spec: RuntimeLaunchSpec
  readonly options: LaunchQueryOptions
}

function decodeLaunch(data: unknown): DecodedLaunch | null {
  const record = asRecord(data)
  if (record === null || record.kind !== 'launch') return null
  const spec = decodeLaunchSpec(record.spec)
  const options = decodeLaunchOptions(record.options)
  if (spec === null || options === null) return null
  return { spec, options }
}

/** `kind` で分ける。`kind` が無い・WSL の値 (`WSL_LAUNCH_KIND`) は今の WSL の規則 (返す値に `kind` を付けない)。`'win32'` は別の関数。それ以外は null。 */
function decodeLaunchSpec(value: unknown): RuntimeLaunchSpec | null {
  const spec = asRecord(value)
  if (spec === null) return null
  if (spec.kind === 'win32') return decodeWin32LaunchSpec(spec)
  if (spec.kind !== undefined && spec.kind !== WSL_LAUNCH_KIND) return null
  return decodeWslLaunchSpec(spec)
}

/** 文字列の値だけを写す env。 */
function copyStringEnv(value: unknown): Record<string, string> | null {
  const record = asRecord(value)
  if (record === null || Array.isArray(record)) return null
  const out: Record<string, string> = {}
  for (const [key, val] of Object.entries(record)) {
    if (typeof val === 'string') out[key] = val
  }
  return out
}

/** Win32 の起動の値の検査 (data-model §5.2)。値の判定は domain の定数と述語だけを使う (FR-014)。 */
function decodeWin32LaunchSpec(spec: Record<string, unknown>): Win32LaunchSpec | null {
  const { pathToClaudeCodeExecutable, command, cwd, windowsHide, stop } = spec
  if (typeof pathToClaudeCodeExecutable !== 'string') return null
  if (classifyClaudeExecutable(pathToClaudeCodeExecutable) !== 'exe') return null
  if (command !== pathToClaudeCodeExecutable) return null
  if (typeof cwd !== 'string' || !makeHostPath(cwd).ok) return null
  if ('prefixArgs' in spec) return null
  if (windowsHide !== true) return null

  const env = copyStringEnv(spec.env)
  if (env === null || Object.keys(env).some((k) => /^(WSLENV|WSL_UTF8)$/i.test(k))) return null

  const stopRecord = asRecord(stop)
  if (stopRecord === null || Array.isArray(stopRecord)) return null
  const { command: stopCommand, argsBeforePid } = stopRecord
  if (typeof stopCommand !== 'string') return null
  const stopPath = makeHostPath(stopCommand)
  if (!stopPath.ok) return null
  if (
    hostPathOps.basename(stopPath.path).toLowerCase() !== WIN32_TREE_STOP_COMMAND_NAME.toLowerCase()
  ) {
    return null
  }
  if (
    !Array.isArray(argsBeforePid) ||
    argsBeforePid.length !== WIN32_TREE_STOP_ARGS.length ||
    !WIN32_TREE_STOP_ARGS.every((arg, i) => argsBeforePid[i] === arg)
  ) {
    return null
  }
  const stopEnv = copyStringEnv(stopRecord.env)
  if (stopEnv === null) return null

  return {
    kind: 'win32',
    pathToClaudeCodeExecutable,
    command: pathToClaudeCodeExecutable,
    cwd,
    env,
    windowsHide: true,
    stop: { command: stopCommand, argsBeforePid: [...WIN32_TREE_STOP_ARGS], env: stopEnv }
  }
}

function decodeWslLaunchSpec(spec: Record<string, unknown>): RuntimeLaunchSpec | null {
  const { pathToClaudeCodeExecutable, command, prefixArgs, env } = spec
  if (typeof pathToClaudeCodeExecutable !== 'string' || typeof command !== 'string') return null
  if (!Array.isArray(prefixArgs) || !prefixArgs.every((a) => typeof a === 'string')) return null
  // **AD-036 §3: agents は HostPath / UNC が argv に漏れないことを検証する** (defense-in-depth。
  // main の `assertNoBackslash` に加える二重層)。WSL 起動の argv 要素 (RuntimePath / distro 名) は
  // バックスラッシュを含まない — 含むなら HostPath (`C:\...`) か UNC (`\\wsl$\...`) の漏出であり拒否する。
  const argvValues: string[] = [pathToClaudeCodeExecutable, ...(prefixArgs as string[])]
  if (argvValues.some((v) => v.includes('\\'))) return null
  const envRecord = asRecord(env)
  if (envRecord === null) return null
  const normalizedEnv: Record<string, string> = {}
  for (const [key, val] of Object.entries(envRecord)) {
    if (typeof val === 'string') normalizedEnv[key] = val
  }
  return { pathToClaudeCodeExecutable, command, prefixArgs: [...prefixArgs], env: normalizedEnv }
}

function decodeControl(data: unknown): SessionControl | null {
  const record = asRecord(data)
  if (record === null || record.kind !== 'control') return null
  return decodeSessionControl(record.control)
}

/* ── セッション本体 (1 Worker = 1 セッション) ───────────────────────── */

/** 制御シンク。`main()` のループが検証済み control をここへ流す。 */
let controlSink: ((control: SessionControl) => void) | null = null

/** セッションスレッドの未捕捉の例外を受ける口 (`main()` が process に 1 回だけ登録する)。 */
let fatalSink: (() => void) | null = null

async function run(
  coordinator: CoordinatorPort,
  spec: RuntimeLaunchSpec,
  launchOptions: LaunchQueryOptions
): Promise<void> {
  const promptQueue = new PromptQueue()
  const abortController = new AbortController()
  const permissions = createPermissionRegistry(() => globalThis.crypto.randomUUID())
  // MCP サーバーの問い (Elicitation) の待ち (O-10 / AD-053。保持するのは resolve と要求の形だけで、入力の値は持たない)。
  const elicitations = createElicitationRegistry(() => globalThis.crypto.randomUUID())
  // 実行中の tool の結果の対応 (data-model §3。closure に置く — module スコープに置かない)。
  const toolResults = createLiveToolResultTracker()
  // 前景で始まった task の記憶と行の包み (O-11 / AD-056。1 つのセッションスレッドに 1 つ。永続化しない)。
  const taskRows = createTaskRowBuilder(createForegroundTaskMemory())
  let state: SessionRunState = 'idle'
  let reasonKey: LaunchFailureReason | null = null
  let queryHandle: (Pick<Query, 'interrupt'> & AsyncIterable<SDKMessage>) | null = null
  let spawnedChild: (SpawnedLike & { exitCode?: number | null; pid?: number }) | null = null
  let childExited = false
  // Win32 の起動のときだけ非 null。停止の手続き (§9.1) の対象かどうかを決める。
  const win32Spec: Win32LaunchSpec | null = spec.kind === 'win32' ? spec : null
  let treeStop: Promise<void> | null = null
  const childExitWaiters: (() => void)[] = []
  // 初 stream/ready を受けたか (launching → running を 1 回だけ発火する)。
  let sawFirstMessage = false
  // 利用者が最初のプロンプトを送ったか。**送る前の通知では launching → running にしない** —
  // claude 2.1.285 は起動直後 (初回 user メッセージの前) に `system/commands_changed` を出す (X-4 quickstart で実測)。
  let promptSent = false
  // 終了処理中 (kill / end を受けた後)。kill 以外の制御を無視し、stream の例外を失敗として扱わない (R3-H-04)。
  let closing = false
  // 穏当な終了 (end) の途中か / 強制終了に落としたか。
  let ending = false
  let endForced = false
  // terminal error (provider-error / stream-protocol-error) に達したか。
  let terminated = false
  let finished = false
  // 再開 (X-9 / AD-059): 最初の `system/init` を受けたか。会話の id の送出・権限モードの検査・`resume-failed` の分岐の鍵。
  let sawInit = false

  const post = (message: unknown): void => coordinator.postMessage(message)
  const postStatus = (): void => post({ kind: 'status', state, reasonKey, claudeAlive: true })
  // **本文はここで文字列に直列化する** — 調停役スレッドは解釈せずに中継する (AD-043 Decision 2)。
  const emit = (event: SessionEvent): void =>
    post({ kind: 'event', payload: JSON.stringify(event) })
  // 実行中の信号 (計量・失敗の理由の材料・O-4 の行) の分岐 (O-4 / 014 research R-14。closure に置く — module スコープに置かない)。
  const signals = createLiveSignals({
    launchPermissionMode: launchOptions.permissionMode,
    emit,
    // 取り消し (O-6 / 016 data-model §1)。tool の結果の追跡から外し、開発用のログに件数だけ残す (id・本文は書かない)。
    onRetract: ({ ids, instructed, dropped }) => {
      const { unmatched } = toolResults.retract(ids)
      process.stderr.write(
        `[retraction] instructed=${instructed} dropped=${dropped} unmatched=${unmatched}\n`
      )
    },
    clock: {
      now: () => Date.now(),
      setTimer: (callback, ms) => setTimeout(callback, ms),
      clearTimer: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>)
    }
  })

  const transition = (action: Parameters<typeof nextState>[1]): void => {
    const next = nextState(state, action)
    if (next !== state) {
      state = next
      emit({ kind: 'state', state })
      postStatus()
    }
  }

  // closure で書き換わる state を読む (制御フローの絞り込みで古い型に固定されないよう関数で読む)。
  const isErrored = (): boolean => state === 'error'

  const fail = (reason: LaunchFailureReason): void => {
    reasonKey = reason
    // 理由 (`failure`) を `state: error` より先に送る — renderer は `state: error` で行を「失敗」にし、その場で読み上げと
    // 失敗の表示を組むので、そのときに理由が届いている必要がある (O-4 / 014 spec US-1 AC5)。
    emit({ kind: 'failure', reasonKey: reason })
    transition({ kind: 'fail' })
    postStatus()
  }

  /**
   * 子 (claude) の終わり・stream の終わりを失敗にするときの理由 (X-9 / data-model §6.4)。
   * 再開の起動で最初の `init` の前なら `resume-failed` (会話の記録が見つからない・読めない)、それ以外は今の理由。
   */
  const crashReason = (fallback: LaunchFailureReason): LaunchFailureReason =>
    launchOptions.resume !== undefined && !sawInit ? 'resume-failed' : fallback

  // 孫 (wsl.exe) を kill する。**closure に閉じる** (spawnedChild は closure でしか代入されないため)。
  const killSpawnedChild = (): void => {
    if (spawnedChild !== null && !childExited) spawnedChild.kill('SIGTERM')
  }

  const waitChildExit = (timeoutMs: number): Promise<boolean> => {
    if (spawnedChild === null || childExited) return Promise.resolve(true)
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve(false), timeoutMs)
      childExitWaiters.push(() => {
        clearTimeout(timer)
        resolve(true)
      })
    })
  }

  /**
   * Win32 のプロセス木の停止 (data-model §9.1)。claude が生きている間に、spec の停止の指示で木ごと止める。
   * 2 回目以降は同じ待ちを返す。停止のコマンドの起動の失敗・非 0 では子を直接 kill に落とす。
   * 全体の期限は `TREE_STOP_TIMEOUT_MS`。過ぎたら記録して先へ進む (閉じる操作を止めない)。
   * 記録は固定の語と終了コードの数だけ (パス・pid・env を出さない)。
   */
  const stopTree = (win: Win32LaunchSpec): Promise<void> => {
    if (treeStop !== null) return treeStop
    const child = spawnedChild
    if (child === null || childExited) return Promise.resolve()
    treeStop = (async (): Promise<void> => {
      let timer: ReturnType<typeof setTimeout> | undefined
      const deadline = new Promise<'timeout'>((resolve) => {
        timer = setTimeout(() => resolve('timeout'), TREE_STOP_TIMEOUT_MS)
      })
      const childGone = (): Promise<'exited'> =>
        childExited
          ? Promise.resolve('exited')
          : new Promise((resolve) => childExitWaiters.push(() => resolve('exited')))
      try {
        const pid = child.pid
        if (pid === undefined) {
          process.stderr.write('[tree-stop] fallback exit=-1\n')
          child.kill('SIGTERM')
        } else {
          const stopRun = new Promise<number>((resolve) => {
            try {
              const stopChild = spawn(win.stop.command, [...win.stop.argsBeforePid, String(pid)], {
                env: { ...win.stop.env },
                shell: false,
                windowsHide: win.windowsHide,
                stdio: 'ignore'
              })
              stopChild.once('error', () => resolve(-1))
              stopChild.once('exit', (code) => resolve(code ?? -1))
            } catch {
              resolve(-1)
            }
          })
          const result = await Promise.race([stopRun, deadline])
          if (result === 'timeout') {
            process.stderr.write('[tree-stop] timeout\n')
            return
          }
          if (result !== 0 && !childExited) {
            process.stderr.write(`[tree-stop] fallback exit=${result}\n`)
            child.kill('SIGTERM')
          }
        }
        if ((await Promise.race([childGone(), deadline])) === 'timeout') {
          process.stderr.write('[tree-stop] timeout\n')
        }
      } finally {
        clearTimeout(timer)
      }
    })()
    return treeStop
  }

  /**
   * 終わり方を問わず 1 回だけ通る出口。子が生きていれば止めて exit を待ち、`ended` を送る (R3-H-03)。
   * 調停役スレッドは `ended` を受けて Worker を terminate する。
   */
  const finish = async (): Promise<void> => {
    if (finished) return
    finished = true
    // 間引きの保留と timer を最初に捨てる (`ended` の後に `event` を送らない。014 spec SC-004)。
    signals.dispose()
    permissions.denyAll()
    elicitations.cancelAll()
    // Win32: 子が生きていて穏当な終了の途中でなければ、キューを閉じる前に木ごと止める (§9.2)。
    if (win32Spec !== null && !ending) await stopTree(win32Spec)
    promptQueue.close()
    if (!childExited && ending) {
      // 穏当な終了の途中: 期限まで正常終了を待ち、だめなら強制終了に落としてその旨を示す。
      if (!(await waitChildExit(CHILD_EXIT_TIMEOUT_MS))) forceEnd()
    }
    if (!childExited) {
      if (win32Spec !== null) {
        // stopTree が自分の期限で待つ (ここで更に待たない)。
        await stopTree(win32Spec)
      } else {
        killSpawnedChild()
        await waitChildExit(CHILD_EXIT_TIMEOUT_MS)
      }
    }
    post({ kind: 'ended' })
  }

  /** 穏当な終了を強制終了に落とす。`end-forced` は 1 回だけ流す (X-1 FR-016 の趣旨を黙って外さない)。 */
  const forceEnd = (): void => {
    if (endForced || childExited) return
    endForced = true
    emit({ kind: 'end-forced' })
    if (win32Spec !== null) {
      // 木ごと止めてから abort する (§9.2)。
      void stopTree(win32Spec).then(() => abortController.abort())
      return
    }
    killSpawnedChild()
    abortController.abort()
  }

  /**
   * 強制終了の共通の手順 (kill / 最初のプロンプトの前の end)。WSL は kill → deny → abort → close (同期)、
   * Win32 は deny → 木の停止を待つ → abort → close (§9.2)。
   */
  const terminateNow = (): void => {
    if (win32Spec === null) killSpawnedChild()
    permissions.denyAll()
    elicitations.cancelAll()
    if (win32Spec !== null && spawnedChild !== null && !childExited) {
      void stopTree(win32Spec).then(() => {
        abortController.abort()
        promptQueue.close()
      })
    } else {
      abortController.abort()
      promptQueue.close()
    }
    // spawn 前 (launching) の kill は query の stream が終わらないことがあるので、ここからも出口を通す。
    if (spawnedChild === null) void finish()
  }

  const canUseTool = createCanUseTool({
    nextRequestId: permissions.issue,
    sanitizeInput: sanitizeToolInput,
    sanitizeToolName,
    emitRequest: (request) => {
      transition({ kind: 'permission-request' })
      emit({ kind: 'permission-request', request })
    },
    awaitDecision: (requestId, signal) =>
      new Promise<PermissionDecision>((resolve) => {
        permissions.register(requestId, resolve)
        signal.addEventListener(
          'abort',
          () => {
            if (permissions.drop(requestId)) resolve({ requestId, outcome: 'deny', scope: 'once' })
          },
          { once: true }
        )
      })
  })

  // 承認と Elicitation の待ちが両方とも無くなったときだけ `running` に戻す (RK-07)。
  const resumeIfIdle = (): void => {
    if (permissions.size() + elicitations.size() === 0) transition({ kind: 'permission-respond' })
  }

  // MCP サーバーの問い。要求を出すときは承認と同じ `permission-request` の遷移 (RK-07)。応答は `elicitations.settle` が決める。
  const onElicitation = createOnElicitation({
    registry: elicitations,
    emitRequest: (prompt) => {
      transition({ kind: 'permission-request' })
      emit({ kind: 'elicitation-request', request: prompt })
    },
    // SDK の側の中断 (U-10)。renderer には知らせず、最後の待ちなら `running` に戻す。
    onAborted: () => resumeIfIdle()
  })

  const spawnClaudeCodeProcess = (options: AgentSpawnOptions): SpawnedLike => {
    /*
     * **終了処理に入った後は子を起こさない** (pr-gate R2 platform-boundary L-102)。abort の後に SDK が spawn を呼ぶと、
     * `ended` を送った後に wsl.exe が起き、調停役スレッドがこのスレッドを止めたときに子だけが残る (AD-043 Decision 5 の残余と同じ形)。
     * 例外は SDK の stream の例外として catch に届き、終了処理中なので失敗にはならない。
     */
    if (closing || finished) throw new Error('session is closing')
    // env は `spec.env` のみ・argv は配列 (composeClaudeSpawn が合成)。SDK 提供 env / process.env を混ぜない (H-01)。
    const plan = composeClaudeSpawn(spec, options)
    const child = spawn(plan.command, [...plan.args], {
      env: plan.env,
      shell: false,
      ...(plan.cwd !== undefined ? { cwd: plan.cwd } : {}),
      ...(plan.windowsHide !== undefined ? { windowsHide: plan.windowsHide } : {})
    })
    spawnedChild = child
    child.once('exit', () => {
      childExited = true
      /*
       * **終了処理の外で子が終わったら異常終了** (FR-012)。子が自分から終わるのは、こちらが入力を閉じたとき (end /
       * finish) か kill したときだけである。応答待ち (`done`) の間に `wsl.exe` が落ちると SDK の stream は例外なく
       * 終わるため、ここで拾わないと失敗ではなく「終了済み」に見える (SH-022 の実機で確認)。
       */
      if (!closing && !finished && !isErrored()) fail(crashReason('process-crashed'))
      // **子の exit は即時に知らせる** — 枠の解放 (claudeAlive: false) は調停役スレッドが行う (FR-005)。
      post({ kind: 'child-exited' })
      for (const resolve of childExitWaiters.splice(0)) resolve()
    })
    return child
  }

  // セッションスレッドの例外 (JS 例外) も、子を止めてから終わる (FR-012 / R3-H-03)。登録は main() で 1 回。
  fatalSink = () => {
    if (!finished && !closing) fail('process-crashed')
    void finish()
  }

  // 制御シンク: 検証済みの control をセッション状態へ反映する。
  controlSink = (control) => {
    if (closing && !acceptsWhileClosing(control)) return
    switch (control.kind) {
      case 'send-prompt':
        promptSent = true
        promptQueue.push(control.text)
        transition({ kind: 'send-prompt' })
        break
      case 'respond-permission':
        if (permissions.settle(control.decision)) resumeIfIdle()
        break
      case 'respond-elicitation':
        // 中断済み・応答済み・未知の requestId は `settle` が false を返し、何も起こさない (U-10)。
        if (elicitations.settle(control.response)) resumeIfIdle()
        break
      case 'interrupt':
        transition({ kind: 'interrupt' })
        void queryHandle
          ?.interrupt()
          .then((receipt) => {
            emit({
              kind: 'interrupt-receipt',
              stillQueued: extractStillQueued(receipt),
              cancelled: []
            })
          })
          .catch(() => {
            emit({ kind: 'failure', reasonKey: 'interrupt-unavailable' })
          })
        break
      case 'end':
        // 穏当な終了: 応答待ち・中断済み・最初のプロンプト待ちのときだけ。プロンプトの入力を閉じて claude を正常終了させる。
        if (!canEnd(state, promptSent)) break
        closing = true
        if (!promptSent) {
          /*
           * **最初のプロンプトの前は、入力を閉じても claude は自分から終わらない** (実 claude で確認: 期限切れで
           * 強制終了に落ちた)。この時点の claude は会話の履歴 (JSONL) をまだ書いていないので、子を止めても壊れるものが無い。
           * 期限を待たずに止め、破損の警告 (`end-forced`) は出さない (pr-gate R1 po H-001)。
           */
          transition({ kind: 'kill' })
          terminateNow()
          break
        }
        ending = true
        transition({ kind: 'kill' })
        promptQueue.close()
        // 期限内に終わらなければ強制終了に落とす (SDK の stream が終わらないままの場合)。
        void waitChildExit(CHILD_EXIT_TIMEOUT_MS).then((exited) => {
          if (!exited) forceEnd()
        })
        break
      case 'kill':
        closing = true
        transition({ kind: 'kill' })
        // Windows の親 kill は孫 (WSL) に伝播しないため、保持した子プロセスを直接 kill する (C-6)。
        // Win32 は木ごと止めてから abort / close (terminateNow。§9.2)。
        terminateNow()
        break
    }
  }

  try {
    // 権限ゲートは正の構成 (allowlist) で組む。options のキー集合は buildQueryOptions が固定する (P1)。
    // 各値は buildQueryOptions が assert し直す (安全 3 値・文字種・enum・2 キー射影)。
    const options = buildQueryOptions({
      permissionMode: assertSafePermissionMode(launchOptions.permissionMode),
      canUseTool,
      pathToClaudeCodeExecutable: spec.pathToClaudeCodeExecutable,
      spawnClaudeCodeProcess,
      abortController,
      settings: assertHelperSettings(launchOptions.settings),
      model: launchOptions.model,
      effort: launchOptions.effort,
      onElicitation,
      resume: launchOptions.resume
    })

    transition({ kind: 'launch' })

    /*
     * **SDK 境界の変位のみを解消するキャスト。** options のキー集合 ⊆ allowlist は buildQueryOptions
     * (SDK 非 import・テスト済み) と SH-010 fixture が構造的に保証する。ここで鍵を足していない。
     */
    queryHandle = query({ prompt: promptQueue.iterate(), options: options as unknown as Options })
    for await (const message of queryHandle) {
      // 受信時刻は 1 件につき 1 回だけ取る (同じ SDK のメッセージから作る DTO は同じ値。O-9 / AD-051)。
      const receivedAt = Date.now()
      if (!sawFirstMessage && promptSent) {
        sawFirstMessage = true
        transition({ kind: 'ready' }) // launching → running (他状態では no-op)
      }
      switch (message.type) {
        case 'assistant': {
          // 拒否で置き換えられた応答の取り消しは、代わりのメッセージを送る前に送る (O-6 / 016 data-model §1)。
          if (message.supersedes !== undefined) signals.onRetraction(message.supersedes)
          const dto = toLiveAssistantMessage(message, receivedAt)
          // subagent の中のメッセージ (`parent_tool_use_id` が文字列) は親の tool-call の `children` に入れて、根を送り直す
          // (O-11 / AD-055)。親が分からない・形が外れたものは主ループの位置に平らに送る (孤児)。
          const parentToolUseId: unknown = message.parent_tool_use_id
          const nested =
            typeof parentToolUseId === 'string' ? toolResults.nest(dto, parentToolUseId) : null
          if (nested === null || nested.kind === 'orphan') {
            // 結果待ちの tool_use を覚える (結果は後の user メッセージで同じ id に埋めて送り直す。O-2 / FR-007)。
            toolResults.trackAssistant(dto)
            // 取り消した id の assistant を後から受けても送らない。
            if (!toolResults.isRetracted(dto.id)) emit({ kind: 'message', message: dto })
          } else if (nested.kind === 'resend') {
            emit({ kind: 'message', message: nested.message })
          }
          signals.onAssistant(message)
          break
        }
        case 'user':
          // **tool_result ブロックだけを読み、user の本文は送らない** (data-model §3)。
          // 影響を受けたメッセージは user メッセージ 1 つにつき 1 回だけ、同じ id で送り直す。
          for (const dto of toolResults.applyUserMessage(message, receivedAt))
            emit({ kind: 'message', message: dto })
          signals.onUser(message)
          break
        case 'result': {
          // streaming-input では turn ごとに result が来て generator は開いたまま (次の sendPrompt を待つ)。
          // 終端分類は純関数 (session-core) に委ねる — 認証失敗を黙って done にしない (X-1 FR-020 / US-4 AC6)。
          // 終了・強制終了の後に届いたエラー結果では失敗にしない (`resultAction`。pr-gate R1 architecture L-001 / R2 L-006)。
          // 失敗の理由は `live-signals` が返す (計量と行の閉じは理由を返す前に送る。014 data-model §1 / §2)。
          const failureReason = signals.onResult(message)
          switch (resultAction(classifyResult(message.subtype, message.is_error), closing)) {
            case 'complete':
              transition({ kind: 'complete' })
              break
            case 'fail':
              fail(failureReason)
              terminated = true
              break
            case 'ignore':
              break
          }
          break
        }
        case 'system':
          if (message.subtype === 'init') {
            const initRecord = asRecord(message)
            const firstInit = !sawInit
            // 再開の最初の `init` の権限モードが安全 3 値の外 (無いときも) なら fail closed (X-9 / FR-017 / data-model §6.3)。
            // 昇格の値の綴りを書かない。`resume-failed` で止め、会話の id は運ばない。
            if (
              firstInit &&
              launchOptions.resume !== undefined &&
              !isSafePermissionMode(initRecord?.permissionMode)
            ) {
              fail('resume-failed')
              terminated = true
              break
            }
            sawInit = true
            // 会話の id は最初の `init` の `session_id` だけを UUID の形で検査して 1 回送る (調停役が即座に main へ中継する)。
            const conversationId = initRecord?.session_id
            if (firstInit && isValidSessionId(conversationId)) {
              post({ kind: 'conversation', conversationId })
            }
          }
          if (message.subtype === 'permission_denied') {
            emit({
              kind: 'permission-denied',
              denied: {
                toolName: sanitizeToolName(message.tool_name),
                reason: sanitizeBody(message.message).value
              }
            })
          }
          {
            // subagent の中の圧縮の境界は主ループの行にせず、親の `children` に区切りとして足す (O-11 / U-9)。
            // 他の subtype は帰属があっても今どおりの経路 (主ループの行)。親が分からなければ何も出さない。
            const record = asRecord(message)
            const parentToolUseId = record?.parent_tool_use_id
            if (message.subtype === 'compact_boundary' && typeof parentToolUseId === 'string') {
              const uuid = record?.uuid
              const nested = toolResults.nest(
                {
                  id: `divider:${typeof uuid === 'string' ? uuid : parentToolUseId}`,
                  role: 'system',
                  parts: [{ type: 'divider', label: 'コンテキストを圧縮' }],
                  createdAt: receivedAt
                },
                parentToolUseId
              )
              if (nested.kind === 'resend') emit({ kind: 'message', message: nested.message })
              break
            }
          }
          {
            // Hook / Background task の行 (O-2 / FR-008)。後続は同じ id で送り、renderer が合成する (FR-009)。
            const event = taskRows.build(message, receivedAt, (id) => toolResults.toolCallArgs(id))
            if (event !== null) emit({ kind: 'message', message: event })
          }
          signals.onSystem(message)
          break
        case 'rate_limit_event':
          // レート制限 (O-4 / 014 data-model §2。許可リストのフィールドだけを読む)。
          signals.onRateLimit(message)
          break
        case 'tool_progress':
          // tool の経過時間 (O-4 / 014 data-model §2。間引いて送る)。
          signals.onToolProgress(message)
          break
        case 'auth_status':
          // 認証の行 (O-5 / 015 data-model §4。`isAuthenticating` と `error` の有無だけを読む。`output` / `error` は運ばない)。
          signals.onAuthStatus(message)
          break
        case 'conversation_reset':
          // 会話の作り直しの行 (O-6 / 016 data-model §1。`uuid` だけを読み、`new_conversation_id` は読まない)。
          signals.onConversationReset(message)
          break
        default:
          // stream_event / partial 等の扱いは docs/ui-coverage.md の対応表が正本 (AD-020 / H-06)。
          break
      }
      if (terminated) break
    }
    // 再開の起動で `init` の前に stream が例外なく終わった (経路 C。data-model §6.4)。新しい起動の終わり方は変えない。
    if (launchOptions.resume !== undefined && !sawInit && !terminated && !closing && !isErrored()) {
      fail('resume-failed')
    }
  } catch {
    // 終了処理中の abort による例外は失敗ではない。それ以外は理由キーだけを流す (本文断片を載せない。C-3 / CWE-532)。
    // 子の異常終了で先に `process-crashed` を付けていれば上書きしない (原因は stream ではなく子の終了)。
    if (!closing && !isErrored()) fail(crashReason('stream-protocol-error'))
  } finally {
    // **終わり方を問わず出口を通す** — 子を止めて exit を待ち、`ended` を送る (R3-H-03 / design-gate R3 A2)。
    abortController.abort()
    await finish()
  }
}

function main(port: CoordinatorPort | null): void {
  // Worker として起こされていないとき (Vitest の import など) は何もしない。
  if (port === null) return

  // 未捕捉の例外で Worker が黙って落ちる前に、子を止めて ended を送る。
  const onFatal = (): void => {
    if (fatalSink !== null) fatalSink()
    else port.postMessage({ kind: 'ended' })
  }
  process.on('uncaughtException', onFatal)
  process.on('unhandledRejection', onFatal)

  let started = false
  port.on('message', (data) => {
    if (!started) {
      const launch = decodeLaunch(data)
      started = true
      if (launch === null) {
        // デコード失敗でも Worker を残さない。子は起こしていないので、そのまま ended を送る (R3-H-03)。
        port.postMessage({
          kind: 'status',
          state: 'error',
          reasonKey: 'launch-failed',
          claudeAlive: true
        })
        port.postMessage({ kind: 'ended' })
        return
      }
      void run(port, launch.spec, launch.options)
      return
    }
    const control = decodeControl(data)
    if (control !== null && controlSink !== null) controlSink(control)
  })
}

main(parentPort as CoordinatorPort | null)
