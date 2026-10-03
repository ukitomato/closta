import { describe, expect, it } from 'vitest'

import type { ThreadMessageLike } from '@assistant-ui/react'

import type { TranscriptMessageDTO } from '@domain/session/transcript-dto'

import { toThreadMessage } from '@/features/chat/convert'

import type { PendingPermission } from './running-session-types'
import {
  deriveActivity,
  deriveSessionView,
  summarizeToolInput,
  type SessionView
} from './session-view'

/**
 * O-2 FE-031 — 直近の活動の tool ごとの要点 (FR-014 / data-model §4 / SC-006)。
 * 出すと決めた値 (ファイル名・コマンド名・subagent の種類) 以外の入力の値が出力に現れないことを固定する。
 */

const RUNNING: SessionView = deriveSessionView(
  { runState: 'running', failureReason: null, killed: false, ending: false, promptSent: true },
  undefined
)

const detailOf = (tool: string, input: unknown): string =>
  summarizeToolInput(tool, typeof input === 'string' ? input : JSON.stringify(input)).detail

const bash = (command: string): string => detailOf('Bash', { command })

describe('summarizeToolInput — 表の各行', () => {
  it('ファイルを扱う tool はパスの末尾 (POSIX と Windows の両方)', () => {
    for (const tool of ['Read', 'Edit', 'Write', 'MultiEdit']) {
      expect(detailOf(tool, { file_path: '/home/u/proj/src/a.ts' })).toBe('a.ts')
      expect(detailOf(tool, { file_path: 'C:\\dev\\proj\\b.tsx' })).toBe('b.tsx')
    }
    expect(detailOf('NotebookEdit', { notebook_path: '/w/n/analysis.ipynb' })).toBe(
      'analysis.ipynb'
    )
    expect(detailOf('NotebookEdit', { file_path: '/w/x.ipynb' })).toBe('')
  })

  it('Agent / Task は subagent の種類 (安全な文字だけ)', () => {
    expect(detailOf('Agent', { subagent_type: 'Explore', prompt: '秘密の依頼 sk-abc' })).toBe(
      'Explore'
    )
    expect(detailOf('Task', { subagent_type: 'general-purpose' })).toBe('general-purpose')
    expect(detailOf('Agent', { subagent_type: 'evil name' })).toBe('')
    expect(detailOf('Agent', { subagent_type: 'sk-live' })).toBe('')
    expect(detailOf('Agent', { description: 'x', prompt: 'y' })).toBe('')
  })

  it('Glob / Grep・規則の無い tool は tool 名だけ (検索語や入力は出さない)', () => {
    expect(summarizeToolInput('Grep', '{"pattern":"password=hunter2"}')).toEqual({
      tool: 'Grep',
      detail: ''
    })
    expect(detailOf('Glob', { pattern: '**/*.env' })).toBe('')
    expect(detailOf('WebFetch', { url: 'https://example.com/?token=abc' })).toBe('')
    expect(detailOf('mcp__x__y', { a: 1 })).toBe('')
  })

  it('JSON として読めない入力・フィールドが無い入力・型違いでは tool 名だけ', () => {
    expect(summarizeToolInput('Edit', '{broken')).toEqual({ tool: 'Edit', detail: '' })
    expect(summarizeToolInput('Edit', '[]')).toEqual({ tool: 'Edit', detail: '' })
    expect(summarizeToolInput('Edit', '')).toEqual({ tool: 'Edit', detail: '' })
    expect(detailOf('Edit', { path: 'a.ts' })).toBe('')
    expect(detailOf('Edit', { file_path: 42 })).toBe('')
    expect(detailOf('Bash', { command: ['ls'] })).toBe('')
    expect(summarizeToolInput(undefined, '{}')).toEqual({ tool: '', detail: '' })
  })
})

