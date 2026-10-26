import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'

import { TranscriptAnnouncer } from './TranscriptAnnouncer'
import type { AnnounceableMessage } from './transcript-announcements'

/**
 * O-6 FE-031 — 読み上げ (016 spec US-3 AC3 / SC-003。data-model §4「読み上げ」)。偽の時計で 1 秒のまとめ方を確かめる。
 */

const thread: { messages: AnnounceableMessage[] } = { messages: [] }

vi.mock('@assistant-ui/react', () => ({
  useAuiState: (selector: (s: unknown) => unknown) => selector({ thread })
}))

const toolCall = (
  id: string,
  toolName: string,
  over: { result?: string; isError?: boolean } = { result: 'x', isError: true }
): AnnounceableMessage => ({
  id: `m-${id}`,
  content: [
    { type: 'tool-call', toolCallId: id, toolName, result: over.result, isError: over.isError }
  ]
})

const row = (
  id: string,
  category: string,
  status: string | null,
  detail = 'SECRET-DETAIL'
): AnnounceableMessage => ({
  id,
  content: [
    {
      type: 'data',
      name: 'system-event',
      data: { category, opens: true, name: 'SECRET-NAME', detail, status }
    }
  ]
})

const text = (container: HTMLElement): string =>
  container.querySelector('[data-slot="transcript-announcer"]')?.textContent ?? ''

