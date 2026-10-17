import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'

import type { ThreadMessageLike } from '@assistant-ui/react'

import {
  CenterConversationContext,
  createCenterConversationStore,
  type CenterConversation,
  type CenterConversationStore
} from '@/features/chat/center-conversation'
import { SYSTEM_EVENT_DATA_NAME } from '@/features/chat/convert'
import { withMessageTime } from '@/features/chat/message-time'
import { deriveTurns } from '@/features/chat/turns'

import { ConversationMapTab } from './ConversationMapTab'
import { CONVERSATION_MAP_LABELS } from './labels'

/**
 * O-9 FE-022 — 会話の地図のタブ (SC-003)。公開口へ値を直接 publish し、行・移動・仮想化・間引き・空の状態を見る。
 * jsdom はレイアウトを持たないので `ResizeObserver` と矩形を固定して仮想化を働かせる。
 */

const AXE_RULES = { rules: { 'color-contrast': { enabled: false } } }
const T0 = new Date(2026, 9, 17, 10, 0, 0).getTime()

function stubLayout(size = 224): void {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    height: size,
    width: 300,
    top: 0,
    left: 0,
    right: 300,
    bottom: size,
    x: 0,
    y: 0,
    toJSON: () => ({})
  } as DOMRect)
  class SizedResizeObserver implements ResizeObserver {
    constructor(private readonly cb: ResizeObserverCallback) {}
    observe(target: Element): void {
      const entry = {
        target,
        contentRect: { height: size, width: 300 } as DOMRectReadOnly,
        borderBoxSize: [{ blockSize: size, inlineSize: 300 }],
        contentBoxSize: [{ blockSize: size, inlineSize: 300 }],
        devicePixelContentBoxSize: [{ blockSize: size, inlineSize: 300 }]
      } as unknown as ResizeObserverEntry
      this.cb([entry], this)
    }
    unobserve(): void {
      // 固定の大きさ
    }
    disconnect(): void {
      // 同上
    }
  }
  vi.stubGlobal('ResizeObserver', SizedResizeObserver)
}

function conversation(
  key: string,
  count: number,
  navigateTo: (id: string) => void = () => {},
  extra: readonly ThreadMessageLike[] = []
): CenterConversation {
  const messages: ThreadMessageLike[] = []
  for (let i = 0; i < count; i += 1) {
    messages.push(
      withMessageTime(
        { role: 'user', id: `u${i}`, content: [{ type: 'text', text: `質問 ${i}` }] },
        T0 + i * 60_000
      ),
      withMessageTime(
        {
          role: 'assistant',
          id: `a${i}`,
          content: [
            {
              type: 'tool-call',
              toolCallId: `t${i}`,
              toolName: 'Read',
              args: {},
              argsText: '{}',
              isError: i === 0
            }
          ]
        },
        T0 + i * 60_000 + 5_000
      )
    )
  }
  messages.push(...extra)
  return { conversationKey: key, messages, turns: deriveTurns(messages, false), navigateTo }
}

function mount(store: CenterConversationStore): ReturnType<typeof render> {
  return render(
    <CenterConversationContext.Provider value={store}>
      <ConversationMapTab />
    </CenterConversationContext.Provider>
  )
}

