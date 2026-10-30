import { describe, expect, it, vi } from 'vitest'

/*
 * **`electron` をモックする。**
 *
 * 送信元の検証は許可 origin の集合を参照する必要があり、その集合は
 * `app.isPackaged` に依存する (開発ビルドでは dev サーバの origin を含む)。
 * 集合を引数で注入する形にすると**定義が 2 つになり**、
 * SH-014 の検証項目 11「送信元 origin 定数が 1 つであること」を破る。
 * したがってここは Electron 側を差し替える。
 */
vi.mock('electron', () => ({ app: { isPackaged: true } }))

import { fixedCapabilities } from '@domain/runtime/capabilities'
import type { RuntimeDescriptor } from '@domain/runtime/descriptor'
import { wslNamespace } from '@domain/runtime/namespace'

import {
  MAX_DISPLAY_NAME_LENGTH,
  MAX_PATH_VALUE_LENGTH,
  checkBeginBrowseLocation,
  checkFolderDraft,
  checkLaunchConfig,
  checkPastResumeQuery,
  checkPreset,
  checkResumeRequest,
  checkRenameArgs,
  checkListModelsArgs,
  checkSetModelArgs,
  checkSetPermissionModeArgs,
  checkProviderDraft as checkProviderDraftWith,
  checkProviderPatch as checkProviderPatchWith,
  findRuntime,
  isKnownFolderId,
  isTrustedSender,
  isValidBrowseTarget,
  isValidDisplayName,
  isValidLocationDTO,
  isValidPathDTO,
  isKnownTargetKey,
  isValidSessionOffset,
  isPermissionOutcome,
  isPermissionScope,
  MAX_SESSION_OFFSET
} from './validate'
import { isDeniedEnvKey, isForbiddenForwardKey } from '../infra/runtime/launch-spec'

/** composition root と同じ述語を注入する (validate は infra/runtime を直接 import しない。M-302)。 */
const extraEnvPredicates = { isForbiddenForwardKey, isDeniedEnvKey }
const checkProviderDraft = (draft: unknown): ReturnType<typeof checkProviderDraftWith> =>
  checkProviderDraftWith(draft, extraEnvPredicates)
const checkProviderPatch = (patch: unknown): boolean =>
  checkProviderPatchWith(patch, extraEnvPredicates)

/**
 * IPC ハンドラの検証テスト (BE-048 / SC-018)。
 *
 * SC-018 は「**検証表の各行**について不正入力が拒否されること」を要求する。
 * 3 つだけ列挙する形にしない — 列挙すると同じ構造の残りが拘束を外れる。
 *
 * **preload をスタブせず検証関数を直接呼ぶ。** 検証は main 側の責務であり、
 * renderer を経由しない攻撃経路 (IPC 直叩き) がここで塞がれていることを見る。
 */

const NOW = 1_700_000_000_000
const UBUNTU = wslNamespace('Ubuntu-26.04')

const runtimes: readonly RuntimeDescriptor[] = [
  {
    id: 'host',
    kind: 'win32',
    state: 'running',
    isDefault: false,
    capabilities: fixedCapabilities(NOW),
    detectedAt: NOW,
    claudePath: null,
    claudeStatus: 'not-found',
    claudeOverridden: false
  },
  {
    id: UBUNTU,
    kind: 'wsl',
    distroName: 'Ubuntu-26.04',
    wslVersion: 2,
    state: 'running',
    isDefault: true,
    capabilities: fixedCapabilities(NOW),
    pathMapping: null,
    detectedAt: NOW
  }
]

/* ── 送信元 (全メソッド共通) ────────────────────────────────────────── */

/** `WebFrameMain` の必要な面だけを持つ代役。Electron を起動せずに検証を呼ぶ。 */
function frame(origin: string, parent: unknown = null): never {
  return { origin, parent } as never
}

