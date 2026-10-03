import { describe, expect, it } from 'vitest'

import {
  isTerminalSystemEventStatus,
  mayCarrySecret,
  mergeSystemEvent,
  systemEventPartOf,
  toSystemEventMessage
} from './system-event'
import type { TranscriptMessageDTO } from './transcript-dto'

/** O-2 BE-021 — Hook / Background task のシステムメッセージ → 1 行 (data-model §2)。 */

const hookStarted = {
  type: 'system',
  subtype: 'hook_started',
  hook_id: 'h1',
  hook_name: 'format-check',
  hook_event: 'SessionStart'
}
const hookResponse = {
  type: 'system',
  subtype: 'hook_response',
  hook_id: 'h1',
  hook_name: 'format-check',
  hook_event: 'SessionStart',
  outcome: 'error',
  output: 'SECRET_OUTPUT',
  stdout: 'SECRET_STDOUT',
  stderr: 'SECRET_STDERR',
  exit_code: 42
}
const taskStarted = {
  type: 'system',
  subtype: 'task_started',
  task_id: 't1',
  description: 'ビルドを走らせる',
  task_type: 'local_agent',
  is_backgrounded: true,
  prompt: 'SECRET_PROMPT'
}

describe('toSystemEventMessage', () => {
  it('Hook の開始と応答は同じ id の行になり、出力本文と終了コードを持たない', () => {
    const started = toSystemEventMessage(hookStarted)
    const response = toSystemEventMessage(hookResponse)
    expect(started?.id).toBe('hook:h1')
    expect(response?.id).toBe('hook:h1')
    expect(systemEventPartOf(started ?? undefined)).toEqual({
      type: 'system-event',
      category: 'hook',
      opens: true,
      name: 'format-check',
      detail: 'SessionStart',
      status: 'started'
    })
    expect(systemEventPartOf(response ?? undefined)?.status).toBe('failed')
    expect(JSON.stringify(response)).not.toMatch(/SECRET|42/)
  })

  it('背景で始まった task だけが行を作り、prompt を持たない', () => {
    const started = toSystemEventMessage(taskStarted)
    expect(started?.id).toBe('task:t1')
    expect(systemEventPartOf(started ?? undefined)).toMatchObject({
      category: 'task',
      opens: true,
      name: 'ビルドを走らせる',
      detail: 'local_agent',
      status: 'running'
    })
    expect(JSON.stringify(started)).not.toMatch(/SECRET/)
    expect(toSystemEventMessage({ ...taskStarted, is_backgrounded: false })).toBeNull()
    expect(toSystemEventMessage({ ...taskStarted, is_backgrounded: undefined })).toBeNull()
    expect(toSystemEventMessage({ ...taskStarted, ambient: true })).toBeNull()
    expect(toSystemEventMessage({ ...taskStarted, skip_transcript: true })).toBeNull()
  })

  it('task の更新と通知は行を作れず、説明・要約・出力ファイル・エラーを持たない', () => {
    const updated = toSystemEventMessage({
      type: 'system',
      subtype: 'task_updated',
      task_id: 't1',
      patch: { status: 'completed', description: 'SECRET_DESC', error: 'SECRET_ERR' }
    })
    expect(systemEventPartOf(updated ?? undefined)).toMatchObject({
      opens: false,
      name: '',
      status: 'completed'
    })
    expect(JSON.stringify(updated)).not.toMatch(/SECRET/)
    const notification = toSystemEventMessage({
      type: 'system',
      subtype: 'task_notification',
      task_id: 't1',
      status: 'failed',
      summary: 'SECRET_SUMMARY',
      output_file: '/home/u/SECRET_FILE'
    })
    expect(systemEventPartOf(notification ?? undefined)).toMatchObject({
      opens: false,
      status: 'failed'
    })
    expect(JSON.stringify(notification)).not.toMatch(/SECRET/)
    expect(
      toSystemEventMessage({
        type: 'system',
        subtype: 'task_notification',
        task_id: 't1',
        status: 'completed',
        skip_transcript: true
      })
    ).toBeNull()
  })

  it('status の無い更新は null、値のある知らない status は unknown', () => {
    const noStatus = toSystemEventMessage({
      type: 'system',
      subtype: 'task_updated',
      task_id: 't1',
      patch: { is_backgrounded: true }
    })
    expect(systemEventPartOf(noStatus ?? undefined)?.status).toBeNull()
    const odd = toSystemEventMessage({
      type: 'system',
      subtype: 'task_updated',
      task_id: 't1',
      patch: { status: 'exploded' }
    })
    expect(systemEventPartOf(odd ?? undefined)?.status).toBe('unknown')
  })

  it('対象外の subtype・壊れた形は null で、例外を投げない', () => {
    for (const raw of [
      { type: 'system', subtype: 'hook_progress', hook_id: 'h1', stdout: 'x' },
      { type: 'system', subtype: 'task_progress', task_id: 't1' },
      { type: 'system', subtype: 'background_tasks_changed', tasks: [] },
      { type: 'system', subtype: 'hook_started' },
      { type: 'system', subtype: 'task_started', task_id: 1 },
      { type: 'assistant' },
      null,
      'x',
      42
    ])
      expect(toSystemEventMessage(raw)).toBeNull()
  })

  it('名前の制御文字・双方向制御文字・改行を除き、120 コードポイントで切る。文字列でなければ空', () => {
    // 空白を含む名前は Hook では allowlist で落ちるので、変換は task の説明で確かめる (pr-gate R2 security L-101)。
    const msg = toSystemEventMessage({
      ...taskStarted,
      description: `a‮b\nc\u0007d${'x'.repeat(200)}`
    })
    const part = systemEventPartOf(msg ?? undefined)
    expect(part?.name.startsWith('ab cd')).toBe(true)
    expect(Array.from(part?.name ?? '')).toHaveLength(121)
    expect(part?.name.endsWith('…')).toBe(true)
    const hook = systemEventPartOf(
      toSystemEventMessage({
        ...hookStarted,
        hook_name: 'Pre‮ToolUse:\u0007Bash',
        hook_event: 7
      }) ?? undefined
    )
    expect(hook?.name).toBe('PreToolUse:Bash')
    expect(hook?.detail).toBe('')
  })

  it('local_bash の説明は秘密の判定に関わらず名前に出さない (秘密の判定を通る形も含む。security L-002)', () => {
    for (const description of [
      'TOKEN=abc curl x',
      'echo $(cat key)',
      'curl -H Authorization:Bearer abc https://x',
      'curl https://user:tok@host/x',
      'mysql -pS3cret',
      'npm test'
    ]) {
      const part = systemEventPartOf(
        toSystemEventMessage({ ...taskStarted, task_type: 'local_bash', description }) ?? undefined
      )
      expect(part?.name).toBe('')
      expect(part?.detail).toBe('local_bash')
    }
    // local_bash 以外の説明は名前に出す。
    expect(systemEventPartOf(toSystemEventMessage(taskStarted) ?? undefined)?.name).toBe(
      'ビルドを走らせる'
    )
  })

  it('秘密を含みうる hook_name は名前に出さず、hook_event と状態だけを残す (security L-001)', () => {
    for (const hookName of ['TOKEN=abc ./notify.sh', 'curl "$URL"', 'run ghp_abcdef']) {
      const part = systemEventPartOf(
        toSystemEventMessage({ ...hookResponse, hook_name: hookName }) ?? undefined
      )
      expect(part).toMatchObject({ name: '', detail: 'SessionStart', status: 'failed' })
    }
    expect(systemEventPartOf(toSystemEventMessage(hookStarted) ?? undefined)?.name).toBe(
      'format-check'
    )
  })

  it('hook_name は allowlist の形 (`<event>:<matcher>` など) だけを出す。Bearer・URL の資格情報・長い名前は出さない (security L-101)', () => {
    for (const hookName of [
      'curl -H Authorization:Bearer abc',
      'https://u:tok@host',
      'mysql -pS3cret',
      './notify.sh',
      'x'.repeat(200)
    ]) {
      const part = systemEventPartOf(
        toSystemEventMessage({ ...hookResponse, hook_name: hookName }) ?? undefined
      )
      expect(part).toMatchObject({ name: '', detail: 'SessionStart', status: 'failed' })
    }
    for (const hookName of [
      'PreToolUse:Bash',
      'PostToolUse:Edit|Write',
      'SessionStart:startup',
      'PreToolUse:mcp__memory__.*',
      'lint'
    ]) {
      expect(
        systemEventPartOf(
          toSystemEventMessage({ ...hookResponse, hook_name: hookName }) ?? undefined
        )?.name
      ).toBe(hookName)
    }
  })
})

