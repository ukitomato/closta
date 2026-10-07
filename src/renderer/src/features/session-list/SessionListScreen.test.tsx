import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'

import type { FolderListDTO, RegisterFolderResult } from '@domain/workspace/dto'
import type {
  EnumerationOutcomeDTO,
  SessionGroupDTO,
  SessionIndexDTO,
  SessionSummaryDTO
} from '@domain/session/dto'

import type { FailureReason } from '@domain/session/target'

import { installCapability } from '@/test-support/capability'

import { FAILURE_REASON_LABELS, PAST_SESSIONS_LABELS } from './labels'

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
  useUiStore.setState({ settings: { open: false, section: 'runtimes' }, folderDraftSeed: null })
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
     * **解消手順は 1 箇所にだけ出す** (pr-gate Round 4 / 不変条件 5 / UX3-003)。
     *
     * 以前はこの assert が `.toBe(2)` で、所在の行と索引バナーの**重複を期待値にしていた**。
     * 区画にも同じ理由を出していたため、実際には
     * (登録フォルダ数 × 失敗所在数) 回まで反復しうる状態だった。
     * 理由の正本は「列挙の結果」の行であり、バナーは要約に徹する。
     */
    expect(screen.getAllByText('ディストロを起動してから再取得してください。').length).toBe(1)
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
      // 区画の見出し (「過去のセッション」) と同じ語で言う (O-7 pr-gate R1 ux L-002)。
      expect(screen.getByText('過去のセッションを取得できませんでした')).toBeInTheDocument()
    )
  })

  /*
   * FR-042 (config ディレクトリのパスと UNC を境界に出さない) は**ここでは検証できない**
   * (pr-gate Round 4 / 不変条件 6)。
   *
   * かつてここに「画面に `.claude` / `wsl.localhost` が出ない」というテストがあったが、
   * **fixture の入力にその文字列が 1 つも無かった**。画面が何を描いても通る形で、
   * 実装をどう壊しても落ちない。
   *
   * この規則を実際に守っているのは 2 箇所である。テストもそこにある。
   *
   * | 守るもの | 場所 |
   * |---|---|
   * | DTO に `configDir` を載せない (フィールド許可リスト) | `domain/session/dto-schema.test.ts` |
   * | 境界を渡る全文字列に UNC も制御文字も残らない | `main/app/dto-boundary.test.ts` |
   *
   * renderer は DTO を受け取るだけで、DTO に無いものを描きようがない。
   * **守られている場所を指すほうが、守っているふりをするより良い。**
   */

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
    await waitFor(() =>
      expect(useUiStore.getState().settings).toEqual({ open: true, section: 'folders' })
    )
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

  it('未検出ディストロの行にディストロ名が表示される (pr-gate Round 5 / ux C-001 / C4-003)', async () => {
    /*
     * **DTO に載せるだけでは足りない。** Round 4 は distroName を `cwdDisplay` に載せたが、
     * renderer が `session.cwdDisplay` を読まず、画面には「未検出のディストロ」ラベルしか出ず、
     * 「名前が出ないと訳語だけの差になる」退行がそのまま残っていた (FR-017 / US-1 AC-8)。
     */
    install(
      index([
        {
          kind: 'unknown',
          reasonKey: 'distro-undetected',
          sessions: [
            session({
              sessionId: 'u',
              summary: null,
              originKind: 'undetected-distro',
              cwd: null,
              cwdDisplay: 'Debian: /home/y'
            })
          ]
        }
      ])
    )

    render(<SessionListScreen />)

    expect(await screen.findByText('Debian: /home/y')).toBeInTheDocument()
  })

  it('所在不明の行に記録されていた作業ディレクトリが表示される (ux C-002)', async () => {
    /* `unknown-location` は所在は決まらないが、記録されていた値を出して行を同定できる。 */
    install(
      index([
        {
          kind: 'unknown',
          reasonKey: 'location-unknown',
          sessions: [
            session({
              sessionId: 'w',
              summary: null,
              originKind: 'unknown-location',
              cwd: null,
              cwdDisplay: '/home/y/proj'
            })
          ]
        }
      ])
    )

    render(<SessionListScreen />)

    expect(await screen.findByText('/home/y/proj')).toBeInTheDocument()
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
    // **成功した所在の行は残る。** これが SC-007 の要点である。
    expect(screen.getAllByText('要約').length).toBe(2)
    /*
     * **ただし件数は確定形にしない** (pr-gate Round 4 / 不変条件 5 / UX3-005)。
     *
     * 以前はここが `getByText(/全 2 件/)` で、**失敗があるのに確定形で断言する状態を
     * 期待値にしていた**。`complete` は「全所在を試した」であって
     * 「全所在を読めた」ではない。読めなかった所在があれば総数は下限でしかない。
     */
    expect(screen.queryByText(/全 2 件/)).not.toBeInTheDocument()
    expect(screen.getByText(/2 件以上（読めていない所在があります）/)).toBeInTheDocument()
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
    await waitFor(() =>
      expect(useUiStore.getState().settings).toEqual({ open: true, section: 'folders' })
    )
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
     *
     * **取得中の状態で見る** (pr-gate Round 4 / 不変条件 6)。
     * 以前は idle のボタンに `not.toBeDisabled()` を当てていた。
     * `disabled={busy}` は busy=false のとき React が属性を出さないので、
     * **実装を `disabled={busy}` に書き換えても必ず通る恒真式**だった。
     * 守りたいのは「取得中でもタブ順に残る」ことであり、idle の状態は対象ではない。
     */
    const value = index([folderGroup([session()])])
    installCapability({
      listSessions: () => Promise.resolve(value),
      /* **解決しない。** これで取得中の状態に留まる。 */
      refreshSessions: () => new Promise(() => {}),
      onSessionsChanged: () => () => {}
    })

    render(<SessionListScreen />)
    const idle = await waitFor(() => screen.getByRole('button', { name: '全件を取り直す' }))
    idle.click()

    const busy = await waitFor(() => screen.getByRole('button', { name: '取得中…' }))

    expect(busy).not.toBeDisabled()
    expect(busy).toHaveAttribute('aria-disabled', 'true')
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

    // O-3 で検索欄の件数の status が加わった (語が無いときは空)。鮮度の行はそれと別の 1 つ。
    const status = screen.getAllByRole('status').find((s) => s.textContent?.includes('取得時刻'))
    expect(status).toBeDefined()
    expect(status).toHaveAttribute('aria-live', 'polite')
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
     *
     * **取得中の状態で見る** (pr-gate Round 2 / A11Y-204)。
     * 以前は非 busy のボタンに対して断言しており、`busyProps(false)` は
     * `className: undefined` を返すので **busy 時の class を一度も見ていなかった**。
     * さらに正規表現が `s` ではなく**リテラルの `s`** だったため
     * (`/(^|s)opacity-50(s|$)/`)、`"… opacity-50"` に一致せず
     * **修正前のコードでも緑になっていた**。守りが 2 重に効いていなかった。
     */
    const value = index([folderGroup([session()])])
    installCapability({
      listSessions: () => Promise.resolve(value),
      /* **解決しない。** これで取得中の状態に留まる。 */
      refreshSessions: () => new Promise(() => {}),
      onSessionsChanged: () => () => {}
    })

    render(<SessionListScreen />)
    const idle = await waitFor(() => screen.getByRole('button', { name: '全件を取り直す' }))
    idle.click()

    const busy = await waitFor(() => screen.getByRole('button', { name: '取得中…' }))

    /* 減光はアイコンだけに掛ける。ラベルには掛けない。 */
    expect(busy.className).toContain('[&_svg]:opacity-50')
    expect(busy.className.split(/\s+/)).not.toContain('opacity-50')
    /* `disabled` でタブ順から外さない — 押した要素にフォーカスが残る。 */
    expect(busy).not.toHaveAttribute('disabled')
    expect(busy).toHaveAttribute('aria-disabled', 'true')
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

    /*
     * **選択を示すのは面積と形である** (左端のインジケータ + 太字)。
     *
     * 以前はここに `not.toContain('data-active:bg-muted')` があり、
     * 「hover と同じ背景を使っていない」ことを**トークン名の文字列**で見ていた。
     * これは検査として成立していない (pr-gate Round 3 / A11Y3-007) —
     * `main.css` で `--muted` と `--accent` は light / dark とも**同じ値**であり、
     * `hover:bg-muted` と `data-active:bg-accent` は**画面上まったく同じ色**である。
     * 別のトークン名を使っていることは、別の見えを意味しない。
     *
     * 区別を実際に担っているのは下の 2 つなので、**それだけを見る**。
     * 背景の同一性は 1.4.1 の観点では問題にならない (色に依らない手がかりがある)。
     */
    expect(className).toContain('data-active:before:bg-foreground')
    expect(className).toContain('data-active:font-medium')
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

  it('初回の listSessions はランタイムの一覧 (listRuntimes) が解決する前に呼ばれない (O-7 FR-016 / SC-008)', async () => {
    let resolveRuntimes: () => void = () => {}
    const listRuntimes = vi.fn(
      () =>
        new Promise<never>((resolve) => {
          resolveRuntimes = () =>
            resolve({ runtimes: [], enumerationIssues: [], wslAvailability: 'available' } as never)
        })
    )
    const listSessions = vi.fn(() => Promise.resolve(index([folderGroup([session()])])))
    installCapability({ listRuntimes, listSessions, onSessionsChanged: () => () => {} })

    render(<SessionListScreen />)
    await waitFor(() => expect(listRuntimes).toHaveBeenCalledTimes(1))
    await new Promise((r) => setTimeout(r, 20))
    expect(listSessions).not.toHaveBeenCalled()

    resolveRuntimes()
    await waitFor(() => expect(listSessions).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.getByText('要約')).toBeInTheDocument())
  })

  it('ランタイムの一覧を待っている間も取得中で、「全件を取り直す」を押しても検出より先に列挙しない (pr-gate R1 ux H-002)', async () => {
    let resolveRuntimes: () => void = () => {}
    const listRuntimes = vi.fn(
      () =>
        new Promise<never>((resolve) => {
          resolveRuntimes = () =>
            resolve({ runtimes: [], enumerationIssues: [], wslAvailability: 'available' } as never)
        })
    )
    const refreshSessions = vi.fn(() => Promise.resolve(index([folderGroup([session()])])))
    let notify: ((value: SessionIndexDTO) => void) | null = null
    installCapability({
      listRuntimes,
      listSessions: () => Promise.resolve(index([folderGroup([session()])])),
      refreshSessions,
      onSessionsChanged: (listener) => {
        notify = listener
        return () => {}
      }
    })

    const { container } = render(<SessionListScreen />)
    await waitFor(() => expect(listRuntimes).toHaveBeenCalledTimes(1))
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull()
    // 状態の行も「未取得」(止まって見える語) ではなく取得中と言う (O-7 pr-gate R2 ux L-102)。
    expect(
      screen.getAllByRole('status').some((status) => status.textContent?.startsWith('取得中…'))
    ).toBe(true)
    const button = screen.getByRole('button', { name: '取得中…' })
    await userEvent.click(button)
    expect(refreshSessions).not.toHaveBeenCalled()
    // 初回の取得の前に配られる未取得の索引 (取得時刻 0) では取得中の表示を外さない (pr-gate R1 platform-boundary L-004)。
    act(() => notify?.(index([], { fetchedAt: 0, complete: false })))
    expect(screen.getByRole('button', { name: '取得中…' })).toBeInTheDocument()

    resolveRuntimes()
    await waitFor(() => expect(screen.getByText('要約')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: '全件を取り直す' })).toBeInTheDocument()
  })

  it('ランタイムの一覧が失敗しても、待ちを外して取得する (O-7 FR-016)', async () => {
    const listSessions = vi.fn(() => Promise.resolve(index([folderGroup([session()])])))
    installCapability({
      listRuntimes: () => Promise.reject(new Error('失敗')),
      listSessions,
      onSessionsChanged: () => () => {}
    })
    render(<SessionListScreen />)
    await waitFor(() => expect(listSessions).toHaveBeenCalledTimes(1))
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

  it('全所在を読めて 0 件のとき「セッションがまだありません」を導線つきで出す (SC-013)', async () => {
    /*
     * **SC-013 の 5 条件のうち、この 1 つだけ肯定テストが 0 件だった**
     * (pr-gate Round 3 / PO-204 / H3-020)。
     *
     * 否定 assert (`「…と言わない」`) は下のテストにあったが、
     * **出るべき条件で出ることを確かめた行が無かった**。
     * 対象は「R-1 でフォルダを登録した直後の新規利用者」— この製品を最初に開く人が
     * 最初に見る画面である。
     */
    installWithFolders(
      index([folderGroup([])], { outcomes: [outcome({ status: 'no-history', count: 0 })] })
    )

    render(<SessionListScreen />)

    await waitFor(() =>
      expect(screen.getByText('セッションがまだありません。')).toBeInTheDocument()
    )
    /* **文言だけで終わらせない** (FR-032 / SC-013 は「導線」を求めている)。 */
    expect(screen.getAllByRole('button', { name: '取り直す' }).length).toBeGreaterThan(0)
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

    // O-3 / FR-017: グループは region ではなく group (名前は見出しの h3)。
    const section = await screen.findByRole('group', { name: /project/ })
    /* **0 件を断言しない。** 「無い」ではなく「見つからなかった」に留める。 */
    expect(section.textContent).not.toContain('このフォルダのセッションはありません。')
    expect(section.textContent).toContain('列挙できていない所在があります')
    /* **US-1 AC-9 の案内を消さない。** 以前は失敗があると早期 return で消えていた。 */
    expect(section.textContent).toContain('このフォルダで Claude Code を使うと、ここに並びます。')
  })

  it('区画に失敗理由を反復させない (FR-012 / 不変条件 5)', async () => {
    /*
     * **理由の正本は「列挙の結果」の 1 箇所である** (pr-gate Round 4 / UX3-003)。
     *
     * 以前は区画ごとに失敗理由を全部並べていた。登録フォルダの行は越境で
     * どの所在からも来るため所在で絞れず、0 行の区画には**全所在**が渡っていた。
     * その結果 (登録フォルダ数 × 失敗所在数) 回まで同じ文が反復した。
     */
    installWithFolders(
      index([folderGroup([])], {
        outcomes: [
          outcome({ status: 'failed', reasonKey: 'permission-denied', count: 0 }),
          UBUNTU_FAILED
        ]
      })
    )

    render(<SessionListScreen />)

    await waitFor(() => expect(screen.getByText('列挙の結果')).toBeInTheDocument())

    /* 理由と解消手順はそれぞれ 1 箇所にだけ出る。 */
    expect(screen.getAllByText('そのユーザのホームは Windows 側から読めません。').length).toBe(1)
    expect(screen.getAllByText('ディストロを起動してから再取得してください。').length).toBe(1)

    /* 区画は参照だけを持つ。 */
    const section = screen.getByRole('group', { name: /project/ })
    expect(section.textContent).not.toContain('そのユーザのホームは Windows 側から読めません。')
    expect(section.textContent).toContain('「列挙の結果」を確認してください')
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

/**
 * 失敗の理由に見合う操作だけを出す (pr-gate Round 4 / 不変条件 2)。
 *
 * ## 何が壊れていたか
 *
 * 同じ画面に判定基準が 2 つあった。`Outcomes` は `distro-not-running` を見て
 * 再検出ボタンを出し分けるのに、索引レベルのバナーは**理由に関わらず**
 * 「ランタイムを再検出して取り直す」を出していた (pr-gate Round 3 / UX3-007 / A11Y3-009)。
 *
 * その結果、「そのユーザのホームは Windows 側から読めません」の隣に
 * **それでは直らない操作が唯一の操作として**置かれていた。
 * 誤った復旧導線は、導線が無いより悪い。
 *
 * ## 何を固定するか
 *
 * 「理由キー → 操作」の対応は `labels.ts` の `FAILURE_REASON_REMEDY` が持つ。
 * ここでは**全理由キーについて、画面に出る操作が対応表と一致する**ことを見る。
 * 理由キーが増えたら `Record` の網羅性検査で型が落ちるので、表の側は型が守る。
 */
describe('SessionListScreen — 失敗の理由と操作の対応', () => {
  function failedIndex(reasons: readonly FailureReason[]): SessionIndexDTO {
    return index([folderGroup([])], {
      outcomes: reasons.map((reasonKey, i) =>
        outcome({
          targetKey: `t#${i}`,
          location: { kind: 'wsl', distroName: `D${i}` },
          status: 'failed',
          reasonKey,
          count: 0
        })
      )
    })
  }

  it.each([
    ['distro-not-running', 'ランタイムを再検出して取り直す'],
    ['stopped-midway', '取り直す'],
    ['enumeration-failed', '取り直す']
  ] as const)('%s には「%s」を出す', async (reasonKey, label) => {
    installWithFolders(failedIndex([reasonKey]))

    render(<SessionListScreen />)

    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: label }).length).toBeGreaterThan(0)
    )
  })

  it.each(['wsl-unavailable', 'permission-denied', 'path-too-long'] as const)(
    '%s には再取得系の操作を出さない (押しても直らない)',
    async (reasonKey) => {
      installWithFolders(failedIndex([reasonKey]))

      render(<SessionListScreen />)

      /* 理由の文言は出る。**操作だけを出さない。** */
      await waitFor(() =>
        expect(screen.getAllByText(FAILURE_REASON_LABELS[reasonKey]).length).toBeGreaterThan(0)
      )
      expect(
        screen.queryByRole('button', { name: 'ランタイムを再検出して取り直す' })
      ).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: '取り直す' })).not.toBeInTheDocument()
    }
  )

  it('停止中が 1 件でもあれば再検出を出す (強い順に選ぶ)', async () => {
    /*
     * **`retry` と `rediscover` を両方含む組で試す。** 片方しか無い組だと
     * 優先順位を入れ替えても結果が変わらず、順序を固定できない (変異で確認した)。
     */
    installWithFolders(failedIndex(['stopped-midway', 'distro-not-running']))

    render(<SessionListScreen />)

    await waitFor(() =>
      expect(
        screen.getAllByRole('button', { name: 'ランタイムを再検出して取り直す' }).length
      ).toBeGreaterThan(0)
    )
  })

  it('環境側の理由だけなら、どの操作も出さない', async () => {
    installWithFolders(failedIndex(['permission-denied', 'wsl-unavailable']))

    render(<SessionListScreen />)

    await waitFor(() => expect(screen.getByText('列挙の結果')).toBeInTheDocument())
    expect(
      screen.queryByRole('button', { name: 'ランタイムを再検出して取り直す' })
    ).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '取り直す' })).not.toBeInTheDocument()
  })
})

