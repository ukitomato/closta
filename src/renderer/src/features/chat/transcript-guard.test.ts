import { describe, expect, it } from 'vitest'

import { fromThreadMessageLike } from '@assistant-ui/react'

import type { TranscriptMessageDTO, TranscriptPartDTO } from '@domain/session/transcript-dto'

import { fromSystemEventData, isSystemEventMessage, toThreadMessage } from './convert'
import { decodeTranscriptMessage, isSystemEventPart } from './transcript-guard'

/**
 * O-2 FE-010 — transcript の本文の形の検証 (data-model §2「renderer の検証」) と、システムイベントの行の
 * assistant-ui への写し・復元 (§2「assistant-ui への写し」「renderer の store での合成」)。
 */

const EVENT: Extract<TranscriptPartDTO, { type: 'system-event' }> = {
  type: 'system-event',
  category: 'hook',
  opens: true,
  name: 'setup.sh',
  detail: 'SessionStart',
  status: 'started'
}

function eventMessage(over: Partial<typeof EVENT> = {}, id = 'hook:h1'): TranscriptMessageDTO {
  return { id, role: 'system', parts: [{ ...EVENT, ...over }], createdAt: 1_700_000_000_000 }
}

function toolMessage(over: Record<string, unknown> = {}): unknown {
  return {
    id: 'a1',
    role: 'assistant',
    createdAt: null,
    parts: [
      { type: 'text', text: '実行します' },
      {
        type: 'tool-call',
        toolCallId: 'c1',
        toolName: 'Bash',
        argsText: '{"command":"ls"}',
        result: 'out',
        isError: false,
        truncated: false,
        children: [],
        ...over
      }
    ]
  }
}

describe('isSystemEventPart (列挙は Object.hasOwn で照合)', () => {
  it('正しい形を通す。status は null も通す', () => {
    expect(isSystemEventPart(EVENT)).toBe(true)
    expect(isSystemEventPart({ ...EVENT, status: null })).toBe(true)
  })

  it('prototype のキー・知らない列挙・型違いは通さない', () => {
    for (const status of ['constructor', '__proto__', 'toString', 'hasOwnProperty', 'done', 1]) {
      expect(isSystemEventPart({ ...EVENT, status })).toBe(false)
    }
    for (const category of ['constructor', 'agent', null]) {
      expect(isSystemEventPart({ ...EVENT, category })).toBe(false)
    }
    expect(isSystemEventPart({ ...EVENT, opens: 'true' })).toBe(false)
    expect(isSystemEventPart({ ...EVENT, name: 1 })).toBe(false)
    expect(isSystemEventPart({ ...EVENT, detail: undefined })).toBe(false)
    expect(isSystemEventPart({ ...EVENT, type: 'event' })).toBe(false)
  })
})

describe('decodeTranscriptMessage', () => {
  it('外れた system-event の part だけのメッセージは破棄する (空の system を assistant-ui に渡さない)', () => {
    expect(decodeTranscriptMessage(eventMessage({ status: 'constructor' as never }))).toBeNull()
    expect(decodeTranscriptMessage(eventMessage())).toEqual(eventMessage())
  })

  it('tool-call の result が文字列でも null でもない part を落とす。isError / truncated も boolean だけ', () => {
    for (const over of [
      { result: 123 },
      { result: { html: '<b>x</b>' } },
      { result: undefined },
      { isError: 'yes' },
      { truncated: 1 },
      { children: 'x' }
    ]) {
      const decoded = decodeTranscriptMessage(toolMessage(over))
      expect(decoded?.parts.map((p) => p.type)).toEqual(['text'])
    }
    expect(decodeTranscriptMessage(toolMessage({ result: null }))?.parts).toHaveLength(2)
  })

  it('subagent の children も同じ規則で検証し、崩れた子を落とす', () => {
    const decoded = decodeTranscriptMessage(
      toolMessage({
        children: [
          { id: 'c-ok', role: 'assistant', createdAt: null, parts: [{ type: 'text', text: 'ok' }] },
          { id: 1, role: 'assistant', createdAt: null, parts: [] },
          eventMessage({ status: 'constructor' as never }, 'hook:bad')
        ]
      })
    )
    const tool = decoded?.parts[1]
    expect(tool?.type === 'tool-call' && tool.children.map((c) => c.id)).toEqual(['c-ok'])
  })

  it('id / role / parts / createdAt の崩れは破棄し、例外を投げない', () => {
    for (const bad of [
      null,
      'x',
      { ...eventMessage(), id: 1 },
      { ...eventMessage(), role: 'tool' },
      { ...eventMessage(), parts: [{}] },
      { ...eventMessage(), createdAt: 'x' }
    ]) {
      expect(() => decodeTranscriptMessage(bad)).not.toThrow()
      expect(decodeTranscriptMessage(bad)).toBeNull()
    }
  })
})

describe('convert — システムイベントの行 (data-model §2)', () => {
  it('role: assistant の data part 1 つと metadata.custom.systemEvent に写す', () => {
    const like = toThreadMessage(eventMessage())
    expect(like.role).toBe('assistant')
    expect(like.content).toEqual([
      {
        type: 'data',
        name: 'system-event',
        data: {
          category: 'hook',
          opens: true,
          name: 'setup.sh',
          detail: 'SessionStart',
          status: 'started'
        }
      }
    ])
    expect(isSystemEventMessage(like)).toBe(true)
    expect(isSystemEventMessage(toThreadMessage(toolMessage() as TranscriptMessageDTO))).toBe(false)
  })

  it('assistant-ui の変換が例外を投げない (system ロールの text 1 つの制約を避ける)', () => {
    expect(() =>
      fromThreadMessageLike(toThreadMessage(eventMessage()), 'fallback', {
        type: 'complete',
        reason: 'unknown'
      })
    ).not.toThrow()
    // text 1 つでない system (空など) も assistant に倒して例外を投げない。
    expect(() =>
      fromThreadMessageLike(
        toThreadMessage({ id: 's', role: 'system', parts: [], createdAt: null }),
        'fallback',
        { type: 'complete', reason: 'unknown' }
      )
    ).not.toThrow()
  })

  it('fromSystemEventData は DTO を復元する。行でない・形の崩れた data は undefined', () => {
    expect(fromSystemEventData(toThreadMessage(eventMessage()))).toEqual(eventMessage())
    expect(
      fromSystemEventData(toThreadMessage(toolMessage() as TranscriptMessageDTO))
    ).toBeUndefined()
    const like = toThreadMessage(eventMessage())
    expect(
      fromSystemEventData({
        ...like,
        content: [
          { type: 'data', name: 'system-event', data: { category: 'hook', status: 'constructor' } }
        ]
      })
    ).toBeUndefined()
  })
})
