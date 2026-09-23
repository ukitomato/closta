import { describe, expect, it } from 'vitest'

import { MAX_SESSIONS_PER_TARGET } from '@domain/validation'

import {
  createRequestHandler,
  enumerate,
  toRecord,
  type EnumerateDeps,
  type ListSessionsOptionsLike,
  type SdkSessionLike
} from './enumerate'
import { PROTOCOL_VERSION, type EnumerationResponseLine } from './protocol'

/**
 * BE-023b — 列挙の本体 (AD-030 / contracts C-1 〜 C-4)。
 *
 * **ここは SDK を呼ぶ唯一の経路の論理であり、以前は 196 行が丸ごと無検証だった**
 * (code-gate iteration 1 / test track)。
 * 読み込めなかった理由は `electron` ではなく (a) SDK の実 import、
 * (b) 末尾の `main()` 即時実行、(c) 未 export の 3 点で、いずれも注入で解けた。
 *
 * 固定するのは**壊れたときに実行時まで気付けない**不変条件である。
 * 特に差集合の `offset` / `limit` の算術は、1 文字の変更で静かに別範囲を見る。
 */

function sdkSession(overrides: Partial<SdkSessionLike> = {}): SdkSessionLike {
  return { sessionId: 's-1', lastModified: 1, ...overrides }
}

/** 呼び出しを記録する代役。**引数をそのまま残す** — 算術を見るためである。 */
function recorder(answer: (options: ListSessionsOptionsLike) => readonly SdkSessionLike[]): {
  deps: EnumerateDeps
  calls: ListSessionsOptionsLike[]
  configDirs: string[]
} {
  const calls: ListSessionsOptionsLike[] = []
  const configDirs: string[] = []
  return {
    calls,
    configDirs,
    deps: {
      listSessions: async (options) => {
        calls.push(options)
        return answer(options)
      },
      setConfigDir: (dir) => configDirs.push(dir)
    }
  }
}

function request(overrides: Record<string, unknown> = {}): {
  kind: 'enumerate'
  version: number
  id: number
  targetKey: string
  configDir: string
  scope: { kind: 'all' } | { kind: 'page'; limit: number; offset: number }
} {
  return {
    kind: 'enumerate',
    version: PROTOCOL_VERSION,
    id: 1,
    targetKey: 'host#0',
    configDir: 'C:\\Users\\y\\.claude',
    scope: { kind: 'all' },
    ...overrides
  } as never
}

describe('enumerate — config ディレクトリ', () => {
  it('受け取った値を**加工せず**設定する (AD-028 §3 規則 2)', async () => {
    const { deps, configDirs } = recorder(() => [])

    await enumerate(deps, request({ configDir: '\\\\wsl.localhost\\Ubuntu\\home\\y\\.claude' }))

    expect(configDirs).toEqual(['\\\\wsl.localhost\\Ubuntu\\home\\y\\.claude'])
  })

  it('列挙より前に設定する (設定し忘れると別のディレクトリを読む)', async () => {
    const order: string[] = []
    const deps: EnumerateDeps = {
      listSessions: async () => {
        order.push('list')
        return []
      },
      setConfigDir: () => order.push('set')
    }

    await enumerate(deps, request())

    expect(order[0]).toBe('set')
  })
})

describe('enumerate — 打ち切りの判定', () => {
  it('全件では**上限 + 1 件**を要求する', async () => {
    const { deps, calls } = recorder(() => [])

    await enumerate(deps, request({ scope: { kind: 'all' } }))

    expect(calls[0]).toMatchObject({ limit: MAX_SESSIONS_PER_TARGET + 1, offset: 0 })
  })

  it('ちょうど上限件なら打ち切りと報告しない', async () => {
    const exactly = Array.from({ length: MAX_SESSIONS_PER_TARGET }, (_, i) =>
      sdkSession({ sessionId: `s-${i}` })
    )
    const { deps } = recorder(() => exactly)

    const response = await enumerate(deps, request())

    expect(response).toMatchObject({ kind: 'ok', truncated: false })
    expect(response.kind === 'ok' && response.sessions.length).toBe(MAX_SESSIONS_PER_TARGET)
  })

  it('上限を超えたら打ち切りと報告し、上限件まで削る (FR-038)', async () => {
    const over = Array.from({ length: MAX_SESSIONS_PER_TARGET + 1 }, (_, i) =>
      sdkSession({ sessionId: `s-${i}` })
    )
    const { deps } = recorder(() => over)

    const response = await enumerate(deps, request())

    expect(response).toMatchObject({ kind: 'ok', truncated: true })
    expect(response.kind === 'ok' && response.sessions.length).toBe(MAX_SESSIONS_PER_TARGET)
  })

  it('先頭ページでは要求された窓をそのまま渡す', async () => {
    const { deps, calls } = recorder(() => [])

    await enumerate(deps, request({ scope: { kind: 'page', limit: 50, offset: 100 } }))

    expect(calls[0]).toMatchObject({ limit: 50, offset: 100 })
  })
})