describe('送信元の検証', () => {
  it('frame が無ければ拒否する', () => {
    expect(isTrustedSender(null)).toBe(false)
  })

  it('別 origin からの呼び出しを拒否する', () => {
    expect(isTrustedSender(frame('https://evil.example'))).toBe(false)
  })

  it('配信元 origin の main frame を受け入れる', () => {
    // `isPackaged: true` のモックなので許可集合はパッケージ済み origin 1 つだけ。
    expect(isTrustedSender(frame('closta://app'))).toBe(true)
  })

  it('**開発ビルドの origin は出荷物では許可されない**', () => {
    expect(isTrustedSender(frame('http://localhost:5173'))).toBe(false)
  })

  it('親を持つ frame (iframe) を拒否する', () => {
    // **単一 capability は main frame だけに公開する。**
    expect(isTrustedSender(frame('closta://app', {}))).toBe(false)
  })
})

/* ── パス値 ─────────────────────────────────────────────────────────── */

describe('PathDTO の検証', () => {
  it('ホスト名前空間の値を受け入れる', () => {
    expect(isValidPathDTO({ namespace: 'host', value: 'C:\\dev\\x' })).toBe(true)
  })

  it('ランタイム名前空間の値を受け入れる', () => {
    expect(isValidPathDTO({ namespace: 'wsl:Ubuntu-26.04', value: '/home/u/x' })).toBe(true)
  })

  it('**バックスラッシュを含む POSIX 値を拒否する**', () => {
    // POSIX では `\` は通常の文字であり `..` の解決規則が発火しない。
    // 含んだまま UNC へ変換すると字面と別の位置に解決される。
    expect(isValidPathDTO({ namespace: 'wsl:Ubuntu-26.04', value: '/home/u/a\\b' })).toBe(false)
  })

  it('相対の POSIX 値を拒否する', () => {
    expect(isValidPathDTO({ namespace: 'wsl:Ubuntu-26.04', value: 'home/u' })).toBe(false)
  })

  it('**`unc:` を境界で拒否する**', () => {
    // `unc:<D>` は `infra/fs` の内側に閉じる。
    expect(
      isValidPathDTO({ namespace: 'unc:Ubuntu-26.04', value: '\\\\wsl.localhost\\Ubuntu-26.04' })
    ).toBe(false)
  })

  it('制御文字と NUL を拒否する', () => {
    expect(isValidPathDTO({ namespace: 'host', value: 'C:\\dev\\a\u0000b' })).toBe(false)
    expect(isValidPathDTO({ namespace: 'host', value: 'C:\\dev\\a\u0007b' })).toBe(false)
  })

  it('長さ上限を超える値を拒否する', () => {
    const long = `C:\\${'a'.repeat(MAX_PATH_VALUE_LENGTH)}`
    expect(isValidPathDTO({ namespace: 'host', value: long })).toBe(false)
  })

  it('空文字と非オブジェクトを拒否する', () => {
    expect(isValidPathDTO({ namespace: 'host', value: '' })).toBe(false)
    expect(isValidPathDTO(null)).toBe(false)
    expect(isValidPathDTO('C:\\dev')).toBe(false)
  })

  it('文字種制約を満たさないディストロ名の名前空間を拒否する', () => {
    expect(isValidPathDTO({ namespace: 'wsl:bad:name', value: '/home' })).toBe(false)
    expect(isValidPathDTO({ namespace: 'wsl:-evil', value: '/home' })).toBe(false)
  })
})

/* ── 所在 ───────────────────────────────────────────────────────────── */

describe('LocationDTO の検証', () => {
  it('既知の形式を受け入れる', () => {
    expect(isValidLocationDTO({ kind: 'windows' })).toBe(true)
    expect(isValidLocationDTO({ kind: 'wsl', distroName: 'Ubuntu-26.04' })).toBe(true)
  })

  it('文字種制約を満たさない distroName を拒否する', () => {
    for (const name of ['bad:name', 'back\\slash', 'fwd/slash', '-evil', 'nul\u0000']) {
      expect(isValidLocationDTO({ kind: 'wsl', distroName: name })).toBe(false)
    }
  })

  it('未知の kind を拒否する', () => {
    expect(isValidLocationDTO({ kind: 'docker', id: 'x' })).toBe(false)
    expect(isValidLocationDTO(null)).toBe(false)
  })
})

/* ── runtimeId ──────────────────────────────────────────────────────── */