describe('summarizeToolInput — Bash のコマンド名', () => {
  it('クォート・バックスラッシュ・$・backtick・( があれば何も出さない', () => {
    expect(bash('TOKEN="a b" cmd')).toBe('')
    expect(bash("TOKEN='a b' cmd")).toBe('')
    expect(bash('FOO=a\\ b cmd')).toBe('')
    expect(bash('A=$( ghp_x ) cmd')).toBe('')
    expect(bash('A=`id` cmd')).toBe('')
    expect(bash('echo $HOME')).toBe('')
    expect(bash('(cd x && make)')).toBe('')
  })

  it('先頭の代入を飛ばし、最初の語のパスの末尾を出す', () => {
    expect(bash('A=1 B=2 cmd --flag value')).toBe('cmd')
    expect(bash('/home/user/bin/tool -x')).toBe('tool')
    expect(bash('  ls -la /etc')).toBe('ls')
    expect(bash('npm test\nnpm run lint')).toBe('npm')
    expect(bash('A=1')).toBe('')
    expect(bash('')).toBe('')
  })

  it('素の秘密の形・安全でない文字の名前は出さない', () => {
    expect(bash('ghp_abcdef123 --x')).toBe('')
    expect(bash('sk-ant-123')).toBe('')
    expect(bash('gho_x')).toBe('')
    expect(bash('glpat-x')).toBe('')
    expect(bash('AIzaSyX')).toBe('')
    expect(bash('xoxb-1')).toBe('')
    expect(bash('ツール')).toBe('')
    expect(bash(`${'a'.repeat(65)} x`)).toBe('')
  })

  it('sk- / ghp_ / AIza / Bearer の値がどのケースでも出ない', () => {
    const secrets = ['sk-SECRET', 'ghp_SECRET', 'AIzaSECRET', 'Bearer', 'SECRET']
    const commands = [
      'TOKEN=sk-SECRET cmd',
      'GH=ghp_SECRET git push',
      'KEY=AIzaSECRET node x.js',
      'curl -H "Authorization: Bearer SECRET" https://x',
      'curl -H Authorization:Bearer SECRET',
      'sk-SECRET',
      'A=$(echo ghp_SECRET) run',
      'export KEY=AIzaSECRET'
    ]
    for (const command of commands) {
      const { detail } = summarizeToolInput('Bash', JSON.stringify({ command }))
      for (const secret of secrets) expect(detail).not.toContain(secret)
    }
  })
})

/* ── deriveActivity の読み飛ばしと承認待ち ── */

const pending = (over: Partial<PendingPermission> = {}): PendingPermission => ({
  requestId: 'r1',
  toolName: 'Bash',
  input: JSON.stringify({ command: 'GH_TOKEN=ghp_SECRET git push origin main' }),
  scope: 'once',
  ...over
})

function toolCall(toolName: string, args: unknown, id = 'a1'): ThreadMessageLike {
  return {
    id,
    role: 'assistant',
    content: [
      {
        type: 'tool-call',
        toolCallId: 't1',
        toolName,
        args: {},
        argsText: JSON.stringify(args)
      }
    ]
  }
}

function systemEvent(id: string): ThreadMessageLike {
  const dto: TranscriptMessageDTO = {
    id,
    role: 'system',
    parts: [
      {
        type: 'system-event',
        category: 'hook',
        opens: true,
        name: 'setup',
        detail: 'SessionStart',
        status: 'started'
      }
    ],
    createdAt: null
  }
  return toThreadMessage(dto)
}

describe('deriveActivity — O-2 の規則', () => {
  it('承認待ちも同じ規則で要点だけを出す', () => {
    expect(deriveActivity([], pending(), RUNNING)).toEqual({
      kind: 'approval',
      tool: 'Bash',
      detail: 'git'
    })
    expect(
      deriveActivity(
        [],
        pending({ toolName: 'Write', input: '{"file_path":"/a/b/c.md","content":"x"}' }),
        RUNNING
      )
    ).toEqual({
      kind: 'approval',
      tool: 'Write',
      detail: 'c.md'
    })
    const secretFree = deriveActivity([], pending(), RUNNING)
    expect(JSON.stringify(secretFree)).not.toContain('ghp_')
  })

  it('tool の分岐も要点だけ', () => {
    expect(
      deriveActivity([toolCall('Bash', { command: 'TOKEN=sk-x npm test' })], null, RUNNING)
    ).toEqual({
      kind: 'tool',
      tool: 'Bash',
      detail: 'npm'
    })
  })

  it('末尾がシステムイベントの行・result: のメッセージでも、それより前の活動が出る', () => {
    const resultOnly: ThreadMessageLike = {
      ...toolCall('Bash', { command: 'ls' }, 'result:t9'),
      id: 'result:t9'
    }
    const messages = [
      toolCall('Edit', { file_path: 'src/x.ts' }),
      systemEvent('hook:h1'),
      resultOnly,
      systemEvent('task:t1')
    ]
    expect(deriveActivity(messages, null, RUNNING)).toEqual({
      kind: 'tool',
      tool: 'Edit',
      detail: 'x.ts'
    })
  })

  it('システムイベントの行しか無ければ null', () => {
    expect(deriveActivity([systemEvent('hook:h1')], null, RUNNING)).toBeNull()
  })
})