/**
 * 「試した」と「読めた」を分ける (pr-gate Round 4 / 不変条件 5 / FR-037 / FR-012)。
 *
 * 根は `session-service.ts` の `complete = done && scope.kind === 'all'` で、
 * これは**全所在を試したことしか意味しない**。失敗があっても真になる。
 * そこから派生した「断言してよいか」の判定が画面に 5 通り散っていた。
 *
 * ここでは**組み合わせを生成して**、断言が漏れないことを 1 本で守る。
 * 文言を 1 つずつ数えるやり方は、Round 1〜3 で 3 度すり抜けた。
 */
describe('SessionListScreen — 断言してよいかの一貫性', () => {
  function indexWith(options: {
    complete?: boolean
    failed?: boolean
    truncated?: boolean
  }): SessionIndexDTO {
    const outcomes: EnumerationOutcomeDTO[] = [outcome({ count: 2, truncated: options.truncated })]
    if (options.failed === true) {
      outcomes.push(
        outcome({
          targetKey: 'wsl:Ubuntu#0',
          location: { kind: 'wsl', distroName: 'Ubuntu' },
          status: 'failed',
          reasonKey: 'permission-denied',
          count: 0
        })
      )
    }
    return index([folderGroup([session({ sessionId: 'a' }), session({ sessionId: 'b' })])], {
      complete: options.complete ?? true,
      outcomes
    })
  }

  it.each([
    ['取得中', { complete: false }],
    ['読めなかった所在がある', { failed: true }],
    ['打ち切った所在がある', { truncated: true }],
    ['両方', { failed: true, truncated: true }],
    ['取得中かつ失敗', { complete: false, failed: true }]
  ])('%s とき、画面のどこにも確定形の件数が出ない', async (_label, options) => {
    installWithFolders(indexWith(options))

    render(<SessionListScreen />)
    await waitFor(() => expect(screen.getAllByText('要約').length).toBe(2))

    /* **総数を確定形で出さない。** */
    expect(screen.queryByText(/全 \d+ 件/)).not.toBeInTheDocument()

    /*
     * **件数を出す場所はすべて下限表記になる。** 黙って隠すのではない (FR-037)。
     * ヘッダ・区画の 2 箇所が対象で、所在の行は `status === 'ok'` のときだけ出る。
     */
    const counts = screen.getAllByText(/\d+ 件/)
    expect(counts.length).toBeGreaterThanOrEqual(2)
    for (const node of counts) expect(node.textContent).toContain('件以上')
  })

  it('全所在を読めたときだけ確定形を出す', async () => {
    installWithFolders(indexWith({}))

    render(<SessionListScreen />)
    await waitFor(() => expect(screen.getByText(/全 2 件/)).toBeInTheDocument())

    expect(document.body.textContent ?? '').not.toContain('件以上')
  })

  /*
   * **空状態は同時に 1 枚だけ** (UX3-006)。
   *
   * 以前は索引レベルの通知と「区画が 1 つも無いとき」の通知が別々の条件で描かれ、
   * 排他でなかった。初回起動 (登録 0 件 + ディストロ停止中) で 2 枚積まれ、
   * **最優先の「作業フォルダを登録する」が下に来ていた**。
   */
  it.each([
    ['初回起動 (登録 0 件 + 全所在失敗)', [] as SessionGroupDTO[], true],
    ['登録あり + 全所在失敗', [folderGroup([])], true],
    ['登録あり + 成功 0 件', [folderGroup([])], false]
  ])('空状態は同時に 1 枚しか出ない (%s)', async (_label, groups, failed) => {
    installWithFolders(
      index(groups, {
        outcomes: [
          failed
            ? outcome({ status: 'failed', reasonKey: 'distro-not-running', count: 0 })
            : outcome({ status: 'no-history', count: 0 })
        ]
      })
    )

    render(<SessionListScreen />)
    // 全部を読めた場合 (成功 0 件) は「列挙の結果」が 1 行の要約になる (O-3 / FR-017)。どちらも先頭は同じ語。
    await waitFor(() => expect(screen.getByText(/^列挙の結果/)).toBeInTheDocument())

    expect(document.querySelectorAll('[data-slot="empty-state"]')).toHaveLength(1)
  })

  it('登録 0 件のときは登録の導線を最優先で出す (US-2)', async () => {
    installCapability({
      listSessions: () =>
        Promise.resolve(
          index([], {
            outcomes: [outcome({ status: 'failed', reasonKey: 'distro-not-running', count: 0 })]
          })
        ),
      listFolders: () =>
        Promise.resolve({
          folders: [],
          restoreIssues: { skipped: 0, reasonKeys: [], backupPath: null }
        }),
      onFoldersChanged: () => () => {},
      onSessionsChanged: () => () => {}
    })

    render(<SessionListScreen />)

    await waitFor(() =>
      expect(screen.getByRole('button', { name: '作業フォルダを登録する' })).toBeInTheDocument()
    )
    /* 失敗のバナーに押し下げられない。 */
    expect(screen.queryByText('どの所在も列挙できていません。')).not.toBeInTheDocument()
  })
})

