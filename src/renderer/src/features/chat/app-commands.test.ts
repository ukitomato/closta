import { describe, expect, it } from 'vitest'

import { mergeCommandCandidates, parseAppCommand } from './app-commands'
import { APP_COMMAND_LABELS } from './labels'
import { SLASH_COMMAND_MAX_CANDIDATES, searchSlashCommands } from './slash-commands'

describe('parseAppCommand', () => {
  it.each(['/resume', '  /resume  ', '/resume abc'])('%j は resume', (t) => {
    expect(parseAppCommand(t)).toBe('resume')
  })
  it.each(['/resumeX', '/Resume', 'resume', 'x /resume', '', '   '])('%j は null', (t) => {
    expect(parseAppCommand(t)).toBeNull()
  })
})

describe('mergeCommandCandidates', () => {
  it('null ならアプリのコマンドだけ', () => {
    const r = mergeCommandCandidates(null)
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ name: 'resume', description: APP_COMMAND_LABELS.resume })
  })
  it('同名の報告は落とし、他は残す', () => {
    const r = mergeCommandCandidates([
      { name: 'resume', description: 'cc', argumentHint: null },
      { name: '/resume', description: 'cc2', argumentHint: null },
      { name: 'compact', description: null, argumentHint: null }
    ])
    expect(r.map((e) => e.name)).toEqual(['resume', 'compact'])
    expect(r[0]?.description).toBe(APP_COMMAND_LABELS.resume)
  })
  it('昇順と 20 件の上限は変わらない', () => {
    const many = Array.from({ length: 30 }, (_, i) => ({
      name: `c${String(i).padStart(2, '0')}`,
      description: null,
      argumentHint: null
    }))
    const s = searchSlashCommands(mergeCommandCandidates(many), '')
    expect(s.items).toHaveLength(SLASH_COMMAND_MAX_CANDIDATES)
    expect(s.more).toBe(11)
    expect(s.items[0]?.label).toBe('c00')
  })
})
