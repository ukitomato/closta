import { redactSecrets } from '@domain/session/secret-redaction'

import { TOOL_DISPLAY_LABELS as L } from './labels'
import { pathTail } from './path-tail'

/**
 * ファイル・検索・Web・計画の tool の表示の純関数 (O-6 / 016 data-model §2)。入力 (`argsText`) は domain で無害化と上限を
 * 通った値で、ここは narrowing と見出し・File tree の組み立てだけを担う (失敗は null。呼び出し側は ToolFallback に退避する)。
 *
 * パスは会話由来の本文で、判定も除去もしない (UNC を含む)。ここで切り出す値は表示だけで、操作の対象にしない。
 */

/** 見出し (1 行) の上限 (コードポイント)。 */
export const HEADING_MAX = 80
/** File tree の 1 行の上限 (コードポイント)。 */
export const TREE_LINE_MAX = 1024
/** File tree に出す項目の上限。 */
export const TREE_ITEM_MAX = 200

/** コードポイント単位で切り詰める (超えたら末尾を `…` にして `max` に収める)。 */
export function truncateCodePoints(text: string, max: number): string {
  // UTF-16 の単位で `max * 2` を超えれば、コードポイントでも必ず `max` を超える (巨大な入力を配列にしない)。
  const bounded = text.length > max * 2 ? text.slice(0, max * 2 + 2) : text
  const points = Array.from(bounded)
  if (points.length <= max) return bounded
  return `${points.slice(0, max - 1).join('')}…`
}

/** 連続する空白・改行を 1 つの空白にし、前後を除く。 */
export function oneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

/** 見出しの自由文 (`pattern` / `glob` / `query` / `subject`)。伏せ字を通して 1 行にする。 */
function free(text: string): string {
  return oneLine(redactSecrets(text))
}

/** 見出し: 部品を ` · ` でつなぎ、80 コードポイントに切り詰める (部品は伏せ字を通した後の値)。 */
export function joinHeading(parts: readonly string[]): string {
  return truncateCodePoints(
    parts
      .map(oneLine)
      .filter((p) => p !== '')
      .join(' · '),
    HEADING_MAX
  )
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

function str(o: Record<string, unknown>, key: string): string | null {
  if (!Object.hasOwn(o, key)) return null
  const v = o[key]
  return typeof v === 'string' ? v : null
}

function count(o: Record<string, unknown>, key: string): number | null {
  if (!Object.hasOwn(o, key)) return null
  const v = o[key]
  return typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : null
}

function listLength(o: Record<string, unknown>, key: string): number {
  if (!Object.hasOwn(o, key)) return 0
  const v = o[key]
  return Array.isArray(v) ? v.length : 0
}

/** 結果の text (空白だけ・文字列でないときは null)。 */
export function resultTextOf(result: unknown): string | null {
  return typeof result === 'string' && result.trim() !== '' ? result : null
}

/* ── ファイルと検索 ─────────────────────────────────────────────── */

export type FileToolName = 'Read' | 'Glob' | 'Grep'

export interface FileToolView {
  readonly tool: FileToolName
  readonly heading: string
  /** 全体のパス (本文のまま。無ければ null)。 */
  readonly path: string | null
  /** 結果を File tree にするか (`Glob` と `Grep` の `files_with_matches`)。 */
  readonly tree: boolean
}

function tailOf(path: string): string {
  return free(pathTail(path))
}

export function readFileToolView(toolName: string, argsText: string): FileToolView | null {
  const o = parseObject(argsText)
  if (o === null) return null
  if (toolName === 'Read') {
    const filePath = str(o, 'file_path')
    if (filePath === null) return null
    const pages = str(o, 'pages')
    return {
      tool: 'Read',
      heading: joinHeading([
        tailOf(filePath),
        L.readRange(count(o, 'offset'), count(o, 'limit')),
        pages === null || free(pages) === '' ? '' : L.readPages(free(pages))
      ]),
      path: filePath,
      tree: false
    }
  }
  if (toolName === 'Glob') {
    const pattern = str(o, 'pattern')
    if (pattern === null) return null
    const path = str(o, 'path')
    return {
      tool: 'Glob',
      heading: joinHeading([free(pattern), path === null ? '' : tailOf(path)]),
      path,
      tree: true
    }
  }
  if (toolName === 'Grep') {
    const pattern = str(o, 'pattern')
    if (pattern === null) return null
    const glob = str(o, 'glob')
    const path = str(o, 'path')
    const mode = str(o, 'output_mode')
    const modeLabel = mode !== null && Object.hasOwn(L.outputMode, mode) ? L.outputMode[mode] : ''
    return {
      tool: 'Grep',
      heading: joinHeading([
        free(pattern),
        glob === null ? '' : free(glob),
        path === null ? '' : tailOf(path),
        modeLabel ?? ''
      ]),
      path,
      tree: mode === null || mode === 'files_with_matches'
    }
  }
  return null
}

/** File tree の元になる結果 (data-model §2「File tree の作り方」)。 */
export interface ResultTree {
  /** 注記 (届いた順)。 */
  readonly notes: readonly string[]
  /** 項目 (平らな配列。`TREE_ITEM_MAX` 件まで)。 */
  readonly items: readonly string[]
  /** 出さなかった項目の数。 */
  readonly hidden: number
  /** 項目の総数。 */
  readonly total: number
}

/** 注記の形 ([ASSUMED: CLI の出力の形。V-3 で実際の結果の text を記録して直す])。 */
function isNote(line: string): boolean {
  return (
    line.startsWith('(') ||
    /^Found \d+ (?:files?|matches)/.test(line) ||
    /^No (?:files|matches) found/.test(line)
  )
}

/** 結果の text から File tree の元を作る。項目が 0 件なら null (呼び出し側は text で出す)。 */
export function buildResultTree(text: string): ResultTree | null {
  const notes: string[] = []
  const all: string[] = []
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (line === '') continue
    if (isNote(line)) notes.push(truncateCodePoints(line, TREE_LINE_MAX))
    else if (all.length < TREE_ITEM_MAX) all.push(truncateCodePoints(line, TREE_LINE_MAX))
    else all.push('')
  }
  if (all.length === 0) return null
  const total = all.length
  return {
    notes,
    items: all.slice(0, TREE_ITEM_MAX),
    hidden: Math.max(0, total - TREE_ITEM_MAX),
    total
  }
}

