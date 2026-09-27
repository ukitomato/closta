import { describe, expect, it, vi } from 'vitest'

import type { PermissionDecision, RuntimeLaunchSpec } from '@domain/session/agent-session'

import {
  buildQueryOptions,
  classifyResult,
  composeClaudeSpawn,
  createCanUseTool,
  QUERY_OPTION_KEYS,
  type AgentSpawnOptions,
  type SpawnedLike
} from './session-core'

const noopSpawn = (): SpawnedLike => ({ kill: () => true })

describe('buildQueryOptions (正の構成 P1)', () => {
  it('options のキー集合が allowlist の完全部分集合 (余分なキーが無い)', () => {
    const options = buildQueryOptions({
      canUseTool: async () => ({ behavior: 'deny', message: 'x' }),
      pathToClaudeCodeExecutable: '/usr/bin/claude',
      spawnClaudeCodeProcess: noopSpawn,
      abortController: new AbortController()
    })
    const keys = Object.keys(options)
    // **キー集合 ⊆ allowlist** — settings/extraArgs/allowedTools 等の昇格 option が現れない (C-201)。
    for (const key of keys) {
      expect(QUERY_OPTION_KEYS as readonly string[]).toContain(key)
    }
    expect(options.permissionMode).toBe('default')
  })

  it('昇格 option キーが決して現れない', () => {
    const options = buildQueryOptions({
      canUseTool: async () => ({ behavior: 'allow' }),
      pathToClaudeCodeExecutable: '/usr/bin/claude',
      spawnClaudeCodeProcess: noopSpawn,
      abortController: new AbortController()
    })
    const forbidden = [
      'settings',
      'extraArgs',
      'allowedTools',
      'disallowedTools',
      'permissionPromptToolName',
      'allowDangerouslySkipPermissions',
      'mcpServers'
    ]
    for (const key of forbidden) {
      expect(Object.prototype.hasOwnProperty.call(options, key)).toBe(false)
    }
  })
})

describe('createCanUseTool (正の構成 P2)', () => {
  it('全 return が toPermissionResult 経由で {behavior, message} のみ', async () => {
    const decision: PermissionDecision = { requestId: 'r1', outcome: 'deny', scope: 'once' }
    const emitRequest = vi.fn()
    const canUseTool = createCanUseTool({
      nextRequestId: () => 'r1',
      sanitizeInput: () => '{"path":"/x"}',
      sanitizeToolName: (n) => n,
      emitRequest,
      awaitDecision: async () => decision
    })

    const result = await canUseTool(
      'Bash',
      { command: 'ls' },
      { signal: new AbortController().signal }
    )
    // updatedPermissions/updatedInput が現れない (C-101/H-201/L-201 を一括で閉じる)。
    for (const key of Object.keys(result)) {
      expect(['behavior', 'message']).toContain(key)
    }
    expect(result.behavior).toBe('deny')
    expect(emitRequest).toHaveBeenCalledOnce()
  })

  it('allow の決定は {behavior:allow} のみ', async () => {
    const canUseTool = createCanUseTool({
      nextRequestId: () => 'r2',
      sanitizeInput: () => '{}',
      sanitizeToolName: (n) => n,
      emitRequest: () => {},
      awaitDecision: async () => ({ requestId: 'r2', outcome: 'allow', scope: 'once' })
    })
    const result = await canUseTool('Read', {}, { signal: new AbortController().signal })
    expect(result).toEqual({ behavior: 'allow' })
  })

  it('toolName をサニタイズして emit する (H-05)', async () => {
    const emitRequest = vi.fn()
    const canUseTool = createCanUseTool({
      nextRequestId: () => 'r3',
      sanitizeInput: () => '{}',
      sanitizeToolName: () => 'Bash',
      emitRequest,
      awaitDecision: async () => ({ requestId: 'r3', outcome: 'deny', scope: 'once' })
    })
    // 双方向制御文字を含む偽装 tool 名を渡してもサニタイズ済みが emit される。
    await canUseTool('Read\u202eBash', {}, { signal: new AbortController().signal })
    expect(emitRequest).toHaveBeenCalledWith(expect.objectContaining({ toolName: 'Bash' }))
  })
})

