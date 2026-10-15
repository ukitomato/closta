import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'

import type { ToolCallMessagePartProps } from '@assistant-ui/react'

import { setToolResultContext } from '@/test-support/tool-result-mock'

import { FileTool } from './file-tool.aui'

vi.mock('@/features/chat/transcript-context', async (importOriginal) =>
  (await import('@/test-support/tool-result-mock')).withToolResultMock(await importOriginal())
)

/** O-6 FE-020 — ファイルと検索の表示 (016 spec US-2 AC1 / AC2 / AC7)。 */

const AXE_RULES = { rules: { 'color-contrast': { enabled: false } } }

function part(
  toolName: string,
  args: Record<string, unknown>,
  over: Partial<ToolCallMessagePartProps> = {}
): ToolCallMessagePartProps {
  return {
    type: 'tool-call',
    toolCallId: 'toolu_1',
    toolName,
    args,
    argsText: JSON.stringify(args),
    result: undefined,
    isError: false,
    status: { type: 'complete' },
    addResult: () => {},
    resume: () => {},
    ...over
  } as unknown as ToolCallMessagePartProps
}

const slot = (root: ParentNode, name: string): HTMLElement | null =>
  root.querySelector<HTMLElement>(`[data-slot="${name}"]`)

function open(root: ParentNode): void {
  fireEvent.click(slot(root, 'tool-display-trigger') as HTMLElement)
}

beforeEach(() => setToolResultContext({}))

describe('FileTool の見出しと中身', () => {
  it('Read: 見出しは 1 行、中身は既定で畳まれ、開くと全体のパスと結果が <pre> に出る', async () => {
    const { container } = render(
      <FileTool {...part('Read', { file_path: '/home/u/a.ts', offset: 1, limit: 5 }, { result: '1\tline' })} />
    )
    expect(slot(container, 'aui_file-tool')).not.toBeNull()
    expect(slot(container, 'tool-display-heading')?.textContent).toBe('a.ts · 1〜6 行')
    expect(slot(container, 'tool-display-trigger')?.getAttribute('aria-expanded')).toBe('false')
    open(container)
    expect(slot(container, 'file-tool-path')?.textContent).toContain('/home/u/a.ts')
    expect(slot(container, 'tool-display-result-text')?.tagName).toBe('PRE')
    expect(slot(container, 'tool-display-result-text')?.textContent).toBe('1\tline')
    expect((await axe(container, AXE_RULES)).violations).toEqual([])
  })

  it.each([
    '/home/u/proj/a.ts',
    'C:\\dev\\proj\\a.ts',
    '\\\\wsl.localhost\\Ubuntu\\home\\u\\a.ts',
    '\\\\server\\share\\a.ts'
  ])('パスを本文のまま出す (argsText と同じ値): %s', (p) => {
    const props = part('Read', { file_path: p })
    const { container } = render(<FileTool {...props} />)
    open(container)
    const parsed = JSON.parse(props.argsText) as { file_path: string }
    expect(slot(container, 'file-tool-path')?.querySelector('code')?.textContent).toBe(parsed.file_path)
    // 項目に操作が無い
    expect(container.querySelector('a, [role="link"]')).toBeNull()
  })

  it('Glob: 結果は File tree。見出し「{n} 件のファイル」・注記・項目に操作が無い', async () => {
    const { container } = render(
      <FileTool
        {...part('Glob', { pattern: '**/*.ts' }, { result: 'Found 2 files\nsrc/a.ts\nsrc/b.ts' })}
      />
    )
    open(container)
    expect(slot(container, 'file-result-tree')?.textContent).toContain('2 件のファイル')
    expect(slot(container, 'file-tool-notes')?.textContent).toBe('Found 2 files')
    expect(container.querySelectorAll('[data-slot="file-result-tree-item"]')).toHaveLength(2)
    expect(slot(container, 'file-result-tree')?.querySelector('button, a, input, [tabindex]')).toBeNull()
    expect(container.textContent).not.toMatch(/\+\d|files changed/)
    expect((await axe(container, AXE_RULES)).violations).toEqual([])
  })

  it('File tree: 201 件で「ほか 1 件」。切り詰めて同じになる 2 行が両方出る', () => {
    const many = Array.from({ length: 201 }, (_, i) => `f${i}.ts`).join('\n')
    const a = render(<FileTool {...part('Glob', { pattern: '*' }, { result: many })} />)
    open(a.container)
    expect(slot(a.container, 'file-result-tree-more')?.textContent).toBe('ほか 1 件')
    a.unmount()
    const twin = `${'x'.repeat(1100)}A\n${'x'.repeat(1100)}B`
    const b = render(<FileTool {...part('Glob', { pattern: '*' }, { result: twin })} />)
    open(b.container)
    expect(b.container.querySelectorAll('[data-slot="file-result-tree-item"]')).toHaveLength(2)
  })

  it('File tree: __proto__ / constructor / toString の行が出る', () => {
    const { container } = render(
      <FileTool {...part('Glob', { pattern: '*' }, { result: '__proto__/x\nconstructor/prototype/y\ntoString' })} />
    )
    open(container)
    const names = Array.from(container.querySelectorAll('[data-slot="file-result-tree-item"]')).map(
      (el) => el.textContent
    )
    expect(names).toEqual(['__proto__/x', 'constructor/prototype/y', 'toString'])
  })

  it('Grep: files_with_matches は File tree、content は text', () => {
    const tree = render(<FileTool {...part('Grep', { pattern: 'x' }, { result: 'a.ts\nb.ts' })} />)
    open(tree.container)
    expect(slot(tree.container, 'file-result-tree')).not.toBeNull()
    tree.unmount()
    const text = render(
      <FileTool {...part('Grep', { pattern: 'x', output_mode: 'content' }, { result: 'a.ts:1:x' })} />
    )
    open(text.container)
    expect(slot(text.container, 'file-result-tree')).toBeNull()
    expect(slot(text.container, 'tool-display-result-text')?.textContent).toBe('a.ts:1:x')
    expect(slot(text.container, 'tool-display-heading')?.textContent).toBe('x · 一致した行')
  })

  it('pattern を正規表現にしない・見出しの自由文に伏せ字', () => {
    const { container } = render(
      <FileTool {...part('Grep', { pattern: '(unclosed[ password=hunter2' })} />
    )
    const heading = slot(container, 'tool-display-heading')?.textContent ?? ''
    expect(heading).toContain('(unclosed[')
    expect(heading).not.toContain('hunter2')
  })

  it('日本語のファイル名・全角の検索語でも見出しが 1 行 (改行が入らない)', () => {
    const { container } = render(
      <FileTool {...part('Grep', { pattern: '検索　語\n全角', path: '/w/日本語のファイル.ts' })} />
    )
    const heading = slot(container, 'tool-display-heading')?.textContent ?? ''
    expect(heading).not.toMatch(/[\n\r]/)
    expect(Array.from(heading).length).toBeLessThanOrEqual(80)
  })

  it('Read の結果は markdown にしない', () => {
    const { container } = render(<FileTool {...part('Read', { file_path: '/a' }, { result: '**x**' })} />)
    open(container)
    expect(container.querySelector('strong')).toBeNull()
    expect(slot(container, 'tool-display-result-text')?.textContent).toBe('**x**')
  })
})

