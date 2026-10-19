import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * 過去ログの取得で subagent の記録を読む (O-11 BE-033 / AD-055)。SDK は偽物に差し替える。`process.parentPort` が無いので
 * import しても `main()` は何もしない。
 */

const sdk = vi.hoisted(() => ({
  getSessionMessages: vi.fn(),
  listSubagents: vi.fn(),
  getSubagentMessages: vi.fn()
}))
vi.mock('@anthropic-ai/claude-agent-sdk', () => sdk)

import { run } from './read-transcript'

const mainRecords = [
  {
    type: 'assistant',
    uuid: 'm1',
    message: { content: [{ type: 'tool_use', id: 'agent1', name: 'Agent', input: {} }] }
  }
]

function sub(uuid: string): unknown[] {
  return [
    {
      type: 'assistant',
      uuid,
      parent_tool_use_id: 'agent1',
      message: { content: [{ type: 'text', text: `body-${uuid}` }] }
    }
  ]
}

async function readFrame(): Promise<{ kind: string; messages?: unknown[]; reasonKey?: string }> {
  const posted: unknown[] = []
  await run(
    { sessionId: 's-1', requestToken: 'tok' },
    { postMessage: (m: unknown) => posted.push(m) }
  )
  return posted[0] as { kind: string; messages?: unknown[]; reasonKey?: string }
}

describe('read-transcript: subagent の記録 (O-11 BE-033)', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    sdk.getSessionMessages.mockResolvedValue(mainRecords)
    sdk.listSubagents.mockResolvedValue([])
    sdk.getSubagentMessages.mockResolvedValue([])
  })

  it('subagent の記録を親の Agent の呼び出しの children に入れ、dir は渡さず limit: 500 を渡す', async () => {
    sdk.listSubagents.mockResolvedValue(['a-1'])
    sdk.getSubagentMessages.mockResolvedValue(sub('s1'))
    const frame = await readFrame()
    expect(frame.kind).toBe('messages')
    expect(JSON.stringify(frame.messages)).toContain('body-s1')
    expect(sdk.listSubagents).toHaveBeenCalledWith('s-1')
    expect(sdk.getSubagentMessages).toHaveBeenCalledWith('s-1', 'a-1', { limit: 500 })
  })

  it('33 件の agentId で 32 件だけ読み、空・文字列でない agentId は呼ばない', async () => {
    const ids = Array.from({ length: 33 }, (_, i) => `a-${i}`)
    sdk.listSubagents.mockResolvedValue(['', 42, null, ...ids])
    await readFrame()
    expect(sdk.getSubagentMessages).toHaveBeenCalledTimes(32)
    expect(sdk.getSubagentMessages.mock.calls.map((c) => c[1])).toEqual(ids.slice(0, 32))
  })

  it('listSubagents の失敗・配列でない値では過去ログが今どおり (subagent は 0 件)', async () => {
    sdk.listSubagents.mockRejectedValueOnce(new Error('boom'))
    expect((await readFrame()).kind).toBe('messages')
    sdk.listSubagents.mockResolvedValueOnce('not-an-array')
    const frame = await readFrame()
    expect(frame.kind).toBe('messages')
    expect(sdk.getSubagentMessages).not.toHaveBeenCalled()
  })

  it('1 件の getSubagentMessages の失敗・空はその subagent だけ捨て、過去ログ全体を失敗にしない', async () => {
    sdk.listSubagents.mockResolvedValue(['a-1', 'a-2', 'a-3'])
    sdk.getSubagentMessages.mockImplementation(async (_s: string, agentId: string) => {
      if (agentId === 'a-1') throw new Error('boom')
      if (agentId === 'a-2') return []
      return sub('s3')
    })
    const frame = await readFrame()
    expect(frame.kind).toBe('messages')
    expect(JSON.stringify(frame.messages)).toContain('body-s3')
  })

  it('getSessionMessages の失敗は今どおり transcript-read-failed', async () => {
    sdk.getSessionMessages.mockRejectedValue(new Error('boom'))
    const frame = await readFrame()
    expect(frame).toMatchObject({ kind: 'error', reasonKey: 'transcript-read-failed' })
    expect(sdk.listSubagents).not.toHaveBeenCalled()
  })
})
