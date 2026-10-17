import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent, { PointerEventsCheckLevel } from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'

import type { ThreadMessageLike } from '@assistant-ui/react'
import { InfoIcon } from 'lucide-react'

import type { SessionIndexDTO } from '@domain/session/dto'

import { COMPOSER_LABELS, TRANSCRIPT_DENSITY_LABELS } from '@/features/chat/labels'
import { PAST_SESSIONS_LABELS } from '@/features/session-list/labels'
import { useSessionsStore } from '@/stores/sessions'
import { useUiStore } from '@/stores/ui'
import {
  A,
  B,
  center,
  folder,
  NOW,
  pastIndex,
  pastRows,
  pastSession,
  registerAppShellHooks,
  runningRows,
  selectPast,
  selectRunning,
  setup,
  sidebar,
  UBUNTU,
  XSS,
  type Harness
} from '@/test-support/app-shell-harness'

import { OVERVIEW_LABELS, SHELL_LABELS } from './labels'
import { OverviewTab } from './OverviewTab'
import type { PanelTab } from './panel-tabs'

/*
 * 過去ログの取得 (`useTranscript`) だけを差し替える。既定は「読み込み中」(今までの `getTranscript` が解決しない形と同じ)。
 * 入れ子の provider の下で過去ログの composer が無効のままかを見るテストだけが、取得済みにする (pr-gate R1 security M-002)。
 */
const { transcript } = vi.hoisted(() => ({
  transcript: {
    messages: [] as readonly ThreadMessageLike[],
    status: 'loading' as 'idle' | 'loading' | 'ready' | 'empty' | 'failed',
    reasonKey: null,
    retry: () => {},
    hasSelection: true
  }
}))
vi.mock('@/features/chat/useTranscript', () => ({ useTranscript: () => transcript }))

/**
 * O-7 FE-014 / FE-021 / FE-031 / FE-042 — シェル (SC-001 / SC-002 / SC-004 / SC-007 / US-1〜US-4)。
 * 稼働中のストアと過去の一覧のストアは本物を使い、preload だけをスタブする。共通の setup は
 * `test-support/app-shell-harness.tsx` (O-4 FE-030)。右のペインのタブの表のテストは `RightPanel.tabs.test.tsx`。
 */

beforeEach(() => {
  transcript.messages = []
  transcript.status = 'loading'
})
registerAppShellHooks()

describe('起動直後 (US-1 AC1 / AC5 / SC-001)', () => {
  it('タブのボタンが無く、ランドマークが 1 つずつ。中央は空の状態、右は畳んだ帯、稼働中は 0 件の文言', async () => {
    await setup()
    for (const old of ['ランタイム', 'セッション起動', '会話 (準備中)', '組み合わせ']) {
      expect(screen.queryByRole('button', { name: old })).toBeNull()
    }
    expect(screen.getAllByRole('navigation')).toHaveLength(1)
    expect(screen.getAllByRole('main')).toHaveLength(1)
    expect(screen.getAllByRole('complementary', { name: SHELL_LABELS.panelLabel })).toHaveLength(1)
    expect(screen.getByTestId('center-empty')).toHaveTextContent(SHELL_LABELS.centerEmpty)
    expect(screen.getByTestId('right-panel')).toHaveAttribute('data-collapsed', 'true')
    expect(screen.getByTestId('session-list-empty')).toHaveTextContent(
      '稼働中のセッションはありません。'
    )
    // サイドバーの「新規起動」と中央の空の状態のボタンは文言を分ける (E2E の locator がぶつからない)。
    expect(within(sidebar()).getByRole('button', { name: SHELL_LABELS.newSession })).toBeEnabled()
    expect(
      within(center()).getByRole('button', { name: SHELL_LABELS.centerEmptyLaunch })
    ).toBeEnabled()
  })

  it('作業フォルダが未登録なら中央の見出しが状態を言い、「作業フォルダを登録する」が主な操作で、押すと設定が作業フォルダで開く', async () => {
    await setup({
      folders: [],
      index: { groups: [], outcomes: [], fetchedAt: NOW, complete: true }
    })
    const button = await within(center()).findByRole('button', {
      name: SHELL_LABELS.centerEmptyFolders
    })
    expect(center()).toHaveTextContent(SHELL_LABELS.centerEmptyNoFolders)
    await userEvent.click(button)
    expect(useUiStore.getState().settings).toEqual({ open: true, section: 'folders' })
  })

  it('vitest-axe の違反 0', async () => {
    const h = await setup({ ids: [A] })
    await pastRows()
    const results = await axe(h.container, { rules: { 'color-contrast': { enabled: false } } })
    expect(results.violations).toEqual([])
  })
})

describe('中央の切り替えと稼働中の状態の保持 (US-1 AC2〜AC4 / SC-002 / FR-004)', () => {
  it('稼働中の行で実行中の Chat、過去の行で transcript。戻ると稼働中の会話が同じ thread のまま保たれる', async () => {
    const h = await setup({ ids: [A] })
    act(() => h.store.setDraft(A, '書きかけ'))
    await selectRunning(0)
    expect(center()).toHaveAttribute('data-focus', 'running')
    expect(await within(center()).findByTestId('session-title')).toHaveTextContent('案件フォルダ')
    h.emit(A, {
      kind: 'message',
      message: {
        id: 'm1',
        role: 'assistant',
        parts: [{ type: 'text', text: '応答 1' }],
        createdAt: 1
      }
    })
    await within(center()).findByText('応答 1')

    await selectPast(0)
    expect(center()).toHaveAttribute('data-focus', 'past')
    expect(within(center()).getByTestId('past-title')).toHaveTextContent('過去の作業')
    expect(within(center()).queryByTestId('session-title')).toBeNull()

    await selectRunning(0)
    expect(center()).toHaveAttribute('data-focus', 'running')
    expect(await within(center()).findByText('応答 1')).toBeInTheDocument()
    expect(h.store.getDraft(A)).toBe('書きかけ')
    expect(h.store.getState().sessions[A]?.messages).toHaveLength(1)
    // 同じ id を選び直しても中央が移る (selectionSeq)。
    await selectPast(0)
    act(() => h.store.select(A))
    expect(center()).toHaveAttribute('data-focus', 'running')
  })

  it('focus の側の行だけを強調する (もう片方の選択は保つ)', async () => {
    const h = await setup({ ids: [A] })
    await selectRunning(0)
    await selectPast(0)
    const runningTrigger = within(runningRows()[0]!).getAllByRole('button')[0]!
    const pastTrigger = within((await pastRows())[0]!).getAllByRole('button')[0]!
    expect(pastTrigger).toHaveAttribute('aria-current', 'true')
    expect(runningTrigger).not.toHaveAttribute('aria-current')
    expect(h.store.getState().selectedId).toBe(A)
    await selectRunning(0)
    expect(within(runningRows()[0]!).getAllByRole('button')[0]).toHaveAttribute(
      'aria-current',
      'true'
    )
    expect(within((await pastRows())[0]!).getAllByRole('button')[0]).not.toHaveAttribute(
      'aria-current'
    )
  })

  it('表示中の稼働中のセッションを閉じると中央は空の状態に戻る', async () => {
    const h = await setup({ ids: [A] })
    await selectRunning(0)
    h.push([{ sessionId: A, state: 'done', reasonKey: null, claudeAlive: false }])
    act(() => h.store.close(A))
    expect(center()).toHaveAttribute('data-focus', 'none')
    expect(screen.getByTestId('center-empty')).toBeInTheDocument()
  })

  it('一覧の再取得で表示中の過去の行が消えると中央は空の状態に戻る', async () => {
    await setup()
    await selectPast(0)
    act(() => useSessionsStore.getState().setIndex(pastIndex([])))
    expect(center()).toHaveAttribute('data-focus', 'none')
  })

  it('中央のヘッダの題に HTML が含まれても要素にならない (US-4 AC5)', async () => {
    await setup({ index: pastIndex([pastSession({ summary: XSS })]) })
    await selectPast(0)
    const header = within(center()).getByTestId('center-header')
    expect(header.querySelector('img')).toBeNull()
    expect(header).toHaveTextContent(XSS)
    expect((window as { __pwned?: unknown }).__pwned).toBeUndefined()
  })

  it('transcript の密度の切り替えは中央のヘッダに 1 つだけあり、稼働中でも過去でも押すと密度が変わる (O-2 FR-012 の本番の経路)', async () => {
    const h = await setup({ ids: [A] })
    const toggleIn = (): HTMLElement => {
      const groups = within(center()).getAllByRole('group', {
        name: TRANSCRIPT_DENSITY_LABELS.group
      })
      expect(groups).toHaveLength(1)
      expect(within(center()).getByTestId('center-header')).toContainElement(groups[0]!)
      return groups[0]!
    }

    await selectPast(0)
    await userEvent.click(
      within(toggleIn()).getByRole('button', { name: TRANSCRIPT_DENSITY_LABELS.compact })
    )
    expect(useUiStore.getState().transcriptDensity).toBe('compact')

    await selectRunning(0)
    expect(h.store.getState().selectedId).toBe(A)
    const running = toggleIn()
    expect(
      within(running).getByRole('button', { name: TRANSCRIPT_DENSITY_LABELS.compact })
    ).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(
      within(running).getByRole('button', { name: TRANSCRIPT_DENSITY_LABELS.comfortable })
    )
    expect(useUiStore.getState().transcriptDensity).toBe('comfortable')
  })
})

