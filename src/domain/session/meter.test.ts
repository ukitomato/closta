import { describe, expect, it } from 'vitest'

import {
  ASSISTANT_ERROR_KEYS,
  contextTokensOf,
  decodeMeterUpdate,
  isMeterModelId,
  isValidTaskId,
  isValidToolUseId,
  MAX_METER_MODELS,
  METER_UPDATE_TYPES,
  PERMISSION_MODE_KEYS,
  RATE_LIMIT_STATUSES,
  RATE_LIMIT_TYPES,
  toAssistantErrorKey,
  toContextWindow,
  toCostUsd,
  toCount,
  toModelMeters,
  toPermissionModeKey,
  toRateLimitStatus,
  toRateLimitType,
  toResetsAtSec,
  toSeconds,
  toUtilizationPct
} from './meter'

/** O-4 BE-001 — `meter` の形と値の検証 (data-model §2「形」「値の検証」)。どれも例外を出さない (SC-002)。 */

const PROTO_KEYS = ['__proto__', 'constructor', 'toString', 'hasOwnProperty', 'valueOf']

const BEDROCK_ARN =
  'arn:aws:bedrock:us-east-1:123456789012:inference-profile/us.anthropic.claude-sonnet-4-5-v1:0'

describe('数の検証', () => {
  it('トークン・回数は安全な整数で 0 以上、外れたら 0', () => {
    expect(toCount(0)).toBe(0)
    expect(toCount(-0)).toBe(0)
    expect(toCount(42)).toBe(42)
    expect(toCount(Number.MAX_SAFE_INTEGER)).toBe(Number.MAX_SAFE_INTEGER)
    const bad = [
      Number.NaN,
      -1,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      Number.MAX_SAFE_INTEGER + 2,
      1.5,
      '3',
      null,
      undefined,
      {}
    ]
    for (const raw of bad) expect(toCount(raw)).toBe(0)
  })

  it('秒は Math.floor してから同じ規則', () => {
    expect(toSeconds(3.9)).toBe(3)
    expect(toSeconds(0.2)).toBe(0)
    expect(toSeconds(-0.5)).toBe(0)
    expect(toSeconds(Number.NaN)).toBe(0)
    expect(toSeconds(Number.POSITIVE_INFINITY)).toBe(0)
    expect(toSeconds('1')).toBe(0)
  })

  it('費用は有限で 0〜1e6、外れたら 0', () => {
    expect(toCostUsd(0.1234)).toBe(0.1234)
    expect(toCostUsd(1e6)).toBe(1e6)
    expect(toCostUsd(-0)).toBe(0)
    for (const raw of [1e6 + 1, -0.01, Number.NaN, Number.POSITIVE_INFINITY, '1']) {
      expect(toCostUsd(raw)).toBe(0)
    }
  })

  it('contextWindow は 0 より大きく 1e8 以下の整数、外れたら 0', () => {
    expect(toContextWindow(200_000)).toBe(200_000)
    expect(toContextWindow(1e8)).toBe(1e8)
    for (const raw of [0, 1e8 + 1, -1, 1.5, Number.NaN, '200000']) {
      expect(toContextWindow(raw)).toBe(0)
    }
  })

  it('utilization は 0〜1 なら ×100、1〜100 ならそのまま、それ以外は null', () => {
    expect(toUtilizationPct(0)).toBe(0)
    expect(toUtilizationPct(0.5)).toBe(50)
    expect(toUtilizationPct(1)).toBe(100)
    expect(toUtilizationPct(42)).toBe(42)
    expect(toUtilizationPct(100)).toBe(100)
    for (const raw of [100.5, 1e9, -0.1, Number.NaN, Number.POSITIVE_INFINITY, '50', undefined]) {
      expect(toUtilizationPct(raw)).toBeNull()
    }
  })

  it('resetsAt は epoch 秒 (1e9〜1e11)。超えたら ms とみなして 1000 で割り、範囲外は null', () => {
    expect(toResetsAtSec(1_760_000_000)).toBe(1_760_000_000)
    expect(toResetsAtSec(1_760_000_000_123)).toBe(1_760_000_000)
    expect(toResetsAtSec(1_760_000_000.9)).toBe(1_760_000_000)
    for (const raw of [1e300, 5e8, 0, -1, Number.NaN, Number.POSITIVE_INFINITY, '1760000000']) {
      expect(toResetsAtSec(raw)).toBeNull()
    }
  })
})