describe('enumerate — programmatic の差集合', () => {
  it('除外側は **`offset` 0 / `limit` = `offset + limit`** で要求する', async () => {
    /*
     * **この算術が壊れると静かにずれる。**
     * 2 つの結果は同じ順序で並び、除外側は既定側の部分列であるため、
     * 既定側の先頭 `offset + limit` 件の所属は除外側の先頭 `offset + limit` 件で決まる。
     * 除外側にも同じ `offset` を渡すと、落ちた件数だけ窓がずれて別の範囲を見る。
     */
    const { deps, calls } = recorder(() => [])

    await enumerate(deps, request({ scope: { kind: 'page', limit: 50, offset: 100 } }))

    expect(calls).toHaveLength(2)
    expect(calls[1]).toMatchObject({ includeProgrammatic: false, limit: 150, offset: 0 })
  })

  it('除外側に現れない識別子を programmatic と判定する', async () => {
    const plain = sdkSession({ sessionId: 'plain' })
    const sdkOrigin = sdkSession({ sessionId: 'sdk' })
    const { deps } = recorder((options) =>
      options.includeProgrammatic === false ? [plain] : [plain, sdkOrigin]
    )

    const response = await enumerate(deps, request())

    expect(response.kind).toBe('ok')
    if (response.kind !== 'ok') return
    expect(response.sessions.map((s) => [s.sessionId, s.programmatic])).toEqual([
      ['plain', false],
      ['sdk', true]
    ])
  })

  it('除外側が空でも落ちない (全件が programmatic な config ディレクトリ)', async () => {
    const { deps } = recorder((options) =>
      options.includeProgrammatic === false ? [] : [sdkSession()]
    )

    const response = await enumerate(deps, request())

    expect(response.kind === 'ok' && response.sessions[0].programmatic).toBe(true)
  })
})

describe('toRecord', () => {
  it('省略された項目を `null` にする (`undefined` はキーごと消える)', () => {
    const record = toRecord(sdkSession(), false)

    /* **`JSON.stringify` を通しても項目が残ることが要点である。** */
    const parsed = JSON.parse(JSON.stringify(record)) as Record<string, unknown>

    for (const key of [
      'summary',
      'firstPrompt',
      'customTitle',
      'createdAt',
      'fileSize',
      'gitBranch',
      'tag',
      'cwd'
    ]) {
      expect(Object.hasOwn(parsed, key)).toBe(true)
      expect(parsed[key]).toBeNull()
    }
  })

  it('値があればそのまま写す (**正規化しない**。FR-049 は main 側)', () => {
    const record = toRecord(
      sdkSession({ summary: '  空白つき  ', cwd: '\\\\wsl.localhost\\Ubuntu\\home\\y\\p' }),
      true
    )

    expect(record.summary).toBe('  空白つき  ')
    expect(record.cwd).toBe('\\\\wsl.localhost\\Ubuntu\\home\\y\\p')
    expect(record.programmatic).toBe(true)
  })

  it('数値を検査しない (アプリ外の値であり型注釈は保証にならない)', () => {
    const record = toRecord(sdkSession({ lastModified: 'not a number' }), false)

    expect(record.lastModified).toBe('not a number')
  })
})

