import type { LaunchFailureReason, SessionEvent } from '@domain/session/agent-session'
import type { SafePermissionMode } from '@domain/session/launch-config'
import {
  contextTokensOf,
  isValidTaskId,
  isValidToolUseId,
  MAX_METER_PERMISSION_DENIALS,
  MAX_RETRACTION_IDS,
  toAssistantErrorKey,
  toBackgroundTaskEntries,
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
import {
  encodePluginDetail,
  isReportName,
  stableSerialize,
  toCommands,
  toInitReport,
  type CommandsChangedInput,
  type CommandsMeter,
  type InitReportMeter,
  type SessionInitReportInput
} from '@domain/session/session-init-report'
import { countToken, pickKey, toNoticeRow } from '@domain/session/notice-rows'
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
 * | 構成 (`init-report` / `commands`) は domain の `toInitReport` / `toCommands` で許可リストのフィールドだけを読む。送るかは変換後の値の直列化の全体で前回送った値と比べ、基準は実際に送ったときだけ更新する。`meter-throttle` に掛けず、種類ごとの合流 (1 秒の窓・leading・窓の終わりに最新) で流量を抑える | 015 spec FR-007 / data-model §2「送るかの判定と合流」/ AD-048 Decision 3 |
 * | 認証 (`auth_status`) とプラグイン (`plugin_install`) の行は `auth:<連番>` / `plugin:<連番>` で、連番と開いた行は closure に持つ。`output` / `error` の文字列は読まない (`error` は有無だけ) | 015 spec FR-010 / data-model §4 / U-4 |
 *
 * 失敗の理由 (014 tasks BE-012)・レート制限と API の再試行の行 (BE-020)・コンテキストとターン (BE-030)・権限モード (BE-040)・
 * 間引く進み具合と圧縮の行 (BE-042) と、構成 (015 tasks BE-020)・認証とプラグインの行 (015 tasks BE-031) を持つ。
 */

/** 構成 (`init-report` / `commands`) の合流の窓 (種類ごとに独立。015 data-model §2「送るかの判定と合流」)。 */
export const INIT_REPORT_COALESCE_MS = 1000

/** `init` のうち構成として読むフィールド (015 data-model §2「変換の入力」)。どれかが欠けた `init` は構成を観測していない。 */
const INIT_REPORT_FIELDS = [
  'model',
  'mcp_servers',
  'tools',
  'skills',
  'plugins',
  'slash_commands'
] as const

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
 * `name` は常に ''。`createdAt` は受信時刻 (`clock.now()`。O-9 / AD-051)。
 */
function buildRowEvent(
  createdAt: number,
  id: string,
  category: SystemEventCategory,
  opens: boolean,
  detail: string,
  status: SystemEventStatus | null,
  name = ''
): SessionEvent {
  return {
    kind: 'message',
    message: {
      id,
      role: 'system',
      parts: [{ type: 'system-event', category, opens, name, detail, status }],
      createdAt
    }
  }
}

/* ── O-6 の行の値の照合 (016 data-model §1。`Object.hasOwn` の表で引き、外れたら `-`) ───── */

const TRIGGERS: Readonly<Record<string, true>> = { manual: true, auto: true }

/** 取り消しの指示 1 回で見る id の件数の上限 (巨大な配列の走査を縛る)。 */
const MAX_RETRACTION_SCAN = 4096

/** result がターンの完了か (`classifyResult` と同じ規則。`subtype === 'success'` かつ `is_error === false` のときだけ)。 */
function isCompletedResult(record: Record<string, unknown> | null): boolean {
  const subtype = typeof record?.subtype === 'string' ? record.subtype : ''
  return classifyResult(subtype, record?.is_error !== false).kind === 'complete'
}

/** 構成の 1 つの種類の合流 (送るかの判定の基準・窓・保留を持つ。`createLiveSignals` の closure で種類ごとに 1 つ作る)。 */
interface ReportCoalescer<T> {
  offer(value: T): void
  dispose(): void
}

/**
 * 015 data-model §2「送るかの判定と合流」。前に送ってから `INIT_REPORT_COALESCE_MS` 以上たっていれば届いた値をすぐ送る
 * (leading)。窓の中で届いた値は最新の 1 つだけを保留し、窓の終わりに送る (trailing。最新の値は落とさない)。送る直前に
 * 直列化の全体で前回送った値と比べ、同じなら送らない。基準 (直列化と時刻) は実際に送ったときだけ更新する。
 */
function createReportCoalescer<T>(
  clock: LiveSignalsClock,
  send: (value: T) => void
): ReportCoalescer<T> {
  let lastSerialized: string | null = null
  let lastSentAt: number | null = null
  let pending: { readonly value: T } | null = null
  let timer: unknown = null
  let disposed = false

  const sendIfChanged = (value: T): void => {
    const serialized = stableSerialize(value)
    if (serialized === lastSerialized) return
    lastSerialized = serialized
    lastSentAt = clock.now()
    send(value)
  }

  const flush = (): void => {
    timer = null
    const held = pending
    pending = null
    if (held !== null && !disposed) sendIfChanged(held.value)
  }

  return {
    offer: (value) => {
      if (disposed) return
      if (timer !== null) {
        pending = { value }
        return
      }
      const elapsed = lastSentAt === null ? Infinity : clock.now() - lastSentAt
      if (elapsed >= INIT_REPORT_COALESCE_MS) {
        sendIfChanged(value)
        return
      }
      pending = { value }
      timer = clock.setTimer(flush, INIT_REPORT_COALESCE_MS - elapsed)
    },
    dispose: () => {
      disposed = true
      pending = null
      if (timer !== null) clock.clearTimer(timer)
      timer = null
    }
  }
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
  /**
   * 取り消し (O-6 / 016 data-model §1「取り消し」) の指示を受けた。`meter` の `retraction` を送った後に、形の検査を通した
   * id (重複なし) と件数 (指示の件数・形で落とした件数) を渡す。tool の結果の追跡 (`live-tool-results.ts`) に外させ、
   * 開発用のログに件数だけ残すのは呼び出し側。
   */
  readonly onRetract?: (info: RetractionInfo) => void
}

export interface RetractionInfo {
  readonly ids: readonly string[]
  readonly instructed: number
  readonly dropped: number
}

/** 各メソッドは SDK のメッセージ (未信頼) を構造だけで受ける。例外を投げない。 */
export interface LiveSignals {
  /** `assistant` (主ループと subagent の中の両方が来る。主ループは `parent_tool_use_id === null`)。 */
  onAssistant(message: unknown): void
  /** `user` (読むのは `tool_result` ブロックの `tool_use_id` だけ)。 */
  onUser(message: unknown): void
  /** `result` (成功・失敗とも)。失敗のときに `fail()` へ渡す理由を返す (成功のときは使われない)。 */
  onResult(message: unknown): LaunchFailureReason
  /** `system` (`init` / `commands_changed` / `plugin_install` / `status` / `api_retry` / `thinking_tokens` / `task_progress` ほか)。 */
  onSystem(message: unknown): void
  /** `rate_limit_event`。 */
  onRateLimit(message: unknown): void
  /** 最上位の `auth_status` (読むのは `isAuthenticating` と `error` の有無だけ。015 data-model §4)。 */
  onAuthStatus(message: unknown): void
  /** 最上位の `conversation_reset` (`uuid` だけを読む。`new_conversation_id` は読まない。016 data-model §1)。 */
  onConversationReset(message: unknown): void
  /** トップレベルの知らせ (`tool_use_summary` / `active_goal`。未信頼。O-12)。 */
  onNotice(message: unknown): void
  /** assistant の `supersedes` (未信頼)。`retraction` の `meter` を即時に送る。代わりのメッセージを送る前に呼ぶ。 */
  onRetraction(rawIds: unknown): void
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
  /** 認証の行の id の連番 (`auth:<authSeq>`。行を作るたびに +1。015 data-model §4)。 */
  let authSeq = 0
  /** 開いた (`isAuthenticating: false` の来ていない) 認証の行の id。閉じたら消す。 */
  let openAuthRowId: string | null = null
  /** プラグインの行の id の連番 (`plugin:<pluginSeq>`。行を作るたびに +1。015 data-model §4)。 */
  let pluginSeq = 0
  /** 開いた (`completed` の来ていない) プラグインの行の id と、その行の数と最後のマーケットプレイスの名前。 */
  let openPlugin: {
    id: string
    installed: number
    failed: number
    marketplace: string | null
  } | null = null
  /**
   * 間引き (思考のトークン数・tool の経過時間・task の進み具合。014 data-model §2「間引きと後始末」)。送るのは `send` を
   * 通すので、`dispose()` の後は何も届かない。
   */
  const throttle = createMeterThrottle<SessionEvent>({ clock: deps.clock, send })
  /** 行の時刻は受信時刻 (signals の時計。O-9 / AD-051)。 */
  const rowEvent = (
    id: string,
    category: SystemEventCategory,
    opens: boolean,
    detail: string,
    status: SystemEventStatus | null,
    name = ''
  ): SessionEvent => buildRowEvent(deps.clock.now(), id, category, opens, detail, status, name)
  /**
   * 構成の合流 (015 data-model §2。種類ごとに独立)。`meter-throttle` の上限を使わない (AD-048 Decision 3)。送るのは
   * `send` を通すので、`dispose()` の後は何も届かない。
   */
  const initReports = createReportCoalescer<InitReportMeter>(deps.clock, (meter) =>
    send({ kind: 'meter', meter })
  )
  const commandLists = createReportCoalescer<CommandsMeter>(deps.clock, (meter) =>
    send({ kind: 'meter', meter })
  )

  /**
   * `system` / `init` → `meter` の `init-report` (015 data-model §2 の許可リスト: `model`・`mcp_servers` の `name` と
   * `status`・`tools`・`skills`・`plugins` の `name` と `version`・`slash_commands`)。SDK の `init` はこの 6 つを必ず持つ
   * (`sdk-agent-session.ts` の入力型の代入可能性で固定)。どれかが欠けた `init` は構成を観測していないので何もしない
   * (権限モードの `observePermissionMode` と同じ構え。欠けた構成で前の値を空に上書きしない)。
   */
  const onInitReport = (record: Record<string, unknown>): void => {
    if (!INIT_REPORT_FIELDS.every((field) => record[field] !== undefined)) return
    initReports.offer(toInitReport(record as unknown as SessionInitReportInput))
  }

  /**
   * `system` / `commands_changed` → `meter` の `commands` (読むのは `commands` の `name`・`description`・`argumentHint`
   * だけ)。`commands` の無いものは一覧を観測していないので何もしない (空の一覧で前の値を上書きしない。`init` と同じ構え)。
   */
  const onCommandsChanged = (record: Record<string, unknown>): void => {
    if (record.commands === undefined) return
    commandLists.offer(toCommands(record as unknown as CommandsChangedInput))
  }

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

  /**
   * 最上位の `auth_status` → 認証の行 (015 data-model §4。読むのは `isAuthenticating` と `error` の有無だけで、`output` と
   * `error` の文字列は読まない)。`isAuthenticating: true` で開いた行が無ければ `auth:<authSeq>` を `authenticating` で作る
   * (開いている間の続きは送らない)。`isAuthenticating: false` で開いた行を `succeeded` (`error` があれば `failed`) に閉じる。
   * 開いた行が無いまま `false` が来たら、`error` があるときだけ `auth:<authSeq>` を `failed` で作って閉じる (開いた行は
   * 持たない。`error` の無い成功は作らない。015 data-model §4「開いた行が無いまま結果が届いたとき」)。
   */
  const onAuth = (record: Record<string, unknown>): void => {
    if (record.isAuthenticating === true) {
      if (openAuthRowId !== null) return
      openAuthRowId = `auth:${authSeq}`
      authSeq += 1
      send(rowEvent(openAuthRowId, 'auth', true, '', 'authenticating'))
      return
    }
    if (record.isAuthenticating !== false) return
    const hasError = record.error !== undefined && record.error !== null && record.error !== ''
    if (openAuthRowId === null) {
      if (!hasError) return
      send(rowEvent(`auth:${authSeq}`, 'auth', true, '', 'failed'))
      authSeq += 1
      return
    }
    send(rowEvent(openAuthRowId, 'auth', false, '', hasError ? 'failed' : 'succeeded'))
    openAuthRowId = null
  }

  /**
   * `system` / `plugin_install` → プラグインの行 (015 data-model §4。読むのは `status` と `name` だけで、`error` は読まない)。
   * `started` で開いた行が無ければ `plugin:<pluginSeq>` を作り、`installed` / `failed` を数え、`completed` で閉じる
   * (失敗が 1 つでもあれば `failed`)。`detail` は数と最後のマーケットプレイスの名前 (名前の形の検査を通ったものだけ)。
   * 開いた行が無いまま `installed` / `failed` が来たら、`plugin:<pluginSeq>` を `started` で開いてその 1 件を数え、以後は
   * 同じ規則で合成する。`completed` だけなら数 0 / 0 の行を `completed` で作る (015 data-model §4「開いた行が無いまま結果が
   * 届いたとき」)。
   */
  const onPluginInstall = (record: Record<string, unknown>): void => {
    const status = record.status
    if (status === 'started') {
      if (openPlugin !== null) return
      openPlugin = {
        id: `plugin:${pluginSeq}`,
        installed: 0,
        failed: 0,
        marketplace: isReportName(record.name) ? record.name : null
      }
      pluginSeq += 1
      send(rowEvent(openPlugin.id, 'plugin', true, encodePluginDetail(openPlugin), 'started'))
      return
    }
    if (status !== 'installed' && status !== 'failed' && status !== 'completed') return
    if (openPlugin === null) {
      const marketplace = isReportName(record.name) ? record.name : null
      const id = `plugin:${pluginSeq}`
      pluginSeq += 1
      if (status === 'completed') {
        const detail = encodePluginDetail({ installed: 0, failed: 0, marketplace })
        send(rowEvent(id, 'plugin', true, detail, 'completed'))
        return
      }
      openPlugin = {
        id,
        installed: status === 'installed' ? 1 : 0,
        failed: status === 'failed' ? 1 : 0,
        marketplace
      }
      send(rowEvent(id, 'plugin', true, encodePluginDetail(openPlugin), 'started'))
      return
    }
    if (status === 'installed') openPlugin.installed += 1
    if (status === 'failed') openPlugin.failed += 1
    if (isReportName(record.name)) openPlugin.marketplace = record.name
    const detail = encodePluginDetail(openPlugin)
    if (status !== 'completed') {
      send(rowEvent(openPlugin.id, 'plugin', false, detail, null))
      return
    }
    send(
      rowEvent(
        openPlugin.id,
        'plugin',
        false,
        detail,
        openPlugin.failed > 0 ? 'failed' : 'completed'
      )
    )
    openPlugin = null
  }

  /**
   * 取り消しの指示 (assistant の `supersedes` と `model_refusal_fallback` の `retracted_message_uuids`。未信頼) →
   * `meter` の `retraction` (128 件ごとに分けて即時に送る。`meter-throttle` にも種類ごとの合流にも掛けない)。
   * 形の外れた id は 1 件ずつ落とし、重複は 1 つにする。配列でなければ何もしない。
   */
  const retractIds = (raw: unknown): void => {
    if (disposed || !Array.isArray(raw)) return
    const list = raw as readonly unknown[]
    const seen = new Set<string>()
    const ids: string[] = []
    const scanned = Math.min(list.length, MAX_RETRACTION_SCAN)
    for (let i = 0; i < scanned; i += 1) {
      const id = list[i]
      if (!isValidToolUseId(id) || seen.has(id)) continue
      seen.add(id)
      ids.push(id)
    }
    for (let i = 0; i < ids.length; i += MAX_RETRACTION_IDS) {
      send({
        kind: 'meter',
        meter: { type: 'retraction', messageIds: ids.slice(i, i + MAX_RETRACTION_IDS) }
      })
    }
    deps.onRetract?.({ ids, instructed: list.length, dropped: list.length - ids.length })
  }

  /** `system` / `compact_boundary` → 圧縮の境界の行 (016 data-model §1。`compact_metadata` の 3 つだけを読む)。 */
  const onCompactBoundary = (record: Record<string, unknown>): void => {
    const uuid = record.uuid
    if (!isValidToolUseId(uuid)) return
    const meta = asRecord(record.compact_metadata)
    const detail = `${pickKey(TRIGGERS, meta?.trigger)} ${countToken(meta?.pre_tokens)} ${countToken(meta?.post_tokens)}`
    send(rowEvent(`compact-boundary:${uuid}`, 'compact-boundary', true, detail, 'marked'))
  }

  /**
   * `system` の知らせの類 (O-6 / O-10 / O-12。12 の種類の行の組み立ては domain の `toNoticeRow` の 1 つ。FR-012)。
   * 行にならなければ (`null`) 何も送らない。
   */
  const sendNotice = (raw: unknown): void => {
    const message = toNoticeRow(raw, deps.clock.now(), globalThis.crypto.randomUUID())
    if (message !== null) send({ kind: 'message', message })
  }

  /**
   * `system` / `background_tasks_changed` → `background-tasks` の `meter` (O-11 / AD-056 Decision 2)。`tasks` の
   * `task_id` と `task_type` だけを読む (`description`・`ambient` ほかは運ばない)。最新の値の置き換えなので間引かず即時に送る
   * (`meter-throttle` を通さない)。`Query.backgroundTasks` は呼ばず、stream のメッセージだけを読む。
   */
  const onBackgroundTasks = (record: Record<string, unknown>): void => {
    send({
      kind: 'meter',
      meter: { type: 'background-tasks', tasks: toBackgroundTaskEntries(record.tasks) }
    })
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
          // 各ターンの最初に届く。読むのは権限モード (014 data-model §2) と、構成の許可リストのフィールド (015 data-model
          // §2) だけ (`cwd`・プラグインの `path`・`apiKeySource`・`betas`・`capabilities` ほかは読まない)。
          observePermissionMode(record.permissionMode)
          onInitReport(record)
          break
        case 'commands_changed':
          onCommandsChanged(record)
          break
        case 'plugin_install':
          onPluginInstall(record)
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
        case 'compact_boundary':
          onCompactBoundary(record)
          break
        case 'model_refusal_fallback':
          // 取り消し (副作用) は agents に残す。行の組み立ては domain。
          retractIds(record.retracted_message_uuids)
          sendNotice(record)
          break
        case 'model_refusal_no_fallback':
        case 'informational':
        case 'elicitation_complete':
        case 'notification':
        case 'local_command_output':
        case 'memory_recall':
        case 'mirror_error':
        case 'files_persisted':
          sendNotice(record)
          break
        case 'background_tasks_changed':
          onBackgroundTasks(record)
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
    onAuthStatus: (message) => {
      const record = asRecord(message)
      if (record === null || record.type !== 'auth_status') return
      onAuth(record)
    },
    onConversationReset: (message) => {
      const record = asRecord(message)
      if (record === null || record.type !== 'conversation_reset') return
      sendNotice(record)
    },
    onNotice: (message) => {
      // トップレベルの知らせ (`tool_use_summary` / `active_goal`。引数は未信頼なので型の確認は toNoticeRow が行う)。
      sendNotice(message)
    },
    onRetraction: (rawIds) => {
      retractIds(rawIds)
    },
    onToolProgress: (message) => {
      const record = asRecord(message)
      // 主ループの tool だけ (入れ子は実装済み (O-11)。経過時間は主ループだけ)。読むのは `tool_use_id` と `elapsed_time_seconds` だけ
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
      initReports.dispose()
      commandLists.dispose()
    }
  }
}