/* ── O-3 US-1: Thread search と過去の区画の並び (FE-012 / SC-001 / SC-008) ─────────── */

const FOLDER_A = '案件A'
const FOLDER_B = '案件B'

function searchFolders(): FolderListDTO {
  const [base] = folderList().folders
  if (base === undefined) throw new Error('fixture')
  return {
    folders: [
      { ...base, id: 'folder-1', displayName: FOLDER_A },
      { ...base, id: 'folder-2', displayName: FOLDER_B }
    ],
    restoreIssues: { skipped: 0, reasonKeys: [], backupPath: null }
  }
}

function installSearch(value: SessionIndexDTO): void {
  installCapability({
    listSessions: () => Promise.resolve(value),
    refreshSessions: () => Promise.resolve(value),
    fetchMoreSessions: () => Promise.resolve(value),
    onSessionsChanged: () => () => {},
    listFolders: () => Promise.resolve(searchFolders()),
    onFoldersChanged: () => () => {}
  })
}

/** 登録フォルダ 2 つ (2 行と 1 行) と、既定で畳む未登録 1 つ (1 行)。 */
function searchIndex(overrides: Partial<SessionIndexDTO> = {}): SessionIndexDTO {
  return index(
    [
      folderGroup([
        session({ sessionId: 'a1', summary: 'ログイン画面の修正', gitBranch: 'feature/login' }),
        session({ sessionId: 'a2', summary: 'テストの並列化' })
      ]),
      {
        kind: 'folder',
        folderId: 'folder-2',
        boundary: 'native',
        sessions: [session({ sessionId: 'b1', summary: 'ビルド手順の整理', tag: 'docs' })]
      },
      {
        kind: 'unregistered',
        cwdKey: 'scratch',
        cwd: { namespace: 'host', value: 'C:\\scratch' },
        cwdDisplay: null,
        suggestedDisplayName: 'scratch',
        location: { kind: 'windows' },
        sessions: [session({ sessionId: 'c1', summary: '一度きりのログイン調査' })]
      }
    ],
    overrides
  )
}

