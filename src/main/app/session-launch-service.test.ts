import type { MessagePortMain } from 'electron'
import { describe, expect, it } from 'vitest'

import type { LaunchInput, RuntimeLaunchSpec, SessionControl } from '@domain/session/agent-session'
import type { SessionLaunchConfig } from '@domain/session/launch-config'
import type { SessionStatusUpdate } from '@domain/session/status-update'

import {
  createSessionLaunchService,
  type LaunchPreparation,
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
  controls: [string, SessionControl][]
  generation: number
  killed: number
  failNextLaunch: boolean
  status: (updates: unknown[], generation?: number) => void
  threadEnded: (sessionId: string, generation?: number) => void
  exit: (code: number | null, generation?: number) => void
} {
  const statusL: ((g: number, u: readonly unknown[]) => void)[] = []
  const threadL: ((g: number, id: string) => void)[] = []
  const exitL: ((g: number, c: number | null) => void)[] = []
  const conn = {
    launches: [] as string[],
    controls: [] as [string, SessionControl][],
    generation: 1,
    killed: 0,
    failNextLaunch: false,
    launch(sessionId: string) {
      if (conn.failNextLaunch) {
        conn.failNextLaunch = false
        return { ok: false as const }
      }
      conn.launches.push(sessionId)
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
    onExit: (l: (g: number, c: number | null) => void) => exitL.push(l),
    status: (updates: unknown[], generation = conn.generation) =>
      statusL.forEach((l) => l(generation, updates)),
    threadEnded: (id: string, generation = conn.generation) =>
      threadL.forEach((l) => l(generation, id)),
    exit: (code: number | null, generation = conn.generation) =>
      exitL.forEach((l) => l(generation, code))
  }
  return conn
}

function manualTimer(): TimerLike & { fire: () => void } {
  let fn: (() => void) | null = null
  return {
    setTimeout(f) {
      fn = f
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
}

function setup(prepareLaunch: () => Promise<LaunchPreparation> = async () => okPrep()): Setup {
  const connection = fakeConnection()
  const statuses: SessionStatusUpdate[][] = []
  const logs: string[] = []
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
    log: (l) => logs.push(l)
  })
  return { connection, service, statuses, logs, timer }
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

  it('終了処理中の起動要求は shutting-down で拒否する', async () => {
    const { service } = setup()
    void service.dispose()
    expect(await service.launch(cfg())).toEqual({ status: 'rejected', reason: 'shutting-down' })
  })
})
