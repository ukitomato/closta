import { beforeEach, describe, expect, it } from 'vitest'

import { useUiStore, watchedIdOf } from './ui'

/**
 * O-7 FE-001 — 面の状態 (data-model §1)。focus の遷移の表は `features/shell/AppShell.test.tsx` が面として確かめる。
 */

const initial = useUiStore.getState()

beforeEach(() => {
  useUiStore.setState(initial, true)
})

describe('面の状態の既定値', () => {
  it('中央は空、設定は閉じている、サイドバーは開き、右のペインは畳む', () => {
    const s = useUiStore.getState()
    expect(s.focus).toBe('none')
    expect(s.settings).toEqual({ open: false, section: 'runtimes' })
    expect(s.sidebarCollapsed).toBe(false)
    expect(s.panel).toEqual({ collapsed: true, tab: 'overview' })
    expect(s.launchOpen).toBe(false)
  })
})

describe('設定のダイアログ', () => {
  it('seedFolderDraft は初期値を積んで「作業フォルダ」で開く', () => {
    useUiStore.getState().seedFolderDraft({
      location: { kind: 'windows' },
      path: { namespace: 'host', value: 'C:\\work\\x' },
      suggestedDisplayName: 'x'
    })
    expect(useUiStore.getState().settings).toEqual({ open: true, section: 'folders' })
    expect(useUiStore.getState().folderDraftSeed?.suggestedDisplayName).toBe('x')
  })

  it('閉じても項目の id を覚え、項目を指定せずに開くとその項目で開く', () => {
    useUiStore.getState().openSettings('providers')
    useUiStore.getState().closeSettings()
    expect(useUiStore.getState().settings).toEqual({ open: false, section: 'providers' })
    useUiStore.getState().openSettings()
    expect(useUiStore.getState().settings).toEqual({ open: true, section: 'providers' })
  })
})

describe('見ているセッション (watchedIdOf)', () => {
  it('中央に稼働中の会話を出していて、設定も起動ダイアログも palette も開いていないときだけ選択中のもの', () => {
    const closed = { settings: { open: false }, launchOpen: false, paletteOpen: false } as const
    expect(watchedIdOf({ focus: 'running', ...closed }, 'a')).toBe('a')
    expect(watchedIdOf({ focus: 'running', ...closed, settings: { open: true } }, 'a')).toBeNull()
    // 起動ダイアログはモーダルで中央を覆う (pr-gate R1 po M-003 / a11y M-002)。
    expect(watchedIdOf({ focus: 'running', ...closed, launchOpen: true }, 'a')).toBeNull()
    expect(watchedIdOf({ focus: 'past', ...closed }, 'a')).toBeNull()
    expect(watchedIdOf({ focus: 'none', ...closed }, 'a')).toBeNull()
    expect(watchedIdOf({ focus: 'running', ...closed }, null)).toBeNull()
  })

  it('palette を開いている間は null (全面の overlay で中央を覆う。O-3 FR-006)', () => {
    useUiStore.setState({ focus: 'running' })
    expect(watchedIdOf(useUiStore.getState(), 'a')).toBe('a')
    useUiStore.getState().setPaletteOpen(true)
    expect(watchedIdOf(useUiStore.getState(), 'a')).toBeNull()
    useUiStore.getState().setPaletteOpen(false)
    expect(watchedIdOf(useUiStore.getState(), 'a')).toBe('a')
  })
})

describe('Command palette と会話内検索の要求 (O-3)', () => {
  it('palette は既定で閉じていて、setPaletteOpen で開閉する', () => {
    expect(useUiStore.getState().paletteOpen).toBe(false)
    useUiStore.getState().setPaletteOpen(true)
    expect(useUiStore.getState().paletteOpen).toBe(true)
    useUiStore.getState().setPaletteOpen(false)
    expect(useUiStore.getState().paletteOpen).toBe(false)
  })

  it('会話内検索の要求の値は呼ぶたびに増える (同じ要求を続けても上がる)', () => {
    const before = useUiStore.getState().conversationSearchRequest
    useUiStore.getState().requestConversationSearch()
    const once = useUiStore.getState().conversationSearchRequest
    useUiStore.getState().requestConversationSearch()
    const twice = useUiStore.getState().conversationSearchRequest
    expect(once).toBeGreaterThan(before)
    expect(twice).toBeGreaterThan(once)
  })
})
