import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'

import type { ProviderSummaryDTO } from '@domain/provider/dto'
import type { RuntimeDescriptorDTO, RuntimeListDTO } from '@domain/runtime/dto'
import type { PresetDTO } from '@domain/session/preset'
import type {
  FolderListDTO,
  FolderRuntimeResolutionDTO,
  WorkspaceFolderDTO
} from '@domain/workspace/dto'

import { installCapability } from '@/test-support/capability'

import { RESUME_UNAVAILABLE_LABELS } from './labels'
import { LaunchDialog, type LaunchSource } from './LaunchDialog'
import type { ResumeDialogState } from './running-session-types'
import { DEFAULT_EXTRA_AXES } from '@domain/session/launch-config'

/**
 * X-9 FE-011 — 再開の形の起動ダイアログ (data-model §9.3 / §9.4)。新規起動の既存のテスト
 * (`LaunchDialog.test.tsx`) は書き換えない。
 */

const CONVERSATION_ID = '99999999-9999-4999-8999-999999999999'

const runtimeDto: RuntimeDescriptorDTO = {
  id: 'wsl:Ubuntu',
  kind: 'wsl',
  distroName: 'Ubuntu',
  wslVersion: 2,
  state: 'running',
  isDefault: false,
  capabilities: {
    probeState: 'done',
    sandboxKind: 'none',
    seccompStatus: 'unknown',
    missingDependencies: [],
    probedAt: 0,
    autoModeAllowed: false,
    autoModeStatus: 'unavailable'
  },
  hasPathMapping: true,
  detectedAt: 0,
  claudeStatus: null,
  claudeOverridden: false
}

const folderDto: WorkspaceFolderDTO = {
  id: 'ubuntu-proj',
  location: { kind: 'wsl', distroName: 'Ubuntu' },
  path: { namespace: 'wsl:Ubuntu', value: '/home/u/proj' },
  displayName: 'ubuntu-proj',
  reachability: 'reachable',
  unreachableReason: null,
  blockedReason: null,
  resolutionSteps: [],
  registeredAt: 0
}

const folders: FolderListDTO = {
  folders: [folderDto],
  restoreIssues: { skipped: 0, reasonKeys: [], backupPath: null }
}

const runtimes: RuntimeListDTO = {
  wslAvailability: 'available',
  runtimes: [runtimeDto],
  enumerationIssues: []
}

const bedrock: ProviderSummaryDTO = {
  id: 'p-bedrock',
  displayName: '業務用 Bedrock',
  backend: 'bedrock',
  source: 'aws-profile',
  modelCount: 1,
  models: [{ id: 'sonnet', displayName: 'Sonnet', supportedEffortLevels: ['low', 'high'] }]
}

const resolution: FolderRuntimeResolutionDTO = {
  reachability: 'reachable',
  unreachableReason: null,
  blockedReason: null,
  resolutionSteps: [],
  boundary: 'native',
  runtimePath: null,
  recommendation: null
}

function install(over: Parameters<typeof installCapability>[0] = {}): void {
  installCapability({
    listFolders: async () => folders,
    listRuntimes: async () => runtimes,
    listProviders: async () => [bedrock],
    listReachableProviders: async () => ({ reachable: [bedrock], excluded: [] }),
    listPresets: async () => [],
    resolveFolderRuntime: async () => resolution,
    getLaunchUsage: async () => ({ status: 'ok', preset: 0, manual: 0, days: 30 }),
    ...over
  })
}

function resumeState(over: Partial<ResumeDialogState['fixed']> = {}): ResumeDialogState {
  return {
    source: { kind: 'past', targetKey: 'target-1', conversationId: CONVERSATION_ID },
    fixed: { folderId: 'ubuntu-proj', runtimeId: 'wsl:Ubuntu', providerId: 'p-bedrock', ...over },
    initial: null,
    initialOrigin: 'manual',
    replaces: null
  }
}

function fakeSession(over: Partial<LaunchSource> = {}): LaunchSource {
  return {
    phase: 'entry',
    rejectReason: null,
    resume: resumeState(),
    lastConfig: null,
    lastOrigin: null,
    previousFailure: null,
    launch: vi.fn(async () => {}),
    resumeSession: vi.fn(async () => {}),
    ...over
  }
}

