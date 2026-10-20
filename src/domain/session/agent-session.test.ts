import { describe, expect, it } from 'vitest'

import {
  boundDecisionScope,
  isLaunchFailureReason,
  isWin32LaunchSpec,
  isPermissionAnswers,
  LAUNCH_FAILURE_REASONS,
  projectAskUserQuestionAnswer,
  toAskUserQuestionResult,
  toPermissionResult,
  WIN32_TREE_STOP_ARGS,
  WIN32_TREE_STOP_COMMAND_NAME,
  WSL_LAUNCH_KIND,
  type PermissionDecision,
  type PermissionRequest,
  type RuntimeLaunchSpec,
  type WslLaunchSpec
} from './agent-session'
import { WIN32_LAUNCH_SPEC_FIXTURE } from './__fixtures__/win32-launch-spec'

describe('toPermissionResult (正の構成 P2)', () => {
  it('allow は {behavior} のみ、deny は {behavior, message} のみ (updatedPermissions/updatedInput を出さない)', () => {
    const allow = toPermissionResult({ requestId: 'r1', outcome: 'allow', scope: 'once' })
    // **キー集合 ⊆ {behavior, message} を assert** — 変数を列挙せず正の構成で閉じる (C-101/C-201/H-201/L-201)。
    expect(Object.keys(allow).sort()).toEqual(['behavior'])
    expect(allow.behavior).toBe('allow')

    const deny = toPermissionResult({ requestId: 'r2', outcome: 'deny', scope: 'once' })
    const allowed = ['behavior', 'message']
    expect(Object.keys(deny).every((k) => allowed.includes(k))).toBe(true)
    expect(deny.behavior).toBe('deny')
  })

  it('deny の message は decision の message を使い、無ければ既定', () => {
    const withMsg = toPermissionResult({
      requestId: 'r3',
      outcome: 'deny',
      scope: 'capability',
      message: '危険なため拒否'
    })
    expect(withMsg.message).toBe('危険なため拒否')
    const noMsg = toPermissionResult({ requestId: 'r4', outcome: 'deny', scope: 'once' })
    expect(typeof noMsg.message).toBe('string')
  })

  it('出力に昇格フィールドが決して現れない (全 outcome/scope の組み合わせ)', () => {
    const forbidden = ['updatedPermissions', 'updatedInput']
    for (const outcome of ['allow', 'deny'] as const) {
      for (const scope of ['once', 'capability'] as const) {
        const result = toPermissionResult({ requestId: 'x', outcome, scope })
        for (const key of forbidden) {
          expect(Object.prototype.hasOwnProperty.call(result, key)).toBe(false)
        }
      }
    }
  })
})

describe('PermissionRequest のフィールドの集合 (O-6 SC-005。足すと session の契約が変わる)', () => {
  it('requestId / toolName / input / scope と任意の answerable (O-10) だけ (toolUseId を足さない)', () => {
    const req: Record<keyof PermissionRequest, true> = {
      requestId: true,
      toolName: true,
      input: true,
      scope: true,
      answerable: true
    }
    expect(Object.keys(req).sort()).toEqual([
      'answerable',
      'input',
      'requestId',
      'scope',
      'toolName'
    ])
  })
})

describe('isPermissionAnswers (O-10 / data-model §1)', () => {
  it('正例: 1〜4 件・前後に空白のある有効な回答・1,000 コードポイント', () => {
    expect(isPermissionAnswers(['a'])).toBe(true)
    expect(isPermissionAnswers(['a', 'b', 'c', 'd'])).toBe(true)
    expect(isPermissionAnswers([' a '])).toBe(true)
    expect(isPermissionAnswers(['a'.repeat(1000)])).toBe(true)
    // サロゲートペアは 1 コードポイント (1,000 個で通り、1,001 個で落ちる)。
    expect(isPermissionAnswers(['😀'.repeat(1000)])).toBe(true)
    expect(isPermissionAnswers(['😀'.repeat(1001)])).toBe(false)
  })
  it.each([
    ['0 件', []],
    ['5 件', ['a', 'b', 'c', 'd', 'e']],
    ['数', [1]],
    ['null を含む', ['a', null]],
    ['1,001 コードポイント', ['a'.repeat(1001)]],
    ['空文字', ['']],
    ['空白だけ', ['   ']],
    ['改行だけ', ['\n']],
    ['全角の空白だけ', ['　']],
    ['配列でない', 'a'],
    ['object', { 0: 'a' }]
  ])('負例: %s', (_name, value) => {
    expect(isPermissionAnswers(value)).toBe(false)
  })
})

