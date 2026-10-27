import type { MessagePortMain } from 'electron'
import { describe, expect, it } from 'vitest'

import { WIN32_LAUNCH_SPEC_FIXTURE } from '@domain/session/__fixtures__/win32-launch-spec'
import type {
  LaunchInput,
  LaunchQueryOptions,
  RuntimeLaunchSpec,
  SessionControl
} from '@domain/session/agent-session'
import type { EffortLevel, ModelEntry } from '@domain/provider/types'
import type { SessionLaunchConfig } from '@domain/session/launch-config'
import type { SessionStatusUpdate } from '@domain/session/status-update'

import {
  CONTROL_RESULT_TIMEOUT_MS,
  createSessionLaunchService,
  type LaunchPreparation,
  type ResolvedResume,
  type SupervisorConnection,
  type TimerLike
} from './session-launch-service'

/**
 * 複数セッションの起動調停の単体 (X-5 / BE-008・BE-020・BE-021 / SC-001・SC-007・SC-008)。
 * X-1 の「単一セッション不変 (`session-active`)」のテストは、X-5 で上限 10 の規則に書き換えた (AD-043 Decision 3)。
 */

const fakePort = {} as unknown as MessagePortMain
const fakeInput = { options: { permissionMode: 'default' } } as unknown as LaunchInput
const fakeSpec = {} as unknown as RuntimeLaunchSpec

function cfg(folderId = 'f1', runtimeId = 'r1'): SessionLaunchConfig {
  return {
    folderId,
    runtimeId,
    providerId: null,
    modelId: null,
    effort: null,
    permissionMode: 'default'
  }
}

function okPrep(): LaunchPreparation {
  return { ok: true, input: fakeInput, spec: fakeSpec }
}

/** fake の supervisor 接続。launch・control・kill を記録し、supervisor からの通知を手で流す。 */
function fakeConnection(): SupervisorConnection & {
  launches: string[]
  launchOptions: LaunchQueryOptions[]
  controls: [string, SessionControl][]
  generation: number
  killed: number
  failNextLaunch: boolean
  status: (updates: unknown[], generation?: number) => void
  threadEnded: (sessionId: string, generation?: number) => void
  conversation: (sessionId: string, conversationId: string, generation?: number) => void
  controlResult: (sessionId: string, requestId: string, ok: boolean, generation?: number) => void
  exit: (code: number | null, generation?: number) => void
} {
  const statusL: ((g: number, u: readonly unknown[]) => void)[] = []
  const threadL: ((g: number, id: string) => void)[] = []
  const exitL: ((g: number, c: number | null) => void)[] = []
  const convL: ((g: number, id: string, conv: string) => void)[] = []
  const resultL: ((g: number, id: string, requestId: string, ok: boolean) => void)[] = []
  const conn = {
    launches: [] as string[],
    launchOptions: [] as LaunchQueryOptions[],
    controls: [] as [string, SessionControl][],
    generation: 1,
    killed: 0,
    failNextLaunch: false,
    launch(sessionId: string, _spec?: unknown, options?: LaunchQueryOptions) {
      if (conn.failNextLaunch) {
        conn.failNextLaunch = false
        return { ok: false as const }
      }
      conn.launches.push(sessionId)
      if (options !== undefined) conn.launchOptions.push(options)
      return { ok: true as const, port: fakePort, generation: conn.generation }
    },
    control(sessionId: string, control: SessionControl) {
      conn.controls.push([sessionId, control])
    },
    kill() {
      conn.killed += 1
      return true
    },
    onStatusBatch: (l: (g: number, u: readonly unknown[]) => void) => statusL.push(l),
    onThreadEnded: (l: (g: number, id: string) => void) => threadL.push(l),
    onConversation: (l: (g: number, id: string, conv: string) => void) => convL.push(l),
    onControlResult: (l: (g: number, id: string, requestId: string, ok: boolean) => void) =>
      resultL.push(l),
    onExit: (l: (g: number, c: number | null) => void) => exitL.push(l),
    controlResult: (id: string, requestId: string, ok: boolean, generation = conn.generation) =>
      resultL.forEach((l) => l(generation, id, requestId, ok)),
    conversation: (id: string, conv: string, generation = conn.generation) =>
      convL.forEach((l) => l(generation, id, conv)),
    status: (updates: unknown[], generation = conn.generation) =>
      statusL.forEach((l) => l(generation, updates)),
    threadEnded: (id: string, generation = conn.generation) =>
      threadL.forEach((l) => l(generation, id)),
    exit: (code: number | null, generation = conn.generation) =>
      exitL.forEach((l) => l(generation, code))
  }
  return conn
}

function manualTimer(): TimerLike & { fire: () => void; delays: number[] } {
  let fn: (() => void) | null = null
  const delays: number[] = []
  return {
    delays,
    setTimeout(f, ms) {
      fn = f
      delays.push(ms)
      return 1
    },
    clearTimeout() {
      fn = null
    },
    fire() {
      fn?.()
    }
  }
}

interface Setup {
  readonly connection: ReturnType<typeof fakeConnection>
  readonly service: ReturnType<typeof createSessionLaunchService>
  readonly statuses: SessionStatusUpdate[][]
  readonly logs: string[]
  readonly timer: ReturnType<typeof manualTimer>
  readonly resumable: string[]
}

function setup(prepareLaunch: () => Promise<LaunchPreparation> = async () => okPrep()): Setup {
  const connection = fakeConnection()
  const statuses: SessionStatusUpdate[][] = []
  const logs: string[] = []
  const resumable: string[] = []
  const timer = manualTimer()
  let seq = 0
  const service = createSessionLaunchService({
    connection,
    prepareLaunch,
    newSessionId: () => {
      seq += 1
      return `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`
    },
    onStatus: (u) => statuses.push([...u]),
    timer,
    log: (l) => logs.push(l),
    onResumable: (id) => resumable.push(id)
  })
  return { connection, service, statuses, logs, timer, resumable }
}

