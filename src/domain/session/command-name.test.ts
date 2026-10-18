import { describe, expect, it } from 'vitest'

import { bashCommandName } from './command-name'

describe('bashCommandName', () => {
  it('先頭の語のパスの末尾を返す', () => {
    expect(bashCommandName('npm run x')).toBe('npm')
    expect(bashCommandName('/usr/bin/git status')).toBe('git')
    expect(bashCommandName('./bin/tool.sh a')).toBe('tool.sh')
    expect(bashCommandName('C:\\tools\\node.exe a.js')).toBe('')
  })

  it('先頭の代入を飛ばす', () => {
    expect(bashCommandName('FOO=bar npm test')).toBe('npm')
  })

  it('不安全な文字を含むと空', () => {
    expect(bashCommandName('curl -H "Authorization: Bearer abc"')).toBe('')
    expect(bashCommandName("echo 'x'")).toBe('')
    expect(bashCommandName('echo $HOME')).toBe('')
    expect(bashCommandName('echo `id`')).toBe('')
  })

  it('SECRET_PREFIX に当たる名前・不正な形・空は空', () => {
    expect(bashCommandName('sk-abcdef')).toBe('')
    expect(bashCommandName('ghp_abc run')).toBe('')
    expect(bashCommandName('a@b')).toBe('')
    expect(bashCommandName('')).toBe('')
    expect(bashCommandName('   ')).toBe('')
    expect(bashCommandName('FOO=bar')).toBe('')
  })
})
