import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { FolderListDTO, RegisterFolderResult } from '@domain/workspace/dto'
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
    boundary: null,
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
    /*
     * **2 箇所に出る。** 所在ごとの行 (理由の帰属) と、索引の性質による
     * バナー (復旧の導線つき。ux H-003 で到達可能にした) の両方である。
     * バナーは全所在が同じ理由のときその理由のヒントを出すので、ここでは重なる。
     */
    expect(screen.getAllByText('ディストロを起動してから再取得してください。').length).toBe(2)
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

  it('登録フォルダの区画があっても未列挙の案内が出る (FR-032 / FR-051 / ux H-003)', async () => {
    /*
     * **区画の数で空状態を判定できない。**
     * `folder` グループは登録フォルダから必ず seed されるため (FR-051 / `group.ts`)、
     * 登録フォルダが 1 件でもあれば区画は必ず 1 件以上になる。
     * 以前は `visible.length === 0` を条件にしていたので、
     * 「全所在が未列挙」の分岐が**実機で到達不能**だった。
     *
     * production が実際に作る形 (履歴 0 件の folder グループ + 全所在 failed) で固定する。
     */
    const refreshRuntimes = vi.fn(() => Promise.resolve({ runtimes: [] } as never))
    installCapability({
      listSessions: () =>
        Promise.resolve(
          index([folderGroup([])], {
            outcomes: [outcome({ status: 'failed', reasonKey: 'permission-denied', count: 0 })]
          })
        ),
      refreshRuntimes,
      refreshSessions: () => Promise.resolve(index([folderGroup([])])),
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

    /* 案内が出る。 */
    await waitFor(() =>
      expect(screen.getByText('どの所在も列挙できていません。')).toBeInTheDocument()
    )

    /* **理由に合った案内である** (ux M-003)。起動しても直らない理由に「起動して」と言わない。 */
    expect(
      screen.getAllByText('そのユーザのホームは Windows 側から読めません。').length
    ).toBeGreaterThan(0)
    expect(
      screen.queryByText('ディストロを起動してから再取得してください。')
    ).not.toBeInTheDocument()

    /* **区画は消えない** (FR-051)。 */
    expect(screen.getAllByText('work').length).toBeGreaterThan(0)
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

    /*
     * 所在 Ubuntu で絞ると 0 件になる。**理由は「folder グループが所在を持たないから」ではない**
     * (それは code-gate iteration 1 の ux H-005 で直した不具合の挙動である)。
     * ここでは folder のセッションが `host#0` 由来であり、Ubuntu 側が 0 件だからである。
     */
    screen.getByRole('button', { name: 'Ubuntu' }).click()

    await waitFor(() =>
      expect(screen.getByText('絞り込みに一致するセッションがありません。')).toBeInTheDocument()
    )
    screen.getByRole('button', { name: '絞り込みを解除する' }).click()
    await waitFor(() => expect(screen.getByText('要約')).toBeInTheDocument())
  })

  it('所在で絞っても登録フォルダのセッションが残る (FR-040 / ux H-005)', async () => {
    /*
     * **区画単位ではなくセッション単位で絞る。**
     * 以前は `folder` / `unknown` グループが `location` を持たないことを理由に
     * 一律で除外され、**所在を選ぶと登録フォルダが全滅**していた。
     * この feature の中心価値は所在をまたぐ一覧であり、その絞り込みが主役を隠していた。
     */
    const onHost = session({
      sessionId: 'aaaaaaaa-0000-0000-0000-000000000001',
      summary: 'ホスト側'
    })
    const onWsl = session({
      sessionId: 'bbbbbbbb-0000-0000-0000-000000000002',
      targetKey: 'wsl:Ubuntu#0',
      summary: 'ディストロ側'
    })

    install(
      index([folderGroup([onHost, onWsl])], {
        outcomes: [
          outcome({ count: 1 }),
          outcome({
            location: { kind: 'wsl', distroName: 'Ubuntu' },
            targetKey: 'wsl:Ubuntu#0',
            count: 1
          })
        ]
      })
    )

    render(<SessionListScreen />)
    await waitFor(() => expect(screen.getByText('ホスト側')).toBeInTheDocument())

    screen.getByRole('button', { name: 'Ubuntu' }).click()

    /* **登録フォルダの区画は残り、中身だけが Ubuntu 側に絞られる。** */
    await waitFor(() => expect(screen.queryByText('ホスト側')).not.toBeInTheDocument())
    expect(screen.getByText('ディストロ側')).toBeInTheDocument()
    expect(screen.queryByText('絞り込みに一致するセッションがありません。')).not.toBeInTheDocument()
  })

  it('取得中は区画の件数を確定値として見せない (FR-037 / ux H-002)', async () => {
    /*
     * data-model §7 は「`partial` の間はグループ件数を確定値として見せない」と定めている。
     * **ヘッダだけが保護されていて、区画見出しと所在行が無条件に数を描いていた。**
     */
    install(index([folderGroup([session()])], { complete: false }))

    render(<SessionListScreen />)
    await waitFor(() => expect(screen.getByText('要約')).toBeInTheDocument())

    expect(screen.queryByText('1 件')).not.toBeInTheDocument()
    expect(screen.getAllByText('1 件以上 (取得中)').length).toBeGreaterThan(0)
  })

  it('取得中のボタンを `disabled` にせず `aria-disabled` で示す (a11y H-007)', async () => {
    /*
     * `disabled` は要素をタブ順から外すため、押した瞬間にフォーカスが body へ落ちる。
     * `WorkspaceFoldersScreen` が既に明文化している方針に揃える。
     */
    install(index([folderGroup([session()])]))

    render(<SessionListScreen />)
    const button = await waitFor(() => screen.getByRole('button', { name: '全件を取り直す' }))

    expect(button).not.toBeDisabled()
    expect(button).toHaveAttribute('aria-disabled', 'false')
  })

  it('畳める区画が `aria-expanded` を持ち押下で反転する (a11y H-002)', async () => {
    /*
     * ラベルの「畳む / 開く」だけでは、**畳まれているのか / 本当に 0 件なのか /
     * 取得途中なのか**が支援技術で区別できない。
     * この 3 者の区別は FR-051 / FR-025 / FR-037 がわざわざ分けた軸である。
     */
    install(
      index([
        {
          kind: 'unregistered',
          location: { kind: 'windows' },
          cwd: { namespace: 'host', value: 'C:\\tmp\\x' },
          cwdDisplay: null,
          cwdKey: 'host|C:\\tmp\\x',
          suggestedDisplayName: 'x',
          sessions: [session()]
        }
      ])
    )

    render(<SessionListScreen />)
    const toggle = await waitFor(() => screen.getByRole('button', { name: '開く' }))

    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(toggle).toHaveAttribute('aria-controls')

    toggle.click()

    await waitFor(() =>
      expect(screen.getByRole('button', { name: '畳む' })).toHaveAttribute('aria-expanded', 'true')
    )
  })

  it('絞り込みの選択が `aria-pressed` と群のラベルで示される (a11y H-003)', async () => {
    /*
     * 以前は `variant` の背景差 (白に対し 1.04:1) だけで選択を示しており、
     * `aria-pressed` も群のアクセシブル名も無かった。
     */
    install(
      index([folderGroup([session()])], {
        outcomes: [
          outcome(),
          outcome({
            location: { kind: 'wsl', distroName: 'Ubuntu' },
            targetKey: 'wsl:Ubuntu#0',
            count: 0,
            status: 'no-history'
          })
        ]
      })
    )

    render(<SessionListScreen />)
    await waitFor(() => expect(screen.getByText('要約')).toBeInTheDocument())

    expect(screen.getByRole('group', { name: '所在で絞り込む' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /すべての所在/ })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    expect(screen.getByRole('button', { name: 'Ubuntu' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('鮮度の 1 行が `role="status"` の中にある (a11y H-001)', async () => {
    /*
     * 段階描画・取得完了・失敗を**この 1 行に集約して**通知する。
     * 行ごとに live region を置くと 700 件規模で読み上げが実用にならない。
     */
    install(index([folderGroup([session()])]))

    render(<SessionListScreen />)
    await waitFor(() => expect(screen.getByText('要約')).toBeInTheDocument())

    const status = screen.getByRole('status')
    expect(status).toHaveAttribute('aria-live', 'polite')
    expect(status.textContent).toContain('取得時刻')
  })

  it('行がリストの項目として露出する (a11y H-004)', async () => {
    /*
     * `ThreadListPrimitive` の実体は素の div で role を持たない。
     * element の写しから書き込み操作を外したときに semantics も落ちていた。
     */
    install(index([folderGroup([session()])]))

    render(<SessionListScreen />)
    await waitFor(() => expect(screen.getByText('要約')).toBeInTheDocument())

    /* **所在の結果も ul で list なので、スレッド一覧に絞る。** */
    const rows = document.querySelector('[data-slot="aui_thread-list-items"]')
    expect(rows).not.toBeNull()
    expect(rows).toHaveAttribute('role', 'list')
    expect(rows?.querySelectorAll('[role="listitem"]').length).toBe(1)
  })

  it('付帯情報が行の中にある (a11y H-005 / ux H-001)', async () => {
    /*
     * 以前は「表題の列」と「メタデータの列」が**兄弟として縦に分離**しており、
     * 対応づけが配列の順序だけに依っていた。
     * 行にフォーカスしたとき、その行を識別する情報 (FR-052 の由来ユーザなど) が
     * 別の場所にあった。
     */
    install(index([folderGroup([session({ targetLabel: 'alice' })])]))

    render(<SessionListScreen />)
    await waitFor(() => expect(screen.getByText('要約')).toBeInTheDocument())

    const rows = document.querySelector('[data-slot="aui_thread-list-items"]')
    const row = rows?.querySelector('[role="listitem"]')
    expect(row).not.toBeNull()
    expect(row?.textContent).toContain('要約')
    expect(row?.textContent).toContain('alice')
  })

  it('上限で打ち切られた対象に続きを取る導線がある (FR-038 / ux H-007)', async () => {
    const fetchMoreSessions = vi.fn(() => Promise.resolve(index([folderGroup([session()])])))
    installCapability({
      listSessions: () =>
        Promise.resolve(
          index([folderGroup([session()])], {
            outcomes: [outcome({ truncated: true, count: 50 })]
          })
        ),
      fetchMoreSessions,
      onSessionsChanged: () => () => {}
    })

    render(<SessionListScreen />)
    await waitFor(() => expect(screen.getByText('上限で打ち切りました')).toBeInTheDocument())

    screen.getByRole('button', { name: '続きを取る' }).click()

    await waitFor(() => expect(fetchMoreSessions).toHaveBeenCalledWith('host#0', 50))
  })

  it('取得中でもボタンのラベルを減光しない (a11y H-201)', async () => {
    /*
     * `opacity-50` は子孫すべてに掛かるため、「取得中…」が 3.74:1 に落ちていた。
     * `disabled` をやめた狙いは「到達して理由を読める」ことなので、
     * 到達した先で文字が読めないのでは対策が半分で止まる。
     */
    install(index([folderGroup([session()])]))

    render(<SessionListScreen />)
    const button = await waitFor(() => screen.getByRole('button', { name: '全件を取り直す' }))

    /* 減光はアイコンだけに掛ける。ラベルには掛けない。 */
    expect(button.className).not.toMatch(/(^|s)opacity-50(s|$)/)
  })

  it('選択した行を hover と別の見えで示す (a11y H-202)', async () => {
    /*
     * 選択とフォーカスは分離したが、**選択が `hover` と同色の 1.04:1 のまま**だった。
     * R-2 は本文を持たないので、この表示が「行を選べた」ことの唯一の視覚的手がかりである。
     */
    const { container } = render(<div />)
    container.remove()

    install(index([folderGroup([session()])]))
    render(<SessionListScreen />)
    await waitFor(() => expect(screen.getByText('要約')).toBeInTheDocument())

    const row = document.querySelector('[data-slot="aui_thread-list-item"]')
    expect(row).not.toBeNull()
    const className = row?.className ?? ''

    /* 選択は面積と形で示す (左端のインジケータ + 太字)。 */
    expect(className).toContain('data-active:before:bg-foreground')
    expect(className).toContain('data-active:font-medium')
    /* **hover と同じ背景を選択に使わない。** */
    expect(className).toContain('hover:bg-muted')
    expect(className).not.toContain('data-active:bg-muted')
  })

  it('越境を行ごとに示す (US-1 AC-4 / po H-001)', async () => {
    /*
     * **越境はセッション単位で判定されるのにフォルダ単位の OR で畳まれていた。**
     * Windows 側の登録フォルダをホストと WSL (`/mnt/c/...`) の両方から使う典型ケースで、
     * **1 件でも越境があるとフォルダ内の全行が越境と読めた**。
     * US-1 AC-4 は「**そのセッション**は…越境である旨が示される」と行単位を求めている。
     */
    const native = session({
      sessionId: 'aaaaaaaa-0000-0000-0000-000000000001',
      summary: '同じ所在の行',
      boundary: 'native'
    })
    const crossing = session({
      sessionId: 'bbbbbbbb-0000-0000-0000-000000000002',
      summary: 'マウント経由の行',
      boundary: 'cross'
    })

    /* **フォルダ単位は OR なので cross。** 行単位は各セッションが持つ。 */
    const group: SessionGroupDTO = {
      kind: 'folder',
      folderId: 'folder-1',
      boundary: 'cross',
      sessions: [native, crossing]
    }
    install(index([group]))

    render(<SessionListScreen />)
    await waitFor(() => expect(screen.getByText('同じ所在の行')).toBeInTheDocument())

    const rows = document.querySelectorAll('[data-slot="aui_thread-list-items"] [role="listitem"]')
    expect(rows).toHaveLength(2)

    /* **越境の行だけに越境が出る。** */
    const texts = [...rows].map((row) => row.textContent ?? '')
    const crossRow = texts.find((t) => t.includes('マウント経由の行')) ?? ''
    const nativeRow = texts.find((t) => t.includes('同じ所在の行')) ?? ''

    expect(crossRow).toContain('越境')
    expect(nativeRow).not.toContain('越境')

    /* 見出しは「含む」と読める形にする (どの行かはここから決まらない)。 */
    expect(screen.getByText('越境を含む')).toBeInTheDocument()
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

/**
 * 空状態の断言 (pr-gate Round 1 / ux H-201 〜 H-204)。
 *
 * **「無い」「読めなかった」「まだ分からない」を混ぜない** (FR-012 / FR-037)。
 * この 3 つはそれぞれ別の操作につながるため、取り違えると
 * 利用者は**状況が変わらない操作**を繰り返すことになる。
 */

function folderList(): FolderListDTO {
  return {
    folders: [
      {
        id: 'folder-1',
        location: { kind: 'windows' },
        path: { namespace: 'host', value: 'C:\\work\\project' },
        displayName: 'project',
        reachability: 'reachable',
        unreachableReason: null,
        blockedReason: null,
        resolutionSteps: [],
        registeredAt: FETCHED_AT
      }
    ],
    restoreIssues: { skipped: 0, reasonKeys: [], backupPath: null }
  }
}

function installWithFolders(value: SessionIndexDTO): void {
  installCapability({
    listSessions: () => Promise.resolve(value),
    refreshSessions: () => Promise.resolve(value),
    fetchMoreSessions: () => Promise.resolve(value),
    onSessionsChanged: () => () => {},
    listFolders: () => Promise.resolve(folderList()),
    onFoldersChanged: () => () => {}
  })
}

const UBUNTU_FAILED = outcome({
  location: { kind: 'wsl', distroName: 'Ubuntu' },
  targetKey: 'wsl:Ubuntu#0',
  targetLabel: 'y',
  status: 'failed',
  reasonKey: 'distro-not-running',
  count: 0
})

describe('SessionListScreen — 空状態の断言', () => {
  it('取得中は「どの所在も列挙できていません」と言わない (FR-037)', async () => {
    /*
     * main は**所在 1 件ぶんずつ**公開する。先頭に置かれるホストが失敗すると、
     * その時点の `outcomes` は「全件 failed」になる。
     */
    installWithFolders(
      index([folderGroup([])], {
        complete: false,
        outcomes: [outcome({ status: 'failed', reasonKey: 'permission-denied', count: 0 })]
      })
    )

    render(<SessionListScreen />)

    await waitFor(() => expect(screen.getByText('取得中です。')).toBeInTheDocument())
    expect(screen.queryByText('どの所在も列挙できていません。')).not.toBeInTheDocument()
  })

  it('出そろってから「どの所在も列挙できていません」を出す (FR-032)', async () => {
    installWithFolders(
      index([folderGroup([])], {
        outcomes: [outcome({ status: 'failed', reasonKey: 'permission-denied', count: 0 })]
      })
    )

    render(<SessionListScreen />)

    await waitFor(() =>
      expect(screen.getByText('どの所在も列挙できていません。')).toBeInTheDocument()
    )
  })

  it('一部の所在が読めないとき「セッションがまだありません」と言わない (FR-012)', async () => {
    installWithFolders(
      index([folderGroup([])], {
        outcomes: [outcome({ count: 0, status: 'no-history' }), UBUNTU_FAILED]
      })
    )

    render(<SessionListScreen />)

    await waitFor(() =>
      expect(screen.getByText('列挙できた所在にセッションがありません。')).toBeInTheDocument()
    )
    expect(screen.queryByText('セッションがまだありません。')).not.toBeInTheDocument()
  })

  it('一部の所在が読めないとき区画でも 0 件を断言しない (FR-012 / FR-051)', async () => {
    installWithFolders(
      index([folderGroup([])], {
        outcomes: [outcome({ count: 0, status: 'no-history' }), UBUNTU_FAILED]
      })
    )

    render(<SessionListScreen />)

    await waitFor(() =>
      expect(
        screen.getByText('列挙できていない所在があるため、ここに出ていない行があるかもしれません。')
      ).toBeInTheDocument()
    )
    expect(screen.queryByText('このフォルダのセッションはありません。')).not.toBeInTheDocument()
  })

  it('読めなかった所在を代表 1 件に潰さない (FR-012)', async () => {
    /* 理由が所在ごとに違う。**片方だけ出すと、もう片方は直しようがない。** */
    installWithFolders(
      index([folderGroup([])], {
        outcomes: [
          outcome({ status: 'failed', reasonKey: 'permission-denied', count: 0 }),
          UBUNTU_FAILED
        ]
      })
    )

    render(<SessionListScreen />)

    const section = await screen.findByRole('region', { name: /project/ })
    expect(section.textContent).toContain('そのユーザのホームは Windows 側から読めません。')
    expect(section.textContent).toContain('ディストロを起動してから再取得してください。')
    expect(section.textContent).toContain('Ubuntu')
  })

  it('打ち切った所在の件数を確定形で出さない (FR-038)', async () => {
    installWithFolders(
      index([folderGroup([session()])], {
        outcomes: [outcome({ count: 5000, truncated: true })]
      })
    )

    render(<SessionListScreen />)

    await waitFor(() => expect(screen.getByText('5000 件以上')).toBeInTheDocument())
    expect(screen.queryByText('5000 件')).not.toBeInTheDocument()
  })
})