describe('runtimeId の検証', () => {
  it('既知の識別子に完全一致するものだけを返す', () => {
    expect(findRuntime(runtimes, 'host')?.id).toBe('host')
    expect(findRuntime(runtimes, UBUNTU)?.id).toBe(UBUNTU)
  })

  it('未検出の識別子を拒否する', () => {
    expect(findRuntime(runtimes, 'wsl:NoSuchDistro')).toBeNull()
    // **前方一致で通らない** (`Ubuntu` が `Ubuntu-26.04` に当たらない)。
    expect(findRuntime(runtimes, 'wsl:Ubuntu')).toBeNull()
    expect(findRuntime(runtimes, 42)).toBeNull()
  })
})

/* ── beginBrowse の所在 ─────────────────────────────────────────────── */

describe('beginBrowse の所在の検証', () => {
  it('**所在 `windows` を常に拒否する** (host の入口はピッカーのみ)', () => {
    expect(checkBeginBrowseLocation(runtimes, { kind: 'windows' })).toEqual({
      ok: false,
      reason: 'unsupported-location'
    })
  })

  it('検出済みディストロを受け入れる', () => {
    expect(checkBeginBrowseLocation(runtimes, { kind: 'wsl', distroName: 'Ubuntu-26.04' })).toEqual(
      { ok: true, namespace: UBUNTU }
    )
  })

  it('**未検出 descriptor の所在を拒否する**', () => {
    expect(checkBeginBrowseLocation(runtimes, { kind: 'wsl', distroName: 'NoSuchDistro' })).toEqual(
      { ok: false, reason: 'unknown-location' }
    )
  })

  it('形式不正の所在を拒否する', () => {
    expect(checkBeginBrowseLocation(runtimes, { kind: 'wsl' })).toEqual({
      ok: false,
      reason: 'unknown-location'
    })
  })
})

/* ── browseDirectory の移動先 ───────────────────────────────────────── */

describe('browseDirectory の移動先の検証', () => {
  const session = UBUNTU

  it('root を受け入れる', () => {
    expect(isValidBrowseTarget({ kind: 'root' }, session)).toBe(true)
  })

  it('セッションと同じ名前空間の current / parent を受け入れる', () => {
    const of = { namespace: session, value: '/home/u' }
    expect(isValidBrowseTarget({ kind: 'current', of }, session)).toBe(true)
    expect(isValidBrowseTarget({ kind: 'parent', of }, session)).toBe(true)
  })

  it('**`unc:<D>` を `wsl:<D>` として渡す経路を拒否する** (種別まで完全一致)', () => {
    const of = { namespace: 'unc:Ubuntu-26.04', value: '\\\\wsl.localhost\\Ubuntu-26.04\\home' }
    expect(isValidBrowseTarget({ kind: 'current', of }, session)).toBe(false)
  })

  it('**別ディストロの名前空間を拒否する**', () => {
    const of = { namespace: 'wsl:Debian', value: '/home/u' }
    expect(isValidBrowseTarget({ kind: 'current', of }, session)).toBe(false)
  })

  it('child の name はセパレータと `.` / `..` を拒否する', () => {
    const of = { namespace: session, value: '/home/u' }
    expect(isValidBrowseTarget({ kind: 'child', of, name: 'repo' }, session)).toBe(true)
    // 先頭ドットは許す (`.git` が読めないと困る)。
    expect(isValidBrowseTarget({ kind: 'child', of, name: '.git' }, session)).toBe(true)

    for (const name of ['.', '..', 'a/b', 'a\\b', 'a\u0000b', '']) {
      expect(isValidBrowseTarget({ kind: 'child', of, name }, session)).toBe(false)
    }
  })

  it('未知の kind を拒否する', () => {
    expect(isValidBrowseTarget({ kind: 'absolute', value: '/etc' }, session)).toBe(false)
    expect(isValidBrowseTarget(null, session)).toBe(false)
  })
})

/* ── displayName / folderId ─────────────────────────────────────────── */

describe('displayName の検証', () => {
  it('通常の名前を受け入れる', () => {
    expect(isValidDisplayName('私のリポジトリ')).toBe(true)
  })

  it('空文字・制御文字・長さ超過を拒否する', () => {
    expect(isValidDisplayName('')).toBe(false)
    expect(isValidDisplayName('bad\u0007name')).toBe(false)
    expect(isValidDisplayName('x'.repeat(MAX_DISPLAY_NAME_LENGTH + 1))).toBe(false)
    expect(isValidDisplayName(42)).toBe(false)
  })
})

