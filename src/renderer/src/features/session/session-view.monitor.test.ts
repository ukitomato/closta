import { describe, expect, it } from 'vitest'

import type { ThreadMessageLike } from '@assistant-ui/react'

import type { LaunchFailureReason } from '@domain/session/agent-session'
import { countOccupying } from '@domain/session/concurrency'
import type { SessionStatusUpdate } from '@domain/session/status-update'

import type {
  LiveSessionState,
  PendingPermission,
  RunningSessionStoreState,
  StatusSince
} from './running-session-types'
import {
  ACTIVITY_MAX_CODE_POINTS,
  attentionCounts,
  attentionTransitions,
  deriveActivity,
  deriveSessionView,
  formatElapsed,
  nextAwaiting,
  slotUsage,
  toActivityLine,
  type SessionView
} from './session-view'

/** O-1 SH-003 — 監視ビューの導出の純関数 (data-model §2 / SC-001 / SC-002)。 */

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
const C = '33333333-3333-4333-8333-333333333333'

const RUNNING: SessionView = deriveSessionView(
  { runState: 'running', failureReason: null, killed: false, ending: false, promptSent: true },
  undefined
)
const WAITING: SessionView = deriveSessionView(
  { runState: 'done', failureReason: null, killed: false, ending: false, promptSent: true },
  undefined
)

const assistant = (content: ThreadMessageLike['content']): ThreadMessageLike => ({
  role: 'assistant',
  content,
  id: 'a1'
})
const user = (text: string): ThreadMessageLike => ({
  role: 'user',
  content: [{ type: 'text', text }],
  id: 'u1'
})
const toolCall = (toolName: string, argsText: string): ThreadMessageLike['content'] => [
  { type: 'text', text: 'ファイルを直します' },
  { type: 'tool-call', toolCallId: 't1', toolName, args: {}, argsText }
]
const pending = (over: Partial<PendingPermission> = {}): PendingPermission => ({
  requestId: 'r1',
  toolName: 'Bash',
  input: '{"command":"ls -la"}',
  scope: 'once',
  ...over
})

describe('toActivityLine (FR-006)', () => {
  it('文字列でなければ例外を投げず空', () => {
    for (const raw of [undefined, null, 1, {}, ['a']]) expect(toActivityLine(raw)).toBe('')
  })

  it('最初の空でない行を採り、CR・U+2028・U+2029 で行が分かれる', () => {
    expect(toActivityLine('\n  \nabc\ndef')).toBe('abc')
    expect(toActivityLine('one\rtwo')).toBe('one')
    expect(toActivityLine('one two')).toBe('one')
    expect(toActivityLine('one two')).toBe('one')
  })

  it('双方向制御文字を除き、タブと連続空白を畳む', () => {
    expect(toActivityLine('a‮b')).toBe('ab')
    expect(toActivityLine('  a\t\t b   c ')).toBe('a b c')
  })

  it('ゼロ幅文字・語結合子・タグ文字を除き、切り詰めの長さを不可視文字で埋めさせない (security L-001)', () => {
    expect(toActivityLine('a\u200Bb\u200Cc\u200Dd\u2060e\u2064f\u180Eg')).toBe('abcdefg')
    expect(toActivityLine('x\u{E0041}\u{E007F}y')).toBe('xy')
    const padded = toActivityLine('\u200B'.repeat(200) + '見える')
    expect(padded).toBe('見える')
  })

  it('80 コードポイントで切り詰めて … を付け、サロゲートペアを割らない', () => {
    const emoji = '😀'.repeat(ACTIVITY_MAX_CODE_POINTS + 5)
    const line = toActivityLine(emoji)
    expect(Array.from(line)).toHaveLength(ACTIVITY_MAX_CODE_POINTS + 1)
    expect(line.endsWith('…')).toBe(true)
    expect(line).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/)
  })

  it('HTML・マークダウンはそのまま文字列として返る', () => {
    expect(toActivityLine('<script>alert(1)</script>')).toBe('<script>alert(1)</script>')
    expect(toActivityLine('**太字**')).toBe('**太字**')
  })

  it('走査は上界に閉じる: 先頭に空行・空白行が 200KB 続く入力は空になる', () => {
    expect(toActivityLine('\n'.repeat(200_000) + 'late')).toBe('')
    expect(toActivityLine(' \n'.repeat(100_000) + 'late')).toBe('')
  })

  it('200KB の本文でも 1 行目が短ければ 1 行目を返す', () => {
    expect(toActivityLine('first\n' + 'x'.repeat(200_000))).toBe('first')
  })
})

