import { describe, expect, it } from 'vitest'

import type { Preset } from '@domain/session/preset'

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
    permissionMode: 'dontAsk'
  },
  updatedAt: 1000
}

describe('preset-record', () => {
  it('ラウンドトリップで全軸が保たれる (SC-004)', () => {
    const r = toPresetRecord(JSON.parse(JSON.stringify(fromPresetRecord(preset))))
    expect(r).toEqual({ ok: true, preset })
  })

  it('保存形は allow-list のキーだけで、秘密を持たない (SC-003)', () => {
    const saved = fromPresetRecord(preset)
    expect(Object.keys(saved).sort()).toEqual(['config', 'id', 'name', 'updatedAt'])
    expect(Object.keys(saved.config as object).sort()).toEqual(
      ['effort', 'folderId', 'modelId', 'permissionMode', 'providerId', 'runtimeId'].sort()
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
    ['モデル ID のメタ文字', { ...preset.config, modelId: 'x$(id)' }]
  ])('IPC と同じ述語で拒否する: %s (write/read 対称)', (_l, config) => {
    expect(toPresetRecord({ ...fromPresetRecord(preset), config })).toEqual({
      ok: false,
      reason: 'invalid-record'
    })
  })

  it('未知キー・名前の制御文字・updatedAt 不正を拒否する', () => {
    const base = fromPresetRecord(preset)
    expect(toPresetRecord({ ...base, secretRefKey: 'x' }).ok).toBe(false)
    expect(toPresetRecord({ ...base, name: 'a\u0001b' }).ok).toBe(false)
    expect(toPresetRecord({ ...base, updatedAt: -1 }).ok).toBe(false)
    expect(toPresetRecord({ ...base, id: '' }).ok).toBe(false)
  })

  it('読み取った名前は正規化される', () => {
    const r = toPresetRecord({ ...fromPresetRecord(preset), name: '  業務用  ' })
    expect(r.ok && r.preset.name).toBe('業務用')
  })
})
