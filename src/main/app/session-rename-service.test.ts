import { describe, expect, it, vi, type Mock } from 'vitest'

import type { LiveSettingRow } from '@domain/session/live-settings'
import type { SessionRunState } from '@domain/session/run-state'

import type { RenameSpawnResult } from './rename-spawner'
import { createSessionRenameService, type SessionRenameServiceDeps } from './session-rename-service'
import type { ConversationRecord } from './session-launch-service'
import type { TranscriptTargetResolution } from './transcript-service'

/** 改名の調停 (023 BE-034 / SC-004 の main の部分)。I/O は注入の偽の関数。 */

const SID = '00000000-0000-4000-8000-000000000001'
const CONV = '22222222-2222-4222-8222-222222222222'

const rec = (over: Partial<ConversationRecord> = {}): ConversationRecord => ({
  conversationId: CONV,
  folderId: 'f',
  runtimeId: 'host',
  providerId: null,
  targetKey: null,
  ...over
})

const row = (over: Partial<LiveSettingRow> = {}): LiveSettingRow => ({
  state: 'done' as SessionRunState,
  claudeAlive: true,
  hasConversation: true,
  changing: false,
  ...over
})

type Mocked<T> = { [K in keyof T]: T[K] & Mock }

function setup(over: Partial<SessionRenameServiceDeps> = {}): {
  service: ReturnType<typeof createSessionRenameService>
  deps: Mocked<SessionRenameServiceDeps>
} {
  const base: SessionRenameServiceDeps = {
    liveSettingRow: () => row(),
    beginChange: () => true,
    endChange: () => undefined,
    setName: () => undefined,
    conversationRecord: () => rec(),
    resolveTarget: async () => 'host#0',
    transcriptTarget: async (): Promise<TranscriptTargetResolution> => ({
      ok: true,
      configDirEnv: 'CFG-A'
    }),
    buildEnv: (c) => ({ CLAUDE_CONFIG_DIR: c }),
    spawnRename: async (): Promise<RenameSpawnResult> => ({ ok: true }),
    log: () => undefined,
    ...over
  }
  // どの依存も呼ばれ方を数える (差し替えた関数も包む)。
  const deps = Object.fromEntries(
    Object.entries(base).map(([k, f]) => [k, vi.fn(f as (...a: never[]) => unknown)])
  ) as unknown as Mocked<SessionRenameServiceDeps>
  return { service: createSessionRenameService(deps), deps }
}

describe('rename: 受け付け', () => {
  it('応答待ち・中断済みで受ける', async () => {
    for (const state of ['interrupted', 'done'] as const) {
      const { service, deps } = setup({ liveSettingRow: () => row({ state }) })
      expect(await service.rename(SID, '調査')).toEqual({ ok: true, name: '調査' })
      expect(deps.spawnRename).toHaveBeenCalledTimes(1)
    }
  })

  it('拒否のときは子を起こさない (状態の表)', async () => {
    const cases: [Partial<LiveSettingRow>, string][] = [
      [{ state: 'running' }, 'turn-running'],
      [{ state: 'awaiting_permission' }, 'turn-running'],
      [{ hasConversation: false }, 'no-conversation'],
      [{ claudeAlive: false }, 'not-running'],
      [{ state: 'idle' }, 'not-running'],
      [{ state: 'error' }, 'not-running'],
      [{ state: 'launching' }, 'not-ready'],
      [{ changing: true }, 'busy']
    ]
    for (const [over, reason] of cases) {
      const { service, deps } = setup({ liveSettingRow: () => row(over) })
      expect(await service.rename(SID, 'x')).toEqual({ ok: false, reason })
      expect(deps.spawnRename).not.toHaveBeenCalled()
      expect(deps.beginChange).not.toHaveBeenCalled()
      expect(deps.endChange).not.toHaveBeenCalled()
    }
  })

  it('未知の行は unknown-session、規則の外の名前は invalid-value', async () => {
    const a = setup({ liveSettingRow: () => null })
    expect(await a.service.rename(SID, 'x')).toEqual({ ok: false, reason: 'unknown-session' })
    const b = setup()
    expect(await b.service.rename(SID, '  ')).toEqual({ ok: false, reason: 'invalid-value' })
    expect(b.deps.spawnRename).not.toHaveBeenCalled()
  })
})

