import { isValidModelId } from '@domain/provider/model-catalog'

import { sanitizeBody } from './sanitize-body'
import { mayCarrySecret } from './system-event'

/**
 * セッションの構成 (`meter` の種類 `init-report` / `commands`) の形・形の検査・変換・decoder (O-5 / AD-048 Decision 3。
 * [data-model](../../../specs/015-ui-mcp-elicitation-commands/data-model.md) §2 が正本)。**純粋関数**で、SDK を import しない。
 *
 * セッションスレッドの変換 (`src/agents/live-signals.ts`) と renderer の decoder (`meter.ts` の `decodeMeterUpdate`) が
 * **同じ関数・同じ定数**を使う。
 *
 * | 規則 | 根拠 |
 * |---|---|
 * | 読むのは許可リストのフィールドだけ (`cwd`・プラグインの `path`・`apiKeySource`・`betas`・`capabilities` などは読まない)。許可リストのフィールドだけで新しい object を組む | data-model §2「変換の入力」/ spec FR-007 |
 * | 運ぶ文字列は利用者の設定・作業フォルダ・MCP サーバー・プラグインの作者に由来する**未信頼の文字列**。名前は allowlist の形の検査、説明は無害化と切り詰めを通す | data-model §2「形の検査」/ AD-048 Decision 3 |
 * | 件数とバイト数の上限を超えた分は落として `omitted` に数える | data-model §2 |
 * | 列挙は prototype を持たない表と `Object.hasOwn` で照合する | data-model §2 / `transcript-guard.ts` の方式 |
 * | どの入力でも例外を出さない | spec SC-002 |
 */

/* ── 形 ──────────────────────────────────────────────────────────── */

/** MCP サーバーの状態の鍵 (SDK の `McpServerStatus['status']` の 5 値と、知らない値の `unknown`)。 */
export const MCP_STATUS_KEYS = [
  'connected',
  'failed',
  'needs-auth',
  'pending',
  'disabled',
  'unknown'
] as const
export type McpStatusKey = (typeof MCP_STATUS_KEYS)[number]

export interface McpServerReport {
  readonly name: string
  readonly status: McpStatusKey
}

export interface PluginReport {
  readonly name: string
  readonly version: string | null
}

/** `system` / `init` から作る構成 (Claude Code が報告した構成。`SessionLaunchConfig` (選んだ設定) とは別物)。 */
export interface InitReportMeter {
  readonly type: 'init-report'
  readonly model: string | null
  readonly mcpServers: readonly McpServerReport[]
  readonly tools: readonly string[]
  readonly skills: readonly string[]
  readonly plugins: readonly PluginReport[]
  /** 正規の名前 (先頭の `/` を 1 つ外した形。`normalizeSlashCommandName`)。 */
  readonly slashCommands: readonly string[]
  readonly omitted: number
}

export interface SlashCommandReport {
  /** 正規の名前 (先頭の `/` を 1 つ外した形)。 */
  readonly name: string
  readonly description: string
  readonly argumentHint: string
}

/** `system` / `commands_changed` から作るスラッシュコマンドの一覧。 */
export interface CommandsMeter {
  readonly type: 'commands'
  readonly commands: readonly SlashCommandReport[]
  readonly omitted: number
}

/* ── 変換の入力 (読むフィールドだけ。SDK の型からの一方向の代入可能性は `sdk-agent-session.ts` で固定する) ── */

/** `system` / `init` のうち読むフィールド (data-model §2「変換の入力」)。 */
export interface SessionInitReportInput {
  readonly model: string
  readonly mcp_servers: readonly { readonly name: string; readonly status: string }[]
  readonly tools: readonly string[]
  readonly skills: readonly string[]
  readonly plugins: readonly { readonly name: string; readonly version?: string }[]
  readonly slash_commands: readonly string[]
}

/** `system` / `commands_changed` のうち読むフィールド (`aliases` は読まない)。 */
export interface CommandsChangedInput {
  readonly commands: readonly {
    readonly name: string
    readonly description: string
    readonly argumentHint: string
  }[]
}

/** `auth_status` のうち読むフィールド (`output` は読まない。`error` は有無だけを見て、文字列を運ばない。data-model §4)。 */
export interface AuthStatusInput {
  readonly isAuthenticating: boolean
  readonly error?: string
}

