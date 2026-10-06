import { describe, expect, it } from 'vitest'

import type { SessionIndexDTO, SessionSummaryDTO } from '@domain/session/dto'

import { buildSessionRows, findRow, formatSessionTime, rowTitleText } from './rows'

/** O-7 — 選択中の行の引き当て (中央のヘッダ・「概要」・過去の行の消失の判定) と時刻の表記。 */

function session(sessionId: string, summary: string | null): SessionSummaryDTO {
  return {
    sessionId,
    targetKey: 'wsl:Ubuntu#0',
    targetLabel: 'u',
    summary,
    firstPrompt: null,
    customTitle: null,
    lastModified: Date.UTC(2026, 9, 5, 9, 0),
    createdAt: null,
    fileSize: 100,
    gitBranch: null,
    tag: null,
    cwd: null,
    cwdDisplay: null,
    originKind: 'wsl-inherited',
    programmatic: false,
    worktree: false,
    boundary: null,
    normalized: { truncated: false, controlCharsRemoved: false }
  }
}

const A = session('11111111-1111-4111-8111-111111111111', '作業 A')
const B = session('22222222-2222-4222-8222-222222222222', null)

const INDEX: SessionIndexDTO = {
  groups: [
    { kind: 'folder', folderId: 'f', boundary: 'native', sessions: [A] },
    { kind: 'unknown', reasonKey: 'cwd-absent', sessions: [B] }
  ],
  outcomes: [],
  fetchedAt: 0,
  complete: true
}

describe('findRow', () => {
  const view = buildSessionRows(INDEX)

  it('行の鍵から行とその区画を引く', () => {
    const keyOfB = view.sections[1]!.rowKeys[0]!
    const found = findRow(view, keyOfB)
    expect(found?.row.session).toBe(B)
    expect(found?.section.group.kind).toBe('unknown')
  })

  it('鍵が null・一覧に無い・一覧が空なら null', () => {
    expect(findRow(view, null)).toBeNull()
    expect(findRow(view, 'wsl:Ubuntu#0/missing')).toBeNull()
    expect(findRow(buildSessionRows(null), view.rows[0]!.rowKey)).toBeNull()
  })
})

describe('formatSessionTime / rowTitleText', () => {
  it('識別子の題は同じ時刻の表記を使う (一覧の行と中央のヘッダの題が一致する)', () => {
    const row = buildSessionRows(INDEX).rows.find((r) => r.session === B)!
    const at = formatSessionTime(B.lastModified!)
    expect(rowTitleText(row.title, formatSessionTime)).toBe(`22222222（${at}）`)
  })
})
