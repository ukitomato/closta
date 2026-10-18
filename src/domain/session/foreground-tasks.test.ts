import { describe, expect, it } from 'vitest'

import {
  createForegroundTaskMemory,
  createTaskRowBuilder,
  MAX_FOREGROUND_TASKS
} from './foreground-tasks'
import { mergeSystemEvent, systemEventPartOf } from './system-event'

const started = (id: string, extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  type: 'system',
  subtype: 'task_started',
  task_id: id,
  task_type: 'local_agent',
  description: 'do things',
  tool_use_id: `toolu_${id}`,
  ...extra
})

const bgUpdate = (id: string, patch: Record<string, unknown> = {}): Record<string, unknown> => ({
  type: 'system',
  subtype: 'task_updated',
  task_id: id,
  patch: { is_backgrounded: true, ...patch }
})

function partOf(
  row: ReturnType<ReturnType<typeof createTaskRowBuilder>['build']>
): NonNullable<ReturnType<typeof systemEventPartOf>> {
  const part = systemEventPartOf(row ?? undefined)
  if (part === null) throw new Error('no part')
  return part
}

describe('前景の task の記憶', () => {
  it('背景で始まった・ambient・skip_transcript・形の外れた id は覚えない', () => {
    const memory = createForegroundTaskMemory()
    memory.observeStarted(started('a', { is_backgrounded: true }))
    memory.observeStarted(started('b', { ambient: true }))
    memory.observeStarted(started('c', { skip_transcript: true }))
    memory.observeStarted(started('bad id!'))
    memory.observeStarted({ type: 'system', subtype: 'task_updated', task_id: 'd' })
    expect(memory.size).toBe(0)
  })

  it('前景で始まったものを覚え、257 件目で最も古いものを忘れる', () => {
    const memory = createForegroundTaskMemory()
    for (let i = 0; i <= MAX_FOREGROUND_TASKS; i++) memory.observeStarted(started(`t${i}`))
    expect(memory.size).toBe(MAX_FOREGROUND_TASKS)
    expect(memory.get('t0')).toBeUndefined()
    expect(memory.get('t1')?.taskType).toBe('local_agent')
  })

  it('形の外れた tool_use_id は覚えない (null)', () => {
    const memory = createForegroundTaskMemory()
    memory.observeStarted(started('a', { tool_use_id: 'bad id!' }))
    expect(memory.get('a')?.toolUseId).toBeNull()
  })
})

describe('task の行の包み', () => {
  it('前景で始まった task は行にならず、背景に移ると backgrounded-task の行が開き、記憶を忘れる', () => {
    const memory = createForegroundTaskMemory()
    const builder = createTaskRowBuilder(memory)
    expect(builder.build(started('a'), 1)).toBeNull()
    const row = builder.build(bgUpdate('a', { status: 'running' }), 2)
    expect(row?.id).toBe('task:a')
    expect(row?.createdAt).toBe(2)
    expect(partOf(row)).toEqual({
      type: 'system-event',
      category: 'backgrounded-task',
      opens: true,
      name: 'do things',
      detail: 'local_agent',
      status: 'running'
    })
    expect(memory.get('a')).toBeUndefined()
  })

  it('patch.status が無ければ running、有れば toStatus の値', () => {
    const builder = createTaskRowBuilder(createForegroundTaskMemory())
    builder.build(started('a'), 1)
    builder.build(started('b'), 1)
    expect(partOf(builder.build(bgUpdate('a'), 2)).status).toBe('running')
    expect(partOf(builder.build(bgUpdate('b', { status: 'paused' }), 2)).status).toBe('paused')
  })

  it('記憶に無い task では行を作らない', () => {
    const builder = createTaskRowBuilder(createForegroundTaskMemory())
    const row = builder.build(bgUpdate('zzz'), 1)
    expect(
      mergeSystemEvent(undefined, row ?? { id: 'x', role: 'system', parts: [], createdAt: null })
    ).toBeNull()
  })

  it('以後の更新・通知・進み具合が同じ行に入り category は backgrounded-task のまま', () => {
    const builder = createTaskRowBuilder(createForegroundTaskMemory())
    builder.build(started('a'), 1)
    let row = builder.build(bgUpdate('a'), 2)
    if (row === null) throw new Error('row')
    const progress = {
      id: 'task:a',
      role: 'system' as const,
      parts: [
        {
          type: 'system-event' as const,
          category: 'task' as const,
          opens: false,
          name: '',
          detail: '\n10/2/300',
          status: null
        }
      ],
      createdAt: null
    }
    row = mergeSystemEvent(row, progress)
    if (row === null) throw new Error('row')
    expect(partOf(row).detail).toBe('local_agent\n10/2/300')
    const done = builder.build(
      { type: 'system', subtype: 'task_notification', task_id: 'a', status: 'completed' },
      3
    )
    row = mergeSystemEvent(row, done ?? progress)
    expect(partOf(row)).toMatchObject({
      category: 'backgrounded-task',
      status: 'completed',
      opens: true
    })
  })

  it('task_notification の後に記憶を忘れる', () => {
    const memory = createForegroundTaskMemory()
    const builder = createTaskRowBuilder(memory)
    builder.build(started('a'), 1)
    builder.build(
      { type: 'system', subtype: 'task_notification', task_id: 'a', status: 'killed' },
      2
    )
    expect(memory.get('a')).toBeUndefined()
  })

  it('背景で始まった task は今どおり task の行 (記憶しない)', () => {
    const memory = createForegroundTaskMemory()
    const row = createTaskRowBuilder(memory).build(started('a', { is_backgrounded: true }), 1)
    expect(partOf(row).category).toBe('task')
    expect(memory.size).toBe(0)
  })
})

describe('local_bash のコマンドの名前', () => {
  const bash = (id: string): Record<string, unknown> =>
    started(id, { task_type: 'local_bash', description: 'SECRET-DESC' })
  const argsOf = (command: unknown): string => JSON.stringify({ command })

  it.each([
    ['npm run x', 'npm'],
    ['FOO=bar npm run x', 'npm'],
    ['/usr/bin/node x.js', 'node']
  ])('%s → %s (背景で始まった行)', (command, name) => {
    const builder = createTaskRowBuilder(createForegroundTaskMemory())
    expect(builder.build(bash('a'), 1, argsOf(command))).toBeNull()
    const bg = builder.build({ ...bash('b'), is_backgrounded: true }, 1, argsOf(command))
    expect(partOf(bg).name).toBe(name)
  })

  it('後から背景に移った行も名前を持つ (関数で引く)', () => {
    const builder = createTaskRowBuilder(createForegroundTaskMemory())
    builder.build(bash('a'), 1, argsOf('npm run x'))
    const seen: string[] = []
    const row = builder.build(bgUpdate('a'), 2, (id) => {
      seen.push(id)
      return argsOf('npm run x')
    })
    expect(seen).toEqual(['toolu_a'])
    expect(partOf(row).name).toBe('npm')
  })

  it('秘密の目印・description は行に出ない。取れないときは空', () => {
    const builder = createTaskRowBuilder(createForegroundTaskMemory())
    const secret = builder.build(
      { ...bash('a'), is_backgrounded: true },
      1,
      argsOf('curl -H "Authorization: Bearer SECRET-TOKEN" x')
    )
    expect(JSON.stringify(secret)).not.toContain('SECRET')
    expect(partOf(secret).name).toBe('')
    for (const args of [undefined, 'not json', JSON.stringify({ command: 1 }), '{"command":"npm'])
      expect(partOf(builder.build({ ...bash('b'), is_backgrounded: true }, 1, args)).name).toBe('')
  })
})
