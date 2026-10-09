import type { LaunchFailureReason, SessionEvent } from '@domain/session/agent-session'
import type { SafePermissionMode } from '@domain/session/launch-config'
import {
  contextTokensOf,
  isValidTaskId,
  isValidToolUseId,
  MAX_METER_PERMISSION_DENIALS,
  toAssistantErrorKey,
  toCostUsd,
  toCount,
  toModelMeters,
  toPermissionModeKey,
  toRateLimitStatus,
  toRateLimitType,
  toResetsAtSec,
  toSeconds,
  toUtilizationPct,
  type AssistantErrorKey,
  type PermissionModeKey
} from '@domain/session/meter'
import { encodeRetryDetail, encodeTaskProgress } from '@domain/session/system-event'
import type { SystemEventCategory, SystemEventStatus } from '@domain/session/transcript-dto'

import {
  createMeterThrottle,
  taskThrottleKey,
  THINKING_THROTTLE_KEY,
  toolThrottleKey
} from './meter-throttle'
import { classifyResult, classifyResultFailure } from './session-core'

/**
 * 実行中の信号 (計量・失敗の理由の材料・O-4 のシステムイベントの行) の分岐の集約 (O-4 / 014 research R-14 /
 * [data-model](../../specs/014-ui-metering-and-limits/data-model.md) §2「セッションスレッドの状態」)。
 *
 * セッションスレッド (`sdk-agent-session.ts`) の `run()` が **closure の中で 1 つ作る** (module スコープに置かない)。
 * SDK も Electron も import しない — SDK のメッセージは構造だけで受ける (`live-tool-results.ts` と同じ構え)。
 * 通しのテスト (`tests/meter/`) が fixture から直接呼べるようにするため (research R-14)。
 *
 * | 規則 | 根拠 |
 * |---|---|
 * | SDK のメッセージのうち data-model §2 の許可リストのフィールドだけを読む | 014 spec FR-003 / data-model §2 |
 * | 行の id の連番と権限モードの比較の基準は closure に持つ | 014 spec FR-003 |
 * | 権限モードの昇格値の綴りを書かない。基準は `launchPermissionMode` の名前で受け、SDK のメッセージは `message.permissionMode` の参照で読む | Constitution 検証の項目 16 |
 * | `dispose()` の後は何も送らない (`finish()` の最初で呼ぶ。`ended` の後に `event` を送らない) | 014 spec SC-004 |
 * | 失敗の理由は result の `subtype`・`api_error_status` と、同じターンの主ループの assistant の最後の `error` (列挙) から決める。`errors` / `result` の文字列は読まない | 014 spec FR-001 / U-5 / data-model §1 |
 * | O-4 の行は既存の `message` の経路で送る。`name` は常に '' (会話由来の文字列を入れない)。行の更新 (閉じ) は result の理由を返す前に送る (`fail()` の `state: error` より前に届く) | 014 spec FR-004 / data-model §3 |
 * | 思考のトークン数・tool の経過時間・task の進み具合は `meter-throttle` で間引く。tool の結果でその tool、主ループの assistant と result で思考、result で全部の tool、`dispose()` で全部の保留を取り消す | 014 spec SC-004 / data-model §2「間引きと後始末」 |
 * | task の状態 (種類・実行中か・一覧) を持たない。task の進み具合は `task:<task_id>` の行の更新として送り、行の有無は renderer の合成 (`mergeSystemEvent`) が決める | 014 spec FR-013 / AD-044 Decision 6 |
 *
 * 失敗の理由 (014 tasks BE-012)・レート制限と API の再試行の行 (BE-020)・コンテキストとターン (BE-030)・権限モード (BE-040)・
 * 間引く進み具合と圧縮の行 (BE-042) を持つ。
 */

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

/** 主ループの SDK のメッセージか (`parent_tool_use_id === null`。subagent の中のものは `tool_use` の id を持つ)。 */
function isMainLoop(message: Record<string, unknown>): boolean {
  return message.parent_tool_use_id === null
}

/**
 * O-4 のシステムイベントの行 (014 data-model §3)。過去ログと共有の `toSystemEventMessage` には足さない (経路は実行中だけ)。
 * `name` は常に ''。`createdAt` は O-2 の実行中の行 (`toSystemEventMessage(message, null)`) と同じく null。
 */
