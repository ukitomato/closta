import { describe, expect, it } from 'vitest'

import {
  createSlashCommandAdapter,
  searchSlashCommands,
  slashFormatter,
  slashMatcher,
  SLASH_COMMAND_MAX_CANDIDATES,
  type SlashCommandSource
} from './slash-commands'

const cmd = (
  name: string,
  description: string | null = null,
  argumentHint: string | null = null
): SlashCommandSource => ({ name, description, argumentHint })

describe('searchSlashCommands (O-10 FE-031 / data-model §5)', () => {
  const entries = [
    cmd('review', 'レビュー', '<pr>'),
    cmd('Compact'),
    cmd('clear', 'クリア'),
    cmd('/cost')
  ]

  it('先頭の / を外した前方一致で、大文字小文字を区別せず、名前の昇順で返す', () => {
    expect(searchSlashCommands(entries, 'c').items.map((i) => i.id)).toEqual([
      'clear',
      'Compact',
      'cost'
    ])
    expect(searchSlashCommands(entries, '/CO').items.map((i) => i.id)).toEqual(['Compact', 'cost'])
  })

  it('空の問い合わせで全件。一致しなければ 0 件', () => {
    expect(searchSlashCommands(entries, '').items).toHaveLength(4)
    expect(searchSlashCommands(entries, 'zzz')).toEqual({ items: [], more: 0 })
  })

  it('名前・説明・引数の形を item に載せる (無ければ付けない)', () => {
    const [item] = searchSlashCommands(entries, 'review').items
    expect(item).toEqual({
      id: 'review',
      type: 'slash-command',
      label: 'review',
      description: 'レビュー',
      metadata: { argumentHint: '<pr>' }
    })
    const [bare] = searchSlashCommands(entries, 'Compact').items
    expect(bare).not.toHaveProperty('description')
    expect(bare).not.toHaveProperty('metadata')
  })

  it('21 件で 20 件と「ほか 1 件」', () => {
    const many = Array.from({ length: SLASH_COMMAND_MAX_CANDIDATES + 1 }, (_, i) =>
      cmd(`c${String(i).padStart(2, '0')}`)
    )
    const r = searchSlashCommands(many, '')
    expect(r.items).toHaveLength(20)
    expect(r.more).toBe(1)
  })

  it('adapter はカテゴリを持たず search だけ', () => {
    const a = createSlashCommandAdapter(entries)
    expect(a.categories()).toEqual([])
    expect(a.search('cl').map((i) => i.id)).toEqual(['clear'])
  })
})

describe('slashMatcher', () => {
  it('先頭の / から最初の空白の手前まで当てる', () => {
    expect(slashMatcher('/rev', '/', 4)).toEqual({ query: 'rev', offset: 0, endOffset: 4 })
    expect(slashMatcher('/', '/', 1)).toEqual({ query: '', offset: 0, endOffset: 1 })
    expect(slashMatcher('/rev x', '/', 3)).toEqual({ query: 'rev', offset: 0, endOffset: 4 })
  })

  it('文の途中の / ・空白より後のカーソル・/ の前のカーソルでは当てない', () => {
    expect(slashMatcher('a /rev', '/', 6)).toBeNull()
    expect(slashMatcher('/rev x', '/', 6)).toBeNull()
    expect(slashMatcher('/rev', '/', 0)).toBeNull()
    expect(slashMatcher('', '/', 0)).toBeNull()
    expect(slashMatcher('@a', '@', 2)).toBeNull()
  })
})

describe('slashFormatter', () => {
  it('/{name} に直す', () => {
    expect(slashFormatter.serialize({ id: 'review' })).toBe('/review')
  })
})