describe('id の検証', () => {
  it('toolUseId / taskId は ^[A-Za-z0-9_-]{1,128}$', () => {
    expect(isValidToolUseId('toolu_01ABC-def')).toBe(true)
    expect(isValidToolUseId('a'.repeat(128))).toBe(true)
    expect(isValidTaskId('task_1')).toBe(true)
    for (const raw of ['', 'a'.repeat(129), 'a b', 'a/b', 'a.b', 'a\nb', 42, null]) {
      expect(isValidToolUseId(raw)).toBe(false)
      expect(isValidTaskId(raw)).toBe(false)
    }
  })

  it('modelId: URL と scheme の無い userinfo の資格情報の形・//・長すぎ・- 始まり・秘密の形を落とす', () => {
    const bad = [
      'https://u:p@h/m',
      'u:p@h/m',
      'a//b',
      'm'.repeat(129),
      '-model',
      'sk-ant-api03-abcdef',
      'ghp_abcdef',
      '',
      42,
      null
    ]
    for (const raw of bad) expect(isMeterModelId(raw)).toBe(false)
  })

  it('modelId: 起動の設定が受け付ける形 ([1m]・_・Bedrock の ARN・Vertex の model@date) は落とさない', () => {
    const good = [
      'claude-sonnet-4-5[1m]',
      'claude_opus_4_1',
      BEDROCK_ARN,
      'claude-sonnet-4-5@20250929',
      'claude-opus-4-1-20250805'
    ]
    for (const raw of good) expect(isMeterModelId(raw)).toBe(true)
  })
})

describe('列挙の照合 (Object.create(null) + Object.hasOwn)', () => {
  it('列挙の値はそのまま、prototype のキーと知らない値は unknown / null', () => {
    for (const mode of PERMISSION_MODE_KEYS) expect(toPermissionModeKey(mode)).toBe(mode)
    for (const key of ASSISTANT_ERROR_KEYS) expect(toAssistantErrorKey(key)).toBe(key)
    for (const s of RATE_LIMIT_STATUSES) expect(toRateLimitStatus(s)).toBe(s)
    for (const t of RATE_LIMIT_TYPES) expect(toRateLimitType(t)).toBe(t)
    for (const raw of [...PROTO_KEYS, 'exploded', '', 1, null, undefined, {}]) {
      expect(toPermissionModeKey(raw)).toBe('unknown')
      expect(toAssistantErrorKey(raw)).toBeNull()
      expect(toRateLimitStatus(raw)).toBeNull()
      expect(toRateLimitType(raw)).toBeNull()
    }
  })

  it('値域の件数 (権限モード 6 + unknown / 状態 3 / 種類 6 / assistant の error 13)', () => {
    expect(PERMISSION_MODE_KEYS).toHaveLength(7)
    expect(RATE_LIMIT_STATUSES).toHaveLength(3)
    expect(RATE_LIMIT_TYPES).toHaveLength(6)
    expect(ASSISTANT_ERROR_KEYS).toHaveLength(13)
  })

  it('METER_UPDATE_TYPES の集合は 9 つ (O-4 の 6 + O-5 の 2 + O-6 の retraction)。集合を変えるには ADR が要る (AD-047 / AD-048 / AD-049)', () => {
    expect(METER_UPDATE_TYPES).toHaveLength(9)
    expect(new Set(METER_UPDATE_TYPES)).toEqual(
      new Set([
        'turn',
        'context',
        'rate-limit',
        'permission-mode',
        'thinking',
        'tool-elapsed',
        'init-report',
        'commands',
        'retraction'
      ])
    )
  })
})

