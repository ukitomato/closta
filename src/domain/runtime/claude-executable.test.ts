import { describe, expect, it } from 'vitest'

import { classifyClaudeExecutable } from './claude-executable'

describe('classifyClaudeExecutable (X-8 / data-model §1.1)', () => {
  it.each([
    ['C:\\a\\claude.exe', 'exe'],
    ['C:\\a\\CLAUDE.EXE', 'exe'],
    ['c:/a/claude.exe', 'exe'],
    ['C:\\Users\\山田 太郎\\.local\\bin\\claude.exe', 'exe'],
    ['C:\\a\\claude.cmd', 'shim'],
    ['C:\\a\\claude.BAT', 'shim'],
    ['C:\\a\\claude.ps1', 'shim'],
    ['C:\\a\\claude', 'invalid'],
    ['C:\\a\\claude.js', 'invalid'],
    ['C:\\a\\claude.exe.txt', 'invalid'],
    ['claude.exe', 'invalid'],
    ['.\\claude.exe', 'invalid'],
    ['\\\\wsl$\\Ubuntu\\usr\\bin\\claude.exe', 'invalid'],
    ['\\\\wsl.localhost\\Ubuntu\\usr\\bin\\claude.exe', 'invalid'],
    ['', 'invalid'],
    ['C:\\a\\claude\u0000.exe', 'invalid'],
    ['C:\\a\\cla\nude.exe', 'invalid']
  ] as const)('%j は %s', (raw, expected) => {
    expect(classifyClaudeExecutable(raw)).toBe(expected)
  })
})