describe('承認待ちの印と読み上げ (US-1 AC6 / AC7 / FR-006)', () => {
  it('過去の会話を表示中でも件数の印と読み上げが出て、件数のボタンで中央が承認待ちのセッションに移る', async () => {
    const h = await setup({ ids: [A] })
    await selectRunning(0)
    await selectPast(0)
    h.emit(A, { kind: 'state', state: 'awaiting_permission' })
    expect(await within(sidebar()).findByTestId('session-nav-awaiting')).toHaveTextContent(
      '承認待ち 1 件'
    )
    expect(screen.getByTestId('session-announcer')).toHaveTextContent(
      '案件フォルダ: 承認待ちになりました。'
    )
    // 見ていないので、選択中の A も移動先になる (watchedId は null)。
    await userEvent.click(within(sidebar()).getByTestId('awaiting-count'))
    expect(center()).toHaveAttribute('data-focus', 'running')
    expect(h.store.getState().selectedId).toBe(A)
  })

  it('設定のダイアログを開いている間も読み上げる (ダイアログは閉じない)', async () => {
    const h = await setup({ ids: [A] })
    await selectRunning(0)
    await userEvent.click(within(sidebar()).getByRole('button', { name: SHELL_LABELS.settings }))
    h.emit(A, { kind: 'state', state: 'awaiting_permission' })
    expect(screen.getByTestId('session-announcer')).toHaveTextContent(
      '案件フォルダ: 承認待ちになりました。'
    )
    expect(screen.getByTestId('settings-dialog')).toBeInTheDocument()
  })
})

describe('サイドバーの畳み (US-1 AC8) と 1 回の操作で届く入口 (SC-007)', () => {
  it('畳むと帯 (新規起動・件数の印・設定) になり、開くと戻る', async () => {
    await setup()
    await userEvent.click(
      within(sidebar()).getByRole('button', { name: SHELL_LABELS.collapseSidebar })
    )
    expect(sidebar()).toHaveAttribute('data-collapsed', 'true')
    expect(
      within(sidebar()).getByRole('button', { name: SHELL_LABELS.newSession })
    ).toBeInTheDocument()
    expect(
      within(sidebar()).getByRole('button', { name: SHELL_LABELS.settings })
    ).toBeInTheDocument()
    // 開いたときの中身は外さずに隠す (pr-gate R2 ux M-103)。
    expect(screen.getByTestId('past-sessions')).not.toBeVisible()
    await userEvent.click(
      within(sidebar()).getByRole('button', { name: SHELL_LABELS.expandSidebar })
    )
    expect(sidebar()).toHaveAttribute('data-collapsed', 'false')
  })

  it('起動ダイアログと設定に 1 回の押下で届く', async () => {
    await setup()
    await userEvent.click(within(sidebar()).getByRole('button', { name: SHELL_LABELS.newSession }))
    expect(await screen.findByTestId('launch-dialog-host')).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByTestId('launch-dialog-host')).toBeNull())
    await userEvent.click(within(sidebar()).getByRole('button', { name: SHELL_LABELS.settings }))
    expect(await screen.findByTestId('settings-dialog')).toBeInTheDocument()
  })
})

describe('起動ダイアログ (US-2 AC1〜AC5 / FR-007)', () => {
  it('過去の会話を表示中に開いて閉じると、元の会話のまま', async () => {
    await setup()
    await selectPast(0)
    await userEvent.click(within(sidebar()).getByRole('button', { name: SHELL_LABELS.newSession }))
    await screen.findByTestId('launch-dialog-host')
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByTestId('launch-dialog-host')).toBeNull())
    expect(center()).toHaveAttribute('data-focus', 'past')
  })

  it('起動の受け付けでダイアログが閉じ、そのセッションが稼働中の行になって中央に出る', async () => {
    const h = await setup({ ids: [] })
    await userEvent.click(within(sidebar()).getByRole('button', { name: SHELL_LABELS.newSession }))
    await screen.findByTestId('launch-dialog-host')
    h.launchMock.mockResolvedValueOnce({ status: 'launching', sessionId: B })
    await act(() =>
      h.store.launch({
        folderId: 'folder-1',
        runtimeId: UBUNTU.id,
        providerId: null,
        modelId: null,
        effort: null,
        permissionMode: 'default'
      })
    )
    await waitFor(() => expect(screen.queryByTestId('launch-dialog-host')).toBeNull())
    expect(center()).toHaveAttribute('data-focus', 'running')
    expect(runningRows()).toHaveLength(1)
  })

  it('起動中は Esc で閉じられない', async () => {
    const h = await setup()
    await userEvent.click(within(sidebar()).getByRole('button', { name: SHELL_LABELS.newSession }))
    await screen.findByTestId('launch-dialog-host')
    // 起動中の読み上げは、開いている間ずっとある live region の中身を替えて出す (pr-gate R3 a11y L-004)。
    expect(screen.getByTestId('launch-status')).toHaveTextContent('')
    act(() => h.store.setState((s) => ({ launch: { ...s.launch, phase: 'launching' } })))
    expect(await screen.findByTestId('session-launching')).toBeInTheDocument()
    expect(screen.getByTestId('launch-status')).toHaveTextContent(SHELL_LABELS.launching)
    await userEvent.keyboard('{Escape}')
    expect(screen.getByTestId('launch-dialog-host')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: SHELL_LABELS.close })).toBeNull()
  })

  it('失敗したセッションを「閉じて起動し直す」と、ダイアログが前回の設定と理由つきで開く (X-4 US-1 AC7)', async () => {
    const h = await setup({ ids: [A] })
    await selectRunning(0)
    h.emit(A, { kind: 'failure', reasonKey: 'provider-error' })
    h.push([{ sessionId: A, state: 'error', reasonKey: 'provider-error', claudeAlive: false }])
    await userEvent.click(await within(center()).findByRole('button', { name: '閉じて起動し直す' }))
    expect(await screen.findByTestId('launch-dialog-host')).toBeInTheDocument()
    expect(h.store.getState().launch.previousFailure).toBe('provider-error')
    expect(center()).toHaveAttribute('data-focus', 'none')
  })
})

