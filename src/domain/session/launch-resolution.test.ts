import { describe, expect, it } from 'vitest'

import { DEFAULT_EXTRA_AXES } from './launch-config'
import {
  resolveLaunchAxes,
  toLaunchConfig,
  toLaunchDraft,
  type LaunchDraft,
  type LaunchFacts
} from './launch-resolution'

/** X-4 BE-020 — 依存解決の境界値 (FR-006 / FR-007 / SC-002)。 */

const facts: LaunchFacts = {
  folders: [
    { id: 'win', distroName: null },
    { id: 'ubu', distroName: 'Ubuntu' }
  ],
  runtimes: [
    { id: 'wsl:Ubuntu', distroName: 'Ubuntu', running: true },
    { id: 'wsl:Debian', distroName: 'Debian', running: true },
    { id: 'wsl:Stopped', distroName: 'Stopped', running: false }
  ],
  providers: [
    {
      id: 'p-ok',
      reachable: true,
      models: [
        { id: 'm-effort', displayName: 'M', supportedEffortLevels: ['low', 'high'] },
        { id: 'm-plain', displayName: 'P' }
      ]
    },
    { id: 'p-far', reachable: false, models: [{ id: 'm-far', displayName: 'F' }] }
  ]
}

const draft = (over: Partial<LaunchDraft> = {}): LaunchDraft => ({
  folderId: 'ubu',
  runtimeId: 'wsl:Ubuntu',
  providerId: 'p-ok',
  modelId: 'm-effort',
  effort: 'high',
  permissionMode: 'default',
  ...DEFAULT_EXTRA_AXES,
  ...over
})

describe('resolveLaunchAxes', () => {
  it('全軸が有効なら reset も blocker も無く、起動設定になる', () => {
    const r = resolveLaunchAxes(draft(), facts)
    expect(r.resets).toEqual([])
    expect(r.blockers).toEqual([])
    expect(r.directoryResets).toEqual([])
    expect(toLaunchConfig(r, null)).toEqual({ ...draft(), sessionName: null })
  })

  it('ランタイム変更で到達不可になった Provider は既定へ戻り、確認を要する (US-2 AC3)', () => {
    const r = resolveLaunchAxes(
      draft({ providerId: 'p-far', modelId: 'm-far', effort: null }),
      facts
    )
    expect(r.draft.providerId).toBeNull()
    expect(r.resets).toContainEqual({
      axis: 'provider',
      reason: 'provider-unreachable',
      requiresConfirmation: true
    })
    // Provider が既定に落ちるとカタログも無くなる → モデルも既定へ (通知のみ)。
    expect(r.draft.modelId).toBeNull()
    expect(r.resets).toContainEqual({
      axis: 'model',
      reason: 'model-not-in-catalog',
      requiresConfirmation: false
    })
  })

  it('削除済み Provider は provider-removed で既定へ (確認要)', () => {
    const r = resolveLaunchAxes(draft({ providerId: 'gone', modelId: null, effort: null }), facts)
    expect(r.resets).toEqual([
      { axis: 'provider', reason: 'provider-removed', requiresConfirmation: true }
    ])
  })

  it('Provider 変更でカタログ外になったモデルは既定へ戻る (通知のみ)', () => {
    const r = resolveLaunchAxes(draft({ modelId: 'not-in-catalog', effort: null }), facts)
    expect(r.draft.modelId).toBeNull()
    expect(r.resets).toEqual([
      { axis: 'model', reason: 'model-not-in-catalog', requiresConfirmation: false }
    ])
  })

  it('モデル変更で非対応になった effort は既定へ戻る', () => {
    const r = resolveLaunchAxes(draft({ effort: 'max' }), facts)
    expect(r.draft.effort).toBeNull()
    expect(r.resets).toEqual([
      { axis: 'effort', reason: 'effort-unsupported', requiresConfirmation: false }
    ])
  })

  it('対応 effort を持たないモデル / 既定モデルでは effort は既定のみ', () => {
    expect(
      resolveLaunchAxes(draft({ modelId: 'm-plain', effort: 'low' }), facts).draft.effort
    ).toBeNull()
    expect(
      resolveLaunchAxes(draft({ modelId: null, effort: 'low' }), facts).draft.effort
    ).toBeNull()
  })

  it('既定 Provider でもモデルを指定したら既定へ戻る (既定 Provider はカタログを持たない)', () => {
    const r = resolveLaunchAxes(
      draft({ providerId: null, modelId: 'm-effort', effort: null }),
      facts
    )
    expect(r.draft.modelId).toBeNull()
  })

  it('folder↔runtime の distro 不一致は blocker (起動時の distro-mismatch に初めて出会わない)', () => {
    const r = resolveLaunchAxes(draft({ runtimeId: 'wsl:Debian' }), facts)
    expect(r.blockers).toContain('distro-mismatch')
    expect(toLaunchConfig(r, null)).toBeNull()
  })

  it('停止中ランタイムは blocker (既定に戻さない)', () => {
    const r = resolveLaunchAxes(draft({ folderId: 'win', runtimeId: 'wsl:Stopped' }), facts)
    expect(r.blockers).toEqual(['runtime-stopped'])
    expect(r.draft.runtimeId).toBe('wsl:Stopped')
  })

  it('削除済み / 未選択の folder・runtime は blocker で、値は未選択に戻す', () => {
    const r = resolveLaunchAxes(draft({ folderId: 'gone', runtimeId: null }), facts)
    expect(r.blockers).toEqual(['folder-missing', 'runtime-unselected'])
    expect(r.draft.folderId).toBeNull()
    expect(toLaunchConfig(r, null)).toBeNull()
  })

  it('Windows フォルダ + WSL ランタイムは blocker にしない (越境の判定は DTO の boundary。AD-016 / FR-008)', () => {
    const r = resolveLaunchAxes(draft({ folderId: 'win' }), facts)
    expect(r.blockers).toEqual([])
    // 越境の判定を持たない (規則を再定義しない。pr-gate C-001)。
    expect(r).not.toHaveProperty('crossBoundary')
  })

  it('権限モードは独立軸で、そのまま保つ', () => {
    expect(
      resolveLaunchAxes(draft({ permissionMode: 'dontAsk' }), facts).draft.permissionMode
    ).toBe('dontAsk')
  })
})

