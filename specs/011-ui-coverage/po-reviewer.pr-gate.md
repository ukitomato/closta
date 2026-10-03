# po-reviewer Review: ui-coverage 対応表の確立 (O-2)

**Run**: 2026-10-03
**Reviewer**: po-reviewer
**Spec**: specs/011-ui-coverage/spec.md
**Round**: 2 (HEAD 57fcc0b)

## 初回読了 viewpoint

- FR/SC: FR-007 / US-2 AC2 (marks on every display — R1 H-001 resolved), FR-009 / AC3・AC4・AC6, FR-012 / FR-013 / US-3 AC5, SC-003 (V-4 owned by O-6), FR-004
- charter / Confirmation: ui charter KPI 表示網羅, AD-044 Confirmation, AD-028 §5, glossary Transcript density / System event row
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の担当
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の担当
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の担当
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の担当
- E. User Story / SC / AC / UX: Critical:0 High:0 Medium:0 Low:3
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の担当
- G. optional reviewer 範囲: 該当なし: ui-coverage / ux / a11y reviewers の担当
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:1

## スコープ要約

Re-checked the six Round 1 findings against `tool-result-marks.tsx` and the six displays, `statusWithError`, `TranscriptDensityToggle.tsx`, `labels.ts`, SystemEventRow, ui-coverage.md:53-61, roadmap O-6, spec Assumptions and the new tests; then looked for new UX issues.

## Round 1 inheritance

| R1 ID | Summary | Status | Evidence |
|---|---|---|---|
| H-001 | marks only on Bash | resolved | ToolResultMarks in code-diff:105, tool-fallback:721, subagent:174, todo-list:44, agent-plan:37; ✓→✗ in tool-fallback:680-686; tests SessionScreen.o2.test.tsx:212-282 |
| M-001 | density toggle label | resolved | TranscriptDensityToggle.tsx:26-28, :36-40; hints match thread.aui.tsx:736,756; tests :369-377 |
| M-002 | V-4 owner | resolved | roadmap.md:258, spec.md:263 |
| L-001 | past-log notes | resolved | ui-coverage.md:55, 59-61 |
| L-002 | raw task_type | resolved | labels.ts:45-57; tests ChatScreen.o2.test.tsx:138-158 |
| L-003 | hook wording | resolved | labels.ts:20, :37-38; tests :213-216 |

## Findings

### [Low] A rejected plan or denied tool call gets a red 「失敗」, so the user's own decision reads as a failure (L-001) (scope: feature)

- **観察**: `TOOL_RESULT_LABELS.failed = '失敗'` (labels.ts:65) for every `isError`; destructive Badge (tool-result-marks.tsx:48-51); denial `"User denied tool execution"` reaches `isError`
- **推奨アクション**: neutral wording covering both, e.g. 「失敗・拒否」 or 「エラー」
- **根拠**: US-2 AC2, glossary Counterexamples

### [Low] Bash shows failure as an icon only, contrary to the "same mark on every display" comments (L-002) (scope: feature)

- **観察**: terminal-block.aui.tsx:50-54 `XCircleIcon` with aria-label, no visible text; comments at tool-result-marks.tsx:11 / labels.ts:60-61 say it uses the same mark
- **推奨アクション**: use `ToolResultMarks` in terminal-block, or fix the comments

### [Low] quickstart V-4 does not check a failed / denied Edit (L-003) (scope: feature)

- **推奨アクション**: add a V-4 step: make an Edit fail or deny it, confirm 「失敗」 and the error text in the header
- **根拠**: AD-028 §5, SC-003

### [Low] (H) No error test for TodoList / AgentPlan

- **推奨アクション**: add one `isError` case each for TodoWrite and ExitPlanMode. No regression found (success paths still checked; `statusWithError` only changes complete / undefined)

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| L-001 | `TOOL_RESULT_LABELS.failed` | 3 | tool-result-marks.tsx:50; subagent.aui.tsx:83; terminal-block.aui.tsx:53 |
| L-002 | `ToolResultMarks` (elements) | 5 users / terminal-block 0 | code-diff:105; tool-fallback:721; subagent:174; todo-list:44; agent-plan:37 |
| L-003 | `失敗\|Edit` in quickstart V-4 | 0 | quickstart.md:29-36 |
| H | `isError` tests per display | todo-list 0 / agent-plan 0 | SessionScreen.o2.test.tsx:191-282 |

## Verdict

- Critical: 0
- High: 0
- Medium: 0
- Low: 4
- Round inheritance: resolved 6 / unresolved 0 / new 4