function update(
  view: ReturnType<typeof render>,
  messages: AnnounceableMessage[],
  advanceMs = 0
): void {
  thread.messages = messages
  act(() => {
    view.rerender(<TranscriptAnnouncer />)
    vi.advanceTimersByTime(advanceMs)
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  thread.messages = []
})

afterEach(() => {
  vi.useRealTimers()
})

describe('TranscriptAnnouncer (US-3 AC3)', () => {
  it('aria-live="polite" の領域が 1 つあり、最初は空', () => {
    thread.messages = [toolCall('t0', 'Bash')]
    const view = render(<TranscriptAnnouncer />)
    const region = view.container.querySelector('[aria-live]')
    expect(region).toHaveAttribute('aria-live', 'polite')
    expect(view.container.querySelectorAll('[aria-live]')).toHaveLength(1)
    // 最初の描画の時点にあるエラーは読まない
    expect(text(view.container)).toBe('')
  })

  it('新しく届いた tool のエラーを読む。tool 名は形に合うときだけ出す', () => {
    const view = render(<TranscriptAnnouncer />)
    update(view, [{ id: 'u', content: [{ type: 'text', text: 'hi' }] }])
    update(view, [...thread.messages, toolCall('t1', 'Bash')])
    expect(text(view.container)).toBe('Bash がエラーになりました')
    vi.advanceTimersByTime(1500)
    update(view, [...thread.messages, toolCall('t2', 'Evil <b>name</b> /etc/passwd')])
    expect(text(view.container)).toBe('tool がエラーになりました')
  })

  it('結果の無い tool・エラーでない結果・結果不明は読まない', () => {
    const view = render(<TranscriptAnnouncer />)
    update(view, [{ id: 'u', content: [] }])
    update(view, [
      ...thread.messages,
      toolCall('t1', 'Bash', { result: undefined, isError: false }),
      toolCall('t2', 'Bash', { result: 'ok', isError: false })
    ])
    expect(text(view.container)).toBe('')
  })

  it('圧縮・会話の作り直し・拒否・prevented の知らせ・Hook / task の終わりを読む。本文は入れない', () => {
    const cases: readonly [AnnounceableMessage, string][] = [
      [row('r1', 'compact-boundary', 'marked'), 'ここでコンテキストを圧縮しました'],
      [row('r2', 'conversation-reset', 'marked'), 'ここから新しい会話です'],
      [row('r3', 'refusal', 'no-fallback'), 'モデルが応答を拒否しました'],
      [row('r4', 'informational', 'prevented'), 'ここで止まりました'],
      [row('r5', 'hook', 'failed'), 'Hook が失敗'],
      [row('r6', 'task', 'completed'), 'Background task が完了']
    ]
    const view = render(<TranscriptAnnouncer />)
    update(view, [{ id: 'u', content: [] }])
    for (const [message, expected] of cases) {
      update(view, [...thread.messages, message], 1500)
      expect(text(view.container)).toBe(expected)
      expect(text(view.container)).not.toMatch(/SECRET/)
    }
  })

  it('notice / warning の知らせと O-4 / O-5 の行・実行中の Hook は読まない', () => {
    const view = render(<TranscriptAnnouncer />)
    update(view, [{ id: 'u', content: [] }])
    update(view, [
      ...thread.messages,
      row('i1', 'informational', 'notice'),
      row('i2', 'informational', 'warning'),
      row('i3', 'api-retry', 'retrying'),
      row('i4', 'compaction', 'compacting'),
      row('i5', 'permission-mode', 'changed'),
      row('i6', 'auth', 'authenticating'),
      row('i7', 'plugin', 'succeeded'),
      row('i8', 'hook', 'started')
    ])
    expect(text(view.container)).toBe('')
  })

  it('O-12: notification の warning・mirror-error・files-persisted の failed だけ読み、他の新しい行は読まない', () => {
    const cases: readonly [AnnounceableMessage, string][] = [
      [row('n1', 'notification', 'warning'), 'Claude Code からの通知があります'],
      [row('n2', 'mirror-error', 'failed'), '記録の同期に失敗しました'],
      [row('n3', 'files-persisted', 'failed'), 'ファイルの保存に失敗しました']
    ]
    const view = render(<TranscriptAnnouncer />)
    update(view, [{ id: 'u', content: [] }])
    for (const [message, expected] of cases) {
      update(view, [...thread.messages, message], 1500)
      expect(text(view.container)).toBe(expected)
      expect(text(view.container)).not.toMatch(/SECRET/)
    }
    const quiet = render(<TranscriptAnnouncer />)
    update(quiet, [{ id: 'u', content: [] }])
    update(quiet, [
      { id: 'u', content: [] },
      row('q1', 'notification', 'notice'),
      row('q2', 'local-command-output', 'notice'),
      row('q3', 'memory-recall', 'notice'),
      row('q4', 'tool-use-summary', 'notice'),
      row('q5', 'active-goal', 'completed'),
      row('q6', 'files-persisted', 'completed')
    ])
    expect(text(quiet.container)).toBe('')
  })

  it('O-12: 同じ行の notification が high で書き換わって 2 回届くと 2 回読む。warning の後の同じ本文の notice は読まない', () => {
    const view = render(<TranscriptAnnouncer />)
    update(view, [{ id: 'u', content: [] }])
    update(view, [{ id: 'u', content: [] }, row('n', 'notification', 'warning', 'first')], 1500)
    expect(text(view.container)).toBe('Claude Code からの通知があります')
    const firstNode = view.container.querySelector('[data-slot="transcript-announcer"] span')
    update(view, [{ id: 'u', content: [] }, row('n', 'notification', 'warning', 'second')], 1500)
    const secondNode = view.container.querySelector('[data-slot="transcript-announcer"] span')
    expect(text(view.container)).toBe('Claude Code からの通知があります')
    expect(secondNode).not.toBe(firstNode)
    // 同じ本文の low (notice) に戻っても読まない
    update(view, [{ id: 'u', content: [] }, row('n', 'notification', 'notice', 'second')], 1500)
    expect(view.container.querySelector('[data-slot="transcript-announcer"] span')).toBe(secondNode)
  })

  it('SessionStart の Hook の行が終わりの状態に変わったときに読む', () => {
    const view = render(<TranscriptAnnouncer />)
    update(view, [{ id: 'u', content: [] }, row('h1', 'hook', 'started', 'SessionStart')])
    update(view, [{ id: 'u', content: [] }, row('h1', 'hook', 'succeeded', 'SessionStart')])
    expect(text(view.container)).toBe('Hook が成功')
  })

  it('一般の Hook (O-11) は失敗・取り消しだけを読み、成功は読まない。10 件成功しても 0 件', () => {
    const view = render(<TranscriptAnnouncer />)
    update(view, [{ id: 'u', content: [] }])
    const ok = Array.from({ length: 10 }, (_, i) =>
      row(`ok${i}`, 'hook', 'succeeded', 'PreToolUse')
    )
    update(view, [...thread.messages, ...ok], 1500)
    expect(text(view.container)).toBe('')
    update(view, [...thread.messages, row('bad', 'hook', 'failed', 'PreToolUse')], 1500)
    expect(text(view.container)).toBe('Hook が失敗')
    update(view, [...thread.messages, row('can', 'hook', 'cancelled', 'Stop')], 1500)
    expect(text(view.container)).toBe('Hook が取り消し')
    expect(text(view.container)).not.toMatch(/SECRET|PreToolUse|Stop/)
  })

  it('「さらに表示」で先頭に足された古いメッセージは読まない', () => {
    const view = render(<TranscriptAnnouncer />)
    update(view, [{ id: 'u', content: [] }, toolCall('t1', 'Bash')])
    update(view, [toolCall('old', 'Read'), { id: 'u', content: [] }, toolCall('t1', 'Bash')])
    expect(text(view.container)).toBe('')
  })

  it('並列の 10 件のエラーは 1 秒に 1 文以下で件数の文になる', () => {
    const view = render(<TranscriptAnnouncer />)
    update(view, [{ id: 'u', content: [] }])
    update(view, [...thread.messages, toolCall('t0', 'Bash')])
    expect(text(view.container)).toBe('Bash がエラーになりました')
    // 同じ 1 秒の間に 9 件。まだ読まれない
    let messages = thread.messages
    for (let i = 1; i < 10; i += 1) {
      messages = [...messages, toolCall(`t${i}`, 'Bash')]
      update(view, messages, 50)
    }
    expect(text(view.container)).toBe('Bash がエラーになりました')
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(text(view.container)).toBe('9 件の tool がエラーになりました')
  })

  it('種類が混ざると「{n} 件の知らせがあります」', () => {
    const view = render(<TranscriptAnnouncer />)
    update(view, [{ id: 'u', content: [] }])
    update(view, [
      ...thread.messages,
      toolCall('t1', 'Bash'),
      row('r1', 'refusal', 'no-fallback'),
      row('r2', 'conversation-reset', 'marked')
    ])
    expect(text(view.container)).toBe('3 件の知らせがあります')
  })

  it('vitest-axe の違反 0', async () => {
    vi.useRealTimers()
    const view = render(<TranscriptAnnouncer />)
    expect((await axe(view.container)).violations).toEqual([])
  })
})