describe('LaunchDialog — 再開の形 (X-9 FE-011)', () => {
  it('見出しは「セッションを再開」、ボタンは「再開する」。3 軸は選択の部品ではなく表示名のテキスト', async () => {
    install()
    render(<LaunchDialog session={fakeSession()} />)
    expect(screen.getByRole('heading', { name: 'セッションを再開' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '再開する' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: '起動' })).toBeNull()
    await waitFor(() => {
      const fixed = screen.getByTestId('resume-fixed-axes')
      expect(fixed.textContent).toContain('ubuntu-proj')
      expect(fixed.textContent).toContain('業務用 Bedrock')
    })
    // 選択の部品はモデル・effort・権限モードと追加ディレクトリの「フォルダを追加」だけ (024)。
    const names = screen.getAllByRole('combobox').map((el) => el.getAttribute('aria-label'))
    expect(names).toEqual(['モデル', 'effort', '権限モード', 'フォルダを追加'])
    // 名前の部品は出さない (FR-012)。
    expect(screen.queryByRole('textbox', { name: 'セッション名' })).toBeNull()
  })

  it('権限モードの選択肢は安全 3 値だけ (Principle III)', () => {
    install()
    render(<LaunchDialog session={fakeSession()} />)
    const permission = screen.getByRole('combobox', { name: '権限モード' }) as HTMLSelectElement
    expect([...permission.options].map((o) => o.value)).toEqual(['default', 'plan', 'dontAsk'])
  })

  it('引き継ぐ軸が一覧に無いと「(削除済み)」を出す。ボタンはそのまま', async () => {
    install()
    render(
      <LaunchDialog
        session={fakeSession({ resume: resumeState({ folderId: 'gone', providerId: 'p-gone' }) })}
      />
    )
    await waitFor(() => {
      const text = screen.getByTestId('resume-fixed-axes').textContent ?? ''
      expect(text.match(/\(削除済み\)/g)).toHaveLength(2)
    })
    await waitFor(() =>
      expect((screen.getByRole('button', { name: '再開する' }) as HTMLButtonElement).disabled).toBe(
        false
      )
    )
  })

  it('再開するで resumeSession を呼び、config の 3 軸は fixed。起動元は initialOrigin。launch は呼ばない', async () => {
    install()
    const session = fakeSession()
    render(<LaunchDialog session={session} />)
    await waitFor(() =>
      expect((screen.getByRole('button', { name: '再開する' }) as HTMLButtonElement).disabled).toBe(
        false
      )
    )
    fireEvent.click(screen.getByRole('button', { name: '再開する' }))
    expect(session.resumeSession).toHaveBeenCalledWith(
      {
        source: { kind: 'past', targetKey: 'target-1', conversationId: CONVERSATION_ID },
        config: {
          folderId: 'ubuntu-proj',
          runtimeId: 'wsl:Ubuntu',
          providerId: 'p-bedrock',
          modelId: null,
          effort: null,
          permissionMode: 'default',
          ...DEFAULT_EXTRA_AXES,
          sessionName: null
        }
      },
      'manual'
    )
    expect(session.launch).not.toHaveBeenCalled()
  })

  it('rejected は理由を出し、ダイアログは開いたまま (再開するが押せる)', async () => {
    install()
    render(
      <LaunchDialog
        session={fakeSession({ phase: 'rejected', rejectReason: 'provider-missing' })}
      />
    )
    expect((await screen.findByRole('alert')).textContent).toContain(
      RESUME_UNAVAILABLE_LABELS['provider-missing']
    )
    expect(screen.getByRole('button', { name: '再開する' })).toBeTruthy()
  })

  it('conversation-running の拒否の文言を出す', async () => {
    install()
    render(
      <LaunchDialog
        session={fakeSession({ phase: 'rejected', rejectReason: 'conversation-running' })}
      />
    )
    expect((await screen.findByRole('alert')).textContent).toContain('この会話はすでに実行中です')
  })

  it('DOM に会話の id もパスの目印も出さない。axe の違反は 0', async () => {
    install()
    const { container } = render(<LaunchDialog session={fakeSession()} />)
    await waitFor(() =>
      expect(screen.getByTestId('resume-fixed-axes').textContent).toContain('ubuntu-proj')
    )
    expect(container.innerHTML).not.toContain(CONVERSATION_ID)
    expect(container.innerHTML).not.toContain('target-1')
    expect(container.innerHTML).not.toContain('/home/u')
    expect(
      (await axe(container, { rules: { 'color-contrast': { enabled: false } } })).violations
    ).toEqual([])
  })
})

/**
 * X-9 FE-030 — 選び直せる 3 軸の初期値・プリセット・起動元 (data-model §9.3 / SC-005 / US-3 AC2〜AC4)。
 */
