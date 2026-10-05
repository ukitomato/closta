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
  it('中央に稼働中の会話を出していて、設定も起動ダイアログも開いていないときだけ選択中のもの', () => {
    const closed = { settings: { open: false }, launchOpen: false } as const
    expect(watchedIdOf({ focus: 'running', ...closed }, 'a')).toBe('a')
    expect(watchedIdOf({ focus: 'running', ...closed, settings: { open: true } }, 'a')).toBeNull()
    // 起動ダイアログはモーダルで中央を覆う (pr-gate R1 po M-003 / a11y M-002)。
    expect(watchedIdOf({ focus: 'running', ...closed, launchOpen: true }, 'a')).toBeNull()
    expect(watchedIdOf({ focus: 'past', ...closed }, 'a')).toBeNull()
    expect(watchedIdOf({ focus: 'none', ...closed }, 'a')).toBeNull()
    expect(watchedIdOf({ focus: 'running', ...closed }, null)).toBeNull()
  })
})