/** `system` / `plugin_install` のうち読むフィールド (`error` は読まない。data-model §4)。 */
export interface PluginInstallInput {
  readonly status: 'started' | 'installed' | 'failed' | 'completed'
  readonly name?: string
}

/* ── 形の検査の定数 (agents と decoder で共有) ───────────────────────── */

export const MAX_INIT_MCP_SERVERS = 64
export const MAX_INIT_TOOLS = 256
export const MAX_INIT_SKILLS = 128
export const MAX_INIT_PLUGINS = 64
export const MAX_INIT_SLASH_COMMANDS = 256
export const MAX_COMMANDS = 256
/** `meter` 1 件の直列化後のバイト数の上限 (`BODY_MAX_BYTES` (200,000) の内)。 */
export const INIT_REPORT_MAX_BYTES = 64 * 1024
/** コマンドの説明の長さ (コードポイント)。 */
export const COMMAND_DESCRIPTION_MAX_CODE_POINTS = 200
/** コマンドの `argumentHint` の長さ (コードポイント)。 */
export const COMMAND_ARGUMENT_HINT_MAX_CODE_POINTS = 64

/** MCP のサーバー名・`mcp__` の tool 名 (SDK のサーバー名の正規化と同じ文字集合)。 */
const MCP_NAME_SHAPE = /^[A-Za-z0-9_-]{1,128}$/
/** その他の tool 名・コマンド名・スキル名・プラグイン名・マーケットプレイスの名前。 */
const REPORT_NAME_SHAPE = /^[A-Za-z0-9_.:@/-]{1,128}$/
/** プラグインの `version` (作者が書いた値)。 */
const VERSION_SHAPE = /^[0-9A-Za-z.+-]{1,32}$/
/** scheme の無い userinfo の形 (`u:p@h/m`)。 */
const USERINFO_SHAPE = /^[^/]*:[^/]*@/
/** 説明から除く Unicode の一般カテゴリ (Cc / Cf / Zl / Zp)。 */
const INVISIBLE_OR_CONTROL = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu
/** 説明を読む前に無害化するバイト数 (200 コードポイントの 4 倍を十分に超える)。 */
const DESCRIPTION_SCAN_MAX_BYTES = 4_096

/* ── 形の検査の純関数 (agents と decoder で共有) ───────────────────────── */

/** MCP のサーバー名 (と `mcp__` で始まる tool 名) の形。 */
export function isMcpName(raw: unknown): raw is string {
  return typeof raw === 'string' && MCP_NAME_SHAPE.test(raw)
}

/** その他の名前 (tool 名・コマンド名・スキル名・プラグイン名・マーケットプレイスの名前) の形。`//` を含まない。 */
export function isReportName(raw: unknown): raw is string {
  return typeof raw === 'string' && REPORT_NAME_SHAPE.test(raw) && !raw.includes('//')
}

/** tool 名。`mcp__` で始まるものは MCP の名前の形、それ以外はその他の名前の形。 */
export function isToolName(raw: unknown): raw is string {
  if (typeof raw !== 'string') return false
  return raw.startsWith('mcp__') ? isMcpName(raw) : isReportName(raw)
}

/**
 * 計量で運んでよいモデルの id (O-4 / 014 data-model §2 の `modelId`)。文字種と長さの正本は domain の `isValidModelId`
 * (起動の設定・モデルカタログと同じ述語。`[1m]` 付き・`_` を含む id・Bedrock の ARN・Vertex の `model@date` を通す)。
 * その上に 3 つだけを足す: `//` を含まない・scheme の無い userinfo の形 (`u:p@h/m`) でない・`mayCarrySecret` が false。
 *
 * O-4 の `meter.ts` に置いていた述語を、`init-report` の `model` と共有するためにここへ移した (`meter.ts` は
 * `decodeMeterUpdate` から本ファイルの decoder を呼ぶので、`meter.ts` に残すと循環になる。AD-023 §7)。
 * `meter.ts` が同じ名前で再 export する。
 */
export function isMeterModelId(raw: unknown): raw is string {
  return (
    isValidModelId(raw) && !raw.includes('//') && !USERINFO_SHAPE.test(raw) && !mayCarrySecret(raw)
  )
}

/** プラグインの `version`。形に合わなければ null。 */
export function toPluginVersion(raw: unknown): string | null {
  return typeof raw === 'string' && VERSION_SHAPE.test(raw) ? raw : null
}

