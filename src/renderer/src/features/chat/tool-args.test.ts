import { describe, expect, it } from 'vitest'

import {
  isKnownTodoStatus,
  parseBashArgs,
  parseEditArgs,
  parseMultiEditArgs,
  parsePlanArgs,
  parseTaskArgs,
  parseTodoArgs,
  parseWriteArgs
} from './tool-args'

/**
 * FE-021 — 各 tool の argsText narrowing (R-4 / SC-005 / contracts C-2)。
 *
 * **`tool-args.ts` は sanitize しない** — 入力は domain (`transcript.ts`) で `sanitizeBody` 済みの前提で、
 * ここは JSON.parse + 形の検査 (narrowing) のみを担う (design-gate M-N01)。bidi/C1 除去の正本テストは
 * `domain` の `transcript.test.ts`、DOM 端点は `ChatScreen.test.tsx`。
 * 失敗 (壊れた JSON / 型不一致 / 必須欠落 / 別名) は `null` を返し、呼び出し側が fallback に退避する。
 */

describe('tool-args narrowing', () => {
  it('parseBashArgs は command を取り出す (description は任意)', () => {
    expect(parseBashArgs('{"command":"ls -la"}')).toEqual({ command: 'ls -la' })
    expect(parseBashArgs('{"command":"ls","description":"一覧"}')).toEqual({
      command: 'ls',
      description: '一覧'
    })
  })

  it('parseEditArgs は file_path / old_string / new_string を取り出す', () => {
    expect(parseEditArgs('{"file_path":"a.ts","old_string":"x","new_string":"y"}')).toEqual({
      file_path: 'a.ts',
      old_string: 'x',
      new_string: 'y'
    })
  })

  it('parseWriteArgs は file_path / content を取り出す', () => {
    expect(parseWriteArgs('{"file_path":"a.ts","content":"body"}')).toEqual({
      file_path: 'a.ts',
      content: 'body'
    })
  })

  it('parseMultiEditArgs は edits[] を取り出す', () => {
    const out = parseMultiEditArgs(
      '{"file_path":"a.ts","edits":[{"old_string":"x","new_string":"y"}]}'
    )
    expect(out).toEqual({ file_path: 'a.ts', edits: [{ old_string: 'x', new_string: 'y' }] })
  })

  it('parseTodoArgs は todos[] を取り出し、未知 status も生値で保持する', () => {
    const out = parseTodoArgs(
      '{"todos":[{"content":"A","status":"completed"},{"content":"B","status":"blocked"}]}'
    )
    expect(out).toEqual({
      todos: [
        { content: 'A', status: 'completed' },
        { content: 'B', status: 'blocked' }
      ]
    })
    expect(isKnownTodoStatus('completed')).toBe(true)
    expect(isKnownTodoStatus('blocked')).toBe(false)
  })

  it('parseTaskArgs は subagent_type / description / prompt を取り出す (任意)', () => {
    expect(parseTaskArgs('{"subagent_type":"search","prompt":"find"}')).toEqual({
      subagent_type: 'search',
      prompt: 'find'
    })
  })

  it('parsePlanArgs は plan を取り出す', () => {
    expect(parsePlanArgs('{"plan":"# 計画"}')).toEqual({ plan: '# 計画' })
  })

  it('narrowing は値を改変しない (sanitize は domain の責務。値保持を確認)', () => {
    // 制御文字は domain で除去済みの前提。ここでは値をそのまま返すことを確認する。
    expect(parseBashArgs('{"command":"echo  spaced\\ttab"}')).toEqual({
      command: 'echo  spaced\ttab'
    })
  })

  describe('失敗時は null を返す (throw しない。SC-005)', () => {
    it('壊れた JSON', () => {
      expect(parseBashArgs('{bad json')).toBeNull()
      expect(parseEditArgs('not json at all')).toBeNull()
    })

    it('空文字', () => {
      expect(parseBashArgs('')).toBeNull()
    })

    it('必須フィールド欠落', () => {
      expect(parseBashArgs('{"description":"no command"}')).toBeNull()
      expect(parseEditArgs('{"file_path":"a"}')).toBeNull()
      expect(parseWriteArgs('{"file_path":"a"}')).toBeNull()
    })

    it('型不一致 (command が文字列でない)', () => {
      expect(parseBashArgs('{"command":123}')).toBeNull()
    })

    it('配列やプリミティブ (オブジェクトでない)', () => {
      expect(parseBashArgs('[1,2,3]')).toBeNull()
      expect(parseBashArgs('"just a string"')).toBeNull()
    })

    it('MultiEdit の edits が空 / 不正要素', () => {
      expect(parseMultiEditArgs('{"file_path":"a","edits":[]}')).toBeNull()
      expect(parseMultiEditArgs('{"file_path":"a","edits":[{"old_string":"x"}]}')).toBeNull()
    })

    it('Task が全フィールド欠落なら null (専用表示にせず fallback)', () => {
      expect(parseTaskArgs('{"unrelated":1}')).toBeNull()
    })

    it('TodoWrite の todos が配列でない', () => {
      expect(parseTodoArgs('{"todos":"nope"}')).toBeNull()
    })
  })
})
