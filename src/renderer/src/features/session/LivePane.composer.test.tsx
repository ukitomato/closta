import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'

import { SESSION_PORT_MESSAGE } from '@domain/capability'
import type { SessionEvent } from '@domain/session/agent-session'

import { COMPOSER_LABELS } from '@/features/chat/labels'
import { installCapability } from '@/test-support/capability'
import { RunningSessionsHarness } from '@/test-support/running-sessions-harness'

import { RunningSessionStoreContext } from './running-session-context'
import { createRunningSessionStore } from './running-session-store'

/**
 * O-10 FE-030 / FE-031 — composer のボタンの名前・フォーカス・コマンドの候補 (spec US-3 AC1〜AC6 / SC-006 / SC-007)。
 * port の本文 → store → Thread の composer までを本物で通す (`LivePane.o2.test.tsx` と同じ組み方)。
 */

const AXE_RULES = { rules: { 'color-contrast': { enabled: false } } }
const A = '11111111-1111-4111-8111-111111111111'

interface FakePort {
  onmessage: ((event: { data: unknown }) => void) | null
  start: () => void
  close: () => void
}

let detach: (() => void) | null = null

afterEach(() => {
  detach?.()
  detach = null
  vi.unstubAllGlobals()
})

async function setup(): Promise<{
  readonly emit: (event: SessionEvent) => void
  readonly container: HTMLElement
}> {
  const launch = vi.fn().mockResolvedValueOnce({ status: 'launching', sessionId: A })
  const cap = installCapability({
    listFolders: () => new Promise<never>(() => undefined),
    listRuntimes: () => new Promise<never>(() => undefined),
    launchSession: launch,
    sendPrompt: vi.fn(async () => {}),
    interruptSession: vi.fn(async () => {}),
    onSessionStatus: () => () => {}
  })
  const store = createRunningSessionStore(() => cap)
  detach = store.attach(window)
  await store.launch({
    folderId: 'f1',
    runtimeId: 'wsl:Ubuntu',
    providerId: null,
    modelId: null,
    effort: null,
    permissionMode: 'default'
  })
  const port: FakePort = { onmessage: null, start: vi.fn(), close: vi.fn() }
  const event = new Event('message') as Event & { data: unknown; ports: unknown[] }
  event.data = { marker: SESSION_PORT_MESSAGE, sessionId: A }
  event.ports = [port]
  Object.defineProperty(event, 'origin', { value: window.location.origin })
  Object.defineProperty(event, 'source', { value: window })
  window.dispatchEvent(event)
  act(() => store.select(A))
  const { container } = render(
    <RunningSessionStoreContext.Provider value={store}>
      <RunningSessionsHarness />
    </RunningSessionStoreContext.Provider>
  )
  return {
    container,
    emit: (e) => act(() => port.onmessage?.({ data: JSON.stringify(e) }))
  }
}

const commandsEvent = (
  list: readonly { name: string; description?: string; argumentHint?: string }[]
): SessionEvent => ({
  kind: 'meter',
  meter: {
    type: 'commands',
    commands: list.map((c) => ({
      name: c.name,
      description: c.description ?? '',
      argumentHint: c.argumentHint ?? ''
    })),
    omitted: 0
  }
})

const composerRoot = (container: HTMLElement): HTMLElement =>
  container.querySelector<HTMLElement>('.aui-composer-root') ?? container

const input = (): HTMLElement =>
  screen.getByRole('textbox', { name: COMPOSER_LABELS.composerInput })