const upd = (sessionId: string, over: Partial<SessionStatusUpdate> = {}): SessionStatusUpdate => ({
  sessionId,
  state: 'running',
  reasonKey: null,
  claudeAlive: true,
  ...over
})

async function launchN(service: ReturnType<typeof setup>['service'], n: number): Promise<string[]> {
  const ids: string[] = []
  for (let i = 0; i < n; i += 1) {
    const o = await service.launch(cfg())
    if (o.status === 'launching') ids.push(o.sessionId)
  }
  return ids
}

describe('起動と同時実行数の上限 (SC-001)', () => {
  it('稼働中でも 2 本目を起動できる (X-1 の session-active で拒否しない)', async () => {
    const { service, connection } = setup()
    const a = await service.launch(cfg())
    const b = await service.launch(cfg())
    expect(a.status).toBe('launching')
    expect(b.status).toBe('launching')
    expect(connection.launches).toHaveLength(2)
  })

  it('枠を占めるセッションが 10 本なら 11 本目は session-limit で拒否し、supervisor 接続を呼ばない', async () => {
    const { service, connection } = setup()
    await launchN(service, 10)
    const eleventh = await service.launch(cfg())
    expect(eleventh).toEqual({ status: 'rejected', reason: 'session-limit' })
    expect(connection.launches).toHaveLength(10)
  })

  it('Win32 の起動を混ぜても 10 本で 11 本目は session-limit (X-8 / US-1 AC5)', async () => {
    let n = 0
    const { service, connection } = setup(async () => {
      n += 1
      return n % 2 === 0
        ? { ok: true, input: fakeInput, spec: WIN32_LAUNCH_SPEC_FIXTURE }
        : okPrep()
    })
    await launchN(service, 10)
    expect(await service.launch(cfg())).toEqual({ status: 'rejected', reason: 'session-limit' })
    expect(connection.launches).toHaveLength(10)
  })

  it('launching 中 (spawn 前) のセッションも枠に数える', async () => {
    const { service } = setup()
    await launchN(service, 10) // どれも状態通知を受けていない (launching のまま)
    expect((await service.launch(cfg())).status).toBe('rejected')
  })

  it('同時に届いた起動要求でも上限を超えない (予約は await の前)', async () => {
    let release: () => void = () => undefined
    const gate = new Promise<void>((r) => {
      release = r
    })
    const { service, connection } = setup(async () => {
      await gate
      return okPrep()
    })
    const pending = Array.from({ length: 12 }, () => service.launch(cfg()))
    release()
    const outcomes = await Promise.all(pending)
    expect(outcomes.filter((o) => o.status === 'launching')).toHaveLength(10)
    expect(
      outcomes.filter((o) => o.status === 'rejected' && o.reason === 'session-limit')
    ).toHaveLength(2)
    expect(connection.launches).toHaveLength(10)
  })

  it('prepareLaunch の失敗と supervisor の起動失敗では枠が戻る', async () => {
    let fail = true
    const { service, connection } = setup(async () =>
      fail ? { ok: false, reason: 'invalid-config' } : okPrep()
    )
    await launchN(service, 10) // すべて prepareLaunch で失敗
    fail = false
    connection.failNextLaunch = true
    expect(await service.launch(cfg())).toEqual({ status: 'rejected', reason: 'launch-failed' })
    expect(await launchN(service, 10)).toHaveLength(10)
  })

  it('claude が終わったセッション (error / 終了 / 強制終了後) は数えず、応答待ちの done と中断済みは数える', async () => {
    const { service, connection } = setup()
    const ids = await launchN(service, 10)
    connection.status([
      upd(ids[0] as string, { state: 'done' }),
      upd(ids[1] as string, { state: 'interrupted' })
    ])
    expect((await service.launch(cfg())).status).toBe('rejected')
    // 1 本の claude が終わる (child-exited → claudeAlive: false)
    connection.status([upd(ids[2] as string, { state: 'done', claudeAlive: false })])
    expect((await service.launch(cfg())).status).toBe('launching')
  })

  it('起動設定は起動ごとのスナップショットで、2 本の起動は互いに影響しない (FR-006)', async () => {
    const seen: SessionLaunchConfig[] = []
    const svc = createSessionLaunchService({
      connection: fakeConnection(),
      prepareLaunch: async (c) => {
        seen.push(c)
        return okPrep()
      },
      newSessionId: () => crypto.randomUUID(),
      onStatus: () => undefined,
      timer: manualTimer(),
      log: () => undefined
    })
    await svc.launch(cfg('f1', 'r1'))
    await svc.launch({ ...cfg('f2', 'r2'), modelId: 'claude-opus' })
    expect(seen[0]).toEqual(cfg('f1', 'r1'))
    expect(seen[1]?.folderId).toBe('f2')
  })
})

describe('状態通知の受信と relay (SC-004)', () => {
  it('受理した値だけを relay へ渡し、別世代・未知の sessionId・形の崩れは捨てる', async () => {
    const { service, connection, statuses } = setup()
    const [a] = await launchN(service, 1)
    connection.status([
      upd(a as string),
      upd('99999999-9999-4999-8999-999999999999'),
      { bogus: true }
    ])
    connection.status([upd(a as string, { state: 'done' })], 7)
    expect(statuses).toEqual([[upd(a as string)]])
  })

  it('claudeAlive の false→true は registry にも relay にも反映されない', async () => {
    const { service, connection, statuses } = setup()
    const [a] = await launchN(service, 1)
    connection.status([upd(a as string, { claudeAlive: false, state: 'done' })])
    connection.status([upd(a as string, { claudeAlive: true, state: 'running' })])
    expect(statuses.at(-1)?.[0]?.claudeAlive).toBe(false)
  })
})