describe('mergeSystemEvent', () => {
  const started = toSystemEventMessage(taskStarted)!
  const update = (patch: Record<string, unknown>): TranscriptMessageDTO =>
    toSystemEventMessage({ type: 'system', subtype: 'task_updated', task_id: 't1', patch })!

  it('行の無い id には opens の無い更新で行を作らない (隠した task の説明つきの更新でも)', () => {
    expect(
      mergeSystemEvent(undefined, update({ status: 'running', description: 'leak' }))
    ).toBeNull()
    expect(mergeSystemEvent(undefined, started)).toBe(started)
  })

  it('status の無い更新で running が保たれ、名前の無い更新で名前が保たれる', () => {
    const kept = mergeSystemEvent(started, update({ end_time: 1 }))
    expect(systemEventPartOf(kept ?? undefined)).toMatchObject({
      status: 'running',
      name: 'ビルドを走らせる',
      opens: true
    })
    const done = mergeSystemEvent(kept ?? undefined, update({ status: 'completed' }))
    expect(systemEventPartOf(done ?? undefined)).toMatchObject({
      status: 'completed',
      name: 'ビルドを走らせる'
    })
  })

  it('終わりを表す状態の判定', () => {
    expect(isTerminalSystemEventStatus('completed')).toBe(true)
    expect(isTerminalSystemEventStatus('failed')).toBe(true)
    expect(isTerminalSystemEventStatus('running')).toBe(false)
    expect(isTerminalSystemEventStatus('started')).toBe(false)
    expect(isTerminalSystemEventStatus(null)).toBe(false)
  })

  it('mayCarrySecret', () => {
    expect(mayCarrySecret('npm run build')).toBe(false)
    expect(mayCarrySecret('A=1 make')).toBe(true)
    expect(mayCarrySecret('use sk-live')).toBe(true)
  })
})
