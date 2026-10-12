import { isMcpName } from '@domain/session/session-init-report'
import { mayCarrySecret } from '@domain/session/system-event'

/**
 * MCP の tool の名前の解き方と resource の URI の要約 (O-5 / FE-010。
 * [data-model](../../../../../specs/015-ui-mcp-elicitation-commands/data-model.md) §1 が正本)。**純粋関数**。
 *
 * | 規則 | 根拠 |
 * |---|---|
 * | `mcp__<rest>` は、表示中のセッションの構成が報告したサーバー名の前方一致で分ける。一致がちょうど 1 つなら印なし、2 つ以上なら最長で分けて「推定」の印 | data-model §1 の表 / CWE-451 |
 * | 構成が無い・どれにも一致しないときは最初の `__` で分け「推定」の印。分けられなければ全体を 1 つの tool 名にする | data-model §1 の表 / spec Edge Cases |
 * | 名前は 2 層目の無害化 (制御文字・双方向制御・ゼロ幅) を通す。照合は `Set` と文字列の比較で、prototype のキーに依らない | data-model §1 |
 * | URI は `protocol`・`host`・最後のパスの要素だけ。userinfo・query・hash を捨て、秘密の形の host と末尾も落とす | data-model §1「URI の要約」/ research R-07 / CWE-200 |
 *
 * どの入力でも例外を出さない。
 */

/** MCP の組み込みの 4 tool (完全一致で振り分ける。data-model §1)。 */
export const MCP_BUILTIN_TOOL_NAMES = [
  'ListMcpResourcesTool',
  'ReadMcpResourceTool',
  'ReadMcpResourceDir',
  'RefreshMcpTools'
] as const
export type McpBuiltinToolName = (typeof MCP_BUILTIN_TOOL_NAMES)[number]

const BUILTIN_SET: ReadonlySet<string> = new Set(MCP_BUILTIN_TOOL_NAMES)

/** 組み込みの 4 tool のどれかか。 */
export function isMcpBuiltinToolName(name: string): name is McpBuiltinToolName {
  return BUILTIN_SET.has(name)
}

/** 解いた名前。`server` が null なら見出しは tool だけ。`inferred` は「サーバー名は推定」の印。 */
export interface McpToolNameParts {
  readonly kind: 'mcp' | 'mcp-builtin'
  readonly server: string | null
  readonly tool: string
  readonly inferred: boolean
}

const MCP_PREFIX = 'mcp__'
const SEPARATOR = '__'

/** 2 層目の無害化で除く文字 (Cc・Cf (双方向制御・ゼロ幅・tag 文字を含む)・Zl・Zp)。 */
const INVISIBLE_OR_CONTROL = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu

