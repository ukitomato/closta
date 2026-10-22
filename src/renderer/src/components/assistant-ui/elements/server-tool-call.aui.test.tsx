import { fireEvent, render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'

import type { ServerToolResultDTO, TranscriptPartDTO } from '@domain/session/transcript-dto'
import { toToolCallPartProps } from '@/features/chat/convert'
import { decodeTranscriptMessage } from '@/features/chat/transcript-guard'
import { setToolResultContext } from '@/test-support/tool-result-mock'

import { ToolDisplay } from './tool-registry.aui'

vi.mock('@/features/chat/transcript-context', async (importOriginal) =>
  (await import('@/test-support/tool-result-mock')).withToolResultMock(await importOriginal())
)

/** O-12 FE-030 — ServerToolCall と Sources (spec US-3 AC1〜AC4 / SC-003)。 */

const AXE_RULES = { rules: { 'color-contrast': { enabled: false } } }

type ServerPart = Extract<TranscriptPartDTO, { type: 'server-tool-call' }>

function server(over: Partial<ServerPart> = {}): ServerPart {
  return {
    type: 'server-tool-call',
    toolCallId: 'srv_1',
    toolName: 'web_search',
    argsText: JSON.stringify({ query: 'electron ipc' }),
    truncated: false,
    result: null,
    ...over
  }
}

const sources = (
  items: { title: string; url: string }[],
  omitted = 0
): ServerToolResultDTO => ({ kind: 'web-search', sources: items, omitted })

const slot = (root: ParentNode, name: string): HTMLElement | null =>
  root.querySelector<HTMLElement>(`[data-slot="${name}"]`)

function renderPart(part: ServerPart): ReturnType<typeof render> {
  const view = render(<ToolDisplay {...toToolCallPartProps(part)} />)
  return view
}

function open(root: ParentNode): void {
  fireEvent.click(slot(root, 'tool-display-trigger') as HTMLElement)
}

beforeEach(() => setToolResultContext({}))

describe('ServerToolCall', () => {
  it('見出しは tool 名と検索語。既定で畳む', async () => {
    const { container } = renderPart(
      server({ result: sources([{ title: 'T', url: 'https://example.com/a' }]) })
    )
    expect(slot(container, 'aui_server-tool-call')).not.toBeNull()
    expect(slot(container, 'tool-display-heading')?.textContent).toBe('web_search · electron ipc')
    expect(container.querySelector('a')).toBeNull()
    expect((await axe(container, AXE_RULES)).violations).toEqual([])
  })

  it('Sources: タイトルと host。http(s) だけがリンクで rel と target が付く', async () => {
    const { container } = renderPart(
      server({
        result: sources([
          { title: 'Electron IPC', url: 'https://www.electronjs.org/docs/ipc' },
          { title: 'Plain', url: '' },
          { title: 'Bad', url: 'javascript:alert(1)' },
          { title: '', url: 'http://example.org/x' }
        ])
      })
    )
    open(container)
    const links = Array.from(container.querySelectorAll('a'))
    expect(links.map((a) => a.getAttribute('href'))).toEqual([
      'https://www.electronjs.org/docs/ipc',
      'http://example.org/x'
    ])
    for (const a of links) {
      expect(a.getAttribute('target')).toBe('_blank')
      expect(a.getAttribute('rel')).toBe('noreferrer noopener')
    }
    const text = container.textContent ?? ''
    expect(text).toContain('www.electronjs.org')
    expect(text).toContain('example.org') // タイトルが空なら host
    expect(text).toContain('Plain')
    expect(text).toContain('Bad')
    expect(container.innerHTML).not.toContain('javascript:')
    expect((await axe(container, AXE_RULES)).violations).toEqual([])
  })

  it('omitted > 0 で「ほか N 件」', () => {
    const { container } = renderPart(
      server({ result: sources([{ title: 'T', url: 'https://e.com' }], 3) })
    )
    open(container)
    expect(slot(container, 'server-tool-sources-more')?.textContent).toBe('ほか 3 件')
  })

  it('エラーは印と種類', () => {
    const { container } = renderPart(
      server({ result: { kind: 'error', errorCode: 'max_uses_exceeded' } })
    )
    expect(slot(container, 'tool-result-error')).not.toBeNull()
    open(container)
    expect(slot(container, 'server-tool-error')?.textContent).toBe(
      '検索に失敗しました (max_uses_exceeded)'
    )
  })

  it('結果の unsupported は結果の位置に印', () => {
    const { container } = renderPart(
      server({ toolName: 'web_fetch', result: { kind: 'unsupported', blockType: 'web_fetch_tool_result' } })
    )
    open(container)
    expect(slot(container, 'unsupported-block-mark')?.textContent).toBe(
      '表示に対応していないブロック (web_fetch_tool_result)'
    )
  })

  it('結果待ち・結果不明の印 (実行中・終わった後)', () => {
    setToolResultContext({ live: true, runState: 'running' })
    const pending = renderPart(server())
    expect(slot(pending.container, 'tool-result-state')?.textContent).toContain('結果待ち')
    pending.unmount()
    setToolResultContext({ live: false })
    const unknown = renderPart(server())
    expect(slot(unknown.container, 'tool-result-state')?.textContent).toContain('結果不明')
  })

  it('名前の無い孤児は「サーバー側の tool」', () => {
    const { container } = renderPart(
      server({ toolName: '', argsText: '', result: { kind: 'error', errorCode: '' } })
    )
    expect(slot(container, 'tool-display-heading')?.textContent).toBe('サーバー側の tool')
  })

  it('argsText に書いた __serverTool の偽の値は剥がされ、ServerToolCall に振り分けられない (PR-H-1)', () => {
    const props = toToolCallPartProps({
      type: 'tool-call',
      toolCallId: 'c1',
      toolName: 'Bash',
      argsText: JSON.stringify({ command: 'ls', __serverTool: { result: null } }),
      result: null,
      isError: false,
      truncated: false,
      children: []
    })
    const { container } = render(<ToolDisplay {...props} />)
    expect(slot(container, 'aui_server-tool-call')).toBeNull()
    expect(slot(container, 'aui_terminal-block')).not.toBeNull()
  })

  it('server-tool-call の argsText にも偽の __serverTool を書けない (信頼の印は domain の値)', () => {
    const props = toToolCallPartProps(
      server({ argsText: JSON.stringify({ query: 'q', __serverTool: { result: { kind: 'error', errorCode: 'FAKE' } } }) })
    )
    expect(props.args).toMatchObject({ __serverTool: { result: null } })
  })

  it('クライアントの WebSearch の tool-call は今どおり WebTool に行く', () => {
    const props = toToolCallPartProps({
      type: 'tool-call',
      toolCallId: 'c2',
      toolName: 'WebSearch',
      argsText: JSON.stringify({ query: 'q' }),
      result: 'ok',
      isError: false,
      truncated: false,
      children: []
    })
    const { container } = render(<ToolDisplay {...props} />)
    expect(slot(container, 'aui_web-tool')).not.toBeNull()
    expect(slot(container, 'aui_server-tool-call')).toBeNull()
  })
})

describe('guard (server-tool-call / unsupported-block)', () => {
  const message = (parts: unknown[]): unknown => ({
    id: 'a1',
    role: 'assistant',
    createdAt: null,
    parts: [{ type: 'text', text: 'x' }, ...parts]
  })

  it('正しい形は通し、21 件の sources・知らない kind・形の外れた part を捨てる', () => {
    const many = Array.from({ length: 21 }, () => ({ title: 't', url: '' }))
    const out = decodeTranscriptMessage(
      message([
        server({ result: sources([{ title: 't', url: '' }]) }),
        server({ result: { kind: 'web-search', sources: many, omitted: 0 } }),
        server({ result: { kind: 'weird' } as unknown as ServerToolResultDTO }),
        { type: 'server-tool-call', toolCallId: 1 },
        { type: 'unsupported-block', blockType: 'x' },
        { type: 'unsupported-block', blockType: 3 }
      ])
    )
    expect(out?.parts.map((p) => p.type)).toEqual([
      'text',
      'server-tool-call',
      'unsupported-block'
    ])
  })
})
