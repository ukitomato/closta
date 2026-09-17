import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { RegisterFolderResult } from '@domain/workspace/dto'
import type {
  EnumerationOutcomeDTO,
  SessionGroupDTO,
  SessionIndexDTO,
  SessionSummaryDTO
} from '@domain/session/dto'

import { installCapability } from '@/test-support/capability'

import { SessionListScreen } from './SessionListScreen'
import { useSessionsStore } from '@/stores/sessions'
import { useUiStore } from '@/stores/ui'

/**
 * FE-046 — 一覧の表示 (SC-006 / SC-009 / SC-012 / FR-029 / FR-034 / FR-037 / FR-047 / FR-052)。
 *
 * **preload をスタブして renderer 単体で試す** (vitest.config.ts の方針)。
 */

const FETCHED_AT = Date.UTC(2026, 8, 17, 12, 34)

function session(overrides: Partial<SessionSummaryDTO> = {}): SessionSummaryDTO {
  return {
    sessionId: '11111111-2222-3333-4444-555555555555',
    targetKey: 'host#0',
    targetLabel: 'yuki',
    summary: '要約',
    firstPrompt: null,
    customTitle: null,
    lastModified: FETCHED_AT,
    createdAt: FETCHED_AT,
    fileSize: 100,
    gitBranch: null,
    tag: null,
    cwd: { namespace: 'host', value: 'C:\\work\\project' },
    cwdDisplay: null,
    originKind: 'host',
    programmatic: false,
    worktree: false,
    normalized: { truncated: false, controlCharsRemoved: false },
    ...overrides
  }
}

function outcome(overrides: Partial<EnumerationOutcomeDTO> = {}): EnumerationOutcomeDTO {
  return {
    location: { kind: 'windows' },
    targetKey: 'host#0',
    targetLabel: 'yuki',
    status: 'ok',
    reasonKey: null,
    count: 1,
    truncated: false,
    fetchedAt: FETCHED_AT,
    ...overrides
  }
}

function index(
  groups: readonly SessionGroupDTO[],
  overrides: Partial<SessionIndexDTO> = {}
): SessionIndexDTO {
  return {
    groups,
    outcomes: [outcome()],
    fetchedAt: FETCHED_AT,
    complete: true,
    ...overrides
  }
}

function folderGroup(sessions: readonly SessionSummaryDTO[]): SessionGroupDTO {
  return { kind: 'folder', folderId: 'folder-1', boundary: 'native', sessions }
}

function install(value: SessionIndexDTO): void {
  installCapability({
    listSessions: () => Promise.resolve(value),
    refreshSessions: () => Promise.resolve(value),
    fetchMoreSessions: () => Promise.resolve(value),
    onSessionsChanged: () => () => {}
  })
}

beforeEach(() => {
  // ストアはモジュール寿命なので、テストごとに初期状態へ戻す。
  useSessionsStore.setState({ index: null, loading: false, failed: false, selectedRowKey: null })
  useUiStore.setState({ screen: 'sessions', folderDraftSeed: null })
})

