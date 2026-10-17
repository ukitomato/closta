import { describe, expect, it, vi } from 'vitest'

import { createCenterConversationStore, type CenterConversation } from './center-conversation'

const value = (conversationKey: string): CenterConversation => ({
  conversationKey,
  messages: [],
  turns: [],
  navigateTo: () => {}
})

describe('中央の会話の公開口 (O-9 FE-021)', () => {
  it('publish / subscribe / current', () => {
    const store = createCenterConversationStore()
    const listener = vi.fn()
    store.subscribe(listener)
    expect(store.current()).toBeNull()
    const a = value('a')
    store.publish(a)
    expect(store.current()).toBe(a)
    expect(listener).toHaveBeenCalledTimes(1)
    store.publish(a)
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('購読を解除すると通知されない', () => {
    const store = createCenterConversationStore()
    const listener = vi.fn()
    const off = store.subscribe(listener)
    off()
    store.publish(value('a'))
    expect(listener).not.toHaveBeenCalled()
  })

  it('古い provider の clear が新しい publish を消さない (切り替えの順。RK-09)', () => {
    const store = createCenterConversationStore()
    store.publish(value('old'))
    const next = value('new')
    store.publish(next)
    store.clear('old')
    expect(store.current()).toBe(next)
    store.clear('new')
    expect(store.current()).toBeNull()
  })
})