describe('設定のダイアログ (US-3 AC1〜AC4 / FR-008 / FR-009 / SC-004)', () => {
  it('左に 4 項目とテーマ、右に選んだ項目の画面。Esc で閉じて「設定」のボタンにフォーカスが戻り、中の画面は外れる', async () => {
    await setup()
    const opener = within(sidebar()).getByRole('button', { name: SHELL_LABELS.settings })
    await userEvent.click(opener)
    const dialog = await screen.findByTestId('settings-dialog')
    const nav = within(dialog).getByRole('navigation', { name: SHELL_LABELS.settingsNav })
    expect(
      within(nav)
        .getAllByRole('button')
        .map((b) => b.textContent)
    ).toEqual(['ランタイム', '作業フォルダ', 'Provider', '組み合わせ'])
    expect(within(dialog).getByText(SHELL_LABELS.theme)).toBeInTheDocument()
    await userEvent.click(within(nav).getByRole('button', { name: 'Provider' }))
    expect(within(dialog).getByTestId('settings-section')).toHaveAttribute(
      'data-section',
      'providers'
    )
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByTestId('settings-dialog')).toBeNull())
    expect(screen.queryByTestId('settings-section')).toBeNull()
    expect(opener).toHaveFocus()
    // 覚えるのは項目の id だけ。
    expect(useUiStore.getState().settings).toEqual({ open: false, section: 'providers' })
  })

  it('一覧の「登録」(seedFolderDraft) で「作業フォルダ」の項目が初期値つきで開き、閉じると押したボタンにフォーカスが戻る', async () => {
    const index: SessionIndexDTO = {
      groups: [
        {
          kind: 'unregistered',
          cwdKey: 'k1',
          location: { kind: 'wsl', distroName: 'Ubuntu' },
          cwd: { namespace: 'wsl:Ubuntu', value: '/home/u/other' },
          cwdDisplay: null,
          suggestedDisplayName: 'other',
          sessions: [pastSession()]
        }
      ],
      outcomes: pastIndex().outcomes,
      fetchedAt: NOW,
      complete: true
    }
    await setup({ index })
    const register = await within(screen.getByTestId('past-sessions')).findByRole('button', {
      name: '作業フォルダとして登録'
    })
    await userEvent.click(register)
    const dialog = await screen.findByTestId('settings-dialog')
    expect(within(dialog).getByTestId('settings-section')).toHaveAttribute(
      'data-section',
      'folders'
    )
    expect(useUiStore.getState().folderDraftSeed?.suggestedDisplayName).toBe('other')
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByTestId('settings-dialog')).toBeNull())
    expect(register).toHaveFocus()
  })
})