const searchbox = (): HTMLElement =>
  screen.getByRole('searchbox', { name: PAST_SESSIONS_LABELS.searchLabel })

/** 描かれている過去の行の題 (表示の順)。 */
function rowTitles(): string[] {
  const titles = document.querySelectorAll('[data-slot="aui_thread-list-item-title"]')
  return Array.from(titles, (title) => title.textContent ?? '')
}

function firstRowTrigger(): HTMLElement {
  const trigger = document.querySelector<HTMLElement>('[data-slot="aui_thread-list-item-trigger"]')
  if (trigger === null) throw new Error('行が描かれていない')
  return trigger
}

describe('SessionListScreen — Thread search (O-3 / US-1 / FE-012)', () => {
  it('語に一致した行だけが残り、一致の無いグループは見出しごと出ず、件数が出る。畳まれた未登録も検索中は出て、語を消すと畳みに戻る (AC1)', async () => {
    installSearch(searchIndex())
    render(<SessionListScreen />)
    await waitFor(() => expect(rowTitles()).toContain('ログイン画面の修正'))
    // 未登録は既定で畳む (中身を描かない)。
    expect(rowTitles()).not.toContain('一度きりのログイン調査')

    await userEvent.type(searchbox(), 'ログイン')

    await waitFor(() =>
      expect(rowTitles()).toEqual(['ログイン画面の修正', '一度きりのログイン調査'])
    )
    expect(screen.queryByRole('group', { name: new RegExp(FOLDER_B) })).not.toBeInTheDocument()
    expect(screen.getByRole('group', { name: new RegExp(FOLDER_A) })).toBeInTheDocument()
    expect(screen.getByText(PAST_SESSIONS_LABELS.searchCount(2))).toHaveAttribute('role', 'status')
    // 検索中は一致した区画を開いて描くので、開閉のボタンは出さない。
    expect(screen.queryByRole('button', { name: '開く' })).not.toBeInTheDocument()

    await userEvent.clear(searchbox())

    await waitFor(() => expect(rowTitles()).not.toContain('一度きりのログイン調査'))
    expect(rowTitles()).toEqual(['ログイン画面の修正', 'テストの並列化', 'ビルド手順の整理'])
    expect(screen.getByRole('button', { name: '開く' })).toHaveAttribute('aria-expanded', 'false')
  })

  it.each([
    ['全角の英大文字', 'ＬＯＧＩＮ', ['ログイン画面の修正']],
    ['半角カナと半角の濁点', 'ﾛｸﾞｲﾝ', ['ログイン画面の修正', '一度きりのログイン調査']]
  ] as const)('%s の語でも一致する (AC2 / FR-002)', async (_label, term, expected) => {
    installSearch(searchIndex())
    render(<SessionListScreen />)
    await waitFor(() => expect(rowTitles()).toContain('ログイン画面の修正'))

    await userEvent.type(searchbox(), term)

    await waitFor(() => expect(rowTitles()).toEqual(expected))
  })

  it('一致が 0 件なら search-empty の文言と、語・所在・フォルダをすべて解除する操作が出る。押すと既定に戻る (AC3 / FR-008)', async () => {
    installSearch(searchIndex())
    render(<SessionListScreen />)
    await waitFor(() => expect(rowTitles()).toContain('ビルド手順の整理'))

    await userEvent.click(screen.getByRole('button', { name: FOLDER_A }))
    await waitFor(() => expect(rowTitles()).not.toContain('ビルド手順の整理'))
    await userEvent.type(searchbox(), 'zzzz')

    expect(await screen.findByText(PAST_SESSIONS_LABELS.searchEmpty)).toBeInTheDocument()
    // フォルダの絞り込みも掛かっているが、検索の 0 件を先に出す (空の状態は 1 枚だけ)。
    expect(screen.queryByText('絞り込みに一致するセッションがありません。')).not.toBeInTheDocument()
    expect(document.querySelectorAll('[data-slot="empty-state"]')).toHaveLength(1)

    await userEvent.click(
      screen.getByRole('button', { name: PAST_SESSIONS_LABELS.searchEmptyReset })
    )

    await waitFor(() =>
      expect(rowTitles()).toEqual(['ログイン画面の修正', 'テストの並列化', 'ビルド手順の整理'])
    )
    expect(searchbox()).toHaveValue('')
    // 押したボタンは消えるので、フォーカスは検索欄へ移す。
    expect(searchbox()).toHaveFocus()
    expect(screen.getByRole('button', { name: /すべてのフォルダ/ })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    expect(screen.getByRole('button', { name: /すべての所在/ })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
  })

  it('取得中 (先頭ページ) でも search-empty を出す (data-model §1「Thread search の空の状態」)', async () => {
    installSearch(searchIndex({ complete: false }))
    render(<SessionListScreen />)
    await waitFor(() => expect(rowTitles()).toContain('ログイン画面の修正'))

    await userEvent.type(searchbox(), 'zzzz')

    expect(await screen.findByText(PAST_SESSIONS_LABELS.searchEmpty)).toBeInTheDocument()
  })

  it('Esc で語を消して元の一覧に戻り、手で開いた未登録の区画は開いたまま (AC4)', async () => {
    installSearch(searchIndex())
    render(<SessionListScreen />)
    await userEvent.click(await screen.findByRole('button', { name: '開く' }))
    await waitFor(() => expect(rowTitles()).toContain('一度きりのログイン調査'))

    await userEvent.type(searchbox(), 'テスト')
    await waitFor(() => expect(rowTitles()).toEqual(['テストの並列化']))
    await userEvent.keyboard('{Escape}')

    await waitFor(() => expect(searchbox()).toHaveValue(''))
    expect(rowTitles()).toContain('一度きりのログイン調査')
    expect(screen.getByRole('button', { name: '畳む' })).toHaveAttribute('aria-expanded', 'true')
  })

  it('変換中の Enter / Esc では語を消さず、preventDefault もしない (AC6 / Principle VIII)', async () => {
    installSearch(searchIndex())
    render(<SessionListScreen />)
    await waitFor(() => expect(rowTitles()).toContain('ログイン画面の修正'))
    await userEvent.type(searchbox(), 'ログイン')

    for (const init of [
      { key: 'Escape', isComposing: true },
      { key: 'Escape', keyCode: 229 },
      { key: 'Enter', isComposing: true },
      { key: 'Enter', keyCode: 229 }
    ]) {
      // fireEvent は preventDefault されたら false を返す。
      expect(fireEvent.keyDown(searchbox(), init)).toBe(true)
    }
    expect(searchbox()).toHaveValue('ログイン')
    expect(rowTitles()).toEqual(['ログイン画面の修正', '一度きりのログイン調査'])
    // 変換していない Enter も何もしない (確定の操作は要らない)。
    expect(fireEvent.keyDown(searchbox(), { key: 'Enter' })).toBe(true)
    expect(searchbox()).toHaveValue('ログイン')
  })

  it('所在の絞り込みと AND で組み合わさる (FR-001)', async () => {
    installSearch(
      index(
        [
          folderGroup([
            session({ sessionId: 'a1', summary: 'ログイン画面の修正' }),
            session({ sessionId: 'a3', targetKey: 'wsl:Ubuntu#0', summary: 'ログインの再試行' }),
            session({ sessionId: 'a4', targetKey: 'wsl:Ubuntu#0', summary: 'テストの並列化' })
          ])
        ],
        {
          outcomes: [
            outcome({ count: 1 }),
            outcome({
              location: { kind: 'wsl', distroName: 'Ubuntu' },
              targetKey: 'wsl:Ubuntu#0',
              count: 2
            })
          ]
        }
      )
    )
    render(<SessionListScreen />)
    await waitFor(() => expect(rowTitles()).toContain('ログイン画面の修正'))

    await userEvent.type(searchbox(), 'ログイン')
    await waitFor(() => expect(rowTitles()).toEqual(['ログイン画面の修正', 'ログインの再試行']))
    await userEvent.click(screen.getByRole('button', { name: 'Ubuntu' }))

    await waitFor(() => expect(rowTitles()).toEqual(['ログインの再試行']))
    expect(screen.getByText(PAST_SESSIONS_LABELS.searchCount(1))).toBeInTheDocument()
  })
})

describe('SessionListScreen — 過去の区画の並び (O-3 / FR-017 / SC-008)', () => {
  it('グループはランドマークにせず role="group" で、名前は見出しの h3 (AC7)', async () => {
    installSearch(searchIndex())
    render(<SessionListScreen />)

    const group = await screen.findByRole('group', { name: new RegExp(FOLDER_A) })

    expect(screen.queryAllByRole('region')).toHaveLength(0)
    const headingId = group.getAttribute('aria-labelledby') ?? ''
    expect(document.getElementById(headingId)?.tagName).toBe('H3')
  })

  it('過去の行の切り詰めた題は、キーボードのフォーカスでもツールチップで全文が出る (AC7)', async () => {
    const longTitle = '日本語のとても長い題'.repeat(8)
    installSearch(index([folderGroup([session({ summary: longTitle })])]))
    render(<SessionListScreen />)
    await waitFor(() => expect(rowTitles()).toEqual([longTitle]))

    act(() => firstRowTrigger().focus())

    expect(await screen.findByRole('tooltip')).toHaveTextContent(longTitle)
  })

  it('題に HTML が含まれてもツールチップで要素にならない (FR-017)', async () => {
    const xss = '<img src=x onerror="window.__pwned=1">'
    installSearch(index([folderGroup([session({ summary: xss })])]))
    render(<SessionListScreen />)
    await waitFor(() => expect(rowTitles()).toEqual([xss]))

    act(() => firstRowTrigger().focus())

    expect(await screen.findByRole('tooltip')).toHaveTextContent(xss)
    expect(document.querySelectorAll('img')).toHaveLength(0)
    expect((window as { __pwned?: unknown }).__pwned).toBeUndefined()
  })

  it('列挙の結果は、全部を読めたときは 1 行の要約にする (FR-017)', async () => {
    installSearch(searchIndex())
    render(<SessionListScreen />)

    expect(await screen.findByText(PAST_SESSIONS_LABELS.outcomesAllOk(1))).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '列挙の結果' })).not.toBeInTheDocument()
  })

  it('列挙の結果は、読めなかった所在があれば今の所在ごとの行のまま (FR-017)', async () => {
    installSearch(searchIndex({ outcomes: [outcome(), UBUNTU_FAILED] }))
    render(<SessionListScreen />)

    expect(await screen.findByRole('heading', { name: '列挙の結果' })).toBeInTheDocument()
    expect(screen.getByText('停止中のため未列挙')).toBeInTheDocument()
    expect(screen.queryByText(/すべて読めました/)).not.toBeInTheDocument()
  })

  it('区画の鍵が空白や `"` `]` `:` を含んでも、グループの名前と開閉の参照が引け、DOM の id に鍵が出ない (data-model §2 / §6)', async () => {
    const path = 'C:\\my "work" ]: dir'
    const cwdKey = JSON.stringify(['host', path])
    installSearch(
      index([
        {
          kind: 'unregistered',
          cwdKey,
          cwd: { namespace: 'host', value: path },
          cwdDisplay: null,
          suggestedDisplayName: 'dir',
          location: { kind: 'windows' },
          sessions: [session({ sessionId: 'x1', summary: '特殊な鍵の行' })]
        }
      ])
    )
    render(<SessionListScreen />)

    // 名前 (h3 の全文) が途中で切れずに引ける。
    const group = await screen.findByRole('group', { name: (name) => name.includes(path) })
    const labelledBy = group.getAttribute('aria-labelledby') ?? ''
    expect(document.getElementById(labelledBy)).not.toBeNull()
    const toggle = within(group).getByRole('button', { name: '開く' })
    const panel = document.getElementById(toggle.getAttribute('aria-controls') ?? '')
    expect(panel).not.toBeNull()

    await userEvent.click(toggle)

    await waitFor(() => expect(panel?.textContent).toContain('特殊な鍵の行'))
    for (const element of document.querySelectorAll('[id]')) {
      expect(element.id).not.toContain(cwdKey)
      expect(element.id).not.toContain(path)
      expect(element.id).not.toContain('unregistered:')
    }
  })

  it('vitest-axe: 検索中・search-empty でも違反 0 (SC-008)', async () => {
    installSearch(searchIndex())
    const { container } = render(
      <section aria-labelledby="past-heading">
        <h2 id="past-heading">過去のセッション</h2>
        <SessionListScreen />
      </section>
    )
    await waitFor(() => expect(rowTitles()).toContain('ログイン画面の修正'))
    const rules = { rules: { 'color-contrast': { enabled: false } } }

    await userEvent.type(searchbox(), 'ログイン')
    await waitFor(() => expect(rowTitles()).toHaveLength(2))
    expect((await axe(container, rules)).violations).toEqual([])

    await userEvent.type(searchbox(), 'zzzz')
    await screen.findByText(PAST_SESSIONS_LABELS.searchEmpty)
    expect((await axe(container, rules)).violations).toEqual([])
  })
})
