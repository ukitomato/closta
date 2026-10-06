import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'vitest-axe'

import type { ThreadMessageLike } from '@assistant-ui/react'

import type { ClostaCapability } from '@domain/capability'
import type { SessionIndexDTO, SessionSummaryDTO } from '@domain/session/dto'
import { sessionRowKey } from '@domain/session/summary'
import type { TranscriptMessageDTO } from '@domain/session/transcript-dto'

import { RunningSessionStoreContext } from '@/features/session/running-session-context'
import {
  createRunningSessionStore,
  type RunningSessionStore
} from '@/features/session/running-session-store'
import { RunningSessionsProvider } from '@/features/session/RunningSessionsProvider'
import { MESSAGE_WINDOW } from '@/features/session/session-view'
import { CenterPane } from '@/features/shell/CenterPane'
import { useSessionsStore } from '@/stores/sessions'
import { useUiStore } from '@/stores/ui'
import { installCapability } from '@/test-support/capability'

import { toThreadMessage } from './convert'
import { COMPOSER_LABELS, CONVERSATION_SEARCH_LABELS } from './labels'
import { SEARCH_HIGHLIGHT, SEARCH_HIGHLIGHT_CURRENT } from './search-highlight'
import { findMessageElement } from './transcript-context'
import type { TranscriptView } from './useTranscript'

/**
 * O-3 FE-026 — 会話内検索を中央に描いた形で確かめる (spec US-2 AC1〜AC7 / SC-002 / Edge Cases / 012 data-model §2)。
 *
 * 中央はシェルの `CenterPane` を本物で描き (過去は `PastCenter`、稼働中は `RunningCenter`)、過去ログの取得
 * (`useTranscript`) だけを差し替える。「取得が 1 本」の確かめだけは本物の `useTranscript` を通す。
 * 強調は `CSS.highlights` と `Highlight` を差し替えて、掛かった `Range` を見る (jsdom は持たない)。
 */

const { transcript, transcriptMode } = vi.hoisted(() => ({
  transcript: {
    messages: [] as readonly ThreadMessageLike[],
    status: 'ready' as 'idle' | 'loading' | 'ready' | 'empty' | 'failed',
    reasonKey: null,
    retry: (): void => {},
    hasSelection: true
  },
  transcriptMode: { real: false }
}))

vi.mock('./useTranscript', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./useTranscript')>()
  const fake = (): TranscriptView => transcript
  return {
    ...actual,
    // テストの途中では切り替えない (フックの呼び出しの順は変わらない)。
    useTranscript: (): TranscriptView => (transcriptMode.real ? actual.useTranscript : fake)()
  }
})

const NOW = Date.UTC(2026, 9, 5, 9, 0)
const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
const TRICKY = 'a"],[data-message-id="b'
const ODD = 'x"\\],\ny'

function text(
  id: string,
  body: string,
  role: 'user' | 'assistant' = 'assistant'
): ThreadMessageLike {
  return { id, role, content: [{ type: 'text', text: body }] }
}

function pastSession(sessionId: string, summary: string): SessionSummaryDTO {
  return {
    sessionId,
    targetKey: 'wsl:Ubuntu#0',
    targetLabel: 'u',
    summary,
    firstPrompt: null,
    customTitle: null,
    lastModified: NOW,
    createdAt: NOW,
    fileSize: 100,
    gitBranch: null,
    tag: null,
    cwd: { namespace: 'wsl:Ubuntu', value: '/home/u/proj' },
    cwdDisplay: null,
    originKind: 'wsl-inherited',
    programmatic: false,
    worktree: false,
    boundary: null,
    normalized: { truncated: false, controlCharsRemoved: false }
  }
}

const PAST_A = pastSession('33333333-3333-4333-8333-333333333333', '過去の作業 A')
const PAST_B = pastSession('44444444-4444-4444-8444-444444444444', '過去の作業 B')

function pastIndex(): SessionIndexDTO {
  return {
    groups: [
      { kind: 'folder', folderId: 'folder-1', boundary: 'native', sessions: [PAST_A, PAST_B] }
    ],
    outcomes: [],
    fetchedAt: NOW,
    complete: true
  }
}

interface FakeHighlight {
  readonly ranges: readonly Range[]
}

