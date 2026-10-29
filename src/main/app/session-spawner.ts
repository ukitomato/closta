import { MessageChannelMain, utilityProcess, type UtilityProcess } from 'electron'

import sdkAgentSessionModulePath from '@agents/sdk-agent-session?modulePath'
import { decodeSupervisorEventForMain, encodeSupervisorRequest } from '@agents/supervisor-protocol'
import supervisorModulePath from '@agents/supervisor?modulePath'

import type { ModelEntry } from '@domain/provider/types'
import type {
  LaunchQueryOptions,
  RuntimeLaunchSpec,
  SessionControl
} from '@domain/session/agent-session'

import type { SupervisorConnection, SupervisorLaunchResult } from './session-launch-service'

/**
 * **単一 supervisor への接続** (X-5 / AD-043 Decision 1・6)。X-1 の per-session fork を置き換える。
 *
 * **子プロセス生成 API を持つモジュール**であり `PROCESS_SPAWN_MODULES` に入る (check.mjs 項目 7)。
 * 方針 (上限・registry・制御の宛先・dispose) は `session-launch-service.ts` に置き、ここは注入で受け取られる
 * 実プロセスの層だけを持つ (`electron` を import したモジュールは Vitest の node 環境で読めないため)。
 *
 * | 規則 | 根拠 |
 * |---|---|
 * | 最初の起動要求で supervisor を fork し、アプリ終了まで常駐させる。fork env は接続の構築時に注入された curated base | AD-043 Decision 1・7 / X-4 FR-013 |
 * | fork は 1 本に直列化する (spawn 待ちの間の起動要求は同じ fork を待つ)。fork のたびに世代番号を進める | FR-013 / design-gate R1 M-004 |
 * | worker entry のパスは `?modulePath` で得たバンドル済みのものだけを起動引数で渡す | AD-043 Decision 6 |
 * | 起動ごとに `MessageChannelMain` を作り、port1 を launch の行と一緒に supervisor へ、port2 を renderer へ (main は本文に触れない) | AD-034 §1 / AD-036 §2 / FR-003 |
 * | `stdio: 'ignore'`。parentPort だけを購読する — utilityProcess の下では parentPort が必ず使われ、stdout を開くと標準入出力経路の本文行が main に流れる経路を作るため (AD-030 §5 訂正の「両方を購読」は、両経路が使われうる列挙プロセスの規則) | Principle V / IX / AD-043 Decision 1 |
 * | supervisor からの行は、パース前に長さの上限を掛ける。運ぶのは状態通知などのメタデータだけ | AD-031 §2 |
 *
 * モジュール名は X-1 の登録名 (`PROCESS_SPAWN_MODULES`) を維持している (中身は supervisor 接続。plan 申し送り #19)。
 */

/** バンドル後の supervisor entry / セッションスレッドのファイルパス。 */
const SUPERVISOR_MODULE_PATH: string = supervisorModulePath
const SESSION_THREAD_MODULE_PATH: string = sdkAgentSessionModulePath

/** supervisor からの 1 行の上限 (状態通知 10 件分の数十倍。spec Assumptions [ASSUMED] 64 KiB)。 */
const MAX_SUPERVISOR_LINE_CHARS = 64 * 1024

type Listener<T extends unknown[]> = (...args: T) => void

/**
 * @param forkEnv supervisor の fork env。**ランタイムに依存しない curated base** を返す (`buildLaunchEnv(process.env)`)。
 *   supervisor は全ランタイムのセッションを抱えるので、起動ごとの値 (導出 env・distro) を fork env に入れない —
 *   それらはセッションごとの `spec.env` に閉じる。起動ごとに受け取る形にすると、最初の起動の env が 2 本目以降の
 *   別ランタイムにも黙って効く形になる (pr-gate R1 platform-boundary L-001 / AD-003 / AD-041 (e) 6)。
 */