describe('制御の宛先 (SC-005)', () => {
  it('registry に在り、セッションスレッドが生きている sessionId にだけ送る', async () => {
    const { service, connection } = setup()
    const [a, b] = await launchN(service, 2)
    expect(service.control(a as string, { kind: 'interrupt' })).toBe(true)
    expect(connection.controls).toEqual([[a, { kind: 'interrupt' }]])
    expect(service.control('99999999-9999-4999-8999-999999999999', { kind: 'kill' })).toBe(false)
    connection.threadEnded(b as string)
    expect(service.control(b as string, { kind: 'send-prompt', text: 'x' })).toBe(false)
  })

  it('end は該当セッションだけに渡り、スレッド終了後は送らない (BE-011 / FR-011)', async () => {
    const { service, connection } = setup()
    const [a, b] = await launchN(service, 2)
    expect(service.control(b as string, { kind: 'end' })).toBe(true)
    expect(connection.controls).toEqual([[b, { kind: 'end' }]])
    connection.threadEnded(a as string)
    expect(service.control(a as string, { kind: 'end' })).toBe(false)
    expect(connection.controls).toHaveLength(1)
  })
})

describe('supervisor の異常終了 (SC-007 / FR-013)', () => {
  it('その世代の全セッションが supervisor-exited になり、枠が戻り、原因の 1 行が記録される', async () => {
    const { service, connection, statuses, logs } = setup()
    const ids = await launchN(service, 10)
    connection.exit(1)
    expect(statuses.at(-1)).toHaveLength(10)
    expect(
      statuses.at(-1)?.every((u) => u.reasonKey === 'supervisor-exited' && !u.claudeAlive)
    ).toBe(true)
    expect(logs).toEqual(['[supervisor] exited code=1 generation=1 sessions=10'])
    // 会話由来の文字列・env を含まない
    expect(logs[0]).not.toMatch(/ANTHROPIC|prompt|SystemRoot/)
    expect(service.control(ids[0] as string, { kind: 'interrupt' })).toBe(false)
    expect((await service.launch(cfg())).status).toBe('launching')
  })

  it('exit と同時に新しい世代で起動したセッションには supervisor-exited を付けない', async () => {
    const { service, connection, statuses } = setup()
    const [old] = await launchN(service, 1)
    connection.generation = 2
    const [fresh] = await launchN(service, 1)
    connection.exit(1, 1)
    const exited = statuses.at(-1) ?? []
    expect(exited.map((u) => u.sessionId)).toEqual([old])
    expect(service.control(fresh as string, { kind: 'interrupt' })).toBe(true)
  })
})

describe('killAll と終了処理 (SC-008 / FR-014)', () => {
  it('killAll は全セッションに kill を送り、supervisor は止めない', async () => {
    const { service, connection } = setup()
    const [a, b] = await launchN(service, 2)
    expect(service.killAll()).toBe(2)
    expect(connection.controls).toEqual([
      [a, { kind: 'kill' }],
      [b, { kind: 'kill' }]
    ])
    expect(connection.killed).toBe(0)
  })

  it('起動途中に killAll が走った要求は登録しない (見えない枠を作らない)', async () => {
    let release: () => void = () => undefined
    const gate = new Promise<void>((r) => {
      release = r
    })
    const { service, connection } = setup(async () => {
      await gate
      return okPrep()
    })
    const pending = service.launch(cfg())
    service.killAll()
    release()
    expect(await pending).toEqual({ status: 'rejected', reason: 'launch-failed' })
    expect(connection.launches).toHaveLength(0)
  })

  it('dispose は全セッションへ kill → claude の終了を待つ → supervisor を止める、の順', async () => {
    const { service, connection } = setup()
    const [a] = await launchN(service, 1)
    const done = service.dispose()
    expect(connection.controls).toEqual([[a, { kind: 'kill' }]])
    expect(connection.killed).toBe(0)
    connection.status([upd(a as string, { state: 'done', claudeAlive: false })])
    expect(await done).toBe(0)
    expect(connection.killed).toBe(1)
  })

  it('dispose は 1 回だけ走り、2 回目は同じ結果を返す。期限を過ぎたら残りを数えて supervisor を止める', async () => {
    const { service, connection, timer } = setup()
    await launchN(service, 2)
    const first = service.dispose()
    const second = service.dispose()
    expect(second).toBe(first)
    timer.fire()
    expect(await first).toBe(2)
    expect(connection.killed).toBe(1)
  })

  it('dispose の待ちの既定の上限は 6,000 ms (X-8 / AD-058 Decision 4)', async () => {
    const { service, timer } = setup()
    await launchN(service, 1)
    void service.dispose()
    expect(timer.delays).toContain(6000)
  })

  it('終了処理中の起動要求は shutting-down で拒否する', async () => {
    const { service } = setup()
    void service.dispose()
    expect(await service.launch(cfg())).toEqual({ status: 'rejected', reason: 'shutting-down' })
  })
})