describe('retraction の decoder (O-6 / AD-049 Decision 2)', () => {
  it('正例: id の列を通し、余分なキーを運ばない', () => {
    expect(decodeMeterUpdate({ type: 'retraction', messageIds: ['a', 'b-1'], extra: 'x' })).toEqual(
      {
        type: 'retraction',
        messageIds: ['a', 'b-1']
      }
    )
  })

  it('配列でない・0 件・129 件以上は meter ごと捨てる。128 件は通る', () => {
    expect(decodeMeterUpdate({ type: 'retraction', messageIds: 'a' })).toBeNull()
    expect(decodeMeterUpdate({ type: 'retraction' })).toBeNull()
    expect(decodeMeterUpdate({ type: 'retraction', messageIds: [] })).toBeNull()
    const ids = (n: number): string[] => Array.from({ length: n }, (_, i) => `m${i}`)
    expect(decodeMeterUpdate({ type: 'retraction', messageIds: ids(129) })).toBeNull()
    const ok = decodeMeterUpdate({ type: 'retraction', messageIds: ids(128) })
    expect(ok?.type === 'retraction' && ok.messageIds.length).toBe(128)
  })

  it('形の外れた id は 1 件ずつ捨てる', () => {
    expect(
      decodeMeterUpdate({
        type: 'retraction',
        messageIds: ['ok', 'a b', '', 7, null, 'x'.repeat(129), 'also_ok']
      })
    ).toEqual({ type: 'retraction', messageIds: ['ok', 'also_ok'] })
  })
})

describe('toModelMeters (result の modelUsage)', () => {
  const usage = (n: number): Record<string, unknown> => ({
    inputTokens: n,
    outputTokens: n + 1,
    cacheReadInputTokens: n + 2,
    cacheCreationInputTokens: n + 3,
    costUSD: 0.5,
    contextWindow: 200_000,
    webSearchRequests: 99,
    maxOutputTokens: 'SECRET_MARK'
  })

  it('許可した 6 つの値だけを読み、id を検証で落とした行を除く', () => {
    const out = toModelMeters({
      'claude-sonnet-4-5[1m]': usage(10),
      'https://u:p@h/m': usage(1),
      'u:p@h/m': usage(1),
      ['__proto__']: usage(1),
      'claude-haiku-4-5': { inputTokens: -1, outputTokens: 'x', costUSD: 1e300, contextWindow: 0 }
    })
    expect(out).toEqual([
      {
        modelId: 'claude-sonnet-4-5[1m]',
        input: 10,
        output: 11,
        cacheRead: 12,
        cacheCreation: 13,
        costUsd: 0.5,
        contextWindow: 200_000
      },
      {
        modelId: 'claude-haiku-4-5',
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheCreation: 0,
        costUsd: 0,
        contextWindow: 0
      }
    ])
    expect(JSON.stringify(out)).not.toMatch(/SECRET_MARK|99/)
  })

  it(`${MAX_METER_MODELS + 1} 件で ${MAX_METER_MODELS} 件`, () => {
    const raw: Record<string, unknown> = {}
    for (let i = 0; i < MAX_METER_MODELS + 1; i++) raw[`model-${i}`] = usage(i)
    expect(toModelMeters(raw)).toHaveLength(MAX_METER_MODELS)
  })

  it('record でなければ空', () => {
    for (const raw of [null, undefined, 'x', 1, [usage(1)]]) expect(toModelMeters(raw)).toEqual([])
  })
})