describe('folderId の検証', () => {
  it('既知の登録エントリに一致するものだけを受け入れる', () => {
    const ids = ['wf_0123456789ab']
    expect(isKnownFolderId(ids, 'wf_0123456789ab')).toBe(true)
    expect(isKnownFolderId(ids, 'wf_ffffffffffff')).toBe(false)
    expect(isKnownFolderId(ids, 42)).toBe(false)
  })
})

/* ── registerFolder の draft ────────────────────────────────────────── */

describe('registerFolder の draft の検証', () => {
  it('所在 windows の draft を受け入れる', () => {
    expect(
      checkFolderDraft(runtimes, {
        location: { kind: 'windows' },
        path: { namespace: 'host', value: 'C:\\dev\\x' },
        displayName: 'x'
      })
    ).toEqual({ ok: true })
  })

  it('所在 wsl の draft を受け入れる', () => {
    expect(
      checkFolderDraft(runtimes, {
        location: { kind: 'wsl', distroName: 'Ubuntu-26.04' },
        path: { namespace: UBUNTU, value: '/home/u/x' },
        displayName: 'x'
      })
    ).toEqual({ ok: true })
  })

  it('**所在の種別は一致するがディストロ名が異なる draft を拒否する**', () => {
    expect(
      checkFolderDraft(runtimes, {
        location: { kind: 'wsl', distroName: 'Ubuntu-26.04' },
        path: { namespace: 'wsl:Debian', value: '/home/u/x' },
        displayName: 'x'
      })
    ).toEqual({ ok: false, reason: 'namespace-mismatch' })
  })

  it('**未検出 descriptor の所在を拒否する**', () => {
    expect(
      checkFolderDraft(runtimes, {
        location: { kind: 'wsl', distroName: 'NoSuchDistro' },
        path: { namespace: 'wsl:NoSuchDistro', value: '/home/u/x' },
        displayName: 'x'
      })
    ).toEqual({ ok: false, reason: 'unknown-location' })
  })

  it('バックスラッシュを含む POSIX 値の draft を拒否する', () => {
    expect(
      checkFolderDraft(runtimes, {
        location: { kind: 'wsl', distroName: 'Ubuntu-26.04' },
        path: { namespace: UBUNTU, value: '/home/u/a\\b' },
        displayName: 'x'
      })
    ).toEqual({ ok: false, reason: 'invalid-path' })
  })

  it('`unc:` の draft を拒否する', () => {
    expect(
      checkFolderDraft(runtimes, {
        location: { kind: 'wsl', distroName: 'Ubuntu-26.04' },
        path: { namespace: 'unc:Ubuntu-26.04', value: '\\\\wsl.localhost\\Ubuntu-26.04\\home' },
        displayName: 'x'
      })
    ).toEqual({ ok: false, reason: 'invalid-path' })
  })

  it('非オブジェクトを拒否する', () => {
    expect(checkFolderDraft(runtimes, null).ok).toBe(false)
    expect(checkFolderDraft(runtimes, 'C:\\dev').ok).toBe(false)
  })
})

/* ── セッション一覧 (BE-029 / contracts/ipc-session-list.md 節 A) ── */

describe('isKnownTargetKey — 節 A 「targetKey」の行', () => {
  const keys = ['host#0', 'wsl:Ubuntu#0', 'wsl:Ubuntu#1']

  it('既知のキーに完全一致すれば通す', () => {
    expect(isKnownTargetKey(keys, 'wsl:Ubuntu#1')).toBe(true)
  })

  it('未知のキーを拒否する', () => {
    expect(isKnownTargetKey(keys, 'wsl:Debian#0')).toBe(false)
  })

  it('部分一致を通さない', () => {
    expect(isKnownTargetKey(keys, 'wsl:Ubuntu')).toBe(false)
    expect(isKnownTargetKey(keys, 'host')).toBe(false)
  })

  it('config ディレクトリのパスとして解釈しない', () => {
    // **キーはパスではない。** パスらしい値を渡しても通らない。
    expect(isKnownTargetKey(keys, 'C:\\Users\\y\\.claude')).toBe(false)
    expect(isKnownTargetKey(keys, '/home/y/.claude')).toBe(false)
    expect(isKnownTargetKey(keys, '\\\\wsl.localhost\\Ubuntu\\home\\y\\.claude')).toBe(false)
  })

  it('文字列でない値を拒否する', () => {
    for (const value of [null, undefined, 0, {}, [], true]) {
      expect(isKnownTargetKey(keys, value)).toBe(false)
    }
  })

  it('既知の集合が空なら何も通さない', () => {
    expect(isKnownTargetKey([], 'host#0')).toBe(false)
  })
})

