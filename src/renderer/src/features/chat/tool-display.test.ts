import { describe, expect, it } from 'vitest'

import {
  buildResultTree,
  HEADING_MAX,
  planHasUnrenderedMarkup,
  readFileToolView,
  readTaskToolView,
  readWebToolView,
  taskStatusOf,
  truncateCodePoints
} from './tool-display'

/** O-6 FE-020〜FE-023 — ファイル・検索・Web・計画の tool の表示の純関数 (016 data-model §2)。 */

const j = (v: unknown): string => JSON.stringify(v)
const len = (s: string): number => Array.from(s).length

describe('truncateCodePoints', () => {
  it('コードポイント単位で切り詰め、末尾を … にして上限に収める', () => {
    expect(truncateCodePoints('abc', 5)).toBe('abc')
    expect(len(truncateCodePoints('x'.repeat(100), 10))).toBe(10)
    expect(truncateCodePoints('x'.repeat(100), 10).endsWith('…')).toBe(true)
    // サロゲートペアを割らない
    const astral = '𠮷'.repeat(50)
    expect(len(truncateCodePoints(astral, 10))).toBe(10)
    expect(truncateCodePoints(astral, 10)).not.toMatch(/[\uD800-\uDBFF]$/)
  })
})

describe('readFileToolView (FE-020)', () => {
  it('Read: パスの末尾と範囲。全体のパスは本文のまま (WSL・Windows・UNC)', () => {
    for (const p of [
      '/home/u/proj/a.ts',
      'C:\\dev\\proj\\a.ts',
      '\\\\wsl.localhost\\Ubuntu\\home\\u\\a.ts'
    ]) {
      const v = readFileToolView('Read', j({ file_path: p, offset: 10, limit: 20 }))
      expect(v?.path).toBe(p)
      expect(v?.heading).toBe('a.ts · 10〜30 行')
    }
  })

  it('Read: pages と offset だけ・limit だけ', () => {
    expect(readFileToolView('Read', j({ file_path: '/a/b.pdf', pages: '1-3' }))?.heading).toBe(
      'b.pdf · ページ 1-3'
    )
    expect(readFileToolView('Read', j({ file_path: '/a/b', offset: 5 }))?.heading).toBe(
      'b · 5 行目から'
    )
    expect(readFileToolView('Read', j({ file_path: '/a/b', limit: 5 }))?.heading).toBe(
      'b · 先頭 5 行'
    )
  })

  it('Glob / Grep: pattern は文字列のまま。path の末尾と output_mode の訳。知らない値は出さない', () => {
    expect(readFileToolView('Glob', j({ pattern: '**/*.ts', path: '/w/src/' }))?.heading).toBe(
      '**/*.ts · src'
    )
    const grep = readFileToolView(
      'Grep',
      j({ pattern: 'a(b', glob: '*.ts', path: '/w', output_mode: 'content' })
    )
    expect(grep?.heading).toBe('a(b · *.ts · w · 一致した行')
    expect(grep?.tree).toBe(false)
    const unknown = readFileToolView('Grep', j({ pattern: 'x', output_mode: 'toString' }))
    expect(unknown?.heading).toBe('x')
    expect(unknown?.tree).toBe(false)
    expect(readFileToolView('Grep', j({ pattern: 'x' }))?.tree).toBe(true)
    expect(
      readFileToolView('Grep', j({ pattern: 'x', output_mode: 'files_with_matches' }))?.tree
    ).toBe(true)
    expect(readFileToolView('Glob', j({ pattern: 'x' }))?.tree).toBe(true)
  })

  it('見出しの自由文に伏せ字を通し、1 行・80 コードポイントに収める (全角・日本語を含む)', () => {
    const v = readFileToolView('Grep', j({ pattern: 'password=hunter2' }))
    expect(v?.heading).not.toContain('hunter2')
    const long = readFileToolView(
      'Grep',
      j({ pattern: '検索語\n'.repeat(100), path: '/w/日本語.ts' })
    )
    expect(long?.heading).not.toContain('\n')
    expect(len(long?.heading ?? '')).toBeLessThanOrEqual(HEADING_MAX)
  })

  it('入力が読めない・必須が無い・知らない tool は null', () => {
    expect(readFileToolView('Read', '{broken')).toBeNull()
    expect(readFileToolView('Read', j({ file_path: 1 }))).toBeNull()
    expect(readFileToolView('Glob', j({}))).toBeNull()
    expect(readFileToolView('Foo', j({ pattern: 'x' }))).toBeNull()
  })
})

