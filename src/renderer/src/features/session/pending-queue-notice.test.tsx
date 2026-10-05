import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import type { QueueItemState } from '@assistant-ui/react'

import { DEFAULT_MAX_QUEUE_ITEMS } from './composer-queue'
import { CancelledQueueNotice, PendingQueueNotice, QueueRejectionNotice } from './LivePane'

/**
 * X-2 / FR-004 / T011 (AD-034 / L-4) — **実行中に積んだキュー項目の表示は会話由来テキストをリテラル表示し、
 * DOM に要素注入しない**。native queue の item は steer lane に載り `PendingQueueNotice` が唯一の可視化経路のため、
 * ここで「積まれていることが見える」(SC-003) と「HTML/markdown 風メタ文字がそのまま文字列として出る」を固定する。
 */

function item(id: string, text: string): QueueItemState {
  // `prompt` は deprecated だが型上は必須。表示は parts の text から導出される (queueItemText)。
  return { id, prompt: text, parts: [{ type: 'text', text }] }
}

describe('PendingQueueNotice (FR-004 / SC-003 / AD-034)', () => {
  it('積んだ項目が件数つきで可視化される', () => {
    render(
      <PendingQueueNotice items={[item('a', '次の指示'), item('b', 'その次')]} onRemove={vi.fn()} />
    )
    expect(screen.getByText('実行後に送信予定 (2):')).toBeInTheDocument()
    expect(screen.getByText('次の指示')).toBeInTheDocument()
    expect(screen.getByText('その次')).toBeInTheDocument()
  })

  it('HTML/markdown 風メタ文字はリテラル表示され DOM に要素注入されない (AD-034 / L-4)', () => {
    const payload = '<b>bold</b> <script>alert(1)</script> **md** 全角（）'
    const { container } = render(
      <PendingQueueNotice items={[item('x', payload)]} onRemove={vi.fn()} />
    )
    // 文字列そのものが表示される (エスケープされてテキストノードとして出る)。
    expect(screen.getByText(payload)).toBeInTheDocument()
    // 注入された要素が生成されていない (React の既定エスケープ = dangerouslySetInnerHTML を使っていない)。
    expect(container.querySelector('b')).toBeNull()
    expect(container.querySelector('script')).toBeNull()
  })

  it('× で onRemove(id) を呼ぶ (queued → 送られない)', async () => {
    const onRemove = vi.fn()
    render(<PendingQueueNotice items={[item('rm-1', '取り消す項目')]} onRemove={onRemove} />)
    await userEvent.click(screen.getByRole('button', { name: 'キューから削除' }))
    expect(onRemove).toHaveBeenCalledWith('rm-1')
  })
})

describe('QueueRejectionNotice (FR-003 / FR-004 / R2-M-001)', () => {
  it('full は件数上限の理由を提示する (最古破棄しない)', () => {
    render(<QueueRejectionNotice verdict="full" onDismiss={vi.fn()} />)
    expect(
      screen.getByText(new RegExp(`積み込みの上限 \\(${DEFAULT_MAX_QUEUE_ITEMS} 件\\)`))
    ).toBeInTheDocument()
  })

  it('invalid は空/超過の理由を提示する', () => {
    render(<QueueRejectionNotice verdict="invalid" onDismiss={vi.fn()} />)
    expect(screen.getByText(/空・空白のみ、または長すぎる入力は積めません/)).toBeInTheDocument()
  })

  it('× で onDismiss を呼ぶ', async () => {
    const onDismiss = vi.fn()
    render(<QueueRejectionNotice verdict="full" onDismiss={onDismiss} />)
    await userEvent.click(screen.getByRole('button', { name: '閉じる' }))
    expect(onDismiss).toHaveBeenCalled()
  })
})

describe('CancelledQueueNotice (FR-006 / US-2 AC-6)', () => {
  it('取り消された項目を件数つきで提示する', () => {
    render(<CancelledQueueNotice items={[item('c1', '消えた指示'), item('c2', 'これも')]} />)
    expect(screen.getByText('送信されずに取り消された入力 (2):')).toBeInTheDocument()
    expect(screen.getByText('消えた指示')).toBeInTheDocument()
    expect(screen.getByText('これも')).toBeInTheDocument()
  })
})