describe('createRequestHandler — 直列処理', () => {
  it('要求を**直列に**処理する (env を踏み合わせない。AD-030 §3)', async () => {
    /*
     * **この不変条件が壊れると 2 要求が env を踏み合い、
     * 片方が他方の config ディレクトリを列挙する。** 型も lint も見ない。
     */
    const order: string[] = []
    let release = (): void => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })

    const deps: EnumerateDeps = {
      setConfigDir: (dir) => order.push(`set:${dir}`),
      listSessions: async () => {
        order.push('list')
        if (order.filter((o) => o === 'list').length === 1) await gate
        return []
      }
    }

    const written: EnumerationResponseLine[] = []
    const handler = createRequestHandler(deps, (response) => written.push(response))

    handler.handle(JSON.stringify(request({ id: 1, configDir: 'A' })))
    handler.handle(JSON.stringify(request({ id: 2, configDir: 'B' })))

    /* 1 本目が止まっているあいだ、2 本目は**設定にも到達していない**。 */
    await Promise.resolve()
    await Promise.resolve()
    expect(order).toEqual(['set:A', 'list'])

    release()
    await handler.drain()

    /* **A の処理が終わってから B を設定している。** */
    expect(order.indexOf('set:B')).toBeGreaterThan(order.indexOf('list'))
    expect(written.map((r) => r.id)).toEqual([1, 2])
  })

  it('応答を要求の順に返す', async () => {
    const { deps } = recorder(() => [])
    const written: EnumerationResponseLine[] = []
    const handler = createRequestHandler(deps, (response) => written.push(response))

    handler.handle(JSON.stringify(request({ id: 7 })))
    handler.handle(JSON.stringify(request({ id: 8 })))
    handler.handle(JSON.stringify(request({ id: 9 })))
    await handler.drain()

    expect(written.map((r) => r.id)).toEqual([7, 8, 9])
  })
})

describe('createRequestHandler — 失敗の扱い', () => {
  it('形の合わない要求に理由キーを返す (**黙って捨てない**)', () => {
    const { deps } = recorder(() => [])
    const written: EnumerationResponseLine[] = []

    createRequestHandler(deps, (response) => written.push(response)).handle('not json')

    /* 識別子が読めないので `id` は 0、`targetKey` は不透明な固定値である。 */
    expect(written).toEqual([
      {
        kind: 'error',
        version: PROTOCOL_VERSION,
        id: 0,
        targetKey: 'unknown',
        reasonKey: 'enumeration-failed'
      }
    ])
  })

  it('SDK の例外を理由キーに落とす (**メッセージを流さない**。C-5)', async () => {
    /*
     * SDK の例外メッセージは UNC の完全パス (= ディストロ名 + Linux ユーザ名) を
     * 含みうるため、そのまま親へ流してはならない。
     */
    const secret = '\\\\wsl.localhost\\Ubuntu\\home\\secret-user\\.claude が読めない'
    const deps: EnumerateDeps = {
      setConfigDir: () => {},
      listSessions: async () => {
        throw new Error(secret)
      }
    }
    const written: EnumerationResponseLine[] = []
    const handler = createRequestHandler(deps, (response) => written.push(response))

    handler.handle(JSON.stringify(request({ id: 5, targetKey: 'wsl:Ubuntu#0' })))
    await handler.drain()

    expect(written).toEqual([
      {
        kind: 'error',
        version: PROTOCOL_VERSION,
        id: 5,
        targetKey: 'wsl:Ubuntu#0',
        reasonKey: 'enumeration-failed'
      }
    ])
    expect(JSON.stringify(written)).not.toContain('secret-user')
  })

  it('1 件の失敗が次の要求を止めない', async () => {
    let first = true
    const deps: EnumerateDeps = {
      setConfigDir: () => {},
      listSessions: async () => {
        if (first) {
          first = false
          throw new Error('一度だけ失敗する')
        }
        return []
      }
    }
    const written: EnumerationResponseLine[] = []
    const handler = createRequestHandler(deps, (response) => written.push(response))

    handler.handle(JSON.stringify(request({ id: 1 })))
    handler.handle(JSON.stringify(request({ id: 2 })))
    await handler.drain()

    expect(written.map((r) => r.kind)).toEqual(['error', 'ok'])
  })
})