describe('右のペイン (US-4 AC1〜AC5 / FR-014 / FR-015)', () => {
  it('開くと「概要」に稼働中の項目が出る。畳むと帯に戻る', async () => {
    await setup({ ids: [A] })
    await selectRunning(0)
    await userEvent.click(screen.getByRole('button', { name: SHELL_LABELS.expandPanel }))
    const panel = screen.getByTestId('right-panel')
    expect(within(panel).getByRole('tab', { name: SHELL_LABELS.overviewTab })).toHaveAttribute(
      'aria-selected',
      'true'
    )
    const overview = await within(panel).findByTestId('overview')
    expect(overview).toHaveTextContent('Provider')
    expect(overview).toHaveTextContent('既定')
    expect(overview).toHaveTextContent('通常 (操作ごとに承認)')
    expect(overview).toHaveTextContent('Ubuntu')
    await userEvent.click(within(panel).getByRole('button', { name: SHELL_LABELS.collapsePanel }))
    expect(screen.getByTestId('right-panel')).toHaveAttribute('data-collapsed', 'true')
  })

  it('「会話の地図」のタブは中央の会話のターンを出し、中央を切り替えると公開口の会話が替わる (O-9 FE-021 / FE-022)', async () => {
    transcript.messages = [
      { role: 'user', id: 'past-u1', content: [{ type: 'text', text: '過去の質問' }] }
    ]
    transcript.status = 'ready'
    // jsdom にレイアウトは無い。仮想化の窓 (行が載る高さ) だけ、観測の時に固定の大きさを通知する RO で補う。
    class SizedResizeObserver implements ResizeObserver {
      constructor(private readonly cb: ResizeObserverCallback) {}
      observe(target: Element): void {
        const box = [{ blockSize: 400, inlineSize: 300 }]
        this.cb(
          [
            {
              target,
              contentRect: { height: 400, width: 300 } as DOMRectReadOnly,
              borderBoxSize: box,
              contentBoxSize: box,
              devicePixelContentBoxSize: box
            } as unknown as ResizeObserverEntry
          ],
          this
        )
      }
      unobserve(): void {
        // 固定の大きさ
      }
      disconnect(): void {
        // 同上
      }
    }
    const h = await setup({ ids: [A] })
    await selectRunning(0)
    await userEvent.click(screen.getByRole('button', { name: SHELL_LABELS.expandPanel }))
    const panel = screen.getByTestId('right-panel')
    await userEvent.click(within(panel).getByRole('tab', { name: SHELL_LABELS.conversationMapTab }))
    // 地図の一覧が出る前に補う (サイドバーの一覧には掛けない)。
    const originalObserver = globalThis.ResizeObserver
    vi.stubGlobal('ResizeObserver', SizedResizeObserver)
    h.emit(A, {
      kind: 'message',
      message: {
        id: 'u1',
        role: 'user',
        parts: [{ type: 'text', text: '稼働中の質問' }],
        createdAt: 1_760_000_000_000
      }
    })
    expect(await within(panel).findByText('稼働中の質問')).toBeInTheDocument()
    vi.stubGlobal('ResizeObserver', originalObserver)

    await selectPast(0)
    expect(await within(panel).findByText('過去の質問')).toBeInTheDocument()
    expect(within(panel).queryByText('稼働中の質問')).toBeNull()
  })

  it('過去の行では登録フォルダの配下でもフォルダと所在が出る。値の無い項目は出さない', async () => {
    await setup({ index: pastIndex([pastSession({ gitBranch: null })]) })
    await selectPast(0)
    await userEvent.click(screen.getByRole('button', { name: SHELL_LABELS.expandPanel }))
    const overview = await within(screen.getByTestId('right-panel')).findByTestId('overview')
    expect(overview).toHaveTextContent('フォルダ')
    expect(overview).toHaveTextContent('案件フォルダ')
    expect(overview).toHaveTextContent('所在')
    expect(overview).toHaveTextContent('Ubuntu')
    expect(overview).not.toHaveTextContent('ブランチ')
  })

  it('ブランチ名・フォルダ名の HTML は要素にならない', async () => {
    await setup({
      folders: [folder(XSS)],
      index: pastIndex([pastSession({ gitBranch: XSS })])
    })
    await selectPast(0)
    await userEvent.click(screen.getByRole('button', { name: SHELL_LABELS.expandPanel }))
    const panel = screen.getByTestId('right-panel')
    await within(panel).findByTestId('overview')
    await waitFor(() => expect(panel).toHaveTextContent(XSS))
    expect(panel.querySelector('img')).toBeNull()
    expect(document.querySelector('img[src="x"]')).toBeNull()
  })

  it('未選択は空の状態', async () => {
    await setup()
    await userEvent.click(screen.getByRole('button', { name: SHELL_LABELS.expandPanel }))
    expect(
      within(screen.getByTestId('right-panel')).getByTestId('overview-empty')
    ).toHaveTextContent(SHELL_LABELS.overviewEmpty)
  })

  it('選んでいたタブが出せなくなったら最初のタブに戻る', async () => {
    const pastOnly: PanelTab = {
      id: 'past-only' as PanelTab['id'],
      label: '過去だけ',
      icon: InfoIcon,
      availableFor: ['past'],
      Content: () => <p>過去だけの中身</p>
    }
    const overview: PanelTab = {
      id: 'overview',
      label: SHELL_LABELS.overviewTab,
      icon: InfoIcon,
      availableFor: ['none', 'running', 'past'],
      Content: OverviewTab
    }
    await setup({ ids: [A], panelTabs: [overview, pastOnly] })
    await selectPast(0)
    await userEvent.click(screen.getByRole('button', { name: SHELL_LABELS.expandPanel }))
    await userEvent.click(screen.getByRole('tab', { name: '過去だけ' }))
    expect(screen.getByText('過去だけの中身')).toBeInTheDocument()
    await selectRunning(0)
    expect(screen.queryByRole('tab', { name: '過去だけ' })).toBeNull()
    expect(screen.getByRole('tab', { name: SHELL_LABELS.overviewTab })).toHaveAttribute(
      'aria-selected',
      'true'
    )
  })

  it('狭くなると右 → 左の順に 1 回だけ自動で畳み、利用者が開いたら開く', async () => {
    let callback: ((entries: { contentRect: { width: number } }[]) => void) | null = null
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(cb: typeof callback) {
          callback = cb
        }
        observe(): void {
          // 幅は callback を直接呼んで与える。
        }
        disconnect(): void {
          // 何も持たない。
        }
      }
    )
    useUiStore.setState({ panel: { collapsed: false, tab: 'overview' } })
    await setup()
    const resize = (width: number): void => act(() => callback?.([{ contentRect: { width } }]))
    resize(1100) // 280 + 320 + 480 = 1080 以上
    expect(useUiStore.getState().panel.collapsed).toBe(false)
    resize(1000) // 閾値を割った瞬間: 右を畳む (畳んだ後の閾値 800 を割っていないので左は開いたまま)
    expect(useUiStore.getState().panel.collapsed).toBe(true)
    expect(useUiStore.getState().sidebarCollapsed).toBe(false)
    act(() => useUiStore.getState().setPanelCollapsed(false)) // 利用者が開く
    resize(990) // まだ閾値の下 (割った瞬間ではない) なので畳まない
    expect(useUiStore.getState().panel.collapsed).toBe(false)
    resize(1200)
    resize(700) // 割った瞬間: 右を畳み、それでも 800 を割るので左も畳む
    expect(useUiStore.getState().panel.collapsed).toBe(true)
    expect(useUiStore.getState().sidebarCollapsed).toBe(true)
    resize(1400) // 幅が戻っても自動では開かない
    expect(useUiStore.getState().sidebarCollapsed).toBe(true)
  })
})

function stubResizeObserver(): (width: number) => void {
  let callback: ((entries: { contentRect: { width: number } }[]) => void) | null = null
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(cb: typeof callback) {
        callback = cb
      }
      observe(): void {
        // 幅は callback を直接呼んで与える。
      }
      disconnect(): void {
        // 何も持たない。
      }
    }
  )
  return (width) => act(() => callback?.([{ contentRect: { width } }]))
}

const unregisteredIndex = (): SessionIndexDTO => ({
  groups: [
    {
      kind: 'unregistered',
      cwdKey: 'k1',
      location: { kind: 'wsl', distroName: 'Ubuntu' },
      cwd: { namespace: 'wsl:Ubuntu', value: '/home/u/other' },
      cwdDisplay: null,
      suggestedDisplayName: 'other',
      sessions: [pastSession()]
    }
  ],
  outcomes: pastIndex().outcomes,
  fetchedAt: NOW,
  complete: true
})

