import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

import type { ThreadMessageLike } from '@assistant-ui/react'

import type { TranscriptMessageDTO } from '@domain/session/transcript-dto'
import type { FailureReason } from '@domain/session/target'
import { toTranscriptMessages, type SessionMessageLike } from '@domain/session/transcript'

import { useUiStore } from '@/stores/ui'

import { toThreadMessage } from './convert'
import { COMPOSER_LABELS } from './labels'

/**
 * FE-032 / FE-034 — `ChatScreen` の状態別描画と XSS 境界、及び composer 回帰 (SC-001/SC-005/SC-008)。
 *
 * `useTranscript` は mock し、view の状態を直接与える (取得配線の検証は `useTranscript.test.tsx`)。
 * **描画経路 (assistant-ui の Thread / MarkdownText / urlTransform) は本物**を通す — XSS 境界は
 * 実際のレンダリングでしか確かめられない。
 *
 * **composer 送信経路が閉じていることの回帰** (Principle VIII / [AD-024](docs/decisions/0024-constitution-verification-paths.md) #18) も
 * ここで維持する。R-1 から続くこの番人が、`isDisabled: true` の退行で送信経路が黙って復活するのを止める。
 */

const { view } = vi.hoisted(() => ({
  view: {
    messages: [] as readonly ThreadMessageLike[],
    status: 'idle' as 'idle' | 'loading' | 'ready' | 'empty' | 'failed',
    reasonKey: null as FailureReason | null,
    retry: (): void => {},
    hasSelection: false
  }
}))

vi.mock('./useTranscript', () => ({ useTranscript: () => view }))

import { ChatScreen } from './ChatScreen'

function textDto(id: string, text: string): TranscriptMessageDTO {
  return { id, role: 'assistant', parts: [{ type: 'text', text }], createdAt: null }
}

function ready(messages: readonly TranscriptMessageDTO[]): void {
  view.messages = messages.map(toThreadMessage)
  view.status = 'ready'
  view.hasSelection = true
}

/** SessionMessage 相当から domain 変換 (sanitize 含む) を通して ready にする (end-to-end 用)。 */
function readyFromRecords(records: readonly SessionMessageLike[]): void {
  view.messages = toTranscriptMessages(records).map(toThreadMessage)
  view.status = 'ready'
  view.hasSelection = true
}

/** 1 つの tool-call を持つ assistant メッセージ DTO を作る (R-4 専用表示テスト用)。 */
function toolDto(
  id: string,
  toolName: string,
  argsText: string,
  opts: {
    result?: string | null
    isError?: boolean
    truncated?: boolean
    children?: readonly TranscriptMessageDTO[]
  } = {}
): TranscriptMessageDTO {
  return {
    id,
    role: 'assistant',
    parts: [
      {
        type: 'tool-call',
        toolCallId: `${id}-c`,
        toolName,
        argsText,
        result: opts.result ?? null,
        isError: opts.isError ?? false,
        truncated: opts.truncated ?? false,
        children: opts.children ?? []
      }
    ],
    createdAt: null
  }
}

/**
 * R-3 は tool-call を Tool group に畳む。O-2 の既定の密度 (comfortable) では Tool group が**開いて**出る
 * (FR-012 / research R-06)。専用表示がそのまま見えることを確かめる (以前の「既定は閉なので trigger を押す」前提を置き換え)。
 */
function toolGroupsOpenByDefault(): void {
  const triggers = screen.queryAllByText(/\d+ tool calls?/)
  expect(triggers.length).toBeGreaterThan(0)
  for (const el of triggers) expect(el.closest('button')).toHaveAttribute('aria-expanded', 'true')
}

