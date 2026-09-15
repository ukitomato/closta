import { describe, expect, it } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

import type { RuntimeDescriptorDTO, RuntimeListDTO } from '@domain/runtime/dto'
import type {
  FolderListDTO,
  FolderRuntimeResolutionDTO,
  WorkspaceFolderDTO
} from '@domain/workspace/dto'

import { installCapability } from '@/test-support/capability'
import { ResolutionScreen } from './ResolutionScreen'
import { WorkspaceFoldersScreen } from '../workspace-folders/WorkspaceFoldersScreen'
import { RuntimeListScreen } from '../runtime-list/RuntimeListScreen'

/**
 * renderer 単体テスト (FE-032 / SC-006 / SC-007 / SC-013 / SC-015)。
 *
 * **preload をスタブする。** Electron を起動せずに、
 * (a) 到達不可が選択肢 DOM に現れない
 * (a2) 解消手順の実行後に消えた組み合わせの理由が描かれる
 * (b) 解決不能が現れて手順が描かれる
 * (c) 越境案内の 3 要素が描かれる
 * (d) 復元失敗の件数が描かれる
 * (e) WSL 非搭載時に一覧が壊れない
 * を確かめる。
 */

const NOW = 1_700_000_000_000

const HOST: RuntimeDescriptorDTO = {
  id: 'host',
  kind: 'win32',
  distroName: null,
  wslVersion: null,
  state: 'running',
  isDefault: false,
  capabilities: {
    probeState: 'done',
    sandboxKind: 'none',
    seccompStatus: 'unknown',
    missingDependencies: [],
    probedAt: NOW,
    autoModeAllowed: false,
    autoModeStatus: 'unavailable'
  },
  hasPathMapping: false,
  detectedAt: NOW
}

const UBUNTU: RuntimeDescriptorDTO = {
  ...HOST,
  id: 'wsl:Ubuntu',
  kind: 'wsl',
  distroName: 'Ubuntu',
  wslVersion: 2,
  isDefault: true,
  capabilities: {
    ...HOST.capabilities,
    sandboxKind: 'bubblewrap',
    autoModeAllowed: true,
    autoModeStatus: 'allowed'
  },
  hasPathMapping: true
}

const FOLDER: WorkspaceFolderDTO = {
  id: 'wf_0123456789ab',
  location: { kind: 'windows' },
  path: { namespace: 'host', value: 'C:\\dev\\x' },
  displayName: 'x',
  reachability: 'reachable',
  unreachableReason: null,
  blockedReason: null,
  resolutionSteps: [],
  registeredAt: NOW
}

function runtimeList(runtimes: readonly RuntimeDescriptorDTO[]): RuntimeListDTO {
  return { runtimes, enumerationIssues: [] }
}

function folderList(
  folders: readonly WorkspaceFolderDTO[],
  restoreIssues: FolderListDTO['restoreIssues'] = { skipped: 0, reasonKeys: [], backupPath: null }
): FolderListDTO {
  return { folders, restoreIssues }
}

const REACHABLE_NATIVE: FolderRuntimeResolutionDTO = {
  reachability: 'reachable',
  unreachableReason: null,
  blockedReason: null,
  resolutionSteps: [],
  boundary: 'native',
  runtimePath: { namespace: 'host', value: 'C:\\dev\\x' },
  recommendation: null
}

const CROSS: FolderRuntimeResolutionDTO = {
  reachability: 'reachable',
  unreachableReason: null,
  blockedReason: null,
  resolutionSteps: [],
  boundary: 'cross',
  runtimePath: { namespace: 'wsl:Ubuntu', value: '/mnt/c/dev/x' },
  recommendation: {
    impact: 'ファイルシステムの境界を越えるため、読み書きが大幅に遅くなります。',
    suggestedLocation: { namespace: 'wsl:Ubuntu', value: '/home' },
    steps: ['clone-to-suggested-location', 'register-new-folder', 'unregister-old-folder']
  }
}

const BLOCKED: FolderRuntimeResolutionDTO = {
  reachability: 'blocked',
  unreachableReason: null,
  blockedReason: 'distro-not-running',
  resolutionSteps: ['start-distro', 'rescan-runtimes'],
  boundary: 'unknown',
  runtimePath: null,
  recommendation: null
}