describe('pr-gate R1 の負の経路 (O-7)', () => {
  it('過去の会話を読んでいる間に、失敗したセッションをサイドバーの行の「閉じる」で閉じても、中央は過去のままで起動ダイアログは開かない (po H-001)', async () => {
    const h = await setup({ ids: [A] })
    await selectRunning(0)
    h.emit(A, { kind: 'failure', reasonKey: 'provider-error' })
    h.push([{ sessionId: A, state: 'error', reasonKey: 'provider-error', claudeAlive: false }])
    await selectPast(0)
    await userEvent.click(within(runningRows()[0]!).getByRole('button', { name: '閉じる' }))
    expect(center()).toHaveAttribute('data-focus', 'past')
    expect(screen.queryByTestId('launch-dialog-host')).toBeNull()
    // 失敗の告知は古くなるので消す (次に開いたときに出さない)。前回の設定は残す。
    expect(h.store.getState().launch.previousFailure).toBeNull()
    expect(h.store.getState().launch.lastConfig).not.toBeNull()
  })

  it('拒否の後に起動ダイアログを閉じて開き直すと、古い拒否の告知は出ない (po M-001 / ux M-004)', async () => {
    const h = await setup()
    await userEvent.click(within(sidebar()).getByRole('button', { name: SHELL_LABELS.newSession }))
    const host = await screen.findByTestId('launch-dialog-host')
    act(() =>
      h.store.setState((s) => ({
        launch: { ...s.launch, phase: 'rejected', rejectReason: 'session-limit' }
      }))
    )
    expect(await within(host).findByText(/同時に動かせるセッションは/)).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByTestId('launch-dialog-host')).toBeNull())
    expect(h.store.getState().launch).toMatchObject({ phase: 'entry', rejectReason: null })
    await userEvent.click(within(sidebar()).getByRole('button', { name: SHELL_LABELS.newSession }))
    const reopened = await screen.findByTestId('launch-dialog-host')
    expect(within(reopened).queryByText(/同時に動かせるセッションは/)).toBeNull()
  })

  it('起動ダイアログを開いている間も、見ていたセッションの承認待ちを読み上げる (po M-003 / a11y M-002)', async () => {
    const h = await setup({ ids: [A] })
    await selectRunning(0)
    await userEvent.click(within(sidebar()).getByRole('button', { name: SHELL_LABELS.newSession }))
    await screen.findByTestId('launch-dialog-host')
    h.emit(A, { kind: 'state', state: 'awaiting_permission' })
    expect(screen.getByTestId('session-announcer')).toHaveTextContent(
      '案件フォルダ: 承認待ちになりました。'
    )
  })

  it('設定のダイアログの中にも承認待ちの件数の印が出る (ux H-001)', async () => {
    const h = await setup({ ids: [A] })
    await userEvent.click(within(sidebar()).getByRole('button', { name: SHELL_LABELS.settings }))
    const dialog = await screen.findByTestId('settings-dialog')
    h.emit(A, { kind: 'state', state: 'awaiting_permission' })
    expect(await within(dialog).findByTestId('session-nav-awaiting')).toHaveTextContent(
      '承認待ち 1 件'
    )
    // 「設定」の題の横では何の件数か読めないので、見える語と title を添える (pr-gate R2 ux M-101)。
    const badge = within(dialog).getByTestId('session-nav-badge')
    expect(badge).toHaveTextContent('稼働中')
    expect(badge).toHaveAttribute('title', '稼働中のセッション: 承認待ち 1 件')
  })

  it('起動ダイアログを Esc で閉じると、押した「新規起動」にフォーカスが戻る (a11y H-001)', async () => {
    await setup()
    const opener = within(sidebar()).getByRole('button', { name: SHELL_LABELS.newSession })
    await userEvent.click(opener)
    await screen.findByTestId('launch-dialog-host')
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByTestId('launch-dialog-host')).toBeNull())
    await waitFor(() => expect(opener).toHaveFocus())
  })

  it('「閉じて起動し直す」から開いた起動ダイアログを閉じると、開いた元が消えているのでサイドバーの「新規起動」へ移る (a11y H-001)', async () => {
    const h = await setup({ ids: [A] })
    await selectRunning(0)
    h.emit(A, { kind: 'failure', reasonKey: 'provider-error' })
    h.push([{ sessionId: A, state: 'error', reasonKey: 'provider-error', claudeAlive: false }])
    await userEvent.click(await within(center()).findByRole('button', { name: '閉じて起動し直す' }))
    await screen.findByTestId('launch-dialog-host')
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByTestId('launch-dialog-host')).toBeNull())
    await waitFor(() =>
      expect(within(sidebar()).getByRole('button', { name: SHELL_LABELS.newSession })).toHaveFocus()
    )
    expect(h.store.getState().launch.previousFailure).toBeNull()
  })

  it('設定を開いた元が中の操作 (登録) で消えたら、閉じたときサイドバーの「設定」にフォーカスが移る (a11y M-003 / po M-004)', async () => {
    await setup({ index: unregisteredIndex() })
    const register = await within(screen.getByTestId('past-sessions')).findByRole('button', {
      name: '作業フォルダとして登録'
    })
    await userEvent.click(register)
    await screen.findByTestId('settings-dialog')
    // 登録されて、グループが登録フォルダに変わった (「登録」のボタンが消える)。
    act(() => useSessionsStore.getState().setIndex(pastIndex()))
    expect(register.isConnected).toBe(false)
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByTestId('settings-dialog')).toBeNull())
    await waitFor(() =>
      expect(within(sidebar()).getByRole('button', { name: SHELL_LABELS.settings })).toHaveFocus()
    )
  })

  it('Provider の秘密を入力して閉じ、開き直すと入力欄は空 (US-3 AC2 / FR-008。security L-001)', async () => {
    await setup()
    const opener = (): HTMLElement =>
      within(sidebar()).getByRole('button', { name: SHELL_LABELS.settings })
    await userEvent.click(opener())
    const dialog = await screen.findByTestId('settings-dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Provider' }))
    const typed = (await within(dialog).findByTestId('provider-secret')) as HTMLInputElement
    fireEvent.change(typed, { target: { value: 'sk-plain' } })
    // 前提: 秘密が入った (入らないまま閉じると、空の確認が黙って空振りする。pr-gate R2 security L-102)。
    expect(typed.value).toBe('sk-plain')
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByTestId('settings-dialog')).toBeNull())
    await userEvent.click(opener())
    const reopened = await screen.findByTestId('settings-dialog')
    expect(within(reopened).getByTestId('settings-section')).toHaveAttribute(
      'data-section',
      'providers'
    )
    const secret = (await within(reopened).findByTestId('provider-secret')) as HTMLInputElement
    expect(secret.value).toBe('')
  })

  it('サイドバーの開閉のボタンは同じ要素のままで、押してもフォーカスが残り aria-expanded が変わる (a11y H-002)', async () => {
    await setup()
    const toggle = within(sidebar()).getByRole('button', { name: SHELL_LABELS.collapseSidebar })
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    await userEvent.click(toggle)
    expect(toggle.isConnected).toBe(true)
    expect(toggle).toHaveFocus()
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(toggle).toHaveAccessibleName(SHELL_LABELS.expandSidebar)
  })

  it('右のペインの帯のタブのアイコンから開くと、そのタブにフォーカスが移る (a11y H-002)', async () => {
    await setup()
    const panel = screen.getByTestId('right-panel')
    await userEvent.click(within(panel).getByRole('button', { name: SHELL_LABELS.overviewTab }))
    expect(panel).toHaveAttribute('data-collapsed', 'false')
    await waitFor(() =>
      expect(within(panel).getByRole('tab', { name: SHELL_LABELS.overviewTab })).toHaveFocus()
    )
  })

  it('自動で畳んだ面の中にフォーカスがあったら開閉のボタンへ移し、右を畳んだ直後に一気に狭くなってもサイドバーを畳む (a11y H-002 / ux M-009)', async () => {
    const resize = stubResizeObserver()
    useUiStore.setState({ panel: { collapsed: false, tab: 'overview' } })
    await setup()
    resize(1100)
    const tab = screen.getByRole('tab', { name: SHELL_LABELS.overviewTab })
    act(() => tab.focus())
    resize(1000) // 右を畳む (畳んだ後の閾値 800 は割っていない)
    expect(useUiStore.getState().panel.collapsed).toBe(true)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: SHELL_LABELS.expandPanel })).toHaveFocus()
    )
    resize(700) // 畳んだ後の状態で「割った瞬間」を判定するので、サイドバーも畳む
    expect(useUiStore.getState().sidebarCollapsed).toBe(true)
  })

  it('中央に出していない側の一覧の行 (listitem) には aria-current が残らない (a11y M-001)', async () => {
    await setup({ ids: [A] })
    await selectRunning(0)
    await selectPast(0)
    expect(runningRows()[0]).not.toHaveAttribute('aria-current')
    expect((await pastRows())[0]).not.toHaveAttribute('aria-current')
  })

  it('「概要」の effort は起動ダイアログと同じ訳で、モデルと権限モードは起動時の値と分かる見出し (ux M-006 / ui-coverage M-004)', async () => {
    const h = await setup()
    h.launchMock.mockResolvedValueOnce({ status: 'launching', sessionId: B })
    await act(() =>
      h.store.launch({
        folderId: 'folder-1',
        runtimeId: UBUNTU.id,
        providerId: null,
        modelId: 'claude-custom',
        effort: 'high',
        permissionMode: 'default'
      })
    )
    await userEvent.click(screen.getByRole('button', { name: SHELL_LABELS.expandPanel }))
    const overview = await within(screen.getByTestId('right-panel')).findByTestId('overview')
    expect(overview).toHaveTextContent('高')
    expect(overview).not.toHaveTextContent('high')
    // 定数どうしではなく文字列で確かめる (見出しを戻すと落ちる。pr-gate R2 ui-coverage L-102)。
    expect(OVERVIEW_LABELS.model).toBe('起動時のモデル')
    expect(OVERVIEW_LABELS.permissionMode).toBe('起動時の権限モード')
    expect(overview).toHaveTextContent('起動時のモデル')
    expect(overview).toHaveTextContent('claude-custom') // カタログに無ければ ID
    expect(overview).toHaveTextContent('起動時の権限モード')
  })

  it('長い日本語の題とフォルダ名は 1 行に切り詰め、全文は title で読める (po M-005 / a11y M-006 / ux H-003)', async () => {
    const longTitle = '日本語のとても長い題'.repeat(12)
    const longFolder = '作業フォルダのとても長い表示名'.repeat(6)
    await setup({
      folders: [folder(longFolder)],
      index: pastIndex([pastSession({ summary: longTitle })])
    })
    await selectPast(0)
    const title = within(center()).getByTestId('past-title')
    expect(title).toHaveClass('truncate')
    expect(title).toHaveAttribute('title', longTitle)
    const heading = await within(screen.getByTestId('past-sessions')).findByTitle(longFolder)
    expect(heading).toHaveClass('truncate')
  })

  it('外側に稼働中の runtime があっても、過去ログの composer は無効で、入力は稼働中のセッションへ送られない (plan RK-02 / security M-002)', async () => {
    transcript.status = 'ready'
    transcript.messages = [
      { id: 'p1', role: 'assistant', content: [{ type: 'text', text: '過去の応答' }] }
    ]
    const h = await setup({ ids: [A] })
    await selectRunning(0)
    // 前提: 外側 (稼働中) の composer は有効 (無効なら下の確認は入れ子と関係なく通る。pr-gate R2 security L-102)。
    expect(
      within(center()).getByRole('textbox', { name: COMPOSER_LABELS.composerInput })
    ).toBeEnabled()
    await selectPast(0)
    await within(center()).findByText('過去の応答')
    const composer = within(center()).getByRole('textbox', { name: COMPOSER_LABELS.composerInput })
    expect(composer).toBeDisabled()
    const before = h.store.getState().sessions[A]?.messages.length
    await userEvent.type(composer, 'こんにちは{Enter}')
    expect(h.store.getState().sessions[A]?.messages.length).toBe(before)
    expect(h.sendMock).not.toHaveBeenCalled()
  })

  it('vitest-axe: 稼働中の会話・右のペインを開いた状態・畳んだサイドバー・起動ダイアログでも違反 0 (a11y M-007)', async () => {
    const h = await setup({ ids: [A] })
    const rules = { rules: { 'color-contrast': { enabled: false } } }
    await selectRunning(0)
    await userEvent.click(screen.getByRole('button', { name: SHELL_LABELS.expandPanel }))
    expect((await axe(h.container, rules)).violations).toEqual([])
    await userEvent.click(
      within(sidebar()).getByRole('button', { name: SHELL_LABELS.collapseSidebar })
    )
    expect((await axe(h.container, rules)).violations).toEqual([])
    await userEvent.click(within(sidebar()).getByRole('button', { name: SHELL_LABELS.newSession }))
    const host = await screen.findByTestId('launch-dialog-host')
    expect((await axe(host, rules)).violations).toEqual([])
  })
})

