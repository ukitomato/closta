import { describe, expect, it, vi } from 'vitest'

import type { AppendMessage } from '@assistant-ui/react'

import { DEFAULT_MAX_QUEUE_ITEMS } from './composer-queue'
import { createCappedAdapter, type QueueAdapter } from './composer-queue-adapter'

/**
 * X-2 / FR-003 / FR-004 / R2-M-001 — **積み込み時の検証 (capped adapter)**。
 * native queue は積み込み口に validation を持たないため adapter を wrap し、enqueue 時に
 * 空/空白・バイト超過 ('invalid') と件数上限 ('full') を拒否して理由を通知する (最古破棄しない)。
 */

function msg(text: string): AppendMessage {
  return { role: 'user', content: [{ type: 'text', text }] } as unknown as AppendMessage
}

/** length だけ持つ fake lane と、steer/enqueue に来たテキストを記録する fake adapter。 */
function fakeAdapter(
  itemCount = 0,
  steerCount = 0
): { base: QueueAdapter; steered: string[]; enqueued: string[] } {
  const steered: string[] = []
  const enqueued: string[] = []
  const items = Array.from({ length: itemCount }, (_, i) => ({ id: `i${i}` }))
  const steerItems = Array.from({ length: steerCount }, (_, i) => ({ id: `s${i}` }))
  const textOf = (m: AppendMessage): string =>
    m.content.map((p) => (p.type === 'text' ? p.text : '')).join('')
  const base = {
    get items() {
      return items
    },
    get steerItems() {
      return steerItems
    },
    enqueue: (m: AppendMessage) => enqueued.push(textOf(m)),
    steer: (m: AppendMessage) => steered.push(textOf(m)),
    move: () => {},
    edit: () => {},
    remove: () => {}
  } as unknown as QueueAdapter
  return { base, steered, enqueued }
}

describe('createCappedAdapter (FR-003 / FR-004 / R2-M-001)', () => {
  it('有効テキストは steer に通し onResult(ok)', () => {
    const { base, steered } = fakeAdapter()
    const onResult = vi.fn()
    createCappedAdapter(base, onResult).steer(msg('次の指示'))
    expect(steered).toEqual(['次の指示'])
    expect(onResult).toHaveBeenCalledWith('ok')
  })

  it('空/空白のみは積まず onResult(invalid) (enqueue 時に弾く = dispatch 時の遅延失敗を作らない)', () => {
    const { base, steered } = fakeAdapter()
    const onResult = vi.fn()
    createCappedAdapter(base, onResult).steer(msg('   '))
    expect(steered).toEqual([])
    expect(onResult).toHaveBeenCalledWith('invalid')
  })

  it('件数上限到達で積まず onResult(full) (最古破棄しない)', () => {
    const { base, steered } = fakeAdapter(0, DEFAULT_MAX_QUEUE_ITEMS)
    const onResult = vi.fn()
    createCappedAdapter(base, onResult).steer(msg('溢れる入力'))
    expect(steered).toEqual([])
    expect(onResult).toHaveBeenCalledWith('full')
  })

  it('上限は両 lane 合計で判定する', () => {
    const { base, enqueued } = fakeAdapter(DEFAULT_MAX_QUEUE_ITEMS - 1, 1)
    const onResult = vi.fn()
    createCappedAdapter(base, onResult).enqueue(msg('合計で上限'))
    expect(enqueued).toEqual([])
    expect(onResult).toHaveBeenCalledWith('full')
  })

  it('上限直下では積める (境界)', () => {
    const { base, steered } = fakeAdapter(0, DEFAULT_MAX_QUEUE_ITEMS - 1)
    const onResult = vi.fn()
    createCappedAdapter(base, onResult).steer(msg('あと1件'))
    expect(steered).toEqual(['あと1件'])
    expect(onResult).toHaveBeenCalledWith('ok')
  })

  it('getter (items/steerItems) と remove は base に委譲する', () => {
    const removed: string[] = []
    const base = {
      get items() {
        return [{ id: 'a' }]
      },
      get steerItems() {
        return []
      },
      enqueue: () => {},
      steer: () => {},
      move: () => {},
      edit: () => {},
      remove: (id: string) => removed.push(id)
    } as unknown as QueueAdapter
    const capped = createCappedAdapter(base, vi.fn())
    expect(capped.items.length).toBe(1)
    capped.remove('a')
    expect(removed).toEqual(['a'])
  })
})
