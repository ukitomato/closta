import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, waitFor } from '@testing-library/react'

import type { ThreadMessageLike } from '@assistant-ui/react'

import { useUiStore } from '@/stores/ui'

import {
  createTranscriptNavigatorRegistry,
  findMessageElement,
  TranscriptNavigatorContext,
  type TranscriptNavigator,
  type TranscriptNavigatorRegistry
} from './transcript-context'

/**
 * O-3 FE-022 — transcript の navigator (012 data-model §2「移動」「メッセージの要素の引き方」)。
 * `thread.aui.tsx` の非仮想パス (40 件以下) と仮想パス (41 件以上) がそれぞれ `scrollToMessage(id)` を登録する。
 * 描画は本物の `ChatScreen` (assistant-ui の Thread) を通し、取得 (`useTranscript`) だけを差し替える。
 */

const { view } = vi.hoisted(() => ({
  view: {
    messages: [] as readonly ThreadMessageLike[],
    status: 'ready' as const,
    reasonKey: null as string | null,
    retry: (): void => {},
    hasSelection: true
  }
}))

vi.mock('./useTranscript', () => ({ useTranscript: () => view }))

import { ChatScreen } from './ChatScreen'

const TRICKY = 'a"],[data-message-id="b'
const ODD = 'x"\\],\ny'

function messages(ids: readonly string[]): ThreadMessageLike[] {
  return ids.map((id, i) => ({
    id,
    role: i % 2 === 0 ? ('user' as const) : ('assistant' as const),
    content: [{ type: 'text' as const, text: `メッセージ ${i}` }]
  }))
}

function sequentialIds(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `m-${i}`)
}

function mount(ids: readonly string[]): {
  readonly container: HTMLElement
  readonly registry: TranscriptNavigatorRegistry
} {
  view.messages = messages(ids)
  const registry = createTranscriptNavigatorRegistry()
  const { container } = render(
    <TranscriptNavigatorContext.Provider value={registry}>
      <ChatScreen />
    </TranscriptNavigatorContext.Provider>
  )
  return { container, registry }
}

function navigatorOf(registry: TranscriptNavigatorRegistry): TranscriptNavigator {
  const navigator = registry.current()
  if (navigator === null) throw new Error('navigator が登録されていない')
  return navigator
}

/** `scrollIntoView` を呼ばれた要素の `data-message-id` の並び。 */
function scrolledIds(spy: { mock: { contexts: unknown[] } }): (string | undefined)[] {
  return spy.mock.contexts.map((element) => (element as HTMLElement).dataset.messageId)
}

/**
 * jsdom にレイアウトを補う (virtualization.test.tsx と同じ土台)。行と viewport を 400px とし、ResizeObserver は観測の時点で
 * その大きさを通知する。`fire()` で登録済みの観測をもう一度通知できる (コンテンツの伸長の代わり)。
 * スクローラの全体の高さは 80,000px (400px × 200 件) とし、`scrollTo` は `scrollTop` を書いて scroll を非同期に送る。
 */
function stubVirtualLayout(): { readonly fire: () => void } {
  const size = 400
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    height: size,
    width: size,
    top: 0,
    left: 0,
    right: size,
    bottom: size,
    x: 0,
    y: 0,
    toJSON: () => ({})
  } as DOMRect)
  vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(size * 200)
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(size)
  vi.spyOn(Element.prototype, 'scrollTo').mockImplementation(function (
    this: Element,
    ...args: unknown[]
  ) {
    const top =
      typeof args[0] === 'number' ? (args[1] as number) : ((args[0] as ScrollToOptions).top ?? 0)
    this.scrollTop = top
    setTimeout(() => this.dispatchEvent(new Event('scroll')), 0)
  })

  const observers: { readonly cb: ResizeObserverCallback; readonly targets: Element[] }[] = []
  const entryOf = (target: Element): ResizeObserverEntry =>
    ({
      target,
      contentRect: { height: size, width: size } as DOMRectReadOnly,
      borderBoxSize: [{ blockSize: size, inlineSize: size }],
      contentBoxSize: [{ blockSize: size, inlineSize: size }],
      devicePixelContentBoxSize: [{ blockSize: size, inlineSize: size }]
    }) as unknown as ResizeObserverEntry
  class SizedResizeObserver implements ResizeObserver {
    private readonly targets: Element[] = []
    constructor(private readonly cb: ResizeObserverCallback) {
      observers.push({ cb, targets: this.targets })
    }
    observe(target: Element): void {
      this.targets.push(target)
      this.cb([entryOf(target)], this)
    }
    unobserve(): void {
      // 観測し直さない (固定の大きさ)
    }
    disconnect(): void {
      this.targets.length = 0
    }
  }
  vi.stubGlobal('ResizeObserver', SizedResizeObserver)
  return {
    fire: () => {
      for (const { cb, targets } of observers) {
        if (targets.length > 0) cb(targets.map(entryOf), {} as ResizeObserver)
      }
    }
  }
}