const UNREACHABLE: FolderRuntimeResolutionDTO = {
  reachability: 'unreachable',
  unreachableReason: 'path-not-mapped',
  blockedReason: null,
  resolutionSteps: [],
  boundary: 'unknown',
  runtimePath: null,
  recommendation: null
}

/** 解決結果をランタイムごとに差し替える。 */
function install(
  resolutions: Record<string, FolderRuntimeResolutionDTO>,
  options: {
    runtimes?: readonly RuntimeDescriptorDTO[]
    folders?: readonly WorkspaceFolderDTO[]
    restoreIssues?: FolderListDTO['restoreIssues']
  } = {}
): void {
  installCapability({
    listRuntimes: async () => runtimeList(options.runtimes ?? [HOST, UBUNTU]),
    listFolders: async () => folderList(options.folders ?? [FOLDER], options.restoreIssues),
    resolveFolderRuntime: async (_folderId: string, runtimeId: string) =>
      resolutions[runtimeId] ?? null
  })
}

describe('(a) 到達不可は選択肢 DOM に現れない (FR-028 / SC-007)', () => {
  it('到達不可の組み合わせが選択肢に出ない', async () => {
    install({ host: REACHABLE_NATIVE, 'wsl:Ubuntu': UNREACHABLE })
    render(<ResolutionScreen />)

    await waitFor(() => {
      expect(screen.getAllByTestId('resolution-option')).toHaveLength(1)
    })
    // 選択肢は `host` 側の 1 件だけ。
    expect(screen.getAllByTestId('resolution-option')[0].textContent).toContain('Windows (ホスト)')
  })
})

describe('(a2) 消えた組み合わせの理由が描かれる (FR-028)', () => {
  it('**黙って消さない** — 理由つきで別枠に現れる', async () => {
    install({ host: REACHABLE_NATIVE, 'wsl:Ubuntu': UNREACHABLE })
    render(<ResolutionScreen />)

    await waitFor(() => {
      expect(screen.getByTestId('resolution-excluded')).toBeInTheDocument()
    })
    expect(screen.getByTestId('resolution-excluded').textContent).toContain(
      'このドライブは選んだランタイムから見えません'
    )
  })
})

describe('(b) 解決不能が現れて手順が描かれる (SC-007)', () => {
  it('**選択肢に残り**、解消手順が日本語で出る', async () => {
    install({ host: REACHABLE_NATIVE, 'wsl:Ubuntu': BLOCKED })
    render(<ResolutionScreen />)

    await waitFor(() => {
      expect(screen.getAllByTestId('resolution-option')).toHaveLength(2)
    })
    expect(screen.getByText(/ディストロが停止しています/)).toBeInTheDocument()
    expect(screen.getByText('ディストロを起動する')).toBeInTheDocument()
    expect(screen.getByText('ランタイムを再検出する')).toBeInTheDocument()
  })
})

describe('(c) 越境案内の 3 要素が描かれる (FR-031 / SC-006)', () => {
  it('影響・推奨配置先・手順が出て、選択も可能である', async () => {
    install({ host: REACHABLE_NATIVE, 'wsl:Ubuntu': CROSS })
    render(<ResolutionScreen />)

    await waitFor(() => {
      expect(screen.getByText(/境界を越えるため/)).toBeInTheDocument()
    })
    expect(screen.getByText(/\/home/)).toBeInTheDocument()
    expect(screen.getByText('推奨の場所に複製する')).toBeInTheDocument()
    expect(screen.getByText('複製先を新しく登録する')).toBeInTheDocument()
    expect(screen.getByText('元の登録を解除する')).toBeInTheDocument()

    // **越境でも選択不可にしない** (FR-030)。
    const options = screen.getAllByTestId('resolution-option')
    const cross = options.find((node) => node.textContent?.includes('境界を越える'))
    expect(cross?.querySelector('button')?.hasAttribute('disabled')).toBe(false)
  })
})