describe('checkResumeRequest / checkPastResumeQuery (X-9 / data-model §2.1)', () => {
  const keys = ['host#0', 'wsl:Ubuntu#0']
  const ID = '11111111-2222-4333-8444-555555555555'
  const config = {
    folderId: 'f1',
    runtimeId: 'host',
    providerId: null,
    modelId: null,
    effort: null,
    permissionMode: 'default',
    additionalDirectoryIds: [],
    maxTurns: null,
    maxBudgetUsd: null,
    sessionName: null
  }
  const live = { kind: 'live', sessionId: ID }
  const past = { kind: 'past', targetKey: 'host#0', conversationId: ID }

  it('live / past の正例を通す', () => {
    expect(checkResumeRequest({ source: live, config }, keys)).toBe(true)
    expect(checkResumeRequest({ source: past, config }, keys)).toBe(true)
  })

  it('不正な形をすべて拒否する', () => {
    const bad: unknown[] = [
      null,
      [],
      'x',
      { config },
      { source: null, config },
      { source: {}, config },
      { source: { kind: 'other' }, config },
      { source: { ...live, sessionId: 'not-a-uuid' }, config },
      { source: { ...live, extra: 1 }, config },
      { source: { ...past, targetKey: 'unknown#9' }, config },
      { source: { ...past, conversationId: '' }, config },
      { source: { ...past, conversationId: '--resume' }, config },
      { source: { ...past, conversationId: `${ID} x` }, config },
      { source: { ...past, conversationId: `x${ID}` }, config },
      { source: { ...past, conversationId: `${ID}x` }, config },
      { source: { ...past, extra: 1 }, config },
      { source: live, config, extra: 1 },
      { source: live, config: { ...config, permissionMode: 'bypassPermissions' } },
      { source: live, config: { ...config, extra: 1 } },
      // 再開は名前を渡さない (024 FR-012)
      { source: live, config: { ...config, sessionName: 'x' } },
      { source: live, config: { ...config, maxTurns: 0 } }
    ]
    for (const value of bad) expect(checkResumeRequest(value, keys)).toBe(false)
  })

  it('checkPastResumeQuery は外れで source-unknown', () => {
    expect(checkPastResumeQuery('host#0', ID, keys)).toEqual({ ok: true })
    for (const [targetKey, id] of [
      ['unknown#9', ID],
      ['host#0', 'nope'],
      [1, ID],
      ['host#0', null]
    ] as const) {
      expect(checkPastResumeQuery(targetKey, id, keys)).toEqual({
        ok: false,
        reason: 'source-unknown'
      })
    }
  })
})