beforeEach(() => {
  useUiStore.setState({ transcriptDensity: 'comfortable' })
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('非仮想パス (40 件以下)', () => {
  it('id のメッセージの要素で scrollIntoView が呼ばれ、true を返す', () => {
    const spy = vi.spyOn(Element.prototype, 'scrollIntoView')
    const { container, registry } = mount(sequentialIds(5))
    expect(container.querySelector('[data-virtualized="true"]')).toBeNull()

    let moved = false
    act(() => {
      moved = navigatorOf(registry).scrollToMessage('m-3')
    })
    expect(moved).toBe(true)
    expect(scrolledIds(spy)).toEqual(['m-3'])
    expect(spy).toHaveBeenCalledWith({ block: 'center' })
  })

  it('知らない id では何もせず false', () => {
    const spy = vi.spyOn(Element.prototype, 'scrollIntoView')
    const { registry } = mount(sequentialIds(5))
    expect(navigatorOf(registry).scrollToMessage('知らない')).toBe(false)
    expect(spy).not.toHaveBeenCalled()
  })

  it('id が `"` `\\` `]` `,` 改行やセレクタの断片を含んでも例外が出ず、その id のメッセージへ移る (id が b のメッセージではない)', () => {
    const spy = vi.spyOn(Element.prototype, 'scrollIntoView')
    const { container, registry } = mount([TRICKY, 'b', ODD])
    // 要素の印は React の属性としてそのまま載る (照合は dataset の厳密比較)。
    expect(findMessageElement(container, TRICKY)).not.toBeNull()
    expect(findMessageElement(container, ODD)).not.toBeNull()

    expect(() => {
      act(() => {
        navigatorOf(registry).scrollToMessage(TRICKY)
        navigatorOf(registry).scrollToMessage(ODD)
      })
    }).not.toThrow()
    expect(scrolledIds(spy)).toEqual([TRICKY, ODD])
  })

  it('root はメッセージを含む要素を返す', () => {
    const { registry } = mount(sequentialIds(3))
    const root = navigatorOf(registry).root()
    expect(root).not.toBeNull()
    expect(findMessageElement(root!, 'm-1')).not.toBeNull()
  })
})

describe('仮想パス (41 件以上)', () => {
  it('仮想化の範囲の外の id へ移ると、そのメッセージが描かれる', async () => {
    stubVirtualLayout()
    const { container, registry } = mount(sequentialIds(200))
    expect(container.querySelector('[data-virtualized="true"]')).not.toBeNull()
    // 初期表示は最下部 (最新)。先頭のメッセージは描かれていない。
    await waitFor(() => expect(findMessageElement(container, 'm-199')).not.toBeNull())
    expect(findMessageElement(container, 'm-0')).toBeNull()

    let moved = false
    act(() => {
      moved = navigatorOf(registry).scrollToMessage('m-0')
    })
    expect(moved).toBe(true)
    await waitFor(() => expect(findMessageElement(container, 'm-0')).not.toBeNull())
  })

  it('知らない id では false', () => {
    stubVirtualLayout()
    const { registry } = mount(sequentialIds(60))
    expect(navigatorOf(registry).scrollToMessage('知らない')).toBe(false)
  })

  it('移った後は、コンテンツが伸びても下端へ追従しない (stickyRef を切る)', async () => {
    const layout = stubVirtualLayout()
    const { container, registry } = mount(sequentialIds(200))
    await waitFor(() => expect(findMessageElement(container, 'm-199')).not.toBeNull())
    const scroller = container.querySelector<HTMLElement>('[data-virtualized="true"]')!

    act(() => {
      navigatorOf(registry).scrollToMessage('m-0')
      // scroll の通知 (利用者の上スクロールの判定) より前に、コンテンツの伸長を通知する。
      layout.fire()
    })
    // 追従していれば scrollTop は全体の高さ (80,000) に飛ぶ。
    expect(scroller.scrollTop).toBe(0)
  })

  it('id がセレクタの断片を含んでも例外が出ず、そのメッセージが画面に入る (id が b のメッセージではない)', async () => {
    stubVirtualLayout()
    const spy = vi.spyOn(Element.prototype, 'scrollIntoView')
    const ids = sequentialIds(200)
    ids[0] = TRICKY
    ids[198] = 'b'
    ids[1] = ODD
    const { container, registry } = mount(ids)
    await waitFor(() => expect(findMessageElement(container, 'b')).not.toBeNull())
    expect(findMessageElement(container, TRICKY)).toBeNull()

    expect(() => {
      act(() => {
        navigatorOf(registry).scrollToMessage(TRICKY)
      })
    }).not.toThrow()
    await waitFor(() => expect(findMessageElement(container, TRICKY)).not.toBeNull())
    await waitFor(() => expect(scrolledIds(spy)).toContain(TRICKY))
    expect(scrolledIds(spy)).not.toContain('b')

    act(() => {
      navigatorOf(registry).scrollToMessage(ODD)
    })
    await waitFor(() => expect(scrolledIds(spy)).toContain(ODD))
  })
})