describe('deriveActivity (FR-006 / data-model §2)', () => {
  // O-2 / FR-014: 入力の先頭 1 行ではなく tool ごとの要点 (summarizeToolInput) を出す。
  it('承認要求が他より優先され、入力が空でも tool 名は残る (要点はコマンド名だけ)', () => {
    const messages = [assistant(toolCall('Edit', '{"file_path":"a.ts"}'))]
    expect(deriveActivity(messages, pending(), RUNNING)).toEqual({
      kind: 'approval',
      tool: 'Bash',
      detail: 'ls'
    })
    expect(deriveActivity([], pending({ input: '' }), RUNNING)).toEqual({
      kind: 'approval',
      tool: 'Bash',
      detail: ''
    })
  })

  it('応答中で末尾が tool の呼び出しなら tool 名とファイル名', () => {
    const messages = [assistant(toolCall('Edit', '{"file_path":"src/a.ts"}'))]
    expect(deriveActivity(messages, null, RUNNING)).toEqual({
      kind: 'tool',
      tool: 'Edit',
      detail: 'a.ts'
    })
  })

  it('応答中でなければ末尾が tool の呼び出しでも本文を返す', () => {
    const messages = [assistant(toolCall('Edit', '{}'))]
    expect(deriveActivity(messages, null, WAITING)).toEqual({
      kind: 'reply',
      tool: null,
      detail: 'ファイルを直します'
    })
  })

  it('送信直後 (末尾が user) はプロンプトの先頭行', () => {
    expect(
      deriveActivity([assistant('前の応答'), user('直してください\n詳細')], null, RUNNING)
    ).toEqual({ kind: 'prompt', tool: null, detail: '直してください' })
  })

  it('reply は part を連結せず、最初に空でない行を出した part で止まる。text が非文字列の part は飛ばす', () => {
    const content = [
      { type: 'text', text: undefined },
      { type: 'text', text: '\n' },
      { type: 'text', text: 'まとめ' },
      { type: 'text', text: '続き' }
    ] as unknown as ThreadMessageLike['content']
    expect(deriveActivity([assistant(content)], null, WAITING)).toEqual({
      kind: 'reply',
      tool: null,
      detail: 'まとめ'
    })
  })

  it('reply の走査は part をまたいで上界に閉じる (200KB の空行の part が 20 個)', () => {
    const content = Array.from({ length: 20 }, () => ({
      type: 'text' as const,
      text: '\n'.repeat(200_000)
    }))
    expect(
      deriveActivity([assistant([...content, { type: 'text', text: 'late' }])], null, WAITING)
    ).toBeNull()
  })

  it('メッセージが無ければ null。末尾 1 件 (システムイベントの行・結果だけのメッセージを除く) より前は見ない', () => {
    expect(deriveActivity([], null, RUNNING)).toBeNull()
    expect(
      deriveActivity(
        [assistant('古い応答'), assistant([{ type: 'reasoning', text: 'x' }])],
        null,
        WAITING
      )
    ).toBeNull()
  })
})

describe('formatElapsed (FR-005)', () => {
  it('境界', () => {
    expect(formatElapsed(59_999)).toEqual({ unit: 'sec', sec: 59 })
    expect(formatElapsed(60_000)).toEqual({ unit: 'min', min: 1 })
    expect(formatElapsed(59 * 60_000 + 59_999)).toEqual({ unit: 'min', min: 59 })
    expect(formatElapsed(60 * 60_000)).toEqual({ unit: 'hourMin', hour: 1, min: 0 })
    expect(formatElapsed((3 * 60 + 25) * 60_000)).toEqual({ unit: 'hourMin', hour: 3, min: 25 })
  })

  it('負の値は 0 秒', () => {
    expect(formatElapsed(-5_000)).toEqual({ unit: 'sec', sec: 0 })
  })
})

