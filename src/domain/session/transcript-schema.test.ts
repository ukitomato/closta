import { describe, expect, it } from 'vitest'

import { toTranscriptMessages } from './transcript'
import {
  TRANSCRIPT_MESSAGE_FIELDS,
  TRANSCRIPT_PART_FIELDS,
  type TranscriptMessageDTO,
  type TranscriptPartDTO
} from './transcript-dto'

/**
 * DTO のフィールド集合が許可リストと完全一致することを固定する (SC-009)。
 *
 * **表示する生の逐語を運ぶフィールドが増えたらここが落ちる**形にし、
 * 露出面の追加を検査なしで通さない (R-2 の dto-schema.test と同型)。
 */

// 各 part variant の代表サンプル (型で網羅性を保証する)。
const SAMPLE_PARTS: { [K in TranscriptPartDTO['type']]: Extract<TranscriptPartDTO, { type: K }> } =
  {
    text: { type: 'text', text: 'x' },
    reasoning: { type: 'reasoning', text: 'x' },
    'tool-call': {
      type: 'tool-call',
      toolCallId: 'c',
      toolName: 'n',
      argsText: '{}',
      result: null,
      isError: false,
      truncated: false,
      children: []
    },
    image: { type: 'image', url: 'data:image/png;base64,AA' },
    file: { type: 'file', filename: 'f', text: '' },
    divider: { type: 'divider', label: 'l' },
    'system-event': {
      type: 'system-event',
      category: 'task',
      opens: true,
      name: 'n',
      detail: '',
      status: 'running'
    }
  }

describe('transcript DTO schema', () => {
  it('各 part variant のキーが許可リストと完全一致する', () => {
    for (const [type, sample] of Object.entries(SAMPLE_PARTS)) {
      const allowed = [...TRANSCRIPT_PART_FIELDS[type as TranscriptPartDTO['type']]].sort()
      const actual = Object.keys(sample).sort()
      expect(actual, `part type=${type}`).toEqual(allowed)
    }
  })

  it('toTranscriptMessages の出力メッセージが許可フィールドのみを持つ', () => {
    const out = toTranscriptMessages([
      { type: 'user', uuid: 'u1', message: { role: 'user', content: 'hi' } },
      {
        type: 'assistant',
        uuid: 'a1',
        message: {
          role: 'assistant',
          content: [
            { type: 'text', text: 't' },
            { type: 'thinking', thinking: 'r' },
            { type: 'tool_use', id: 'c1', name: 'Bash', input: { a: 1 } }
          ]
        }
      }
    ])
    const allowedMsg = [...TRANSCRIPT_MESSAGE_FIELDS].sort()
    // R-4: subagent 入れ子 (tool-call.children) を再帰的に検査する (SC-008)。
    const checkMessage = (m: TranscriptMessageDTO): void => {
      expect(Object.keys(m).sort()).toEqual(allowedMsg)
      for (const p of m.parts) {
        const allowed = [...TRANSCRIPT_PART_FIELDS[p.type]].sort()
        expect(Object.keys(p).sort(), `part type=${p.type}`).toEqual(allowed)
        if (p.type === 'tool-call') for (const child of p.children) checkMessage(child)
      }
    }
    for (const m of out) checkMessage(m)
  })

  it('subagent 入れ子 (children) の逐語フィールドも許可リストと一致する (R-4 / SC-008)', () => {
    const out = toTranscriptMessages([
      {
        type: 'assistant',
        uuid: 'a1',
        message: {
          role: 'assistant',
          content: [{ type: 'tool_use', id: 'task1', name: 'Task', input: { subagent_type: 's' } }]
        }
      },
      {
        type: 'assistant',
        uuid: 'sa1',
        parent_tool_use_id: 'task1',
        message: { role: 'assistant', content: [{ type: 'text', text: 'child' }] }
      }
    ])
    const taskPart = out[0].parts[0]
    expect(taskPart.type).toBe('tool-call')
    if (taskPart.type !== 'tool-call') return
    expect(taskPart.children).toHaveLength(1)
    const allowedMsg = [...TRANSCRIPT_MESSAGE_FIELDS].sort()
    expect(Object.keys(taskPart.children[0]).sort()).toEqual(allowedMsg)
  })

  it('表示する SessionMessage / content 種別すべてに割り当てがある (Principle XII 台帳)', () => {
    // data-model §3 の割り当て表に対応する part 種別が DTO に存在すること (O-2 で system-event。正本は docs/ui-coverage.md)。
    const covered = Object.keys(TRANSCRIPT_PART_FIELDS).sort()
    expect(covered).toEqual(
      ['divider', 'file', 'image', 'reasoning', 'system-event', 'text', 'tool-call'].sort()
    )
  })
})
