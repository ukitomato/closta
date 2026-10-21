import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'

import { CAPABILITY_KEY, type PastResumeDTO } from '@domain/capability'
import { RESUME_UNAVAILABLE_REASONS } from '@domain/session/resume'

import { installCapability } from '@/test-support/capability'
import { useUiStore, type FolderDraftSeed } from '@/stores/ui'

import { RESUME_UNAVAILABLE_LABELS } from './labels'
import { PastResumeBar } from './PastResumeBar'
import { RunningSessionStoreContext } from './running-session-context'
import { createRunningSessionStore, type RunningSessionStore } from './running-session-store'

/**
 * X-9 FE-012 — 過去の行の「再開」の帯 (data-model §9.1 / §9.2)。
 */

const CONVERSATION_A = '11111111-1111-4111-8111-111111111111'
const CONVERSATION_B = '22222222-2222-4222-8222-222222222222'

const OK: PastResumeDTO = {
  ok: true,
  folderId: 'f1',
  runtimeId: 'wsl:Ubuntu',
  providerId: null
}

const SEED: FolderDraftSeed = {
  location: { kind: 'wsl', distroName: 'Ubuntu' },
  path: { namespace: 'wsl:Ubuntu', value: '/home/u/other' },
  suggestedDisplayName: 'other'
}

let store: RunningSessionStore

beforeEach(() => {
  useUiStore.setState({ launchOpen: false, folderDraftSeed: null })
})

afterEach(() => {
  vi.restoreAllMocks()
})

function mount(
  resolvePastResume: (targetKey: string, conversationId: string) => Promise<PastResumeDTO>,
  props: { conversationId?: string; registerSeed?: FolderDraftSeed | null } = {}
): ReturnType<typeof render> & { rerenderWith: (conversationId: string) => void } {
  installCapability({ resolvePastResume })
  store = createRunningSessionStore(() => window[CAPABILITY_KEY])
  const element = (conversationId: string): React.JSX.Element => (
    <RunningSessionStoreContext.Provider value={store}>
      <PastResumeBar
        targetKey="target-1"
        conversationId={conversationId}
        registerSeed={props.registerSeed ?? null}
      />
    </RunningSessionStoreContext.Provider>
  )
  const view = render(element(props.conversationId ?? CONVERSATION_A))
  return { ...view, rerenderWith: (id) => view.rerender(element(id)) }
}

function resumeButton(): HTMLButtonElement {
  return screen.getByRole('button', { name: '再開' })
}

describe('PastResumeBar (X-9 FE-012)', () => {
  it('取得中は押せない「再開」で、理由は出さない', () => {
    mount(() => new Promise(() => {}))
    expect(resumeButton().disabled).toBe(true)
    expect(screen.queryByTestId('past-resume-reason')).toBeNull()
  })

  it('ok: true で押せる「再開」。押すと再開の形のダイアログが過去の行の source で開く', async () => {
    mount(async () => OK)
    await waitFor(() => expect(resumeButton().disabled).toBe(false))
    fireEvent.click(resumeButton())
    expect(useUiStore.getState().launchOpen).toBe(true)
    expect(store.getState().launch.resume).toEqual({
      source: { kind: 'past', targetKey: 'target-1', conversationId: CONVERSATION_A },
      fixed: { folderId: 'f1', runtimeId: 'wsl:Ubuntu', providerId: null },
      initial: null,
      initialOrigin: 'manual',
      replaces: null
    })
  })

  it.each(RESUME_UNAVAILABLE_REASONS)(
    '%s: 押せない「再開」と理由の文言が aria-describedby で結ばれる',
    async (reason) => {
      mount(async () => ({ ok: false, reason }))
      const text = await screen.findByTestId('past-resume-reason')
      expect(text.textContent).toBe(RESUME_UNAVAILABLE_LABELS[reason])
      expect(resumeButton().disabled).toBe(true)
      expect(resumeButton().getAttribute('aria-describedby')).toBe(text.id)
    }
  )

  it('folder-unregistered だけ登録の導線を出し、押すと登録の初期値を積む', async () => {
    mount(async () => ({ ok: false, reason: 'folder-unregistered' }), { registerSeed: SEED })
    const register = await screen.findByRole('button', { name: '作業フォルダとして登録' })
    fireEvent.click(register)
    expect(useUiStore.getState().folderDraftSeed).toEqual(SEED)
  })

  it('他の理由では登録の導線を出さない', async () => {
    mount(async () => ({ ok: false, reason: 'cwd-mismatch' }), { registerSeed: SEED })
    await screen.findByTestId('past-resume-reason')
    expect(screen.queryByRole('button', { name: '作業フォルダとして登録' })).toBeNull()
  })

  it('行を選ぶたびに 1 回だけ呼び、選び直したら古い答えを捨てる', async () => {
    const resolvers: ((value: PastResumeDTO) => void)[] = []
    const resolvePastResume = vi.fn(
      () =>
        new Promise<PastResumeDTO>((resolve) => {
          resolvers.push(resolve)
        })
    )
    const view = mount(resolvePastResume)
    expect(resolvePastResume).toHaveBeenCalledTimes(1)
    expect(resolvePastResume).toHaveBeenLastCalledWith('target-1', CONVERSATION_A)

    view.rerenderWith(CONVERSATION_B)
    expect(resolvePastResume).toHaveBeenCalledTimes(2)
    expect(resolvePastResume).toHaveBeenLastCalledWith('target-1', CONVERSATION_B)

    // 古い行の答えが遅れて届いても表示しない。
    await act(async () => {
      resolvers[0]?.({ ok: false, reason: 'cwd-mismatch' })
    })
    expect(screen.queryByTestId('past-resume-reason')).toBeNull()
    expect(resumeButton().disabled).toBe(true)

    await act(async () => {
      resolvers[1]?.(OK)
    })
    expect(resumeButton().disabled).toBe(false)
  })

  it('取得に失敗したら source-unknown の理由を出す', async () => {
    mount(async () => {
      throw new Error('boom')
    })
    expect((await screen.findByTestId('past-resume-reason')).textContent).toBe(
      RESUME_UNAVAILABLE_LABELS['source-unknown']
    )
  })

  it('DOM に会話の id を出さない。axe の違反は 0', async () => {
    const { container } = mount(async () => ({ ok: false, reason: 'folder-unregistered' }), {
      registerSeed: SEED
    })
    await screen.findByTestId('past-resume-reason')
    expect(container.innerHTML).not.toContain(CONVERSATION_A)
    expect(
      (await axe(container, { rules: { 'color-contrast': { enabled: false } } })).violations
    ).toEqual([])
  })
})