/** 状態の照合表 (prototype を持たない。`Object.hasOwn` と組で `__proto__` / `constructor` などを通さない)。 */
const MCP_STATUS_TABLE: Readonly<Record<string, true>> = (() => {
  const table: Record<string, true> = Object.create(null) as Record<string, true>
  for (const key of MCP_STATUS_KEYS) if (key !== 'unknown') table[key] = true
  return table
})()

/** MCP サーバーの状態。知らない値・文字列でない値は `unknown`。 */
export function toMcpStatusKey(raw: unknown): McpStatusKey {
  return typeof raw === 'string' && Object.hasOwn(MCP_STATUS_TABLE, raw)
    ? (raw as McpStatusKey)
    : 'unknown'
}

/**
 * コマンドの説明・`argumentHint` を 1 行の平文にする。`sanitizeBody` を通し、空白の並び (改行・U+2028 を含む) を
 * 1 つの空白に畳み、Unicode の Cc / Cf / Zl / Zp を除き、`maxCodePoints` で切り詰める。文字列でなければ ''。
 */
export function toOneLineText(raw: unknown, maxCodePoints: number): string {
  if (typeof raw !== 'string') return ''
  const line = sanitizeBody(raw, DESCRIPTION_SCAN_MAX_BYTES)
    .value.replace(/\s+/gu, ' ')
    .replace(INVISIBLE_OR_CONTROL, '')
    .replace(/ {2,}/g, ' ')
    .trim()
  const points = Array.from(line)
  return points.length > maxCodePoints ? points.slice(0, maxCodePoints).join('').trim() : line
}

/**
 * スラッシュコマンドの名前の正規の形 (先頭の `/` を 1 つ外す。data-model §2「スラッシュコマンドの名前の書式」)。
 * SDK の `SlashCommand.name` は先頭の `/` を持たず、`init.slash_commands` は書式の記述が無いのでそろえる。
 * 名前の形の検査の後で掛ける (`//` で始まるものは形の検査で落ちる)。
 */
export function normalizeSlashCommandName(name: string): string {
  return name.startsWith('/') ? name.slice(1) : name
}

/* ── プラグインの行の `detail` (015 data-model §4。`system-event.ts` は本ファイルから import されるのでここに置く) ── */

/** プラグインの行の中身 (導入できた数・できなかった数・最後のマーケットプレイスの名前)。 */
export interface PluginDetail {
  readonly installed: number
  readonly failed: number
  /** 名前の形の検査 (`isReportName`) を通った名前。無ければ null。 */
  readonly marketplace: string | null
}

/** 0 以上の安全な整数ならその値、そうでなければ 0。 */
function countOf(raw: number): number {
  return Number.isSafeInteger(raw) && raw >= 0 ? raw : 0
}

/** プラグインの行の中身 → `detail` (`<installed>/<failed>/<marketplace>`)。名前が形に合わなければ空にする。 */
export function encodePluginDetail(detail: PluginDetail): string {
  const name = isReportName(detail.marketplace) ? detail.marketplace : ''
  return `${countOf(detail.installed)}/${countOf(detail.failed)}/${name}`
}

const PLUGIN_DETAIL_SHAPE = /^(\d{1,16})\/(\d{1,16})\/(.*)$/su

/** プラグインの行の `detail` → 中身。形が合わなければ null。名前は形の検査をやり直し、外れたら null。 */
export function decodePluginDetail(detail: string): PluginDetail | null {
  const m = PLUGIN_DETAIL_SHAPE.exec(detail)
  if (m === null) return null
  const [, installedText = '', failedText = '', nameText = ''] = m
  const installed = Number(installedText)
  const failed = Number(failedText)
  if (!Number.isSafeInteger(installed) || !Number.isSafeInteger(failed)) return null
  return { installed, failed, marketplace: isReportName(nameText) ? nameText : null }
}

/* ── 直列化 (送るかの判定に使う。キーの順に依らない) ─────────────────── */

/** object のキーを並べ替えて直列化する。同じ値ならキーの順に依らず同じ文字列になる。 */
export function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`
  if (typeof value === 'object' && value !== null) {
    const rec = value as Record<string, unknown>
    const keys = Object.keys(rec)
      .filter((k) => rec[k] !== undefined)
      .sort()
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableSerialize(rec[k])}`).join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}

/* ── 集める部品 ───────────────────────────────────────────────────── */

type Rec = Record<string, unknown>

function asRecord(value: unknown): Rec | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Rec)
    : null
}

interface Collected<T> {
  readonly items: T[]
  readonly omitted: number
}

