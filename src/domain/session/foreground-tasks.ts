import { bashCommandName } from './command-name'
import { isValidTaskId, isValidToolUseId } from './meter'
import { systemEventPartOf, toSystemEventMessage } from './system-event'
import type { TranscriptMessageDTO } from './transcript-dto'

/**
 * 前景で始まった task の記憶と、task の行の包み (O-11 / data-model §2.1〜§2.3。AD-056)。**I/O なし**。
 *
 * 前景で始まった task (`task_started` の `is_backgrounded` が true でない) は行にならない。後から
 * `task_updated` の `patch.is_backgrounded === true` で背景に移ったとき、行を作るための値 (種類・名前・
 * `tool_use_id`) だけをここで覚える。覚えた値は行を作るためだけに使い、`SessionEvent` にそのまま運ばない。
 * 永続化しない。task の状態の遷移は持たない (AD-044 Decision 6 を AD-056 が読み替えた範囲)。
 *
 * 実行中は 1 つのセッションスレッドに 1 つ、過去ログは 1 回の変換に 1 つ。
 */

/** 記憶の上限。超えたら最も古いものから忘れる。 */
export const MAX_FOREGROUND_TASKS = 256

/** 覚える値。 */
export interface ForegroundTask {
  /** `task_type` (1 行化済み)。 */
  readonly taskType: string
  /** `local_bash` 以外の行の `name` に使う description (1 行化済み。`local_bash` は ''。) */
  readonly name: string
  /** 形の正しい `tool_use_id`。無ければ null。 */
  readonly toolUseId: string | null
}

export interface ForegroundTaskMemory {
  /** `task_started` を見て、条件に合えば覚える。 */
  observeStarted(raw: unknown): void
  get(taskId: string): ForegroundTask | undefined
  forget(taskId: string): void
  readonly size: number
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : null
}

export function createForegroundTaskMemory(): ForegroundTaskMemory {
  const tasks = new Map<string, ForegroundTask>()
  return {
    observeStarted(raw) {
      const m = asRecord(raw)
      if (m === null || m.type !== 'system' || m.subtype !== 'task_started') return
      if (!isValidTaskId(m.task_id)) return
      if (m.is_backgrounded === true || m.ambient === true || m.skip_transcript === true) return
      // 行の値は task_started と同じ規則で作る (is_backgrounded を立てた写しを通す)。
      const row = toSystemEventMessage({ ...m, is_backgrounded: true })
      const part = systemEventPartOf(row ?? undefined)
      if (part === null) return
      tasks.delete(m.task_id)
      tasks.set(m.task_id, {
        taskType: part.detail,
        name: part.name,
        toolUseId: isValidToolUseId(m.tool_use_id) ? m.tool_use_id : null
      })
      while (tasks.size > MAX_FOREGROUND_TASKS) {
        const oldest = tasks.keys().next()
        if (oldest.done === true) break
        tasks.delete(oldest.value)
      }
    },
    get: (taskId) => tasks.get(taskId),
    forget: (taskId) => {
      tasks.delete(taskId)
    },
    get size() {
      return tasks.size
    }
  }
}

/** `Bash` の呼び出しの `argsText` (JSON) → コマンドの名前。取れなければ ''。 */
function commandNameOf(argsText: string | undefined): string {
  if (argsText === undefined) return ''
  try {
    const parsed: unknown = JSON.parse(argsText)
    const command = asRecord(parsed)?.command
    return typeof command === 'string' ? bashCommandName(command) : ''
  } catch {
    return ''
  }
}

/** `tool_use_id` から `Bash` の呼び出しの `argsText` を引く関数。 */
export type BashArgsResolver = (toolUseId: string) => string | undefined

export interface TaskRowBuilder {
  /**
   * SDK のシステムメッセージ (未信頼) → 行。`createdAt` は呼び出し元が渡す (AD-051)。
   * `bashArgsText` は `local_bash` の task の `Bash` の呼び出しの `argsText`、または `tool_use_id` から引く関数。
   * task 以外・対象外は `toSystemEventMessage` に任せる。
   */
  build(
    raw: unknown,
    createdAt: number | null,
    bashArgsText?: string | BashArgsResolver
  ): TranscriptMessageDTO | null
}

function withName(row: TranscriptMessageDTO | null, name: string): TranscriptMessageDTO | null {
  const part = systemEventPartOf(row ?? undefined)
  if (row === null || part === null) return row
  return { ...row, parts: [{ ...part, name }] }
}

export function createTaskRowBuilder(memory: ForegroundTaskMemory): TaskRowBuilder {
  function argsFor(
    toolUseId: string | null,
    source: string | BashArgsResolver | undefined
  ): string | undefined {
    if (typeof source === 'string') return source
    if (source === undefined || toolUseId === null) return undefined
    return source(toolUseId)
  }

  return {
    build(raw, createdAt, bashArgsText) {
      const m = asRecord(raw)
      if (m === null || m.type !== 'system') return toSystemEventMessage(raw, createdAt)
      switch (m.subtype) {
        case 'task_started': {
          memory.observeStarted(m)
          const row = toSystemEventMessage(raw, createdAt)
          const part = systemEventPartOf(row ?? undefined)
          if (part === null || part.detail !== 'local_bash') return row
          const toolUseId = isValidToolUseId(m.tool_use_id) ? m.tool_use_id : null
          return withName(row, commandNameOf(argsFor(toolUseId, bashArgsText)))
        }
        case 'task_updated': {
          const patch = asRecord(m.patch)
          const taskId = m.task_id
          if (patch?.is_backgrounded !== true || !isValidTaskId(taskId)) {
            return toSystemEventMessage(raw, createdAt)
          }
          const known = memory.get(taskId)
          if (known === undefined) return toSystemEventMessage(raw, createdAt)
          memory.forget(taskId)
          const update = toSystemEventMessage(raw, createdAt)
          const updatePart = systemEventPartOf(update ?? undefined)
          const name =
            known.taskType === 'local_bash'
              ? commandNameOf(argsFor(known.toolUseId, bashArgsText))
              : known.name
          return {
            id: `task:${taskId}`,
            role: 'system',
            parts: [
              {
                type: 'system-event',
                category: 'backgrounded-task',
                opens: true,
                name,
                detail: known.taskType,
                status: updatePart?.status ?? 'running'
              }
            ],
            createdAt
          }
        }
        case 'task_notification': {
          if (isValidTaskId(m.task_id)) memory.forget(m.task_id)
          return toSystemEventMessage(raw, createdAt)
        }
        default:
          return toSystemEventMessage(raw, createdAt)
      }
    }
  }
}