/** `CSS.highlights` と `Highlight` を差し替える (強調に掛かった Range を見る)。 */
function stubHighlights(): Map<string, FakeHighlight> {
  const registry = new Map<string, FakeHighlight>()
  vi.stubGlobal(
    'Highlight',
    class {
      readonly ranges: readonly Range[]
      constructor(...ranges: Range[]) {
        this.ranges = ranges
      }
    }
  )
  vi.stubGlobal('CSS', { highlights: registry })
  return registry
}

/** 現在の一致の強調の Range。 */
function currentRange(highlights: Map<string, FakeHighlight>): Range {
  const range = highlights.get(SEARCH_HIGHLIGHT_CURRENT)?.ranges[0]
  if (range === undefined) throw new Error('現在の一致の強調が無い')
  return range
}

/** `scrollIntoView` を呼ばれた要素の `data-message-id` の並び。 */
function scrolledIds(spy: { mock: { contexts: unknown[] } }): (string | undefined)[] {
  return spy.mock.contexts.map((element) => (element as HTMLElement).dataset.messageId)
}

/** jsdom にレイアウトを補う (transcript-navigator.test.tsx と同じ土台。仮想パスを描くテストだけが使う)。 */
function stubVirtualLayout(): void {
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
      // 観測し直さない (固定の大きさ)
    }
    disconnect(): void {
      // 同上
    }
  }
  vi.stubGlobal('ResizeObserver', SizedResizeObserver)
}

let detach: (() => void) | null = null

/** 一覧の読み込みは解決しない (中央の表示名は空のまま。会話内検索には関わらない)。 */
function capability(overrides: Partial<ClostaCapability> = {}): ClostaCapability {
  const never = new Promise<never>(() => undefined)
  return installCapability({ listFolders: () => never, listRuntimes: () => never, ...overrides })
}

function renderCenter(store: RunningSessionStore): HTMLElement {
  const { container } = render(
    <RunningSessionStoreContext.Provider value={store}>
      <RunningSessionsProvider>
        <CenterPane />
      </RunningSessionsProvider>
    </RunningSessionStoreContext.Provider>
  )
  return container
}

function selectPast(overrides: Partial<ClostaCapability> = {}): RunningSessionStore {
  const cap = capability(overrides)
  useSessionsStore.setState({
    index: pastIndex(),
    loading: false,
    failed: false,
    selectedRowKey: sessionRowKey(PAST_A),
    selectionSeq: 0
  })
  useUiStore.setState({ focus: 'past' })
  return createRunningSessionStore(() => cap)
}

/** 過去の会話を中央に出す (取得は `transcript` の差し替え)。 */
function setupPast(messages: readonly ThreadMessageLike[]): HTMLElement {
  transcript.messages = messages
  transcript.status = 'ready'
  return renderCenter(selectPast())
}

/** 稼働中の会話を中央に出す。鍵の分だけ起動し、最初のセッションを表示する。 */
async function setupRunning(
  messagesById: Readonly<Record<string, readonly ThreadMessageLike[]>>
): Promise<{ readonly store: RunningSessionStore; readonly container: HTMLElement }> {
  const ids = Object.keys(messagesById)
  const launch = vi.fn()
  for (const id of ids) launch.mockResolvedValueOnce({ status: 'launching', sessionId: id })
  const cap = capability({ launchSession: launch })
  const store = createRunningSessionStore(() => cap)
  detach = store.attach(window)
  for (let i = 0; i < ids.length; i += 1) {
    await store.launch({
      folderId: 'folder-1',
      runtimeId: 'wsl:Ubuntu',
      providerId: null,
      modelId: null,
      effort: null,
      permissionMode: 'default'
    })
  }
  store.setState((s) => {
    const sessions = { ...s.sessions }
    for (const id of ids) sessions[id] = { ...sessions[id]!, messages: messagesById[id]! }
    return { sessions, selectedId: ids[0]! }
  })
  useUiStore.setState({ focus: 'running', launchOpen: false })
  return { store, container: renderCenter(store) }
}

const searchButton = (): HTMLElement =>
  screen.getByRole('button', { name: CONVERSATION_SEARCH_LABELS.searchOpen })
const bar = (): HTMLElement => screen.getByTestId('conversation-search')
const barButton = (name: string): HTMLElement => within(bar()).getByRole('button', { name })
const searchInput = (): HTMLElement =>
  within(bar()).getByRole('searchbox', { name: CONVERSATION_SEARCH_LABELS.searchOpen })
const position = (): HTMLElement => within(bar()).getByRole('status')

