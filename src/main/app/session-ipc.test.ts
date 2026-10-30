import type { MessagePortMain } from 'electron'
import { describe, expect, it, vi, type Mock } from 'vitest'

import type { SessionControl } from '@domain/session/agent-session'
import type { SessionIndexDTO } from '@domain/session/dto'
import { DEFAULT_EXTRA_AXES } from '@domain/session/launch-config'
import type { LaunchOrigin, LaunchUsageSummaryDTO } from '@domain/session/launch-usage'
import type { SessionResumeRequest } from '@domain/session/resume'
import { MAX_PROMPT_BYTES, MAX_SESSION_OFFSET } from '@domain/validation'

import type { LaunchOutcome } from './session-launch-service'
import {
  handleFetchMoreSessions,
  handleGetLaunchUsage,
  handleGetResumedTranscript,
  handleResolvePastResume,
  handleResumeSession,
  handleGetTranscript,
  handleInterruptSession,
  handleEndSession,
  handleKillSession,
  handleLaunchSession,
  handleListPresets,
  handleListSessionModels,
  handleListSessions,
  handleRefreshSessions,
  handleRemovePreset,
  handleRespondElicitation,
  handleRespondPermission,
  handleSavePreset,
  handleSendPrompt,
  handleSetSessionModel,
  handleRenameSession,
  handleSetSessionPermissionMode,
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
  readonly presetSaves: unknown[]
  readonly presetRemoves: string[]
  readonly usageRecords: LaunchOrigin[]
  readonly resolves: { targetKey: string; conversationId: string }[]
  readonly resumes: SessionResumeRequest[]
  readonly resumedTranscripts: { sessionId: string; requestToken: string }[]
  readonly permissionModes: { sessionId: string; mode: string }[]
  readonly models: { sessionId: string; modelId: string }[]
  readonly listModels: string[]
  readonly renames: { sessionId: string; name: string }[]
}

function deps(
  keys: readonly string[] = ['host#0', 'wsl:Ubuntu#0'],
  over: Partial<SessionIpcDeps> = {}
): {
  deps: SessionIpcDeps
  calls: Calls
} {
  const calls: Calls = {
    list: [],
    refresh: [],
    fetch: [],
    transcript: [],
    launches: [],
    controls: [],
    presetSaves: [],
    presetRemoves: [],
    usageRecords: [],
    resolves: [],
    resumes: [],
    resumedTranscripts: [],
    permissionModes: [],
    models: [],
    listModels: [],
    renames: []
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
      async launchSession(config) {
        calls.launches.push({ folderId: config.folderId, runtimeId: config.runtimeId })
        return { status: 'rejected' as const, reason: 'unknown-target' as const }
      },
      controlSession(sessionId, control) {
        calls.controls.push({ sessionId, control })
        return true
      },
      // 023 の権限モードの切り替え。呼び出しを記録する (負例で「発火しない」を検証)。
      async setSessionPermissionMode(sessionId, mode) {
        calls.permissionModes.push({ sessionId, mode })
        return { ok: true as const }
      },
      async setSessionModel(sessionId, modelId) {
        calls.models.push({ sessionId, modelId })
        return { ok: true as const }
      },
      async listSessionModels(sessionId) {
        calls.listModels.push(sessionId)
        return { ok: true as const, models: [{ id: 'm', displayName: 'M' }], reportedCount: 1 }
      },
      async renameSession(sessionId, name) {
        calls.renames.push({ sessionId, name })
        return { ok: true as const, name }
      },
      // X-9 の再開。呼び出しを記録する (負例で「発火しない」を検証)。
      async resolvePastResume(targetKey, conversationId) {
        calls.resolves.push({ targetKey, conversationId })
        return {
          ok: true as const,
          folderId: 'f1',
          runtimeId: 'host',
          providerId: null
        }
      },
      async resumeSession(request) {
        calls.resumes.push(request)
        return { status: 'rejected' as const, reason: 'source-unknown' as const }
      },
      async getResumedTranscript(sessionId, requestToken) {
        calls.resumedTranscripts.push({ sessionId, requestToken })
        return { handshake: { status: 'streaming' as const, requestToken }, port: null }
      },
      // X-4 のプリセット。
      async listPresets() {
        return []
      },
      async savePreset(input) {
        calls.presetSaves.push(input)
        return {
          ok: true as const,
          preset: { id: 'x', name: input.name, config: input.config, updatedAt: 1 }
        }
      },
      async removePreset(id) {
        calls.presetRemoves.push(id)
        return { ok: true }
      },
      async presetIds() {
        return ['preset-1']
      },
      // O-3 の起動の利用記録。記録の呼び出しを数える (負例で「記録しない」を検証)。
      async recordLaunchUsage(origin) {
        calls.usageRecords.push(origin)
      },
      async getLaunchUsage() {
        return { status: 'ok' as const, preset: 0, manual: 0, days: 30 as const }
      },
      ...over
    }
  }
}