/* ── ストアの状態を組んで導く関数 ── */

function session(id: string, over: Partial<LiveSessionState> = {}): LiveSessionState {
  return {
    sessionId: id,
    config: {
      folderId: 'f1',
      runtimeId: 'wsl:Ubuntu',
      providerId: null,
      modelId: null,
      effort: null,
      permissionMode: 'default'
    },
    startedAt: 0,
    runState: 'running',
    messages: [],
    pending: null,
    elicitations: [],
    denied: [],
    failureReason: null,
    killed: false,
    ending: false,
    endForced: false,
    promptSent: true,
    queueRejection: null,
    folderLabel: null,
    launchOrigin: 'manual',
    ...over
  }
}

function status(id: string, over: Partial<SessionStatusUpdate> = {}): SessionStatusUpdate {
  return { sessionId: id, state: 'running', reasonKey: null, claudeAlive: true, ...over }
}

function state(
  entries: readonly [string, Partial<LiveSessionState>, Partial<SessionStatusUpdate>?][],
  over: Partial<RunningSessionStoreState> = {}
): RunningSessionStoreState {
  const sessions: Record<string, LiveSessionState> = {}
  const statuses: Record<string, SessionStatusUpdate> = {}
  for (const [id, s, st] of entries) {
    sessions[id] = session(id, s)
    statuses[id] = status(id, { state: s.runState ?? 'running', ...st })
  }
  return {
    order: entries.map(([id]) => id),
    sessions,
    statuses,
    selectedId: null,
    selectionSeq: 0,
    launch: {
      phase: 'entry',
      rejectReason: null,
      lastConfig: null,
      lastOrigin: null,
      previousFailure: null
    },
    statusSince: {},
    activity: {},
    receivedMessages: 0,
    density: 'comfortable',
    meters: {},
    ...over
  }
}

describe('slotUsage (FR-007)', () => {
  it('launching / done / interrupted / 生存中の error / 強制終了後の生存中を数え、生存フラグ false を数えない', () => {
    const s = state([
      [A, { runState: 'launching', promptSent: false }],
      [B, { runState: 'done' }],
      [C, { runState: 'interrupted' }],
      ['d', { runState: 'error' }, { state: 'error' }],
      ['e', { runState: 'running', killed: true }],
      ['f', { runState: 'done' }, { claudeAlive: false }]
    ])
    expect(slotUsage(s)).toEqual({ used: 5, limit: 10 })
    expect(slotUsage(s).used).toBe(
      countOccupying(s.order.map((id) => ({ claudeAlive: s.statuses[id]?.claudeAlive !== false })))
    )
  })

  it('起動要求中は +1', () => {
    const s = state([[A, {}]], {
      launch: {
        phase: 'launching',
        rejectReason: null,
        lastConfig: null,
        lastOrigin: null,
        previousFailure: null
      }
    })
    expect(slotUsage(s).used).toBe(2)
  })
})

