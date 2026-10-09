import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi, type Mock } from 'vitest'

import type { ClostaCapability } from '@domain/capability'
import type { ProviderSummaryDTO } from '@domain/provider/dto'
import type { RuntimeDescriptorDTO, RuntimeListDTO } from '@domain/runtime/dto'
import type { SessionLaunchConfig } from '@domain/session/launch-config'
import type { PresetDTO } from '@domain/session/preset'
import type {
  FolderListDTO,
  FolderRuntimeResolutionDTO,
  WorkspaceFolderDTO
} from '@domain/workspace/dto'

import { installCapability } from '@/test-support/capability'

import { launchFailureLabel } from './labels'
import { LaunchDialog, type LaunchSource } from './LaunchDialog'
import { createRunningSessionStore, type RunningSessionStore } from './running-session-store'

/**
 * 起動設定ダイアログの renderer 単体 (X-4 FE-005 / FE-020 / SC-001 / SC-002 / SC-005 / SC-008 / US-1 AC6-7 / US-2 AC3)。
 * preload をスタブし Electron を起動しない。
 */

const NOW = 0

function runtimeDto(
  distro: string,
  state: 'running' | 'stopped' = 'running',
  probeState: RuntimeDescriptorDTO['capabilities']['probeState'] = 'done'
): RuntimeDescriptorDTO {
  return {
    id: `wsl:${distro}`,
    kind: 'wsl',
    distroName: distro,
    wslVersion: 2,
    state,
    isDefault: false,
    capabilities: {
      probeState,
      sandboxKind: 'none',
      seccompStatus: 'unknown',
      missingDependencies: [],
      probedAt: NOW,
      autoModeAllowed: false,
      autoModeStatus: 'unavailable'
    },
    hasPathMapping: true,
    detectedAt: NOW
  }
}

function folderDto(id: string, location: WorkspaceFolderDTO['location']): WorkspaceFolderDTO {
  return {
    id,
    location,
    path:
      location.kind === 'wsl'
        ? { namespace: `wsl:${location.distroName}`, value: '/home/u/proj' }
        : { namespace: 'host', value: 'C:\\dev\\proj' },
    displayName: id,
    reachability: 'reachable',
    unreachableReason: null,
    blockedReason: null,
    resolutionSteps: [],
    registeredAt: NOW
  }
}

const folders: FolderListDTO = {
  folders: [
    folderDto('ubuntu-proj', { kind: 'wsl', distroName: 'Ubuntu' }),
    folderDto('win-proj', { kind: 'windows' })
  ],
  restoreIssues: { skipped: 0, reasonKeys: [], backupPath: null }
}

const runtimes: RuntimeListDTO = {
  wslAvailability: 'available',
  runtimes: [runtimeDto('Ubuntu'), runtimeDto('Debian'), runtimeDto('Stopped', 'stopped')],
  enumerationIssues: []
}

const bedrock: ProviderSummaryDTO = {
  id: 'p-bedrock',
  displayName: '業務用 Bedrock',
  backend: 'bedrock',
  source: 'aws-profile',
  modelCount: 2,
  models: [
    { id: 'sonnet', displayName: 'Sonnet', supportedEffortLevels: ['low', 'high'] },
    { id: 'haiku', displayName: 'Haiku' }
  ]
}
const far: ProviderSummaryDTO = {
  id: 'p-far',
  displayName: '別 distro の config',
  backend: 'anthropic',
  source: 'config-dir',
  modelCount: 0,
  models: []
}

function fakeSession(over: Partial<LaunchSource> = {}): LaunchSource {
  return {
    phase: 'entry',
    rejectReason: null,
    lastConfig: null,
    lastOrigin: null,
    previousFailure: null,
    launch: vi.fn(async () => {}),
    ...over
  }
}

function install(over: Parameters<typeof installCapability>[0] = {}): ClostaCapability {
  return installCapability({
    listFolders: async () => folders,
    listRuntimes: async () => runtimes,
    listProviders: async () => [bedrock, far],
    listReachableProviders: async (runtimeId) =>
      runtimeId === 'wsl:Ubuntu'
        ? { reachable: [bedrock], excluded: [{ provider: far, reason: 'unreachable' }] }
        : { reachable: [bedrock, far], excluded: [] },
    listPresets: async () => [],
    resolveFolderRuntime: async () => resolutionDto('native'),
    getLaunchUsage: async () => ({ status: 'ok', preset: 0, manual: 0, days: 30 }),
    ...over
  })
}

/** 既存の解決結果 DTO (越境の判定の正本。pr-gate C-001)。 */
function resolutionDto(
  boundary: FolderRuntimeResolutionDTO['boundary'],
  impact: string | null = null
): FolderRuntimeResolutionDTO {
  return {
    reachability: 'reachable',
    unreachableReason: null,
    blockedReason: null,
    resolutionSteps: [],
    boundary,
    runtimePath: null,
    recommendation:
      impact === null
        ? null
        : { impact, suggestedLocation: { namespace: 'wsl:Ubuntu', value: '/home/u' }, steps: [] }
  }
}

/** 変換材料が無いときの解決結果 (resolution.ts stage2)。既定は probe 前 (`capabilities-not-probed`)。 */
function blockedDto(
  reason: NonNullable<FolderRuntimeResolutionDTO['blockedReason']> = 'capabilities-not-probed'
): FolderRuntimeResolutionDTO {
  const steps: Record<typeof reason, FolderRuntimeResolutionDTO['resolutionSteps']> = {
    'distro-not-running': ['start-distro', 'rescan-runtimes'],
    'probe-failed': ['rescan-runtimes'],
    'capabilities-not-probed': ['wait-for-probe']
  }
  return {
    reachability: 'blocked',
    unreachableReason: null,
    blockedReason: reason,
    resolutionSteps: steps[reason],
    boundary: 'unknown',
    runtimePath: null,
    recommendation: null
  }
}

/** 到達不可の解決結果 (resolution.ts の `unreachable`)。 */
function unreachableDto(
  reason: NonNullable<FolderRuntimeResolutionDTO['unreachableReason']>
): FolderRuntimeResolutionDTO {
  return {
    reachability: 'unreachable',
    unreachableReason: reason,
    blockedReason: null,
    resolutionSteps: [],
    boundary: 'unknown',
    runtimePath: null,
    recommendation: null
  }
}

/** 解決を待たせる promise (取得中の状態を観測する)。 */
function never<T>(): Promise<T> {
  return new Promise<T>(() => {})
}

function selects(): HTMLSelectElement[] {
  return screen.getAllByRole('combobox') as HTMLSelectElement[]
}

async function choose(index: number, value: string): Promise<void> {
  await waitFor(() =>
    expect(
      within(selects()[index]).queryByRole('option', {
        name: (_n, el) => (el as HTMLOptionElement).value === value
      })
    ).not.toBeNull()
  )
  fireEvent.change(selects()[index], { target: { value } })
}

