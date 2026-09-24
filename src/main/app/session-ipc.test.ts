import { describe, expect, it } from 'vitest'

import type { SessionIndexDTO } from '@domain/session/dto'
import { MAX_SESSION_OFFSET } from '@domain/validation'

import {
  handleFetchMoreSessions,
  handleListSessions,
  handleRefreshSessions,
  type SessionIpcDeps
} from './session-ipc'

/**
 * BE-029 — IPC の検証 (SC-010 / contracts/ipc-session-list.md 節 A)。
 *
 * **preload をスタブせず main 側ハンドラを直接呼ぶ。**
 * 検証関数のユニットテスト (`validate.test.ts`) だけでは
 * **ハンドラがその検証関数を呼んでいるか**が検査されないまま残る。
 */

const CACHE = { kind: 'cache' } as unknown as SessionIndexDTO
const FETCHED = { kind: 'fetched' } as unknown as SessionIndexDTO

interface Calls {
  readonly list: number[]
  readonly refresh: number[]
  readonly fetch: { targetKey: string; offset: number }[]
}

function deps(keys: readonly string[] = ['host#0', 'wsl:Ubuntu#0']): {
  deps: SessionIpcDeps
  calls: Calls
} {
  const calls: Calls = { list: [], refresh: [], fetch: [] }
  return {
    calls,
    deps: {
      async listSessions() {
        calls.list.push(1)
        return CACHE
      },
      async refreshSessions() {
        calls.refresh.push(1)
        return CACHE
      },
      async fetchMoreSessions(targetKey, offset) {
        calls.fetch.push({ targetKey, offset })
        return FETCHED
      },
      sessionTargetKeys: () => keys
    }
  }
}

describe('handleFetchMoreSessions — 節 A の各行', () => {
  it('既知の `targetKey` と妥当な `offset` なら取得する', async () => {
    const { deps: d, calls } = deps()

    const result = await handleFetchMoreSessions(d, ['host#0', 50])

    expect(result).toBe(FETCHED)
    expect(calls.fetch).toEqual([{ targetKey: 'host#0', offset: 50 }])
  })

  it('未知の `targetKey` では列挙を発行せずキャッシュを返す', async () => {
    const { deps: d, calls } = deps()

    const result = await handleFetchMoreSessions(d, ['wsl:Debian#0', 0])

    expect(result).toBe(CACHE)
    expect(calls.fetch).toEqual([])
  })

  it('`targetKey` を config ディレクトリのパスとして解釈しない', async () => {
    const { deps: d, calls } = deps()

    for (const value of [
      'C:\\Users\\y\\.claude',
      '/home/y/.claude',
      '\\\\wsl.localhost\\Ubuntu\\home\\y\\.claude'
    ]) {
      expect(await handleFetchMoreSessions(d, [value, 0])).toBe(CACHE)
    }
    expect(calls.fetch).toEqual([])
  })

  it.each([
    ['負数', -1],
    ['小数', 1.5],
    ['上限超過', MAX_SESSION_OFFSET + 1],
    ['NaN', Number.NaN],
    ['文字列', '0'],
    ['欠落', undefined]
  ])('不正な `offset` では列挙を発行しない (%s)', async (_label, offset) => {
    const { deps: d, calls } = deps()

    const result = await handleFetchMoreSessions(d, ['host#0', offset])

    expect(result).toBe(CACHE)
    expect(calls.fetch).toEqual([])
  })

  it('`offset` の上限ちょうどは通す', async () => {
    const { deps: d, calls } = deps()

    await handleFetchMoreSessions(d, ['host#0', MAX_SESSION_OFFSET])

    expect(calls.fetch).toEqual([{ targetKey: 'host#0', offset: MAX_SESSION_OFFSET }])
  })

  it('引数が 0 個でも例外にしない', async () => {
    const { deps: d, calls } = deps()

    expect(await handleFetchMoreSessions(d, [])).toBe(CACHE)
    expect(calls.fetch).toEqual([])
  })

  it('拒否の応答がキャッシュと同じ形である (存在を数えられないようにする)', async () => {
    const { deps: d } = deps()

    const unknownKey = await handleFetchMoreSessions(d, ['wsl:Debian#0', 0])
    const badOffset = await handleFetchMoreSessions(d, ['host#0', -1])

    expect(unknownKey).toBe(badOffset)
  })

  it('停止中の所在の `key` も照合を通る (SC-002 / SC-010 の経路)', async () => {
    /*
     * 停止中の所在の `key` は境界に出しているので既知である。
     * **ここで止めない** — 止めると「既知の `key` + 停止中」の経路が
     * 「未知の `key`」として処理され、起動ゲートが測れない。
     */
    const { deps: d, calls } = deps(['wsl:Stopped#0'])

    await handleFetchMoreSessions(d, ['wsl:Stopped#0', 0])

    expect(calls.fetch).toEqual([{ targetKey: 'wsl:Stopped#0', offset: 0 }])
  })
})

describe('handleListSessions / handleRefreshSessions', () => {
  it('引数を取らない (検証対象を増やさない)', async () => {
    const { deps: d, calls } = deps()

    await handleListSessions(d)
    await handleRefreshSessions(d)

    expect(calls.list).toHaveLength(1)
    expect(calls.refresh).toHaveLength(1)
  })
})
