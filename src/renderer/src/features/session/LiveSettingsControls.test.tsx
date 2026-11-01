import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'

import type { SelectablePermissionMode } from '@domain/session/launch-config'
import type { LiveSettingRow } from '@domain/session/live-settings'
import type { PermissionModeKey } from '@domain/session/meter'

import { RunningSessionStoreContext } from '@/features/session/running-session-context'
import { createRunningSessionStore } from '@/features/session/running-session-store'
import { LIVE_SETTING_LABELS } from '@/features/session/labels'
import { installCapability, stubCapability } from '@/test-support/capability'

import { CenterHeader, type CenterHeaderLive } from '@/features/shell/CenterHeader'
import { LiveSettingsControls } from './LiveSettingsControls'

/**
 * 023 FE-011 — ヘッダの権限モードの選択 (spec US-1 AC1 / AC2 / AC4 / AC5 / Edge Cases。SC-005 の権限モードの部分)。
 */

const A = '11111111-1111-4111-8111-111111111111'
const AXE_RULES = { rules: { 'color-contrast': { enabled: false } } }

const READY: LiveSettingRow = {
  state: 'done',
  claudeAlive: true,
  hasConversation: true,
  changing: false
}

const select = (): HTMLSelectElement => screen.getByRole('combobox', { name: '権限モード' })
const optionValues = (): string[] =>
  Array.from(select().querySelectorAll('option')).map((o) => o.value)

function renderControls(over: { mode?: PermissionModeKey; row?: Partial<LiveSettingRow> } = {}): {
  onSelect: ReturnType<typeof vi.fn>
  container: HTMLElement
} {
  const onSelect = vi.fn<(mode: SelectablePermissionMode) => void>()
  const utils = render(
    <LiveSettingsControls
      permissionMode={over.mode ?? 'default'}
      row={{ ...READY, ...over.row }}
      onSelectPermissionMode={onSelect}
    />
  )
  return { onSelect, container: utils.container }
}

describe('LiveSettingsControls (権限モード)', () => {
  it('選択肢は許可の 4 値 (026 で auto が加わる) で、今の値が選ばれている。axe 違反 0', async () => {
    const { container } = renderControls({ mode: 'plan' })
    expect(optionValues()).toEqual(['default', 'plan', 'dontAsk', 'auto'])
    expect(select().value).toBe('plan')
    expect((await axe(container, AXE_RULES)).violations).toEqual([])
  })

  it('今の値が安全 3 値の外なら先頭に選べない項目として出す', () => {
    renderControls({ mode: 'bypassPermissions' })
    const options = Array.from(select().querySelectorAll('option'))
    expect(options).toHaveLength(5)
    expect(options[0]?.value).toBe('bypassPermissions')
    expect(options[0]).toBeDisabled()
    expect(select().value).toBe('bypassPermissions')
  })

  it('選ぶと操作が 1 回呼ばれる', async () => {
    const { onSelect } = renderControls()
    await userEvent.selectOptions(select(), 'plan')
    expect(onSelect).toHaveBeenCalledExactlyOnceWith('plan')
  })

  it('changing の間は押せない (aria-disabled と理由。操作は呼ばれない)', async () => {
    const { onSelect } = renderControls({ row: { changing: true } })
    expect(select()).toHaveAttribute('aria-disabled', 'true')
    expect(select()).toHaveAccessibleDescription(LIVE_SETTING_LABELS.blocker.busy)
    await userEvent.selectOptions(select(), 'plan')
    expect(onSelect).not.toHaveBeenCalled()
  })

  it.each([
    ['idle', {}, 'not-running'],
    ['error', {}, 'not-running'],
    ['launching', {}, 'not-ready'],
    ['done', { claudeAlive: false }, 'not-running']
  ] as const)('%s で押せない形と理由の文言', (state, extra, blocker) => {
    renderControls({ row: { state, ...extra } })
    expect(select()).toHaveAttribute('aria-disabled', 'true')
    expect(select()).toHaveAccessibleDescription(LIVE_SETTING_LABELS.blocker[blocker])
  })

  it('押せない状態は見た目が変わり (aria-disabled の class)、理由が見える文字で出る (pr-gate R1 H-001)', () => {
    renderControls({ row: { changing: true } })
    expect(select().className).toContain('aria-disabled:opacity-50')
    expect(select().className).toContain('aria-disabled:cursor-not-allowed')
    const reason = screen.getByText(LIVE_SETTING_LABELS.blocker.busy)
    expect(reason.className).not.toContain('sr-only')
  })

  // jsdom は矢印キーで select を変えない。ブラウザの「keydown → change」の順を再現する。
  function arrow(value: string): void {
    fireEvent.keyDown(select(), { key: 'ArrowDown' })
    fireEvent.change(select(), { target: { value } })
  }

  it('矢印キーで通過した値は確定せず、blur で最後の値を 1 回だけ確定する (pr-gate R1 H-003)', () => {
    const { onSelect } = renderControls()
    select().focus()
    arrow('plan')
    arrow('dontAsk')
    expect(onSelect).not.toHaveBeenCalled()
    expect(select().value).toBe('dontAsk')
    fireEvent.blur(select())
    expect(onSelect).toHaveBeenCalledExactlyOnceWith('dontAsk')
  })

  it('矢印キーの後の Enter で確定する', () => {
    const { onSelect } = renderControls()
    select().focus()
    arrow('plan')
    expect(onSelect).not.toHaveBeenCalled()
    fireEvent.keyDown(select(), { key: 'Enter' })
    expect(onSelect).toHaveBeenCalledExactlyOnceWith('plan')
  })

  it.each(['running', 'awaiting_permission', 'interrupted', 'done'] as const)(
    '%s では受け付ける',
    (state) => {
      renderControls({ row: { state } })
      expect(select()).not.toHaveAttribute('aria-disabled')
    }
  )
})