describe('LaunchDialog', () => {
  it('select はフォルダ・ランタイムを先頭に置く (E2E の前提)。権限モードは安全 3 値だけ', async () => {
    install()
    render(<LaunchDialog session={fakeSession()} />)
    await choose(0, 'ubuntu-proj')
    const permission = screen.getByRole('combobox', { name: '権限モード' }) as HTMLSelectElement
    expect([...permission.options].map((o) => o.value)).toEqual(['default', 'plan', 'dontAsk'])
  })

  it('dontAsk を選ぶと承認カードが出ないことを説明する (US-1 AC6)', async () => {
    install()
    render(<LaunchDialog session={fakeSession()} />)
    fireEvent.change(screen.getByRole('combobox', { name: '権限モード' }), {
      target: { value: 'dontAsk' }
    })
    expect(screen.getByTestId('permission-mode-description').textContent).toContain(
      '承認カードは出ません'
    )
  })

  it('到達できない Provider は選択肢に出ず、除外理由を示す (SC-001)', async () => {
    install()
    render(<LaunchDialog session={fakeSession()} />)
    await choose(0, 'ubuntu-proj')
    await choose(1, 'wsl:Ubuntu')
    await waitFor(() =>
      expect(screen.getByRole('list', { name: '選べない Provider' })).toBeInTheDocument()
    )
    const provider = screen.getByRole('combobox', { name: 'Provider' }) as HTMLSelectElement
    expect([...provider.options].map((o) => o.value)).toEqual(['', 'p-bedrock'])
    expect(screen.getByRole('list', { name: '選べない Provider' }).textContent).toContain(
      '到達できません'
    )
  })

  it('Provider を選ぶとモデルカタログに切り替わり、モデルの対応 effort だけが出る', async () => {
    install()
    render(<LaunchDialog session={fakeSession()} />)
    await choose(0, 'ubuntu-proj')
    await choose(1, 'wsl:Ubuntu')
    await choose(2, 'p-bedrock')
    const model = screen.getByRole('combobox', { name: 'モデル' }) as HTMLSelectElement
    expect([...model.options].map((o) => o.value)).toEqual(['', 'sonnet', 'haiku'])
    fireEvent.change(model, { target: { value: 'sonnet' } })
    const effort = screen.getByRole('combobox', { name: 'effort' }) as HTMLSelectElement
    expect([...effort.options].map((o) => o.value)).toEqual(['', 'low', 'high'])
    fireEvent.change(model, { target: { value: 'haiku' } })
    expect(
      [...(screen.getByRole('combobox', { name: 'effort' }) as HTMLSelectElement).options].map(
        (o) => o.value
      )
    ).toEqual([''])
  })

  it('起動は検証済みの起動設定で session.launch を呼ぶ', async () => {
    install()
    const session = fakeSession()
    render(<LaunchDialog session={session} />)
    await choose(0, 'ubuntu-proj')
    await choose(1, 'wsl:Ubuntu')
    await choose(2, 'p-bedrock')
    fireEvent.change(screen.getByRole('combobox', { name: 'モデル' }), {
      target: { value: 'sonnet' }
    })
    fireEvent.change(screen.getByRole('combobox', { name: 'effort' }), {
      target: { value: 'high' }
    })
    fireEvent.click(screen.getByRole('button', { name: '起動' }))
    expect(session.launch).toHaveBeenCalledWith(
      {
        folderId: 'ubuntu-proj',
        runtimeId: 'wsl:Ubuntu',
        providerId: 'p-bedrock',
        modelId: 'sonnet',
        effort: 'high',
        permissionMode: 'default'
      },
      'manual'
    )
  })

  it('ランタイム変更で到達不可になった Provider は既定へ戻り、起動前に確認する (承認 → 既定で起動)', async () => {
    install()
    const session = fakeSession({
      lastConfig: {
        folderId: 'win-proj',
        runtimeId: 'wsl:Debian',
        providerId: 'p-far',
        modelId: null,
        effort: null,
        permissionMode: 'default'
      }
    })
    render(<LaunchDialog session={session} />)
    // Debian では p-far は到達可能。Ubuntu に変えると到達不可 → 既定へ。
    await choose(1, 'wsl:Ubuntu')
    await waitFor(() =>
      expect(screen.getByRole('status', { name: '既定に戻した軸' }).textContent).toContain(
        '到達できない'
      )
    )
    fireEvent.click(screen.getByRole('button', { name: '起動' }))
    expect(session.launch).not.toHaveBeenCalled()
    const dialog = screen.getByRole('alertdialog', { name: '既定 Provider での起動の確認' })
    expect(dialog.textContent).toContain('既定の資格情報と課金先')
    fireEvent.click(within(dialog).getByRole('button', { name: '既定 Provider で起動する' }))
    expect(session.launch).toHaveBeenCalledWith(
      expect.objectContaining({ providerId: null }),
      'manual'
    )
  })

  it('確認を拒否するとダイアログに戻り、起動しない', async () => {
    install()
    const session = fakeSession({
      lastConfig: {
        folderId: 'ubuntu-proj',
        runtimeId: 'wsl:Ubuntu',
        providerId: 'p-removed',
        modelId: null,
        effort: null,
        permissionMode: 'default'
      }
    })
    render(<LaunchDialog session={session} />)
    await waitFor(() =>
      expect(screen.getByRole('status', { name: '既定に戻した軸' }).textContent).toContain(
        '削除されていた'
      )
    )
    fireEvent.click(screen.getByRole('button', { name: '起動' }))
    fireEvent.click(screen.getByRole('button', { name: '戻って選び直す' }))
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(session.launch).not.toHaveBeenCalled()
  })

  it('folder↔runtime の distro 不一致は起動不可で理由を示す (blocker)', async () => {
    install()
    render(<LaunchDialog session={fakeSession()} />)
    await choose(0, 'ubuntu-proj')
    await choose(1, 'wsl:Debian')
    expect(screen.getByRole('alert').textContent).toContain('ディストロが一致しません')
    expect(screen.getByRole('button', { name: '起動' })).toBeDisabled()
  })

  it('停止中ランタイムは blocker と再評価ボタンを出す。再評価でランタイムを取り直す', async () => {
    const cap = install({ refreshRuntimes: vi.fn(async () => runtimes) })
    render(<LaunchDialog session={fakeSession()} />)
    await choose(0, 'win-proj')
    await choose(1, 'wsl:Stopped')
    expect(screen.getByRole('alert').textContent).toContain('停止しています')
    fireEvent.click(screen.getByRole('button', { name: '再評価' }))
    await waitFor(() => expect(cap.refreshRuntimes).toHaveBeenCalled())
  })

  describe('越境の警告は解決結果 DTO の boundary だけで判定する (SC-008 / FR-008 / AD-016 / pr-gate C-001)', () => {
    it('WSL 所在 + Windows マウント配下 + 同じ distro で DTO が cross → 警告が出て、起動ボタンは有効', async () => {
      const resolveFolderRuntime = vi.fn(async () =>
        resolutionDto('cross', 'Windows 側のファイルシステムを経由するため遅くなります。')
      )
      install({ resolveFolderRuntime })
      render(<LaunchDialog session={fakeSession()} />)
      await choose(0, 'ubuntu-proj')
      await choose(1, 'wsl:Ubuntu')
      await waitFor(() =>
        expect(screen.getByTestId('cross-boundary-warning').textContent).toContain(
          'Windows 側のファイルシステムを経由する'
        )
      )
      expect(resolveFolderRuntime).toHaveBeenCalledWith('ubuntu-proj', 'wsl:Ubuntu')
      // 同じ distro なので distro-mismatch の blocker は出ない。越境は警告のみ。
      expect(screen.queryByRole('alert')).toBeNull()
      expect(screen.getByRole('button', { name: '起動' })).toBeEnabled()
    })

    it('Windows フォルダ + WSL ランタイムで DTO が cross → 警告が出て、起動ボタンは有効', async () => {
      install({ resolveFolderRuntime: async () => resolutionDto('cross') })
      render(<LaunchDialog session={fakeSession()} />)
      await choose(0, 'win-proj')
      await choose(1, 'wsl:Ubuntu')
      await waitFor(() =>
        expect(screen.getByTestId('cross-boundary-warning').textContent).toContain(
          'ファイル操作が遅くなることがあります'
        )
      )
      expect(screen.getByRole('button', { name: '起動' })).toBeEnabled()
    })

    it('DTO が native なら (Windows フォルダでも) 警告を出さない — 規則を再定義しない', async () => {
      install({ resolveFolderRuntime: async () => resolutionDto('native') })
      render(<LaunchDialog session={fakeSession()} />)
      await choose(0, 'win-proj')
      await choose(1, 'wsl:Ubuntu')
      await waitFor(() => expect(screen.getByRole('button', { name: '起動' })).toBeEnabled())
      expect(screen.queryByTestId('cross-boundary-warning')).toBeNull()
    })

    it('DTO の取得中は警告を出さず起動を保留し、取得に失敗したら「判定できなかった」ことを示す (起動はできる)', async () => {
      install({ resolveFolderRuntime: () => never() })
      const session = fakeSession()
      const { unmount } = render(<LaunchDialog session={session} />)
      await choose(0, 'win-proj')
      await choose(1, 'wsl:Ubuntu')
      expect(screen.queryByTestId('cross-boundary-warning')).toBeNull()
      expect(screen.queryByTestId('cross-boundary-unknown')).toBeNull()
      // 取得中は起動できない (越境の警告を見ないまま起動させない。R2 architecture M-001)。
      expect(screen.getByTestId('folder-runtime-checking')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: '起動' })).toBeDisabled()
      fireEvent.click(screen.getByRole('button', { name: '起動' }))
      expect(session.launch).not.toHaveBeenCalled()
      unmount()

      install({ resolveFolderRuntime: () => Promise.reject(new Error('unavailable')) })
      render(<LaunchDialog session={fakeSession()} />)
      await choose(0, 'win-proj')
      await choose(1, 'wsl:Ubuntu')
      await waitFor(() => expect(screen.getByTestId('cross-boundary-unknown')).toBeInTheDocument())
      expect(screen.queryByTestId('cross-boundary-warning')).toBeNull()
      expect(screen.getByRole('button', { name: '起動' })).toBeEnabled()
    })

    it('probe 前の DTO (blocked / capabilities-not-probed) は準備待ちとして起動を保留し、probe 完了の通知で取り直して越境なら警告を出す (R2 architecture M-001 / R3 po M-201)', async () => {
      let probed = false
      const listeners: Array<(list: RuntimeListDTO) => void> = []
      const listOf = (): RuntimeListDTO => ({
        ...runtimes,
        runtimes: [runtimeDto('Ubuntu', 'running', probed ? 'done' : 'probing')]
      })
      const resolveFolderRuntime = vi.fn(async () =>
        probed ? resolutionDto('cross') : blockedDto()
      )
      install({
        listRuntimes: async () => listOf(),
        resolveFolderRuntime,
        onRuntimesChanged: (listener) => {
          listeners.push(listener)
          return () => {}
        }
      })
      const session = fakeSession()
      render(<LaunchDialog session={session} />)
      await choose(0, 'win-proj')
      await choose(1, 'wsl:Ubuntu')
      await waitFor(() =>
        expect(screen.getByTestId('folder-runtime-waiting-probe').textContent).toContain(
          'ランタイムの準備'
        )
      )
      // probe 中は「判定できませんでした…起動はできます」と言わず、起動を保留する。
      expect(screen.queryByTestId('cross-boundary-unknown')).toBeNull()
      expect(screen.queryByTestId('cross-boundary-warning')).toBeNull()
      expect(screen.getByRole('button', { name: '起動' })).toBeDisabled()
      fireEvent.click(screen.getByRole('button', { name: '起動' }))
      expect(session.launch).not.toHaveBeenCalled()

      probed = true
      act(() => listeners.forEach((listener) => listener(listOf())))
      await waitFor(() => expect(screen.getByTestId('cross-boundary-warning')).toBeInTheDocument())
      expect(screen.queryByTestId('cross-boundary-unknown')).toBeNull()
      expect(screen.queryByTestId('folder-runtime-waiting-probe')).toBeNull()
      expect(resolveFolderRuntime).toHaveBeenCalledTimes(2)
      expect(screen.getByRole('button', { name: '起動' })).toBeEnabled()
    })

    it('停止中ランタイム × distro-not-running の DTO では「起動はできます」を出さず、runtime-stopped の blocker に任せる (R3 po M-201 / architecture L-002)', async () => {
      const resolveFolderRuntime = vi.fn(async () => blockedDto('distro-not-running'))
      install({ resolveFolderRuntime })
      render(<LaunchDialog session={fakeSession()} />)
      await choose(0, 'win-proj')
      await choose(1, 'wsl:Stopped')
      await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('停止しています'))
      // DTO の取得を待ってから、注記が出ていないことを確かめる。
      await waitFor(() =>
        expect(resolveFolderRuntime).toHaveBeenCalledWith('win-proj', 'wsl:Stopped')
      )
      await act(async () => {})
      expect(screen.queryByTestId('cross-boundary-unknown')).toBeNull()
      expect(screen.queryByText(/起動はできます/)).toBeNull()
      expect(screen.queryByTestId('folder-runtime-waiting-probe')).toBeNull()
      expect(screen.queryByTestId('folder-runtime-probe-failed')).toBeNull()
      expect(screen.getByRole('button', { name: '起動' })).toBeDisabled()
    })

    it('probe 完了の通知が来ない準備待ちでも、再評価の導線を出し、押すと refreshRuntimes を呼ぶ (R4 platform-boundary L-601)', async () => {
      const refreshRuntimes = vi.fn(async () => runtimes)
      install({
        listRuntimes: async () => ({
          ...runtimes,
          runtimes: [runtimeDto('Ubuntu', 'running', 'probing')]
        }),
        resolveFolderRuntime: async () => blockedDto(),
        refreshRuntimes
      })
      const session = fakeSession()
      render(<LaunchDialog session={session} />)
      await choose(0, 'win-proj')
      await choose(1, 'wsl:Ubuntu')
      const line = await screen.findByTestId('folder-runtime-waiting-probe')
      expect(line.textContent).toContain('ランタイムの準備')
      expect(screen.getByRole('button', { name: '起動' })).toBeDisabled()
      expect(refreshRuntimes).not.toHaveBeenCalled()
      fireEvent.click(within(line).getByRole('button', { name: '再評価' }))
      await waitFor(() => expect(refreshRuntimes).toHaveBeenCalled())
      expect(session.launch).not.toHaveBeenCalled()
    })

    it('probe-failed の DTO は起動不可にし、再評価の導線を出す (R3 po M-201 / platform-boundary L-502)', async () => {
      const refreshRuntimes = vi.fn(async () => runtimes)
      install({
        listRuntimes: async () => ({
          ...runtimes,
          runtimes: [runtimeDto('Ubuntu', 'running', 'failed')]
        }),
        resolveFolderRuntime: async () => blockedDto('probe-failed'),
        refreshRuntimes
      })
      const session = fakeSession()
      render(<LaunchDialog session={session} />)
      await choose(0, 'win-proj')
      await choose(1, 'wsl:Ubuntu')
      const line = await screen.findByTestId('folder-runtime-probe-failed')
      expect(line.textContent).toContain('能力確認に失敗しました')
      expect(screen.queryByTestId('cross-boundary-unknown')).toBeNull()
      expect(screen.getByRole('button', { name: '起動' })).toBeDisabled()
      fireEvent.click(screen.getByRole('button', { name: '起動' }))
      expect(session.launch).not.toHaveBeenCalled()
      fireEvent.click(within(line).getByRole('button', { name: '再評価' }))
      await waitFor(() => expect(refreshRuntimes).toHaveBeenCalled())
    })

    it('DTO が unreachable なら「不明」と分けて到達できないことを示し、起動を止める (R2 architecture M-001)', async () => {
      install({ resolveFolderRuntime: async () => unreachableDto('path-not-mapped') })
      const session = fakeSession()
      render(<LaunchDialog session={session} />)
      await choose(0, 'win-proj')
      await choose(1, 'wsl:Ubuntu')
      await waitFor(() =>
        expect(screen.getByTestId('folder-runtime-unreachable').textContent).toContain(
          '到達できません'
        )
      )
      expect(screen.queryByTestId('cross-boundary-unknown')).toBeNull()
      expect(screen.getByRole('button', { name: '起動' })).toBeDisabled()
      fireEvent.click(screen.getByRole('button', { name: '起動' }))
      expect(session.launch).not.toHaveBeenCalled()
    })
  })

  it('停止中に既定へ戻った Provider は、再評価で到達可能性を取り直すと戻り、確認が要らなくなる (pr-gate H-003)', async () => {
    let running = false
    const listRuntimes = async (): Promise<RuntimeListDTO> => ({
      ...runtimes,
      runtimes: [runtimeDto('Ubuntu'), runtimeDto('Stopped', running ? 'running' : 'stopped')]
    })
    const listReachableProviders = vi.fn(async (runtimeId: string) =>
      runtimeId === 'wsl:Stopped' && !running
        ? { reachable: [], excluded: [{ provider: bedrock, reason: 'blocked' as const }] }
        : { reachable: [bedrock], excluded: [] }
    )
    install({
      listRuntimes,
      refreshRuntimes: vi.fn(async () => {
        running = true // 利用者がディストロを起動してから「再評価」を押した
        return listRuntimes()
      }),
      listReachableProviders
    })
    const session = fakeSession({
      lastConfig: {
        folderId: 'win-proj',
        runtimeId: 'wsl:Stopped',
        providerId: 'p-bedrock',
        modelId: 'sonnet',
        effort: 'high',
        permissionMode: 'default'
      }
    })
    render(<LaunchDialog session={session} />)
    await waitFor(() =>
      expect(screen.getByRole('status', { name: '既定に戻した軸' }).textContent).toContain(
        '到達できない'
      )
    )
    fireEvent.click(screen.getByRole('button', { name: '再評価' }))
    await waitFor(() =>
      expect((screen.getByRole('combobox', { name: 'Provider' }) as HTMLSelectElement).value).toBe(
        'p-bedrock'
      )
    )
    expect(screen.queryByRole('status', { name: '既定に戻した軸' })).toBeNull()
    // 下書きは消えていない — モデル / effort も戻る。
    expect((screen.getByRole('combobox', { name: 'モデル' }) as HTMLSelectElement).value).toBe(
      'sonnet'
    )
    fireEvent.click(screen.getByRole('button', { name: '起動' }))
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(session.launch).toHaveBeenCalledWith(
      expect.objectContaining({ providerId: 'p-bedrock', modelId: 'sonnet', effort: 'high' }),
      'manual'
    )
  })

  it('probe 中に blocked で外れた Provider は、probe 完了の通知で到達可能性を取り直すと戻り、確認が要らなくなる (R3 platform-boundary M-501)', async () => {
    let probed = false
    const listeners: Array<(list: RuntimeListDTO) => void> = []
    const listOf = (): RuntimeListDTO => ({
      ...runtimes,
      runtimes: [runtimeDto('Ubuntu', 'running', probed ? 'done' : 'probing')]
    })
    const listReachableProviders = vi.fn(async () =>
      probed
        ? { reachable: [bedrock], excluded: [] }
        : { reachable: [], excluded: [{ provider: bedrock, reason: 'blocked' as const }] }
    )
    install({
      listRuntimes: async () => listOf(),
      listReachableProviders,
      resolveFolderRuntime: async () =>
        probed ? resolutionDto('native') : blockedDto('capabilities-not-probed'),
      onRuntimesChanged: (listener) => {
        listeners.push(listener)
        return () => {}
      }
    })
    const session = fakeSession({
      lastConfig: {
        folderId: 'ubuntu-proj',
        runtimeId: 'wsl:Ubuntu',
        providerId: 'p-bedrock',
        modelId: null,
        effort: null,
        permissionMode: 'default'
      }
    })
    render(<LaunchDialog session={session} />)
    // ランタイム一覧 (probing) が届き、その版で到達可能性を取得し終えるのを待つ。
    await waitFor(() =>
      expect(within(selects()[1]).queryByRole('option', { name: 'Ubuntu' })).not.toBeNull()
    )
    await waitFor(() =>
      expect(screen.getByTestId('folder-runtime-waiting-probe')).toBeInTheDocument()
    )
    await waitFor(() =>
      expect(screen.getByRole('status', { name: '既定に戻した軸' }).textContent).toContain(
        '到達できない'
      )
    )
    const fetchesBeforeProbe = listReachableProviders.mock.calls.length

    probed = true
    act(() => listeners.forEach((listener) => listener(listOf())))
    await waitFor(() =>
      expect((screen.getByRole('combobox', { name: 'Provider' }) as HTMLSelectElement).value).toBe(
        'p-bedrock'
      )
    )
    // state は running のまま。probeState の変化だけで取り直している。
    expect(listReachableProviders).toHaveBeenCalledTimes(fetchesBeforeProbe + 1)
    expect(screen.queryByRole('status', { name: '既定に戻した軸' })).toBeNull()
    await waitFor(() => expect(screen.getByRole('button', { name: '起動' })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: '起動' }))
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(session.launch).toHaveBeenCalledWith(
      expect.objectContaining({ providerId: 'p-bedrock' }),
      'manual'
    )
  })

  describe('到達可能性の取得中・失敗は fail-open にしない (pr-gate H-004 / SC-001)', () => {
    const selected: SessionLaunchConfig = {
      folderId: 'ubuntu-proj',
      runtimeId: 'wsl:Ubuntu',
      providerId: 'p-bedrock',
      modelId: null,
      effort: null,
      permissionMode: 'default'
    }

    it('取得中は Provider を「既定」だけにし、選んでいた Provider の reset は通知も起動もせず保留する', async () => {
      install({ listReachableProviders: () => never() })
      const session = fakeSession({ lastConfig: selected })
      render(<LaunchDialog session={session} />)
      await waitFor(() =>
        expect(screen.getByTestId('reachability-status').textContent).toContain('確認しています')
      )
      const provider = screen.getByRole('combobox', { name: 'Provider' }) as HTMLSelectElement
      expect([...provider.options].map((o) => o.value)).toEqual([''])
      expect(screen.queryByRole('status', { name: '既定に戻した軸' })).toBeNull()
      expect(screen.getByRole('button', { name: '起動' })).toBeDisabled()
      fireEvent.click(screen.getByRole('button', { name: '起動' }))
      expect(session.launch).not.toHaveBeenCalled()
    })

    it('既定 Provider なら取得中でも起動できる (到達可能性に依存しない)', async () => {
      install({ listReachableProviders: () => never() })
      render(
        <LaunchDialog session={fakeSession({ lastConfig: { ...selected, providerId: null } })} />
      )
      await waitFor(() => expect(screen.getByRole('button', { name: '起動' })).toBeEnabled())
    })

    it('取得に失敗したら「既定」だけにして失敗と再試行を示し、確認を要する。文言は「確認できなかった」で、確認の中の再試行で戻る (po M-101)', async () => {
      let fail = true
      const listReachableProviders = vi.fn(async () => {
        if (fail) throw new Error('ipc failed')
        return { reachable: [bedrock], excluded: [] }
      })
      install({ listReachableProviders })
      const session = fakeSession({ lastConfig: selected })
      render(<LaunchDialog session={session} />)
      await waitFor(() =>
        expect(screen.getByTestId('reachability-status').textContent).toContain(
          '確認できませんでした'
        )
      )
      const provider = screen.getByRole('combobox', { name: 'Provider' }) as HTMLSelectElement
      expect([...provider.options].map((o) => o.value)).toEqual([''])
      // 確認できていないことを「到達できない」「使えない」と断定しない。
      const notice = screen.getByRole('status', { name: '既定に戻した軸' }).textContent ?? ''
      expect(notice).toContain('確認できなかった')
      expect(notice).not.toContain('到達できない')
      // 選んでいた Provider が既定に置き換わったことを示し、status 行と同じ文を繰り返さない (po L-204)。
      expect(notice).toContain('選んでいた Provider')
      expect(notice).toContain('再試行で戻せます')
      expect(notice).not.toContain('既定 Provider だけを選べます')
      fireEvent.click(screen.getByRole('button', { name: '起動' }))
      expect(session.launch).not.toHaveBeenCalled()
      const dialog = screen.getByRole('alertdialog', { name: '既定 Provider での起動の確認' })
      expect(dialog.textContent).toContain('確認できなかった')
      expect(dialog.textContent).not.toContain('使えない')

      fail = false
      fireEvent.click(within(dialog).getByRole('button', { name: '再試行' }))
      await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
      await waitFor(() =>
        expect(
          (screen.getByRole('combobox', { name: 'Provider' }) as HTMLSelectElement).value
        ).toBe('p-bedrock')
      )
      expect(screen.queryByTestId('reachability-status')).toBeNull()
    })
  })

  describe('上流の変更は上流だけを書き換え、下流の無効化は通知する (pr-gate H-005 / US-1 AC4)', () => {
    const catalog: ProviderSummaryDTO = {
      ...bedrock,
      modelCount: 3,
      models: [
        { id: 'sonnet', displayName: 'Sonnet', supportedEffortLevels: ['low', 'high'] },
        { id: 'opus', displayName: 'Opus', supportedEffortLevels: ['high'] },
        { id: 'haiku', displayName: 'Haiku' }
      ]
    }
    const catalogInstall = (): ClostaCapability =>
      install({
        listProviders: async () => [catalog],
        listReachableProviders: async () => ({ reachable: [catalog], excluded: [] })
      })

    async function pickSonnetHigh(): Promise<void> {
      await choose(0, 'ubuntu-proj')
      await choose(1, 'wsl:Ubuntu')
      await choose(2, 'p-bedrock')
      fireEvent.change(screen.getByRole('combobox', { name: 'モデル' }), {
        target: { value: 'sonnet' }
      })
      fireEvent.change(screen.getByRole('combobox', { name: 'effort' }), {
        target: { value: 'high' }
      })
    }

    it('非対応の effort になるモデルへ変えると effort は既定に戻り、effort-unsupported を通知する', async () => {
      catalogInstall()
      render(<LaunchDialog session={fakeSession()} />)
      await pickSonnetHigh()
      fireEvent.change(screen.getByRole('combobox', { name: 'モデル' }), {
        target: { value: 'haiku' }
      })
      expect((screen.getByRole('combobox', { name: 'effort' }) as HTMLSelectElement).value).toBe('')
      expect(screen.getByRole('status', { name: '既定に戻した軸' }).textContent).toContain(
        'このモデルが対応しない effort'
      )
    })

    it('同じ effort に対応するモデルへ変えると effort を保つ (通知しない)', async () => {
      catalogInstall()
      const session = fakeSession()
      render(<LaunchDialog session={session} />)
      await pickSonnetHigh()
      fireEvent.change(screen.getByRole('combobox', { name: 'モデル' }), {
        target: { value: 'opus' }
      })
      expect((screen.getByRole('combobox', { name: 'effort' }) as HTMLSelectElement).value).toBe(
        'high'
      )
      expect(screen.queryByRole('status', { name: '既定に戻した軸' })).toBeNull()
      fireEvent.click(screen.getByRole('button', { name: '起動' }))
      expect(session.launch).toHaveBeenCalledWith(
        expect.objectContaining({ modelId: 'opus', effort: 'high' }),
        'manual'
      )
    })

    it('Provider を既定に変えるとカタログ外になったモデルを通知する (黙って消さない)', async () => {
      catalogInstall()
      render(<LaunchDialog session={fakeSession()} />)
      await pickSonnetHigh()
      fireEvent.change(screen.getByRole('combobox', { name: 'Provider' }), {
        target: { value: '' }
      })
      const notice = screen.getByRole('status', { name: '既定に戻した軸' }).textContent ?? ''
      expect(notice).toContain('モデルカタログに無いモデル')
      expect(notice).toContain('このモデルが対応しない effort')
    })

    it('自分で変えた軸の下流 reset は 1 回だけ通知して下書きを書き戻す。Provider を選び直しても古いモデル / effort は戻らない (po L-101)', async () => {
      catalogInstall()
      const session = fakeSession()
      render(<LaunchDialog session={session} />)
      await pickSonnetHigh()
      fireEvent.change(screen.getByRole('combobox', { name: 'Provider' }), {
        target: { value: '' }
      })
      expect(screen.getByRole('status', { name: '既定に戻した軸' })).toBeInTheDocument()

      // 次の操作で通知は消える (消せない通知を残さない)。
      fireEvent.change(screen.getByRole('combobox', { name: '権限モード' }), {
        target: { value: 'plan' }
      })
      expect(screen.queryByRole('status', { name: '既定に戻した軸' })).toBeNull()

      // Provider を選び直しても、既定に戻したモデル / effort は黙って戻らない。
      fireEvent.change(screen.getByRole('combobox', { name: 'Provider' }), {
        target: { value: 'p-bedrock' }
      })
      expect((screen.getByRole('combobox', { name: 'モデル' }) as HTMLSelectElement).value).toBe('')
      expect((screen.getByRole('combobox', { name: 'effort' }) as HTMLSelectElement).value).toBe('')
      fireEvent.click(screen.getByRole('button', { name: '起動' }))
      expect(session.launch).toHaveBeenCalledWith(
        expect.objectContaining({ providerId: 'p-bedrock', modelId: null, effort: null }),
        'manual'
      )
    })

    it('プリセット適用で既定に戻った軸は、従来どおり解決結果から通知し続ける (書き戻さない)', async () => {
      install({
        listProviders: async () => [catalog],
        listReachableProviders: async () => ({ reachable: [catalog], excluded: [] }),
        listPresets: async () => [
          {
            id: 'preset-removed',
            name: '削除済み Provider',
            config: {
              folderId: 'ubuntu-proj',
              runtimeId: 'wsl:Ubuntu',
              providerId: 'p-removed',
              modelId: 'sonnet',
              effort: null,
              permissionMode: 'default'
            },
            updatedAt: NOW
          }
        ]
      })
      render(<LaunchDialog session={fakeSession()} />)
      await waitFor(() => expect(screen.getByRole('button', { name: '適用' })).toBeInTheDocument())
      fireEvent.click(screen.getByRole('button', { name: '適用' }))
      await waitFor(() =>
        expect(screen.getByRole('status', { name: '既定に戻した軸' }).textContent).toContain(
          '削除されていた'
        )
      )
      fireEvent.change(screen.getByRole('combobox', { name: '権限モード' }), {
        target: { value: 'plan' }
      })
      // Provider の reset は起動前の確認を要するので、権限モードを変えても通知は残る。
      expect(screen.getByRole('status', { name: '既定に戻した軸' }).textContent).toContain(
        '削除されていた'
      )
    })
  })

  it('失敗から reset で戻ったときは前回の失敗理由を示す (US-1 AC7 / pr-gate M-07)', async () => {
    install()
    render(<LaunchDialog session={fakeSession({ previousFailure: 'process-crashed' })} />)
    expect(screen.getByTestId('previous-failure').textContent).toContain(
      'セッションのプロセスが異常終了しました'
    )
  })

  it.each([
    'max-turns',
    'max-budget',
    'structured-output-retries',
    'execution-error',
    'auth-failed',
    'billing',
    'rate-limited',
    'api-error'
  ] as const)(
    'ターンの失敗 (%s) から戻ったときも、失敗の表示と同じ全文を出す (O-4 US-1 / FE-011)',
    async (reason) => {
      install()
      render(<LaunchDialog session={fakeSession({ previousFailure: reason })} />)
      expect(screen.getByTestId('previous-failure').textContent).toContain(
        launchFailureLabel(reason)
      )
    }
  )

  it('lastConfig から入力を復元し、起動の拒否理由を表示する (US-1 AC7)', async () => {
    install()
    const lastConfig: SessionLaunchConfig = {
      folderId: 'ubuntu-proj',
      runtimeId: 'wsl:Ubuntu',
      providerId: null,
      modelId: null,
      effort: null,
      permissionMode: 'plan'
    }
    render(
      <LaunchDialog
        session={fakeSession({ phase: 'rejected', rejectReason: 'launch-failed', lastConfig })}
      />
    )
    await waitFor(() => expect(selects()[0].value).toBe('ubuntu-proj'))
    expect((screen.getByRole('combobox', { name: '権限モード' }) as HTMLSelectElement).value).toBe(
      'plan'
    )
    expect(screen.getByText('起動に失敗しました。もう一度お試しください。')).toBeInTheDocument()
  })

  it('終わっていないセッションと同じフォルダを選ぶと警告し、起動ボタンは有効のまま (X-5 FE-003 / US-1 AC2)', async () => {
    install()
    const lastConfig: SessionLaunchConfig = {
      folderId: 'ubuntu-proj',
      runtimeId: 'wsl:Ubuntu',
      providerId: null,
      modelId: null,
      effort: null,
      permissionMode: 'default'
    }
    render(
      <LaunchDialog
        session={fakeSession({ lastConfig, activeFolderIds: ['ubuntu-proj', 'ubuntu-proj'] })}
      />
    )
    await waitFor(() =>
      expect(screen.getByTestId('same-folder-warning')).toHaveTextContent('既に 2 件')
    )
    await waitFor(() => expect(screen.getByRole('button', { name: /^起動$/ })).toBeEnabled())
  })

  it('同じフォルダのセッションが無ければ警告しない', async () => {
    install()
    render(<LaunchDialog session={fakeSession({ activeFolderIds: ['other'] })} />)
    await waitFor(() => expect(selects()[0].options.length).toBeGreaterThan(1))
    fireEvent.change(selects()[0], { target: { value: 'ubuntu-proj' } })
    expect(selects()[0].value).toBe('ubuntu-proj')
    expect(screen.queryByTestId('same-folder-warning')).toBeNull()
  })

  it('session-limit の拒否は、終了・強制終了で空くこと (中断では空かない) を示す', () => {
    install()
    render(
      <LaunchDialog session={fakeSession({ phase: 'rejected', rejectReason: 'session-limit' })} />
    )
    expect(screen.getByRole('alert')).toHaveTextContent('中断だけでは空きません')
  })

  it('フォルダ 0 件 / WSL ランタイム 0 件の空状態を示す', async () => {
    install({
      listFolders: async () => ({ ...folders, folders: [] }),
      listRuntimes: async () => ({ ...runtimes, runtimes: [] })
    })
    render(<LaunchDialog session={fakeSession()} />)
    await waitFor(() =>
      expect(screen.getByText(/作業フォルダが登録されていません/)).toBeInTheDocument()
    )
    expect(screen.getByText(/WSL ランタイムが見つかりません/)).toBeInTheDocument()
  })

  describe('フォルダ / ランタイムの読み込み状態を空状態と分ける (po M-102)', () => {
    it('読み込み中は「登録されていません / 見つかりません」ではなく読み込み中を示す', async () => {
      install({ listFolders: () => never(), listRuntimes: () => never() })
      render(<LaunchDialog session={fakeSession()} />)
      await waitFor(() =>
        expect(screen.getByTestId('folders-status').textContent).toContain('読み込んでいます')
      )
      expect(screen.getByTestId('runtimes-status').textContent).toContain('読み込んでいます')
      expect(screen.queryByText(/作業フォルダが登録されていません/)).toBeNull()
      expect(screen.queryByText(/WSL ランタイムが見つかりません/)).toBeNull()
    })

    it('読み込みに失敗したら「読み込めませんでした」と再試行を示し、再試行で取り直す', async () => {
      let foldersFail = true
      const listFolders = vi.fn(async () => {
        if (foldersFail) throw new Error('ipc failed')
        return folders
      })
      const refreshRuntimes = vi.fn(async () => runtimes)
      install({
        listFolders,
        listRuntimes: () => Promise.reject(new Error('ipc failed')),
        refreshRuntimes
      })
      render(<LaunchDialog session={fakeSession()} />)
      await waitFor(() =>
        expect(screen.getByTestId('folders-status').textContent).toContain('読み込めませんでした')
      )
      await waitFor(() =>
        expect(screen.getByTestId('runtimes-status').textContent).toContain('読み込めませんでした')
      )
      expect(screen.queryByText(/作業フォルダが登録されていません/)).toBeNull()
      expect(screen.queryByText(/WSL ランタイムが見つかりません/)).toBeNull()

      foldersFail = false
      fireEvent.click(within(screen.getByTestId('folders-status')).getByRole('button'))
      await waitFor(() => expect(screen.queryByTestId('folders-status')).toBeNull())
      expect(listFolders).toHaveBeenCalledTimes(2)

      fireEvent.click(within(screen.getByTestId('runtimes-status')).getByRole('button'))
      await waitFor(() => expect(screen.queryByTestId('runtimes-status')).toBeNull())
      expect(refreshRuntimes).toHaveBeenCalled()
    })

    it('フォルダの再試行中は「読み込んでいます…」に戻す (押しても何も起きないように見せない。po L-203)', async () => {
      let attempt = 0
      const listFolders = vi.fn(() => {
        attempt += 1
        return attempt === 1 ? Promise.reject(new Error('ipc failed')) : never<FolderListDTO>()
      })
      install({ listFolders })
      render(<LaunchDialog session={fakeSession()} />)
      await waitFor(() =>
        expect(screen.getByTestId('folders-status').textContent).toContain('読み込めませんでした')
      )
      fireEvent.click(within(screen.getByTestId('folders-status')).getByRole('button'))
      await waitFor(() =>
        expect(screen.getByTestId('folders-status').textContent).toContain('読み込んでいます')
      )
      expect(listFolders).toHaveBeenCalledTimes(2)
    })

    it('ランタイムの読み込み失敗の行が出ている間は、再試行の失敗を「再評価に失敗」と二重に出さない (po L-203)', async () => {
      const refreshRuntimes = vi.fn(() => Promise.reject(new Error('refresh failed')))
      install({ listRuntimes: () => Promise.reject(new Error('ipc failed')), refreshRuntimes })
      render(<LaunchDialog session={fakeSession()} />)
      await waitFor(() =>
        expect(screen.getByTestId('runtimes-status').textContent).toContain('読み込めませんでした')
      )
      fireEvent.click(within(screen.getByTestId('runtimes-status')).getByRole('button'))
      await waitFor(() => expect(refreshRuntimes).toHaveBeenCalled())
      await waitFor(() =>
        expect(within(screen.getByTestId('runtimes-status')).getByRole('button')).toBeEnabled()
      )
      expect(screen.getByTestId('runtimes-status').textContent).toContain('読み込めませんでした')
      expect(screen.queryByTestId('reevaluate-failed')).toBeNull()
    })

    it('再評価中は「再評価中…」でボタンを無効にし、失敗したら 1 行で示す', async () => {
      let rejectRefresh: (reason: Error) => void = () => {}
      install({
        listRuntimes: async () => ({ ...runtimes, runtimes: [runtimeDto('Stopped', 'stopped')] }),
        refreshRuntimes: () =>
          new Promise<RuntimeListDTO>((_resolve, reject) => {
            rejectRefresh = reject
          })
      })
      render(<LaunchDialog session={fakeSession()} />)
      await waitFor(() => expect(screen.getByRole('button', { name: '再評価' })).toBeEnabled())
      fireEvent.click(screen.getByRole('button', { name: '再評価' }))
      await waitFor(() => expect(screen.getByRole('button', { name: '再評価中…' })).toBeDisabled())

      act(() => rejectRefresh(new Error('refresh failed')))
      await waitFor(() =>
        expect(screen.getByTestId('reevaluate-failed').textContent).toContain('失敗しました')
      )
      expect(screen.getByRole('button', { name: '再評価' })).toBeEnabled()
    })
  })

  it('Provider 0 件 / WSL ランタイム全停止の空状態を示す (pr-gate M-09)', async () => {
    const refreshRuntimes = vi.fn(async () => runtimes)
    install({
      listProviders: async () => [],
      listRuntimes: async () => ({ ...runtimes, runtimes: [runtimeDto('Stopped', 'stopped')] }),
      refreshRuntimes
    })
    render(<LaunchDialog session={fakeSession()} />)
    await waitFor(() =>
      expect(screen.getByText(/既定 Provider で起動できます/)).toBeInTheDocument()
    )
    expect(screen.getByText(/WSL ランタイムがすべて停止しています/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '再評価' }))
    await waitFor(() => expect(refreshRuntimes).toHaveBeenCalled())
  })
})