describe('選択肢が 0 件のときの案内 (FR-028)', () => {
  it('登録フォルダが 0 件なら登録画面への導線を出す', async () => {
    install({}, { folders: [] })
    render(<ResolutionScreen />)

    await waitFor(() => {
      expect(screen.getByText('登録された作業フォルダがありません。')).toBeInTheDocument()
    })
    expect(screen.getByText(/所在を選んで登録してください/)).toBeInTheDocument()
  })

  it('到達可能なランタイムが 0 件なら再検出への導線を出す', async () => {
    install({}, { runtimes: [] })
    render(<ResolutionScreen />)

    await waitFor(() => {
      expect(screen.getByText('利用できるランタイムがありません。')).toBeInTheDocument()
    })
  })
})

describe('(d) 復元失敗の件数が描かれる (FR-019 / SC-013)', () => {
  it('件数・理由・退避先が出る', async () => {
    install(
      {},
      {
        restoreIssues: {
          skipped: 2,
          reasonKeys: ['parse-failed', 'namespace-mismatch'],
          backupPath: { namespace: 'host', value: 'C:\\data\\workspace-folders.json.bak' }
        }
      }
    )
    render(<WorkspaceFoldersScreen />)

    await waitFor(() => {
      expect(screen.getByText(/復元できなかった登録が 2 件あります/)).toBeInTheDocument()
    })
    expect(screen.getByText('保存ファイルを読み取れませんでした')).toBeInTheDocument()
    expect(
      screen.getByText('所在とパスの対応が合っていないレコードがありました')
    ).toBeInTheDocument()
    expect(screen.getByText(/workspace-folders\.json\.bak/)).toBeInTheDocument()
  })
})

describe('(e) WSL 非搭載時に一覧が壊れない (FR-012 / SC-015)', () => {
  it('Win32Runtime だけでランタイム一覧が描ける', async () => {
    installCapability({
      listRuntimes: async () => runtimeList([HOST])
    })
    render(<RuntimeListScreen />)

    await waitFor(() => {
      expect(screen.getByText('Windows (ホスト)')).toBeInTheDocument()
    })
    // **無人実行は「不可」であり「未判定」ではない** (判定したうえでの表明。FR-003)。
    expect(screen.getByText('不可')).toBeInTheDocument()
    expect(screen.queryByText(/WSL:/)).not.toBeInTheDocument()
  })

  it('フォルダ一覧も壊れない (空状態の導線が出る)', async () => {
    installCapability({
      listRuntimes: async () => runtimeList([HOST]),
      listFolders: async () => folderList([])
    })
    render(<WorkspaceFoldersScreen />)

    await waitFor(() => {
      expect(screen.getByText(/まだ登録がありません/)).toBeInTheDocument()
    })
  })
})

describe('到達可能性 3 値の区別表示 (FE-022 / FR-017)', () => {
  it('**「今は使えない」に解除を勧めない** (毎日削除させることになる)', async () => {
    const blockedFolder: WorkspaceFolderDTO = {
      ...FOLDER,
      reachability: 'blocked',
      blockedReason: 'distro-not-running',
      resolutionSteps: ['start-distro', 'rescan-runtimes']
    }
    installCapability({
      listRuntimes: async () => runtimeList([HOST]),
      listFolders: async () => folderList([blockedFolder])
    })
    render(<WorkspaceFoldersScreen />)

    await waitFor(() => {
      expect(screen.getByText('今は使えない')).toBeInTheDocument()
    })
    // **解除操作自体は出る** (FR-031 の越境案内が実行不能にならないため)。
    expect(screen.getByText('登録を解除')).toBeInTheDocument()
    // 勧める表示は出ない。
    expect(screen.queryByText(/解除をおすすめします/)).not.toBeInTheDocument()
  })

  it('「使えない」には解除を勧める', async () => {
    const goneFolder: WorkspaceFolderDTO = {
      ...FOLDER,
      reachability: 'unreachable',
      unreachableReason: 'folder-missing'
    }
    installCapability({
      listRuntimes: async () => runtimeList([HOST]),
      listFolders: async () => folderList([goneFolder])
    })
    render(<WorkspaceFoldersScreen />)

    await waitFor(() => {
      expect(screen.getByText('使えない')).toBeInTheDocument()
    })
    expect(screen.getByText(/解除をおすすめします/)).toBeInTheDocument()
  })
})