function rowEvent(
  id: string,
  category: SystemEventCategory,
  opens: boolean,
  detail: string,
  status: SystemEventStatus | null
): SessionEvent {
  return {
    kind: 'message',
    message: {
      id,
      role: 'system',
      parts: [{ type: 'system-event', category, opens, name: '', detail, status }],
      createdAt: null
    }
  }
}

/** result がターンの完了か (`classifyResult` と同じ規則。`subtype === 'success'` かつ `is_error === false` のときだけ)。 */
function isCompletedResult(record: Record<string, unknown> | null): boolean {
  const subtype = typeof record?.subtype === 'string' ? record.subtype : ''
  return classifyResult(subtype, record?.is_error !== false).kind === 'complete'
}

/** 時計と timer (間引きに使う。単体では偽の時計を注入する)。 */
export interface LiveSignalsClock {
  readonly now: () => number
  readonly setTimer: (callback: () => void, ms: number) => unknown
  readonly clearTimer: (handle: unknown) => void
}

export interface LiveSignalsDeps {
  /** 起動の設定の権限モード (権限モードの比較の基準の初期値。data-model §2)。 */
  readonly launchPermissionMode: SafePermissionMode
  /** `sdk-agent-session.ts` の `emit` (文字列にして調停役スレッドへ送る)。 */
  readonly emit: (event: SessionEvent) => void
  readonly clock: LiveSignalsClock
}

/** 各メソッドは SDK のメッセージ (未信頼) を構造だけで受ける。例外を投げない。 */
export interface LiveSignals {
  /** `assistant` (主ループと subagent の中の両方が来る。主ループは `parent_tool_use_id === null`)。 */
  onAssistant(message: unknown): void
  /** `user` (読むのは `tool_result` ブロックの `tool_use_id` だけ)。 */
  onUser(message: unknown): void
  /** `result` (成功・失敗とも)。失敗のときに `fail()` へ渡す理由を返す (成功のときは使われない)。 */
  onResult(message: unknown): LaunchFailureReason
  /** `system` (`init` / `status` / `api_retry` / `thinking_tokens` / `task_progress` ほか)。 */
  onSystem(message: unknown): void
  /** `rate_limit_event`。 */
  onRateLimit(message: unknown): void
  /** `tool_progress`。 */
  onToolProgress(message: unknown): void
  /** 間引きの保留と timer を捨て、以後は何も送らない。何度呼んでもよい。 */
  dispose(): void
}

