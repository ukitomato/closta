import { describe, expect, it } from 'vitest'

import {
  decodeRetryDetail,
  encodeRetryDetail,
  encodeTaskProgress,
  isTerminalSystemEventStatus,
  mayCarrySecret,
  mergeSystemEvent,
  splitTaskDetail,
  systemEventPartOf,
  toSystemEventMessage
} from './system-event'
import {
  SYSTEM_EVENT_CATEGORIES,
  SYSTEM_EVENT_STATUSES,
  type SystemEventCategory,
  type SystemEventStatus,
  type TranscriptMessageDTO
} from './transcript-dto'

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

describe('一般の Hook (O-11 US-1 / SC-001。変換は O-2 のまま)', () => {
  const general = (
    subtype: string,
    event: string,
    extra: Record<string, unknown> = {}
  ): Record<string, unknown> => ({
    type: 'system',
    subtype,
    hook_id: 'g1',
    hook_name: `${event}:Bash`,
    hook_event: event,
    ...extra
  })

  it.each(['PreToolUse', 'PostToolUse', 'Stop', 'UserPromptSubmit'])(
    '%s の開始と応答が同じ行 hook:<id> を開き書き換える',
    (event) => {
      const started = systemEventPartOf(
        toSystemEventMessage(general('hook_started', event)) ?? undefined
      )
      expect(started).toMatchObject({
        category: 'hook',
        opens: true,
        name: `${event}:Bash`,
        detail: event,
        status: 'started'
      })
      for (const [outcome, status] of [
        ['success', 'succeeded'],
        ['error', 'failed'],
        ['cancelled', 'cancelled'],
        ['mystery', 'unknown']
      ] as const) {
        const msg = toSystemEventMessage(general('hook_response', event, { outcome }))
        expect(msg?.id).toBe('hook:g1')
        expect(systemEventPartOf(msg ?? undefined)?.status).toBe(status)
      }
    }
  )

  it('hook_response が先に届いても行ができ、後から届いた応答が開始の行を書き換える', () => {
    const response = toSystemEventMessage(
      general('hook_response', 'PreToolUse', { outcome: 'error' })
    )
    expect(response).not.toBeNull()
    expect(mergeSystemEvent(undefined, response as TranscriptMessageDTO)).toEqual(response)
    const started = toSystemEventMessage(general('hook_started', 'PreToolUse'))
    const merged = mergeSystemEvent(started ?? undefined, response as TranscriptMessageDTO)
    expect(systemEventPartOf(merged ?? undefined)?.status).toBe('failed')
  })

  it('秘密を含みうる・形の外れた hook_name は名前が空 (見出しは hook_event と番号になる)', () => {
    for (const hookName of ['Bearer x', 'sk-abcdef', 'npm run build', './a/b.sh', 'FOO=1 cmd']) {
      const part = systemEventPartOf(
        toSystemEventMessage(general('hook_started', 'PreToolUse', { hook_name: hookName })) ??
          undefined
      )
      expect(part).toMatchObject({ name: '', detail: 'PreToolUse' })
    }
  })

  it('output / stdout / stderr / exit_code の目印が行に 0 件、hook_progress は行にならない', () => {
    const msg = toSystemEventMessage(
      general('hook_response', 'PostToolUse', {
        outcome: 'success',
        output: 'MARK-OUTPUT',
        stdout: 'MARK-STDOUT',
        stderr: 'MARK-STDERR',
        exit_code: 987654
      })
    )
    expect(JSON.stringify(msg)).not.toMatch(/MARK-|987654/)
    expect(
      toSystemEventMessage(general('hook_progress', 'PostToolUse', { stdout: 'x' }))
    ).toBeNull()
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

/** O-4 BE-003 — 行の category と status の追加、task の進み具合の合成、`detail` の符号化と復号 (014 data-model §3)。 */

const row = (
  id: string,
  category: SystemEventCategory,
  opens: boolean,
  detail: string,
  status: SystemEventStatus | null,
  name = ''
): TranscriptMessageDTO => ({
  id,
  role: 'system',
  parts: [{ type: 'system-event', category, opens, name, detail, status }],
  createdAt: null
})

describe('category と status の集合 (固定テスト)', () => {
  it('category は 13 (O-5 が auth / plugin、O-6 が 4 つ、O-10 が elicitation、O-11 が backgrounded-task を足した。集合を変えるには ADR が要る: AD-053 / AD-056)', () => {
    expect([...SYSTEM_EVENT_CATEGORIES].sort()).toEqual([
      'api-retry',
      'auth',
      'backgrounded-task',
      'compact-boundary',
      'compaction',
      'conversation-reset',
      'elicitation',
      'hook',
      'informational',
      'permission-mode',
      'plugin',
      'refusal',
      'task'
    ])
  })

  it('status は 22 (O-5 が authenticating、O-6 が 6 つ、O-10 が no-fallback-retry を足した)', () => {
    expect([...SYSTEM_EVENT_STATUSES].sort()).toEqual([
      'authenticating',
      'cancelled',
      'changed',
      'compacting',
      'completed',
      'failed',
      'fallback',
      'killed',
      'marked',
      'no-fallback',
      'no-fallback-retry',
      'notice',
      'paused',
      'pending',
      'prevented',
      'retrying',
      'running',
      'started',
      'stopped',
      'succeeded',
      'unknown',
      'warning'
    ])
  })

  it('O-6 の 6 つの status は終わりを表す', () => {
    for (const s of [
      'marked',
      'fallback',
      'no-fallback',
      'no-fallback-retry',
      'prevented',
      'warning',
      'notice'
    ] as const)
      expect(isTerminalSystemEventStatus(s)).toBe(true)
  })

  it('changed は終わりを表し、retrying / compacting は表さない', () => {
    expect(isTerminalSystemEventStatus('changed')).toBe(true)
    expect(isTerminalSystemEventStatus('retrying')).toBe(false)
    expect(isTerminalSystemEventStatus('compacting')).toBe(false)
    expect(isTerminalSystemEventStatus('authenticating')).toBe(false)
  })
})

describe('Hook の outcome の表引き (O-5 BE-030。Object.hasOwn)', () => {
  it('prototype のキー・知らない値は unknown で、例外を出さない', () => {
    for (const outcome of ['__proto__', 'constructor', 'toString', 'hasOwnProperty', 'exploded']) {
      const part = systemEventPartOf(
        toSystemEventMessage({ ...hookResponse, outcome }) ?? undefined
      )
      expect(part?.status).toBe('unknown')
    }
    for (const [outcome, status] of [
      ['success', 'succeeded'],
      ['error', 'failed'],
      ['cancelled', 'cancelled']
    ] as const) {
      expect(
        systemEventPartOf(toSystemEventMessage({ ...hookResponse, outcome }) ?? undefined)?.status
      ).toBe(status)
    }
  })
})

describe('mergeSystemEvent の task の進み具合 (014 data-model §3「合成の規則の追加」)', () => {
  const started = toSystemEventMessage(taskStarted)!
  const progress = (tokens: number, tools: number, ms: number): TranscriptMessageDTO =>
    row(
      'task:t1',
      'task',
      false,
      encodeTaskProgress({ totalTokens: tokens, toolUses: tools, durationMs: ms }),
      null
    )

  it('task の行に進み具合が合成され、種類・名前・状態が残る', () => {
    const merged = mergeSystemEvent(started, progress(1200, 3, 4500))
    expect(systemEventPartOf(merged ?? undefined)).toMatchObject({
      category: 'task',
      opens: true,
      name: 'ビルドを走らせる',
      detail: 'local_agent\n1200/3/4500',
      status: 'running'
    })
  })

  it('進み具合だけが続けて来ても種類が残り、進み具合は最新', () => {
    const first = mergeSystemEvent(started, progress(100, 1, 1000))
    const second = mergeSystemEvent(first ?? undefined, progress(900, 4, 7000))
    const part = systemEventPartOf(second ?? undefined)
    expect(part?.detail).toBe('local_agent\n900/4/7000')
    expect(splitTaskDetail(part?.detail ?? '')).toEqual({
      taskType: 'local_agent',
      progress: { tokens: 900, tools: 4, durationMs: 7000 }
    })
  })

  it('進み具合の後の状態の更新で種類と進み具合が残る', () => {
    const withProgress = mergeSystemEvent(started, progress(100, 1, 1000))
    const update = toSystemEventMessage({
      type: 'system',
      subtype: 'task_notification',
      task_id: 't1',
      status: 'completed'
    })!
    const done = mergeSystemEvent(withProgress ?? undefined, update)
    expect(systemEventPartOf(done ?? undefined)).toMatchObject({
      detail: 'local_agent\n100/1/1000',
      status: 'completed'
    })
  })

  it('行の無い task への進み具合は今のまま捨てる', () => {
    expect(mergeSystemEvent(undefined, progress(1, 1, 1))).toBeNull()
  })

  it('Hook と他の category の合成は今のまま (detail は空でなければ次の値。改行で始まらない)', () => {
    const hook = toSystemEventMessage(hookStarted)!
    const hookMerged = mergeSystemEvent(hook, toSystemEventMessage(hookResponse)!)
    expect(systemEventPartOf(hookMerged ?? undefined)?.detail).toBe('SessionStart')
    const retry = row('retry:0', 'api-retry', true, '1/10/529/2000', 'retrying')
    const retryNext = row('retry:0', 'api-retry', false, '2/10/529/4000', 'retrying')
    const retryDone = row('retry:0', 'api-retry', false, '', 'succeeded')
    const merged = mergeSystemEvent(mergeSystemEvent(retry, retryNext) ?? undefined, retryDone)
    expect(systemEventPartOf(merged ?? undefined)).toMatchObject({
      detail: '2/10/529/4000',
      status: 'succeeded'
    })
    // task 以外の category では、改行で始まる detail も合成の規則の対象にしない。
    const hookNewline = mergeSystemEvent(hook, row('hook:h1', 'hook', false, '\nX', null))
    expect(systemEventPartOf(hookNewline ?? undefined)?.detail).toBe('\nX')
  })

  it('開始の行と過去ログの task の detail は改行を含まない (oneLine が空白を畳む)', () => {
    const raw = { ...taskStarted, task_type: 'local_agent\n1/2/3' }
    const part = systemEventPartOf(toSystemEventMessage(raw) ?? undefined)
    expect(part?.detail).toBe('local_agent 1/2/3')
    expect(splitTaskDetail(part?.detail ?? '').progress).toBeNull()
  })
})

describe('detail の符号化と復号', () => {
  it('再試行の detail の往復', () => {
    const detail = encodeRetryDetail({
      attempt: 2,
      maxRetries: 10,
      errorStatus: 529,
      retryDelayMs: 4000
    })
    expect(detail).toBe('2/10/529/4000')
    expect(decodeRetryDetail(detail)).toEqual({
      attempt: 2,
      maxRetries: 10,
      errorStatus: 529,
      retryDelayMs: 4000
    })
  })

  it('error_status が null・整数でなければ -、他の外れた値は 0', () => {
    for (const errorStatus of [null, undefined, 'SECRET', 1.5, -1, Number.NaN]) {
      const detail = encodeRetryDetail({ attempt: 1, maxRetries: 3, errorStatus, retryDelayMs: 5 })
      expect(detail).toBe('1/3/-/5')
      expect(decodeRetryDetail(detail)?.errorStatus).toBeNull()
    }
    const bad = encodeRetryDetail({
      attempt: 'x',
      maxRetries: -1,
      errorStatus: 500,
      retryDelayMs: Number.POSITIVE_INFINITY
    })
    expect(bad).toBe('0/0/500/0')
  })

  it('復号できない再試行の detail は null', () => {
    const bad = ['', '1/2/3', '1/2/3/4/5', 'a/b/c/d', '1/2/x/4', '1/2/3/4\n', '-/2/3/4']
    for (const detail of bad) expect(decodeRetryDetail(detail)).toBeNull()
  })

  it('task の進み具合の往復と、復号できない detail で進み具合が null', () => {
    const detail = encodeTaskProgress({ totalTokens: 1200, toolUses: 3, durationMs: 4500 })
    expect(detail).toBe('\n1200/3/4500')
    expect(splitTaskDetail(`local_agent${detail}`)).toEqual({
      taskType: 'local_agent',
      progress: { tokens: 1200, tools: 3, durationMs: 4500 }
    })
    const zeroed = encodeTaskProgress({ totalTokens: 'x', toolUses: -1, durationMs: 1.5 })
    expect(zeroed).toBe('\n0/0/0')
    expect(splitTaskDetail('local_agent')).toEqual({ taskType: 'local_agent', progress: null })
    for (const tail of ['', 'x/y/z', '1/2', '1/2/3/4', '1/2/3\n4']) {
      expect(splitTaskDetail(`local_bash\n${tail}`)).toEqual({
        taskType: 'local_bash',
        progress: null
      })
    }
  })
})
