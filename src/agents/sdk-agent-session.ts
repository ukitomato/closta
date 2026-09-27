import { spawn } from 'node:child_process'

import { query, type Options, type Query } from '@anthropic-ai/claude-agent-sdk'

import type {
  PermissionDecision,
  RuntimeLaunchSpec,
  SessionControl,
  SessionEvent
} from '@domain/session/agent-session'
import { toLiveAssistantMessage } from '@domain/session/live-message'
import { nextState, type SessionRunState } from '@domain/session/run-state'
import { sanitizeBody } from '@domain/session/sanitize-body'

import {
  buildQueryOptions,
  classifyResult,
  composeClaudeSpawn,
  createCanUseTool,
  type AgentSpawnOptions,
  type SpawnedLike
} from './session-core'

/**
 * X-1 単一セッションの **SDK 入口 + `parentPort` 配線** (AD-036 §3 / contracts C-2・C-4・C-6・C-7)。
 *
 * `enumerate-sessions.ts` / `read-transcript.ts` と同じ構え — **SDK の実 import・`child_process.spawn`・
 * 末尾の `main()` を持つため Vitest から読むと副作用が走る**。固定したい不変条件は SDK 非 import の
 * `session-core.ts` (権限ゲートの正の構成 P1-P3 / spawn 合成) と `@domain/session/*` (状態機械・live 変換) に
 * 切り出して注入で繋ぐ。本ファイルは「配線」だけを持つ。
 *
 * | 規則 | 根拠 |
 * |---|---|
 * | **Agent SDK を呼ぶ場所。`query()` のみ** (戻り値 `Query` のメソッドは `interrupt()` だけ。P3) | Principle IV / contracts C-4 |
 * | **spawn 主体は本ファイル。** `spawnClaudeCodeProcess` コールバックで `child_process.spawn` する | AD-036 §3 / C-7 (`PROCESS_SPAWN_MODULES`) |
 * | **起動コマンド・接頭引数・claude パス・cwd・env は値 (`RuntimeLaunchSpec`) で受ける。リテラルを持たない** | `WSL_FREE_DIRECTORIES` / 検証項目 3 |
 * | **`electron` を import しない。** `parentPort` は構造的に取り出す | Principle VII / AD-010 |
 * | **本文・toolName は取得プロセス側でサニタイズ**してから port に載せる | FR-009 / SC-008 / H-05 |
 * | **制御は `parentPort` (main 検証済み)・データは転送 port へ直送** (main は本文を持たない) | AD-034 / contracts C-2 |
 */

/* ── parentPort / データ port の最小構造 (SDK 非依存・`electron` 非 import) ── */

interface DataPortLike {
  postMessage(message: unknown): void
  start?(): void
  close?(): void
}

interface ParentMessage {
  readonly data: unknown
  readonly ports: readonly DataPortLike[]
}

interface WorkerParentPort {
  on(event: 'message', listener: (message: ParentMessage) => void): void
  start?(): void
}

function parentPortOf(): WorkerParentPort | null {
  // `parentPort` は utilityProcess にだけ在る。Electron の有無を見ているのであって OS 分岐ではないため、
  // 項目8 (プラットフォーム分岐) の対象式ではない — platform-ok 注記は付けない (read-transcript.ts と同じ扱い。pr-gate platform L-102)。
  const candidate = (process as unknown as { parentPort?: WorkerParentPort }).parentPort
  return candidate ?? null
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
 * (背圧の本格設計は X-5)。running/awaiting 中の queue は最小前提 (data-model §4)。
 */
const MAX_QUEUED_PROMPTS = 1000

/**
 * `query({ prompt })` に渡す AsyncIterable。**`close()` まで開いたまま**にして次の `sendPrompt` を待つ
 * (`sendPrompt` は同一セッションへの継続。FR-011 / data-model §4)。
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

/* ── 入口メッセージのデコード (main は検証済みだが型を回復する) ─────────── */

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null
}

