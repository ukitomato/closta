import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

import { ApprovalCard } from './ApprovalCard'
import type { PendingPermission } from './useLiveSession'

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

  it('once と capability で説明文を出し分ける', () => {
    const { rerender } = render(
      <ApprovalCard request={req({ scope: 'once' })} onDecision={() => {}} />
    )
    expect(screen.getByText(/1 回だけ/)).toBeTruthy()
    rerender(<ApprovalCard request={req({ scope: 'capability' })} onDecision={() => {}} />)
    expect(screen.getByText(/capability/)).toBeTruthy()
  })
})