describe('checkLaunchConfig / checkPreset (024 data-model §3。SC-001 の main の部分)', () => {
  const full = {
    folderId: 'f1',
    runtimeId: 'wsl:Ubuntu',
    providerId: null,
    modelId: null,
    effort: null,
    permissionMode: 'default',
    additionalDirectoryIds: ['f2', 'f3'],
    maxTurns: 30,
    maxBudgetUsd: 2.5,
    sessionName: 'ログインの API 修正'
  }
  const { sessionName: _name, ...nine } = full
  void _name

  it('10 キーの正例 (上限・名前は null でも通る)', () => {
    expect(checkLaunchConfig(full)).toBe(true)
    expect(
      checkLaunchConfig({ ...full, maxTurns: null, maxBudgetUsd: null, sessionName: null })
    ).toBe(true)
  })

  it.each([
    ['キーの欠け (sessionName)', { ...nine }],
    ['キーの欠け (maxTurns)', { ...full, maxTurns: undefined }],
    ['未知のキー', { ...full, extra: 1 }],
    [
      '追加ディレクトリが 11 件',
      { ...full, additionalDirectoryIds: Array.from({ length: 11 }, (_, i) => 'd' + i) }
    ],
    ['追加ディレクトリが作業フォルダと同じ', { ...full, additionalDirectoryIds: ['f1'] }],
    ['追加ディレクトリが重複', { ...full, additionalDirectoryIds: ['f2', 'f2'] }],
    ['ターン数が範囲外', { ...full, maxTurns: 1001 }],
    ['費用が範囲外', { ...full, maxBudgetUsd: 0.005 }],
    ['名前の前後に空白', { ...full, sessionName: ' a ' }],
    ['名前が 101 文字', { ...full, sessionName: 'a'.repeat(101) }]
  ])('%s は invalid-config', (_l, value) => {
    expect(checkLaunchConfig(value)).toBe(false)
  })

  it('checkPreset は 9 キーで通り、sessionName を持つ config を拒否する', () => {
    expect(checkPreset('業務用', nine)).toBe(true)
    expect(checkPreset('業務用', full)).toBe(false)
    expect(checkPreset('業務用', { ...nine, sessionName: null })).toBe(false)
    expect(checkPreset('', nine)).toBe(false)
    expect(checkPreset('業務用', { ...nine, maxTurns: 0 })).toBe(false)
  })
})

