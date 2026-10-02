import type { LaunchFailureReason } from '@domain/session/agent-session'
import type { SessionRunState } from '@domain/session/run-state'
import {
  coalesceUpdates,
  synthesizeExit,
  type SessionStatusUpdate
} from '@domain/session/status-update'

import {
  decodeSupervisorRequest,
  decodeWorkerMessage,
  encodeSupervisorEvent
} from './supervisor-protocol'
import type { BodySink, Transport } from './transport'

/**
 * **調停役スレッドの本体** (X-5 / AD-043 Decision 1・2・4)。supervisor の主スレッドで動く。
 *
 * SDK も `worker_threads` も import しない — Worker・transport・時計は注入で受け、fake で単体を書く
 * (`session-core.ts` と同じ構え)。結線は `supervisor.ts` が行う。
 *
 * | 規則 | 根拠 |
 * |---|---|
 * | **経路を知らない。** 本文の出口は transport が作る (`openBodySink`)。出口が作れない起動は Worker を起こさず拒否する | AD-030 §5 / FR-003 |
 * | **本文を JSON として解釈しない。** セッションスレッドが文字列化した本文を、そのまま出口へ渡す | FR-002 / check.mjs 項目 18 |
 * | 制御行と Worker メッセージのデコードは `supervisor-protocol.ts` だけ | SC-002 |
 * | Worker からのメッセージは、**Worker インスタンスに割り当てた sessionId で付け直す** (Worker が名乗る値は使わない) | FR-004 |
 * | 制御はその sessionId の Worker にだけ渡す。未知の sessionId は捨てる | FR-007 |
 * | 状態通知は窓 (既定 100ms) でまとめ、セッションごとに最新へ畳む。`claude` の終了 (生存フラグ false) は窓を待たずに送る | FR-004 / R3-M-01 |
 * | Worker の終了は `ended` を受け取ったかで判定する。`ended` 未着の終了は `process-crashed`。**どちらの終わり方でも**、まだ生存なら生存フラグを false にする | FR-005 / FR-012 / R3-H-03 |
 * | pid による回収は持たない (SH-000 (3): Worker / supervisor が終われば子は残らない) | AD-043 Decision 5 |
 * | 起動指示 (資格情報を含む spec) は Worker に最初の message で渡し、以後保持しない | Principle V / AD-043 Decision 7 |
 * | 例外や破棄した値の中身をログに出さない | Principle V / CWE-532 |
 */

/** Worker の最小の形 (`worker_threads.Worker` が満たす)。 */
export interface WorkerHandle {
  postMessage(message: unknown): void
  terminate(): unknown
  on(event: 'message', listener: (value: unknown) => void): unknown
  on(event: 'error', listener: (error: unknown) => void): unknown
  on(event: 'exit', listener: (code: number) => void): unknown
}

export interface TimerLike {
  setTimeout(fn: () => void, ms: number): unknown
  clearTimeout(handle: unknown): void
}

export interface SupervisorDeps {
  readonly transport: Transport
  /** セッションスレッドを 1 つ起こす (worker entry のパスと `resourceLimits` は結線側が決める)。 */
  readonly createWorker: () => WorkerHandle
  readonly timer: TimerLike
  /** 標準入出力側で親が消えたとき、全セッションを止めた後に自分を終える。 */
  readonly exit: (code: number) => void
  /** 状態通知の窓 (spec Assumptions [ASSUMED] 100ms)。 */
  readonly batchWindowMs?: number
  /** 親が消えたときに全セッションの終了を待つ期限。 */
  readonly shutdownTimeoutMs?: number
}

interface SessionSlot {
  readonly worker: WorkerHandle
  readonly sink: BodySink
  state: SessionRunState
  reasonKey: LaunchFailureReason | null
  claudeAlive: boolean
  /** セッションスレッドが `ended` を送った (以後の終了は正常終了)。 */
  ended: boolean
  /** Worker が終わった (exit / error)。 */
  exited: boolean
}

export interface SupervisorHandle {
  /** 生きているセッション数 (テスト用)。 */
  readonly size: () => number
}

