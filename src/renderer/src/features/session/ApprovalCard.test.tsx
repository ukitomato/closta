import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { axe } from 'vitest-axe'

import { MCP_TOOL_LABELS } from '@/features/chat/labels'

import { ApprovalCard } from './ApprovalCard'
import { APPROVAL_CARD_LABELS } from './labels'
import type { PendingPermission } from './useLiveSession'

const AXE_RULES = { rules: { 'color-contrast': { enabled: false } } }

/**
 * FE-010 — 承認カードの **plain text 表示 (XSS 境界)** と allow/deny 経路 (SC-007 / H-05)。
 *
 * `toolName` / `input` は agents 側でサニタイズ済みだが、**描画経路が HTML として解釈しない**ことを
 * 実レンダリングで確かめる (MCP 由来の表示偽装を防ぐ)。承認は唯一の経路であり、決定ボタンが
 * `onDecision` に正しい outcome を渡すことも確認する。
 */

function req(overrides: Partial<PendingPermission> = {}): PendingPermission {
  return {
    requestId: 'r1',
    toolName: 'Bash',
    input: '{"command":"ls"}',
    scope: 'once',
    ...overrides
  }
}

describe('ApprovalCard', () => {
  it('toolName / input を plain text で表示し HTML として解釈しない', () => {
    const payload = '<img src=x onerror="alert(1)">'
    const { container } = render(
      <ApprovalCard request={req({ toolName: payload })} onDecision={() => {}} />
    )
    // 生 HTML として挿入されていない (img 要素が生成されない)。
    expect(container.querySelector('img')).toBeNull()
    // 文字列そのものは本文中に現れる (エスケープされて表示される)。
    expect(screen.getByText(/onerror/)).toBeTruthy()
  })

  it('許可ボタンは allow、拒否ボタンは deny を渡す', () => {
    const onDecision = vi.fn()
    render(<ApprovalCard request={req()} onDecision={onDecision} />)
    fireEvent.click(screen.getByText('許可'))
    expect(onDecision).toHaveBeenCalledWith('allow')
    fireEvent.click(screen.getByText('拒否'))
    expect(onDecision).toHaveBeenCalledWith('deny')
  })

  it('MCP の tool は 200 文字の生の名前を切り詰めずに等幅・break-all で出す (O-5 US-1 AC6 / SC-001)', () => {
    const toolName = `mcp__srv__${'t'.repeat(190)}`
    expect(toolName).toHaveLength(200)
    const { container } = render(
      <ApprovalCard request={req({ toolName })} onDecision={() => {}} mcpServerNames={['srv']} />
    )
    const raw = container.querySelector('[data-slot="approval-tool-name"]')
    expect(raw?.textContent).toBe(toolName)
    expect(raw).toHaveClass('font-mono', 'break-all')
    expect(container.querySelector('[data-slot="approval-mcp-heading"]')?.textContent).toBe(
      `srv › ${'t'.repeat(190)}`
    )
    expect(container.querySelector('[data-slot="approval-mcp-inferred"]')).toBeNull()
  })

  it('サーバー a と a__b の両方があると補助の見出しは最長一致の a__b › c で推定の印', () => {
    const { container } = render(
      <ApprovalCard
        request={req({ toolName: 'mcp__a__b__c' })}
        onDecision={() => {}}
        mcpServerNames={['a', 'a__b']}
      />
    )
    expect(container.querySelector('[data-slot="approval-mcp-heading"]')).toHaveTextContent(
      'a__b › c'
    )
    expect(container.querySelector('[data-slot="approval-mcp-inferred"]')).toHaveTextContent(
      MCP_TOOL_LABELS.serverInferred
    )
  })

  it('一致がちょうど 1 つなら推定の印なし、サーバー名が無いと推定の印', () => {
    const { container, rerender } = render(
      <ApprovalCard
        request={req({ toolName: 'mcp__a__b__c' })}
        onDecision={() => {}}
        mcpServerNames={['a__b']}
      />
    )
    expect(container.querySelector('[data-slot="approval-mcp-heading"]')).toHaveTextContent(
      'a__b › c'
    )
    expect(container.querySelector('[data-slot="approval-mcp-inferred"]')).toBeNull()
    rerender(<ApprovalCard request={req({ toolName: 'mcp__a__b__c' })} onDecision={() => {}} />)
    expect(container.querySelector('[data-slot="approval-mcp-heading"]')).toHaveTextContent(
      'a › b__c'
    )
    expect(container.querySelector('[data-slot="approval-mcp-inferred"]')).not.toBeNull()
  })

  it('answerable の AskUserQuestion は答える部品を出し、O-5 の暫定の注記を出さない (O-10 US-1 AC1)', () => {
    const input = JSON.stringify({
      questions: [{ question: '色は?', header: '色', options: [{ label: '赤', description: '' }] }]
    })
    const onDecision = vi.fn()
    const { container } = render(
      <ApprovalCard
        request={req({ toolName: 'AskUserQuestion', input, answerable: 'ask-user-question' })}
        onDecision={onDecision}
      />
    )
    expect(container.querySelector('[data-slot="approval-ask-user-question-notice"]')).toBeNull()
    expect(screen.getByText(APPROVAL_CARD_LABELS.sendAnswers)).toBeInTheDocument()
    expect(screen.queryByText(APPROVAL_CARD_LABELS.allow)).toBeNull()
    fireEvent.click(screen.getByLabelText('赤'))
    fireEvent.click(screen.getByText(APPROVAL_CARD_LABELS.sendAnswers))
    expect(onDecision).toHaveBeenCalledWith('allow', ['赤'])
    fireEvent.click(screen.getByText(APPROVAL_CARD_LABELS.deny))
    expect(onDecision).toHaveBeenLastCalledWith('deny')
  })

  it('answerable の無い要求 (mcp__x__AskUserQuestion を含む) は今の承認カードのまま', () => {
    render(
      <ApprovalCard request={req({ toolName: 'mcp__x__AskUserQuestion' })} onDecision={() => {}} />
    )
    expect(screen.getByText('許可')).toBeInTheDocument()
    expect(screen.queryByText(APPROVAL_CARD_LABELS.sendAnswers)).toBeNull()
  })

  it('MCP でない tool (Bash) のカードは今のまま (生の名前の等幅・補助の見出し・注記を出さない)', () => {
    const { container } = render(
      <ApprovalCard request={req()} onDecision={() => {}} mcpServerNames={['a']} />
    )
    const first = container.querySelector('p')
    expect(first?.textContent).toBe('Claude が Bash の実行を求めています')
    expect(first?.querySelector('span')).toHaveClass('font-semibold')
    expect(first?.querySelector('span')).not.toHaveClass('font-mono')
    expect(container.querySelector('[data-slot^="approval-"]')).toBeNull()
    expect(container.querySelectorAll('p')).toHaveLength(2)
  })

  it('MCP の tool・AskUserQuestion でも「許可」「拒否」の応答の値は今のまま', () => {
    for (const toolName of ['mcp__a__b', 'AskUserQuestion']) {
      const onDecision = vi.fn()
      const { unmount } = render(
        <ApprovalCard request={req({ toolName })} onDecision={onDecision} mcpServerNames={['a']} />
      )
      fireEvent.click(screen.getByText('許可'))
      fireEvent.click(screen.getByText('拒否'))
      expect(onDecision.mock.calls).toEqual([['allow'], ['deny']])
      unmount()
    }
  })

  it('vitest-axe の違反 0 (MCP の tool と AskUserQuestion)', async () => {
    for (const toolName of ['mcp__a__b', 'AskUserQuestion']) {
      const { container, unmount } = render(
        <ApprovalCard request={req({ toolName })} onDecision={() => {}} />
      )
      expect((await axe(container, AXE_RULES)).violations).toEqual([])
      unmount()
    }
  })

  it('once と capability で説明文を出し分ける', () => {
    const { rerender } = render(
      <ApprovalCard request={req({ scope: 'once' })} onDecision={() => {}} />
    )
    expect(screen.getByText(/1 回だけ/)).toBeTruthy()
    rerender(<ApprovalCard request={req({ scope: 'capability' })} onDecision={() => {}} />)
    expect(screen.getByText(/capability/)).toBeTruthy()
  })
})