const CONFIG = {
  folderId: 'f1',
  runtimeId: 'wsl:Ubuntu',
  providerId: null,
  modelId: null,
  effort: null,
  permissionMode: 'default',
  ...DEFAULT_EXTRA_AXES,
  sessionName: null
}
// プリセットは名前を持たない 9 キー (024 FR-010)
const PRESET_CONFIG = (({ sessionName, ...rest }) => (void sessionName, rest))(CONFIG)

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
  /** 承認要求の相関鍵 (X-5: セッションスレッドが `crypto.randomUUID` で発行する)。 */
  const REQUEST_ID = '33333333-3333-4333-8333-333333333333'

  describe('handleLaunchSession (X-4: 起動設定オブジェクト)', () => {
    it('形の正しい起動設定なら launchSession へ委譲', async () => {
      const { deps: d, calls } = deps()
      await handleLaunchSession(d, [CONFIG])
      expect(calls.launches).toEqual([{ folderId: 'f1', runtimeId: 'wsl:Ubuntu' }])
    })

    it.each([
      ['X-1 形式 (folderId, runtimeId)', ['f1', 'r1']],
      ['欠落', []],
      ['昇格モード', [{ ...CONFIG, permissionMode: 'bypass' + 'Permissions' }]],
      ['acceptEdits', [{ ...CONFIG, permissionMode: 'acceptEdits' }]],
      ['未知キー', [{ ...CONFIG, settings: { env: {} } }]],
      ['model のメタ文字', [{ ...CONFIG, providerId: 'p', modelId: 'x$(id)' }]],
      ['effort の enum 外', [{ ...CONFIG, effort: 'ultra' }]],
      ['folderId 空', [{ ...CONFIG, folderId: '' }]],
      ['providerId の型不正 (既定は null で表す)', [{ ...CONFIG, providerId: 1 }]]
    ])('形の不正はプロセスを起こさず invalid-config で拒否 (%s)', async (_l, args) => {
      const { deps: d, calls } = deps()
      const out = await handleLaunchSession(d, args as readonly unknown[])
      expect(out).toEqual({ status: 'rejected', reason: 'invalid-config' })
      expect(calls.launches).toEqual([])
    })
  })

  describe('プリセット IPC (X-4 BE-013)', () => {
    it('savePreset は checkPreset を通った値だけを service へ渡す', async () => {
      const { deps: d, calls } = deps()
      const ok = await handleSavePreset(d, ['  日本語の名前  ', PRESET_CONFIG, false])
      expect(ok.ok).toBe(true)
      expect(calls.presetSaves).toHaveLength(1)
    })

    it.each([
      ['空名', ['   ', CONFIG, false]],
      ['制御文字', ['a\u0001b', CONFIG, false]],
      ['config 不正', ['n', { ...CONFIG, permissionMode: 'auto' }, false]],
      ['overwrite 非真偽値', ['n', CONFIG, 'yes']]
    ])('不正な入力は invalid-preset (%s)', async (_l, args) => {
      const { deps: d, calls } = deps()
      expect(await handleSavePreset(d, args)).toEqual({ ok: false, reason: 'invalid-preset' })
      expect(calls.presetSaves).toEqual([])
    })

    it('removePreset は既知 id との完全一致だけを通す', async () => {
      const { deps: d, calls } = deps()
      expect(await handleRemovePreset(d, ['preset-1'])).toEqual({ ok: true })
      expect(await handleRemovePreset(d, ['preset-1 '])).toEqual({ ok: false })
      expect(await handleRemovePreset(d, [1])).toEqual({ ok: false })
      expect(calls.presetRemoves).toEqual(['preset-1'])
    })

    it('listPresets は引数を取らない', async () => {
      const { deps: d } = deps()
      expect(await handleListPresets(d)).toEqual([])
    })
  })

  describe('handleRespondPermission (承認の唯一経路。scope 格上げの負例)', () => {
    it('妥当な決定は controlSession へ respond-permission を送る', async () => {
      const { deps: d, calls } = deps()
      await handleRespondPermission(d, [UUID, REQUEST_ID, 'allow', 'once'])
      expect(calls.controls).toEqual([
        {
          sessionId: UUID,
          control: {
            kind: 'respond-permission',
            decision: { requestId: REQUEST_ID, outcome: 'allow', scope: 'once' }
          }
        }
      ])
    })

    it.each([
      ['outcome が enum 外', [UUID, REQUEST_ID, 'maybe', 'once']],
      ['outcome 格上げ (allow-all)', [UUID, REQUEST_ID, 'grant', 'once']],
      ['scope が enum 外', [UUID, REQUEST_ID, 'allow', 'forever']],
      ['sessionId 非 UUID', ['not-uuid', REQUEST_ID, 'allow', 'once']],
      ['requestId 空', [UUID, '', 'allow', 'once']],
      ['requestId 上限超', [UUID, 'x'.repeat(129), 'allow', 'once']],
      // X-5 (BE-010): requestId は暗号論的乱数の UUID に限る。推測しやすい連番・自由文字列は通さない。
      ['requestId が UUID でない', [UUID, 'perm-1', 'allow', 'once']],
      ['非文字列 outcome', [UUID, REQUEST_ID, 1, 'once']]
    ])('不正入力では制御を発火しない (%s)', async (_l, args) => {
      const { deps: d, calls } = deps()
      await handleRespondPermission(d, args as readonly unknown[])
      expect(calls.controls).toEqual([])
    })

    it('answers つきの正例は decision.answers に載る (O-10)', async () => {
      const { deps: d, calls } = deps()
      await handleRespondPermission(d, [UUID, REQUEST_ID, 'allow', 'once', ['赤', 'a, b']])
      expect(calls.controls).toEqual([
        {
          sessionId: UUID,
          control: {
            kind: 'respond-permission',
            decision: {
              requestId: REQUEST_ID,
              outcome: 'allow',
              scope: 'once',
              answers: ['赤', 'a, b']
            }
          }
        }
      ])
    })

    it.each([
      ['空白だけの回答', ['   ']],
      ['5 件', ['a', 'b', 'c', 'd', 'e']],
      ['数を含む', ['a', 1]],
      ['0 件', []],
      ['配列でない', 'a'],
      ['null', null]
    ])('answers が不正 (%s) なら制御を送らない', async (_l, answers) => {
      const { deps: d, calls } = deps()
      await handleRespondPermission(d, [UUID, REQUEST_ID, 'allow', 'once', answers])
      expect(calls.controls).toEqual([])
    })

    it('answers を省いた 4 引数の呼び出しは変わらない (answers のキーが無い)', async () => {
      const { deps: d, calls } = deps()
      await handleRespondPermission(d, [UUID, REQUEST_ID, 'deny', 'once', undefined])
      expect(calls.controls).toEqual([
        {
          sessionId: UUID,
          control: {
            kind: 'respond-permission',
            decision: { requestId: REQUEST_ID, outcome: 'deny', scope: 'once' }
          }
        }
      ])
    })
  })

  describe('handleRespondElicitation (O-10 / contracts C-1 prime)', () => {
    const control = (response: Record<string, unknown>): unknown => ({
      sessionId: UUID,
      control: { kind: 'respond-elicitation', response }
    })

    it('content なしの accept (URL のリンクを押した) は {requestId, action} で届く', async () => {
      const { deps: d, calls } = deps()
      await handleRespondElicitation(d, [UUID, REQUEST_ID, 'accept'])
      expect(calls.controls).toEqual([control({ requestId: REQUEST_ID, action: 'accept' })])
      await handleRespondElicitation(d, [UUID, REQUEST_ID, 'accept', undefined])
      expect(calls.controls[1]).toEqual(control({ requestId: REQUEST_ID, action: 'accept' }))
    })

    it('content: {} の accept と値つきの accept が届く', async () => {
      const { deps: d, calls } = deps()
      await handleRespondElicitation(d, [UUID, REQUEST_ID, 'accept', {}])
      await handleRespondElicitation(d, [UUID, REQUEST_ID, 'accept', { a: 'x', n: 1, b: false }])
      expect(calls.controls).toEqual([
        control({ requestId: REQUEST_ID, action: 'accept', content: {} }),
        control({ requestId: REQUEST_ID, action: 'accept', content: { a: 'x', n: 1, b: false } })
      ])
    })

    it('decline / cancel の content は捨てる (制御に載らない)', async () => {
      const { deps: d, calls } = deps()
      await handleRespondElicitation(d, [UUID, REQUEST_ID, 'decline', { a: 'MARK' }])
      await handleRespondElicitation(d, [UUID, REQUEST_ID, 'cancel', { a: 'MARK' }])
      expect(calls.controls).toEqual([
        control({ requestId: REQUEST_ID, action: 'decline' }),
        control({ requestId: REQUEST_ID, action: 'cancel' })
      ])
      expect(JSON.stringify(calls.controls)).not.toContain('MARK')
    })

    it.each([
      ['33 キー', Object.fromEntries(Array.from({ length: 33 }, (_, i) => [`k${i}`, 1]))],
      ['__proto__ のキー', JSON.parse('{"__proto__": 1}')],
      ['値が object', { a: {} }],
      ['配列', []],
      ['null', null],
      ['NaN', { a: Number.NaN }],
      ['1,001 コードポイント', { a: 'x'.repeat(1001) }]
    ])('accept の content が不正 (%s) なら制御を送らない', async (_l, content) => {
      const { deps: d, calls } = deps()
      await handleRespondElicitation(d, [UUID, REQUEST_ID, 'accept', content])
      expect(calls.controls).toEqual([])
    })

    it.each([
      ['sessionId 非 UUID', ['nope', REQUEST_ID, 'accept']],
      ['requestId 非 UUID', [UUID, 'req-1', 'accept']],
      ['action が列挙の外', [UUID, REQUEST_ID, 'ok']],
      ['action が数', [UUID, REQUEST_ID, 1]]
    ])('不正入力では制御を送らない (%s)', async (_l, args) => {
      const { deps: d, calls } = deps()
      await handleRespondElicitation(d, args as readonly unknown[])
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

  describe('handleInterruptSession / handleEndSession / handleKillSession', () => {
    it('妥当な UUID なら interrupt / end / kill を送る (X-5: end は FR-011 の穏当な終了)', async () => {
      const { deps: d, calls } = deps()
      await handleInterruptSession(d, [UUID])
      await handleEndSession(d, [UUID])
      await handleKillSession(d, [UUID])
      expect(calls.controls).toEqual([
        { sessionId: UUID, control: { kind: 'interrupt' } },
        { sessionId: UUID, control: { kind: 'end' } },
        { sessionId: UUID, control: { kind: 'kill' } }
      ])
    })

    it.each([
      ['非 UUID', ['not-uuid']],
      ['欠落', []],
      ['非文字列', [42]]
    ])('非 UUID sessionId では発火しない (%s)', async (_l, args) => {
      const { deps: d, calls } = deps()
      await handleInterruptSession(d, args as readonly unknown[])
      await handleEndSession(d, args as readonly unknown[])
      await handleKillSession(d, args as readonly unknown[])
      expect(calls.controls).toEqual([])
    })
  })

  describe('handleSetSessionPermissionMode (023 / contracts C-1)', () => {
    it.each(['default', 'plan', 'dontAsk'])(
      '安全 3 値 %s は service に渡して結果を返す',
      async (mode) => {
        const { deps: d, calls } = deps()
        await expect(handleSetSessionPermissionMode(d, [UUID, mode])).resolves.toEqual({ ok: true })
        expect(calls.permissionModes).toEqual([{ sessionId: UUID, mode }])
      }
    )

    it.each([
      ['昇格の値', [UUID, 'bypassPermissions']],
      ['知らない値', [UUID, 'nope']],
      ['数', [UUID, 1]],
      ['null', [UUID, null]],
      ['配列', [UUID, ['plan']]],
      ['非 UUID', ['not-uuid', 'plan']],
      ['欠落', [UUID]],
      ['余分な引数', [UUID, 'plan', 'extra']]
    ])('不正入力は invalid-value で service を呼ばない (%s)', async (_l, args) => {
      const { deps: d, calls } = deps()
      await expect(handleSetSessionPermissionMode(d, args as readonly unknown[])).resolves.toEqual({
        ok: false,
        reason: 'invalid-value'
      })
      expect(calls.permissionModes).toEqual([])
    })
  })

  describe('handleSetSessionModel (023 / contracts C-2)', () => {
    it('文字種の通る値は service に渡して結果を返す', async () => {
      const { deps: d, calls } = deps()
      await expect(handleSetSessionModel(d, [UUID, 'claude-opus-4-1'])).resolves.toEqual({
        ok: true
      })
      expect(calls.models).toEqual([{ sessionId: UUID, modelId: 'claude-opus-4-1' }])
    })

    it.each([
      ['空白入り', [UUID, 'a b']],
      ['先頭が -', [UUID, '-x']],
      ['空', [UUID, '']],
      ['数', [UUID, 1]],
      ['非 UUID', ['not-uuid', 'sonnet']],
      ['欠落', [UUID]],
      ['余分な引数', [UUID, 'sonnet', 'extra']]
    ])('不正入力は invalid-value で service を呼ばない (%s)', async (_l, args) => {
      const { deps: d, calls } = deps()
      await expect(handleSetSessionModel(d, args as readonly unknown[])).resolves.toEqual({
        ok: false,
        reason: 'invalid-value'
      })
      expect(calls.models).toEqual([])
    })
  })

  describe('handleListSessionModels (025 / contracts C-7)', () => {
    it('UUID は service に渡して戻り値をそのまま返す', async () => {
      const { deps: d, calls } = deps()
      await expect(handleListSessionModels(d, [UUID])).resolves.toEqual({
        ok: true,
        models: [{ id: 'm', displayName: 'M' }],
        reportedCount: 1
      })
      expect(calls.listModels).toEqual([UUID])
    })

    it.each([
      ['引数 0', []],
      ['引数 2', [UUID, UUID]],
      ['非 UUID', ['not-uuid']],
      ['数', [1]],
      ['null', [null]]
    ])('不正入力は unknown-session で service を呼ばない (%s)', async (_l, args) => {
      const { deps: d, calls } = deps()
      await expect(handleListSessionModels(d, args as readonly unknown[])).resolves.toEqual({
        ok: false,
        reason: 'unknown-session'
      })
      expect(calls.listModels).toEqual([])
    })
  })

  describe('handleRenameSession (023 / contracts C-3)', () => {
    it('trim した名前を service に渡して結果をそのまま返す', async () => {
      const { deps: d, calls } = deps()
      await expect(handleRenameSession(d, [UUID, '  調査  '])).resolves.toEqual({
        ok: true,
        name: '調査'
      })
      expect(calls.renames).toEqual([{ sessionId: UUID, name: '調査' }])
    })

    it.each([
      ['空', [UUID, '']],
      ['空白だけ', [UUID, '   ']],
      ['101 文字', [UUID, 'a'.repeat(101)]],
      ['改行', [UUID, 'a\nb']],
      ['制御文字', [UUID, 'a\u0000b']],
      ['行の区切り', [UUID, 'a b']],
      ['数', [UUID, 1]],
      ['非 UUID', ['not-uuid', 'a']],
      ['欠落', [UUID]],
      ['余分な引数', [UUID, 'a', 'extra']]
    ])('不正入力は invalid-value で service を呼ばない (%s)', async (_l, args) => {
      const { deps: d, calls } = deps()
      await expect(handleRenameSession(d, args as readonly unknown[])).resolves.toEqual({
        ok: false,
        reason: 'invalid-value'
      })
      expect(calls.renames).toEqual([])
    })
  })
})

describe('起動元と起動の利用記録 — main 直接呼び (O-3 BE-043 / 012 spec FR-010・FR-013 / SC-005)', () => {
  const UUID = '11111111-1111-4111-8111-111111111111'
  const LAUNCHING: LaunchOutcome = {
    status: 'launching',
    sessionId: UUID,
    port: {} as MessagePortMain
  }

  /** 起動が受け付けられる deps (起動の service の引数を記録する)。 */
  function launchingDeps(over: Partial<SessionIpcDeps> = {}): {
    deps: SessionIpcDeps
    calls: Calls
    launch: Mock<SessionIpcDeps['launchSession']>
  } {
    const launch = vi.fn<SessionIpcDeps['launchSession']>(async () => LAUNCHING)
    const built = deps(undefined, { launchSession: launch, ...over })
    return { ...built, launch }
  }

  it.each([
    ['preset', ['preset']],
    ['manual', ['manual']],
    ['欠落', []],
    ['未知 (大文字)', ['Preset']],
    ['未知 (プロトタイプの名前)', ['toString']],
    ['未知 (数値)', [1]],
    ['未知 (null)', [null]],
    ['未知 (オブジェクト)', [{ origin: 'preset' }]]
  ])(
    '起動元が %s でも、起動の service は config だけで 1 回呼ばれ、拒否されない',
    async (_l, originArgs) => {
      const { deps: d, launch } = launchingDeps()
      const outcome = await handleLaunchSession(d, [CONFIG, ...originArgs])
      expect(outcome).toBe(LAUNCHING)
      expect(launch).toHaveBeenCalledTimes(1)
      expect(launch.mock.calls[0]).toEqual([CONFIG])
    }
  )

  it.each([
    ['preset', 'preset', ['preset']],
    ['manual', 'manual', ['manual']],
    ['欠落', undefined, []],
    ['未知', 'Preset', []],
    ['未知 (プロトタイプの名前)', 'constructor', []]
  ])(
    '受け付けた起動の起動元が preset / manual のときだけ記録する (%s)',
    async (_l, origin, expected) => {
      const { deps: d, calls } = launchingDeps()
      await handleLaunchSession(d, origin === undefined ? [CONFIG] : [CONFIG, origin])
      expect(calls.usageRecords).toEqual(expected)
    }
  )

  it.each([
    ['起動ゲートの拒否 (上限)', 'session-limit'],
    ['起動ゲートの拒否 (停止中)', 'distro-not-running'],
    ['起動の失敗', 'launch-failed'],
    ['未知の対象', 'unknown-target']
  ] as const)('拒否・失敗した起動は記録しない (%s)', async (_l, reason) => {
    const { deps: d, calls } = launchingDeps({
      launchSession: async () => ({ status: 'rejected', reason })
    })
    const outcome = await handleLaunchSession(d, [CONFIG, 'preset'])
    expect(outcome).toEqual({ status: 'rejected', reason })
    expect(calls.usageRecords).toEqual([])
  })

  it('形の不正な起動設定は起動も記録もしない', async () => {
    const { deps: d, calls, launch } = launchingDeps()
    const outcome = await handleLaunchSession(d, [{ ...CONFIG, folderId: '' }, 'preset'])
    expect(outcome).toEqual({ status: 'rejected', reason: 'invalid-config' })
    expect(launch).not.toHaveBeenCalled()
    expect(calls.usageRecords).toEqual([])
  })

  it.each([
    ['reject する', (): Promise<void> => Promise.reject(new Error('disk full'))],
    [
      '同期で投げる',
      (): Promise<void> => {
        throw new Error('sync throw')
      }
    ],
    ['終わらない (await しない)', (): Promise<void> => new Promise<void>(() => {})]
  ])('recordLaunchUsage が %s ときも結果は launching', async (_l, recordLaunchUsage) => {
    const record = vi.fn(recordLaunchUsage)
    const { deps: d } = launchingDeps({ recordLaunchUsage: record })
    await expect(handleLaunchSession(d, [CONFIG, 'manual'])).resolves.toBe(LAUNCHING)
    expect(record).toHaveBeenCalledTimes(1)
    expect(record).toHaveBeenCalledWith('manual')
  })

  describe('handleGetLaunchUsage', () => {
    it('集計の DTO だけを返す (service の値に余計なキーがあっても渡さない)', async () => {
      const leaky = {
        status: 'ok',
        preset: 3,
        manual: 1,
        days: 30,
        perDay: { '2026-10-04': { preset: 3, manual: 1 } },
        path: 'C:\\Users\\someone\\launch-usage.json'
      } as unknown as LaunchUsageSummaryDTO
      const { deps: d } = deps(undefined, { getLaunchUsage: async () => leaky })
      expect(await handleGetLaunchUsage(d)).toEqual({
        status: 'ok',
        preset: 3,
        manual: 1,
        days: 30
      })
    })

    it('読めないは unreadable のまま、service が投げても unreadable', async () => {
      const unreadable = deps(undefined, {
        getLaunchUsage: async () => ({ status: 'unreadable', reason: 'EBUSY' }) as never
      })
      expect(await handleGetLaunchUsage(unreadable.deps)).toEqual({ status: 'unreadable' })
      const throwing = deps(undefined, {
        getLaunchUsage: () => Promise.reject(new Error('boom'))
      })
      expect(await handleGetLaunchUsage(throwing.deps)).toEqual({ status: 'unreadable' })
    })
  })
})

describe('再開の handler (X-9 / contracts C-1〜C-3)', () => {
  const ID = '11111111-2222-4333-8444-555555555555'
  const REQUEST = {
    source: { kind: 'past', targetKey: 'host#0', conversationId: ID },
    config: CONFIG
  }
  const LAUNCHING = { status: 'launching', sessionId: 'sid', port: {} as MessagePortMain } as const

  describe('handleResolvePastResume', () => {
    it('既知の対象と UUID なら 3 つの id だけを返す', async () => {
      const { deps: d, calls } = deps()
      const out = await handleResolvePastResume(d, ['host#0', ID])
      expect(out).toEqual({ ok: true, folderId: 'f1', runtimeId: 'host', providerId: null })
      expect(calls.resolves).toEqual([{ targetKey: 'host#0', conversationId: ID }])
    })

    it.each([
      ['未知の targetKey', ['nope#0', ID]],
      ['UUID でない', ['host#0', '--resume']],
      ['欠落', []]
    ])('%s は source-unknown で、解決を呼ばない', async (_l, args) => {
      const { deps: d, calls } = deps()
      expect(await handleResolvePastResume(d, args as readonly unknown[])).toEqual({
        ok: false,
        reason: 'source-unknown'
      })
      expect(calls.resolves).toEqual([])
    })

    it('決まらない行の理由のキーだけを返す', async () => {
      const { deps: d } = deps(undefined, {
        resolvePastResume: async () => ({ ok: false, reason: 'cwd-mismatch' })
      })
      expect(await handleResolvePastResume(d, ['host#0', ID])).toEqual({
        ok: false,
        reason: 'cwd-mismatch'
      })
    })
  })

  describe('handleResumeSession', () => {
    it('形の不正な要求は invalid-config で、起動も記録もしない', async () => {
      const { deps: d, calls } = deps()
      for (const bad of [
        null,
        { ...REQUEST, extra: 1 },
        { ...REQUEST, source: { kind: 'past', targetKey: 'nope#0', conversationId: ID } },
        { ...REQUEST, source: { kind: 'live', sessionId: 'x' } },
        { ...REQUEST, config: { ...CONFIG, folderId: '' } }
      ]) {
        expect(await handleResumeSession(d, [bad, 'manual'])).toEqual({
          status: 'rejected',
          reason: 'invalid-config'
        })
      }
      expect(calls.resumes).toEqual([])
      expect(calls.usageRecords).toEqual([])
    })

    it('受け付けたときだけ起動元を 1 回記録する。拒否・already-running は記録しない', async () => {
      const accepted = deps(undefined, { resumeSession: async () => LAUNCHING })
      await handleResumeSession(accepted.deps, [REQUEST, 'preset'])
      expect(accepted.calls.usageRecords).toEqual(['preset'])

      const dup = deps(undefined, {
        resumeSession: async () => ({ status: 'already-running', sessionId: 'sid' })
      })
      await handleResumeSession(dup.deps, [REQUEST, 'manual'])
      const rejected = deps()
      await handleResumeSession(rejected.deps, [REQUEST, 'manual'])
      expect(dup.calls.usageRecords).toEqual([])
      expect(rejected.calls.usageRecords).toEqual([])
    })

    it('起動元が未知でも拒否せず、記録だけを行わない', async () => {
      const { deps: d, calls } = deps(undefined, { resumeSession: async () => LAUNCHING })
      const out = await handleResumeSession(d, [REQUEST, 'Preset'])
      expect(out.status).toBe('launching')
      expect(calls.usageRecords).toEqual([])
    })
  })

  describe('handleGetResumedTranscript', () => {
    it('妥当な sessionId と requestToken で service を呼ぶ', async () => {
      const { deps: d, calls } = deps()
      const out = await handleGetResumedTranscript(d, [ID, 'tok'])
      expect(out.handshake.status).toBe('streaming')
      expect(calls.resumedTranscripts).toEqual([{ sessionId: ID, requestToken: 'tok' }])
    })

    it.each([
      ['sessionId が UUID でない', ['nope', 'tok']],
      ['requestToken が無い', [ID]]
    ])('%s は失敗の handshake で service を呼ばない', async (_l, args) => {
      const { deps: d, calls } = deps()
      const out = await handleGetResumedTranscript(d, args as readonly unknown[])
      expect(out.handshake.status).toBe('failed')
      expect(out.port).toBeNull()
      expect(calls.resumedTranscripts).toEqual([])
    })
  })
})