describe('追加ディレクトリの段 (024 data-model §2.3 / SC-002)', () => {
  const dirFacts: LaunchFacts = {
    ...facts,
    folders: [
      ...facts.folders,
      { id: 'ubu2', distroName: 'Ubuntu' },
      { id: 'deb', distroName: 'Debian' },
      { id: 'win2', distroName: null }
    ]
  }
  const run = (
    ids: string[],
    over: Partial<LaunchDraft> = {},
    f: LaunchFacts = dirFacts
  ): ReturnType<typeof resolveLaunchAxes> =>
    resolveLaunchAxes(draft({ additionalDirectoryIds: ids, ...over }), f)

  it('同じディストロの項目は残り、Windows のフォルダは 3 に当たらない', () => {
    const r = run(['ubu2', 'win2'])
    expect(r.draft.additionalDirectoryIds).toEqual(['ubu2', 'win2'])
    expect(r.directoryResets).toEqual([])
  })

  it('別のディストロのフォルダは unreachable', () => {
    const r = run(['deb', 'ubu2'])
    expect(r.draft.additionalDirectoryIds).toEqual(['ubu2'])
    expect(r.directoryResets).toEqual([{ folderId: 'deb', reason: 'unreachable' }])
  })

  it('Win32 ランタイムでは WSL のフォルダが unreachable', () => {
    const f: LaunchFacts = {
      ...dirFacts,
      runtimes: [...dirFacts.runtimes, { id: 'win32', distroName: null, running: true }]
    }
    const r = run(['ubu2', 'win2'], { folderId: 'win', runtimeId: 'win32' }, f)
    expect(r.draft.additionalDirectoryIds).toEqual(['win2'])
    expect(r.directoryResets).toEqual([{ folderId: 'ubu2', reason: 'unreachable' }])
  })

  it('登録解除は unregistered、作業フォルダと同じは same-as-folder', () => {
    const r = run(['gone', 'ubu', 'ubu2'])
    expect(r.draft.additionalDirectoryIds).toEqual(['ubu2'])
    expect(r.directoryResets).toEqual([
      { folderId: 'gone', reason: 'unregistered' },
      { folderId: 'ubu', reason: 'same-as-folder' }
    ])
  })

  it('unreachableFolderIds で unreachable', () => {
    const r = run(['ubu2'], {}, { ...dirFacts, unreachableFolderIds: ['ubu2'] })
    expect(r.draft.additionalDirectoryIds).toEqual([])
    expect(r.directoryResets).toEqual([{ folderId: 'ubu2', reason: 'unreachable' }])
  })

  it('複数の理由に当たる項目は最初の理由 (登録解除が先)', () => {
    const r = run(['gone'], {}, { ...dirFacts, unreachableFolderIds: ['gone'] })
    expect(r.directoryResets).toEqual([{ folderId: 'gone', reason: 'unregistered' }])
    // same-as-folder が unreachable より先
    const r2 = run(['ubu'], {}, { ...dirFacts, unreachableFolderIds: ['ubu'] })
    expect(r2.directoryResets).toEqual([{ folderId: 'ubu', reason: 'same-as-folder' }])
  })

  it('ランタイム未選択は 3 を評価せず、unregistered だけ見る', () => {
    const r = run(['gone', 'deb'], { runtimeId: null })
    expect(r.draft.additionalDirectoryIds).toEqual(['deb'])
    expect(r.directoryResets).toEqual([{ folderId: 'gone', reason: 'unregistered' }])
  })

  it('作業フォルダ未選択は same-as-folder を見ない', () => {
    const r = run(['ubu'], { folderId: null })
    expect(r.draft.additionalDirectoryIds).toEqual(['ubu'])
    expect(r.directoryResets).toEqual([])
  })

  it('重複の後ろは黙って捨てる。順序は保つ', () => {
    const r = run(['win2', 'ubu2', 'win2'])
    expect(r.draft.additionalDirectoryIds).toEqual(['win2', 'ubu2'])
    expect(r.directoryResets).toEqual([])
  })

  it('下書きは変えず、ランタイムを戻すと項目が戻る。ready は変わらない', () => {
    const d = draft({ additionalDirectoryIds: ['deb', 'ubu2'] })
    const bad = resolveLaunchAxes({ ...d, runtimeId: 'wsl:Debian', folderId: 'deb' }, dirFacts)
    expect(bad.draft.additionalDirectoryIds).toEqual([])
    expect(bad.directoryResets).toEqual([
      { folderId: 'deb', reason: 'same-as-folder' },
      { folderId: 'ubu2', reason: 'unreachable' }
    ])
    expect(d.additionalDirectoryIds).toEqual(['deb', 'ubu2'])
    const back = resolveLaunchAxes(d, dirFacts)
    expect(back.draft.additionalDirectoryIds).toEqual(['ubu2'])
    expect(back.blockers).toEqual([])
    expect(toLaunchConfig(back, null)).not.toBeNull()
  })
})