export function createLiveSignals(deps: LiveSignalsDeps): LiveSignals {
  let disposed = false
  const send = (event: SessionEvent): void => {
    if (!disposed) deps.emit(event)
  }
  /**
   * 同じターンの主ループの assistant の最後の `error` (014 data-model §1 / §2「セッションスレッドの状態」)。
   * `error` を持つ主ループの assistant で書き (列挙の外の値は null)、result で消す (次のターンに持ち越さない)。
   */
  let lastAssistantError: AssistantErrorKey | null = null
  /** 行の id の連番 (ターン)。result で +1 する (014 data-model §3)。 */
  let turnSeq = 0
  /** このターンの API の再試行の行の id (`retry:<turnSeq>`)。最初の `api_retry` で持ち、result で消す (014 data-model §3)。 */
  let openRetryRowId: string | null = null
  /**
   * 再試行の行に最後に送った状態。同じ状態の更新を続けて送らない (主ループの assistant はブロックごとに届くので、
   * 届くたびに `succeeded` を送り直さない)。送った後の行の見え方は送り直したときと同じ (`mergeSystemEvent`)。
   */
  let retryRowStatus: SystemEventStatus | null = null
  /** 最後に送った `context` の値 (同じ値を続けて送らない。014 data-model §2)。 */
  let lastContextTokens: number | null = null
  /** このアプリが受けたターンの数 (0 に倒していない result で +1。`num_turns` は使わない。research R-08)。 */
  let turns = 0
  /** result の `permission_denials` の `tool_use_id` (形を検証し、重複を除く。`MAX_METER_PERMISSION_DENIALS` まで)。 */
  const deniedIds = new Set<string>()
  /**
   * 権限モードの比較の基準 (014 data-model §2「セッションスレッドの状態」)。初期値は起動の設定の権限モードで、
   * `permission-mode` を送ったときに更新する (`status` と `init` のどちらで先に観測しても 1 回だけ送る)。
   */
  let modeBaseline: PermissionModeKey = deps.launchPermissionMode
  /** 権限モードの行の id の連番 (`mode:<modeSeq>`。行を作るたびに +1。014 data-model §3)。 */
  let modeSeq = 0
  /** 圧縮の行の id の連番 (`compact:<compactSeq>`。行を作るたびに +1。014 data-model §3)。 */
  let compactSeq = 0
  /** 開いた (結果の来ていない) 圧縮の行の id。結果で消す。 */
  let openCompactRowId: string | null = null
  /**
   * 間引き (思考のトークン数・tool の経過時間・task の進み具合。014 data-model §2「間引きと後始末」)。送るのは `send` を
   * 通すので、`dispose()` の後は何も届かない。
   */
  const throttle = createMeterThrottle<SessionEvent>({ clock: deps.clock, send })

  /** result の `permission_denials` の `tool_use_id` だけを読む (`tool_name` / `tool_input` を読まない)。 */
  const addDeniedIds = (raw: unknown): void => {
    if (!Array.isArray(raw)) return
    for (const item of raw as readonly unknown[]) {
      if (deniedIds.size >= MAX_METER_PERMISSION_DENIALS) return
      const id = asRecord(item)?.tool_use_id
      if (isValidToolUseId(id)) deniedIds.add(id)
    }
  }

  /**
   * result → `meter` の `turn` (014 data-model §2 の許可リスト: `total_cost_usd`・`num_turns` (0 に倒した result の判定に
   * だけ)・`modelUsage` の 4 つのトークン数と `costUSD` と `contextWindow`・`permission_denials` の `tool_use_id`)。
   * 0 に倒した result (`num_turns === 0 && total_cost_usd === 0`。検証で外れた値は 0) は送らず、`turns` も増やさない
   * (前の値を上書きしない)。`/clear`・再開で費用が 0 から数え直されても、そのまま送る。
   */
  const onTurn = (record: Record<string, unknown>): void => {
    addDeniedIds(record.permission_denials)
    const costUsd = toCostUsd(record.total_cost_usd)
    if (toCount(record.num_turns) === 0 && costUsd === 0) return
    turns += 1
    send({
      kind: 'meter',
      meter: {
        type: 'turn',
        costUsd,
        turns,
        models: toModelMeters(record.modelUsage),
        permissionDenials: deniedIds.size
      }
    })
  }

  /**
   * 主ループの assistant の `message.usage` の入力側 3 つの和 → `meter` の `context` (014 data-model §2。出力側と本文は
   * 読まない)。前に送った値と同じなら送らない (assistant はブロックごとに届き、同じ API 呼び出しの usage を繰り返す)。
   */
  const onContext = (record: Record<string, unknown>): void => {
    const usedTokens = contextTokensOf(asRecord(record.message)?.usage)
    if (usedTokens === null || usedTokens === lastContextTokens) return
    lastContextTokens = usedTokens
    send({ kind: 'meter', meter: { type: 'context', usedTokens } })
  }

  /** 開いた再試行の行の状態を書き換える (014 data-model §3。開いた行があるときだけ。`detail` は '' で前の値を保つ)。 */
  const updateRetryRow = (status: 'succeeded' | 'failed'): void => {
    if (openRetryRowId === null || retryRowStatus === status) return
    retryRowStatus = status
    send(rowEvent(openRetryRowId, 'api-retry', false, '', status))
  }

  /**
   * `system` / `api_retry` → 再試行の行 (014 data-model §2 の許可リスト: `attempt`・`max_retries`・`retry_delay_ms`・
   * `error_status` だけ。`error`・`no_response` は読まない)。同じターンの続きは同じ行 (`opens: false`) に合成する。
   */
  const onApiRetry = (record: Record<string, unknown>): void => {
    const opens = openRetryRowId === null
    const id = openRetryRowId ?? `retry:${turnSeq}`
    openRetryRowId = id
    retryRowStatus = 'retrying'
    const detail = encodeRetryDetail({
      attempt: record.attempt,
      maxRetries: record.max_retries,
      errorStatus: record.error_status,
      retryDelayMs: record.retry_delay_ms
    })
    send(rowEvent(id, 'api-retry', opens, detail, 'retrying'))
  }

  /**
   * `system` の `status` / `init` の権限モード → 基準と違えば `meter` の `permission-mode` と権限モードの行
   * (`mode:<modeSeq>`・`detail` は鍵・`changed`。014 data-model §2 / §3)。値は domain の `toPermissionModeKey` で鍵にする
   * (知らない値は `unknown`。昇格値の綴りをここに書かない — 項目 16)。値が無い (`status` は省略可能。null も同じ) ときは
   * 観測していないので何もしない。強制 (中断・失敗にする) はしない (U-6。持ち主は I-3)。
   */
  const observePermissionMode = (raw: unknown): void => {
    if (raw === undefined || raw === null) return
    const mode = toPermissionModeKey(raw)
    if (mode === modeBaseline) return
    modeBaseline = mode
    send({ kind: 'meter', meter: { type: 'permission-mode', mode } })
    send(rowEvent(`mode:${modeSeq}`, 'permission-mode', true, mode, 'changed'))
    modeSeq += 1
  }

  /**
   * `system` / `status` → 権限モードの比較と圧縮の行 (014 data-model §2 の許可リスト: `status`・`compact_result`・
   * `permissionMode`。`compact_error` は読まない)。`compacting` で開いた行が無ければ行を作り、`compact_result` で
   * 成功 / 失敗に閉じる。開いた行が無いまま結果が来たら、結果の状態で行を作る (014 data-model §3)。
   */
  const onStatus = (record: Record<string, unknown>): void => {
    observePermissionMode(record.permissionMode)
    const result = record.compact_result
    if (result === 'success' || result === 'failed') {
      const status = result === 'success' ? 'succeeded' : 'failed'
      if (openCompactRowId !== null) {
        send(rowEvent(openCompactRowId, 'compaction', false, '', status))
        openCompactRowId = null
      } else {
        send(rowEvent(`compact:${compactSeq}`, 'compaction', true, '', status))
        compactSeq += 1
      }
      return
    }
    if (record.status !== 'compacting' || openCompactRowId !== null) return
    openCompactRowId = `compact:${compactSeq}`
    compactSeq += 1
    send(rowEvent(openCompactRowId, 'compaction', true, '', 'compacting'))
  }

  /**
   * `system` / `thinking_tokens` → `meter` の `thinking` (読むのは `estimated_tokens` だけ。`estimated_tokens_delta`・
   * `user_message_uuid` は読まない)。間引く (鍵は `thinking` の 1 つ)。
   */
  const onThinkingTokens = (record: Record<string, unknown>): void => {
    throttle.offer(THINKING_THROTTLE_KEY, {
      kind: 'meter',
      meter: { type: 'thinking', estimatedTokens: toCount(record.estimated_tokens) }
    })
  }

  /**
   * `system` / `task_progress` → 既存の task の行の更新 (`task:<task_id>`・`opens: false`・進み具合だけの `detail`。
   * 014 data-model §3)。読むのは `task_id` と `usage` の 3 つの数だけ (`description`・`summary`・`last_tool_name`・
   * `subagent_type`・`tool_use_id` は読まない)。`task_id` の形が外れたら送らず、間引きの鍵も作らない。task の状態は持たない
   * (行の無い task への更新は renderer の合成が捨てる。AD-044 Decision 6)。
   */
  const onTaskProgress = (record: Record<string, unknown>): void => {
    const taskId = record.task_id
    if (!isValidTaskId(taskId)) return
    const usage = asRecord(record.usage)
    const detail = encodeTaskProgress({
      totalTokens: usage?.total_tokens,
      toolUses: usage?.tool_uses,
      durationMs: usage?.duration_ms
    })
    throttle.offer(taskThrottleKey(taskId), rowEvent(`task:${taskId}`, 'task', false, detail, null))
  }

  /** `user` の `tool_result` ブロックの `tool_use_id` だけを読み、その tool の経過時間の保留を取り消す (本文は読まない)。 */
  const cancelToolsWithResults = (record: Record<string, unknown>): void => {
    const content = asRecord(record.message)?.content
    if (!Array.isArray(content)) return
    for (const block of content as readonly unknown[]) {
      const b = asRecord(block)
      if (b?.type !== 'tool_result') continue
      const id = b.tool_use_id
      if (isValidToolUseId(id)) throttle.cancelTool(id)
    }
  }

  return {
    onAssistant: (message) => {
      const record = asRecord(message)
      if (record === null || !isMainLoop(record)) return
      // 主ループの応答が届いたので、思考のトークン数の保留を送らない (014 data-model §2 の取り消し)。
      throttle.cancelThinking()
      // 再試行の後に主ループの assistant が届いた (014 data-model §3。result が失敗なら result で `failed` に書き換わる)。
      updateRetryRow('succeeded')
      onContext(record)
      const error = record.error
      if (error === undefined || error === null) return
      lastAssistantError = toAssistantErrorKey(error)
    },
    onUser: (message) => {
      const record = asRecord(message)
      if (record === null || record.type !== 'user') return
      // 結果の届いた tool の経過時間の保留を送らない (014 data-model §2 の取り消し)。
      cancelToolsWithResults(record)
    },
    onResult: (message) => {
      const record = asRecord(message)
      // ターンが終わったので、思考と全部の tool の保留を送らない (task の鍵は残す。014 data-model §2 の取り消し)。
      throttle.cancelThinking()
      throttle.cancelAllTools()
      // 行の閉じと `turn` は理由を返す前に送る (`fail()` の `state: error` と `ended` より前に届く。014 data-model §2 / §3)。
      updateRetryRow(isCompletedResult(record) ? 'succeeded' : 'failed')
      if (record?.type === 'result') onTurn(record)
      turnSeq += 1
      openRetryRowId = null
      retryRowStatus = null
      // 読むのは `subtype` と `api_error_status` だけ (`errors` / `result` を読まない。U-5)。
      const reason = classifyResultFailure({
        subtype: record?.subtype,
        apiErrorStatus: record?.api_error_status,
        lastAssistantError
      })
      lastAssistantError = null
      return reason
    },
    onSystem: (message) => {
      const record = asRecord(message)
      if (record === null || record.type !== 'system') return
      switch (record.subtype) {
        case 'api_retry':
          onApiRetry(record)
          break
        case 'init':
          // 各ターンの最初に届く。読むのは権限モードだけ (`cwd`・`tools`・`mcp_servers`・`model`・`plugins` ほか、
          // パスと会話の構成は読まない。014 data-model §2 の許可リスト)。
          observePermissionMode(record.permissionMode)
          break
        case 'status':
          onStatus(record)
          break
        case 'thinking_tokens':
          onThinkingTokens(record)
          break
        case 'task_progress':
          onTaskProgress(record)
          break
      }
    },
    onRateLimit: (message) => {
      const record = asRecord(message)
      if (record === null || record.type !== 'rate_limit_event') return
      // 読むのは `rate_limit_info` の 5 つだけ (`overage*`・`limitScope`・`errorCode`・`surpassedThreshold` ほかは読まない。
      // 014 data-model §2)。間引かない (低頻度)。`status` が列挙の外なら送らない。
      const info = asRecord(record.rate_limit_info)
      const status = toRateLimitStatus(info?.status)
      if (info === null || status === null) return
      send({
        kind: 'meter',
        meter: {
          type: 'rate-limit',
          status,
          limitType: toRateLimitType(info.rateLimitType),
          utilizationPct: toUtilizationPct(info.utilization),
          resetsAtSec: toResetsAtSec(info.resetsAt),
          usingOverage: info.isUsingOverage === true
        }
      })
    },
    onToolProgress: (message) => {
      const record = asRecord(message)
      // 主ループの tool だけ (subagent の中の tool の入れ子は O-6)。読むのは `tool_use_id` と `elapsed_time_seconds` だけ
      // (`tool_name`・`heartbeat`・`subagent_*`・`task_id` は読まない。014 data-model §2)。
      if (record === null || record.type !== 'tool_progress' || !isMainLoop(record)) return
      const toolUseId = record.tool_use_id
      if (!isValidToolUseId(toolUseId)) return
      throttle.offer(toolThrottleKey(toolUseId), {
        kind: 'meter',
        meter: {
          type: 'tool-elapsed',
          toolUseId,
          elapsedSeconds: toSeconds(record.elapsed_time_seconds)
        }
      })
    },
    dispose: () => {
      disposed = true
      throttle.dispose()
    }
  }
}