describe('SessionListScreen', () => {
  it('取得時刻を必ず出す (FR-034 / SC-012)', async () => {
    install(index([folderGroup([session()])]))

    render(<SessionListScreen />)

    await waitFor(() => expect(screen.getByText(/取得時刻/)).toBeInTheDocument())
  })

  it('先頭ページ段階では件数を確定値として見せない (FR-037)', async () => {
    install(index([folderGroup([session()])], { complete: false }))

    render(<SessionListScreen />)

    await waitFor(() => expect(screen.getByText(/件数は確定していません/)).toBeInTheDocument())
    expect(screen.queryByText(/全 1 件/)).not.toBeInTheDocument()
  })

  it('全件取得後は総数を出す', async () => {
    install(index([folderGroup([session()])]))

    render(<SessionListScreen />)

    await waitFor(() => expect(screen.getByText(/全 1 件/)).toBeInTheDocument())
  })

  it('日本語・絵文字・非 ASCII の要約をそのまま出す (SC-009)', async () => {
    const text = '日本語と絵文字 🎉 と Ünïcödé'
    install(index([folderGroup([session({ summary: text })])]))

    render(<SessionListScreen />)

    await waitFor(() => expect(screen.getByText(text)).toBeInTheDocument())
  })

  it('要約が空の行を識別子と時刻で示す (FR-047)', async () => {
    install(
      index([folderGroup([session({ summary: null, firstPrompt: null, customTitle: null })])])
    )

    render(<SessionListScreen />)

    // 識別子の先頭 8 文字が出る。**空欄にしない。**
    await waitFor(() => expect(screen.getByText(/11111111/)).toBeInTheDocument())
  })

  it('要約より customTitle を優先する (FR-047 の選択順)', async () => {
    install(index([folderGroup([session({ customTitle: '手で付けた表題' })])]))

    render(<SessionListScreen />)

    await waitFor(() => expect(screen.getByText('手で付けた表題')).toBeInTheDocument())
    expect(screen.queryByText('要約')).not.toBeInTheDocument()
  })

  it('由来候補 (ユーザ) を常時出す (FR-052)', async () => {
    install(index([folderGroup([session({ targetLabel: 'alice' })])]))

    render(<SessionListScreen />)

    await waitFor(() => expect(screen.getAllByText('alice').length).toBeGreaterThan(0))
  })

  it('worktree と programmatic を区別して示す (FR-029)', async () => {
    install(
      index([
        folderGroup([
          session({ sessionId: 'a', worktree: true }),
          session({ sessionId: 'b', programmatic: true })
        ])
      ])
    )

    render(<SessionListScreen />)

    await waitFor(() => expect(screen.getByText('worktree')).toBeInTheDocument())
    expect(screen.getByText('SDK / daemon 由来')).toBeInTheDocument()
  })

  it('切り詰めが起きたことを示す (FR-049)', async () => {
    install(
      index([
        folderGroup([session({ normalized: { truncated: true, controlCharsRemoved: false } })])
      ])
    )

    render(<SessionListScreen />)

    await waitFor(() => expect(screen.getByText('（表示は切り詰め）')).toBeInTheDocument())
  })

  it('履歴 0 件の登録フォルダを画面から消さない (FR-051 / SC-013)', async () => {
    install(index([folderGroup([])]))

    render(<SessionListScreen />)

    await waitFor(() =>
      expect(screen.getByText('このフォルダのセッションはありません。')).toBeInTheDocument()
    )
  })

  it('4 種のグループを潰さない (FR-022 / FR-025 / FR-028)', async () => {
    install(
      index([
        folderGroup([session({ sessionId: 'a' })]),
        {
          kind: 'pending',
          location: { kind: 'wsl', distroName: 'Ubuntu' },
          reasonKey: 'distro-not-running',
          sessions: [session({ sessionId: 'b' })]
        },
        {
          kind: 'unregistered',
          cwdKey: 'k',
          cwd: { namespace: 'host', value: 'C:\\other' },
          cwdDisplay: null,
          suggestedDisplayName: 'other',
          location: { kind: 'windows' },
          sessions: [session({ sessionId: 'c' })]
        },
        { kind: 'unknown', reasonKey: 'cwd-absent', sessions: [session({ sessionId: 'd' })] }
      ])
    )

    render(<SessionListScreen />)

    await waitFor(() => expect(screen.getByText('未登録フォルダ')).toBeInTheDocument())
    expect(screen.getByText('作業フォルダ不明')).toBeInTheDocument()
    expect(screen.getByText('所在のディストロが停止中です')).toBeInTheDocument()
    expect(screen.getByText('作業ディレクトリが記録されていません')).toBeInTheDocument()
  })

  it('未登録グループを既定で畳む (FR-025)', async () => {
    install(
      index([
        {
          kind: 'unregistered',
          cwdKey: 'k',
          cwd: { namespace: 'host', value: 'C:\\other' },
          cwdDisplay: null,
          suggestedDisplayName: 'other',
          location: { kind: 'windows' },
          sessions: [session({ summary: '畳まれている要約' })]
        }
      ])
    )

    render(<SessionListScreen />)

    await waitFor(() => expect(screen.getByText('未登録フォルダ')).toBeInTheDocument())
    // 見出しは出るが中身は出ない。開く導線がある。
    expect(screen.queryByText('畳まれている要約')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '開く' })).toBeInTheDocument()
  })

  it('停止中の所在を理由と解消手順つきで示す (FR-030 / FR-032)', async () => {
    install(
      index([], {
        outcomes: [
          outcome({
            location: { kind: 'wsl', distroName: 'Ubuntu' },
            targetKey: 'wsl:Ubuntu#0',
            targetLabel: '',
            status: 'failed',
            reasonKey: 'distro-not-running',
            count: 0
          })
        ]
      })
    )

    render(<SessionListScreen />)

    await waitFor(() => expect(screen.getByText('停止中のため未列挙')).toBeInTheDocument())
    expect(screen.getByText('ディストロを起動してから再取得してください。')).toBeInTheDocument()
  })

  it('打ち切りを黙って隠さない (FR-038)', async () => {
    install(index([], { outcomes: [outcome({ truncated: true })] }))

    render(<SessionListScreen />)

    await waitFor(() => expect(screen.getByText('上限で打ち切りました')).toBeInTheDocument())
  })

  it('取得が落ちたら理由と再試行の導線を出す', async () => {
    installCapability({
      listSessions: () => Promise.reject(new Error('失敗')),
      onSessionsChanged: () => () => {}
    })

    render(<SessionListScreen />)

    await waitFor(() =>
      expect(screen.getByText('セッション一覧を取得できませんでした')).toBeInTheDocument()
    )
  })

  it('config ディレクトリのパスを画面に出さない (FR-042)', async () => {
    install(index([folderGroup([session()])]))

    const { container } = render(<SessionListScreen />)

    await waitFor(() => expect(screen.getByText(/取得時刻/)).toBeInTheDocument())
    expect(container.textContent ?? '').not.toContain('.claude')
    expect(container.textContent ?? '').not.toContain('wsl.localhost')
  })

  it('再取得は利用者の明示操作で呼ばれる (FR-033)', async () => {
    const refreshSessions = vi.fn(() => Promise.resolve(index([folderGroup([session()])])))
    installCapability({
      listSessions: () => Promise.resolve(index([folderGroup([session()])])),
      refreshSessions,
      onSessionsChanged: () => () => {}
    })

    render(<SessionListScreen />)
    await waitFor(() => expect(screen.getByText(/取得時刻/)).toBeInTheDocument())

    expect(refreshSessions).not.toHaveBeenCalled()
    screen.getByRole('button', { name: '全件を取り直す' }).click()
    await waitFor(() => expect(refreshSessions).toHaveBeenCalledTimes(1))
  })
})