describe('contextTokensOf (主ループの assistant の message.usage)', () => {
  it('入力側の 3 つの和。出力側は読まない', () => {
    const usage = {
      input_tokens: 10,
      cache_read_input_tokens: 200,
      cache_creation_input_tokens: 3_000,
      output_tokens: 99_999
    }
    expect(contextTokensOf(usage)).toBe(3_210)
  })

  it('欠けた値・外れた値は 0 として足し、和が安全な整数でない・record でなければ null', () => {
    expect(contextTokensOf({ input_tokens: 5, cache_read_input_tokens: Number.NaN })).toBe(5)
    const huge = {
      input_tokens: Number.MAX_SAFE_INTEGER,
      cache_read_input_tokens: Number.MAX_SAFE_INTEGER
    }
    expect(contextTokensOf(huge)).toBeNull()
    for (const raw of [null, undefined, 'x', 1]) expect(contextTokensOf(raw)).toBeNull()
  })
})

describe('decodeMeterUpdate', () => {
  it('turn: 検証した値だけで組み直し、余分なキーと id の外れた行を運ばない', () => {
    const out = decodeMeterUpdate({
      type: 'turn',
      costUsd: 1.25,
      turns: 3,
      models: [
        {
          modelId: 'claude-sonnet-4-5',
          input: 1,
          output: 2,
          cacheRead: 3,
          cacheCreation: 4,
          costUsd: 0.5,
          contextWindow: 200_000,
          extra: 'SECRET_MARK'
        },
        { modelId: 'u:p@h/m', input: 1 }
      ],
      permissionDenials: 2,
      errors: ['SECRET_MARK']
    })
    expect(out).toEqual({
      type: 'turn',
      costUsd: 1.25,
      turns: 3,
      models: [
        {
          modelId: 'claude-sonnet-4-5',
          input: 1,
          output: 2,
          cacheRead: 3,
          cacheCreation: 4,
          costUsd: 0.5,
          contextWindow: 200_000
        }
      ],
      permissionDenials: 2
    })
    expect(JSON.stringify(out)).not.toContain('SECRET_MARK')
  })

  it('rate-limit: 許可した値だけを運ぶ', () => {
    const out = decodeMeterUpdate({
      type: 'rate-limit',
      status: 'allowed_warning',
      limitType: 'five_hour',
      utilizationPct: 85,
      resetsAtSec: 1_760_000_000,
      usingOverage: true,
      errorCode: 'SECRET_MARK'
    })
    expect(out).toEqual({
      type: 'rate-limit',
      status: 'allowed_warning',
      limitType: 'five_hour',
      utilizationPct: 85,
      resetsAtSec: 1_760_000_000,
      usingOverage: true
    })
  })

  it('context / permission-mode / thinking / tool-elapsed', () => {
    const context = decodeMeterUpdate({ type: 'context', usedTokens: 1234, x: 'SECRET_MARK' })
    expect(context).toEqual({ type: 'context', usedTokens: 1234 })
    const mode = decodeMeterUpdate({ type: 'permission-mode', mode: 'plan', x: 1 })
    expect(mode).toEqual({ type: 'permission-mode', mode: 'plan' })
    const thinking = decodeMeterUpdate({ type: 'thinking', estimatedTokens: 512 })
    expect(thinking).toEqual({ type: 'thinking', estimatedTokens: 512 })
    const tool = decodeMeterUpdate({ type: 'tool-elapsed', toolUseId: 't1', elapsedSeconds: 7.8 })
    expect(tool).toEqual({ type: 'tool-elapsed', toolUseId: 't1', elapsedSeconds: 7 })
  })

  it('値の外れは型の規則で倒す (数は 0・割合と時刻は null・mode は unknown・limitType は null)', () => {
    const rateLimit = decodeMeterUpdate({
      type: 'rate-limit',
      status: 'rejected',
      limitType: '__proto__',
      utilizationPct: 1e9,
      resetsAtSec: 1e300,
      usingOverage: 'yes'
    })
    expect(rateLimit).toEqual({
      type: 'rate-limit',
      status: 'rejected',
      limitType: null,
      utilizationPct: null,
      resetsAtSec: null,
      usingOverage: false
    })
    const mode = decodeMeterUpdate({ type: 'permission-mode', mode: 'constructor' })
    expect(mode).toEqual({ type: 'permission-mode', mode: 'unknown' })
    const context = decodeMeterUpdate({ type: 'context', usedTokens: -5 })
    expect(context).toEqual({ type: 'context', usedTokens: 0 })
    const turn = decodeMeterUpdate({ type: 'turn', costUsd: 'x', turns: 1.5, models: 'x' })
    expect(turn).toEqual({ type: 'turn', costUsd: 0, turns: 0, models: [], permissionDenials: 0 })
  })

  it(`models は ${MAX_METER_MODELS} 件まで`, () => {
    const models = Array.from({ length: MAX_METER_MODELS + 1 }, (_, i) => ({
      modelId: `model-${i}`
    }))
    const out = decodeMeterUpdate({ type: 'turn', costUsd: 0, turns: 0, models })
    expect(out?.type === 'turn' ? out.models : []).toHaveLength(MAX_METER_MODELS)
  })

  it('知らない type・status の無い rate-limit・形の外れた toolUseId は null', () => {
    const bad = [
      { type: 'retraction' },
      { type: '__proto__' },
      { type: 'constructor' },
      { type: 'toString' },
      { type: 'rate-limit', status: 'exploded' },
      { type: 'rate-limit' },
      { type: 'tool-elapsed', toolUseId: 'a/b', elapsedSeconds: 1 },
      { type: 'tool-elapsed', toolUseId: 'a'.repeat(129), elapsedSeconds: 1 },
      { type: 'tool-elapsed', toolUseId: 'a b', elapsedSeconds: 1 },
      {},
      [],
      null,
      undefined,
      'turn',
      42
    ]
    for (const raw of bad) expect(decodeMeterUpdate(raw)).toBeNull()
  })

  it('init-report / commands (O-5) を通し、余分なキーを運ばない', () => {
    const init = decodeMeterUpdate({
      type: 'init-report',
      model: 'claude-sonnet-4-5',
      mcpServers: [{ name: 'github', status: 'failed', error: 'SECRET_MARK' }],
      tools: ['Bash'],
      skills: [],
      plugins: [{ name: 'p', version: '1.0.0', path: 'SECRET_MARK' }],
      slashCommands: ['/review'],
      omitted: 0,
      cwd: 'SECRET_MARK'
    })
    expect(init).toEqual({
      type: 'init-report',
      model: 'claude-sonnet-4-5',
      mcpServers: [{ name: 'github', status: 'failed' }],
      tools: ['Bash'],
      skills: [],
      plugins: [{ name: 'p', version: '1.0.0' }],
      slashCommands: ['review'],
      omitted: 0
    })
    const commands = decodeMeterUpdate({
      type: 'commands',
      commands: [
        { name: 'review', description: 'd', argumentHint: '<pr>', aliases: ['SECRET_MARK'] }
      ],
      omitted: 0,
      extra: 'SECRET_MARK'
    })
    expect(commands).toEqual({
      type: 'commands',
      commands: [{ name: 'review', description: 'd', argumentHint: '<pr>' }],
      omitted: 0
    })
    expect(JSON.stringify([init, commands])).not.toContain('SECRET_MARK')
    expect(decodeMeterUpdate({ type: 'init-report', model: null })).toBeNull()
    expect(decodeMeterUpdate({ type: 'commands', commands: 'x', omitted: 0 })).toBeNull()
  })

  it('JSON.parse した __proto__ のキーを持つ値でも例外を出さない', () => {
    const raw: unknown = JSON.parse(
      '{"type":"turn","__proto__":{"type":"context"},"models":[{"__proto__":{"modelId":"x"}}]}'
    )
    expect(() => decodeMeterUpdate(raw)).not.toThrow()
    expect(decodeMeterUpdate(raw)).toEqual({
      type: 'turn',
      costUsd: 0,
      turns: 0,
      models: [],
      permissionDenials: 0
    })
  })
})