describe('toLaunchConfig / toLaunchDraft (024 data-model §2.4)', () => {
  it('上限と名前を写し、ready でなければ null', () => {
    const r = resolveLaunchAxes(draft({ maxTurns: 30, maxBudgetUsd: 2.5 }), facts)
    expect(toLaunchConfig(r, 'ログインの API 修正')).toEqual({
      ...draft(),
      maxTurns: 30,
      maxBudgetUsd: 2.5,
      sessionName: 'ログインの API 修正'
    })
    const blocked = resolveLaunchAxes(draft({ runtimeId: 'wsl:Debian' }), facts)
    expect(toLaunchConfig(blocked, 'x')).toBeNull()
  })

  it('依存解決は上限を見ず、下書きの値をそのまま保つ', () => {
    const r = resolveLaunchAxes(draft({ maxTurns: 7, maxBudgetUsd: 0.07 }), facts)
    expect(r.draft.maxTurns).toBe(7)
    expect(r.draft.maxBudgetUsd).toBe(0.07)
  })

  it('toLaunchDraft は sessionName を持たない下書きを返す', () => {
    const config = { ...draft(), sessionName: 'n' } as Parameters<typeof toLaunchDraft>[0]
    const out = toLaunchDraft(config)
    expect('sessionName' in out).toBe(false)
    expect(out).toEqual(draft())
  })
})