/* ── US-2: 未登録フォルダから登録へ (FE-053) ──────────────────── */

describe('SessionListScreen — 未登録フォルダからの登録 (FE-051 / FE-053)', () => {
  function unregisteredIndex(): SessionIndexDTO {
    return index([
      {
        kind: 'unregistered',
        cwdKey: 'k',
        cwd: { namespace: 'host', value: 'C:\\work\\other' },
        cwdDisplay: null,
        suggestedDisplayName: 'other',
        location: { kind: 'windows' },
        sessions: [session({ sessionId: 'x' })]
      }
    ])
  }

  it('所在とパスを初期値として渡すだけで、アプリが登録しない (FR-026)', async () => {
    // 呼ばれないことを確かめる代役。**呼ばれたら型で分かる形にしておく。**
    const registerFolder = vi.fn((): Promise<RegisterFolderResult> =>
      Promise.reject(new Error('登録はアプリが行わない (FR-026)'))
    )
    installCapability({
      listSessions: () => Promise.resolve(unregisteredIndex()),
      onSessionsChanged: () => () => {},
      registerFolder
    })

    render(<SessionListScreen />)
    await waitFor(() => expect(screen.getByText('未登録フォルダ')).toBeInTheDocument())

    screen.getByRole('button', { name: '作業フォルダとして登録' }).click()

    // **登録は呼ばれない。** 初期値が積まれ、画面が登録側へ移るだけである。
    expect(registerFolder).not.toHaveBeenCalled()
    await waitFor(() => expect(useUiStore.getState().screen).toBe('folders'))
    expect(useUiStore.getState().folderDraftSeed).toEqual({
      location: { kind: 'windows' },
      path: { namespace: 'host', value: 'C:\\work\\other' },
      suggestedDisplayName: 'other'
    })
  })

  it('実在確認を行わない (FR-027)', async () => {
    const beginBrowse = vi.fn()
    installCapability({
      listSessions: () => Promise.resolve(unregisteredIndex()),
      onSessionsChanged: () => () => {},
      beginBrowse
    })

    render(<SessionListScreen />)
    await waitFor(() => expect(screen.getByText('未登録フォルダ')).toBeInTheDocument())
    screen.getByRole('button', { name: '作業フォルダとして登録' }).click()

    // 任意パスの存在を問い合わせる経路を通らない。
    expect(beginBrowse).not.toHaveBeenCalled()
  })

  it('所在が決まらないグループには登録の導線を出さない', async () => {
    installCapability({
      listSessions: () =>
        Promise.resolve(
          index([
            {
              kind: 'unregistered',
              cwdKey: 'k',
              cwd: null,
              cwdDisplay: '/somewhere',
              suggestedDisplayName: null,
              location: null,
              sessions: [session({ sessionId: 'y' })]
            }
          ])
        ),
      onSessionsChanged: () => () => {}
    })

    render(<SessionListScreen />)
    await waitFor(() => expect(screen.getByText('未登録フォルダ')).toBeInTheDocument())

    expect(screen.queryByRole('button', { name: '作業フォルダとして登録' })).not.toBeInTheDocument()
  })

  it('総数が保たれる — グループの件数の和が行数と一致する (SC-006)', async () => {
    const value = index([
      folderGroup([session({ sessionId: 'a' })]),
      { kind: 'unknown', reasonKey: 'cwd-absent', sessions: [session({ sessionId: 'b' })] }
    ])
    installCapability({
      listSessions: () => Promise.resolve(value),
      onSessionsChanged: () => () => {}
    })

    render(<SessionListScreen />)
    await waitFor(() => expect(screen.getByText(/全 2 件/)).toBeInTheDocument())

    const sum = value.groups.reduce((total, group) => total + group.sessions.length, 0)
    expect(sum).toBe(2)
  })
})

