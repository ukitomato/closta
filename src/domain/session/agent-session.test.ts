import { describe, expect, it } from 'vitest'

import {
  boundDecisionScope,
  isLaunchFailureReason,
  LAUNCH_FAILURE_REASONS,
  toPermissionResult,
  type PermissionDecision,
  type PermissionRequest
} from './agent-session'

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
  it('requestId / toolName / input / scope の 4 つだけ (toolUseId を足さない)', () => {
    const req: Record<keyof PermissionRequest, true> = {
      requestId: true,
      toolName: true,
      input: true,
      scope: true
    }
    expect(Object.keys(req).sort()).toEqual(['input', 'requestId', 'scope', 'toolName'])
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