export function runSupervisor(deps: SupervisorDeps): SupervisorHandle {
  const { transport, timer } = deps
  const windowMs = deps.batchWindowMs ?? 100
  const shutdownMs = deps.shutdownTimeoutMs ?? 3000
  const sessions = new Map<string, SessionSlot>()
  let pending: SessionStatusUpdate[] = []
  let flushHandle: unknown = null
  let shuttingDown = false

  const flush = (): void => {
    if (flushHandle !== null) {
      timer.clearTimeout(flushHandle)
      flushHandle = null
    }
    if (pending.length === 0) return
    const updates = coalesceUpdates(pending)
    pending = []
    transport.write(encodeSupervisorEvent({ kind: 'status-batch', updates }))
  }

  const queue = (update: SessionStatusUpdate, immediate: boolean): void => {
    pending.push(update)
    if (immediate) {
      flush()
      return
    }
    if (flushHandle === null) flushHandle = timer.setTimeout(flush, windowMs)
  }

  const snapshot = (sessionId: string, slot: SessionSlot): SessionStatusUpdate => ({
    sessionId,
    state: slot.state,
    reasonKey: slot.reasonKey,
    claudeAlive: slot.claudeAlive
  })

  /** Worker が終わった。終わり方を問わず 1 回だけ通る (R3-H-03)。 */
  const onWorkerGone = (sessionId: string, slot: SessionSlot): void => {
    if (slot.exited) return
    slot.exited = true
    if (!slot.ended) {
      // ended 未着 = 異常終了。子は残らない (SH-000 (3a)(3d)) ので、生存フラグも false にする。
      const [crash] = synthesizeExit([sessionId], 'process-crashed')
      if (crash !== undefined) {
        slot.state = crash.state
        slot.reasonKey = crash.reasonKey
        slot.claudeAlive = false
        queue(crash, true)
      }
    } else if (slot.claudeAlive) {
      // 正常に終わったが child-exited が未着 (spawn 前の終了・デコード失敗など)。枠を解放する。
      slot.claudeAlive = false
      queue(snapshot(sessionId, slot), true)
    }
    slot.sink.close()
    sessions.delete(sessionId)
    transport.write(encodeSupervisorEvent({ kind: 'thread-ended', sessionId }))
    if (shuttingDown && sessions.size === 0) deps.exit(0)
  }

  const launch = (
    sessionId: string,
    spec: Readonly<Record<string, unknown>>,
    options: Readonly<Record<string, unknown>>,
    ports: Parameters<Transport['openBodySink']>[0]
  ): void => {
    if (shuttingDown || sessions.has(sessionId)) return
    const sink = transport.openBodySink(ports, (payload) =>
      encodeSupervisorEvent({ kind: 'event', sessionId, payload })
    )
    if (sink === null) {
      // 本文の出口が無い起動は Worker を起こさず拒否する (本文が main を通る経路を作らない。FR-003)。
      queue({ sessionId, state: 'error', reasonKey: 'launch-failed', claudeAlive: false }, true)
      transport.write(encodeSupervisorEvent({ kind: 'thread-ended', sessionId }))
      return
    }
    const worker = deps.createWorker()
    const slot: SessionSlot = {
      worker,
      sink,
      state: 'idle',
      reasonKey: null,
      claudeAlive: true,
      ended: false,
      exited: false
    }
    sessions.set(sessionId, slot)

    worker.on('message', (value) => {
      if (slot.exited) return
      // sessionId は Worker が名乗る値ではなく、この Worker に割り当てたものを使う (FR-004)。
      const message = decodeWorkerMessage(value)
      if (message === null) return
      switch (message.kind) {
        case 'event':
          // **解釈しない。** 文字列のまま出口へ (FR-002)。
          slot.sink.post(message.payload)
          break
        case 'status':
          if (slot.state === 'error') break // error は後続で上書きしない
          slot.state = message.state
          slot.reasonKey = message.reasonKey
          // セッションスレッドの生存フラグは常に true。false にするのは調停役スレッドだけ。
          queue(snapshot(sessionId, slot), false)
          break
        case 'child-exited':
          if (!slot.claudeAlive) break
          slot.claudeAlive = false
          // 枠の解放を窓で遅らせない (R3-M-01)。
          queue(snapshot(sessionId, slot), true)
          break
        case 'ended':
          slot.ended = true
          void worker.terminate()
          break
      }
    })
    // 例外の中身は記録しない (理由キーだけ。Principle V)。
    worker.on('error', () => onWorkerGone(sessionId, slot))
    worker.on('exit', () => onWorkerGone(sessionId, slot))

    // 起動指示は最初の message でだけ渡し、以後保持しない (workerData は使わない。AD-043 Decision 7)。
    worker.postMessage({ kind: 'launch', spec, options })
  }

  transport.onMessage((line, ports) => {
    const request = decodeSupervisorRequest(line)
    if (request === null) return
    if (request.kind === 'launch') {
      launch(request.sessionId, request.spec, request.options, ports)
      return
    }
    const slot = sessions.get(request.sessionId)
    if (slot === undefined || slot.exited) return
    slot.worker.postMessage({ kind: 'control', control: request.control })
  })

  // 標準入出力側で親が消えたら、全セッションを止めてから自分を終える (孤児を残さない)。
  transport.onClosed(() => {
    shuttingDown = true
    if (sessions.size === 0) {
      deps.exit(0)
      return
    }
    for (const slot of sessions.values())
      slot.worker.postMessage({ kind: 'control', control: { kind: 'kill' } })
    timer.setTimeout(() => {
      for (const slot of sessions.values()) void slot.worker.terminate()
      flush()
      deps.exit(0)
    }, shutdownMs)
  })

  return { size: () => sessions.size }
}
