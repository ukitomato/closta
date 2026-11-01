import { describe, expect, it } from 'vitest'

import type { Preset } from '@domain/session/preset'

import { DEFAULT_EXTRA_AXES } from '@domain/session/launch-config'

import { fromPresetRecord, toPresetRecord } from './preset-record'

/** X-4 BE-011 / SC-003 / SC-004 — preset の write/read 対称と秘密非混入。 */

const preset: Preset = {
  id: 'preset-1',
  name: '業務用',
  config: {
    folderId: 'f1',
    runtimeId: 'wsl:Ubuntu',
    providerId: 'p1',
    modelId: 'claude-sonnet-4-5',
    effort: 'high',
    permissionMode: 'dontAsk',
    additionalDirectoryIds: ['f2', 'f3'],
    maxTurns: 30,
    maxBudgetUsd: 2.5
  },
  updatedAt: 1000
}

describe('preset-record 版 3 (026)', () => {
  it('版 2 と同じ述語で読み、auto を通す。昇格モードは版を問わず落とす', () => {
    const auto: Preset = { ...preset, config: { ...preset.config, permissionMode: 'auto' } }
    const raw = JSON.parse(JSON.stringify(fromPresetRecord(auto))) as unknown
    expect(toPresetRecord(raw, 3)).toEqual({ ok: true, preset: auto })
    expect(toPresetRecord(raw, 2)).toEqual({ ok: true, preset: auto })
    const esc = JSON.parse(JSON.stringify(fromPresetRecord(auto))) as {
      config: Record<string, unknown>
    }
    esc.config.permissionMode = 'bypassPermissions'
    expect(toPresetRecord(esc, 3).ok).toBe(false)
  })
})

describe('preset-record', () => {
  it('ラウンドトリップで全軸が保たれる (SC-004)', () => {
    const r = toPresetRecord(JSON.parse(JSON.stringify(fromPresetRecord(preset))), 2)
    expect(r).toEqual({ ok: true, preset })
  })

  it('保存形は allow-list のキーだけで、秘密を持たない (SC-003)', () => {
    const saved = fromPresetRecord(preset)
    expect(Object.keys(saved).sort()).toEqual(['config', 'id', 'name', 'updatedAt'])
    expect(Object.keys(saved.config as object).sort()).toEqual(
      [
        'additionalDirectoryIds',
        'effort',
        'folderId',
        'maxBudgetUsd',
        'maxTurns',
        'modelId',
        'permissionMode',
        'providerId',
        'runtimeId'
      ].sort()
    )
    const json = JSON.stringify(saved)
    for (const secretish of ['secretRefKey', 'apiKey', 'helperPath', 'sk-', 'extraEnv']) {
      expect(json).not.toContain(secretish)
    }
  })

  it.each([
    ['昇格モード', { ...preset.config, permissionMode: 'bypass' + 'Permissions' }],
    ['acceptEdits', { ...preset.config, permissionMode: 'acceptEdits' }],
    ['未知キー (settings)', { ...preset.config, settings: { permissions: {} } }],
    ['モデル ID のメタ文字', { ...preset.config, modelId: 'x$(id)' }],
    ['sessionName を持つ版 2 の config', { ...preset.config, sessionName: null }],
    [
      '追加ディレクトリが 11 件',
      { ...preset.config, additionalDirectoryIds: Array.from({ length: 11 }, (_, i) => 'd' + i) }
    ],
    ['ターン数が範囲外', { ...preset.config, maxTurns: 0 }],
    ['費用が範囲外', { ...preset.config, maxBudgetUsd: 1000.01 }],
    ['新しい軸のキーが欠けた版 2', { ...preset.config, maxTurns: undefined }]
  ])('IPC と同じ述語で拒否する: %s (write/read 対称)', (_l, config) => {
    expect(toPresetRecord({ ...fromPresetRecord(preset), config }, 2)).toEqual({
      ok: false,
      reason: 'invalid-record'
    })
  })

  it('未知キー・名前の制御文字・updatedAt 不正を拒否する', () => {
    const base = fromPresetRecord(preset)
    expect(toPresetRecord({ ...base, secretRefKey: 'x' }, 2).ok).toBe(false)
    expect(toPresetRecord({ ...base, name: 'a\u0001b' }, 2).ok).toBe(false)
    expect(toPresetRecord({ ...base, updatedAt: -1 }, 2).ok).toBe(false)
    expect(toPresetRecord({ ...base, id: '' }, 2).ok).toBe(false)
  })

  it('読み取った名前は正規化される', () => {
    const r = toPresetRecord({ ...fromPresetRecord(preset), name: '  業務用  ' }, 2)
    expect(r.ok && r.preset.name).toBe('業務用')
  })

  describe('版 1 の読み替え (AD-064 Decision 4)', () => {
    const v1Config = {
      folderId: 'f1',
      runtimeId: 'wsl:Ubuntu',
      providerId: 'p1',
      modelId: 'claude-sonnet-4-5',
      effort: 'high',
      permissionMode: 'dontAsk'
    }
    const v1Record = { id: 'preset-1', name: '業務用', config: v1Config, updatedAt: 1000 }

    it('前 6 軸のレコードを新しい 3 軸の既定で補って読む', () => {
      const r = toPresetRecord(v1Record, 1)
      expect(r).toEqual({
        ok: true,
        preset: { ...preset, config: { ...v1Config, ...DEFAULT_EXTRA_AXES } }
      })
    })

    it('版 1 のレコードが新しい軸のキーを持てば拒否する (版 1 は 6 キーだけ)', () => {
      expect(toPresetRecord({ ...v1Record, config: { ...v1Config, maxTurns: null } }, 1).ok).toBe(
        false
      )
    })

    it('版 1 の昇格モード・不正 id を拒否する', () => {
      expect(
        toPresetRecord({ ...v1Record, config: { ...v1Config, permissionMode: 'acceptEdits' } }, 1)
          .ok
      ).toBe(false)
    })

    it('版 1 の形のレコードを版 2 として読むと拒否する', () => {
      expect(toPresetRecord(v1Record, 2).ok).toBe(false)
    })

    it('未知の版は拒否する', () => {
      expect(toPresetRecord(fromPresetRecord(preset), 4).ok).toBe(false)
    })
  })
})