/**
 * 起動元 (O-3 FE-040 / 012 spec FR-009 / US-4 AC1・AC2・AC6・AC7・AC8 / data-model §4「renderer の起動元」の表)。
 */
describe('LaunchDialog — 起動元 (O-3)', () => {
  const presetConfig: SessionLaunchConfig = {
    folderId: 'ubuntu-proj',
    runtimeId: 'wsl:Ubuntu',
    providerId: null,
    modelId: null,
    effort: null,
    permissionMode: 'plan'
  }
  const preset: PresetDTO = { id: 'preset-1', name: '業務用', config: presetConfig, updatedAt: NOW }

  async function applyPreset(): Promise<void> {
    await waitFor(() => expect(screen.getByRole('button', { name: '適用' })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: '適用' }))
  }

  async function clickLaunch(): Promise<void> {
    await waitFor(() => expect(screen.getByRole('button', { name: '起動' })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: '起動' }))
  }

  function permissionMode(): HTMLSelectElement {
    return screen.getByRole('combobox', { name: '権限モード' }) as HTMLSelectElement
  }

  describe('起動元の表の各行 (ダイアログ単体)', () => {
    it('プリセットを適用して起動すると preset (US-4 AC1)', async () => {
      install({ listPresets: async () => [preset] })
      const session = fakeSession()
      render(<LaunchDialog session={session} />)
      await applyPreset()
      await clickLaunch()
      expect(session.launch).toHaveBeenCalledWith(presetConfig, 'preset')
    })

    it('適用した後に軸を変えても preset', async () => {
      install({ listPresets: async () => [preset] })
      const session = fakeSession()
      render(<LaunchDialog session={session} />)
      await applyPreset()
      await waitFor(() => expect(permissionMode().value).toBe('plan'))
      fireEvent.change(permissionMode(), { target: { value: 'default' } })
      await clickLaunch()
      expect(session.launch).toHaveBeenCalledWith(
        { ...presetConfig, permissionMode: 'default' },
        'preset'
      )
    })

    it('前回の設定が無いダイアログで適用せずに起動すると manual (US-4 AC2)', async () => {
      install({ listPresets: async () => [preset] })
      const session = fakeSession({ lastOrigin: 'preset' })
      render(<LaunchDialog session={session} />)
      await choose(0, 'ubuntu-proj')
      await choose(1, 'wsl:Ubuntu')
      await clickLaunch()
      expect(session.launch).toHaveBeenCalledWith(
        expect.objectContaining({ folderId: 'ubuntu-proj' }),
        'manual'
      )
    })

    it.each([
      ['拒否で作り直したダイアログ', { phase: 'rejected', rejectReason: 'session-limit' }] as const,
      [
        '失敗したセッションを閉じて開いたダイアログ',
        { previousFailure: 'process-crashed' }
      ] as const,
      ['受け付けの後・起動せずに閉じた後に開き直したダイアログ', {}] as const
    ])(
      '前回の設定を初期値に出した%sで、適用も軸の変更もせずに起動すると前回の起動元を引き継ぐ (US-4 AC6 / AC7)',
      async (_l, over) => {
        for (const lastOrigin of ['preset', 'manual'] as const) {
          install()
          const session = fakeSession({ ...over, lastConfig: presetConfig, lastOrigin })
          const view = render(<LaunchDialog session={session} />)
          await clickLaunch()
          expect(session.launch).toHaveBeenCalledWith(presetConfig, lastOrigin)
          view.unmount()
        }
      }
    )

    it('前回の設定があり起動元が無い (null) なら manual', async () => {
      install()
      const session = fakeSession({ lastConfig: presetConfig, lastOrigin: null })
      render(<LaunchDialog session={session} />)
      await clickLaunch()
      expect(session.launch).toHaveBeenCalledWith(presetConfig, 'manual')
    })

    it('前回の設定を初期値に出したダイアログで、適用せずに軸を手で変えて起動すると manual (US-4 AC8)', async () => {
      install()
      const session = fakeSession({ lastConfig: presetConfig, lastOrigin: 'preset' })
      render(<LaunchDialog session={session} />)
      await waitFor(() => expect(permissionMode().value).toBe('plan'))
      fireEvent.change(permissionMode(), { target: { value: 'default' } })
      await clickLaunch()
      expect(session.launch).toHaveBeenCalledWith(
        { ...presetConfig, permissionMode: 'default' },
        'manual'
      )
    })

    it('軸を変えてから元に戻した起動も manual (変えたことは消えない)', async () => {
      install()
      const session = fakeSession({ lastConfig: presetConfig, lastOrigin: 'preset' })
      render(<LaunchDialog session={session} />)
      await waitFor(() => expect(permissionMode().value).toBe('plan'))
      fireEvent.change(permissionMode(), { target: { value: 'default' } })
      fireEvent.change(permissionMode(), { target: { value: 'plan' } })
      await clickLaunch()
      expect(session.launch).toHaveBeenCalledWith(presetConfig, 'manual')
    })

    it('依存解決の自動の reset (削除された Provider が既定に戻る) だけでは manual にならない', async () => {
      install()
      const session = fakeSession({
        lastConfig: { ...presetConfig, providerId: 'p-removed' },
        lastOrigin: 'preset'
      })
      render(<LaunchDialog session={session} />)
      await waitFor(() =>
        expect(screen.getByRole('status', { name: '既定に戻した軸' }).textContent).toContain(
          '削除されていた'
        )
      )
      await clickLaunch()
      const dialog = screen.getByRole('alertdialog', { name: '既定 Provider での起動の確認' })
      fireEvent.click(within(dialog).getByRole('button', { name: '既定 Provider で起動する' }))
      expect(session.launch).toHaveBeenCalledWith(
        expect.objectContaining({ providerId: null }),
        'preset'
      )
    })
  })

  describe('稼働中のストアとつないだ並び (US-4 AC6〜AC8)', () => {
    const A = '11111111-1111-4111-8111-111111111111'

    /** 本物のストアと、起動ダイアログを開くたびにストアの起動の状態から作る LaunchSource (LivePane の NewSessionDialog と同じ形)。 */
    function harness(over: Partial<ClostaCapability> = {}): {
      readonly store: RunningSessionStore
      readonly launchSession: Mock<ClostaCapability['launchSession']>
      readonly open: () => ReturnType<typeof render>
    } {
      let seq = 0
      const launchSession = vi.fn<ClostaCapability['launchSession']>(async () => ({
        status: 'launching' as const,
        sessionId: `${A.slice(0, -2)}${String((seq += 1)).padStart(2, '0')}`
      }))
      const cap = install({ listPresets: async () => [preset], launchSession, ...over })
      const store = createRunningSessionStore(() => cap)
      const open = (): ReturnType<typeof render> => {
        const launch = store.getState().launch
        const source: LaunchSource = {
          phase: launch.phase,
          rejectReason: launch.rejectReason,
          lastConfig: launch.lastConfig,
          lastOrigin: launch.lastOrigin,
          previousFailure: launch.previousFailure,
          launch: (config, origin) => store.launch(config, null, origin)
        }
        return render(<LaunchDialog session={source} />)
      }
      return { store, launchSession, open }
    }

    /** 起動して、ストアが起動の結果を受け取るまで待ち、ダイアログを閉じる。 */
    async function launchAndClose(
      h: ReturnType<typeof harness>,
      view: ReturnType<typeof render>,
      calls: number
    ): Promise<void> {
      await clickLaunch()
      await waitFor(() => expect(h.launchSession).toHaveBeenCalledTimes(calls))
      await waitFor(() => expect(h.store.getState().launch.phase).not.toBe('launching'))
      view.unmount()
    }

    function origins(h: ReturnType<typeof harness>): unknown[] {
      return h.launchSession.mock.calls.map((call) => call[1])
    }

    it('適用して起動 → 受け付け → 開き直して初期値のまま起動で preset が 2 回届く (AC7)。設定は起動元で変わらない', async () => {
      const h = harness()
      let view = h.open()
      await applyPreset()
      await launchAndClose(h, view, 1)

      view = h.open()
      await launchAndClose(h, view, 2)
      expect(origins(h)).toEqual(['preset', 'preset'])
      // capability に渡る設定は 6 軸だけで、起動元を含まない。
      for (const [config] of h.launchSession.mock.calls) {
        expect(config).toEqual(presetConfig)
        expect(Object.keys(config).sort()).toEqual(
          ['effort', 'folderId', 'modelId', 'permissionMode', 'providerId', 'runtimeId'].sort()
        )
      }
    })

    it('preset で起動 → 開き直して軸を 1 つ変えて起動で manual (AC8)', async () => {
      const h = harness()
      let view = h.open()
      await applyPreset()
      await launchAndClose(h, view, 1)

      view = h.open()
      await waitFor(() => expect(permissionMode().value).toBe('plan'))
      fireEvent.change(permissionMode(), { target: { value: 'default' } })
      await launchAndClose(h, view, 2)
      expect(origins(h)).toEqual(['preset', 'manual'])
    })

    it('preset → 開き直して軸を変えて manual → 開き直して初期値のまま manual (引き継ぐのは直前の起動元) → 開き直して適用して preset', async () => {
      const h = harness()
      let view = h.open()
      await applyPreset()
      await launchAndClose(h, view, 1)

      view = h.open()
      await waitFor(() => expect(permissionMode().value).toBe('plan'))
      fireEvent.change(permissionMode(), { target: { value: 'default' } })
      await launchAndClose(h, view, 2)

      view = h.open()
      await launchAndClose(h, view, 3)

      view = h.open()
      await applyPreset()
      await launchAndClose(h, view, 4)
      expect(origins(h)).toEqual(['preset', 'manual', 'manual', 'preset'])
    })

    it('拒否で作り直したダイアログで前回の設定のまま起動し直すと preset (AC6)', async () => {
      const h = harness()
      h.launchSession.mockResolvedValueOnce({ status: 'rejected', reasonKey: 'session-limit' })
      let view = h.open()
      await applyPreset()
      await launchAndClose(h, view, 1)
      expect(h.store.getState().launch).toMatchObject({
        phase: 'rejected',
        lastConfig: presetConfig,
        lastOrigin: 'preset'
      })

      view = h.open()
      await launchAndClose(h, view, 2)
      expect(origins(h)).toEqual(['preset', 'preset'])
    })

    it('起動せずに閉じた (告知を消した) 後に開き直しても前回の起動元を引き継ぐ。告知を消しても lastOrigin は残る', async () => {
      const h = harness()
      let view = h.open()
      await applyPreset()
      await launchAndClose(h, view, 1)

      view = h.open()
      view.unmount()
      act(() => h.store.dismissLaunchNotice())
      expect(h.store.getState().launch.lastOrigin).toBe('preset')

      view = h.open()
      await launchAndClose(h, view, 2)
      expect(origins(h)).toEqual(['preset', 'preset'])
    })
  })
})