describe('composer のボタンの名前 (FE-030 / US-3 AC5・SC-007)', () => {
  it('送信ボタンの名前が日本語で、英語の名前が DOM に無い。実行中は停止ボタンになる', async () => {
    const h = await setup()
    await waitFor(() => expect(input()).toBeInTheDocument())
    expect(screen.getByRole('button', { name: COMPOSER_LABELS.send })).toBeInTheDocument()
    h.emit({ kind: 'state', state: 'running' })
    await waitFor(() =>
      expect(screen.getByRole('button', { name: COMPOSER_LABELS.stop })).toBeInTheDocument()
    )
    expect(
      h.container.querySelector(
        '[aria-label="Send message"], [aria-label="Stop generating"], [aria-label="Start voice input"], [aria-label="Stop voice input"], [aria-label="Scroll to bottom"]'
      )
    ).toBeNull()
    expect((await axe(composerRoot(h.container), AXE_RULES)).violations).toEqual([])
  })

  it('ターンの開始 (idle → running) でほかの場所にあるフォーカスが composer に移らない (FR-014)', async () => {
    const h = await setup()
    await waitFor(() => expect(input()).toBeInTheDocument())
    const other = document.createElement('button')
    other.textContent = 'row'
    document.body.appendChild(other)
    try {
      other.focus()
      h.emit({ kind: 'state', state: 'running' })
      await waitFor(() => screen.getByRole('button', { name: COMPOSER_LABELS.stop }))
      expect(document.activeElement).toBe(other)
    } finally {
      other.remove()
    }
  })
})

describe('コマンドの候補 (FE-031 / US-3 AC1〜AC4・SC-006)', () => {
  it('先頭の / で前方一致の候補 (名前・説明・引数の形) が出る。Enter で /{name} が入り送られない', async () => {
    const user = userEvent.setup()
    const h = await setup()
    h.emit(
      commandsEvent([
        { name: 'review', description: 'PR をレビューする', argumentHint: '<pr>' },
        { name: 'compact', description: '圧縮する' }
      ])
    )
    await waitFor(() => expect(input()).toBeInTheDocument())
    await user.click(input())
    await user.keyboard('/re')
    const list = await screen.findByRole('listbox', { name: COMPOSER_LABELS.commandCandidates })
    expect(list).toHaveTextContent('/review')
    expect(list).toHaveTextContent('<pr>')
    expect(list).toHaveTextContent('PR をレビューする')
    expect(list).not.toHaveTextContent('compact')
    // 開いている間のライブラリの ARIA (textarea の `aria-expanded`) は役割が textbox のままなので axe の `aria-allowed-attr` に
    // 触れる。ライブラリ側の出力 (Input を差し替えない: glossary Composer) なのでこの 1 規則だけ外す。
    const popoverRules = { rules: { ...AXE_RULES.rules, 'aria-allowed-attr': { enabled: false } } }
    expect((await axe(composerRoot(h.container), popoverRules)).violations).toEqual([])
    await user.keyboard('{Enter}')
    await waitFor(() => expect(input()).toHaveValue('/review '))
    expect(screen.queryByRole('listbox')).toBeNull()
    // 送られていない (user メッセージが無い)。
    expect(document.querySelector('[data-role="user"]')).toBeNull()
  })

  it('文の途中の / では出ない。Escape で閉じる', async () => {
    const user = userEvent.setup()
    const h = await setup()
    h.emit(commandsEvent([{ name: 'review' }]))
    await waitFor(() => expect(input()).toBeInTheDocument())
    await user.click(input())
    await user.keyboard('a /re')
    expect(screen.queryByRole('listbox')).toBeNull()
    await user.clear(input())
    await user.keyboard('/re')
    await screen.findByRole('listbox')
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull())
  })

  it('21 件で 20 件と「ほか 1 件」', async () => {
    const user = userEvent.setup()
    const h = await setup()
    h.emit(
      commandsEvent(
        Array.from({ length: 21 }, (_, i) => ({ name: `c${String(i).padStart(2, '0')}` }))
      )
    )
    await waitFor(() => expect(input()).toBeInTheDocument())
    await user.click(input())
    await user.keyboard('/')
    const list = await screen.findByRole('listbox')
    expect(list.querySelectorAll('[role="option"]')).toHaveLength(20)
    expect(list).toHaveTextContent(COMPOSER_LABELS.moreCommands(1))
  })

  it('構成が届いていない (一覧が無い) ときは出ない', async () => {
    const user = userEvent.setup()
    await setup()
    await waitFor(() => expect(input()).toBeInTheDocument())
    await user.click(input())
    await user.keyboard('/re')
    expect(screen.queryByRole('listbox')).toBeNull()
  })
})