/**
 * いちばん上のダイアログの外側 (overlay) を押す。Radix の DismissableLayer は外側の押下の購読をマウントの次の tick で
 * 始め、pointerdown の後の click まで待って閉じるので、user-event で一連の押下を送る。overlay は body の
 * `pointer-events: none` を継ぐことがあるので、user-event の確認は外す。
 */
async function pressOutside(): Promise<void> {
  await act(() => new Promise((resolve) => setTimeout(resolve, 0)))
  const overlays = document.querySelectorAll<HTMLElement>('[data-slot="dialog-overlay"]')
  const overlay = overlays[overlays.length - 1]
  expect(overlay).toBeDefined()
  await userEvent.setup({ pointerEventsCheck: PointerEventsCheckLevel.Never }).click(overlay!)
}

describe('pr-gate R2 の負の経路 (O-7)', () => {
  it('中央に出していない失敗したセッションを行の「閉じる」で閉じると、次の「新規起動」に古い失敗の告知が出ない (po M-101 / ux M-004)', async () => {
    const h = await setup({ ids: [A, B] })
    await selectRunning(1) // B を中央に出す
    expect(h.store.getState().selectedId).toBe(B)
    h.emit(A, { kind: 'failure', reasonKey: 'provider-error' })
    h.push([{ sessionId: A, state: 'error', reasonKey: 'provider-error', claudeAlive: false }])
    await userEvent.click(within(runningRows()[0]!).getByRole('button', { name: '閉じる' }))
    expect(h.store.getState().order).toEqual([B])
    expect(center()).toHaveAttribute('data-focus', 'running')
    expect(screen.queryByTestId('launch-dialog-host')).toBeNull()
    expect(h.store.getState().launch.previousFailure).toBeNull()
    await userEvent.click(within(sidebar()).getByRole('button', { name: SHELL_LABELS.newSession }))
    const host = await screen.findByTestId('launch-dialog-host')
    expect(within(host).queryByTestId('previous-failure')).toBeNull()
  })

  it('起動ダイアログも設定のダイアログも外側の押下では閉じない。入れ子の確認のダイアログは外側の押下と Esc で内側だけ閉じる (ux M-104 / M-007 / spec Edge Cases)', async () => {
    await setup()
    await userEvent.click(within(sidebar()).getByRole('button', { name: SHELL_LABELS.newSession }))
    await screen.findByTestId('launch-dialog-host')
    await pressOutside()
    expect(screen.getByTestId('launch-dialog-host')).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByTestId('launch-dialog-host')).toBeNull())

    await userEvent.click(within(sidebar()).getByRole('button', { name: SHELL_LABELS.settings }))
    const dialog = await screen.findByTestId('settings-dialog')
    await pressOutside()
    expect(screen.getByTestId('settings-dialog')).toBeInTheDocument()

    // 入れ子: 「作業フォルダ」の「登録を解除」の確認。外側の押下は内側 (既定のまま閉じる) だけを閉じる — 上の 2 つが
    // 閉じないのは押下が届かないからではないことの対照でもある。
    await userEvent.click(
      within(within(dialog).getByRole('navigation', { name: SHELL_LABELS.settingsNav })).getByRole(
        'button',
        { name: '作業フォルダ' }
      )
    )
    const openConfirm = async (): Promise<void> => {
      await userEvent.click(await within(dialog).findByRole('button', { name: '登録を解除' }))
      expect(await screen.findByRole('dialog', { name: '登録を解除しますか' })).toBeInTheDocument()
    }
    await openConfirm()
    await pressOutside()
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: '登録を解除しますか' })).toBeNull()
    )
    expect(screen.getByTestId('settings-dialog')).toBeInTheDocument()
    await openConfirm()
    await userEvent.keyboard('{Escape}')
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: '登録を解除しますか' })).toBeNull()
    )
    expect(screen.getByTestId('settings-dialog')).toBeInTheDocument()
  })

  it('サイドバーを畳んで開いても過去の区画は同じもののまま (絞り込みと開いたグループを失わない)。畳んだときに中にあったフォーカスは開閉のボタンへ (ux M-103 / po L-101)', async () => {
    await setup({ ids: [A] })
    await pastRows()
    const past = screen.getByTestId('past-sessions')
    const toggle = within(sidebar()).getByRole('button', { name: SHELL_LABELS.collapseSidebar })
    act(() => within(runningRows()[0]!).getAllByRole('button')[0]!.focus())
    // 自動の畳みと同じ経路 (利用者の押下を通らない)。
    act(() => useUiStore.getState().setSidebarCollapsed(true))
    expect(past).not.toBeVisible()
    await waitFor(() => expect(toggle).toHaveFocus())
    await userEvent.click(toggle)
    expect(screen.getByTestId('past-sessions')).toBe(past)
    expect(past).toBeVisible()
  })

  it('未登録グループの見出しのパスは全文を title で読める (ux M-102)', async () => {
    await setup({ index: unregisteredIndex() })
    const path = await within(screen.getByTestId('past-sessions')).findByTitle('/home/u/other')
    expect(path).toHaveClass('truncate')
  })

  it('スキップリンクで中央へフォーカスが移る。main は常には tabindex を持たず、外れたら消す (a11y M-103 / M-005)', async () => {
    await setup()
    expect(center()).not.toHaveAttribute('tabindex')
    const skip = screen.getByRole('link', { name: SHELL_LABELS.skipToCenter })
    act(() => skip.focus())
    await userEvent.keyboard('{Enter}')
    expect(center()).toHaveFocus()
    expect(center()).toHaveAttribute('tabindex', '-1')
    act(() => within(sidebar()).getByRole('button', { name: SHELL_LABELS.newSession }).focus())
    expect(center()).not.toHaveAttribute('tabindex')
    // 移った後に main の中を押すと (押した先が main 自身で blur が起きない)、そこで外す (pr-gate R3 a11y L-201)。
    act(() => skip.focus())
    await userEvent.keyboard('{Enter}')
    expect(center()).toHaveAttribute('tabindex', '-1')
    fireEvent.pointerDown(center())
    expect(center()).not.toHaveAttribute('tabindex')
  })

  it('中央の「閉じる」で表示中のセッションを閉じると、押したボタンが消えても空の状態の主な操作にフォーカスが移る (a11y M-102)', async () => {
    const h = await setup({ ids: [A] })
    await selectRunning(0)
    h.push([{ sessionId: A, state: 'done', reasonKey: null, claudeAlive: false }])
    await userEvent.click(await within(center()).findByRole('button', { name: '閉じる' }))
    expect(center()).toHaveAttribute('data-focus', 'none')
    await waitFor(() =>
      expect(
        within(center()).getByRole('button', { name: SHELL_LABELS.centerEmptyLaunch })
      ).toHaveFocus()
    )
  })

  it('稼働中の会話は、設定のダイアログを開閉した後も同じ thread・下書き・選択のまま (SC-002)', async () => {
    const h = await setup({ ids: [A] })
    act(() => h.store.setDraft(A, '書きかけ'))
    await selectRunning(0)
    h.emit(A, {
      kind: 'message',
      message: {
        id: 'm1',
        role: 'assistant',
        parts: [{ type: 'text', text: '応答 1' }],
        createdAt: 1
      }
    })
    await within(center()).findByText('応答 1')
    await userEvent.click(within(sidebar()).getByRole('button', { name: SHELL_LABELS.settings }))
    await screen.findByTestId('settings-dialog')
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByTestId('settings-dialog')).toBeNull())
    expect(center()).toHaveAttribute('data-focus', 'running')
    expect(within(center()).getByText('応答 1')).toBeInTheDocument()
    expect(h.store.getDraft(A)).toBe('書きかけ')
    expect(h.store.getState().selectedId).toBe(A)
    // 閉じた後も同じ接続で届く (pr-gate R3 po L-201)。
    h.emit(A, {
      kind: 'message',
      message: {
        id: 'm2',
        role: 'assistant',
        parts: [{ type: 'text', text: '応答 2' }],
        createdAt: 2
      }
    })
    expect(await within(center()).findByText('応答 2')).toBeInTheDocument()
  })

  it('中央のヘッダの状態は一覧の行と同じ状態のラベルで、状態が変わると追随する (ui-coverage L-002 / D 節 session-state)', async () => {
    const h = await setup({ ids: [A] })
    await selectRunning(0)
    const header = (): HTMLElement => within(center()).getByTestId('center-header')
    h.emit(A, { kind: 'state', state: 'running' })
    await waitFor(() => expect(header()).toHaveTextContent('応答中'))
    h.emit(A, { kind: 'state', state: 'awaiting_permission' })
    await waitFor(() => expect(header()).toHaveTextContent('承認待ち'))
    // 状態の通知 (`SessionStatusUpdate`。D 節 session-state の判別子) だけで決まる「失敗」にも追随する (pr-gate R3 ui-coverage L-203)。
    h.push([{ sessionId: A, state: 'error', reasonKey: 'provider-error', claudeAlive: false }])
    await waitFor(() => expect(header()).toHaveTextContent('失敗'))
  })

  it('vitest-axe: 設定のダイアログの 4 項目と、過去の会話を出した状態でも違反 0 (a11y M-007)', async () => {
    const h = await setup()
    const rules = { rules: { 'color-contrast': { enabled: false } } }
    await selectPast(0)
    expect((await axe(h.container, rules)).violations).toEqual([])
    await userEvent.click(within(sidebar()).getByRole('button', { name: SHELL_LABELS.settings }))
    const dialog = await screen.findByTestId('settings-dialog')
    const nav = within(dialog).getByRole('navigation', { name: SHELL_LABELS.settingsNav })
    for (const name of ['ランタイム', '作業フォルダ', 'Provider', '組み合わせ']) {
      await userEvent.click(within(nav).getByRole('button', { name }))
      expect((await axe(dialog, rules)).violations).toEqual([])
    }
  })
})