const rows = (c: HTMLElement): HTMLElement[] =>
  Array.from(c.querySelectorAll<HTMLElement>('[data-turn-id]'))

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
  vi.setSystemTime(new Date(2026, 9, 17, 12, 0, 0))
  stubLayout()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('会話の地図のタブ (O-9 FE-022)', () => {
  it('中央に何も出していないときと、ターンが無いときの空の状態', () => {
    const store = createCenterConversationStore()
    const { unmount } = mount(store)
    expect(screen.getByText(CONVERSATION_MAP_LABELS.emptyNoConversation)).toBeTruthy()
    act(() => store.publish(conversation('s', 0)))
    expect(screen.getByText(CONVERSATION_MAP_LABELS.emptyNoTurns)).toBeTruthy()
    unmount()
  })

  it('行に時刻・入力の先頭・所要時間・tool の数・エラーの数・境界の印が出る', () => {
    const store = createCenterConversationStore()
    const marker = withMessageTime(
      {
        role: 'assistant',
        id: 'm',
        content: [{ type: 'data', name: SYSTEM_EVENT_DATA_NAME, data: { category: 'refusal' } }],
        metadata: { custom: { systemEvent: true } }
      },
      T0 + 6_000
    )
    store.publish(conversation('s', 1, undefined, [marker]))
    const { container } = mount(store)
    const [row] = rows(container)
    expect(row?.getAttribute('aria-label')).toBe(
      '10:00、質問 0、所要 0:06、tool 1、エラー 1、モデルの拒否'
    )
    expect(row?.textContent).toContain('質問 0')
  })

  it('行を選ぶと navigateTo(ターンの id) が呼ばれ、フォーカスは地図に残り aria-current が付く', () => {
    const store = createCenterConversationStore()
    const navigateTo = vi.fn()
    store.publish(conversation('s', 3, navigateTo))
    const { container } = mount(store)
    const second = rows(container)[1]!
    second.focus()
    fireEvent.click(second)
    expect(navigateTo).toHaveBeenCalledWith('u1')
    expect(document.activeElement).toBe(second)
    expect(rows(container)[1]?.getAttribute('aria-current')).toBe('true')
    expect(rows(container)[0]?.getAttribute('aria-current')).toBeNull()
  })

  it('IME の変換中の Enter では移らない', () => {
    const store = createCenterConversationStore()
    const navigateTo = vi.fn()
    store.publish(conversation('s', 2, navigateTo))
    const { container } = mount(store)
    const first = rows(container)[0]!
    fireEvent.keyDown(first, { key: 'Enter', isComposing: true })
    fireEvent.keyDown(first, { key: 'Enter', keyCode: 229 })
    expect(navigateTo).not.toHaveBeenCalled()
    fireEvent.keyDown(first, { key: 'Enter' })
    expect(navigateTo).toHaveBeenCalledWith('u0')
  })

  it('矢印・Home / End でフォーカスが動き、roving tabindex は 1 行だけ', async () => {
    const store = createCenterConversationStore()
    store.publish(conversation('s', 5))
    const { container } = mount(store)
    const first = rows(container)[0]!
    first.focus()
    fireEvent.keyDown(first, { key: 'ArrowDown' })
    await act(async () => {})
    expect((document.activeElement as HTMLElement).dataset.turnId).toBe('u1')
    fireEvent.keyDown(document.activeElement!, { key: 'End' })
    await act(async () => {})
    expect((document.activeElement as HTMLElement).dataset.turnId).toBe('u4')
    fireEvent.keyDown(document.activeElement!, { key: 'Home' })
    await act(async () => {})
    expect((document.activeElement as HTMLElement).dataset.turnId).toBe('u0')
    expect(rows(container).filter((r) => r.tabIndex === 0)).toHaveLength(1)
  })

  it('1,000 ターンと 100 ターンで描く行の数が同じ上限に収まり、末尾から Home で戻ってもフォーカスを失わない (RK-08)', async () => {
    const counts: number[] = []
    for (const n of [100, 1000]) {
      const store = createCenterConversationStore()
      store.publish(conversation('s', n))
      const view = mount(store)
      counts.push(rows(view.container).length)
      if (n === 1000) {
        const first = rows(view.container)[0]!
        first.focus()
        fireEvent.keyDown(first, { key: 'End' })
        await act(async () => {})
        expect((document.activeElement as HTMLElement).dataset.turnId).toBe('u999')
        fireEvent.keyDown(document.activeElement!, { key: 'Home' })
        await act(async () => {})
        expect((document.activeElement as HTMLElement).dataset.turnId).toBe('u0')
      }
      view.unmount()
    }
    expect(counts[0]).toBeGreaterThan(0)
    expect(counts[1]).toBe(counts[0])
    // 見えている 4 行 + overscan 8 × 2 + 1
    expect(counts[1]).toBeLessThanOrEqual(4 + 16 + 1)
  })

  it('500ms の間引き: 前縁で即時、続く更新は 1 回にまとまる。会話が替わるときは即時', () => {
    const store = createCenterConversationStore()
    store.publish(conversation('s', 1))
    const { container } = mount(store)
    expect(rows(container)).toHaveLength(1)
    act(() => store.publish(conversation('s', 2)))
    // 前縁 (最後の出力から 500ms 未満ではない)。マウント直後の出力から時間が経っていないので後縁に回る。
    act(() => vi.advanceTimersByTime(600))
    expect(rows(container)).toHaveLength(2)
    act(() => store.publish(conversation('s', 3)))
    expect(rows(container)).toHaveLength(2)
    act(() => store.publish(conversation('s', 4)))
    expect(rows(container)).toHaveLength(2)
    act(() => vi.advanceTimersByTime(500))
    expect(rows(container)).toHaveLength(4)
    act(() => store.publish(conversation('other', 1)))
    expect(rows(container)).toHaveLength(1)
  })

  it('中央の切り替えで新しい会話に替わり aria-current が消える', () => {
    const store = createCenterConversationStore()
    store.publish(conversation('a', 2))
    const { container } = mount(store)
    fireEvent.click(rows(container)[0]!)
    expect(rows(container)[0]?.getAttribute('aria-current')).toBe('true')
    act(() => store.publish(conversation('b', 2)))
    expect(container.querySelector('[aria-current]')).toBeNull()
  })

  it('取り消された行が次の更新で消え、フォーカスの行の代わりに直前の行が tabbable になる', () => {
    const store = createCenterConversationStore()
    store.publish(conversation('s', 3))
    const { container } = mount(store)
    const last = rows(container)[2]!
    last.focus()
    act(() => store.publish(conversation('s', 2)))
    act(() => vi.advanceTimersByTime(600))
    expect(rows(container)).toHaveLength(2)
    expect(rows(container).find((r) => r.tabIndex === 0)?.dataset.turnId).toBe('u1')
  })

  it('axe に通る', async () => {
    vi.useRealTimers()
    const store = createCenterConversationStore()
    store.publish(conversation('s', 3))
    const { container } = mount(store)
    expect((await axe(container, AXE_RULES)).violations).toEqual([])
  })
})