describe('CenterHeader の権限モード (meters・失敗の 1 行)', () => {
  function live(over: Partial<CenterHeaderLive> = {}): CenterHeaderLive {
    return {
      sessionId: A,
      runtimeId: 'wsl:Ubuntu',
      modelId: null,
      terminal: false,
      settingRow: READY,
      settingError: null,
      currentModelId: null,
      name: null,
      onRename: async () => true,
      ...over
    }
  }

  beforeEach(() => {
    installCapability()
  })

  function renderHeader(l: CenterHeaderLive): {
    store: ReturnType<typeof createRunningSessionStore>
    container: HTMLElement
    rerender: (next: CenterHeaderLive) => void
  } {
    const store = createRunningSessionStore(() => stubCapability())
    const tree = (props: CenterHeaderLive): React.JSX.Element => (
      <RunningSessionStoreContext.Provider value={store}>
        <CenterHeader
          title="t"
          detail={null}
          status="応答待ち"
          titleTestId="session-title"
          live={props}
        />
      </RunningSessionStoreContext.Provider>
    )
    const utils = render(tree(l))
    return {
      store,
      container: utils.container,
      rerender: (next: CenterHeaderLive) => utils.rerender(tree(next))
    }
  }

  it('中央のヘッダに権限モード・モデルの選択を描かない (025 FR-001。composer の周りへ移った)', () => {
    renderHeader(live())
    expect(screen.queryByRole('combobox', { name: '権限モード' })).toBeNull()
    expect(screen.queryByRole('combobox', { name: 'モデル' })).toBeNull()
    expect(screen.getByRole('button', { name: '名前を変更' })).toBeInTheDocument()
  })

  it('失敗の 1 行がヘッダの下に出る。次の変更の開始 (settingError が null) で消える', () => {
    const { rerender } = renderHeader(live({ settingError: 'permission-mode' }))
    expect(screen.getByTestId('live-setting-error')).toHaveTextContent(
      LIVE_SETTING_LABELS.failure['permission-mode']
    )
    rerender(live({ settingError: null, settingRow: { ...READY, changing: true } }))
    expect(screen.queryByTestId('live-setting-error')).toBeNull()
  })

  it('過去の会話 (live なし) には出さない', () => {
    render(<CenterHeader title="t" detail={null} status="読み取り専用" titleTestId="past-title" />)
    expect(screen.queryByTestId('live-permission-mode')).toBeNull()
    expect(screen.queryByTestId('live-model')).toBeNull()
    expect(screen.queryByTestId('live-setting-error')).toBeNull()
  })

  describe('名前の変更 (023 FE-030)', () => {
    const renameButton = (): HTMLElement => screen.getByRole('button', { name: '名前を変更' })
    const input = (): HTMLInputElement => screen.getByRole('textbox', { name: '名前' })
    const save = (): HTMLElement => screen.getByRole('button', { name: '保存' })

    it('見出しが題を出し、ボタンで入力に変わる。初期値は今の名前。axe 違反 0', async () => {
      const { container } = renderHeader(live({ name: '調査' }))
      expect(screen.getByTestId('session-title')).toHaveTextContent('t')
      expect((await axe(container, AXE_RULES)).violations).toEqual([])
      await userEvent.click(renameButton())
      expect(input()).toHaveValue('調査')
      expect((await axe(container, AXE_RULES)).violations).toEqual([])
    })

    it('名前が無ければ初期値は空で、保存は押せない', async () => {
      renderHeader(live())
      await userEvent.click(renameButton())
      expect(input()).toHaveValue('')
      expect(save()).toBeDisabled()
    })

    it('保存で操作が trim 済みで 1 回呼ばれ、成功で見出しに戻る', async () => {
      const onRename = vi.fn(async () => true)
      renderHeader(live({ onRename }))
      await userEvent.click(renameButton())
      await userEvent.type(input(), '  新しい名前  ')
      await userEvent.click(save())
      expect(onRename).toHaveBeenCalledExactlyOnceWith('新しい名前')
      await waitFor(() => expect(screen.queryByRole('textbox')).toBeNull())
    })

    it('失敗なら入力は開いたまま (失敗の 1 行は settingError が出す)', async () => {
      const onRename = vi.fn(async () => false)
      renderHeader(live({ onRename }))
      await userEvent.click(renameButton())
      await userEvent.type(input(), 'a')
      await userEvent.click(save())
      await waitFor(() => expect(onRename).toHaveBeenCalled())
      expect(input()).toBeInTheDocument()
    })

    it('IME の変換中の Enter は保存せず、変換の後の Enter で保存する', async () => {
      const { fireEvent } = await import('@testing-library/react')
      const onRename = vi.fn(async () => true)
      renderHeader(live({ onRename }))
      await userEvent.click(renameButton())
      fireEvent.change(input(), { target: { value: 'あ' } })
      fireEvent.keyDown(input(), { key: 'Enter', isComposing: true, keyCode: 229 })
      expect(onRename).not.toHaveBeenCalled()
      fireEvent.keyDown(input(), { key: 'Enter' })
      expect(onRename).toHaveBeenCalledExactlyOnceWith('あ')
    })

    it('Escape で元の見出しに戻り、操作は呼ばれない', async () => {
      const onRename = vi.fn(async () => true)
      renderHeader(live({ onRename }))
      await userEvent.click(renameButton())
      await userEvent.type(input(), 'x{Escape}')
      expect(screen.queryByRole('textbox')).toBeNull()
      expect(onRename).not.toHaveBeenCalled()
    })

    it('規則の外 (空白だけ・101 文字・改行) では保存が押せず文言が出る', async () => {
      const { fireEvent } = await import('@testing-library/react')
      renderHeader(live())
      await userEvent.click(renameButton())
      for (const value of ['   ', 'a'.repeat(101), 'a b']) {
        fireEvent.change(input(), { target: { value } })
        expect(save()).toBeDisabled()
        expect(screen.getByText(LIVE_SETTING_LABELS.nameRule)).toBeInTheDocument()
      }
    })

    it('入力を空に戻すと保存は押せず、規則の文言が出る (US-3 AC4)。開いた直後は出さない', async () => {
      renderHeader(live())
      await userEvent.click(renameButton())
      expect(screen.queryByText(LIVE_SETTING_LABELS.nameRule)).toBeNull()
      await userEvent.type(input(), 'a')
      await userEvent.clear(input())
      expect(input()).toHaveValue('')
      expect(save()).toBeDisabled()
      expect(screen.getByText(LIVE_SETTING_LABELS.nameRule)).toBeInTheDocument()
      expect(input()).toHaveAttribute('aria-invalid', 'true')
    })

    it.each([
      ['turn-running', { state: 'running' as const }],
      ['turn-running', { state: 'awaiting_permission' as const }],
      ['no-conversation', { hasConversation: false }],
      ['not-running', { claudeAlive: false }],
      ['not-running', { state: 'error' as const }],
      ['busy', { changing: true }]
    ] as const)('%s で押せない形と理由の文言 (操作は呼ばれない)', async (blocker, over) => {
      renderHeader(live({ settingRow: { ...READY, ...over } }))
      expect(renameButton()).toHaveAttribute('aria-disabled', 'true')
      expect(renameButton()).toHaveAccessibleDescription(LIVE_SETTING_LABELS.blocker[blocker])
      await userEvent.click(renameButton())
      expect(screen.queryByRole('textbox')).toBeNull()
    })

    it.each(['done', 'interrupted'] as const)('%s では押せる', (state) => {
      renderHeader(live({ settingRow: { ...READY, state } }))
      expect(renameButton()).not.toHaveAttribute('aria-disabled')
    })

    it('過去の会話には「名前を変更」を出さない', () => {
      render(
        <CenterHeader title="t" detail={null} status="読み取り専用" titleTestId="past-title" />
      )
      expect(screen.queryByRole('button', { name: '名前を変更' })).toBeNull()
    })
  })
})