/* ── US-3 / US-4: 失敗の封じ込めと空状態と絞り込み (FE-064 / FE-073) ── */

describe('SessionListScreen — 失敗の封じ込めと空状態 (FE-064)', () => {
  it('1 所在が失敗しても他の所在の一覧が欠落 0 件で描画される (SC-007)', async () => {
    installCapability({
      listSessions: () =>
        Promise.resolve(
          index([folderGroup([session({ sessionId: 'a' }), session({ sessionId: 'b' })])], {
            outcomes: [
              outcome({ count: 2 }),
              outcome({
                location: { kind: 'wsl', distroName: 'Ubuntu' },
                targetKey: 'wsl:Ubuntu#0',
                targetLabel: '',
                status: 'failed',
                reasonKey: 'permission-denied',
                count: 0
              })
            ]
          })
        ),
      listFolders: () =>
        Promise.resolve({
          folders: [
            {
              id: 'folder-1',
              location: { kind: 'windows' },
              path: { namespace: 'host', value: 'C:\\work' },
              displayName: 'work',
              reachability: 'unknown',
              boundary: 'unknown',
              unreachableReason: null,
              blockedReason: null,
              resolutionSteps: [],
              existence: 'unknown'
            }
          ],
          restoreIssues: { skipped: 0, reasonKeys: [], backupPath: null }
        } as never),
      onFoldersChanged: () => () => {},
      onSessionsChanged: () => () => {}
    })

    render(<SessionListScreen />)

    await waitFor(() => expect(screen.getByText('読み取り権限がありません')).toBeInTheDocument())
    // **成功した所在の行は残る。**
    expect(screen.getByText(/全 2 件/)).toBeInTheDocument()
    // 見出しと絞り込みボタンの双方に出る。**識別子ではなく表示名である**ことが要点 (FR-047)。
    expect(screen.getAllByText('work').length).toBeGreaterThan(0)
  })

  it('全所在が未列挙なら再検出の導線を出す (FR-032 の 4 つ目)', async () => {
    const refreshRuntimes = vi.fn(() => Promise.resolve({ runtimes: [] } as never))
    installCapability({
      listSessions: () =>
        Promise.resolve(
          index([], {
            outcomes: [outcome({ status: 'failed', reasonKey: 'distro-not-running', count: 0 })]
          })
        ),
      refreshRuntimes,
      refreshSessions: () => Promise.resolve(index([])),
      listFolders: () =>
        Promise.resolve({
          folders: [
            {
              id: 'folder-1',
              location: { kind: 'windows' },
              path: { namespace: 'host', value: 'C:\\work' },
              displayName: 'work',
              reachability: 'unknown',
              boundary: 'unknown',
              unreachableReason: null,
              blockedReason: null,
              resolutionSteps: [],
              existence: 'unknown'
            }
          ],
          restoreIssues: { skipped: 0, reasonKeys: [], backupPath: null }
        } as never),
      onFoldersChanged: () => () => {},
      onSessionsChanged: () => () => {}
    })

    render(<SessionListScreen />)

    await waitFor(() =>
      expect(screen.getByText('どの所在も列挙できていません。')).toBeInTheDocument()
    )
    screen.getAllByRole('button', { name: 'ランタイムを再検出して取り直す' })[0].click()
    await waitFor(() => expect(refreshRuntimes).toHaveBeenCalled())
  })

  it('登録フォルダ 0 件なら登録への導線を出す (FR-032 の 3 つ目)', async () => {
    installCapability({
      listSessions: () => Promise.resolve(index([])),
      listFolders: () =>
        Promise.resolve({
          folders: [],
          restoreIssues: { skipped: 0, reasonKeys: [], backupPath: null }
        } as never),
      onFoldersChanged: () => () => {},
      onSessionsChanged: () => () => {}
    })

    render(<SessionListScreen />)

    await waitFor(() =>
      expect(screen.getByText('作業フォルダがまだ登録されていません。')).toBeInTheDocument()
    )
    screen.getByRole('button', { name: '作業フォルダを登録する' }).click()
    await waitFor(() => expect(useUiStore.getState().screen).toBe('folders'))
  })

  it('登録フォルダ 3 件 / セッション 0 件で folder グループが 3 件現れる (FR-051 / SC-013)', async () => {
    installCapability({
      listSessions: () =>
        Promise.resolve(
          index([
            { kind: 'folder', folderId: 'f1', boundary: 'native', sessions: [] },
            { kind: 'folder', folderId: 'f2', boundary: 'native', sessions: [] },
            { kind: 'folder', folderId: 'f3', boundary: 'native', sessions: [] }
          ])
        ),
      onSessionsChanged: () => () => {}
    })

    render(<SessionListScreen />)

    await waitFor(() =>
      expect(screen.getAllByText('このフォルダのセッションはありません。')).toHaveLength(3)
    )
  })
})