beforeEach(() => {
  useUiStore.setState({ transcriptDensity: 'comfortable' })
  view.messages = []
  view.status = 'idle'
  view.reasonKey = null
  view.retry = () => {}
  view.hasSelection = false
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ChatScreen の状態別描画', () => {
  it('選択が無ければ案内を出し composer は描画しない', () => {
    render(<ChatScreen />)

    expect(screen.getByText('セッションを選ぶと会話が表示されます')).toBeInTheDocument()
    expect(screen.queryByLabelText(COMPOSER_LABELS.composerInput)).not.toBeInTheDocument()
  })

  it('loading は読み込み表示を出す', () => {
    view.status = 'loading'
    view.hasSelection = true

    render(<ChatScreen />)

    expect(screen.getByText('transcript を読み込み中…')).toBeInTheDocument()
  })

  it('empty はメッセージ無しの案内を出す', () => {
    view.status = 'empty'
    view.hasSelection = true

    render(<ChatScreen />)

    expect(screen.getByText('このセッションにはメッセージがありません')).toBeInTheDocument()
  })

  it('failed はエラーと再取得ボタンを出し、押すと retry を呼ぶ', () => {
    const retry = vi.fn()
    view.status = 'failed'
    view.hasSelection = true
    view.retry = retry

    render(<ChatScreen />)

    expect(screen.getByText('transcript を取得できませんでした')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '再取得' }))
    expect(retry).toHaveBeenCalledTimes(1)
  })

  it('failed は reasonKey を transcript 向けの理由文言にする (AC-4 / 列挙語彙を出さない)', () => {
    view.status = 'failed'
    view.hasSelection = true
    view.reasonKey = 'distro-not-running'

    render(<ChatScreen />)

    expect(screen.getByText(/所在 \(WSL ディストロ\) が停止/)).toBeInTheDocument()
    // enumeration-failed でも「列挙」文言を出さない (transcript は列挙ではない)。
    view.reasonKey = 'enumeration-failed'
    const { container } = render(<ChatScreen />)
    expect(container.textContent).not.toContain('列挙')
  })
})