describe('isValidSessionOffset — 節 A 「offset」の行', () => {
  it('0 と上限を通す', () => {
    expect(isValidSessionOffset(0)).toBe(true)
    expect(isValidSessionOffset(MAX_SESSION_OFFSET)).toBe(true)
  })

  it('上限を超える値を拒否する (SDK に渡す前に検査する)', () => {
    expect(isValidSessionOffset(MAX_SESSION_OFFSET + 1)).toBe(false)
    expect(isValidSessionOffset(Number.MAX_SAFE_INTEGER)).toBe(false)
  })

  it('負数・小数・非有限を拒否する', () => {
    for (const value of [-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(isValidSessionOffset(value)).toBe(false)
    }
  })

  it('数値でない値を拒否する', () => {
    for (const value of ['0', null, undefined, {}, []]) {
      expect(isValidSessionOffset(value)).toBe(false)
    }
  })
})

describe('isPermissionOutcome / isPermissionScope (X-1 承認決定の enum 検証。SC-004 / SC-007 / H-04)', () => {
  it('outcome は allow / deny のみ受理', () => {
    expect(isPermissionOutcome('allow')).toBe(true)
    expect(isPermissionOutcome('deny')).toBe(true)
    // 格上げ・別綴り・非文字列は拒否 (`as` に退行させない)。
    for (const bad of ['grant', 'allow-all', 'maybe', '', 1, null, undefined, {}]) {
      expect(isPermissionOutcome(bad)).toBe(false)
    }
  })

  it('scope は once / capability のみ受理', () => {
    expect(isPermissionScope('once')).toBe(true)
    expect(isPermissionScope('capability')).toBe(true)
    for (const bad of ['forever', 'always', '', 0, null, undefined]) {
      expect(isPermissionScope(bad)).toBe(false)
    }
  })
})

describe('checkSetPermissionModeArgs (023 / contracts C-1)', () => {
  const ID = '11111111-1111-4111-8111-111111111111'
  it('UUID と安全 3 値だけを通す', () => {
    for (const mode of ['default', 'plan', 'dontAsk']) {
      expect(checkSetPermissionModeArgs([ID, mode])).toBe(true)
    }
  })
  it('知らない値・昇格・数・null・配列・非 UUID・引数の過不足を通さない', () => {
    const bad: (readonly unknown[])[] = [
      [ID, 'bypassPermissions'],
      [ID, 'auto'],
      [ID, 1],
      [ID, null],
      [ID, ['plan']],
      ['not-uuid', 'plan'],
      [ID],
      [ID, 'plan', 'extra']
    ]
    for (const args of bad) expect(checkSetPermissionModeArgs(args)).toBe(false)
  })
})

describe('checkSetModelArgs (023 / contracts C-2)', () => {
  const ID = '11111111-1111-4111-8111-111111111111'
  it('UUID と文字種の通るモデルの id を通す', () => {
    for (const model of [
      'claude-opus-4-1',
      'sonnet[1m]',
      'arn:aws:bedrock:us:1:inference-profile/x'
    ]) {
      expect(checkSetModelArgs([ID, model])).toBe(true)
    }
  })
  it('文字種の外・数・null・空・非 UUID・引数の過不足を通さない', () => {
    const bad: (readonly unknown[])[] = [
      [ID, 'a b'],
      [ID, '-x'],
      [ID, ''],
      [ID, 1],
      [ID, null],
      [ID],
      ['not-uuid', 'sonnet'],
      [ID, 'sonnet', 'extra']
    ]
    for (const args of bad) expect(checkSetModelArgs(args)).toBe(false)
  })
})

describe('checkListModelsArgs (025 / contracts C-7)', () => {
  const ID = '11111111-1111-4111-8111-111111111111'
  it('UUID ちょうど 1 つを通す', () => {
    expect(checkListModelsArgs([ID])).toBe(true)
  })
  it('引数 0・2・非 UUID・数・null を通さない', () => {
    const bad: (readonly unknown[])[] = [[], [ID, ID], ['not-uuid'], [1], [null]]
    for (const args of bad) expect(checkListModelsArgs(args)).toBe(false)
  })
})

describe('checkRenameArgs (023 / contracts C-3)', () => {
  const ID = '11111111-1111-4111-8111-111111111111'
  it('名前の規則を通る値を trim して返す', () => {
    expect(checkRenameArgs([ID, '  調査  '])).toEqual([ID, '調査'])
    expect(checkRenameArgs([ID, 'a'])).toEqual([ID, 'a'])
    expect(checkRenameArgs([ID, 'a'.repeat(100)])).toEqual([ID, 'a'.repeat(100)])
  })
  it('空・空白だけ・101 文字・改行・制御文字・行と段落の区切り・数・非 UUID・引数の過不足は null', () => {
    const bad: (readonly unknown[])[] = [
      [ID, ''],
      [ID, '  '],
      [ID, 'a'.repeat(101)],
      [ID, 'a\nb'],
      [ID, 'a\rb'],
      [ID, 'a\u0000b'],
      [ID, 'a\u007fb'],
      [ID, 'a b'],
      [ID, 'a b'],
      [ID, 1],
      [ID, null],
      [ID],
      ['not-uuid', 'a'],
      [ID, 'a', 'extra']
    ]
    for (const args of bad) expect(checkRenameArgs(args)).toBeNull()
  })
})

describe('checkProviderDraft / checkProviderPatch — 永続層と同じ形を要求する (SEC-M-001)', () => {
  const validDraft = {
    displayName: 'Prod',
    backend: 'anthropic',
    credential: { source: 'config-dir' },
    models: { models: [{ id: 'claude-opus-4-8', displayName: 'Opus' }] }
  }

  it('正常な draft を受理する', () => {
    expect(checkProviderDraft(validDraft)).toEqual({ ok: true })
  })

  it('制御文字入りの extraEnv KEY を拒否する (値だけ見ると reload で無言消失する)', () => {
    // 値は正常だが KEY に制御文字。provider-record が load 時に invalid-record で skip する形。
    const draft = { ...validDraft, extraEnv: { 'BAD\u0007KEY': 'ok' } }
    expect(checkProviderDraft(draft)).toEqual({ ok: false, reason: 'invalid-record' })
  })

  it('長すぎる extraEnv KEY (>128) を拒否する', () => {
    const draft = { ...validDraft, extraEnv: { ['K'.repeat(129)]: 'ok' } }
    expect(checkProviderDraft(draft)).toEqual({ ok: false, reason: 'invalid-record' })
  })

  it('形の壊れた model entry (id 欠落) を拒否する', () => {
    const draft = { ...validDraft, models: { models: [{ displayName: 'x' }] } }
    expect(checkProviderDraft(draft)).toEqual({ ok: false, reason: 'invalid-record' })
  })

  it('patch も同じ extraEnv KEY / model entry 検証を適用する', () => {
    expect(checkProviderPatch({ extraEnv: { 'BAD\u0007KEY': 'ok' } })).toBe(false)
    expect(checkProviderPatch({ models: { models: [{ id: '' }] } })).toBe(false)
    expect(checkProviderPatch({ displayName: 'New' })).toBe(true)
  })

  it('env-passthrough の varNames に制御文字/長大があれば拒否する (SEC-M-101)', () => {
    const ctrl = {
      ...validDraft,
      credential: { source: 'env-passthrough', varNames: ['OK', 'BAD\u0007'] }
    }
    expect(checkProviderDraft(ctrl)).toEqual({ ok: false, reason: 'invalid-record' })
    const long = {
      ...validDraft,
      credential: { source: 'env-passthrough', varNames: ['V'.repeat(129)] }
    }
    expect(checkProviderDraft(long)).toEqual({ ok: false, reason: 'invalid-record' })
    const ok = {
      ...validDraft,
      credential: { source: 'env-passthrough', varNames: ['ANTHROPIC_API_KEY'] }
    }
    expect(checkProviderDraft(ok)).toEqual({ ok: true })
  })

  it('api-key の平文秘密が長すぎる (UTF-8 バイト >2048) と拒否する (SEC-M-201。seal 膨張で reload 消失を防ぐ)', () => {
    // ASCII: 2049 文字 = 2049 バイト > 2048 → 拒否。
    const ascii = { ...validDraft, credential: { source: 'api-key', secret: 's'.repeat(2049) } }
    expect(checkProviderDraft(ascii)).toEqual({ ok: false, reason: 'invalid-record' })
    // multibyte: .length=1024 (≤2048) だが CJK 3 バイト × 1024 = 3072 バイト > 2048 → 拒否。
    // UTF-16 .length で測ると通過してしまい reload で secretRefKey 上限超過→無言消失する経路を塞ぐ。
    const cjk = { ...validDraft, credential: { source: 'api-key', secret: 'あ'.repeat(1024) } }
    expect(checkProviderDraft(cjk)).toEqual({ ok: false, reason: 'invalid-record' })
    // 正常 (ASCII 実 API キー相当) は受理。
    const ok = { ...validDraft, credential: { source: 'api-key', secret: 'sk-ant-api03-xxxx' } }
    expect(checkProviderDraft(ok)).toEqual({ ok: true })
  })

  it('configDir の namespace 種別が host / unc:<distro> 以外なら拒否する (PB-P-L03)', () => {
    const badNs = {
      ...validDraft,
      configDir: { namespace: 'wsl:Ubuntu', value: '/home/y/.claude' }
    }
    expect(checkProviderDraft(badNs)).toEqual({ ok: false, reason: 'invalid-path' })
    const host = { ...validDraft, configDir: { namespace: 'host', value: 'C:\\Users\\y\\.claude' } }
    expect(checkProviderDraft(host)).toEqual({ ok: true })
  })

  it('models の root に未知キーがあれば拒否する (write/read 対称。pr-gate R1 database M-302)', () => {
    const draft = { ...validDraft, models: { ...validDraft.models, note: 'x' } }
    expect(checkProviderDraft(draft)).toEqual({ ok: false, reason: 'invalid-record' })
    expect(checkProviderPatch({ models: { models: [], note: 'x' } })).toBe(false)
  })

  it('api-key / oauth-token の平文秘密に制御文字があれば拒否する (FR-014 / pr-gate R1 security L-002)', () => {
    for (const source of ['api-key', 'oauth-token']) {
      const bad = { ...validDraft, credential: { source, secret: 'sk-ant\u0000x' } }
      expect(checkProviderDraft(bad)).toEqual({ ok: false, reason: 'invalid-record' })
    }
  })

  it('extraEnv の述語は注入されたものを使う (infra/runtime を直接 import しない。M-302)', () => {
    const draft = { ...validDraft, extraEnv: { GIT_SSH_COMMAND: 'x' } }
    expect(checkProviderDraft(draft)).toEqual({ ok: false, reason: 'invalid-record' })
    const permissive = { isForbiddenForwardKey: () => false, isDeniedEnvKey: () => false }
    expect(checkProviderDraftWith(draft, permissive)).toEqual({ ok: true })
    expect(checkProviderPatchWith({ extraEnv: { MY_FLAG: 'x' } }, permissive)).toBe(true)
    const denyAll = { isForbiddenForwardKey: () => true, isDeniedEnvKey: () => false }
    expect(checkProviderPatchWith({ extraEnv: { MY_FLAG: 'x' } }, denyAll)).toBe(false)
  })
})
