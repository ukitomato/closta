import { sanitizeBody } from './sanitize-body'
import {
  SYSTEM_EVENT_STATUSES,
  type SystemEventCategory,
  type SystemEventStatus,
  type TranscriptMessageDTO,
  type TranscriptPartDTO
} from './transcript-dto'

/**
 * Hook / Background task のシステムメッセージ → transcript の 1 行 (O-2 / FR-008・FR-009。
 * [data-model](../../../specs/011-ui-coverage/data-model.md) §2 が許可リストの正本)。**純粋関数**で、実行中の
 * セッションスレッド (`sdk-agent-session.ts`) と過去ログの変換 (`transcript.ts`) の両方で使う。SDK を import しない。
 *
 * | 規則 | 根拠 |
 * |---|---|
 * | 変換するのは `hook_started` / `hook_response` / `task_started` / `task_updated` / `task_notification` だけ | FR-008 |
 * | Hook の出力本文・終了コード、task の prompt・要約・出力ファイル・更新の説明は読まない | data-model §2 |
 * | task は背景で始まったもの (`is_backgrounded` が true、ambient でも隠すものでもない) だけを行にする | data-model §2 |
 * | 行を作れるのは開始 (と Hook の応答) だけ。後続は同じ id の行に合成し、行の無い id への更新は捨てる | FR-009 |
 * | 状態の一覧は持たない (状態は transcript のメッセージの中にだけある) | USER 決定 2026-10-03 |
 */

/** 名前と detail の長さ (コードポイント)。 */
export const SYSTEM_EVENT_NAME_MAX_CODE_POINTS = 120

type SystemEventPart = Extract<TranscriptPartDTO, { type: 'system-event' }>

function asRecord(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : null
}

/** 会話由来の文字列を 1 行の plain text にする (無害化・空白の畳み込み・切り詰め)。文字列でなければ ''。 */
function oneLine(raw: unknown): string {
  if (typeof raw !== 'string') return ''
  const line = sanitizeBody(raw, 4_096).value.replace(/\s+/g, ' ').trim()
  const points = Array.from(line)
  return points.length > SYSTEM_EVENT_NAME_MAX_CODE_POINTS
    ? `${points.slice(0, SYSTEM_EVENT_NAME_MAX_CODE_POINTS).join('')}…`
    : line
}

/**
 * コマンドの文字列として秘密を含みうるか (data-model §4 と同じ判定。`local_bash` の task の説明に使う)。
 * クォート・バックスラッシュ・`$`・backtick・`(`、環境変数の代入、既知の秘密の接頭辞のどれかがあれば true。
 */
export function mayCarrySecret(text: string): boolean {
  if (/["'\\$`(]/.test(text)) return true
  if (/(^|\s)[A-Za-z_][A-Za-z0-9_]*=/.test(text)) return true
  return /(^|[^A-Za-z0-9])(sk-|ghp_|gho_|glpat-|AIza|xox)/.test(text)
}

const STATUS_SET: ReadonlySet<string> = new Set(SYSTEM_EVENT_STATUSES)

/** 値があれば理由キーに (知らない値は `unknown`)、無ければ `null`。 */
function toStatus(raw: unknown): SystemEventStatus | null {
  if (typeof raw !== 'string') return null
  return STATUS_SET.has(raw) ? (raw as SystemEventStatus) : 'unknown'
}

const HOOK_OUTCOMES: Readonly<Record<string, SystemEventStatus>> = {
  success: 'succeeded',
  error: 'failed',
  cancelled: 'cancelled'
}

function message(
  id: string,
  part: SystemEventPart,
  createdAt: number | null
): TranscriptMessageDTO {
  return { id, role: 'system', parts: [part], createdAt }
}

function part(
  category: SystemEventCategory,
  opens: boolean,
  name: string,
  detail: string,
  status: SystemEventStatus | null
): SystemEventPart {
  return { type: 'system-event', category, opens, name, detail, status }
}

/**
 * SDK のシステムメッセージ (未信頼) を 1 行の DTO にする。対象外の subtype・許可の条件に合わないものは `null`。
 * 行の id は `hook:<hook_id>` / `task:<task_id>`。
 */
export function toSystemEventMessage(
  raw: unknown,
  createdAt: number | null = null
): TranscriptMessageDTO | null {
  const m = asRecord(raw)
  if (!m || m.type !== 'system') return null
  switch (m.subtype) {
    case 'hook_started':
    case 'hook_response': {
      if (typeof m.hook_id !== 'string' || m.hook_id === '') return null
      const status =
        m.subtype === 'hook_started'
          ? 'started'
          : typeof m.outcome === 'string'
            ? (HOOK_OUTCOMES[m.outcome] ?? 'unknown')
            : 'unknown'
      return message(
        `hook:${m.hook_id}`,
        part('hook', true, oneLine(m.hook_name), oneLine(m.hook_event), status),
        createdAt
      )
    }
    case 'task_started': {
      if (typeof m.task_id !== 'string' || m.task_id === '') return null
      if (m.skip_transcript === true || m.ambient === true || m.is_backgrounded !== true)
        return null
      const taskType = oneLine(m.task_type)
      const description = oneLine(m.description)
      const name = taskType === 'local_bash' && mayCarrySecret(description) ? '' : description
      return message(`task:${m.task_id}`, part('task', true, name, taskType, 'running'), createdAt)
    }
    case 'task_updated': {
      if (typeof m.task_id !== 'string' || m.task_id === '') return null
      const patch = asRecord(m.patch)
      return message(
        `task:${m.task_id}`,
        part('task', false, '', '', toStatus(patch?.status)),
        createdAt
      )
    }
    case 'task_notification': {
      if (typeof m.task_id !== 'string' || m.task_id === '') return null
      if (m.skip_transcript === true) return null
      return message(
        `task:${m.task_id}`,
        part('task', false, '', '', toStatus(m.status)),
        createdAt
      )
    }
    default:
      return null
  }
}

/** メッセージの最初の part がシステムイベントならそれを返す。 */
export function systemEventPartOf(msg: TranscriptMessageDTO | undefined): SystemEventPart | null {
  const first = msg?.parts[0]
  return first !== undefined && first.type === 'system-event' ? first : null
}

/**
 * 同じ id の行への合成 (FR-009。規則の正本はここだけ)。
 * - 前の行が無い: `next.opens` なら行を作る (`next` を返す)。そうでなければ捨てる (`null`)
 * - 前の行がある: `status` は `next` が null でなければ `next`、`name` / `detail` は空でなければ `next`、`opens` は前のまま
 */
export function mergeSystemEvent(
  prev: TranscriptMessageDTO | undefined,
  next: TranscriptMessageDTO
): TranscriptMessageDTO | null {
  const nextPart = systemEventPartOf(next)
  if (nextPart === null) return next
  const prevPart = systemEventPartOf(prev)
  if (prev === undefined || prevPart === null) return nextPart.opens ? next : null
  return {
    ...prev,
    parts: [
      {
        ...prevPart,
        status: nextPart.status ?? prevPart.status,
        name: nextPart.name !== '' ? nextPart.name : prevPart.name,
        detail: nextPart.detail !== '' ? nextPart.detail : prevPart.detail
      }
    ]
  }
}

/** 終わりを表す状態か (それ以外の行は、セッションの終了後と過去ログで「結果不明」と描く)。 */
export function isTerminalSystemEventStatus(status: SystemEventStatus | null): boolean {
  return (
    status === 'succeeded' ||
    status === 'failed' ||
    status === 'cancelled' ||
    status === 'completed' ||
    status === 'killed' ||
    status === 'stopped'
  )
}