describe('composeClaudeSpawn (env は spec のみ・argv は配列)', () => {
  // command は不透明トークンで十分 (composeClaudeSpawn は spec.command を素通しするだけ)。
  // 実リテラルは infra の WSL_BINARY に閉じており、テストで再掲しない (check.mjs 項目 3)。
  const launcher = 'launcher-bin'
  const spec: RuntimeLaunchSpec = {
    pathToClaudeCodeExecutable: '/home/u/.local/bin/claude',
    command: launcher,
    prefixArgs: ['--cd', '/home/u/proj', '-d', 'Ubuntu', '--'],
    env: { SystemRoot: 'C:\\Windows', WSL_UTF8: '1' }
  }

  it('env は spec.env のみ (options.env / process.env を混ぜない。H-01/H-102)', () => {
    const options: AgentSpawnOptions = {
      command: 'node',
      args: ['--flag'],
      env: { ANTHROPIC_API_KEY: 'secret', WSLENV: 'PATH/l' }
    }
    const plan = composeClaudeSpawn(spec, options)
    expect(plan.env).toEqual({ SystemRoot: 'C:\\Windows', WSL_UTF8: '1' })
    // 汚染された options.env のキーが 1 つも漏れない。
    expect(Object.prototype.hasOwnProperty.call(plan.env, 'ANTHROPIC_API_KEY')).toBe(false)
    expect(Object.prototype.hasOwnProperty.call(plan.env, 'WSLENV')).toBe(false)
  })

  it('command は spec.command、argv は配列で --cd 経由 + SDK args を後置', () => {
    const options: AgentSpawnOptions = { command: 'node', args: ['claude.js', '--print'] }
    const plan = composeClaudeSpawn(spec, options)
    expect(plan.command).toBe(launcher)
    expect(Array.isArray(plan.args)).toBe(true)
    expect(plan.args).toEqual([
      '--cd',
      '/home/u/proj',
      '-d',
      'Ubuntu',
      '--',
      '/home/u/.local/bin/claude',
      'claude.js',
      '--print'
    ])
    // シェル補間を誘発する単一文字列に連結していない (各要素が独立 argv)。
    expect(plan.args.some((a) => a.includes(' && ') || a.includes('$('))).toBe(false)
  })

  it('合成後 argv に権限昇格フラグが現れない (L-404 / SH-020(a)(iii))', () => {
    // SDK が汚染された args を渡しても、composeClaudeSpawn は素通しするだけで昇格フラグを足さない。
    // 昇格は options のキー (P1) と Query メソッド (P3) で塞ぐのが正本だが、argv 側も負例で確認する。
    const options: AgentSpawnOptions = { command: 'node', args: ['cli.js'] }
    const plan = composeClaudeSpawn(spec, options)
    const escalationFlags = [
      '--dangerously-skip-permissions',
      '--permission-mode',
      '--allowedTools',
      '--disallowedTools',
      '--settings'
    ]
    for (const flag of escalationFlags) {
      expect(plan.args).not.toContain(flag)
    }
  })
})

describe('classifyResult (V-11 / FR-030 — 認証失敗を黙って done にしない)', () => {
  it('success かつ is_error=false のみ complete', () => {
    expect(classifyResult('success', false)).toEqual({ kind: 'complete' })
  })

  it('success でも is_error=true なら provider-error', () => {
    expect(classifyResult('success', true)).toEqual({ kind: 'provider-error' })
  })

  it('非 success subtype は provider-error (max_turns / 実行中エラー / 認証系)', () => {
    // **黙って done にしない** — 認証切れ・API エラーは provider-error に倒す (V-11)。
    expect(classifyResult('error_max_turns', false)).toEqual({ kind: 'provider-error' })
    expect(classifyResult('error_during_execution', false)).toEqual({ kind: 'provider-error' })
    expect(classifyResult('error', true)).toEqual({ kind: 'provider-error' })
    // 未知 subtype も既定で provider-error (allowlist 的に success のみ complete)。
    expect(classifyResult('unexpected_new_subtype', false)).toEqual({ kind: 'provider-error' })
  })
})