describe('projectAskUserQuestionAnswer / toAskUserQuestionResult (O-10 / AD-052。SC-001 / SC-002)', () => {
  const q = (question: string, extra: Record<string, unknown> = {}): Record<string, unknown> => ({
    question,
    header: 'h',
    options: [{ label: 'x' }],
    ...extra
  })
  const decision = (answers?: readonly string[]): PermissionDecision => ({
    requestId: 'r',
    outcome: 'allow',
    scope: 'once',
    ...(answers !== undefined ? { answers } : {})
  })

  it('問い 1 件・4 件・multiSelect・その他の自由記述で元の入力 + answers になる', () => {
    const one = { questions: [q('A?')] }
    expect(projectAskUserQuestionAnswer(one, ['x'])).toEqual({ ...one, answers: { 'A?': 'x' } })
    const four = { questions: [q('1'), q('2'), q('3'), q('4', { multiSelect: true })] }
    expect(projectAskUserQuestionAnswer(four, ['a', 'b', 'c', 'x, 自由記述'])).toEqual({
      ...four,
      answers: { '1': 'a', '2': 'b', '3': 'c', '4': 'x, 自由記述' }
    })
  })

  it('元の入力の他のキーを変えず (浅い複製)、既にある answers を置き換え、annotations を足さない', () => {
    const input = { questions: [q('A?')], metadata: { s: 1 }, answers: { old: 'o' } }
    const out = projectAskUserQuestionAnswer(input, ['x'])
    expect(out).not.toBeNull()
    if (out === null) return
    expect(Object.keys(out).sort()).toEqual(['answers', 'metadata', 'questions'])
    expect(out.metadata).toBe(input.metadata)
    expect(out.answers).toEqual({ 'A?': 'x' })
    expect(input.answers).toEqual({ old: 'o' })
    expect(Object.prototype.hasOwnProperty.call(out, 'annotations')).toBe(false)
  })

  it.each([
    ['questions が配列でない', { questions: 'x' }, ['a']],
    ['問いが 0 件', { questions: [] }, ['a']],
    ['問いが 5 件', { questions: [q('1'), q('2'), q('3'), q('4'), q('5')] }, ['a', 'b', 'c', 'd']],
    ['件数違い', { questions: [q('A?'), q('B?')] }, ['a']],
    ['1,001 コードポイント', { questions: [q('A?')] }, ['a'.repeat(1001)]],
    ['空の回答', { questions: [q('A?')] }, ['']],
    ['空白だけ', { questions: [q('A?')] }, ['   ']],
    ['改行だけ', { questions: [q('A?')] }, ['\n']],
    ['重なる問いの文', { questions: [q('A?'), q('A?')] }, ['a', 'b']],
    ['問いが object でない', { questions: ['A?'] }, ['a']],
    ['question が空', { questions: [q('')] }, ['a']],
    ['入力が object でない', 'x', ['a']],
    ['入力が配列', [], ['a']]
  ])('負例 %s は null', (_name, input, answers) => {
    expect(projectAskUserQuestionAnswer(input, answers)).toBeNull()
  })

  it('answers が object (renderer が問いの文を送った形) は null', () => {
    const bad: unknown = { 'A?': 'x' }
    // @ts-expect-error 型の外の値を渡す負例
    expect(projectAskUserQuestionAnswer({ questions: [q('A?')] }, bad)).toBeNull()
  })

  it('__proto__ の問いの文で原型を書き換えない', () => {
    const out = projectAskUserQuestionAnswer({ questions: [q('__proto__')] }, ['x'])
    expect(out).not.toBeNull()
    expect(({} as Record<string, unknown>).x).toBeUndefined()
    if (out === null) return
    const answers = out.answers as Record<string, unknown>
    expect(Object.getPrototypeOf(answers)).toBe(Object.prototype)
    expect(Object.keys(answers)).toEqual(['__proto__'])
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })

  it('許可の出力のキーは {behavior, updatedInput}、updatedInput のキーは元のキー ∪ {answers}、updatedPermissions は無い', () => {
    const input = { questions: [q('A?')], extra: 1 }
    const result = toAskUserQuestionResult(decision(['x']), input)
    expect(Object.keys(result).sort()).toEqual(['behavior', 'updatedInput'])
    if (!('updatedInput' in result)) throw new Error('updatedInput が無い')
    expect(Object.keys(result.updatedInput).sort()).toEqual(['answers', 'extra', 'questions'])
    expect(Object.prototype.hasOwnProperty.call(result, 'updatedPermissions')).toBe(false)
  })

  it('deny は toPermissionResult と同じ。allow で answers が無い・射影の失敗は deny', () => {
    const input = { questions: [q('A?')] }
    expect(
      toAskUserQuestionResult(
        { requestId: 'r', outcome: 'deny', scope: 'once', message: 'm' },
        input
      )
    ).toEqual({ behavior: 'deny', message: 'm' })
    const noAnswers = toAskUserQuestionResult(decision(), input)
    expect(noAnswers.behavior).toBe('deny')
    expect(Object.keys(noAnswers).every((k) => ['behavior', 'message'].includes(k))).toBe(true)
    const failed = toAskUserQuestionResult(decision(['a', 'b']), input)
    expect(failed.behavior).toBe('deny')
    expect('updatedInput' in failed).toBe(false)
  })

  it('toPermissionResult は answers があっても {behavior, message} のキーだけ', () => {
    const r = toPermissionResult(decision(['x']))
    expect(Object.keys(r)).toEqual(['behavior'])
  })
})

