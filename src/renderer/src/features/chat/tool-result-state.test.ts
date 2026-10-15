import { describe, expect, it } from 'vitest'

import {
  isToolResultPending,
  toolResultState,
  toolStatusInput,
  type ToolResultContext
} from './tool-result-state'

const base: ToolResultContext = {
  live: true,
  runState: 'running',
  latestTurn: true,
  orphanResult: false
}

describe('toolResultState (016 data-model §3)', () => {
  it('result があれば結果あり (ctx に依らない)', () => {
    expect(toolResultState({ result: 'x' }, { ...base, live: false, runState: null })).toBe('done')
    expect(toolResultState({ result: '' }, base)).toBe('done')
  })

  it('結果だけのメッセージがあれば別に表示 (結果待ちより先)', () => {
    expect(toolResultState({}, { ...base, orphanResult: true })).toBe('elsewhere')
  })

  it('応答中の最新のターンは結果待ち (並列の tool も part ごと)', () => {
    expect(toolResultState({}, base)).toBe('running')
    expect(toolResultState({ result: 'a' }, base)).toBe('done')
    expect(toolResultState({}, base)).toBe('running')
  })

  it('承認待ちは動かない結果待ち', () => {
    const state = toolResultState({}, { ...base, runState: 'awaiting_permission' })
    expect(state).toBe('awaiting')
    expect(isToolResultPending(state)).toBe(true)
  })

  it.each(['done', 'interrupted', 'error', 'idle', 'launching'] as const)(
    '%s のあとは結果不明',
    (runState) => {
      const state = toolResultState({}, { ...base, runState })
      expect(state).toBe('unknown')
      expect(isToolResultPending(state)).toBe(false)
    }
  )

  it('過去ログ・前のターンは結果不明', () => {
    expect(toolResultState({}, { ...base, live: false, runState: null })).toBe('unknown')
    expect(toolResultState({}, { ...base, latestTurn: false })).toBe('unknown')
  })

  it('状態のアイコンの入力', () => {
    expect(toolStatusInput('done', false)).toEqual({ type: 'complete' })
    expect(toolStatusInput('done', true)).toEqual({ type: 'incomplete', reason: 'error' })
    expect(toolStatusInput('elsewhere', undefined)).toEqual({ type: 'complete' })
    expect(toolStatusInput('running', undefined)).toEqual({ type: 'running' })
    expect(toolStatusInput('awaiting', undefined).type).toBe('requires-action')
    expect(toolStatusInput('unknown', undefined).type).toBe('incomplete')
  })
})