describe('LaunchDialog — 再開の形の初期値とプリセット (X-9 FE-030)', () => {
  const FIXED = { folderId: 'ubuntu-proj', runtimeId: 'wsl:Ubuntu', providerId: 'p-bedrock' }
  const liveState = (
    initial: Partial<NonNullable<ResumeDialogState['initial']>>,
    initialOrigin: ResumeDialogState['initialOrigin'] = 'manual'
  ): ResumeDialogState => ({
    source: { kind: 'live', sessionId: '00000000-0000-4000-8000-000000000001' },
    fixed: FIXED,
    initial: {
      modelId: null,
      effort: null,
      permissionMode: 'default',
      ...DEFAULT_EXTRA_AXES,
      ...initial
    },
    initialOrigin,
    replaces: '00000000-0000-4000-8000-000000000001'
  })
  const preset: PresetDTO = {
    id: 'preset-1',
    name: '別の構成',
    config: {
      folderId: 'other-folder',
      runtimeId: 'wsl:Other',
      providerId: 'p-other',
      modelId: 'sonnet',
      effort: 'high',
      permissionMode: 'plan',
      ...DEFAULT_EXTRA_AXES
    },
    updatedAt: 0
  }

  const model = (): HTMLSelectElement =>
    screen.getByRole('combobox', { name: 'モデル' }) as HTMLSelectElement
  const effort = (): HTMLSelectElement =>
    screen.getByRole('combobox', { name: 'effort' }) as HTMLSelectElement
  const permission = (): HTMLSelectElement =>
    screen.getByRole('combobox', { name: '権限モード' }) as HTMLSelectElement
  async function clickResume(): Promise<void> {
    await waitFor(() =>
      expect((screen.getByRole('button', { name: '再開する' }) as HTMLButtonElement).disabled).toBe(
        false
      )
    )
    fireEvent.click(screen.getByRole('button', { name: '再開する' }))
  }

  it('稼働中の行から開くと 3 軸の初期値は元の値。過去の行から開くと今の既定', async () => {
    install()
    const live = render(
      <LaunchDialog
        session={fakeSession({
          resume: liveState({ modelId: 'sonnet', effort: 'high', permissionMode: 'plan' })
        })}
      />
    )
    await waitFor(() => expect(model().value).toBe('sonnet'))
    expect(effort().value).toBe('high')
    expect(permission().value).toBe('plan')
    live.unmount()

    render(<LaunchDialog session={fakeSession()} />)
    expect(model().value).toBe('')
    expect(effort().value).toBe('')
    expect(permission().value).toBe('default')
  })

  it('元のモデルが今の Provider で選べないと既定に戻り、通知が出る (US-3 AC4)。起動の引数も既定', async () => {
    install()
    const session = fakeSession({
      resume: liveState({ modelId: 'removed-model', effort: null, permissionMode: 'default' })
    })
    render(<LaunchDialog session={session} />)
    await waitFor(() => expect(screen.getByRole('status', { name: '既定に戻した軸' })).toBeTruthy())
    expect(model().value).toBe('')
    await clickResume()
    expect(session.resumeSession).toHaveBeenCalledWith(
      expect.objectContaining({ config: expect.objectContaining({ modelId: null }) }),
      'manual'
    )
  })

  it('モデルを変えて再開すると起動の引数にその値 (3 軸は fixed のまま)', async () => {
    install()
    const session = fakeSession()
    render(<LaunchDialog session={session} />)
    await waitFor(() =>
      expect(within(model()).getByRole('option', { name: 'Sonnet' })).toBeTruthy()
    )
    fireEvent.change(model(), { target: { value: 'sonnet' } })
    await clickResume()
    expect(session.resumeSession).toHaveBeenCalledWith(
      expect.objectContaining({
        config: {
          ...FIXED,
          modelId: 'sonnet',
          effort: null,
          permissionMode: 'default',
          ...DEFAULT_EXTRA_AXES,
          sessionName: null
        }
      }),
      'manual'
    )
  })

  it('別のフォルダ / ランタイム / Provider を持つプリセットを適用しても fixed は変わらず、選び直せる 3 軸だけが変わる。起動元は preset', async () => {
    install({ listPresets: async () => [preset] })
    const session = fakeSession()
    render(<LaunchDialog session={session} />)
    await waitFor(() => expect(screen.getByRole('button', { name: '適用' })).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: '適用' }))
    await waitFor(() => expect(permission().value).toBe('plan'))
    await clickResume()
    expect(session.resumeSession).toHaveBeenCalledWith(
      expect.objectContaining({
        config: {
          ...FIXED,
          modelId: 'sonnet',
          effort: 'high',
          permissionMode: 'plan',
          ...DEFAULT_EXTRA_AXES,
          sessionName: null
        }
      }),
      'preset'
    )
    // 引き継ぐ 3 軸の選択の部品は出ないまま (差し替える経路が無い)。
    expect(screen.getAllByRole('combobox')).toHaveLength(4)
  })

  it('稼働中の行の上限が初期値で選び直せ、名前の入力は無く送る sessionName は null (US-4 AC4 / AC5)', async () => {
    install()
    const session = fakeSession({
      resume: liveState({ maxTurns: 30, maxBudgetUsd: 2.5 })
    })
    render(<LaunchDialog session={session} />)
    const turns = screen.getByRole('textbox', { name: 'ターン数の上限' }) as HTMLInputElement
    const budget = screen.getByRole('textbox', { name: '費用の上限 (USD)' }) as HTMLInputElement
    expect(turns.value).toBe('30')
    expect(budget.value).toBe('2.5')
    expect(screen.queryByRole('textbox', { name: 'セッション名' })).toBeNull()
    fireEvent.change(turns, { target: { value: '50' } })
    await clickResume()
    expect(session.resumeSession).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({ maxTurns: 50, maxBudgetUsd: 2.5, sessionName: null })
      }),
      'manual'
    )
  })

  it('過去の行は上限なしが初期値 (US-4 AC4)', () => {
    install()
    render(<LaunchDialog session={fakeSession()} />)
    expect(
      (screen.getByRole('textbox', { name: 'ターン数の上限' }) as HTMLInputElement).value
    ).toBe('')
    expect(
      (screen.getByRole('textbox', { name: '費用の上限 (USD)' }) as HTMLInputElement).value
    ).toBe('')
  })

  it('再開の形でプリセットを適用すると上限の入力欄も置き換わり、fixed は変わらない (US-4 AC6)', async () => {
    install({
      listPresets: async () => [{ ...preset, config: { ...preset.config, maxTurns: 7 } }]
    })
    render(<LaunchDialog session={fakeSession()} />)
    await waitFor(() => expect(screen.getByRole('button', { name: '適用' })).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: '適用' }))
    await waitFor(() =>
      expect(
        (screen.getByRole('textbox', { name: 'ターン数の上限' }) as HTMLInputElement).value
      ).toBe('7')
    )
    expect(screen.getByTestId('resume-fixed-axes').textContent).toContain('ubuntu-proj')
  })

  it('プリセットの保存の値の 3 軸は fixed (6 軸の形のまま)', async () => {
    const savePreset = vi.fn(async (_n: string, config: unknown) => ({
      ok: true as const,
      preset: { ...preset, config: config as typeof preset.config }
    }))
    install({ savePreset })
    render(<LaunchDialog session={fakeSession()} />)
    fireEvent.change(await screen.findByTestId('preset-name'), { target: { value: '保存' } })
    await waitFor(() =>
      expect((screen.getByRole('button', { name: '保存' }) as HTMLButtonElement).disabled).toBe(
        false
      )
    )
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => expect(savePreset).toHaveBeenCalledTimes(1))
    expect(savePreset.mock.calls[0][1]).toEqual({
      ...FIXED,
      modelId: null,
      effort: null,
      permissionMode: 'default',
      ...DEFAULT_EXTRA_AXES
    })
  })

  describe('起動元 (H-002)', () => {
    const initial = { modelId: 'sonnet', effort: 'high', permissionMode: 'default' } as const

    it('稼働中の行 (preset) から初期値のまま再開すると preset', async () => {
      install()
      const session = fakeSession({ resume: liveState(initial, 'preset') })
      render(<LaunchDialog session={session} />)
      await waitFor(() => expect(model().value).toBe('sonnet'))
      await clickResume()
      expect(session.resumeSession).toHaveBeenCalledWith(expect.anything(), 'preset')
    })

    it('同じ行から初期値のモデルを手で変えて再開すると manual', async () => {
      install()
      const session = fakeSession({ resume: liveState(initial, 'preset') })
      render(<LaunchDialog session={session} />)
      await waitFor(() => expect(model().value).toBe('sonnet'))
      fireEvent.change(permission(), { target: { value: 'plan' } })
      await clickResume()
      expect(session.resumeSession).toHaveBeenCalledWith(expect.anything(), 'manual')
    })

    it('稼働中の行 (manual) / 過去の行から初期値のまま再開すると manual', async () => {
      install()
      const live = fakeSession({ resume: liveState(initial, 'manual') })
      const v1 = render(<LaunchDialog session={live} />)
      await waitFor(() => expect(model().value).toBe('sonnet'))
      await clickResume()
      expect(live.resumeSession).toHaveBeenCalledWith(expect.anything(), 'manual')
      v1.unmount()

      const past = fakeSession()
      render(<LaunchDialog session={past} />)
      await clickResume()
      expect(past.resumeSession).toHaveBeenCalledWith(expect.anything(), 'manual')
    })

    it('依存解決の自動の reset だけでは手で変えたに数えない (初期値の起動元のまま)', async () => {
      install()
      const session = fakeSession({
        resume: liveState(
          { modelId: 'removed-model', effort: null, permissionMode: 'default' },
          'preset'
        )
      })
      render(<LaunchDialog session={session} />)
      await waitFor(() =>
        expect(screen.getByRole('status', { name: '既定に戻した軸' })).toBeTruthy()
      )
      await clickResume()
      expect(session.resumeSession).toHaveBeenCalledWith(expect.anything(), 'preset')
    })
  })
})
