import { describe, expect, it } from 'vitest'

import { CLAUDE_CODE_PERMISSION_MODE_NAMES_VERSION, PERMISSION_MODE_NAMES } from './labels'

// renderer の src の全ソース (キーは本ファイルからの相対パス。`../../` が src/renderer/src)。
const SOURCES = import.meta.glob<string>('../../**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true
})

describe('権限モードの名前の表 (025 FR-008 / FR-009 / AD-065 Decision 3)', () => {
  // Claude Code の版を上げたら docs/ui-coverage.md の手順で見直す (この pin は意図した変更の合図)。
  it('7 値と照合した Claude Code の版を固定する', () => {
    expect(CLAUDE_CODE_PERMISSION_MODE_NAMES_VERSION).toBe('2.1.312')
    expect(PERMISSION_MODE_NAMES).toEqual({
      default: 'Manual',
      plan: 'Plan',
      dontAsk: "Don't Ask",
      acceptEdits: 'Accept edits',
      bypassPermissions: 'Bypass Permissions',
      auto: 'Auto',
      unknown: '不明なモード'
    })
  })

  it("'Manual' / \"Don't Ask\" の文字列は表の 1 か所だけ (FR-009)", () => {
    const offenders = Object.entries(SOURCES)
      .filter(([key]) => !/^(\.\/|\.\.\/chat\/)labels(\.test)?\.ts$/u.test(key))
      .filter(([, text]) => text.includes("'Manual'") || text.includes(`"Don't Ask"`))
      .map(([key]) => key)
    expect(offenders).toEqual([])
  })
})