async function openAndSearch(query: string): Promise<void> {
  await userEvent.click(searchButton())
  await userEvent.type(searchInput(), query)
}

beforeEach(() => {
  transcriptMode.real = false
  transcript.messages = []
  transcript.status = 'ready'
  useUiStore.setState({
    focus: 'none',
    settings: { open: false, section: 'runtimes' },
    launchOpen: false,
    paletteOpen: false,
    transcriptDensity: 'comfortable'
  })
  useSessionsStore.setState({
    index: null,
    loading: false,
    failed: false,
    selectedRowKey: null,
    selectionSeq: 0
  })
})

afterEach(() => {
  detach?.()
  detach = null
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const PAST_MESSAGES: readonly ThreadMessageLike[] = [
  text('p0', 'りんご を買う', 'user'),
  text('p1', 'りんご は赤い。りんご'),
  text('p2', 'みかん', 'user'),
  text('p3', 'りんご')
]

describe('件数・位置・移動・強調 (US-2 AC1 / AC2)', () => {
  it('語を入れると件数と n / m が出て、最初の一致へ移って強調する', async () => {
    const highlights = stubHighlights()
    const spy = vi.spyOn(Element.prototype, 'scrollIntoView')
    const container = setupPast(PAST_MESSAGES)

    await openAndSearch('りんご')
    await waitFor(() =>
      expect(position()).toHaveTextContent(CONVERSATION_SEARCH_LABELS.searchPosition(1, 4))
    )
    expect(scrolledIds(spy).at(-1)).toBe('p0')
    await waitFor(() => expect(highlights.get(SEARCH_HIGHLIGHT_CURRENT)?.ranges).toHaveLength(1))
    const current = currentRange(highlights)
    expect(findMessageElement(container, 'p0')!.contains(current.startContainer)).toBe(true)
    expect(current.toString()).toBe('りんご')
    expect(highlights.get(SEARCH_HIGHLIGHT)?.ranges).toHaveLength(3)
  })

  it('次 / 前 (Enter / Shift+Enter とボタン) で順に移り、端で反対の端へ戻る', async () => {
    const highlights = stubHighlights()
    const spy = vi.spyOn(Element.prototype, 'scrollIntoView')
    const container = setupPast(PAST_MESSAGES)
    await openAndSearch('りんご')
    await waitFor(() => expect(position()).toHaveTextContent('1 / 4 件'))

    await userEvent.keyboard('{Enter}')
    expect(position()).toHaveTextContent('2 / 4 件')
    expect(scrolledIds(spy).at(-1)).toBe('p1')
    await userEvent.keyboard('{Enter}')
    expect(position()).toHaveTextContent('3 / 4 件')
    await waitFor(() => {
      // p1 の 2 つめの出現。
      const current = currentRange(highlights)
      expect(findMessageElement(container, 'p1')!.contains(current.startContainer)).toBe(true)
      expect(current.startOffset).toBeGreaterThan(0)
    })
    await userEvent.keyboard('{Enter}')
    expect(position()).toHaveTextContent('4 / 4 件')
    expect(scrolledIds(spy).at(-1)).toBe('p3')
    // 端で最初へ戻る。
    await userEvent.keyboard('{Enter}')
    expect(position()).toHaveTextContent('1 / 4 件')
    expect(scrolledIds(spy).at(-1)).toBe('p0')
    // 前で最後へ戻る。
    await userEvent.keyboard('{Shift>}{Enter}{/Shift}')
    expect(position()).toHaveTextContent('4 / 4 件')

    await userEvent.click(barButton(CONVERSATION_SEARCH_LABELS.searchNext))
    expect(position()).toHaveTextContent('1 / 4 件')
    await userEvent.click(barButton(CONVERSATION_SEARCH_LABELS.searchPrev))
    expect(position()).toHaveTextContent('4 / 4 件')
  })

  it('開いているときに検索のボタンを押すと、入力欄へフォーカスを移すだけ (語と位置は保つ)', async () => {
    setupPast(PAST_MESSAGES)
    await openAndSearch('りんご')
    await waitFor(() => expect(position()).toHaveTextContent('1 / 4 件'))
    await userEvent.click(searchButton())
    expect(searchInput()).toHaveFocus()
    expect(searchInput()).toHaveValue('りんご')
    expect(position()).toHaveTextContent('1 / 4 件')
  })
})

describe('対象と空の結果 (US-2 AC4 / FR-004 / FR-008)', () => {
  it('Tool group / Reasoning の中だけの語は 0 件で、なぜ空かと次の操作を出す', async () => {
    const dto: TranscriptMessageDTO = {
      id: 't1',
      role: 'assistant',
      parts: [
        {
          type: 'tool-call',
          toolCallId: 'c1',
          toolName: 'Bash',
          argsText: '{"command":"echo りんご"}',
          result: 'りんご',
          isError: false,
          truncated: false,
          children: []
        },
        { type: 'reasoning', text: 'りんご について考える' }
      ],
      createdAt: null
    }
    setupPast([text('u', '質問', 'user'), toThreadMessage(dto)])
    await openAndSearch('りんご')
    await waitFor(() =>
      expect(screen.getByTestId('conversation-search-empty')).toHaveTextContent(
        CONVERSATION_SEARCH_LABELS.searchNone
      )
    )
    expect(screen.getByTestId('conversation-search-empty')).toHaveTextContent(
      CONVERSATION_SEARCH_LABELS.searchNoneHint
    )
    expect(position()).toHaveTextContent('0 / 0 件')
  })

  it('語を空白だけにすると空の状態も件数も出さない', async () => {
    setupPast(PAST_MESSAGES)
    await openAndSearch('ぶどう')
    await waitFor(() => expect(screen.getByTestId('conversation-search-empty')).toBeVisible())
    await userEvent.clear(searchInput())
    await userEvent.type(searchInput(), '   ')
    await waitFor(() => expect(screen.queryByTestId('conversation-search-empty')).toBeNull())
    expect(position()).toHaveTextContent('')
  })
})

describe('閉じる (US-2 AC6) と IME (US-2 AC7)', () => {
  it('Esc で閉じると強調が 2 つとも消え、スクロールは動かさず、検索のボタンへフォーカスが戻る', async () => {
    const highlights = stubHighlights()
    const spy = vi.spyOn(Element.prototype, 'scrollIntoView')
    setupPast(PAST_MESSAGES)
    await openAndSearch('りんご')
    await waitFor(() => expect(highlights.get(SEARCH_HIGHLIGHT_CURRENT)).toBeDefined())
    const scrolls = spy.mock.calls.length

    await userEvent.keyboard('{Escape}')
    expect(screen.queryByTestId('conversation-search')).toBeNull()
    expect(highlights.has(SEARCH_HIGHLIGHT)).toBe(false)
    expect(highlights.has(SEARCH_HIGHLIGHT_CURRENT)).toBe(false)
    expect(spy.mock.calls.length).toBe(scrolls)
    expect(searchButton()).toHaveFocus()
  })

  it('閉じるボタンでも閉じる。開き直すと語は空から', async () => {
    setupPast(PAST_MESSAGES)
    await openAndSearch('りんご')
    await userEvent.click(barButton(CONVERSATION_SEARCH_LABELS.searchClose))
    expect(screen.queryByTestId('conversation-search')).toBeNull()
    await userEvent.click(searchButton())
    expect(searchInput()).toHaveValue('')
  })

  it('変換中の Enter / Shift+Enter / Esc では移らず閉じず、preventDefault もしない', async () => {
    const spy = vi.spyOn(Element.prototype, 'scrollIntoView')
    setupPast(PAST_MESSAGES)
    await openAndSearch('りんご')
    await waitFor(() => expect(position()).toHaveTextContent('1 / 4 件'))
    const scrolls = spy.mock.calls.length

    const input = searchInput()
    expect(fireEvent.keyDown(input, { key: 'Enter', isComposing: true })).toBe(true)
    expect(fireEvent.keyDown(input, { key: 'Enter', keyCode: 229 })).toBe(true)
    expect(fireEvent.keyDown(input, { key: 'Enter', shiftKey: true, isComposing: true })).toBe(true)
    expect(fireEvent.keyDown(input, { key: 'Escape', isComposing: true })).toBe(true)
    expect(fireEvent.keyDown(input, { key: 'Escape', keyCode: 229 })).toBe(true)

    expect(screen.getByTestId('conversation-search')).toBeInTheDocument()
    expect(position()).toHaveTextContent('1 / 4 件')
    expect(spy.mock.calls.length).toBe(scrolls)
    // 変換していない Enter は移る (ガードが変換中のキーだけを止めている)。
    expect(fireEvent.keyDown(input, { key: 'Enter' })).toBe(false)
    expect(position()).toHaveTextContent('2 / 4 件')
  })
})

describe('外部由来の id (spec Edge Cases / data-model §2「メッセージの要素の引き方」)', () => {
  it('id に `"` `\\` `]` やセレクタの断片を含んでも、検索・移動・強調が例外を出さず、その id のメッセージに掛かる', async () => {
    const highlights = stubHighlights()
    const spy = vi.spyOn(Element.prototype, 'scrollIntoView')
    const container = setupPast([
      text(TRICKY, 'りんご A', 'user'),
      text('b', 'りんご B'),
      text(ODD, 'りんご C', 'user')
    ])
    await openAndSearch('りんご')
    await waitFor(() => expect(position()).toHaveTextContent('1 / 3 件'))
    expect(scrolledIds(spy).at(-1)).toBe(TRICKY)
    await waitFor(() => {
      const current = currentRange(highlights)
      expect(findMessageElement(container, TRICKY)!.contains(current.startContainer)).toBe(true)
      expect(findMessageElement(container, 'b')!.contains(current.startContainer)).toBe(false)
    })

    await userEvent.keyboard('{Enter}')
    await userEvent.keyboard('{Enter}')
    expect(position()).toHaveTextContent('3 / 3 件')
    expect(scrolledIds(spy).at(-1)).toBe(ODD)
    await waitFor(() => {
      const current = currentRange(highlights)
      expect(findMessageElement(container, ODD)!.contains(current.startContainer)).toBe(true)
    })
  })
})

describe('稼働中の会話 (US-2 AC3 / AC5 / research R-03)', () => {
  it('メッセージの追加とストリーミングで件数が増えても、現在の位置とスクロールは変わらない (AC5)', async () => {
    const spy = vi.spyOn(Element.prototype, 'scrollIntoView')
    const { store } = await setupRunning({
      [A]: [text('r0', 'りんご 1', 'user'), text('r1', 'りんご 2')]
    })
    await openAndSearch('りんご')
    await waitFor(() => expect(position()).toHaveTextContent('1 / 2 件'))
    await userEvent.keyboard('{Enter}')
    expect(position()).toHaveTextContent('2 / 2 件')
    const scrolls = spy.mock.calls.length

    act(() =>
      store.setState((s) => {
        const session = s.sessions[A]!
        // r1 の本文が伸び (別の object)、r2 が届く。
        const messages = [
          session.messages[0]!,
          text('r1', 'りんご 2 と りんご'),
          text('r2', 'りんご 3')
        ]
        return { sessions: { ...s.sessions, [A]: { ...session, messages } } }
      })
    )
    await waitFor(() => expect(position()).toHaveTextContent('2 / 4 件'))
    expect(spy.mock.calls.length).toBe(scrolls)
  })

  it('窓の外の一致へは窓を広げて移る (revealMessage)', async () => {
    stubVirtualLayout()
    const spy = vi.spyOn(Element.prototype, 'scrollIntoView')
    const messages = Array.from({ length: MESSAGE_WINDOW + 5 }, (_, i) =>
      text(`m${i}`, i === 0 ? '最初の りんご' : `本文 ${i}`)
    )
    const { container } = await setupRunning({ [A]: messages })
    expect(screen.getByTestId('older-messages')).toBeInTheDocument()

    await openAndSearch('りんご')
    await waitFor(() => expect(position()).toHaveTextContent('1 / 1 件'))
    // 窓が広がり (省略の行が消える)、そのメッセージが描かれて画面に入る。
    await waitFor(() => expect(screen.queryByTestId('older-messages')).toBeNull())
    await waitFor(() => expect(findMessageElement(container, 'm0')).not.toBeNull())
    await waitFor(() => expect(scrolledIds(spy)).toContain('m0'))
  })

  it('composer にフォーカスがあっても、変換中でなければ Ctrl+F で開いて入力欄へ移る', async () => {
    await setupRunning({ [A]: [text('r0', 'りんご', 'user')] })
    const composer = screen.getByRole('textbox', { name: COMPOSER_LABELS.composerInput })
    act(() => composer.focus())

    // 変換中の Ctrl+F では開かず、preventDefault もしない。
    expect(fireEvent.keyDown(composer, { key: 'f', ctrlKey: true, isComposing: true })).toBe(true)
    expect(fireEvent.keyDown(composer, { key: 'f', ctrlKey: true, keyCode: 229 })).toBe(true)
    expect(screen.queryByTestId('conversation-search')).toBeNull()

    expect(fireEvent.keyDown(composer, { key: 'f', ctrlKey: true })).toBe(false)
    expect(searchInput()).toHaveFocus()
    // 閉じると開く前の要素 (composer) へ戻る。
    await userEvent.keyboard('{Escape}')
    expect(composer).toHaveFocus()
  })

  it('[aria-modal="true"] の要素が開いている間の Ctrl+F では開かず、preventDefault もしない', async () => {
    await setupRunning({ [A]: [text('r0', 'りんご', 'user')] })
    const modal = document.createElement('div')
    modal.setAttribute('role', 'dialog')
    modal.setAttribute('aria-modal', 'true')
    document.body.append(modal)

    expect(fireEvent.keyDown(document.body, { key: 'f', ctrlKey: true })).toBe(true)
    expect(screen.queryByTestId('conversation-search')).toBeNull()

    modal.remove()
    expect(fireEvent.keyDown(document.body, { key: 'f', ctrlKey: true })).toBe(false)
    expect(screen.getByTestId('conversation-search')).toBeInTheDocument()
  })

  it('palette の「会話内を検索」の要求で開き、開いていれば入力欄へフォーカスを移すだけ', async () => {
    await setupRunning({ [A]: [text('r0', 'りんご', 'user')] })
    act(() => useUiStore.getState().requestConversationSearch())
    expect(searchInput()).toHaveFocus()
    await userEvent.type(searchInput(), 'りんご')
    act(() => searchButton().focus())
    act(() => useUiStore.getState().requestConversationSearch())
    expect(searchInput()).toHaveFocus()
    expect(searchInput()).toHaveValue('りんご')
  })
})

describe('閉じる契機 (spec FR-003) と取得 (data-model §2「本文の供給元」)', () => {
  it('稼働中のセッションを切り替えると閉じ、中央が未選択になると閉じて強調が消える', async () => {
    const highlights = stubHighlights()
    const { store } = await setupRunning({
      [A]: [text('a0', 'りんご', 'user')],
      [B]: [text('b0', 'りんご', 'user')]
    })
    await openAndSearch('りんご')
    await waitFor(() => expect(position()).toHaveTextContent('1 / 1 件'))

    act(() => store.select(B))
    await waitFor(() => expect(store.getState().selectedId).toBe(B))
    expect(screen.queryByTestId('conversation-search')).toBeNull()
    act(() => store.select(A))
    await waitFor(() => expect(store.getState().selectedId).toBe(A))
    expect(screen.queryByTestId('conversation-search')).toBeNull()

    await openAndSearch('りんご')
    await waitFor(() => expect(highlights.get(SEARCH_HIGHLIGHT_CURRENT)).toBeDefined())
    act(() => useUiStore.setState({ focus: 'none' }))
    expect(screen.queryByTestId('conversation-search')).toBeNull()
    expect(highlights.size).toBe(0)
  })

  it('過去の行を切り替えると閉じる', async () => {
    setupPast(PAST_MESSAGES)
    await openAndSearch('りんご')
    act(() => useSessionsStore.setState({ selectedRowKey: sessionRowKey(PAST_B) }))
    expect(screen.queryByTestId('conversation-search')).toBeNull()
  })

  it('過去の transcript の取得は 1 本 (中央の provider と本体で port を 2 つ開かない)', () => {
    transcriptMode.real = true
    const getTranscript = vi.fn(() => new Promise<never>(() => undefined))
    renderCenter(selectPast({ getTranscript }))
    expect(getTranscript).toHaveBeenCalledTimes(1)
  })

  it('vitest-axe の違反 0 (検索のバーを開いて一致を辿った状態と、0 件の状態)', async () => {
    const container = setupPast(PAST_MESSAGES)
    await openAndSearch('りんご')
    await waitFor(() => expect(position()).toHaveTextContent('1 / 4 件'))
    const results = await axe(container, { rules: { 'color-contrast': { enabled: false } } })
    expect(results.violations).toEqual([])

    await userEvent.clear(searchInput())
    await userEvent.type(searchInput(), 'ぶどう')
    await waitFor(() => expect(screen.getByTestId('conversation-search-empty')).toBeVisible())
    const empty = await axe(container, { rules: { 'color-contrast': { enabled: false } } })
    expect(empty.violations).toEqual([])
  })
})
