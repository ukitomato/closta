import { afterEach, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'

import type { ThreadMessageLike } from '@assistant-ui/react'

import type { TranscriptMessageDTO } from '@domain/session/transcript-dto'

import { toThreadMessage } from './convert'

/**
 * FE-043 — 仮想化の機械検証 (SC-003 / US-2)。
 *
 * **同時マウント DOM ノード数が総件数に依存しない**ことを、件数を変えて比較する。
 * jsdom はレイアウトを持たないので `useVirtualizer` は `initialRect` (800px) の窓を保ち、
 * 総件数によらず一定数の行だけをマウントする — これがまさに検証したい性質である。
 * スクロール位置の実体験 (SC-002/SC-004) は quickstart V-5 (実機) が担う。
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

function build(count: number): ThreadMessageLike[] {
  const messages: TranscriptMessageDTO[] = []
  for (let i = 0; i < count; i += 1) {
    messages.push({
      id: `m-${i}`,
      role: i % 2 === 0 ? 'user' : 'assistant',
      parts: [{ type: 'text', text: `メッセージ ${i}` }],
      createdAt: null
    })
  }
  return messages.map(toThreadMessage)
}

function mountedRows(container: HTMLElement): number {
  return container.querySelectorAll('[data-index]').length
}

/**
 * jsdom はレイアウトを持たず全要素の矩形が 0 になるため、`useVirtualizer` は viewport 高さ 0 と
 * 判定して行を 1 つも載せない。`@tanstack/react-virtual` は viewport / 行の寸法を **`ResizeObserver`** で取るので、
 * **観測時に固定サイズを通知する RO** と `getBoundingClientRect` を与えて「一定の窓だけ載る」性質を検証できる。
 * この stub は仮想化の対象そのものではなく、jsdom にレイアウトを補う土台である。
 */
function stubLayout(size = 400): void {
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

  class SizedResizeObserver implements ResizeObserver {
    constructor(private readonly cb: ResizeObserverCallback) {}
    observe(target: Element): void {
      const entry = {
        target,
        contentRect: { height: size, width: size } as DOMRectReadOnly,
        borderBoxSize: [{ blockSize: size, inlineSize: size }],
        contentBoxSize: [{ blockSize: size, inlineSize: size }],
        devicePixelContentBoxSize: [{ blockSize: size, inlineSize: size }]
      } as unknown as ResizeObserverEntry
      this.cb([entry], this)
    }
    unobserve(): void {
      // 観測しない (固定サイズを一度通知するだけ)
    }
    disconnect(): void {
      // 同上
    }
  }
  vi.stubGlobal('ResizeObserver', SizedResizeObserver)
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('transcript の仮想化', () => {
  it('同時マウント DOM ノード数が総件数に依存しない (SC-003)', () => {
    stubLayout()

    view.messages = build(200)
    const small = render(<ChatScreen />)
    const smallRows = mountedRows(small.container)
    small.unmount()

    view.messages = build(3000)
    const large = render(<ChatScreen />)
    const largeRows = mountedRows(large.container)
    large.unmount()

    // 描画された行が実在し、かつ総件数 (15 倍) が変わってもマウント数は同じ。
    expect(smallRows).toBeGreaterThan(0)
    expect(largeRows).toBe(smallRows)
    // 3000 件でも一定の窓しか載らない (総件数に比例しない)。
    expect(largeRows).toBeLessThan(100)
  })

  it('閾値以下は非仮想パス / 超過は仮想パスに切り替わる (FE-042)', () => {
    view.messages = build(5)
    const nonVirtual = render(<ChatScreen />)
    expect(nonVirtual.container.querySelector('[data-virtualized="true"]')).toBeNull()
    nonVirtual.unmount()

    view.messages = build(200)
    const virtual = render(<ChatScreen />)
    expect(virtual.container.querySelector('[data-virtualized="true"]')).not.toBeNull()
    virtual.unmount()
  })
})