describe('会話の id の保持 (X-9 / BE-006 / AD-059)', () => {
  const CONV = '22222222-2222-4222-8222-222222222222'
  const CONV2 = '33333333-3333-4333-8333-333333333333'

  async function launched(s: Setup, config = cfg('fA', 'rA')): Promise<string> {
    const o = await s.service.launch(config)
    if (o.status !== 'launching') throw new Error('launch failed')
    return o.sessionId
  }

  it('届いた会話の id と起動設定の 3 軸を退避し、通知を 1 回だけ呼ぶ', async () => {
    const s = setup()
    const id = await launched(s)
    expect(s.service.conversationRecord(id)).toBeNull()
    s.connection.conversation(id, CONV)
    expect(s.service.conversationRecord(id)).toEqual({
      conversationId: CONV,
      folderId: 'fA',
      runtimeId: 'rA',
      providerId: null,
      targetKey: null
    })
    s.connection.conversation(id, CONV)
    expect(s.resumable).toEqual([id])
  })

  it('世代の違う・知らない sessionId の通知は捨てる', async () => {
    const s = setup()
    const id = await launched(s)
    s.connection.conversation(id, CONV, s.connection.generation + 1)
    s.connection.conversation('00000000-0000-4000-8000-0000000000ff', CONV)
    expect(s.service.conversationRecord(id)).toBeNull()
    expect(s.resumable).toEqual([])
  })

  it('状態通知で行を更新しても会話の id を失わない', async () => {
    const s = setup()
    const id = await launched(s)
    s.connection.conversation(id, CONV)
    s.connection.status([upd(id)])
    s.connection.conversation(id, CONV2)
    expect(s.service.conversationRecord(id)?.conversationId).toBe(CONV2)
    expect(s.resumable).toEqual([id])
  })

  it('行が消えても退避は残る', async () => {
    const s = setup()
    const id = await launched(s)
    s.connection.conversation(id, CONV)
    s.connection.status([upd(id, { state: 'done', claudeAlive: false })])
    s.connection.threadEnded(id)
    expect(s.service.conversationRecord(id)?.conversationId).toBe(CONV)
  })

  it('別の id に変わったら事実だけをログに残し、値は出さない', async () => {
    const s = setup()
    const id = await launched(s)
    s.connection.conversation(id, CONV)
    s.connection.conversation(id, CONV2)
    expect(s.logs).toContain('[session] conversation-id-changed')
    expect(s.logs.join('\n')).not.toContain(CONV)
    expect(s.logs.join('\n')).not.toContain(CONV2)
  })

  it('257 件目で最も古い退避を捨てる', async () => {
    const s = setup()
    const ids: string[] = []
    for (let i = 0; i < 257; i += 1) {
      const id = await launched(s)
      ids.push(id)
      s.connection.conversation(id, CONV)
      // 枠を空ける (上限 10 を超えないように)
      s.connection.status([upd(id, { state: 'done', claudeAlive: false })])
      s.connection.threadEnded(id)
    }
    expect(s.service.conversationRecord(ids[0] as string)).toBeNull()
    expect(s.service.conversationRecord(ids[1] as string)).not.toBeNull()
    expect(s.service.conversationRecord(ids[256] as string)).not.toBeNull()
  })

  it('killAll と dispose で退避を空にする', async () => {
    const s = setup()
    const id = await launched(s)
    s.connection.conversation(id, CONV)
    s.service.killAll()
    expect(s.service.conversationRecord(id)).toBeNull()

    const t = setup()
    const id2 = await launched(t)
    t.connection.conversation(id2, CONV)
    void t.service.dispose()
    expect(t.service.conversationRecord(id2)).toBeNull()
  })
})

describe('再開の起動 (X-9 / BE-013 / data-model §5)', () => {
  const CONV = '22222222-2222-4222-8222-222222222222'
  const CONV2 = '33333333-3333-4333-8333-333333333333'
  const resolved = (
    conversationId = CONV,
    targetKey: string | null = 'host#0'
  ): ResolvedResume => ({
    conversationId,
    folderId: 'f1',
    runtimeId: 'r1',
    providerId: null,
    targetKey
  })

  it('受け付けで options に resume が載り、registry と退避に会話の id が入る。通知は呼ばない', async () => {
    const s = setup()
    const o = await s.service.resume(cfg(), resolved())
    expect(o.status).toBe('launching')
    expect(s.connection.launchOptions[0]).toEqual({ permissionMode: 'default', resume: CONV })
    if (o.status !== 'launching') return
    expect(s.service.conversationRecord(o.sessionId)).toEqual({
      conversationId: CONV,
      folderId: 'f1',
      runtimeId: 'r1',
      providerId: null,
      targetKey: 'host#0'
    })
    s.connection.conversation(o.sessionId, CONV)
    expect(s.resumable).toEqual([])
    expect(s.logs).toEqual([])
  })

  it('新しい起動の options に resume は載らない', async () => {
    const s = setup()
    await s.service.launch(cfg())
    expect('resume' in (s.connection.launchOptions[0] as object)).toBe(false)
  })

  it('claudeAlive の同じ会話は already-running (上限いっぱいでも。起動しない)', async () => {
    const s = setup()
    const first = await s.service.resume(cfg(), resolved())
    if (first.status !== 'launching') throw new Error('x')
    await launchN(s.service, 9)
    const again = await s.service.resume(cfg(), resolved())
    expect(again).toEqual({ status: 'already-running', sessionId: first.sessionId })
    expect(s.connection.launches).toHaveLength(10)
  })

  it('claudeAlive が false の同じ会話は数えず、再開できる', async () => {
    const s = setup()
    const first = await s.service.resume(cfg(), resolved())
    if (first.status !== 'launching') throw new Error('x')
    s.connection.status([upd(first.sessionId, { state: 'done', claudeAlive: false })])
    expect((await s.service.resume(cfg(), resolved())).status).toBe('launching')
  })

  it('準備の途中の 2 本目は conversation-running (連打)', async () => {
    let release: () => void = () => undefined
    const gate = new Promise<void>((r) => {
      release = r
    })
    const s = setup(async () => {
      await gate
      return okPrep()
    })
    const a = s.service.resume(cfg(), resolved())
    const b = await s.service.resume(cfg(), resolved())
    expect(b).toEqual({ status: 'rejected', reason: 'conversation-running' })
    release()
    expect((await a).status).toBe('launching')
    expect(s.connection.launches).toHaveLength(1)
  })

  it('上限 10 で session-limit。拒否で予約と Set が戻る', async () => {
    const s = setup()
    await launchN(s.service, 10)
    expect(await s.service.resume(cfg(), resolved())).toEqual({
      status: 'rejected',
      reason: 'session-limit'
    })
    const t = setup(async () => ({ ok: false, reason: 'provider-unavailable' }))
    expect(await t.service.resume(cfg(), resolved())).toEqual({
      status: 'rejected',
      reason: 'provider-unavailable'
    })
    // Set が戻っているので同じ会話を再び試せる (conversation-running にならない)。
    expect((await t.service.resume(cfg(), resolved())).status).toBe('rejected')
    expect(await t.service.resume(cfg(), resolved())).toEqual({
      status: 'rejected',
      reason: 'provider-unavailable'
    })
  })

  it('killAll をまたいだ要求は登録しない', async () => {
    let release: () => void = () => undefined
    const gate = new Promise<void>((r) => {
      release = r
    })
    const s = setup(async () => {
      await gate
      return okPrep()
    })
    const a = s.service.resume(cfg(), resolved())
    s.service.killAll()
    release()
    expect(await a).toEqual({ status: 'rejected', reason: 'launch-failed' })
    expect(s.connection.launches).toHaveLength(0)
  })

  it('init が別の id を出すと上書きされ、conversation-id-changed の 1 行だけが出る (値は出ない)', async () => {
    const s = setup()
    const o = await s.service.resume(cfg(), resolved())
    if (o.status !== 'launching') throw new Error('x')
    s.connection.conversation(o.sessionId, CONV2)
    expect(s.service.conversationRecord(o.sessionId)?.conversationId).toBe(CONV2)
    expect(s.service.conversationRecord(o.sessionId)?.targetKey).toBe('host#0')
    expect(s.logs).toEqual(['[session] conversation-id-changed'])
  })

  it('WSL と Win32 の prepareLaunch の結果のどちらでも resume が足される', async () => {
    let n = 0
    const s = setup(async () => {
      n += 1
      return n === 1 ? okPrep() : { ok: true, input: fakeInput, spec: WIN32_LAUNCH_SPEC_FIXTURE }
    })
    await s.service.resume(cfg(), resolved(CONV))
    await s.service.resume(cfg(), resolved(CONV2))
    expect(s.connection.launchOptions.map((o) => o.resume)).toEqual([CONV, CONV2])
  })
})