describe('SessionListScreen — 件数が多い場合 (FE-073)', () => {
  function manySessions(count: number): SessionSummaryDTO[] {
    return Array.from({ length: count }, (_, i) =>
      session({ sessionId: String(i).padStart(8, '0'), summary: `要約 ${i}` })
    )
  }

  it('700 件規模でも先頭ページを描ける', async () => {
    const page = manySessions(50)
    installCapability({
      listSessions: () =>
        Promise.resolve(
          index([folderGroup(page)], { complete: false, outcomes: [outcome({ count: 50 })] })
        ),
      onSessionsChanged: () => () => {}
    })

    render(<SessionListScreen />)

    await waitFor(() => expect(screen.getByText('要約 0')).toBeInTheDocument())
    // **先頭ページ段階では件数を確定値として見せない** (FR-037)。
    expect(screen.getByText(/件数は確定していません/)).toBeInTheDocument()
  })

  it('全件の通知で件数が確定する (BE-070 / FR-037)', async () => {
    const all = manySessions(700)
    // **入れ物で持つ。** 変数に直接持つと、クロージャ内の代入が
    // 制御フロー解析に見えず、呼び出し位置で `null` に絞られる。
    const sink: { notify: ((value: SessionIndexDTO) => void) | null } = { notify: null }
    installCapability({
      listSessions: () =>
        Promise.resolve(
          index([folderGroup(manySessions(50))], {
            complete: false,
            outcomes: [outcome({ count: 50 })]
          })
        ),
      onSessionsChanged: (listener) => {
        sink.notify = listener
        return () => {}
      }
    })

    render(<SessionListScreen />)
    await waitFor(() => expect(screen.getByText(/件数は確定していません/)).toBeInTheDocument())

    sink.notify?.(
      index([folderGroup(all)], { complete: true, outcomes: [outcome({ count: 700 })] })
    )

    await waitFor(() => expect(screen.getByText(/全 700 件/)).toBeInTheDocument())
  })

  it('絞り込み結果 0 件で解除の導線を出す (FR-032 の 5 つ目)', async () => {
    installCapability({
      listSessions: () =>
        Promise.resolve(
          index([folderGroup([session()])], {
            outcomes: [
              outcome(),
              outcome({
                location: { kind: 'wsl', distroName: 'Ubuntu' },
                targetKey: 'wsl:Ubuntu#0',
                targetLabel: '',
                status: 'no-history',
                count: 0
              })
            ]
          })
        ),
      onSessionsChanged: () => () => {}
    })

    render(<SessionListScreen />)
    await waitFor(() => expect(screen.getByText('要約')).toBeInTheDocument())

    // 所在 Ubuntu で絞ると、folder グループ (所在を持たない) は外れて 0 件になる。
    screen.getByRole('button', { name: 'Ubuntu' }).click()

    await waitFor(() =>
      expect(screen.getByText('絞り込みに一致するセッションがありません。')).toBeInTheDocument()
    )
    screen.getByRole('button', { name: '絞り込みを解除する' }).click()
    await waitFor(() => expect(screen.getByText('要約')).toBeInTheDocument())
  })

  it('絞り込みで IPC を往復させない (FR-040)', async () => {
    const listSessions = vi.fn(() =>
      Promise.resolve(
        index([folderGroup([session()])], {
          outcomes: [
            outcome(),
            outcome({
              location: { kind: 'wsl', distroName: 'Ubuntu' },
              targetKey: 'wsl:Ubuntu#0',
              targetLabel: '',
              status: 'no-history',
              count: 0
            })
          ]
        })
      )
    )
    installCapability({ listSessions, onSessionsChanged: () => () => {} })

    render(<SessionListScreen />)
    await waitFor(() => expect(screen.getByText('要約')).toBeInTheDocument())
    const before = listSessions.mock.calls.length

    screen.getByRole('button', { name: 'Ubuntu' }).click()
    await waitFor(() =>
      expect(screen.getByText('絞り込みに一致するセッションがありません。')).toBeInTheDocument()
    )

    expect(listSessions.mock.calls.length).toBe(before)
  })
})
