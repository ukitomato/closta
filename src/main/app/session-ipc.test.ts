import { describe, expect, it } from 'vitest'

import type { SessionControl } from '@domain/session/agent-session'
import type { SessionIndexDTO } from '@domain/session/dto'
import { MAX_PROMPT_BYTES, MAX_SESSION_OFFSET } from '@domain/validation'

import {
  handleFetchMoreSessions,
  handleGetTranscript,
  handleInterruptSession,
  handleKillSession,
  handleLaunchSession,
  handleListSessions,
  handleRefreshSessions,
  handleRespondPermission,
  handleSendPrompt,
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
  readonly transcript: { sessionId: string; targetKey: string; requestToken: string }[]
  readonly launches: { folderId: string; runtimeId: string }[]
  readonly controls: { sessionId: string; control: SessionControl }[]
}

function deps(keys: readonly string[] = ['host#0', 'wsl:Ubuntu#0']): {
  deps: SessionIpcDeps
  calls: Calls
} {
  const calls: Calls = {
    list: [],
    refresh: [],
    fetch: [],
    transcript: [],
    launches: [],
    controls: []
  }
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
      sessionTargetKeys: () => keys,
      async getTranscript(sessionId, targetKey, requestToken) {
        calls.transcript.push({ sessionId, targetKey, requestToken })
        return {
          handshake: { status: 'streaming' as const, requestToken },
          port: null
        }
      },
      // X-1 で SessionIpcDeps に加わった起動/制御。呼び出しを記録する (負例で「発火しない」を検証)。
      async launchSession(folderId, runtimeId) {
        calls.launches.push({ folderId, runtimeId })
        return { status: 'rejected' as const, reason: 'unknown-target' as const }
      },
      controlSession(sessionId, control) {
        calls.controls.push({ sessionId, control })
        return true
      }
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

describe('handleGetTranscript — 検証表 (R-3 / BE-027 / SC-008)', () => {
  const VALID_UUID = '11111111-1111-4111-8111-111111111111'

  it('妥当な UUID + 既知 targetKey + 非空 token なら取得へ委譲する', async () => {
    const { deps: d, calls } = deps()

    const result = await handleGetTranscript(d, [VALID_UUID, 'host#0', 'tok'])

    expect(result.handshake).toEqual({ status: 'streaming', requestToken: 'tok' })
    expect(calls.transcript).toEqual([
      { sessionId: VALID_UUID, targetKey: 'host#0', requestToken: 'tok' }
    ])
  })

  it.each([
    ['非 UUID', 'not-a-uuid'],
    ['path traversal', '../../other/session'],
    ['セパレータ混入', '1111/2222'],
    ['空', ''],
    ['非文字列', 123],
    ['欠落', undefined]
  ])('sessionId が UUID でなければ取得を発行しない (%s)', async (_label, sessionId) => {
    const { deps: d, calls } = deps()

    const result = await handleGetTranscript(d, [sessionId, 'host#0', 'tok'])

    expect(result.handshake.status).toBe('failed')
    expect(result.port).toBeNull()
    expect(calls.transcript).toEqual([])
  })

  it('未知の targetKey では取得を発行しない', async () => {
    const { deps: d, calls } = deps()

    const result = await handleGetTranscript(d, [VALID_UUID, 'wsl:Unknown#0', 'tok'])

    expect(result.handshake.status).toBe('failed')
    expect(calls.transcript).toEqual([])
  })

  it('targetKey を config ディレクトリのパスとして解釈しない', async () => {
    const { deps: d, calls } = deps()

    for (const value of ['C:\\Users\\y\\.claude', '/home/y/.claude']) {
      expect((await handleGetTranscript(d, [VALID_UUID, value, 'tok'])).handshake.status).toBe(
        'failed'
      )
    }
    expect(calls.transcript).toEqual([])
  })

  it.each([
    ['空', ''],
    ['非文字列', 123],
    ['欠落', undefined],
    ['上限超過 (>128)', 'x'.repeat(129)]
  ])('requestToken が妥当でなければ発行しない (%s)', async (_label, requestToken) => {
    const { deps: d, calls } = deps()

    const result = await handleGetTranscript(d, [VALID_UUID, 'host#0', requestToken])

    expect(result.handshake.status).toBe('failed')
    expect(calls.transcript).toEqual([])
  })

  it('妥当な requestToken (非空・上限内) は発行する', async () => {
    const { deps: d, calls } = deps()

    const result = await handleGetTranscript(d, [VALID_UUID, 'host#0', 'x'.repeat(128)])

    expect(result.handshake.status).toBe('streaming')
    expect(calls.transcript).toHaveLength(1)
  })
})

describe('X-1 起動 + 制御ハンドラ — main 直接呼び (SC-004 / SC-007 / FR-010 / FR-012)', () => {
  const UUID = '11111111-1111-4111-8111-111111111111'

  describe('handleLaunchSession', () => {
    it('folderId/runtimeId が文字列なら launchSession へ委譲', async () => {
      const { deps: d, calls } = deps()
      await handleLaunchSession(d, ['f1', 'r1'])
      expect(calls.launches).toEqual([{ folderId: 'f1', runtimeId: 'r1' }])
    })

    it.each([
      ['folderId 非文字列', [123, 'r1']],
      ['runtimeId 非文字列', ['f1', null]],
      ['欠落', []]
    ])('型不正はプロセスを起こさず unknown-target で拒否 (%s)', async (_l, args) => {
      const { deps: d, calls } = deps()
      const out = await handleLaunchSession(d, args as readonly unknown[])
      expect(out).toEqual({ status: 'rejected', reason: 'unknown-target' })
      expect(calls.launches).toEqual([])
    })
  })

  describe('handleRespondPermission (承認の唯一経路。scope 格上げの負例)', () => {
    it('妥当な決定は controlSession へ respond-permission を送る', async () => {
      const { deps: d, calls } = deps()
      await handleRespondPermission(d, [UUID, 'perm-1', 'allow', 'once'])
      expect(calls.controls).toEqual([
        {
          sessionId: UUID,
          control: {
            kind: 'respond-permission',
            decision: { requestId: 'perm-1', outcome: 'allow', scope: 'once' }
          }
        }
      ])
    })

    it.each([
      ['outcome が enum 外', [UUID, 'perm-1', 'maybe', 'once']],
      ['outcome 格上げ (allow-all)', [UUID, 'perm-1', 'grant', 'once']],
      ['scope が enum 外', [UUID, 'perm-1', 'allow', 'forever']],
      ['sessionId 非 UUID', ['not-uuid', 'perm-1', 'allow', 'once']],
      ['requestId 空', [UUID, '', 'allow', 'once']],
      ['requestId 上限超', [UUID, 'x'.repeat(129), 'allow', 'once']],
      ['非文字列 outcome', [UUID, 'perm-1', 1, 'once']]
    ])('不正入力では制御を発火しない (%s)', async (_l, args) => {
      const { deps: d, calls } = deps()
      await handleRespondPermission(d, args as readonly unknown[])
      expect(calls.controls).toEqual([])
    })
  })

  describe('handleSendPrompt', () => {
    it('妥当な text は send-prompt を送る', async () => {
      const { deps: d, calls } = deps()
      await handleSendPrompt(d, [UUID, 'こんにちは'])
      expect(calls.controls).toEqual([
        { sessionId: UUID, control: { kind: 'send-prompt', text: 'こんにちは' } }
      ])
    })

    it.each([
      ['空', [UUID, '']],
      ['空白のみ', [UUID, '   \n\t']],
      ['バイト長超過', [UUID, 'a'.repeat(MAX_PROMPT_BYTES + 1)]],
      ['sessionId 非 UUID', ['not-uuid', 'hi']],
      ['非文字列', [UUID, 42]]
    ])('不正入力では送らない (%s)', async (_l, args) => {
      const { deps: d, calls } = deps()
      await handleSendPrompt(d, args as readonly unknown[])
      expect(calls.controls).toEqual([])
    })
  })

  describe('handleInterruptSession / handleKillSession', () => {
    it('妥当な UUID なら interrupt / kill を送る', async () => {
      const { deps: d, calls } = deps()
      await handleInterruptSession(d, [UUID])
      await handleKillSession(d, [UUID])
      expect(calls.controls).toEqual([
        { sessionId: UUID, control: { kind: 'interrupt' } },
        { sessionId: UUID, control: { kind: 'kill' } }
      ])
    })

    it.each([
      ['非 UUID', ['not-uuid']],
      ['欠落', []]
    ])('非 UUID sessionId では発火しない (%s)', async (_l, args) => {
      const { deps: d, calls } = deps()
      await handleInterruptSession(d, args as readonly unknown[])
      await handleKillSession(d, args as readonly unknown[])
      expect(calls.controls).toEqual([])
    })
  })
})