describe('稼働中の行からの再開 (X-9 / BE-020 / data-model §1.5)', () => {
  const CONV = '22222222-2222-4222-8222-222222222222'
  const fromLive = (replacesSessionId: string): ResolvedResume => ({
    conversationId: CONV,
    folderId: 'f1',
    runtimeId: 'r1',
    providerId: null,
    targetKey: 'host#0',
    replacesSessionId
  })

  it('受け付けで元の行のレコードが消え、新しい行のレコードが入る。2 回目の引き当ては null', async () => {
    const s = setup()
    const first = await s.service.launch(cfg())
    if (first.status !== 'launching') throw new Error('x')
    s.connection.conversation(first.sessionId, CONV)
    s.connection.status([upd(first.sessionId, { state: 'done', claudeAlive: false })])
    expect(s.service.conversationRecord(first.sessionId)).not.toBeNull()
    const o = await s.service.resume(cfg(), fromLive(first.sessionId))
    if (o.status !== 'launching') throw new Error('x')
    expect(s.service.conversationRecord(first.sessionId)).toBeNull()
    expect(s.service.conversationRecord(o.sessionId)?.targetKey).toBe('host#0')
  })

  it('拒否 (上限・prepareLaunch の拒否) では元の行のレコードが残る', async () => {
    const s = setup(async () => ({ ok: false, reason: 'provider-unavailable' }))
    const ok = setup()
    const first = await ok.service.launch(cfg())
    if (first.status !== 'launching') throw new Error('x')
    ok.connection.conversation(first.sessionId, CONV)
    ok.connection.status([upd(first.sessionId, { state: 'done', claudeAlive: false })])
    await launchN(ok.service, 10)
    expect((await ok.service.resume(cfg(), fromLive(first.sessionId))).status).toBe('rejected')
    expect(ok.service.conversationRecord(first.sessionId)).not.toBeNull()
    expect((await s.service.resume(cfg(), fromLive('x'))).status).toBe('rejected')
  })
})

describe('引き継ぐ軸が消えたときの拒否 (X-9 / BE-030 / FR-008)', () => {
  const CONV = '22222222-2222-4222-8222-222222222222'
  const resolvedFrom = (replacesSessionId?: string): ResolvedResume => ({
    conversationId: CONV,
    folderId: 'f1',
    runtimeId: 'r1',
    providerId: null,
    targetKey: 'host#0',
    ...(replacesSessionId !== undefined ? { replacesSessionId } : {})
  })
  /** フォルダの登録解除 (null)・Provider の削除・WSL のディストロ停止・Win32 の claude が無い。 */
  const GONE: readonly [string, LaunchPreparation][] = [
    ['フォルダの登録解除', null],
    ['Provider の削除', { ok: false, reason: 'provider-unavailable' }],
    ['ディストロ停止', { ok: false, reason: 'distro-not-running' }],
    ['Win32 の claude 不在', { ok: false, reason: 'claude-not-found' }]
  ]
  const EXPECTED = [
    'unknown-target',
    'provider-unavailable',
    'distro-not-running',
    'claude-not-found'
  ]

  it.each(GONE.map((g, i) => [g[0], g[1], EXPECTED[i]] as const))(
    '稼働中の行: %s は今の理由で拒否され、元の行のレコードが残る。答えに別の軸の候補が無い',
    async (_name, prep, reason) => {
      let current: LaunchPreparation = okPrep()
      const s = setup(async () => current)
      const first = await s.service.launch(cfg())
      if (first.status !== 'launching') throw new Error('x')
      s.connection.conversation(first.sessionId, CONV)
      s.connection.status([upd(first.sessionId, { state: 'done', claudeAlive: false })])
      current = prep
      const o = await s.service.resume(cfg(), resolvedFrom(first.sessionId))
      expect(o).toEqual({ status: 'rejected', reason })
      expect(s.service.conversationRecord(first.sessionId)).not.toBeNull()
      expect(s.connection.launches).toHaveLength(1)
    }
  )

  it.each(GONE.map((g, i) => [g[0], g[1], EXPECTED[i]] as const))(
    '過去の行: %s は今の理由で拒否され、レコードも起動も増えない',
    async (_name, prep, reason) => {
      const s = setup(async () => prep)
      const o = await s.service.resume(cfg(), resolvedFrom())
      expect(o).toEqual({ status: 'rejected', reason })
      expect(s.connection.launches).toHaveLength(0)
    }
  )
})

/* ── 実行中の設定の結果の待ちと、改名の間のプロンプトの保留 (023 / BE-008 / data-model §4) ── */

interface LiveTimer {
  readonly fn: () => void
  readonly ms: number
  cleared: boolean
}