describe('rename: env と列挙対象', () => {
  it('レコードの targetKey があればそれで解く (規則を呼ばない)。子に dir を渡さない', async () => {
    const { service, deps } = setup({ conversationRecord: () => rec({ targetKey: 'wsl#1' }) })
    await service.rename(SID, ' 名前 ')
    expect(deps.resolveTarget).not.toHaveBeenCalled()
    expect(deps.transcriptTarget).toHaveBeenCalledWith('wsl#1')
    expect(deps.spawnRename).toHaveBeenCalledWith(
      { CLAUDE_CONFIG_DIR: 'CFG-A' },
      { conversationId: CONV, name: '名前' }
    )
  })

  it('targetKey が無ければ切り出した規則で決める。WSL と Win32 でそれぞれの config ディレクトリ', async () => {
    for (const cfg of ['\\\\wsl$\\D\\home\\u\\.claude', 'C:\\Users\\y\\.claude']) {
      const { service, deps } = setup({
        transcriptTarget: async () => ({ ok: true, configDirEnv: cfg })
      })
      await service.rename(SID, 'x')
      expect(deps.resolveTarget).toHaveBeenCalledTimes(1)
      expect(deps.spawnRename.mock.calls[0][0]).toEqual({ CLAUDE_CONFIG_DIR: cfg })
      expect(Object.keys(deps.spawnRename.mock.calls[0][1])).toEqual(['conversationId', 'name'])
    }
  })

  it('列挙対象が決まらない・所在が止まっている・未知の対象は write-failed で名前を変えない', async () => {
    const cases: Partial<SessionRenameServiceDeps>[] = [
      { resolveTarget: async () => null },
      { transcriptTarget: async () => ({ ok: false, reasonKey: 'distro-not-running' as never }) },
      { transcriptTarget: async () => null },
      { conversationRecord: () => null }
    ]
    for (const over of cases) {
      const { service, deps } = setup(over)
      expect(await service.rename(SID, 'x')).toEqual({ ok: false, reason: 'write-failed' })
      expect(deps.spawnRename).not.toHaveBeenCalled()
      expect(deps.setName).not.toHaveBeenCalled()
      expect(deps.endChange).toHaveBeenCalledTimes(1)
    }
  })
})

describe('rename: 結果', () => {
  it('成功で setName し、endChange が 1 回', async () => {
    const { service, deps } = setup()
    expect(await service.rename(SID, 'x')).toEqual({ ok: true, name: 'x' })
    expect(deps.setName).toHaveBeenCalledWith(SID, 'x')
    expect(deps.beginChange).toHaveBeenCalledWith(SID, 'name')
    expect(deps.endChange).toHaveBeenCalledTimes(1)
    expect(deps.endChange).toHaveBeenCalledWith(SID, 'name')
  })

  it('子の { ok: false } / 期限は write-failed で名前は元のまま、endChange が 1 回', async () => {
    const { service, deps } = setup({
      spawnRename: async () => ({ ok: false, reason: 'write-failed' })
    })
    expect(await service.rename(SID, 'x')).toEqual({ ok: false, reason: 'write-failed' })
    expect(deps.setName).not.toHaveBeenCalled()
    expect(deps.endChange).toHaveBeenCalledTimes(1)
  })

  it('子が投げても endChange が呼ばれ write-failed', async () => {
    const { service, deps } = setup({
      spawnRename: async () => {
        throw new Error('boom')
      }
    })
    expect(await service.rename(SID, 'x')).toEqual({ ok: false, reason: 'write-failed' })
    expect(deps.endChange).toHaveBeenCalledTimes(1)
  })

  it('子の結果の前は endChange が呼ばれない (保留の間はプロンプトが届かない)', async () => {
    let finish: (r: RenameSpawnResult) => void = () => {}
    const { service, deps } = setup({
      spawnRename: () => new Promise<RenameSpawnResult>((r) => (finish = r))
    })
    const p = service.rename(SID, 'x')
    await vi.waitFor(() => expect(deps.beginChange).toHaveBeenCalled())
    await Promise.resolve()
    expect(deps.endChange).not.toHaveBeenCalled()
    finish({ ok: true })
    await p
    expect(deps.endChange).toHaveBeenCalledTimes(1)
  })

  it('ログは成功と失敗の 1 行だけで、名前・会話の id・config ディレクトリを含まない', async () => {
    const ok = setup()
    await ok.service.rename(SID, '秘密の名前')
    const ng = setup({ spawnRename: async () => ({ ok: false, reason: 'write-failed' }) })
    await ng.service.rename(SID, '秘密の名前')
    expect(ok.deps.log.mock.calls).toEqual([['[session] rename ok']])
    expect(ng.deps.log.mock.calls).toEqual([['[session] rename failed']])
  })
})