describe('buildResultTree (FE-020 / data-model §2 File tree の作り方)', () => {
  it('注記と項目を分け、空行を捨てる。相対パスの直下のファイルも項目', () => {
    const t = buildResultTree('Found 2 files\n\n(truncated)\nREADME.md\n  src/a.ts  \n')
    expect(t?.notes).toEqual(['Found 2 files', '(truncated)'])
    expect(t?.items).toEqual(['README.md', 'src/a.ts'])
    expect(t?.hidden).toBe(0)
    expect(t?.total).toBe(2)
  })

  it('項目が 0 件なら null (text で出す)', () => {
    expect(buildResultTree('No files found')).toBeNull()
    expect(buildResultTree('')).toBeNull()
  })

  it('200 件まで・201 件で「ほか 1 件」', () => {
    const lines = Array.from({ length: 201 }, (_, i) => `f${i}.ts`).join('\n')
    const t = buildResultTree(lines)
    expect(t?.items).toHaveLength(200)
    expect(t?.hidden).toBe(1)
    expect(t?.total).toBe(201)
  })

  it('1 行は 1,024 コードポイントに切り詰める。同じになる 2 行も両方残す', () => {
    const a = `${'x'.repeat(1100)}A`
    const b = `${'x'.repeat(1100)}B`
    const t = buildResultTree(`${a}\n${b}`)
    expect(t?.items).toHaveLength(2)
    expect(len(t?.items[0] ?? '')).toBe(1024)
    expect(t?.items[0]).toBe(t?.items[1])
  })

  it('階層を組まない: __proto__ / constructor の行でも平らな配列', () => {
    const t = buildResultTree('__proto__/x\nconstructor/prototype/y\ntoString')
    expect(t?.items).toEqual(['__proto__/x', 'constructor/prototype/y', 'toString'])
    expect(({} as { children?: unknown }).children).toBeUndefined()
  })
})

describe('readWebToolView (FE-021)', () => {
  it('WebFetch: 全体の URL は伏せ字を通す。prompt も', () => {
    const v = readWebToolView(
      'WebFetch',
      j({ url: 'https://hooks.slack.com/services/T0/B0/XXXX', prompt: 'token=abc12345' })
    )
    expect(v?.url).not.toContain('XXXX')
    expect(v?.prompt).not.toContain('abc12345')
    expect(v?.source).toBe('https://hooks.slack.com/services/T0/B0/XXXX')
  })

  it('WebSearch: query に伏せ字・ドメインの制限の件数', () => {
    const v = readWebToolView(
      'WebSearch',
      j({
        query: 'password=hunter2 docs',
        allowed_domains: ['a.com', 'b.com'],
        blocked_domains: ['c.com']
      })
    )
    expect(v?.heading).not.toContain('hunter2')
    expect(v?.heading).toContain('ドメイン制限 3 件')
    expect(readWebToolView('WebSearch', j({ query: 'q' }))?.heading).toBe('q')
  })

  it('必須が無ければ null', () => {
    expect(readWebToolView('WebFetch', j({ prompt: 'p' }))).toBeNull()
    expect(readWebToolView('WebSearch', j({}))).toBeNull()
  })
})

describe('readTaskToolView (FE-022)', () => {
  it('状態の対応と知らない値・prototype のキー', () => {
    expect(taskStatusOf('pending').statusLabel).toBe('未着手')
    expect(taskStatusOf('in_progress').statusLabel).toBe('進行中')
    expect(taskStatusOf('completed').statusLabel).toBe('完了')
    expect(taskStatusOf('deleted').statusLabel).toBe('削除')
    for (const k of ['whatever', '__proto__', 'constructor', 'toString']) {
      expect(taskStatusOf(k)).toEqual({ statusKey: 'unknown', statusLabel: '不明' })
    }
  })

  it('TaskCreate: 追加した時点は未着手。subject に伏せ字', () => {
    const v = readTaskToolView(
      'TaskCreate',
      j({ subject: 'fix password=hunter2', activeForm: '直している' })
    )
    expect(v?.item?.statusLabel).toBe('追加した時点: 未着手')
    expect(v?.item?.text).not.toContain('hunter2')
    expect(v?.heading).toContain('タスクを追加')
  })

  it('TaskUpdate: subject が無ければタスク #id。status が無ければ項目なし', () => {
    const noSubject = readTaskToolView('TaskUpdate', j({ taskId: '7', status: 'completed' }))
    expect(noSubject?.item?.text).toBe('タスク #7')
    expect(noSubject?.heading).toBe('タスクを更新 · タスク #7')
    expect(readTaskToolView('TaskUpdate', j({ taskId: '7', subject: 's' }))?.item).toBeNull()
  })

  it('TaskGet / TaskList は見出しだけ', () => {
    expect(readTaskToolView('TaskGet', j({ taskId: '3' }))?.heading).toBe('タスクを確認 タスク #3')
    expect(readTaskToolView('TaskList', j({}))?.heading).toBe('タスクの一覧')
    expect(readTaskToolView('TaskGet', j({}))).toBeNull()
  })
})

describe('planHasUnrenderedMarkup (FE-023)', () => {
  it('生 HTML・コメントは真、不等号だけは偽', () => {
    expect(planHasUnrenderedMarkup('<div>x</div>')).toBe(true)
    expect(planHasUnrenderedMarkup('<!-- hidden -->')).toBe(true)
    expect(planHasUnrenderedMarkup('</p>')).toBe(true)
    expect(planHasUnrenderedMarkup('a < b and 1 <2')).toBe(false)
  })
})