describe('FileTool の結果の負のケース', () => {
  it('エラーは「エラー」の印と本文 (畳んだままでも見える)', () => {
    const { container } = render(
      <FileTool {...part('Read', { file_path: '/a' }, { result: 'ENOENT', isError: true })} />
    )
    expect(slot(container, 'tool-result-error')).not.toBeNull()
    expect(slot(container, 'tool-result-error-text')?.textContent).toBe('ENOENT')
  })

  it('0 件の Glob は text のまま。text でない・空の結果は説明を出す', () => {
    const zero = render(<FileTool {...part('Glob', { pattern: '*' }, { result: 'No files found' })} />)
    open(zero.container)
    expect(slot(zero.container, 'file-result-tree')).toBeNull()
    expect(slot(zero.container, 'tool-display-result-text')?.textContent).toBe('No files found')
    zero.unmount()
    const empty = render(<FileTool {...part('Read', { file_path: '/a' }, { result: '' })} />)
    open(empty.container)
    expect(screen.getByText('text でない結果か、空の結果です')).toBeInTheDocument()
    empty.unmount()
    const blocks = render(
      <FileTool {...part('Read', { file_path: '/a' }, { result: [{ type: 'image' }] as unknown })} />
    )
    open(blocks.container)
    expect(screen.getByText('text でない結果か、空の結果です')).toBeInTheDocument()
  })

  it('結果が無ければ結果の欄を出さない', () => {
    const { container } = render(<FileTool {...part('Read', { file_path: '/a' })} />)
    open(container)
    expect(slot(container, 'tool-display-result')).toBeNull()
  })

  it('入力が読めなければ ToolFallback', () => {
    const { container } = render(
      <FileTool {...part('Read', {}, { argsText: '{broken' })} />
    )
    expect(slot(container, 'aui_file-tool')).toBeNull()
    expect(slot(container, 'tool-fallback-root')).not.toBeNull()
  })
})
