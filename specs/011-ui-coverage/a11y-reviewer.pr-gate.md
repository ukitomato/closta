# a11y-reviewer Review: ui-coverage 対応表の確立 (O-2)

**Run**: 2026-10-03
**Reviewer**: a11y-reviewer
**Spec**: specs/011-ui-coverage/spec.md
**Round**: 3 (HEAD a28fcf9)

## 初回読了 viewpoint

- FR/SC: FR-007, FR-009, FR-012 / FR-013, SC-003, SC-005 (US-3 AC5)
- charter / Confirmation: ui charter, Principle XIII, Principle VIII
- A. 認可 / 認証 / secret 管理: 該当なし: a11y-reviewer の担当外
- B. 入力検証 / injection / CSP / 暗号: 該当なし: a11y-reviewer の担当外
- C. 業務不変条件 / Charter drift: 該当なし: a11y-reviewer の担当外
- D. Constitution / ADR drift: 該当なし: a11y-reviewer の担当外
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の担当
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の担当
- G. optional reviewer 範囲: Critical:0 High:0 Medium:0 Low:2
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:1

## スコープ要約

Re-checked the Round 2 fixes in the changed files. 「エラー」 sits in the destructive Badge (text, not colour only). The new guidance line is muted-foreground text-xs (≈4.8:1), passes.

## Round 2 inheritance

| R2 ID | Status | Evidence |
|---|---|---|
| H-001 | resolved | tool-result-marks.tsx:45 no opacity; terminal-block uses ToolResultMarks; todo count no opacity; tests :208, :338-339 |
| H-002 | resolved | `aria-pressed:font-semibold` at TranscriptDensityToggle.tsx:37 / RunningSessionList.tsx:183; test :471-476 |
| M-001 | resolved | thread.aui.tsx:981 no `/80` |
| M-002 | resolved | `title` at thread.aui.tsx:963, :982 |
| M-003 | deferred | roadmap.md:258 O-6 row (announcer, WCAG 4.1.3) |
| M-004 | resolved (partial, see L-201) | class / attribute tests for H-001 / H-002 |
| L-001 | unresolved | hint still only in `title` |
| L-002 | partially resolved | failure shows 「エラー」 text Badge; success CheckIcon low contrast → L-202 |
| L-003 | resolved | `motion-reduce:animate-none` at thread.aui.tsx:890, :951 |

## Findings

### [Low] The density hint is only in `title` (L-001) (scope: feature)

- **推奨アクション**: existing Tooltip (opens on focus) or sr-only + `aria-describedby`
- **根拠**: WCAG 1.3.1 / 3.3.2 (advisory)

### [Low] Terminal block success check has low contrast (L-202) (scope: feature)

- **観察**: `terminal-block.aui.tsx:50-53` `text-emerald-500` ≈2.5:1 on light; aria-label without `role="img"`
- **推奨アクション**: `role="img"`; darker existing shade (`text-emerald-600 dark:text-emerald-400`) or defer
- **根拠**: WCAG 1.4.11 / 1.1.1

### [Low] (H) No tests guard M-001 / M-002 / L-003 (L-201) (scope: feature)

- **推奨アクション**: assert `title` on name / detail and no alpha on the name in an existing SystemEventRow test
- **根拠**: Principle VIII

No new a11y issues at Medium or above.

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| L-001 | `title=` (TranscriptDensityToggle) | 1 | TranscriptDensityToggle.tsx:38 |
| L-202 | `text-emerald-500` (elements) | 2 | terminal-block.aui.tsx:51, todo-list.aui.tsx:28 |
| L-201 | `system-event-name.*title\|motion-reduce` (tests) | 0 | — |
| (R2 H-001) | `opacity-\d+` (truncation/count) | 0 | — |

## Verdict

- Critical: 0
- High: 0
- Medium: 0
- Low: 3
- Round inheritance: resolved 6 / partial 1 / deferred 1 / unresolved 1 / new 1
