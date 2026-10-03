/**
 * 各 Tier A tool の入力 (`argsText`) を **untrusted narrowing** する純粋関数群 (R-4 / FE-020 /
 * [contracts/tool-display-mapping.md](../../../../../specs/004-ui-tier-a-tool-display/contracts/tool-display-mapping.md) C-2)。
 *
 * **入力は `domain` (`transcript.ts`) で `sanitizeBody` (bidi/C1 除去 + byte 上限) を通した後の `argsText`** である
 * (design-gate H-1 / M-N01)。**ここは sanitize しない** — narrowing (JSON.parse + 形の検査) のみを担う。
 * bidi/C1 除去の正本テストは `domain` の `transcript.test.ts`、DOM 端点は `ChatScreen.test.tsx`。
 *
 * すべて **失敗 (JSON.parse 失敗 / 型不一致 / 必須フィールド欠落) で `null` を返す** (throw しない)。
 * 呼び出し側は `null` のとき生 `argsText` の `ToolFallback` に退避する (FR-009 / SC-005)。
 */

export interface BashArgs {
  readonly command: string
  readonly description?: string
}

export interface EditArgs {
  readonly file_path: string
  readonly old_string: string
  readonly new_string: string
  readonly replace_all?: boolean
}

export interface WriteArgs {
  readonly file_path: string
  readonly content: string
}

export interface MultiEditItem {
  readonly old_string: string
  readonly new_string: string
}

export interface MultiEditArgs {
  readonly file_path: string
  readonly edits: readonly MultiEditItem[]
}

/** Claude Code の TodoWrite の既知 status。未知値は生のまま持ち回す (欠落させない。SC-003)。 */
export type TodoStatus = 'pending' | 'in_progress' | 'completed'

export interface TodoItemArgs {
  readonly content: string
  /** 既知集合外の値もそのまま保持する (生値表示。SC-003)。 */
  readonly status: string
  readonly activeForm?: string
}

export interface TodoArgs {
  readonly todos: readonly TodoItemArgs[]
}

export interface TaskArgs {
  readonly subagent_type?: string
  readonly description?: string
  readonly prompt?: string
}

export interface PlanArgs {
  readonly plan: string
}

export const KNOWN_TODO_STATUSES: readonly TodoStatus[] = ['pending', 'in_progress', 'completed']

export function isKnownTodoStatus(status: string): status is TodoStatus {
  return (KNOWN_TODO_STATUSES as readonly string[]).includes(status)
}

function parseObject(argsText: string): Record<string, unknown> | null {
  if (argsText.length === 0) return null
  try {
    const value: unknown = JSON.parse(argsText)
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

function str(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

export function parseBashArgs(argsText: string): BashArgs | null {
  const o = parseObject(argsText)
  if (!o) return null
  const command = str(o.command)
  if (command === null) return null
  const description = str(o.description)
  return description === null ? { command } : { command, description }
}

export function parseEditArgs(argsText: string): EditArgs | null {
  const o = parseObject(argsText)
  if (!o) return null
  const file_path = str(o.file_path)
  const old_string = str(o.old_string)
  const new_string = str(o.new_string)
  if (file_path === null || old_string === null || new_string === null) return null
  return typeof o.replace_all === 'boolean'
    ? { file_path, old_string, new_string, replace_all: o.replace_all }
    : { file_path, old_string, new_string }
}

export function parseWriteArgs(argsText: string): WriteArgs | null {
  const o = parseObject(argsText)
  if (!o) return null
  const file_path = str(o.file_path)
  const content = str(o.content)
  if (file_path === null || content === null) return null
  return { file_path, content }
}

export function parseMultiEditArgs(argsText: string): MultiEditArgs | null {
  const o = parseObject(argsText)
  if (!o) return null
  const file_path = str(o.file_path)
  if (file_path === null || !Array.isArray(o.edits)) return null
  const edits: MultiEditItem[] = []
  for (const raw of o.edits) {
    if (typeof raw !== 'object' || raw === null) return null
    const e = raw as Record<string, unknown>
    const old_string = str(e.old_string)
    const new_string = str(e.new_string)
    if (old_string === null || new_string === null) return null
    edits.push({ old_string, new_string })
  }
  if (edits.length === 0) return null
  return { file_path, edits }
}

export function parseTodoArgs(argsText: string): TodoArgs | null {
  const o = parseObject(argsText)
  if (!o || !Array.isArray(o.todos)) return null
  const todos: TodoItemArgs[] = []
  for (const raw of o.todos) {
    if (typeof raw !== 'object' || raw === null) return null
    const t = raw as Record<string, unknown>
    const content = str(t.content)
    const status = str(t.status)
    if (content === null || status === null) return null
    const activeForm = str(t.activeForm)
    todos.push(activeForm === null ? { content, status } : { content, status, activeForm })
  }
  return { todos }
}

export function parseTaskArgs(argsText: string): TaskArgs | null {
  const o = parseObject(argsText)
  if (!o) return null
  const subagent_type = str(o.subagent_type)
  const description = str(o.description)
  const prompt = str(o.prompt)
  // Task は全フィールド任意扱い。少なくとも 1 つ拾えれば専用表示にする (空なら fallback)。
  if (subagent_type === null && description === null && prompt === null) return null
  const out: { subagent_type?: string; description?: string; prompt?: string } = {}
  if (subagent_type !== null) out.subagent_type = subagent_type
  if (description !== null) out.description = description
  if (prompt !== null) out.prompt = prompt
  return out
}

/**
 * subagent の呼び出し `Agent` の入力 (SDK 0.3.270 の `AgentInput`: `description` / `prompt` / 任意の `subagent_type`。
 * O-2 / FR-010 / research R-05)。表示に使うフィールドは旧名 `Task` と同じなので、同じ narrowing を使う
 * (`model` / `run_in_background` などの他のフィールドは読まない)。
 */
export type AgentArgs = TaskArgs

export function parseAgentArgs(argsText: string): AgentArgs | null {
  return parseTaskArgs(argsText)
}

export function parsePlanArgs(argsText: string): PlanArgs | null {
  const o = parseObject(argsText)
  if (!o) return null
  const plan = str(o.plan)
  return plan === null ? null : { plan }
}
