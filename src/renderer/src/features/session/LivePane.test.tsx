import { describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import type { ThreadMessageLike } from '@assistant-ui/react'

import type { ClostaCapability } from '@domain/capability'
import type { RuntimeDescriptorDTO } from '@domain/runtime/dto'
import type { WorkspaceFolderDTO } from '@domain/workspace/dto'

import { installCapability } from '@/test-support/capability'
import { RunningSessionsHarness } from '@/test-support/running-sessions-harness'

import { olderMessagesLabel } from './labels'
import { createRunningSessionStore, type RunningSessionStore } from './running-session-store'
import { RunningSessionStoreContext } from './running-session-context'
import { MESSAGE_WINDOW } from './session-view'

/**
 * X-5 / SC-003 — 表示中セッションの本文の窓と、中央のヘッダの表示名 (pr-gate R2 po L-102 / L-101)。
 * 純関数の境界は session-view.test.ts。ここでは面としての振る舞いを確かめる:
 * 省略行が出る → 「さらに表示」で消える → 別セッションへ切り替えて戻っても広げた窓が保たれる。
 * O-7 で `SessionScreen` を稼働中の区画 (`RunningSessionList`) と中央 (シェルの `RunningCenter` = 中央のヘッダ + `LivePane`) に分けた (観点は変えない)。
 */

const NOW = 1_700_000_000_000
const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'

const UBUNTU: RuntimeDescriptorDTO = {
  id: 'wsl:Ubuntu',
  kind: 'wsl',
  distroName: 'Ubuntu',
  wslVersion: 2,
  state: 'running',
  isDefault: true,
  capabilities: {
    probeState: 'done',
    sandboxKind: 'bubblewrap',
    seccompStatus: 'unknown',
    missingDependencies: [],
    probedAt: NOW,
    autoModeAllowed: true,
    autoModeStatus: 'allowed'
  },
  hasPathMapping: true,
  detectedAt: NOW
}

const FOLDER: WorkspaceFolderDTO = {
  id: 'wf_0123456789ab',
  location: { kind: 'wsl', distroName: 'Ubuntu' },
  path: { namespace: 'wsl:Ubuntu', value: '/home/u/proj' },
  displayName: '案件フォルダ',
  reachability: 'reachable',
  unreachableReason: null,
  blockedReason: null,
  resolutionSteps: [],
  registeredAt: NOW
}

function messages(count: number): ThreadMessageLike[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `m${i}`,
    role: 'assistant' as const,
    content: [{ type: 'text' as const, text: `本文 ${i}` }]
  }))
}

async function setup(options: {
  lists: 'loaded' | 'pending'
  capability?: Partial<ClostaCapability>
}): Promise<RunningSessionStore> {
  const never = new Promise<never>(() => undefined)
  const launch = vi.fn()
  launch.mockResolvedValueOnce({ status: 'launching', sessionId: A })
  launch.mockResolvedValueOnce({ status: 'launching', sessionId: B })
  const cap = installCapability({
    ...options.capability,
    listFolders: () =>
      options.lists === 'loaded'
        ? Promise.resolve({
            folders: [FOLDER],
            restoreIssues: { skipped: 0, reasonKeys: [], backupPath: null }
          })
        : never,
    listRuntimes: () =>
      options.lists === 'loaded'
        ? Promise.resolve({
            runtimes: [UBUNTU],
            enumerationIssues: [],
            wslAvailability: 'available'
          })
        : never,
    launchSession: launch
  })
  const store = createRunningSessionStore(() => cap)
  store.attach(window)
  for (let i = 0; i < 2; i += 1) {
    await store.launch({
      folderId: FOLDER.id,
      runtimeId: UBUNTU.id,
      providerId: null,
      modelId: null,
      effort: null,
      permissionMode: 'default'
    })
  }
  store.setState((s) => ({
    sessions: {
      ...s.sessions,
      [A]: { ...s.sessions[A]!, messages: messages(MESSAGE_WINDOW + 1) }
    },
    selectedId: A
  }))
  render(
    <RunningSessionStoreContext.Provider value={store}>
      <RunningSessionsHarness />
    </RunningSessionStoreContext.Provider>
  )
  return store
}

