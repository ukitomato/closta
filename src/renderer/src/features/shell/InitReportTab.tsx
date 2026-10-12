import { useMemo } from 'react'

import { TriangleAlertIcon } from 'lucide-react'

import type { InitReportMeter, McpServerReport } from '@domain/session/session-init-report'

import { parseMcpToolName } from '@/features/chat/mcp-tool-name'
import { slashCommandEntries } from '@/features/session/running-session-store'
import {
  EMPTY_SESSION_METERS,
  type SessionMeters,
  type SlashCommandEntry
} from '@/features/session/running-session-types'
import { useRunningSessionsView } from '@/features/session/running-sessions-view'
import { useSessionMeters } from '@/features/session/useSessionMeters'
import { useUiStore } from '@/stores/ui'

import { mcpStatusNeedsAttention } from './init-report-attention'
import { formatCount, INIT_REPORT_LABELS, MCP_STATUS_LABELS, SHELL_LABELS } from './labels'

/**
 * 右のペインの「構成」のタブ (O-5 / 015 spec FR-009 / US-2。data-model §3 の表と §6 の文言)。Claude Code が報告した構成
 * (`init-report` / `commands`) を出す。起動の設定 (「概要」の「起動時のモデル」) とは別物。
 *
 * | 規則 | 根拠 |
 * |---|---|
 * | 値は表示中の稼働中のセッションの `meters` (`initReport` / `commands` / 名前の集合の出所) だけを selector で読む。新しい IPC を足さない | data-model §3 / spec US-2 |
 * | 過去は「実行中だけ」、未選択は空の状態、`initReport` がまだ無ければスラッシュコマンドの節 (`commands` があれば) だけを出し、他は「最初のターンの後」 | data-model §3 / spec US-2 AC7 |
 * | MCP サーバーの `failed` / `needs-auth` に注意の印 (`data-attention`・警告のアイコン・名前に「注意」) と案内。`unknown` は「不明」で印なし | data-model §3 / spec US-2 AC2・AC6 |
 * | MCP の tool はサーバーごとに `Map` でまとめる (名前の解き方は `parseMcpToolName`)。サーバー名が `constructor` などでも prototype に依らない | data-model §3 / §1 |
 * | スラッシュコマンドの一覧は合流の純関数 (`slashCommandEntries`) で組む。名前・`argumentHint`・説明は**平文**で描く (markdown・自動リンクにしない) | data-model §2「renderer の保持」/ §3 |
 * | 名前・説明は decoder の形の検査と無害化を通った値を**テキストとして**描く (HTML として解釈しない) | AD-048 Decision 3 |
 */
export function InitReportTab(): React.JSX.Element {
  const focus = useUiStore((s) => s.focus)
  if (focus === 'running') return <RunningInitReport />
  if (focus === 'past')
    return <Note testId="init-report-live-only">{INIT_REPORT_LABELS.initReportLiveOnly}</Note>
  return <Note testId="init-report-empty">{INIT_REPORT_LABELS.initReportEmpty}</Note>
}

function Note({
  testId,
  children
}: {
  readonly testId: string
  readonly children: string
}): React.JSX.Element {
  return (
    <p className="text-muted-foreground p-3 text-sm" data-testid={testId}>
      {children}
    </p>
  )
}

function RunningInitReport(): React.JSX.Element {
  const live = useRunningSessionsView().live
  const sessionId = live?.sessionId ?? null
  const initReport = useSessionMeters(sessionId, (m) => m.initReport)
  const commands = useSessionMeters(sessionId, (m) => m.commands)
  const source = useSessionMeters(sessionId, (m) => m.slashCommandSource)
  const entries = useMemo(() => {
    const meters: SessionMeters = {
      ...EMPTY_SESSION_METERS,
      initReport,
      commands,
      slashCommandSource: source
    }
    return slashCommandEntries(meters)
  }, [initReport, commands, source])
  if (live === null)
    return <Note testId="init-report-empty">{INIT_REPORT_LABELS.initReportEmpty}</Note>
  const omitted = (initReport?.omitted ?? 0) + (commands?.omitted ?? 0)
  return (
    <div className="space-y-3 p-3 text-xs" data-testid="init-report">
      {initReport === null ? (
        <p className="text-muted-foreground" data-testid="init-report-await-first">
          {INIT_REPORT_LABELS.initReportAwaitFirst}
        </p>
      ) : (
        <InitReportBody report={initReport} />
      )}
      {(initReport !== null || commands !== null) && <SlashCommands entries={entries} />}
      {omitted > 0 && (
        <p className="text-muted-foreground" data-testid="init-report-omitted">
          {INIT_REPORT_LABELS.initReportOmitted(formatCount(omitted))}
        </p>
      )}
    </div>
  )
}

function Section({
  id,
  heading,
  children
}: {
  readonly id: string
  readonly heading: string
  readonly children: React.ReactNode
}): React.JSX.Element {
  return (
    <section aria-labelledby={`init-report-${id}-heading`} className="space-y-1.5">
      <h3 id={`init-report-${id}-heading`} className="font-medium">
        {heading}
      </h3>
      <div data-testid={`init-report-${id}`}>{children}</div>
    </section>
  )
}

function NoneText({ children }: { readonly children: string }): React.JSX.Element {
  return <p className="text-muted-foreground">{children}</p>
}

/** 名前の一覧 (平文。重なりうるので並びの位置と組でキーにする)。 */
function NameList({ names }: { readonly names: readonly string[] }): React.JSX.Element {
  if (names.length === 0) return <NoneText>{INIT_REPORT_LABELS.none}</NoneText>
  return (
    <ul className="space-y-0.5">
      {names.map((name, index) => (
        <li key={`${index}:${name}`} className="font-mono break-all">
          {name}
        </li>
      ))}
    </ul>
  )
}