describe('boundDecisionScope (scope 上限。FR-012 / H-04 / SC-004)', () => {
  it('once 要求に capability 決定を受理しない (once に丸め、allow/deny は保つ)', () => {
    const bounded = boundDecisionScope(
      { requestId: 'r', outcome: 'allow', scope: 'capability' },
      'once'
    )
    // capability 昇格を締め出す — scope は once に下がるが判断は allow のまま。
    expect(bounded.scope).toBe('once')
    expect(bounded.outcome).toBe('allow')
  })

  it('deny の capability 決定も once に丸める (負例。X-1 は要求が常に once)', () => {
    const bounded = boundDecisionScope(
      { requestId: 'r', outcome: 'deny', scope: 'capability', message: 'x' },
      'once'
    )
    expect(bounded.scope).toBe('once')
    expect(bounded.outcome).toBe('deny')
  })

  it('capability 要求なら capability 決定を保つ (I-3 の付与経路。AD-041 (c))', () => {
    const bounded = boundDecisionScope(
      { requestId: 'r', outcome: 'allow', scope: 'capability' },
      'capability'
    )
    expect(bounded.scope).toBe('capability')
  })

  it('once 決定はそのまま通す', () => {
    const bounded = boundDecisionScope({ requestId: 'r', outcome: 'allow', scope: 'once' }, 'once')
    expect(bounded).toEqual({ requestId: 'r', outcome: 'allow', scope: 'once' })
  })
})

describe('isLaunchFailureReason', () => {
  it('18 種の起動とターンの失敗理由を受理し、それ以外を拒否 (X-5 で supervisor-exited、O-4 で 8 種)', () => {
    expect(LAUNCH_FAILURE_REASONS).toHaveLength(18)
    expect([...LAUNCH_FAILURE_REASONS].sort()).toEqual(
      [
        'distro-not-running',
        'not-verified-running',
        'distro-mismatch',
        'claude-not-found',
        'launch-failed',
        'process-crashed',
        'stream-protocol-error',
        'provider-error',
        'interrupt-unavailable',
        'supervisor-exited',
        'max-turns',
        'max-budget',
        'structured-output-retries',
        'execution-error',
        'auth-failed',
        'billing',
        'rate-limited',
        'api-error'
      ].sort()
    )
    for (const reason of LAUNCH_FAILURE_REASONS) {
      expect(isLaunchFailureReason(reason)).toBe(true)
    }
    expect(isLaunchFailureReason('enumeration-failed')).toBe(false)
    expect(isLaunchFailureReason(42)).toBe(false)
    expect(isLaunchFailureReason(null)).toBe(false)
  })

  function assertPermissionDecisionShape(d: PermissionDecision): void {
    expect(['allow', 'deny']).toContain(d.outcome)
  }

  it('PermissionDecision の形 (型の健全性の最小確認)', () => {
    assertPermissionDecisionShape({ requestId: 'r', outcome: 'allow', scope: 'once' })
  })
})

describe('Win32 の起動の値と定数 (X-8 / AD-058)', () => {
  it('停止の引数と停止のコマンドの名前の正本 (集合を変えるには ADR が要る。AD-058)', () => {
    expect([...WIN32_TREE_STOP_ARGS]).toEqual(['/T', '/F', '/PID'])
    expect(WIN32_TREE_STOP_COMMAND_NAME).toBe('taskkill.exe')
  })

  it('kind の無い値は WSL として絞られ、kind: win32 は Win32 として絞られる', () => {
    const wsl: WslLaunchSpec = {
      pathToClaudeCodeExecutable: '/usr/bin/claude',
      command: 'C:\\launcher\\value',
      prefixArgs: ['--exec'],
      env: {}
    }
    const specs: RuntimeLaunchSpec[] = [
      wsl,
      { ...wsl, kind: WSL_LAUNCH_KIND },
      WIN32_LAUNCH_SPEC_FIXTURE
    ]
    expect(specs.map(isWin32LaunchSpec)).toEqual([false, false, true])
  })

  it('正規の fixture は固定の形 (windowsHide は true・argsBeforePid は WIN32_TREE_STOP_ARGS と一致)', () => {
    expect(WIN32_LAUNCH_SPEC_FIXTURE.windowsHide).toBe(true)
    expect(WIN32_LAUNCH_SPEC_FIXTURE.stop.argsBeforePid).toEqual([...WIN32_TREE_STOP_ARGS])
    expect(WIN32_LAUNCH_SPEC_FIXTURE.command).toBe(
      WIN32_LAUNCH_SPEC_FIXTURE.pathToClaudeCodeExecutable
    )
  })
})