describe('LivePane — 本文の窓 (SC-003 / pr-gate R2 po L-102)', () => {
  it('窓からあふれた件数を省略行で示し、「さらに表示」で消える。切り替えて戻っても広げた窓が保たれる', async () => {
    const store = await setup({ lists: 'loaded' })
    const older = await screen.findByTestId('older-messages')
    expect(older).toHaveTextContent('古いメッセージ 1 件を省略しています。')

    await userEvent.click(within(older).getByRole('button', { name: 'さらに表示' }))
    await waitFor(() => expect(screen.queryByTestId('older-messages')).toBeNull())

    act(() => store.select(B))
    await waitFor(() => expect(store.getState().selectedId).toBe(B))
    act(() => store.select(A))
    await waitFor(() => expect(store.getState().selectedId).toBe(A))
    expect(screen.queryByTestId('older-messages')).toBeNull()
  })
})

describe('RunningCenter (シェル) — 中央のヘッダの表示名 (pr-gate R1 po L-001 / R2 po L-101)', () => {
  it('一覧を読み込んだらフォルダの表示名を出す', async () => {
    await setup({ lists: 'loaded' })
    await waitFor(() =>
      expect(screen.getByTestId('session-title')).toHaveTextContent('案件フォルダ')
    )
  })

  it('一覧の読み込み中は「登録が解除された作業フォルダ」と断定しない', async () => {
    await setup({ lists: 'pending' })
    expect(await screen.findByTestId('session-title')).not.toHaveTextContent('登録が解除された')
  })
})

describe('LivePane — 承認待ちの件数から移る (O-1 US-1 AC2 / design-gate R2 M-07)', () => {
  it('見出しの件数を押すと承認待ちのセッションへ移り、その承認カードが描画される', async () => {
    const store = await setup({ lists: 'loaded' })
    act(() =>
      store.setState((s) => ({
        sessions: {
          ...s.sessions,
          [B]: {
            ...s.sessions[B]!,
            runState: 'awaiting_permission',
            pending: { requestId: 'r1', toolName: 'Bash', input: 'ls -la', scope: 'once' }
          }
        }
      }))
    )
    expect(store.getState().selectedId).toBe(A)
    await userEvent.click(await screen.findByTestId('awaiting-count'))
    await waitFor(() => expect(store.getState().selectedId).toBe(B))
    expect(await screen.findByText(/の実行を求めています/)).toBeInTheDocument()
    expect(screen.getAllByText('Bash').length).toBeGreaterThan(0)
  })
})

describe('LivePane — 押したボタンが消えた後のフォーカス (O-4 FR-019 / SC-007。014 data-model §8)', () => {
  const composer = (): HTMLElement => screen.getByRole('textbox', { name: 'メッセージ' })

  it.each(['許可', '拒否'])(
    '承認待ちで「%s」を押した後、composer にフォーカスがある (body に落とさない)',
    async (name) => {
      const respondPermission = vi.fn(async () => {})
      const store = await setup({ lists: 'loaded', capability: { respondPermission } })
      act(() =>
        store.setState((s) => ({
          sessions: {
            ...s.sessions,
            [A]: {
              ...s.sessions[A]!,
              runState: 'awaiting_permission',
              pending: { requestId: 'r1', toolName: 'Bash', input: 'ls -la', scope: 'once' }
            }
          }
        }))
      )
      const card = await screen.findByRole('alertdialog', { name: 'ツールの実行許可' })
      await userEvent.click(within(card).getByRole('button', { name }))
      await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
      expect(respondPermission).toHaveBeenCalledWith(
        A,
        'r1',
        name === '許可' ? 'allow' : 'deny',
        'once'
      )
      expect(document.activeElement).not.toBe(document.body)
      expect(document.activeElement).toBe(composer())
    }
  )

  it('「さらに表示」の最後の押下 (省略が窓の幅以下) の後、composer にフォーカスがある', async () => {
    await setup({ lists: 'loaded' })
    const older = await screen.findByTestId('older-messages')
    await userEvent.click(within(older).getByRole('button', { name: 'さらに表示' }))
    await waitFor(() => expect(screen.queryByTestId('older-messages')).toBeNull())
    expect(document.activeElement).toBe(composer())
  })

  it('「さらに表示」を押しても省略が残るときは、押したボタンにフォーカスを残す', async () => {
    const store = await setup({ lists: 'loaded' })
    act(() =>
      store.setState((s) => ({
        sessions: {
          ...s.sessions,
          [A]: { ...s.sessions[A]!, messages: messages(MESSAGE_WINDOW * 2 + 1) }
        }
      }))
    )
    const older = await screen.findByTestId('older-messages')
    await waitFor(() => expect(older).toHaveTextContent(olderMessagesLabel(MESSAGE_WINDOW + 1)))
    const button = within(older).getByRole('button', { name: 'さらに表示' })
    await userEvent.click(button)
    await waitFor(() => expect(older).toHaveTextContent(olderMessagesLabel(1)))
    expect(document.activeElement).toBe(button)
  })
})