/** 配列の要素を `pick` で検査して集める。外れた要素と `max` を超えた要素は `omitted` に数える。配列でなければ null。 */
function collect<T>(
  raw: unknown,
  max: number,
  pick: (item: unknown) => T | null
): Collected<T> | null {
  if (!Array.isArray(raw)) return null
  const items: T[] = []
  let omitted = 0
  for (const item of raw as readonly unknown[]) {
    const value = pick(item)
    if (value === null || items.length >= max) omitted += 1
    else items.push(value)
  }
  return { items, omitted }
}

const EMPTY_COLLECTED: Collected<never> = { items: [], omitted: 0 }

const pickMcpServer = (item: unknown): McpServerReport | null => {
  const r = asRecord(item)
  if (r === null || !isMcpName(r.name)) return null
  return { name: r.name, status: toMcpStatusKey(r.status) }
}

const pickTool = (item: unknown): string | null => (isToolName(item) ? item : null)

const pickName = (item: unknown): string | null => (isReportName(item) ? item : null)

const pickPlugin = (item: unknown): PluginReport | null => {
  const r = asRecord(item)
  if (r === null || !isReportName(r.name)) return null
  return { name: r.name, version: toPluginVersion(r.version) }
}

const pickSlashCommandName = (item: unknown): string | null => {
  if (!isReportName(item)) return null
  const name = normalizeSlashCommandName(item)
  return name === '' ? null : name
}

const pickCommand = (item: unknown): SlashCommandReport | null => {
  const r = asRecord(item)
  if (r === null) return null
  const name = pickSlashCommandName(r.name)
  if (name === null) return null
  return {
    name,
    description: toOneLineText(r.description, COMMAND_DESCRIPTION_MAX_CODE_POINTS),
    argumentHint: toOneLineText(r.argumentHint, COMMAND_ARGUMENT_HINT_MAX_CODE_POINTS)
  }
}

/* ── バイト数の上限 ────────────────────────────────────────────────── */

function utf8Length(text: string): number {
  return new TextEncoder().encode(text).length
}

/**
 * 直列化後のバイト数が `INIT_REPORT_MAX_BYTES` を超えるあいだ、後ろの要素 (`lists` の最後の配列の末尾) から落とす。
 * 落とした数を返す (呼び手が `omitted` に足す)。`sizeOf(dropped)` は落とした数を `omitted` に足した値の大きさ。
 */
function dropFromTail(lists: readonly unknown[][], sizeOf: (dropped: number) => number): number {
  let dropped = 0
  let size = sizeOf(dropped)
  while (size > INIT_REPORT_MAX_BYTES) {
    let list: unknown[] | undefined
    for (let i = lists.length - 1; i >= 0; i--) {
      if (lists[i]!.length > 0) {
        list = lists[i]
        break
      }
    }
    if (list === undefined) break
    const item = list.pop()
    dropped += 1
    // 見積もりで減らし、上限の内に入ったら全体を測り直す (`omitted` の桁の増えを含める)。
    size -= utf8Length(JSON.stringify(item) ?? '') + (list.length > 0 ? 1 : 0)
    if (size <= INIT_REPORT_MAX_BYTES) size = sizeOf(dropped)
  }
  return dropped
}

interface InitReportParts {
  readonly model: string | null
  readonly mcpServers: Collected<McpServerReport>
  readonly tools: Collected<string>
  readonly skills: Collected<string>
  readonly plugins: Collected<PluginReport>
  readonly slashCommands: Collected<string>
  readonly omitted: number
}

function buildInitReport(parts: InitReportParts): InitReportMeter {
  const mcpServers = parts.mcpServers.items
  const tools = parts.tools.items
  const skills = parts.skills.items
  const plugins = parts.plugins.items
  const slashCommands = parts.slashCommands.items
  const omitted =
    parts.omitted +
    parts.mcpServers.omitted +
    parts.tools.omitted +
    parts.skills.omitted +
    parts.plugins.omitted +
    parts.slashCommands.omitted
  const make = (dropped: number): InitReportMeter => ({
    type: 'init-report',
    model: parts.model,
    mcpServers,
    tools,
    skills,
    plugins,
    slashCommands,
    omitted: omitted + dropped
  })
  const dropped = dropFromTail(
    [mcpServers, tools, skills, plugins, slashCommands] as unknown[][],
    (d) => utf8Length(JSON.stringify(make(d)))
  )
  return make(dropped)
}