function decodeLaunchSpec(data: unknown): RuntimeLaunchSpec | null {
  const record = asRecord(data)
  if (record === null || record.kind !== 'launch') return null
  const spec = asRecord(record.spec)
  if (spec === null) return null
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
  const control = asRecord(record.control)
  if (control === null) return null
  switch (control.kind) {
    case 'send-prompt':
      return typeof control.text === 'string' ? { kind: 'send-prompt', text: control.text } : null
    case 'interrupt':
      return { kind: 'interrupt' }
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

function decodeDecision(value: unknown): PermissionDecision | null {
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

/* ── セッション本体 (1 worker = 1 セッション。C-6) ───────────────────── */

/** 制御シンク。`main()` の parentPort ループが検証済み control をここへ流す。 */
let controlSink: ((control: SessionControl) => void) | null = null

async function run(spec: RuntimeLaunchSpec, port: DataPortLike): Promise<void> {
  const promptQueue = new PromptQueue()
  const abortController = new AbortController()
  const pending = new Map<string, (decision: PermissionDecision) => void>()
  let state: SessionRunState = 'idle'
  let queryHandle: Query | null = null
  let spawnedChild: SpawnedLike | null = null
  let requestSeq = 0
  // 初 stream/ready を受けたか (launching → running を 1 回だけ発火する。TS が closure 変数 state を
  // 'idle' リテラルに固定するため、state の直接比較でなく専用フラグで判定する)。
  let sawFirstMessage = false
  // terminal error (provider-error / stream-protocol-error) に達したか。到達したら孫 (wsl.exe) を止める。
  let terminated = false

  const emit = (event: SessionEvent): void => port.postMessage(event)

  // 孫 (wsl.exe) を kill する。**closure に閉じる** — 本体で直接 `spawnedChild?.kill` すると、
  // spawnedChild が closure (spawnClaudeCodeProcess) でしか代入されないため TS の CFA が本体側の
  // 読みを `null` に固定し `?.kill` が never になる。closure 越しなら宣言型 (SpawnedLike | null) で読める。
  const killSpawnedChild = (): void => {
    if (spawnedChild !== null) spawnedChild.kill('SIGTERM')
  }

  const transition = (action: Parameters<typeof nextState>[1]): void => {
    const next = nextState(state, action)
    if (next !== state) {
      state = next
      emit({ kind: 'state', state })
    }
  }

  const canUseTool = createCanUseTool({
    nextRequestId: () => `perm-${(requestSeq += 1)}`,
    sanitizeInput: sanitizeToolInput,
    sanitizeToolName,
    emitRequest: (request) => {
      transition({ kind: 'permission-request' })
      emit({ kind: 'permission-request', request })
    },
    awaitDecision: (requestId, signal) =>
      new Promise<PermissionDecision>((resolve) => {
        pending.set(requestId, resolve)
        signal.addEventListener(
          'abort',
          () => {
            if (pending.delete(requestId)) resolve({ requestId, outcome: 'deny', scope: 'once' })
          },
          { once: true }
        )
      })
  })

  const spawnClaudeCodeProcess = (options: AgentSpawnOptions): SpawnedLike => {
    // env は `spec.env` のみ・argv は配列 (composeClaudeSpawn が合成)。SDK 提供 env / process.env を混ぜない (H-01)。
    const plan = composeClaudeSpawn(spec, options)
    const child = spawn(plan.command, [...plan.args], { env: plan.env, shell: false })
    spawnedChild = child
    return child
  }

  // 制御シンク: main 検証済みの control をセッション状態へ反映する。
  controlSink = (control) => {
    switch (control.kind) {
      case 'send-prompt':
        promptQueue.push(control.text)
        transition({ kind: 'send-prompt' })
        break
      case 'respond-permission': {
        const resolve = pending.get(control.decision.requestId)
        if (resolve !== undefined) {
          pending.delete(control.decision.requestId)
          transition({ kind: 'permission-respond' })
          resolve(control.decision)
        }
        break
      }
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
      case 'kill':
        transition({ kind: 'kill' })
        // Windows の親 kill は孫 (WSL) に伝播しないため、保持した子プロセスを直接 kill する (C-6)。
        killSpawnedChild()
        for (const [, resolve] of pending)
          resolve({ requestId: '', outcome: 'deny', scope: 'once' })
        pending.clear()
        abortController.abort()
        promptQueue.close()
        port.close?.()
        // **自プロセスを終了する** — 孫 (wsl.exe) を kill しても parentPort の listener が
        // event loop を生かし utilityProcess は自然 exit しない。exit しないと app 側 onExit が
        // 発火せず registry entry が残り単一セッション不変が再 launch を拒否する (ソフトロック。C-001)。
        process.exit(0)
        break
    }
  }

  // 権限ゲートは正の構成 (allowlist) で組む。options のキー集合は buildQueryOptions が固定する (P1)。
  const options = buildQueryOptions({
    canUseTool,
    pathToClaudeCodeExecutable: spec.pathToClaudeCodeExecutable,
    spawnClaudeCodeProcess,
    abortController
  })

  transition({ kind: 'launch' })

  try {
    /*
     * **SDK 境界の変位のみを解消するキャスト。** options のキー集合 ⊆ allowlist は buildQueryOptions
     * (SDK 非 import・テスト済み) と SH-010 fixture が構造的に保証する。ここで鍵を足していない。
     * `canUseTool` の戻り (`{behavior, message?}`) と `spawnClaudeCodeProcess` の戻り (kill ハンドル) が
     * SDK の広い型と構造的にしか一致しないための変位吸収。
     */
    queryHandle = query({ prompt: promptQueue.iterate(), options: options as unknown as Options })
    for await (const message of queryHandle) {
      if (!sawFirstMessage) {
        sawFirstMessage = true
        transition({ kind: 'ready' }) // launching → running (他状態では no-op)
      }
      switch (message.type) {
        case 'assistant':
          emit({ kind: 'message', message: toLiveAssistantMessage(message) })
          break
        case 'result':
          // streaming-input では turn ごとに result が来て generator は開いたまま (次の sendPrompt を待つ)。
          // 終端分類は純関数 (session-core) に委ねる — 認証失敗を黙って done にしない (V-11 / FR-030)。
          if (classifyResult(message.subtype, message.is_error).kind === 'complete') {
            transition({ kind: 'complete' })
          } else {
            // Provider/認証/API エラーは terminal (session は継続不能)。理由を出して停止する。
            transition({ kind: 'fail' })
            emit({ kind: 'failure', reasonKey: 'provider-error' })
            terminated = true
          }
          break
        case 'system':
          if (message.subtype === 'permission_denied') {
            emit({
              kind: 'permission-denied',
              denied: {
                toolName: sanitizeToolName(message.tool_name),
                reason: sanitizeBody(message.message).value
              }
            })
          }
          break
        default:
          // user echo / stream_event / partial 等は message 単位表示では扱わない (AD-020 / H-06)。
          break
      }
      if (terminated) break
    }
  } catch {
    // 例外に本文断片を載せない。理由キーだけを流す (C-3 / CWE-532)。
    transition({ kind: 'fail' })
    emit({ kind: 'failure', reasonKey: 'stream-protocol-error' })
    terminated = true
  } finally {
    // **terminal error では孫 (wsl.exe) を止めて孤児化を防ぐ** (kill 経路と対称。security M-201 / platform M-001)。
    // failure イベントは上で emit 済 (port.close で flush される)。ここでは process.exit しない —
    // renderer への failure 配送を保ち、utilityProcess の回収は reset/kill/dispose の kill 経路に委ねる。
    // **done (正常完了で継続待ち) では kill しない** — FR-015 の同一セッション継続を壊さないため。
    if (terminated) {
      killSpawnedChild()
      abortController.abort()
    }
    promptQueue.close()
    port.close?.()
    process.exitCode = 0
  }
}

function main(): void {
  const parentPort = parentPortOf()
  /*
   * **本 feature は Electron 下でのみ動く。** `parentPort` が無い経路 (素の `node` 起動) では
   * 転送 port を受け取れないため応答しない (単独診断の余地は残す。SH-094 と同じ構え)。
   */
  if (parentPort === null) return

  let started = false
  parentPort.on('message', (message) => {
    if (!started) {
      const spec = decodeLaunchSpec(message.data)
      const port = message.ports[0] ?? null
      if (spec === null || port === null) {
        process.exitCode = 1
        return
      }
      started = true
      port.start?.()
      void run(spec, port)
      return
    }
    const control = decodeControl(message.data)
    if (control !== null && controlSink !== null) controlSink(control)
  })
  parentPort.start?.()
}

main()
