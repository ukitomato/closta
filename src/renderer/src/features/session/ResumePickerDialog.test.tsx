import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'

import { CAPABILITY_KEY, type PastResumeDTO } from '@domain/capability'
import type { SessionIndexDTO } from '@domain/session/dto'

import { useSessionsStore } from '@/stores/sessions'
import { useUiStore } from '@/stores/ui'
import { installCapability } from '@/test-support/capability'

import { RESUME_PICKER_LABELS, RESUME_UNAVAILABLE_LABELS } from './labels'
import { resumePickerRows } from './resume-picker-rows'
import { ResumePickerDialog } from './ResumePickerDialog'
import { RunningSessionStoreContext } from './running-session-context'
import { createRunningSessionStore, type RunningSessionStore } from './running-session-store'

/** 025 FE-053 — `/resume` の選ぶ画面 (data-model §7.3 / §7.4)。 */

const summary = (sessionId: string, text: string, targetKey = 't1'): object => ({
  sessionId,
  targetKey,
  targetLabel: 'x',
  summary: text,
  firstPrompt: null,
  customTitle: null,
  lastModified: 1_700_000_000_000
})

const indexOf = (complete: boolean, groups: readonly object[]): SessionIndexDTO =>
  ({ groups, outcomes: [], fetchedAt: 0, complete }) as unknown as SessionIndexDTO

const FOLDER_GROUPS = [
  {
    kind: 'folder',
    folderId: 'f1',
    boundary: 'inside',
    sessions: [summary('s1', 'alpha 作業'), summary('s2', 'beta 調査')]
  },
  { kind: 'folder', folderId: 'f2', boundary: 'inside', sessions: [summary('s3', 'other folder')] },
  { kind: 'unknown', reasonKey: 'x', sessions: [summary('s4', 'unknown group')] }
]

const OK: PastResumeDTO = { ok: true, folderId: 'f1', runtimeId: 'r1', providerId: null }

let store: RunningSessionStore

function mount(
  resolvePastResume: (k: string, c: string) => Promise<PastResumeDTO>,
  handlers: { onClose?: () => void; returnFocus?: () => void } = {}
): ReturnType<typeof render> {
  installCapability({ resolvePastResume })
  store = createRunningSessionStore(() => window[CAPABILITY_KEY])
  return render(
    <RunningSessionStoreContext.Provider value={store}>
      <ResumePickerDialog
        folderId="f1"
        onClose={handlers.onClose ?? (() => {})}
        returnFocus={handlers.returnFocus ?? (() => {})}
      />
    </RunningSessionStoreContext.Provider>
  )
}

beforeEach(() => {
  useUiStore.setState({ launchOpen: false })
  useSessionsStore.setState({ index: indexOf(true, FOLDER_GROUPS) })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('resumePickerRows', () => {
  it('同じ folderId の folder のグループの行だけを順に返す', () => {
    const rows = resumePickerRows(indexOf(true, FOLDER_GROUPS), 'f1')
    expect(rows.map((r) => r.sessionId)).toEqual(['s1', 's2'])
    expect(rows[0]?.title).toBe('alpha 作業')
    expect(resumePickerRows(null, 'f1')).toEqual([])
  })
})

describe('ResumePickerDialog', () => {
  it('同じフォルダの過去のセッションだけが並ぶ。axe の違反は 0', async () => {
    mount(async () => OK)
    const options = await screen.findAllByRole('option')
    expect(options.map((o) => o.textContent)).toEqual([
      expect.stringContaining('alpha 作業'),
      expect.stringContaining('beta 調査')
    ])
    expect(screen.queryByText('other folder')).toBeNull()
    expect(
      (
        await axe(document.body, {
          rules: { 'color-contrast': { enabled: false }, region: { enabled: false } }
        })
      ).violations
    ).toEqual([])
  })

  it('検索で絞れる', async () => {
    mount(async () => OK)
    fireEvent.change(await screen.findByRole('combobox'), { target: { value: 'beta' } })
    expect(screen.getAllByRole('option')).toHaveLength(1)
  })

  it('矢印キーと Enter だけで選べる。ok なら再開の形のダイアログに進む', async () => {
    const resolvePastResume = vi.fn(async () => OK)
    const onClose = vi.fn()
    const returnFocus = vi.fn()
    mount(resolvePastResume, { onClose, returnFocus })
    const input = await screen.findByRole('combobox')
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    expect(resolvePastResume).toHaveBeenCalledWith('t1', 's2')
    expect(useUiStore.getState().launchOpen).toBe(true)
    expect(store.getState().launch.resume?.source).toEqual({
      kind: 'past',
      targetKey: 't1',
      conversationId: 's2'
    })
  })

  it('ok でなければ開いたまま理由を role=alert で 1 行出す', async () => {
    const onClose = vi.fn()
    mount(async () => ({ ok: false, reason: 'cwd-mismatch' }), { onClose })
    fireEvent.click((await screen.findAllByRole('option'))[0] as HTMLElement)
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBe(RESUME_UNAVAILABLE_LABELS['cwd-mismatch'])
    expect(onClose).not.toHaveBeenCalled()
    expect(useUiStore.getState().launchOpen).toBe(false)
  })

  it('索引が null / complete: false で 0 件なら「読み込み中」', async () => {
    useSessionsStore.setState({ index: indexOf(false, []) })
    mount(async () => OK)
    expect((await screen.findByTestId('resume-picker-empty')).textContent).toBe(
      RESUME_PICKER_LABELS.loading
    )
  })

  it('complete で 0 件なら「このフォルダに過去のセッションはありません」', async () => {
    useSessionsStore.setState({ index: indexOf(true, []) })
    mount(async () => OK)
    expect((await screen.findByTestId('resume-picker-empty')).textContent).toBe(
      RESUME_PICKER_LABELS.empty
    )
  })

  it('Esc で閉じると onClose と composer への戻しが呼ばれ、interruptSession は呼ばれない', async () => {
    const interruptSession = vi.fn()
    const onClose = vi.fn()
    const returnFocus = vi.fn()
    mount(async () => OK, { onClose, returnFocus })
    installCapability({ interruptSession })
    fireEvent.keyDown(await screen.findByRole('combobox'), { key: 'Escape' })
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(interruptSession).not.toHaveBeenCalled()
  })
})