function liveSetup(
  providerModels?: (providerId: string) => Promise<readonly ModelEntry[] | null>
): Setup & { timers: LiveTimer[] } {
  const connection = fakeConnection()
  const statuses: SessionStatusUpdate[][] = []
  const logs: string[] = []
  const timers: LiveTimer[] = []
  const timer: TimerLike = {
    setTimeout(fn, ms) {
      const t: LiveTimer = { fn, ms, cleared: false }
      timers.push(t)
      return t
    },
    clearTimeout(handle) {
      const t = handle as LiveTimer
      t.cleared = true
    }
  }
  let seq = 0
  let req = 0
  const service = createSessionLaunchService({
    connection,
    prepareLaunch: async () => okPrep(),
    newSessionId: () => {
      seq += 1
      return `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`
    },
    newRequestId: () => {
      req += 1
      return `99999999-0000-4000-8000-${String(req).padStart(12, '0')}`
    },
    ...(providerModels !== undefined ? { providerModels } : {}),
    onStatus: (u) => statuses.push([...u]),
    timer,
    log: (l) => logs.push(l)
  })
  return {
    connection,
    service,
    statuses,
    logs,
    timers,
    timer: manualTimer(),
    resumable: []
  }
}

const REQ1 = '99999999-0000-4000-8000-000000000001'
const REQ2 = '99999999-0000-4000-8000-000000000002'

async function liveSession(s: ReturnType<typeof liveSetup>): Promise<string> {
  const o = await s.service.launch(cfg())
  if (o.status !== 'launching') throw new Error('launch failed')
  s.connection.status([upd(o.sessionId, { state: 'done' })])
  return o.sessionId
}

describe('制御の結果の待ち (023 / data-model §4.2)', () => {
  it('結果の一致で解ける (ok は { ok: true }、!ok は rejected)。解いたら changing が戻る', async () => {
    const s = liveSetup()
    const id = await liveSession(s)
    const p = s.service.requestControl(id, { kind: 'set-permission-mode', mode: 'plan' })
    expect(s.service.liveSettingRow(id)?.changing).toBe(true)
    expect(s.connection.controls).toContainEqual([
      id,
      { kind: 'set-permission-mode', requestId: REQ1, mode: 'plan' }
    ])
    s.connection.controlResult(id, REQ1, true)
    await expect(p).resolves.toEqual({ ok: true })
    expect(s.service.liveSettingRow(id)?.changing).toBe(false)

    const q = s.service.requestControl(id, { kind: 'set-model', model: 'm1' })
    s.connection.controlResult(id, REQ2, false)
    await expect(q).resolves.toEqual({ ok: false, reason: 'rejected' })
    expect(s.service.liveSettingRow(id)?.changing).toBe(false)
  })

  it('結果を待つ間の 2 本目 (種類を問わない) は busy で、制御を送らない', async () => {
    const s = liveSetup()
    const id = await liveSession(s)
    void s.service.requestControl(id, { kind: 'set-model', model: 'm1' })
    const before = s.connection.controls.length
    await expect(
      s.service.requestControl(id, { kind: 'set-permission-mode', mode: 'plan' })
    ).resolves.toEqual({ ok: false, reason: 'busy' })
    expect(s.connection.controls).toHaveLength(before)
  })

  it('2 回目の解きを無視し、知らない requestId・別の世代の結果を捨てる', async () => {
    const s = liveSetup()
    const id = await liveSession(s)
    const p = s.service.requestControl(id, { kind: 'set-model', model: 'm1' })
    s.connection.controlResult(id, REQ2, true) // 知らない requestId
    s.connection.controlResult(id, REQ1, true, 99) // 世代が違う
    expect(s.service.liveSettingRow(id)?.changing).toBe(true)
    s.connection.controlResult(id, REQ1, true)
    s.connection.controlResult(id, REQ1, false) // 2 回目
    await expect(p).resolves.toEqual({ ok: true })
  })

  it('期限 (10 秒) で timeout になる', async () => {
    const s = liveSetup()
    const id = await liveSession(s)
    const p = s.service.requestControl(id, { kind: 'set-model', model: 'm1' })
    const t = s.timers.find((x) => x.ms === CONTROL_RESULT_TIMEOUT_MS)
    expect(t).toBeDefined()
    t?.fn()
    await expect(p).resolves.toEqual({ ok: false, reason: 'timeout' })
    expect(s.service.liveSettingRow(id)?.changing).toBe(false)
  })

  it('そのセッションの世代の終わり (onThreadEnded) で session-ended', async () => {
    const s = liveSetup()
    const id = await liveSession(s)
    const p = s.service.requestControl(id, { kind: 'set-model', model: 'm1' })
    s.connection.threadEnded(id)
    await expect(p).resolves.toEqual({ ok: false, reason: 'session-ended' })
  })

  it('supervisor の終わり (onExit) で session-ended', async () => {
    const s = liveSetup()
    const id = await liveSession(s)
    const p = s.service.requestControl(id, { kind: 'set-model', model: 'm1' })
    s.connection.exit(1)
    await expect(p).resolves.toEqual({ ok: false, reason: 'session-ended' })
  })

  it('killAll で session-ended', async () => {
    const s = liveSetup()
    const id = await liveSession(s)
    const p = s.service.requestControl(id, { kind: 'set-model', model: 'm1' })
    s.service.killAll()
    await expect(p).resolves.toEqual({ ok: false, reason: 'session-ended' })
  })

  it('dispose で session-ended', async () => {
    const s = liveSetup()
    const id = await liveSession(s)
    const p = s.service.requestControl(id, { kind: 'set-model', model: 'm1' })
    void s.service.dispose()
    await expect(p).resolves.toEqual({ ok: false, reason: 'session-ended' })
  })

  it('未知の sessionId は unknown-session', async () => {
    const s = liveSetup()
    await expect(
      s.service.requestControl('nope', { kind: 'set-model', model: 'm1' })
    ).resolves.toEqual({ ok: false, reason: 'unknown-session' })
    expect(s.service.liveSettingRow('nope')).toBeNull()
  })

  it('liveSettingRow は状態・claudeAlive・会話の id の有無・changing を返す', async () => {
    const s = liveSetup()
    const id = await liveSession(s)
    expect(s.service.liveSettingRow(id)).toEqual({
      state: 'done',
      claudeAlive: true,
      hasConversation: false,
      changing: false
    })
    s.connection.conversation(id, '33333333-3333-4333-8333-333333333333')
    expect(s.service.liveSettingRow(id)?.hasConversation).toBe(true)
  })
})