/* ── Web ────────────────────────────────────────────────────────── */

export type WebToolName = 'WebFetch' | 'WebSearch'

export interface WebToolView {
  readonly tool: WebToolName
  /** WebSearch の見出し。WebFetch は空 (見出しは `source` から `web-tool-heading.ts` が作る)。 */
  readonly heading: string
  /** WebFetch の入力の URL (見出しの host の読み取りにだけ使う。表示しない)。 */
  readonly source: string | null
  /** WebFetch: 伏せ字を通した全体の URL。 */
  readonly url: string | null
  /** WebFetch: `prompt` (伏せ字を通す)。 */
  readonly prompt: string | null
}

export function readWebToolView(toolName: string, argsText: string): WebToolView | null {
  const o = parseObject(argsText)
  if (o === null) return null
  if (toolName === 'WebFetch') {
    const url = str(o, 'url')
    if (url === null) return null
    const prompt = str(o, 'prompt')
    return {
      tool: 'WebFetch',
      heading: '',
      source: url,
      url: redactSecrets(url),
      prompt: prompt === null ? null : redactSecrets(prompt)
    }
  }
  if (toolName === 'WebSearch') {
    const query = str(o, 'query')
    if (query === null) return null
    const restricted = listLength(o, 'allowed_domains') + listLength(o, 'blocked_domains')
    return {
      tool: 'WebSearch',
      heading: joinHeading([free(query), restricted > 0 ? L.domainRestriction(restricted) : '']),
      source: null,
      url: null,
      prompt: null
    }
  }
  return null
}

/* ── 計画と進捗 ─────────────────────────────────────────────────── */

export type TaskToolName = 'TaskCreate' | 'TaskUpdate' | 'TaskGet' | 'TaskList'

export interface TaskItemView {
  /** 項目の本文 (`subject` か「タスク #{taskId}」。伏せ字を通す)。 */
  readonly text: string
  /** `activeForm` (伏せ字を通す)。 */
  readonly activeForm: string | null
  /** 状態の鍵 (`pending` など。知らない値は `unknown`)。 */
  readonly statusKey: 'pending' | 'in_progress' | 'completed' | 'deleted' | 'unknown'
  /** 状態の文言。 */
  readonly statusLabel: string
}

export interface TaskToolView {
  readonly tool: TaskToolName
  readonly heading: string
  /** TodoList の 1 項目 (無ければ null)。 */
  readonly item: TaskItemView | null
}

/** 状態の対応 (`Object.hasOwn` の表で引く。知らない値は「不明」)。 */
export function taskStatusOf(status: string): Pick<TaskItemView, 'statusKey' | 'statusLabel'> {
  if (Object.hasOwn(L.taskStatus, status)) {
    return {
      statusKey: status as TaskItemView['statusKey'],
      statusLabel: L.taskStatus[status] ?? L.taskStatusUnknown
    }
  }
  return { statusKey: 'unknown', statusLabel: L.taskStatusUnknown }
}

export function readTaskToolView(toolName: string, argsText: string): TaskToolView | null {
  const o = parseObject(argsText)
  if (o === null) return null
  if (toolName === 'TaskCreate') {
    const subject = str(o, 'subject')
    if (subject === null) return null
    const activeForm = str(o, 'activeForm')
    return {
      tool: 'TaskCreate',
      heading: joinHeading([L.taskCreate, free(subject)]),
      item: {
        text: free(subject),
        activeForm: activeForm === null ? null : free(activeForm),
        statusKey: 'pending',
        statusLabel: L.taskAdded
      }
    }
  }
  if (toolName === 'TaskUpdate') {
    const taskId = str(o, 'taskId')
    if (taskId === null) return null
    const subject = str(o, 'subject')
    const status = str(o, 'status')
    const text = subject !== null && free(subject) !== '' ? free(subject) : L.taskId(free(taskId))
    return {
      tool: 'TaskUpdate',
      heading: joinHeading([L.taskUpdate, text]),
      item: status === null ? null : { text, activeForm: null, ...taskStatusOf(status) }
    }
  }
  if (toolName === 'TaskGet') {
    const taskId = str(o, 'taskId')
    if (taskId === null) return null
    return {
      tool: 'TaskGet',
      heading: joinHeading([`${L.taskGet} ${L.taskId(free(taskId))}`]),
      item: null
    }
  }
  if (toolName === 'TaskList') {
    return { tool: 'TaskList', heading: L.taskList, item: null }
  }
  return null
}

/* ── Agent plan ─────────────────────────────────────────────────── */

/** plan に生 HTML・コメントがあるか (`<` の後に英字・`!`・`/`)。markdown では描かれない部分の目印。 */
export function planHasUnrenderedMarkup(plan: string): boolean {
  return /<[A-Za-z!/]/.test(plan)
}