export function createSupervisorConnection(
  forkEnv: () => Record<string, string>
): SupervisorConnection {
  let child: UtilityProcess | null = null
  let spawned = false
  let generation = 0
  /** spawn 前に届いた起動要求 (fork の直列化)。 */
  let queued: (() => void)[] = []
  const statusListeners: Listener<[number, readonly unknown[]]>[] = []
  const threadEndedListeners: Listener<[number, string]>[] = []
  const conversationListeners: Listener<[number, string, string]>[] = []
  const controlResultListeners: Listener<[number, string, string, boolean]>[] = []
  const modelsResultListeners: Listener<
    [number, string, string, readonly ModelEntry[] | null, number]
  >[] = []
  const exitListeners: Listener<[number, number | null]>[] = []

  const ensureSupervisor = (): { proc: UtilityProcess; gen: number } => {
    if (child !== null) return { proc: child, gen: generation }
    generation += 1
    const gen = generation
    const proc = utilityProcess.fork(
      SUPERVISOR_MODULE_PATH,
      [`--worker-entry=${SESSION_THREAD_MODULE_PATH}`],
      {
        env: forkEnv(),
        stdio: 'ignore'
      }
    )
    child = proc
    spawned = false
    let gone = false
    const end = (code: number | null): void => {
      if (gone) return
      gone = true
      if (child === proc) {
        child = null
        spawned = false
        queued = []
      }
      for (const cb of exitListeners) cb(gen, code)
    }
    proc.on('exit', (code) => end(code))
    // spawn に失敗した子も片付ける (起動要求は exit と同じ経路で失敗にする)。
    proc.on('error', () => end(null))
    proc.once('spawn', () => {
      if (child !== proc) return
      spawned = true
      const pending = queued
      queued = []
      for (const send of pending) send()
    })
    proc.on('message', (message: unknown) => {
      if (typeof message !== 'string' || message.length > MAX_SUPERVISOR_LINE_CHARS) return
      const event = decodeSupervisorEventForMain(message)
      if (event === null) return
      if (event.kind === 'status-batch') for (const cb of statusListeners) cb(gen, event.updates)
      else if (event.kind === 'conversation')
        for (const cb of conversationListeners) cb(gen, event.sessionId, event.conversationId)
      else if (event.kind === 'control-result')
        for (const cb of controlResultListeners) cb(gen, event.sessionId, event.requestId, event.ok)
      else if (event.kind === 'models-result')
        for (const cb of modelsResultListeners)
          cb(gen, event.sessionId, event.requestId, event.models, event.dropped)
      else for (const cb of threadEndedListeners) cb(gen, event.sessionId)
    })
    return { proc, gen }
  }

  return {
    launch(
      sessionId: string,
      spec: RuntimeLaunchSpec,
      options: LaunchQueryOptions
    ): SupervisorLaunchResult {
      let target: { proc: UtilityProcess; gen: number }
      try {
        target = ensureSupervisor()
      } catch {
        return { ok: false }
      }
      const channel = new MessageChannelMain()
      const send = (): void => {
        // **起動指示は値として 1 行で渡す** (supervisor は検証せずセッションスレッドへ渡し、以後保持しない)。
        target.proc.postMessage(
          encodeSupervisorRequest({
            kind: 'launch',
            sessionId,
            spec: spec as unknown as Readonly<Record<string, unknown>>,
            options: options as unknown as Readonly<Record<string, unknown>>
          }),
          [channel.port1]
        )
      }
      if (spawned) send()
      else queued.push(send)
      return { ok: true, port: channel.port2, generation: target.gen }
    },
    control(sessionId: string, control: SessionControl): void {
      const proc = child
      if (proc === null) return
      const send = (): void =>
        proc.postMessage(encodeSupervisorRequest({ kind: 'control', sessionId, control }))
      // spawn 前なら起動要求の後ろに並べる (起動直後の強制終了を落とさない)。
      if (spawned) send()
      else queued.push(send)
    },
    kill(): boolean {
      if (child === null) return true
      return child.kill()
    },
    onStatusBatch(listener) {
      statusListeners.push(listener)
    },
    onThreadEnded(listener) {
      threadEndedListeners.push(listener)
    },
    onConversation(listener) {
      conversationListeners.push(listener)
    },
    onControlResult(listener) {
      controlResultListeners.push(listener)
    },
    onModelsResult(listener) {
      modelsResultListeners.push(listener)
    },
    onExit(listener) {
      exitListeners.push(listener)
    }
  }
}