function buildCommands(collected: Collected<SlashCommandReport>, omitted: number): CommandsMeter {
  const commands = collected.items
  const base = omitted + collected.omitted
  const make = (dropped: number): CommandsMeter => ({
    type: 'commands',
    commands,
    omitted: base + dropped
  })
  const dropped = dropFromTail([commands] as unknown[][], (d) =>
    utf8Length(JSON.stringify(make(d)))
  )
  return make(dropped)
}

/* ── 変換 (セッションスレッドが使う。SDK の値 → `meter`) ─────────────── */

/**
 * `system` / `init` → `init-report`。許可リストのフィールドだけを読み、形の検査を通した値だけで新しい object を組む。
 * 型が崩れた値 (配列でないなど) は空として扱う。例外を出さない。
 */
export function toInitReport(input: SessionInitReportInput): InitReportMeter {
  const r = asRecord(input) ?? {}
  return buildInitReport({
    model: isMeterModelId(r.model) ? r.model : null,
    mcpServers: collect(r.mcp_servers, MAX_INIT_MCP_SERVERS, pickMcpServer) ?? EMPTY_COLLECTED,
    tools: collect(r.tools, MAX_INIT_TOOLS, pickTool) ?? EMPTY_COLLECTED,
    skills: collect(r.skills, MAX_INIT_SKILLS, pickName) ?? EMPTY_COLLECTED,
    plugins: collect(r.plugins, MAX_INIT_PLUGINS, pickPlugin) ?? EMPTY_COLLECTED,
    slashCommands:
      collect(r.slash_commands, MAX_INIT_SLASH_COMMANDS, pickSlashCommandName) ?? EMPTY_COLLECTED,
    omitted: 0
  })
}

/** `system` / `commands_changed` → `commands`。`name`・`description`・`argumentHint` だけを読む (`aliases` は読まない)。 */
export function toCommands(input: CommandsChangedInput): CommandsMeter {
  const r = asRecord(input) ?? {}
  return buildCommands(collect(r.commands, MAX_COMMANDS, pickCommand) ?? EMPTY_COLLECTED, 0)
}

/* ── decoder (renderer が port から受けた値を検証する) ─────────────────── */

/** 送られた `omitted`。数でなければ null (形の外れ)。 */
function decodeOmitted(raw: unknown): number | null {
  if (typeof raw !== 'number') return null
  return Number.isSafeInteger(raw) && raw > 0 ? raw : 0
}

/**
 * `init-report` (未信頼) → `InitReportMeter`。agents と同じ形の検査を掛け直し、検証を通した値だけで新しい object を組む
 * (余分なキーを運ばない)。知らない形・型の違い (配列でない・`model` が文字列でも null でもない・`omitted` が数でない) は
 * null。例外を出さない。
 */
export function decodeInitReport(raw: unknown): InitReportMeter | null {
  const m = asRecord(raw)
  if (m === null || m.type !== 'init-report') return null
  if (m.model !== null && typeof m.model !== 'string') return null
  const omitted = decodeOmitted(m.omitted)
  const mcpServers = collect(m.mcpServers, MAX_INIT_MCP_SERVERS, pickMcpServer)
  const tools = collect(m.tools, MAX_INIT_TOOLS, pickTool)
  const skills = collect(m.skills, MAX_INIT_SKILLS, pickName)
  const plugins = collect(m.plugins, MAX_INIT_PLUGINS, pickPlugin)
  const slashCommands = collect(m.slashCommands, MAX_INIT_SLASH_COMMANDS, pickSlashCommandName)
  if (
    omitted === null ||
    mcpServers === null ||
    tools === null ||
    skills === null ||
    plugins === null ||
    slashCommands === null
  )
    return null
  return buildInitReport({
    model: isMeterModelId(m.model) ? m.model : null,
    mcpServers,
    tools,
    skills,
    plugins,
    slashCommands,
    omitted
  })
}

/** `commands` (未信頼) → `CommandsMeter`。`decodeInitReport` と同じ規則。 */
export function decodeCommands(raw: unknown): CommandsMeter | null {
  const m = asRecord(raw)
  if (m === null || m.type !== 'commands') return null
  const omitted = decodeOmitted(m.omitted)
  const commands = collect(m.commands, MAX_COMMANDS, pickCommand)
  if (omitted === null || commands === null) return null
  return buildCommands(commands, omitted)
}