describe('attentionCounts / nextAwaiting (FR-002 / FR-003)', () => {
  const since = (entries: Record<string, number>): Record<string, StatusSince> =>
    Object.fromEntries(
      Object.entries(entries).map(([id, at]) => [id, { status: 'awaiting' as const, at }])
    )

  it('承認待ちと失敗の数', () => {
    const s = state([
      [A, { runState: 'awaiting_permission' }],
      [B, { runState: 'error' }, { state: 'error' }],
      [C, { runState: 'running' }]
    ])
    expect(attentionCounts(s)).toEqual({ awaiting: 1, failed: 1 })
  })

  it('表示中を除いた最古へ。表示中が列に無いときも最古', () => {
    const s = state(
      [
        [A, { runState: 'awaiting_permission' }],
        [B, { runState: 'awaiting_permission' }],
        [C, { runState: 'running' }]
      ],
      { statusSince: since({ [A]: 200, [B]: 100 }), selectedId: C }
    )
    expect(nextAwaiting(s)).toBe(B)
    expect(nextAwaiting({ ...s, selectedId: B })).toBe(A)
  })

  it('表示中しか承認待ちが無い・0 本なら null。同時刻は order の順', () => {
    const only = state([[A, { runState: 'awaiting_permission' }]], {
      statusSince: since({ [A]: 1 }),
      selectedId: A
    })
    expect(nextAwaiting(only)).toBeNull()
    expect(nextAwaiting(state([[A, {}]]))).toBeNull()
    const tie = state(
      [
        [A, { runState: 'awaiting_permission' }],
        [B, { runState: 'awaiting_permission' }]
      ],
      { statusSince: since({ [A]: 5, [B]: 5 }) }
    )
    expect(nextAwaiting(tie)).toBe(A)
  })
})

/**
 * O-4 FR-018 (2): 導出は名前の組までを返す (文は `labels.ts` の `attentionAnnouncement` が組む。文の検査は
 * `labels.test.ts`、読み上げの振る舞いは `SessionAttentionAnnouncer` を通す component テスト)。
 */
describe('attentionTransitions (FR-004 / SC-001)', () => {
  const entry = (status: StatusSince['status']): StatusSince => ({ status, at: 1 })
  const label = (id: string): string | null => ({ [A]: '案件A', [B]: '案件B' })[id] ?? null

  it('見ていないセッションが承認待ち・失敗に入ったときだけ名前の組を返す', () => {
    expect(
      attentionTransitions({ [A]: entry('running') }, { [A]: entry('awaiting') }, null, label)
    ).toEqual({ awaiting: ['案件A'], failed: [] })
    expect(
      attentionTransitions({ [A]: entry('running') }, { [A]: entry('failed') }, null, label)
    ).toEqual({ awaiting: [], failed: [{ name: '案件A', reason: null }] })
  })

  it('失敗には理由のキーを添える (O-4 US-1 AC5。理由を引けなければ null)', () => {
    const reason = (id: string): LaunchFailureReason | null => (id === A ? 'rate-limited' : null)
    expect(
      attentionTransitions(
        { [A]: entry('running'), [B]: entry('running') },
        { [A]: entry('failed'), [B]: entry('failed') },
        null,
        label,
        reason
      )
    ).toEqual({
      awaiting: [],
      failed: [
        { name: '案件A', reason: 'rate-limited' },
        { name: '案件B', reason: null }
      ]
    })
  })

  it('同じ更新の複数の遷移は 1 つの組', () => {
    expect(
      attentionTransitions(
        { [A]: entry('running'), [B]: entry('running') },
        { [A]: entry('awaiting'), [B]: entry('awaiting') },
        null,
        label
      )
    ).toEqual({ awaiting: ['案件A', '案件B'], failed: [] })
    expect(
      attentionTransitions(
        { [A]: entry('running'), [B]: entry('running') },
        { [A]: entry('awaiting'), [B]: entry('failed') },
        null,
        label
      )
    ).toEqual({ awaiting: ['案件A'], failed: [{ name: '案件B', reason: null }] })
  })

  it('見ているセッション・変わらない状態・応答中 ⇄ 応答待ちでは null。中央が稼働中でない (watchedId null) なら選ばれていたものも返す', () => {
    const prev = { [A]: entry('running') }
    const next = { [A]: entry('awaiting') }
    expect(attentionTransitions(prev, next, A, label)).toBeNull()
    expect(attentionTransitions(next, next, null, label)).toBeNull()
    expect(attentionTransitions(prev, { [A]: entry('waiting') }, null, label)).toBeNull()
    expect(attentionTransitions(prev, next, null, label)).not.toBeNull()
  })

  it('表示名が引けないセッションは null の名前で組に入る (代替語は文を組む側が入れる)', () => {
    expect(attentionTransitions({}, { [C]: entry('awaiting') }, null, label)).toEqual({
      awaiting: [null],
      failed: []
    })
  })
})