/** 30 分離れた 2 つの利用者の入力 (区間 30。両端だけ活動がある)。 */
function sparse(navigateTo: (id: string) => void): CenterConversation {
  const messages = [
    withMessageTime({ role: 'user', id: 'p', content: [{ type: 'text', text: 'p' }] }, T0),
    withMessageTime(
      { role: 'user', id: 'q', content: [{ type: 'text', text: 'q' }] },
      T0 + 30 * 60_000
    )
  ]
  return { conversationKey: 's', messages, turns: deriveTurns(messages, false), navigateTo }
}

const bins = (c: HTMLElement): HTMLElement[] =>
  Array.from(c.querySelectorAll<HTMLElement>('[data-bin-index]'))

describe('活動の帯 (O-9 FE-031 / US-3)', () => {
  it('toolbar に区間ごとのボタンが並び、名前に時刻の範囲と活動の数が出る。濃さの段はテーマのトークンだけ', () => {
    const store = createCenterConversationStore()
    store.publish(conversation('s', 3))
    const { container } = mount(store)
    const toolbar = screen.getByRole('toolbar', { name: CONVERSATION_MAP_LABELS.band })
    expect(toolbar.getAttribute('aria-orientation')).toBe('horizontal')
    const items = bins(container)
    expect(items).toHaveLength(3)
    expect(items[0]?.getAttribute('aria-label')).toBe('10:00〜10:01、活動 3')
    expect(toolbar.innerHTML).toMatch(/bg-primary/)
    expect(toolbar.innerHTML).not.toMatch(/bg-(red|blue|green|yellow|orange|\[)/)
  })

  it('区間を選ぶと中央がその区間の最初のメッセージへ移る。活動の無い区間では移らない', () => {
    const store = createCenterConversationStore()
    const navigateTo = vi.fn()
    store.publish(sparse(navigateTo))
    const { container } = mount(store)
    const items = bins(container)
    expect(items).toHaveLength(30)
    fireEvent.click(items[15]!)
    expect(items[15]?.getAttribute('aria-disabled')).toBe('true')
    expect(navigateTo).not.toHaveBeenCalled()
    fireEvent.click(items[29]!)
    expect(navigateTo).toHaveBeenCalledWith('q')
  })

  it('矢印・Home / End でフォーカスが動き (活動 0 の区間にも止まる)、roving tabindex は 1 つだけ', () => {
    const store = createCenterConversationStore()
    store.publish(sparse(() => {}))
    const { container } = mount(store)
    const items = bins(container)
    items[0]!.focus()
    fireEvent.keyDown(items[0]!, { key: 'ArrowRight' })
    expect(document.activeElement).toBe(items[1])
    fireEvent.keyDown(items[1]!, { key: 'End' })
    expect(document.activeElement).toBe(items[29])
    fireEvent.keyDown(items[29]!, { key: 'ArrowLeft' })
    expect(document.activeElement).toBe(items[28])
    fireEvent.keyDown(items[28]!, { key: 'Home' })
    expect(document.activeElement).toBe(items[0])
    expect(items.filter((b) => b.tabIndex === 0)).toHaveLength(1)
  })

  it('時刻を持つメッセージが 2 つ未満なら帯の代わりに空の状態の文言が出て、地図の行も出る', () => {
    const store = createCenterConversationStore()
    const messages: ThreadMessageLike[] = [
      withMessageTime({ role: 'user', id: 'only', content: [{ type: 'text', text: 'x' }] }, T0)
    ]
    store.publish({
      conversationKey: 's',
      messages,
      turns: deriveTurns(messages, false),
      navigateTo: () => {}
    })
    const { container } = mount(store)
    expect(screen.getByText(CONVERSATION_MAP_LABELS.bandEmpty)).toBeTruthy()
    expect(screen.queryByRole('toolbar')).toBeNull()
    expect(rows(container)).toHaveLength(1)
  })

  it('axe に通る', async () => {
    vi.useRealTimers()
    const store = createCenterConversationStore()
    store.publish(sparse(() => {}))
    const { container } = mount(store)
    expect((await axe(container, AXE_RULES)).violations).toEqual([])
  })
})
