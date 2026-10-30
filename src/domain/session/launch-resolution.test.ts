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
