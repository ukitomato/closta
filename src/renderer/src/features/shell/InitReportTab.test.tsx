import { act, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { axe } from 'vitest-axe'

import type { SessionEvent } from '@domain/session/agent-session'
import type {
  CommandsMeter,
  InitReportMeter,
  McpStatusKey
} from '@domain/session/session-init-report'

import { EMPTY_SESSION_METERS } from '@/features/session/running-session-types'
import {
  A,
  B,
  registerAppShellHooks,
  selectPast,
  selectRunning,
  setup
} from '@/test-support/app-shell-harness'

import { INIT_REPORT_LABELS, MCP_STATUS_LABELS, SHELL_LABELS } from './labels'

/**
 * O-5 FE-021 — 右のペインの「構成」のタブ (015 spec FR-009 / US-2 AC1〜AC4・AC6・AC7。data-model §3 の表と §6 の文言)。
 * 値は port → decoder → 稼働中のストアの経路で届ける (`h.emit`)。
 */

registerAppShellHooks()

const AXE_RULES = { rules: { 'color-contrast': { enabled: false } } }

function report(over: Partial<Omit<InitReportMeter, 'type'>> = {}): InitReportMeter {
  return {
    type: 'init-report',
    model: 'claude-opus-4',
    mcpServers: [{ name: 'github', status: 'connected' }],
    tools: ['Bash', 'Read', 'mcp__github__create_issue', 'mcp__github__list_prs'],
    skills: ['skill-a'],
    plugins: [
      { name: 'plug', version: '1.2.0' },
      { name: 'bare', version: null }
    ],
    slashCommands: ['review'],
    omitted: 0,
    ...over
  }
}

function commands(list: CommandsMeter['commands'], omitted = 0): CommandsMeter {
  return { type: 'commands', commands: list, omitted }
}

const meter = (m: InitReportMeter | CommandsMeter): SessionEvent => ({ kind: 'meter', meter: m })

const servers = (statuses: readonly McpStatusKey[]): InitReportMeter['mcpServers'] =>
  statuses.map((status, i) => ({ name: `s${i}`, status }))

async function openInitReport(): Promise<HTMLElement> {
  await userEvent.click(screen.getByRole('button', { name: SHELL_LABELS.expandPanel }))
  // 注意の印があると名前に「(注意)」が付く (015 pr-gate R1 MD-02)。
  await userEvent.click(
    screen.getByRole('tab', { name: new RegExp(`^${SHELL_LABELS.initReportTab}`) })
  )
  return screen.getByRole('tabpanel')
}

const section = (panel: HTMLElement, id: string): HTMLElement =>
  within(panel).getByTestId(`init-report-${id}`)

const slashTexts = (panel: HTMLElement): string[] =>
  within(panel)
    .queryAllByTestId('init-report-slash-command')
    .map((el) => el.textContent ?? '')

describe('構成のタブの項目 (US-2 AC1)', () => {
  it('時点・報告されたモデル・MCP サーバー・tool (件数とサーバーごと)・スラッシュコマンド・スキル・プラグインを出す', async () => {
    const h = await setup({ ids: [A] })
    await selectRunning(0)
    h.emit(A, meter(report()))
    const panel = await openInitReport()

    expect(within(panel).getByTestId('init-report-timepoint')).toHaveTextContent(
      INIT_REPORT_LABELS.initReportTimepoint
    )
    expect(within(panel).getByText(INIT_REPORT_LABELS.reportedModel)).toBeInTheDocument()
    expect(within(panel).getByTestId('init-report-model')).toHaveTextContent('claude-opus-4')
    for (const heading of [
      INIT_REPORT_LABELS.mcpServers,
      INIT_REPORT_LABELS.tools,
      INIT_REPORT_LABELS.slashCommands,
      INIT_REPORT_LABELS.skills,
      INIT_REPORT_LABELS.plugins
    ])
      expect(within(panel).getByRole('heading', { name: heading })).toBeInTheDocument()

    const server = within(panel).getByTestId('init-report-mcp-server')
    expect(server).toHaveTextContent('github')
    expect(server).toHaveTextContent(MCP_STATUS_LABELS.connected)
    expect(within(server).queryByRole('img')).toBeNull()

    const tools = section(panel, 'tools')
    expect(within(tools).getByTestId('init-report-tool-count')).toHaveTextContent('4 件')
    expect(tools).toHaveTextContent('Bash')
    const group = within(tools).getByTestId('init-report-mcp-tools')
    expect(group).toHaveTextContent(INIT_REPORT_LABELS.mcpToolGroup('github'))
    expect(
      within(group)
        .getAllByRole('listitem')
        .map((li) => li.textContent)
    ).toEqual(['create_issue', 'list_prs'])

    expect(slashTexts(panel)).toEqual(['/review'])
    expect(section(panel, 'skills')).toHaveTextContent('skill-a')
    expect(
      within(section(panel, 'plugins'))
        .getAllByRole('listitem')
        .map((li) => li.textContent)
    ).toEqual(['plug 1.2.0', 'bare'])
    expect(within(panel).queryByTestId('init-report-omitted')).toBeNull()
  })
})

describe('MCP サーバーの状態と注意の印 (US-2 AC2 / AC3 / AC6)', () => {
  it('failed / needs-auth に注意の印 (data-attention・名前に「注意」) と案内。状態だけが変わった更新で印が変わる', async () => {
    const h = await setup({ ids: [A] })
    await selectRunning(0)
    h.emit(A, meter(report({ mcpServers: servers(['pending', 'connected']) })))
    const panel = await openInitReport()
    const rows = (): HTMLElement[] => within(panel).getAllByTestId('init-report-mcp-server')
    expect(panel.querySelector('[data-attention="true"]')).toBeNull()
    expect(rows()[0]).toHaveTextContent(MCP_STATUS_LABELS.pending)

    h.emit(A, meter(report({ mcpServers: servers(['failed', 'needs-auth']) })))
    const [failed, needsAuth] = rows()
    for (const row of [failed!, needsAuth!]) {
      const mark = within(row).getByRole('img', { name: SHELL_LABELS.attention })
      expect(mark).toHaveAttribute('data-attention', 'true')
    }
    expect(failed).toHaveTextContent(MCP_STATUS_LABELS.failed)
    expect(failed).toHaveTextContent(INIT_REPORT_LABELS.mcpFailed)
    expect(needsAuth).toHaveTextContent(MCP_STATUS_LABELS['needs-auth'])
    expect(needsAuth).toHaveTextContent(INIT_REPORT_LABELS.mcpNeedsAuth)
    expect(needsAuth).toHaveTextContent('CLAUDE_CONFIG_DIR')

    h.emit(A, meter(report({ mcpServers: servers(['connected', 'connected']) })))
    expect(panel.querySelector('[data-attention="true"]')).toBeNull()
    expect(panel).not.toHaveTextContent(INIT_REPORT_LABELS.mcpFailed)
  })

  it('0 件の節で「ありません」、モデルが null で「不明」、状態が unknown で「不明」かつ印なし', async () => {
    const h = await setup({ ids: [A] })
    await selectRunning(0)
    h.emit(
      A,
      meter(
        report({
          model: null,
          mcpServers: [],
          tools: [],
          skills: [],
          plugins: [],
          slashCommands: []
        })
      )
    )
    const panel = await openInitReport()
    expect(within(panel).getByTestId('init-report-model')).toHaveTextContent(
      INIT_REPORT_LABELS.unknownValue
    )
    expect(section(panel, 'mcp-servers')).toHaveTextContent(INIT_REPORT_LABELS.noMcpServers)
    for (const id of ['tools', 'skills', 'plugins', 'slash-commands'])
      expect(section(panel, id)).toHaveTextContent(INIT_REPORT_LABELS.none)

    h.emit(A, meter(report({ mcpServers: servers(['unknown']) })))
    const row = within(panel).getByTestId('init-report-mcp-server')
    expect(within(row).getByTestId('init-report-mcp-status')).toHaveTextContent(
      MCP_STATUS_LABELS.unknown
    )
    expect(panel.querySelector('[data-attention="true"]')).toBeNull()
  })

  it('サーバー名 constructor / toString / hasOwnProperty / __proto__ の集計で例外が出ず表示される', async () => {
    const h = await setup({ ids: [A] })
    await selectRunning(0)
    const names = ['constructor', 'toString', 'hasOwnProperty', '__proto__']
    h.emit(
      A,
      meter(
        report({
          mcpServers: names.map((name) => ({ name, status: 'failed' as const })),
          tools: names.map((name) => `mcp__${name}__t`)
        })
      )
    )
    const panel = await openInitReport()
    expect(within(panel).getAllByTestId('init-report-mcp-server')).toHaveLength(4)
    const groups = within(section(panel, 'tools')).getAllByTestId('init-report-mcp-tools')
    expect(groups.map((g) => g.firstElementChild?.textContent)).toEqual(
      names.map((name) => INIT_REPORT_LABELS.mcpToolGroup(name))
    )
  })
})

describe('スラッシュコマンドの一覧 (US-2 AC4 / data-model §2「renderer の保持」)', () => {
  it('commands で一覧が置き換わり説明と argumentHint が出る。MCP の状態だけが違う init-report の後も消えない', async () => {
    const h = await setup({ ids: [A] })
    await selectRunning(0)
    h.emit(A, meter(report({ slashCommands: ['a'] })))
    const panel = await openInitReport()
    expect(slashTexts(panel)).toEqual(['/a'])

    h.emit(
      A,
      meter(
        commands([
          { name: 'a', description: '説明 A', argumentHint: '<file>' },
          { name: 'b', description: '', argumentHint: '' }
        ])
      )
    )
    expect(slashTexts(panel)).toEqual(['/a <file>説明 A', '/b'])

    h.emit(A, meter(report({ slashCommands: ['a'], mcpServers: servers(['failed']) })))
    expect(slashTexts(panel)).toEqual(['/a <file>説明 A', '/b'])
  })

  it('slashCommands の変わった init-report で名前の集合が置き換わる (commands にある名前は説明を保ち、無い名前は名前だけ)', async () => {
    const h = await setup({ ids: [A] })
    await selectRunning(0)
    h.emit(A, meter(report({ slashCommands: ['a'] })))
    h.emit(
      A,
      meter(
        commands([
          { name: 'a', description: '説明 A', argumentHint: '<x>' },
          { name: 'b', description: '', argumentHint: '' }
        ])
      )
    )
    const panel = await openInitReport()
    h.emit(A, meter(report({ slashCommands: ['a', 'c'] })))
    expect(slashTexts(panel)).toEqual(['/a <x>説明 A', '/c'])
  })

  it('init-report の slashCommands が /a・commands の名前が a でも /a に説明と argumentHint が出る', async () => {
    const h = await setup({ ids: [A] })
    await selectRunning(0)
    h.emit(A, meter(commands([{ name: 'a', description: '説明 A', argumentHint: '<x>' }])))
    h.emit(A, meter(report({ slashCommands: ['/a'] })))
    const panel = await openInitReport()
    expect(slashTexts(panel)).toEqual(['/a <x>説明 A'])
    // decoder を通らない値 (`/` 付きが残った形) をストアに直接置いても、名前の正規の形で引き当てる。
    act(() =>
      h.store.setState((s) => ({
        meters: {
          ...s.meters,
          [A]: {
            ...EMPTY_SESSION_METERS,
            initReport: report({ slashCommands: ['/a'] }),
            commands: commands([{ name: 'a', description: '説明 A', argumentHint: '<x>' }]),
            slashCommandSource: 'init-report'
          }
        }
      }))
    )
    expect(slashTexts(panel)).toEqual(['/a <x>説明 A'])
  })

  it('説明は平文で描く (https://… を <a> にしない。markdown にしない)', async () => {
    const h = await setup({ ids: [A] })
    await selectRunning(0)
    h.emit(A, meter(report({ slashCommands: ['a'] })))
    h.emit(
      A,
      meter(
        commands([{ name: 'a', description: 'see https://example.com **x**', argumentHint: '' }])
      )
    )
    const panel = await openInitReport()
    expect(panel).toHaveTextContent('see https://example.com **x**')
    expect(panel.querySelector('a')).toBeNull()
    expect(panel.querySelector('strong')).toBeNull()
  })
})

describe('空の状態と省いた数 (US-2 AC7 / data-model §3)', () => {
  it('過去のセッションでは「実行中のセッションだけ出ます」', async () => {
    const h = await setup({ ids: [A] })
    h.emit(A, meter(report()))
    await selectPast(0)
    const panel = await openInitReport()
    expect(within(panel).getByTestId('init-report-live-only')).toHaveTextContent(
      INIT_REPORT_LABELS.initReportLiveOnly
    )
    expect(within(panel).queryByTestId('init-report')).toBeNull()
  })

  it('未選択では空の状態', async () => {
    await setup()
    const panel = await openInitReport()
    expect(within(panel).getByTestId('init-report-empty')).toHaveTextContent(
      INIT_REPORT_LABELS.initReportEmpty
    )
  })

  it('initReport がまだ無いと「最初のターンの後に出ます」。commands があればスラッシュコマンドの節だけ出す', async () => {
    const h = await setup({ ids: [A] })
    await selectRunning(0)
    const panel = await openInitReport()
    expect(within(panel).getByTestId('init-report-await-first')).toHaveTextContent(
      INIT_REPORT_LABELS.initReportAwaitFirst
    )
    expect(within(panel).queryByTestId('init-report-slash-commands')).toBeNull()
    h.emit(A, meter(commands([{ name: 'a', description: 'd', argumentHint: '' }])))
    expect(within(panel).getByTestId('init-report-await-first')).toBeInTheDocument()
    expect(slashTexts(panel)).toEqual(['/ad'])
    expect(within(panel).queryByTestId('init-report-mcp-servers')).toBeNull()
  })

  it('omitted の合計が 1 以上なら initReportOmitted', async () => {
    const h = await setup({ ids: [A] })
    await selectRunning(0)
    h.emit(A, meter(report({ omitted: 2 })))
    h.emit(A, meter(commands([], 3)))
    const panel = await openInitReport()
    expect(within(panel).getByTestId('init-report-omitted')).toHaveTextContent(
      INIT_REPORT_LABELS.initReportOmitted('5')
    )
  })
})

describe('セッションごとの値 (US-2)', () => {
  it('2 つのセッションを切り替えて値が混ざらない', async () => {
    const h = await setup({ ids: [A, B] })
    h.emit(A, meter(report({ model: 'claude-opus-4', skills: ['skill-of-a'] })))
    h.emit(B, meter(report({ model: 'claude-haiku-4', skills: ['skill-of-b'] })))
    await selectRunning(0)
    const panel = await openInitReport()
    expect(within(panel).getByTestId('init-report-model')).toHaveTextContent('claude-opus-4')
    expect(panel).toHaveTextContent('skill-of-a')
    expect(panel).not.toHaveTextContent('skill-of-b')
    await selectRunning(1)
    const after = screen.getByRole('tabpanel')
    expect(within(after).getByTestId('init-report-model')).toHaveTextContent('claude-haiku-4')
    expect(after).toHaveTextContent('skill-of-b')
    expect(after).not.toHaveTextContent('skill-of-a')
  })
})

describe('vitest-axe', () => {
  it('項目と注意の印のある状態・空の状態で違反 0', async () => {
    const h = await setup({ ids: [A] })
    await selectRunning(0)
    const panel = await openInitReport()
    expect((await axe(panel, AXE_RULES)).violations).toEqual([])
    h.emit(
      A,
      meter(report({ mcpServers: servers(['failed', 'needs-auth', 'unknown']), omitted: 1 }))
    )
    h.emit(A, meter(commands([{ name: 'review', description: 'd', argumentHint: '<pr>' }])))
    expect(within(panel).getByTestId('init-report')).toBeInTheDocument()
    expect((await axe(panel, AXE_RULES)).violations).toEqual([])
  })
})