/** Provider を指定して B を起動し、右のペインの「概要」を開く。 */
async function openOverviewWithProvider(h: Harness): Promise<HTMLElement> {
  h.launchMock.mockResolvedValueOnce({ status: 'launching', sessionId: B })
  await act(() =>
    h.store.launch({
      folderId: 'folder-1',
      runtimeId: UBUNTU.id,
      providerId: 'provider-1',
      modelId: 'claude-custom',
      effort: null,
      permissionMode: 'default'
    })
  )
  await userEvent.click(screen.getByRole('button', { name: SHELL_LABELS.expandPanel }))
  return within(screen.getByTestId('right-panel')).findByTestId('overview')
}

describe('pr-gate R3 の負の経路 (O-7)', () => {
  it('Provider の一覧の読み込み中は、Provider とモデルの行を出さない (断定しない。ux L-103 / M-011)', async () => {
    const h = await setup({ providers: 'loading' })
    const overview = await openOverviewWithProvider(h)
    expect(overview).not.toHaveTextContent('Provider')
    expect(overview).not.toHaveTextContent('起動時のモデル')
    expect(overview).not.toHaveTextContent('claude-custom')
    expect(overview).toHaveTextContent('起動時の権限モード')
  })

  it('Provider の一覧の取得に失敗したら、行を黙って消さず「取得できませんでした」と言い、モデルは ID で出す (ux L-201)', async () => {
    const h = await setup({ providers: 'failed' })
    const overview = await openOverviewWithProvider(h)
    await waitFor(() => expect(overview).toHaveTextContent(OVERVIEW_LABELS.providerUnavailable))
    expect(overview).toHaveTextContent('起動時のモデル')
    expect(overview).toHaveTextContent('claude-custom')
  })

  it('設定を開いた元がサイドバーを畳んで隠れたら、閉じたとき帯の「設定」にフォーカスが移る (a11y M-007 (3))', async () => {
    await setup()
    await userEvent.click(within(sidebar()).getByRole('button', { name: SHELL_LABELS.settings }))
    await screen.findByTestId('settings-dialog')
    act(() => useUiStore.getState().setSidebarCollapsed(true))
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByTestId('settings-dialog')).toBeNull())
    const strip = within(sidebar()).getByRole('button', { name: SHELL_LABELS.settings })
    expect(strip.closest('[hidden]')).toBeNull()
    await waitFor(() => expect(strip).toHaveFocus())
  })

  it('中央のヘッダにフォーカスがある間に表示中の過去の行が取り直しで消えても、空の状態の主な操作にフォーカスが移る (a11y M-007 (4))', async () => {
    await setup()
    await selectPast(0)
    const toggle = within(within(center()).getByTestId('center-header')).getByRole('button', {
      name: TRANSCRIPT_DENSITY_LABELS.compact
    })
    act(() => toggle.focus())
    act(() => useSessionsStore.getState().setIndex(pastIndex([])))
    expect(center()).toHaveAttribute('data-focus', 'none')
    await waitFor(() =>
      expect(
        within(center()).getByRole('button', { name: SHELL_LABELS.centerEmptyLaunch })
      ).toHaveFocus()
    )
  })
})

