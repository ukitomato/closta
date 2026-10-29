import { describe, expect, it } from 'vitest'

import { MAX_CATALOG_MODELS, normalizeLiveModelEntries, normalizeLiveModels } from './model-catalog'

/** 025 / data-model §1.2 / §1.3: 既定の Provider のモデルの一覧の正規化。 */

const info = (value: unknown, displayName: unknown = 'N', extra: object = {}): object => ({
  value,
  displayName,
  description: 'd',
  ...extra
})

describe('normalizeLiveModels (ModelInfo の形。5 規則)', () => {
  it('配列でなければ null', () => {
    expect(normalizeLiveModels(undefined)).toBeNull()
    expect(normalizeLiveModels({})).toBeNull()
    expect(normalizeLiveModels('x')).toBeNull()
  })

  it('空の配列は [] で null でない', () => {
    expect(normalizeLiveModels([])).toEqual([])
  })

  it('オブジェクトでない・value が文字列でない要素を捨てる', () => {
    expect(normalizeLiveModels([null, 1, 'x', info(3), info('ok')])).toEqual([
      { id: 'ok', displayName: 'N' }
    ])
  })

  it('isValidModelEntry を通らない要素 (文字種・空の displayName・effort の外) を捨てる', () => {
    const out = normalizeLiveModels([
      info('-bad'),
      info('has space'),
      info('a', ''),
      info('b', 'B', { supportedEffortLevels: ['low', 'ultra'] }),
      info('good', 'G', { supportedEffortLevels: ['low'] })
    ])
    expect(out).toEqual([{ id: 'good', displayName: 'G', supportedEffortLevels: ['low'] }])
  })

  it('同じ id は先を残す', () => {
    expect(normalizeLiveModels([info('a', 'First'), info('a', 'Second')])).toEqual([
      { id: 'a', displayName: 'First' }
    ])
  })

  it('65 件で 64 件に切る', () => {
    const raw = Array.from({ length: MAX_CATALOG_MODELS + 1 }, (_, i) => info(`m${i}`))
    expect(normalizeLiveModels(raw)).toHaveLength(MAX_CATALOG_MODELS)
  })

  it('description / resolvedModel / supports* を写さない。sonnet[1m] が通る', () => {
    const out = normalizeLiveModels([
      info('sonnet[1m]', 'Sonnet', { resolvedModel: 'x', supportsEffort: true })
    ])
    expect(out).toEqual([{ id: 'sonnet[1m]', displayName: 'Sonnet' }])
  })
})

describe('normalizeLiveModelEntries (ModelEntry の形。4 規則)', () => {
  it('配列でなければ null', () => {
    expect(normalizeLiveModelEntries(null)).toBeNull()
    expect(normalizeLiveModelEntries({})).toBeNull()
  })

  it('isValidModelEntry を通らない・inferenceProfileId を持つ・value の形の要素を捨てる', () => {
    const out = normalizeLiveModelEntries([
      { id: 'ok', displayName: 'OK' },
      { id: '-bad', displayName: 'Bad' },
      { id: 'p', displayName: 'P', inferenceProfileId: 'prof' },
      { value: 'v', displayName: 'V' }
    ])
    expect(out).toEqual([{ id: 'ok', displayName: 'OK' }])
  })

  it('同じ id は先を残し、64 件で切る', () => {
    expect(
      normalizeLiveModelEntries([
        { id: 'a', displayName: '1' },
        { id: 'a', displayName: '2' }
      ])
    ).toEqual([{ id: 'a', displayName: '1' }])
    const raw = Array.from({ length: 70 }, (_, i) => ({ id: `m${i}`, displayName: 'N' }))
    expect(normalizeLiveModelEntries(raw)).toHaveLength(MAX_CATALOG_MODELS)
  })

  it('normalizeLiveModelEntries(normalizeLiveModels(x)) は normalizeLiveModels(x) と等しい (H-004)', () => {
    const raw = [
      info('a', 'A', { supportedEffortLevels: ['high'] }),
      info('a', 'dup'),
      info('sonnet[1m]', 'S'),
      info('-bad'),
      null
    ]
    const first = normalizeLiveModels(raw)
    expect(normalizeLiveModelEntries(first)).toEqual(first)
  })
})
