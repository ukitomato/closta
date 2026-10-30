import { describe, expect, it } from 'vitest'

import {
  additionalDirectoryChoices,
  limitInputOf,
  parseMaxBudgetInput,
  parseMaxTurnsInput,
  parseSessionNameInput
} from './launch-extra-axes'

describe('セッション名の入力の解釈 (024 data-model §9.2)', () => {
  it('空・空白だけは null、前後の空白を除いた値は通る', () => {
    expect(parseSessionNameInput('')).toEqual({ ok: true, value: null })
    expect(parseSessionNameInput('   ')).toEqual({ ok: true, value: null })
    expect(parseSessionNameInput('  ログインの API 修正  ')).toEqual({
      ok: true,
      value: 'ログインの API 修正'
    })
  })

  it('101 文字・改行・制御文字は不正', () => {
    for (const raw of ['a'.repeat(101), 'a\nb', 'a\u0007b', 'a b']) {
      expect(parseSessionNameInput(raw)).toEqual({ ok: false })
    }
    expect(parseSessionNameInput('a'.repeat(100))).toEqual({ ok: true, value: 'a'.repeat(100) })
  })
})

describe('上限の入力の解釈 (024 data-model §9.2)', () => {
  it('ターン数: 空・空白だけは null、整数は数', () => {
    expect(parseMaxTurnsInput('')).toEqual({ ok: true, value: null })
    expect(parseMaxTurnsInput('   ')).toEqual({ ok: true, value: null })
    expect(parseMaxTurnsInput('1')).toEqual({ ok: true, value: 1 })
    expect(parseMaxTurnsInput(' 30 ')).toEqual({ ok: true, value: 30 })
    expect(parseMaxTurnsInput('1000')).toEqual({ ok: true, value: 1000 })
  })

  it.each(['0', '1.5', '1001', '-1', '1e3', '0x10', '１２', '1.', '.5', 'abc'])(
    'ターン数: %s は不正',
    (raw) => {
      expect(parseMaxTurnsInput(raw)).toEqual({ ok: false })
    }
  )

  it('費用: 空は null、小数 2 桁までは数', () => {
    expect(parseMaxBudgetInput('')).toEqual({ ok: true, value: null })
    expect(parseMaxBudgetInput('0.01')).toEqual({ ok: true, value: 0.01 })
    expect(parseMaxBudgetInput('1000')).toEqual({ ok: true, value: 1000 })
    expect(parseMaxBudgetInput('2.5')).toEqual({ ok: true, value: 2.5 })
    expect(parseMaxBudgetInput('0.07')).toEqual({ ok: true, value: 0.07 })
  })

  it.each(['0', '1000.01', '0.005', '0.', '.5', '-1', '1e3', '0x10', '１', '1.234'])(
    '費用: %s は不正',
    (raw) => {
      expect(parseMaxBudgetInput(raw)).toEqual({ ok: false })
    }
  )

  it('初期値の文字列は解釈を通すと元の値に戻る', () => {
    expect(limitInputOf(null)).toBe('')
    for (const n of [1, 30, 1000])
      expect(parseMaxTurnsInput(limitInputOf(n))).toEqual({ ok: true, value: n })
    for (const n of [0.01, 0.07, 2.5, 30, 1000])
      expect(parseMaxBudgetInput(limitInputOf(n))).toEqual({ ok: true, value: n })
  })
})

const folders = [
  { id: 'a', displayName: 'A' },
  { id: 'b', displayName: 'B' },
  { id: 'c', displayName: 'C' }
]

describe('additionalDirectoryChoices (024 data-model §9.1)', () => {
  it('作業フォルダ自身と選択済みを除き、並びを保つ', () => {
    expect(additionalDirectoryChoices(folders, 'a', ['c']).map((f) => f.id)).toEqual(['b'])
  })

  it('作業フォルダ未選択なら選択済みだけを除く', () => {
    expect(additionalDirectoryChoices(folders, null, ['b']).map((f) => f.id)).toEqual(['a', 'c'])
  })

  it('全部選んでいれば空', () => {
    expect(additionalDirectoryChoices(folders, 'a', ['b', 'c'])).toEqual([])
  })
})