describe('Thread search (O-3 / US-1 AC5 / FE-012)', () => {
  const PAST_TITLE = '[data-slot="aui_thread-list-item-title"]'
  const P1 = '44444444-4444-4444-8444-444444444444'
  const P2 = '55555555-5555-4555-8555-555555555555'

  function pastTitles(): string[] {
    const past = screen.getByTestId('past-sessions')
    return Array.from(past.querySelectorAll(PAST_TITLE), (title) => title.textContent ?? '')
  }

  it('語と結果は、中央の切り替えとサイドバーの畳み・開きで保たれる。検索中も vitest-axe の違反 0', async () => {
    const h = await setup({
      ids: [A],
      index: pastIndex([
        pastSession({ sessionId: P1, summary: 'ログインの修正' }),
        pastSession({ sessionId: P2, summary: 'テストの整理' })
      ])
    })
    await pastRows()
    const box = within(screen.getByTestId('past-sessions')).getByRole('searchbox', {
      name: PAST_SESSIONS_LABELS.searchLabel
    })

    await userEvent.type(box, 'ログイン')
    await waitFor(() => expect(pastTitles()).toEqual(['ログインの修正']))
    const rules = { rules: { 'color-contrast': { enabled: false } } }
    expect((await axe(h.container, rules)).violations).toEqual([])

    // 中央の切り替え (稼働中 → 過去 → 稼働中)。
    await selectRunning(0)
    expect(center()).toHaveAttribute('data-focus', 'running')
    expect(box).toHaveValue('ログイン')
    expect(pastTitles()).toEqual(['ログインの修正'])
    await selectPast(0)
    expect(center()).toHaveAttribute('data-focus', 'past')
    expect(box).toHaveValue('ログイン')
    expect(pastTitles()).toEqual(['ログインの修正'])

    // サイドバーを畳んで開く (区画は外さずに隠す。O-7 pr-gate R2 ux M-103)。
    await userEvent.click(
      within(sidebar()).getByRole('button', { name: SHELL_LABELS.collapseSidebar })
    )
    expect(screen.getByTestId('past-sessions')).not.toBeVisible()
    await userEvent.click(
      within(sidebar()).getByRole('button', { name: SHELL_LABELS.expandSidebar })
    )
    expect(screen.getByTestId('past-sessions')).toBeVisible()
    expect(box).toHaveValue('ログイン')
    expect(pastTitles()).toEqual(['ログインの修正'])
  })
})

/*
 * 会話内検索の Ctrl+F は `[aria-modal="true"]` の要素が開いている間は何もしない (012 data-model §2「開く・閉じる・キー」)。
 * Radix の Dialog は `aria-modal` を出さないので、共有の `DialogContent` が出す (2026-10-07 の決定)。起動・設定の
 * ダイアログの背面で検索のバーが開かないことを、本物のダイアログで確かめる。
 */
describe('会話内検索の Ctrl+F とモーダルのダイアログ (O-3 / FE-024)', () => {
  /** フォーカスのある要素で Ctrl+F を押す。`preventDefault` されなければ true。 */
  const ctrlF = (): boolean =>
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'f', ctrlKey: true })
  const searchBar = (): HTMLElement | null => screen.queryByTestId('conversation-search')

  it('起動のダイアログの背面では開かず preventDefault もしない。閉じた後は開く', async () => {
    await setup({ ids: [A] })
    await selectRunning(0)
    await userEvent.click(within(sidebar()).getByRole('button', { name: SHELL_LABELS.newSession }))
    expect(await screen.findByTestId('launch-dialog-host')).toHaveAttribute('aria-modal', 'true')

    expect(ctrlF()).toBe(true)
    expect(searchBar()).toBeNull()

    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByTestId('launch-dialog-host')).toBeNull())
    expect(ctrlF()).toBe(false)
    expect(searchBar()).not.toBeNull()
  })

  it('設定のダイアログの背面では開かず preventDefault もしない。閉じた後は開く', async () => {
    await setup({ ids: [A] })
    await selectRunning(0)
    await userEvent.click(within(sidebar()).getByRole('button', { name: SHELL_LABELS.settings }))
    expect(await screen.findByTestId('settings-dialog')).toHaveAttribute('aria-modal', 'true')

    expect(ctrlF()).toBe(true)
    expect(searchBar()).toBeNull()

    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByTestId('settings-dialog')).toBeNull())
    expect(ctrlF()).toBe(false)
    expect(searchBar()).not.toBeNull()
  })
})