function InitReportBody({ report }: { readonly report: InitReportMeter }): React.JSX.Element {
  return (
    <>
      <p className="text-muted-foreground" data-testid="init-report-timepoint">
        {INIT_REPORT_LABELS.initReportTimepoint}
      </p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5">
        <dt className="text-muted-foreground">{INIT_REPORT_LABELS.reportedModel}</dt>
        <dd className="min-w-0 font-mono break-all" data-testid="init-report-model">
          {report.model ?? INIT_REPORT_LABELS.unknownValue}
        </dd>
      </dl>
      <Section id="mcp-servers" heading={INIT_REPORT_LABELS.mcpServers}>
        {report.mcpServers.length === 0 ? (
          <NoneText>{INIT_REPORT_LABELS.noMcpServers}</NoneText>
        ) : (
          <ul className="space-y-1.5">
            {report.mcpServers.map((server, index) => (
              <McpServerRow key={`${index}:${server.name}`} server={server} />
            ))}
          </ul>
        )}
      </Section>
      <Section id="tools" heading={INIT_REPORT_LABELS.tools}>
        <Tools tools={report.tools} servers={report.mcpServers} />
      </Section>
      <Section id="skills" heading={INIT_REPORT_LABELS.skills}>
        <NameList names={report.skills} />
      </Section>
      <Section id="plugins" heading={INIT_REPORT_LABELS.plugins}>
        <NameList
          names={report.plugins.map((p) =>
            p.version === null ? p.name : `${p.name} ${p.version}`
          )}
        />
      </Section>
    </>
  )
}

function McpServerRow({ server }: { readonly server: McpServerReport }): React.JSX.Element {
  const attention = mcpStatusNeedsAttention(server.status)
  const guide =
    server.status === 'needs-auth'
      ? INIT_REPORT_LABELS.mcpNeedsAuth
      : server.status === 'failed'
        ? INIT_REPORT_LABELS.mcpFailed
        : null
  return (
    <li className="space-y-0.5" data-testid="init-report-mcp-server">
      <div className="flex items-center gap-1.5">
        {attention && (
          <span
            role="img"
            aria-label={SHELL_LABELS.attention}
            data-attention="true"
            className="text-destructive inline-flex"
          >
            <TriangleAlertIcon aria-hidden className="size-3.5" />
          </span>
        )}
        <span className="min-w-0 font-mono break-all">{server.name}</span>
        <span className="text-muted-foreground shrink-0" data-testid="init-report-mcp-status">
          {MCP_STATUS_LABELS[server.status]}
        </span>
      </div>
      {guide !== null && <p className="text-muted-foreground">{guide}</p>}
    </li>
  )
}

/** tool の一覧。MCP の tool (`mcp__<server>__<tool>`) はサーバーごとにまとめ、それ以外はそのまま並べる。 */
function Tools({
  tools,
  servers
}: {
  readonly tools: readonly string[]
  readonly servers: readonly McpServerReport[]
}): React.JSX.Element {
  const { plain, groups } = useMemo(() => groupTools(tools, servers), [tools, servers])
  if (tools.length === 0) return <NoneText>{INIT_REPORT_LABELS.none}</NoneText>
  return (
    <div className="space-y-1.5">
      <p data-testid="init-report-tool-count">
        {INIT_REPORT_LABELS.toolCount(formatCount(tools.length))}
      </p>
      {plain.length > 0 && <NameList names={plain} />}
      {[...groups].map(([server, names]) => (
        <div key={`mcp:${server}`} className="space-y-0.5" data-testid="init-report-mcp-tools">
          <p className="text-muted-foreground font-mono break-all">
            {INIT_REPORT_LABELS.mcpToolGroup(server)}
          </p>
          <NameList names={names} />
        </div>
      ))}
    </div>
  )
}

/** MCP の tool をサーバー名で `Map` にまとめる (prototype のキーに依らない)。サーバー名を決められない tool はそのまま。 */
function groupTools(
  tools: readonly string[],
  servers: readonly McpServerReport[]
): { plain: string[]; groups: Map<string, string[]> } {
  const known = servers.map((s) => s.name)
  const plain: string[] = []
  const groups = new Map<string, string[]>()
  for (const tool of tools) {
    const parts = parseMcpToolName(tool, known)
    if (parts === null || parts.kind !== 'mcp' || parts.server === null) {
      plain.push(tool)
      continue
    }
    const list = groups.get(parts.server)
    if (list === undefined) groups.set(parts.server, [parts.tool])
    else list.push(parts.tool)
  }
  return { plain, groups }
}

function SlashCommands({
  entries
}: {
  readonly entries: readonly SlashCommandEntry[]
}): React.JSX.Element {
  return (
    <Section id="slash-commands" heading={INIT_REPORT_LABELS.slashCommands}>
      {entries.length === 0 ? (
        <NoneText>{INIT_REPORT_LABELS.none}</NoneText>
      ) : (
        <ul className="space-y-1">
          {entries.map((entry, index) => (
            <li
              key={`${index}:${entry.name}`}
              className="space-y-0.5"
              data-testid="init-report-slash-command"
            >
              <p className="break-all">
                <span className="font-mono">{`/${entry.name}`}</span>
                {entry.argumentHint !== null && entry.argumentHint !== '' && (
                  <span className="text-muted-foreground font-mono">{` ${entry.argumentHint}`}</span>
                )}
              </p>
              {entry.description !== null && entry.description !== '' && (
                <p className="text-muted-foreground break-words">{entry.description}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}