/** 名前から制御文字・双方向制御・ゼロ幅を落とす (実行中・過去ログの `sanitizeBody` の後の 2 層目)。 */
export function stripInvisible(raw: string): string {
  return raw.replace(INVISIBLE_OR_CONTROL, '')
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

/** 組み込みの tool の入力 (`argsText`) から `server` と `uri` を読む。`server` は MCP の名前の形に通ったときだけ。 */
export function readMcpBuiltinArgs(argsText: string): {
  readonly server: string | null
  readonly uri: string | null
} {
  const o = parseObject(argsText)
  if (o === null) return { server: null, uri: null }
  return {
    server: isMcpName(o.server) ? o.server : null,
    uri: typeof o.uri === 'string' ? o.uri : null
  }
}

/**
 * tool 名を MCP の名前として解く (data-model §1 の表)。MCP でなければ null。
 *
 * @param name tool 名 (`sanitizeBody` を通った値。ここでも 2 層目の無害化を掛ける)
 * @param knownServers 表示中のセッションの構成が報告したサーバー名 (過去ログ・構成が無いときは空)
 * @param argsText 組み込みの 4 tool のときに `server` を読む入力 (省略時はサーバー名なし)
 */
export function parseMcpToolName(
  name: string,
  knownServers: readonly string[],
  argsText = ''
): McpToolNameParts | null {
  const clean = stripInvisible(name)
  if (isMcpBuiltinToolName(clean)) {
    return {
      kind: 'mcp-builtin',
      server: readMcpBuiltinArgs(argsText).server,
      tool: clean,
      inferred: false
    }
  }
  if (!clean.startsWith(MCP_PREFIX)) return null
  const rest = clean.slice(MCP_PREFIX.length)

  // 構成が報告したサーバー名の前方一致 (`Set` で重複を除く。prototype のキーに依らない比較)。
  const matches: string[] = []
  for (const server of new Set(knownServers)) {
    if (server.length === 0) continue
    const head = server + SEPARATOR
    if (rest.startsWith(head) && rest.length > head.length) matches.push(server)
  }
  if (matches.length > 0) {
    let longest = matches[0]!
    for (const m of matches) if (m.length > longest.length) longest = m
    return {
      kind: 'mcp',
      server: longest,
      tool: rest.slice(longest.length + SEPARATOR.length),
      inferred: matches.length > 1
    }
  }

  // 構成が無い・どれにも一致しない: 最初の `__` で分けて推定の印を付ける。
  const at = rest.indexOf(SEPARATOR)
  if (at > 0 && at + SEPARATOR.length < rest.length) {
    return {
      kind: 'mcp',
      server: rest.slice(0, at),
      tool: rest.slice(at + SEPARATOR.length),
      inferred: true
    }
  }
  return { kind: 'mcp', server: null, tool: clean, inferred: false }
}

/** transcript の見出しの長さ (コードポイント)。 */
export const MCP_HEADING_MAX_CODE_POINTS = 64

const HEADING_SEPARATOR = ' › '

function cut(text: string, max: number): string {
  const points = Array.from(text)
  return points.length > max ? `${points.slice(0, max).join('')}…` : text
}

/**
 * transcript の見出しの 2 つの部分 (サーバー名と tool 名を分けて描くため)。`{server} › {tool}` の全体が
 * 64 コードポイントに収まるように、サーバー名・tool 名の順に切り詰める (切ったところに `…`)。
 */
export function mcpToolHeadingParts(parts: McpToolNameParts): {
  readonly server: string | null
  readonly tool: string
} {
  const sep = Array.from(HEADING_SEPARATOR).length
  const server =
    parts.server === null ? null : cut(parts.server, MCP_HEADING_MAX_CODE_POINTS - sep - 1)
  const used = server === null ? 0 : Array.from(server).length + sep
  return { server, tool: cut(parts.tool, Math.max(1, MCP_HEADING_MAX_CODE_POINTS - used)) }
}

/** transcript の見出し `{server} › {tool}` (server が null なら tool だけ)。1 行・64 コードポイントで切り詰める。 */
export function mcpToolHeading(parts: McpToolNameParts): string {
  const h = mcpToolHeadingParts(parts)
  return h.server === null ? h.tool : `${h.server}${HEADING_SEPARATOR}${h.tool}`
}

/* ── URI の要約 ───────────────────────────────────────────────────── */

/** 要約する URI の長さの上限 (コードポイント)。超えたら出さない。 */
export const RESOURCE_URI_MAX_CODE_POINTS = 256

/** 英数字が 20 文字以上続く (乱数・token の形)。 */
const LONG_ALNUM_RUN = /[A-Za-z0-9]{20,}/
/** 最後のパスの要素として出してよいファイル名らしい形 (decode しない。`%` を含めば外れる)。 */
const FILE_NAME_SHAPE = /^[A-Za-z0-9._-]{1,64}$/

function isPresentableHost(host: string): boolean {
  return host.length > 0 && !LONG_ALNUM_RUN.test(host) && !mayCarrySecret(host)
}

function isPresentableFileName(segment: string): boolean {
  return FILE_NAME_SHAPE.test(segment) && !LONG_ALNUM_RUN.test(segment) && !mayCarrySecret(segment)
}

/**
 * resource の URI を見出し用に要約する (data-model §1「URI の要約」[Q3])。WHATWG URL で読み、`protocol`・`host`・
 * 最後のパスの要素だけを出す (`username` / `password` / `search` / `hash` は使わない)。
 *
 * - host が秘密の形 (英数字 20 文字以上の連続・`mayCarrySecret`) なら `protocol` だけ (末尾も出さない)
 * - 最後のパスの要素がファイル名らしい形でなければ `protocol` と `host` だけ
 * - 読めない・256 コードポイントを超える・文字列でない → null (出さない)
 */
export function summarizeResourceUri(uri: unknown): string | null {
  if (typeof uri !== 'string' || uri.length === 0) return null
  if (Array.from(uri).length > RESOURCE_URI_MAX_CODE_POINTS) return null
  let url: URL
  try {
    url = new URL(uri)
  } catch {
    return null
  }
  const protocol = url.protocol
  const host = url.host
  if (host.length > 0 && !isPresentableHost(host)) return protocol
  const head = host.length > 0 ? `${protocol}//${host}` : protocol
  const segments = url.pathname.split('/')
  const last = segments[segments.length - 1] ?? ''
  if (!isPresentableFileName(last)) return head
  // 階層の URI (`https://h/a/b` / `file:///a/b`) は `/` で区切り、途中の要素は `…` に畳む。
  // 不透明な URI (`urn:x` など。pathname が `/` で始まらない) は scheme の直後に置く。
  if (!url.pathname.startsWith('/')) return `${protocol}${last}`
  const middle = segments.filter((s) => s.length > 0).length > 1 ? '…/' : ''
  const root = host.length > 0 ? head : `${protocol}//`
  return `${root}/${middle}${last}`
}