// **合成 fixture による描画・順序の検証** (SC-001 の SDK 等価性・実データ突合は quickstart V-1 実機。pr-gate H-003)。
describe('ChatScreen の変換済みメッセージ描画 (順序・fallback)', () => {
  it('メッセージを記録順に並べる', () => {
    ready([textDto('m1', '最初のメッセージ'), textDto('m2', '次のメッセージ')])

    render(<ChatScreen />)

    const first = screen.getByText('最初のメッセージ')
    const second = screen.getByText('次のメッセージ')
    expect(first).toBeInTheDocument()
    expect(second).toBeInTheDocument()
    // DOM 上で first が second より前にある (記録順)。
    expect(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('未定義 tool は fallback (tool group) で表示され潰れない', async () => {
    ready([
      {
        id: 'm-tool',
        role: 'assistant',
        parts: [
          {
            type: 'tool-call',
            toolCallId: 'call-1',
            toolName: 'mystery_tool',
            argsText: '{"q":1}',
            result: 'ok',
            isError: false,
            truncated: false,
            children: []
          }
        ],
        createdAt: null
      }
    ])

    render(<ChatScreen />)

    // 未登録の tool でも fallback の tool group が出る (件数トリガ)。
    const trigger = screen.getByText('1 tool call')
    expect(trigger).toBeInTheDocument()
    // 既定の密度 (comfortable) で開いており、tool 名がそのまま出る (fallback。O-2 / FR-012)。
    expect(await screen.findByText('mystery_tool')).toBeInTheDocument()
  })
})

describe('ChatScreen の XSS 境界 (FR-020 / SC-008)', () => {
  it('生 HTML を描画せず javascript: リンクの href を無害化する', () => {
    ready([
      textDto(
        'm-xss',
        [
          '[危険リンク](javascript:alert(1))',
          '',
          '<script>window.__pwned=1</script>',
          '',
          '<img src=x onerror="window.__pwned=1">'
        ].join('\n')
      )
    ])

    const { container } = render(<ChatScreen />)

    // 生 HTML は要素化されない (rehype-raw 不採用)。
    expect(container.querySelector('script')).toBeNull()
    expect(container.querySelector('img')).toBeNull()

    // markdown リンクの href から javascript: が除去されている。
    const link = screen.getByText('危険リンク')
    expect(link.tagName).toBe('A')
    expect(link.getAttribute('href') ?? '').not.toContain('javascript')
  })
})

describe('ChatScreen の未完 markdown 耐性 (FR-010 / SC-005 / FE-051)', () => {
  it('未閉鎖コードフェンス・未閉鎖強調でも描画がクラッシュせず本文が出る', () => {
    ready([
      textDto(
        'm-partial',
        ['本文の途中', '', '```ts', 'const x = 1', '未閉鎖のフェンスと **強調が閉じない'].join('\n')
      )
    ])

    // 未完 markdown で throw しないこと自体が確認事項 (逐次伸長中の一瞬を模す)。
    expect(() => render(<ChatScreen />)).not.toThrow()
    expect(screen.getByText(/本文の途中/)).toBeInTheDocument()
    // コードフェンス内の文字列も失われない。
    expect(screen.getByText(/const x = 1/)).toBeInTheDocument()
  })
})

describe('ChatScreen の composer (Principle VIII 回帰)', () => {
  beforeEach(() => {
    // composer を検査するには Thread を mount する ready 状態が要る。
    ready([textDto('m1', 'こんにちは')])
  })

  it('composer は描画されるが入力が無効である', async () => {
    render(<ChatScreen />)

    const input = await screen.findByLabelText(COMPOSER_LABELS.composerInput)

    expect(input).toBeDisabled()
  })

  it('変換確定直後の Enter が送信経路に届かない', async () => {
    render(<ChatScreen />)
    const input = await screen.findByLabelText(COMPOSER_LABELS.composerInput)

    fireEvent.compositionStart(input)
    fireEvent.compositionEnd(input, { data: 'にほんご' })

    /*
     * `onNew` は到達時に throw する (未接続のまま送信できる状態を黙らせないため)。
     * したがって送信経路に届けば、この keyDown が例外として現れる。
     */
    expect(() => fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' })).not.toThrow()
    expect(screen.queryByText('にほんご')).not.toBeInTheDocument()
  })
})

describe('R-4 Tier A 専用表示 (FE-029 / SC-001)', () => {
  it('Bash を Terminal block で表示する (FR-001)', async () => {
    ready([toolDto('m', 'Bash', '{"command":"ls -la"}', { result: 'out.txt' })])
    const { container } = render(<ChatScreen />)
    toolGroupsOpenByDefault()
    expect(await screen.findByText(/ls -la/)).toBeInTheDocument()
    expect(container.querySelector('[data-slot="aui_terminal-block"]')).not.toBeNull()
    expect(container.textContent).toContain('out.txt')
  })

  it('Edit を Code diff (hunk) で表示する (FR-002)', async () => {
    ready([
      toolDto(
        'm',
        'Edit',
        JSON.stringify({
          file_path: 'src/x.ts',
          old_string: 'const a = 1',
          new_string: 'const a = 2'
        })
      )
    ])
    const { container } = render(<ChatScreen />)
    toolGroupsOpenByDefault()
    expect(await screen.findByText(/const a = 1/)).toBeInTheDocument()
    expect(container.querySelector('[data-slot="aui_code-diff"]')).not.toBeNull()
    expect(container.textContent).toContain('src/x.ts')
    expect(container.textContent).toContain('const a = 2')
  })

  it('Write を Code diff (全行追加) で表示する', async () => {
    ready([toolDto('m', 'Write', JSON.stringify({ file_path: 'new.ts', content: 'line1\nline2' }))])
    const { container } = render(<ChatScreen />)
    toolGroupsOpenByDefault()
    expect(await screen.findByText(/line1/)).toBeInTheDocument()
    expect(container.querySelector('[data-slot="aui_code-diff"]')).not.toBeNull()
    expect(container.textContent).toContain('new.ts')
  })

  it('TodoWrite を Todo list で status 別マーカー付きで表示する (FR-003 / SC-003)', async () => {
    ready([
      toolDto(
        'm',
        'TodoWrite',
        JSON.stringify({
          todos: [
            { content: 'A を読む', status: 'completed' },
            { content: 'B を書く', status: 'in_progress' },
            { content: 'C を確認', status: 'pending' }
          ]
        })
      )
    ])
    const { container } = render(<ChatScreen />)
    toolGroupsOpenByDefault()
    expect(await screen.findByText('A を読む')).toBeInTheDocument()
    expect(container.querySelector('[data-slot="aui_todo-list"]')).not.toBeNull()
    expect(container.querySelector('[data-status="completed"]')).not.toBeNull()
    expect(container.querySelector('[data-status="in_progress"]')).not.toBeNull()
    expect(container.querySelector('[data-status="pending"]')).not.toBeNull()
  })

  it('TodoWrite の未知 status も生値で欠落なく示す (SC-003)', async () => {
    ready([
      toolDto('m', 'TodoWrite', JSON.stringify({ todos: [{ content: 'X', status: 'blocked' }] }))
    ])
    const { container } = render(<ChatScreen />)
    toolGroupsOpenByDefault()
    expect(await screen.findByText('X')).toBeInTheDocument()
    expect(container.querySelector('[data-status="blocked"]')).not.toBeNull()
    expect(container.textContent).toContain('blocked')
  })

  it('ExitPlanMode を Agent plan で表示する (FR-006)', async () => {
    ready([toolDto('m', 'ExitPlanMode', JSON.stringify({ plan: '計画本文\n- 手順1\n- 手順2' }))])
    const { container } = render(<ChatScreen />)
    toolGroupsOpenByDefault()
    expect(await screen.findByText(/手順1/)).toBeInTheDocument()
    expect(container.querySelector('[data-slot="aui_agent-plan"]')).not.toBeNull()
  })

  it('Task を Subagent で表示する (FR-004)', async () => {
    ready([
      toolDto('m', 'Task', JSON.stringify({ subagent_type: 'search', prompt: 'find x' }), {
        result: '見つかった'
      })
    ])
    const { container } = render(<ChatScreen />)
    toolGroupsOpenByDefault()
    expect(await screen.findByText('search')).toBeInTheDocument()
    expect(container.querySelector('[data-slot="aui_subagent"]')).not.toBeNull()
    expect(container.textContent).toContain('見つかった')
  })

  it('未対応 tool は fallback のまま (専用表示に落ちない)', async () => {
    ready([
      toolDto('m', 'NotebookEdit', JSON.stringify({ notebook_path: '/w/a.ipynb' }), {
        result: 'hit'
      })
    ])
    const { container } = render(<ChatScreen />)
    toolGroupsOpenByDefault()
    expect(await screen.findByText('NotebookEdit')).toBeInTheDocument()
    expect(container.querySelector('[data-slot="aui_terminal-block"]')).toBeNull()
    expect(container.querySelector('[data-slot="aui_code-diff"]')).toBeNull()
  })
})

describe('R-4 subagent 入れ子 (FE-032 / US-2 / SC-004)', () => {
  it('Task 配下の subagent メッセージを入れ子で示す', async () => {
    const child: TranscriptMessageDTO = {
      id: 'sa1',
      role: 'assistant',
      parts: [{ type: 'text', text: '子エージェントの作業' }],
      createdAt: null
    }
    ready([
      toolDto('m', 'Task', JSON.stringify({ subagent_type: 'worker' }), { children: [child] })
    ])
    const { container } = render(<ChatScreen />)
    toolGroupsOpenByDefault()
    expect(await screen.findByText('子エージェントの作業')).toBeInTheDocument()
    expect(container.querySelector('[data-slot="aui_subagent"]')).not.toBeNull()
  })
})

describe('R-4 堅牢性と XSS 境界 (FE-040/042 / SC-005 / SC-002)', () => {
  it('壊れた args の Bash は fallback に安全退避する (クラッシュしない)', async () => {
    ready([toolDto('m', 'Bash', '{bad json', { result: 'x' })])
    const { container } = render(<ChatScreen />)
    toolGroupsOpenByDefault()
    expect(await screen.findByText('Bash')).toBeInTheDocument()
    expect(container.querySelector('[data-slot="aui_terminal-block"]')).toBeNull()
  })

  it('Edit の old/new に生 HTML が含まれても要素化されず plain text になる (SC-002)', async () => {
    ready([
      toolDto(
        'm',
        'Edit',
        JSON.stringify({
          file_path: 'x.ts',
          old_string: 'safe',
          new_string: '<script>window.__pwned=1</script>'
        })
      )
    ])
    const { container } = render(<ChatScreen />)
    toolGroupsOpenByDefault()
    expect(await screen.findByText(/window\.__pwned/)).toBeInTheDocument()
    expect(container.querySelector('script')).toBeNull()
    expect(container.textContent).toContain('<script>')
  })

  it('domain 変換を通した Bash command の双方向制御文字は DOM に現れない (H-1 end-to-end)', async () => {
    readyFromRecords([
      {
        type: 'assistant',
        uuid: 'a1',
        message: {
          role: 'assistant',
          content: [{ type: 'tool_use', id: 'tc1', name: 'Bash', input: { command: 'ls‮evil' } }]
        }
      }
    ])
    const { container } = render(<ChatScreen />)
    toolGroupsOpenByDefault()
    expect(await screen.findByText(/lsevil/)).toBeInTheDocument()
    expect(container.textContent).not.toContain('‮')
  })

  it('ExitPlanMode の plan 内 javascript: はリンク化されず inert text になる', async () => {
    ready([toolDto('m', 'ExitPlanMode', JSON.stringify({ plan: 'javascript:alert(1) を実行' }))])
    const { container } = render(<ChatScreen />)
    toolGroupsOpenByDefault()
    await screen.findByText(/javascript:alert/)
    expect(container.querySelector('[data-slot="aui_agent-plan"] a')).toBeNull()
  })
})

describe('R-4 Tool group と専用表示の共存 (FR-007 / US-1 AC-6 / M-4)', () => {
  it('連続する Bash 専用表示が 1 つの Tool group にまとまり、既定の密度で各 Terminal block が出る', async () => {
    ready([
      {
        id: 'm',
        role: 'assistant',
        createdAt: null,
        parts: [
          {
            type: 'tool-call',
            toolCallId: 'c1',
            toolName: 'Bash',
            argsText: '{"command":"echo 1"}',
            result: '1',
            isError: false,
            truncated: false,
            children: []
          },
          {
            type: 'tool-call',
            toolCallId: 'c2',
            toolName: 'Bash',
            argsText: '{"command":"echo 2"}',
            result: '2',
            isError: false,
            truncated: false,
            children: []
          }
        ]
      }
    ])
    const { container } = render(<ChatScreen />)
    // 連続 tool は 1 グループにまとまる (R-3 の Tool group)。既定の密度では開いて各 Terminal block が見える (O-2)。
    expect(screen.getByText('2 tool calls')).toBeInTheDocument()
    toolGroupsOpenByDefault()
    expect(await screen.findByText(/echo 1/)).toBeInTheDocument()
    expect(container.querySelectorAll('[data-slot="aui_terminal-block"]').length).toBe(2)
    expect(container.textContent).toContain('echo 2')
  })
})

describe('R-4 内部マーカー注入への耐性 (PR-H-1)', () => {
  it('Task の argsText に __subagentChildren を仕込んでも偽の入れ子を描画しない', async () => {
    ready([
      toolDto(
        'm',
        'Task',
        JSON.stringify({
          subagent_type: 'search',
          __subagentChildren: [
            {
              id: 'fake',
              role: 'assistant',
              parts: [{ type: 'text', text: '捏造された子作業' }],
              createdAt: null
            }
          ]
        })
      )
    ])
    const { container } = render(<ChatScreen />)
    toolGroupsOpenByDefault()
    expect(await screen.findByText('search')).toBeInTheDocument()
    // convert.ts が __ prefix を strip し信頼 children ([]) を設定するため偽の子は出ない。
    expect(container.textContent).not.toContain('捏造された子作業')
  })

  it('Task の argsText に malformed __subagentChildren を仕込んでもクラッシュしない', () => {
    ready([
      toolDto(
        'm',
        'Task',
        JSON.stringify({ subagent_type: 's', __subagentChildren: [{}, null, 42] })
      )
    ])
    expect(() => render(<ChatScreen />)).not.toThrow()
  })

  it('Edit の argsText に __truncated を仕込んでも偽の切り詰めバッジを出さない', async () => {
    ready([
      toolDto(
        'm',
        'Edit',
        JSON.stringify({ file_path: 'x.ts', old_string: 'a', new_string: 'b', __truncated: true })
      )
    ])
    const { container } = render(<ChatScreen />)
    toolGroupsOpenByDefault()
    expect(await screen.findByText(/x\.ts/)).toBeInTheDocument()
    expect(container.textContent).not.toContain('切り詰め')
  })
})

describe('R-4 巨大入力と edge case (PR-M-3 / PR-M-2 / PR-L-1)', () => {
  it('巨大な Write args は byte 上限で切り詰められ fallback に退避しクラッシュしない (PR-M-3)', async () => {
    const huge = 'x'.repeat(300_000)
    readyFromRecords([
      {
        type: 'assistant',
        uuid: 'a1',
        message: {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'tc1',
              name: 'Write',
              input: { file_path: 'big.txt', content: huge }
            }
          ]
        }
      }
    ])
    const { container } = render(<ChatScreen />)
    toolGroupsOpenByDefault()
    // argsText が切り詰められ JSON 破損 → parse null → code-diff にならず fallback に退避 (クラッシュしない)。
    expect(await screen.findByText('Write')).toBeInTheDocument()
    expect(container.querySelector('[data-slot="aui_code-diff"]')).toBeNull()
  })

  it('renderer は VISUAL_MAX_DEPTH を超える subagent 入れ子を「省略」で打ち切る (PR-M-2)', async () => {
    const records: SessionMessageLike[] = [
      {
        type: 'assistant',
        uuid: 't0',
        message: {
          role: 'assistant',
          content: [{ type: 'tool_use', id: 'task0', name: 'Task', input: { subagent_type: 's' } }]
        }
      }
    ]
    for (let i = 1; i <= 5; i++) {
      records.push({
        type: 'assistant',
        uuid: `sa${i}`,
        parent_tool_use_id: `task${i - 1}`,
        message: {
          role: 'assistant',
          content: [{ type: 'tool_use', id: `task${i}`, name: 'Task', input: {} }]
        }
      })
    }
    readyFromRecords(records)
    const { container } = render(<ChatScreen />)
    toolGroupsOpenByDefault()
    expect(await screen.findByText(/省略/)).toBeInTheDocument()
    expect(container.textContent).toMatch(/省略/)
  })

  it('TodoWrite の空配列は「項目はありません」を出す (PR-L-1)', async () => {
    ready([toolDto('m', 'TodoWrite', JSON.stringify({ todos: [] }))])
    const { container } = render(<ChatScreen />)
    toolGroupsOpenByDefault()
    expect(await screen.findByText('項目はありません')).toBeInTheDocument()
    expect(container.querySelector('[data-slot="aui_todo-list"]')).not.toBeNull()
  })

  it('toolName は完全一致 — 小文字 bash は専用表示にならず fallback に落ちる (PR-L-1)', async () => {
    ready([toolDto('m', 'bash', JSON.stringify({ command: 'ls' }), { result: 'x' })])
    const { container } = render(<ChatScreen />)
    toolGroupsOpenByDefault()
    expect(await screen.findByText('bash')).toBeInTheDocument()
    expect(container.querySelector('[data-slot="aui_terminal-block"]')).toBeNull()
  })

  it('code-diff は MAX_DIFF_ROWS を超える行を「残り N 行を省略」で折りたたむ (PR-L1 / FR-017)', async () => {
    const content = Array.from({ length: 250 }, (_, i) => `line ${i}`).join('\n')
    ready([toolDto('m', 'Write', JSON.stringify({ file_path: 'big.txt', content }))])
    const { container } = render(<ChatScreen />)
    toolGroupsOpenByDefault()
    // 250 行 add → Hunk が 200 行で折りたたみ、残り 50 行を件数表示 (バッジは result 切り詰め用で別経路)。
    expect(await screen.findByText(/残り 50 行を省略/)).toBeInTheDocument()
    expect(container.querySelector('[data-slot="aui_code-diff"]')).not.toBeNull()
  })

  it('subagent の子は VISUAL_MAX_CHILDREN を超えると「以降 N 件を省略」で折りたたむ (PR-L2 / FR-017)', async () => {
    const children = Array.from({ length: 51 }, (_, i) => textDto(`c${i}`, `child ${i}`))
    ready([toolDto('m', 'Task', JSON.stringify({ subagent_type: 's' }), { children })])
    const { container } = render(<ChatScreen />)
    toolGroupsOpenByDefault()
    // 1 階層 50 件で打ち切り、51 件目を「以降 1 件を省略」で示す (巨大 inline subagent ログの renderer 保護)。
    expect(await screen.findByText(/以降 1 件を省略/)).toBeInTheDocument()
    expect(container.querySelector('[data-slot="aui_subagent"]')).not.toBeNull()
  })
})