describe('setName (023 / BE-034)', () => {
  it('名前を行に覚え、状態通知の値には名前のキーが出ない。未知の行は何もしない', async () => {
    const s = liveSetup()
    const id = await liveSession(s)
    s.service.setName(id, '調査')
    s.service.setName('nope', 'x')
    s.connection.status([upd(id, { state: 'interrupted' })])
    for (const batch of s.statuses) {
      for (const u of batch) expect(Object.keys(u)).not.toContain('name')
    }
    expect(JSON.stringify(s.logs)).not.toContain('調査')
  })
})

describe('setPermissionMode (023 / contracts C-1)', () => {
  it('未知の sessionId は unknown-session で、制御を送らない', async () => {
    const s = liveSetup()
    await expect(s.service.setPermissionMode('nope', 'plan')).resolves.toEqual({
      ok: false,
      reason: 'unknown-session'
    })
    expect(s.connection.controls).toHaveLength(0)
  })

  it('launching は not-ready・claudeAlive: false は not-running で、制御を送らない', async () => {
    const s = liveSetup()
    const o = await s.service.launch(cfg())
    if (o.status !== 'launching') throw new Error('launch failed')
    await expect(s.service.setPermissionMode(o.sessionId, 'plan')).resolves.toEqual({
      ok: false,
      reason: 'not-ready'
    })
    s.connection.status([upd(o.sessionId, { state: 'done', claudeAlive: false })])
    await expect(s.service.setPermissionMode(o.sessionId, 'plan')).resolves.toEqual({
      ok: false,
      reason: 'not-running'
    })
    expect(s.connection.controls).toHaveLength(0)
  })

  it.each(['running', 'awaiting_permission', 'done'] as const)(
    '%s で受け、結果の ok で { ok: true } になる',
    async (state) => {
      const s = liveSetup()
      const id = await liveSession(s)
      s.connection.status([upd(id, { state })])
      const p = s.service.setPermissionMode(id, 'plan')
      expect(s.connection.controls).toContainEqual([
        id,
        { kind: 'set-permission-mode', requestId: REQ1, mode: 'plan' }
      ])
      s.connection.controlResult(id, REQ1, true)
      await expect(p).resolves.toEqual({ ok: true })
    }
  )

  it('結果を待つ間の 2 本目 (種類を問わない) は busy で、制御を送らない', async () => {
    const s = liveSetup()
    const id = await liveSession(s)
    void s.service.setPermissionMode(id, 'plan')
    const before = s.connection.controls.length
    await expect(s.service.setPermissionMode(id, 'default')).resolves.toEqual({
      ok: false,
      reason: 'busy'
    })
    await expect(s.service.requestControl(id, { kind: 'set-model', model: 'm1' })).resolves.toEqual(
      { ok: false, reason: 'busy' }
    )
    expect(s.connection.controls).toHaveLength(before)
  })

  it('失敗の結果は rejected', async () => {
    const s = liveSetup()
    const id = await liveSession(s)
    const p = s.service.setPermissionMode(id, 'plan')
    s.connection.controlResult(id, REQ1, false)
    await expect(p).resolves.toEqual({ ok: false, reason: 'rejected' })
  })
})

describe('setModel (023 / contracts C-2)', () => {
  const CATALOG: readonly ModelEntry[] = [
    { id: 'sonnet', displayName: 'Sonnet', supportedEffortLevels: ['low', 'high'] },
    {
      id: 'opus',
      displayName: 'Opus',
      inferenceProfileId: 'profile/opus',
      supportedEffortLevels: ['high']
    },
    { id: 'haiku', displayName: 'Haiku' }
  ]

  async function modelSession(
    s: ReturnType<typeof liveSetup>,
    providerId: string | null,
    effort: EffortLevel | null
  ): Promise<string> {
    const o = await s.service.launch({ ...cfg(), providerId, effort })
    if (o.status !== 'launching') throw new Error('launch failed')
    s.connection.status([upd(o.sessionId, { state: 'done' })])
    return o.sessionId
  }

  it('カタログにある値は id で送り、inferenceProfileId があればそれを送る。effort のキーは無い', async () => {
    const s = liveSetup(async () => CATALOG)
    const id = await modelSession(s, 'p1', 'high')
    const p = s.service.setModel(id, 'opus')
    await Promise.resolve()
    await Promise.resolve()
    expect(s.connection.controls).toContainEqual([
      id,
      { kind: 'set-model', requestId: REQ1, model: 'profile/opus' }
    ])
    s.connection.controlResult(id, REQ1, true)
    await expect(p).resolves.toEqual({ ok: true })

    const q = s.service.setModel(id, 'sonnet')
    await Promise.resolve()
    await Promise.resolve()
    const sent = s.connection.controls.at(-1)?.[1]
    expect(sent).toEqual({ kind: 'set-model', requestId: REQ2, model: 'sonnet' })
    expect(Object.keys(sent ?? {})).not.toContain('effort')
    s.connection.controlResult(id, REQ2, false)
    await expect(q).resolves.toEqual({ ok: false, reason: 'rejected' })
  })

  it('effort が null ならカタログの全部を受ける', async () => {
    const s = liveSetup(async () => CATALOG)
    const id = await modelSession(s, 'p1', null)
    const p = s.service.setModel(id, 'haiku')
    await Promise.resolve()
    await Promise.resolve()
    s.connection.controlResult(id, REQ1, true)
    await expect(p).resolves.toEqual({ ok: true })
  })

  it.each([
    ['カタログに無い値', 'p1', 'high', 'nope', async () => CATALOG],
    ['起動の effort が効かないモデル', 'p1', 'low', 'opus', async () => CATALOG],
    ['対応 effort を持たないモデル (effort あり)', 'p1', 'high', 'haiku', async () => CATALOG],
    ['Provider が null (既定)', null, null, 'sonnet', async () => CATALOG],
    ['Provider が起動の後に消えた', 'p1', null, 'sonnet', async () => null],
    ['カタログが編集されてその値が消えた', 'p1', null, 'sonnet', async () => [CATALOG[2]]]
  ] as const)('%s は invalid-value で制御を送らない', async (_l, providerId, effort, model, models) => {
    const s = liveSetup(models)
    const id = await modelSession(s, providerId, effort)
    await expect(s.service.setModel(id, model)).resolves.toEqual({
      ok: false,
      reason: 'invalid-value'
    })
    expect(s.connection.controls).toHaveLength(0)
  })

  it('Provider の一覧を注入していなければ invalid-value', async () => {
    const s = liveSetup()
    const id = await modelSession(s, 'p1', null)
    await expect(s.service.setModel(id, 'sonnet')).resolves.toEqual({
      ok: false,
      reason: 'invalid-value'
    })
  })

  it('未知の sessionId は unknown-session、launching は not-ready、claudeAlive: false は not-running', async () => {
    const s = liveSetup(async () => CATALOG)
    await expect(s.service.setModel('nope', 'sonnet')).resolves.toEqual({
      ok: false,
      reason: 'unknown-session'
    })
    const o = await s.service.launch({ ...cfg(), providerId: 'p1' })
    if (o.status !== 'launching') throw new Error('launch failed')
    await expect(s.service.setModel(o.sessionId, 'sonnet')).resolves.toEqual({
      ok: false,
      reason: 'not-ready'
    })
    s.connection.status([upd(o.sessionId, { state: 'done', claudeAlive: false })])
    await expect(s.service.setModel(o.sessionId, 'sonnet')).resolves.toEqual({
      ok: false,
      reason: 'not-running'
    })
    expect(s.connection.controls).toHaveLength(0)
  })

  it('結果を待つ間の 2 本目は busy で、制御を送らない', async () => {
    const s = liveSetup(async () => CATALOG)
    const id = await modelSession(s, 'p1', null)
    void s.service.setPermissionMode(id, 'plan')
    const before = s.connection.controls.length
    await expect(s.service.setModel(id, 'sonnet')).resolves.toEqual({
      ok: false,
      reason: 'busy'
    })
    expect(s.connection.controls).toHaveLength(before)
  })
})

describe('改名の間のプロンプトの保留 (023 / data-model §4.3 / spec U-9)', () => {
  const prompt = (text: string): SessionControl => ({ kind: 'send-prompt', text })
  const sent = (s: ReturnType<typeof liveSetup>): SessionControl[] =>
    s.connection.controls.map(([, c]) => c)

  it('changing === name の間の send-prompt は送らず、endChange の後に届いた順で 1 回ずつ送る', async () => {
    const s = liveSetup()
    const id = await liveSession(s)
    expect(s.service.beginChange(id, 'name')).toBe(true)
    expect(s.service.control(id, prompt('one'))).toBe(true)
    expect(s.service.control(id, prompt('two'))).toBe(true)
    expect(sent(s)).toEqual([])
    s.service.endChange(id, 'name')
    expect(sent(s)).toEqual([prompt('one'), prompt('two')])
    expect(s.logs).toContain('[session] prompts held n=2')
    expect(s.logs).toContain('[session] prompts released n=2')
    expect(s.logs.join('\n')).not.toContain('one')
  })

  it('権限モード・モデルの変更中の send-prompt はすぐ送られる', async () => {
    const s = liveSetup()
    const id = await liveSession(s)
    void s.service.requestControl(id, { kind: 'set-model', model: 'm1' })
    s.service.control(id, prompt('now'))
    expect(sent(s)).toContainEqual(prompt('now'))
  })

  it('interrupt / end / kill は名前の変更中でもすぐ送られる', async () => {
    const s = liveSetup()
    const id = await liveSession(s)
    s.service.beginChange(id, 'name')
    s.service.control(id, { kind: 'interrupt' })
    s.service.control(id, { kind: 'end' })
    s.service.control(id, { kind: 'kill' })
    expect(sent(s)).toEqual([{ kind: 'interrupt' }, { kind: 'end' }, { kind: 'kill' }])
  })

  it('保留の後にセッションが終わったら送られない (onThreadEnded / killAll)', async () => {
    const s = liveSetup()
    const id = await liveSession(s)
    s.service.beginChange(id, 'name')
    s.service.control(id, prompt('lost'))
    s.connection.threadEnded(id)
    s.service.endChange(id, 'name')
    expect(sent(s)).toEqual([])

    const s2 = liveSetup()
    const id2 = await liveSession(s2)
    s2.service.beginChange(id2, 'name')
    s2.service.control(id2, prompt('lost'))
    s2.service.killAll()
    s2.service.endChange(id2, 'name')
    expect(sent(s2)).not.toContainEqual(prompt('lost'))
  })

  it('commit の後も changing / heldPrompts / conversationId が引き継がれ、状態通知に載らない', async () => {
    const s = liveSetup()
    const id = await liveSession(s)
    s.connection.conversation(id, '33333333-3333-4333-8333-333333333333')
    s.service.beginChange(id, 'name')
    s.service.control(id, prompt('held'))
    s.connection.status([upd(id, { state: 'done' })])
    expect(s.service.liveSettingRow(id)).toMatchObject({ hasConversation: true, changing: true })
    s.service.endChange(id, 'name')
    expect(sent(s)).toEqual([prompt('held')])
    for (const batch of s.statuses) {
      for (const u of batch) {
        for (const key of ['name', 'effort', 'changing', 'heldPrompts']) {
          expect(u).not.toHaveProperty(key)
        }
      }
    }
  })
})
