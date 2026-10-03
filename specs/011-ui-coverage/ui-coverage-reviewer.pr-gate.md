# ui-coverage-reviewer Review: ui-coverage 対応表の確立 (O-2)

**Run**: 2026-10-03
**Reviewer**: ui-coverage-reviewer
**Spec**: specs/011-ui-coverage/spec.md
**Round**: 2 (pr-gate, HEAD 57fcc0b)

## 初回読了 viewpoint

- FR/SC: FR-001, FR-002, FR-004, FR-005, FR-007 (error and truncation marks), FR-008 / FR-009, FR-010, SC-001 / SC-003
- Charter / Confirmation: AD-044 Decision 1/2/3 and Confirmation, Principle XII, ui charter Out of scope, AD-028 §5
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の担当
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の担当
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の担当
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の担当
- E. User Story / SC / AC / UX: 該当なし: po-reviewer / ux-reviewer の担当
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の担当
- G. optional reviewer 範囲 (ui-coverage の判断): Critical:0 High:0 Medium:0 Low:1
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:1

## スコープ要約

All 10 Round 1 findings are resolved. Item 21 counts match the table (O-4 10 [A5], O-5 21 [A5], O-6 30 [A14]; M3 remaining 24 = 5 + 5 + 14). All six tool displays show the error and truncation marks at the top level (TerminalBlock, CodeDiff, TodoList, AgentPlan, Subagent, ToolFallback); orphan results fall to ToolFallback. Rows :104 (user/tool_result) and :343 (Tool error) now hold, except the nested-subagent gap (L-101).

## Round 1 inheritance

| R1 ID | Severity | Status | Evidence |
|---|---|---|---|
| H-001 | High | resolved | ui-coverage.md:43 note; roadmap.md:256 O-4 range |
| H-002 | High | resolved | :77 / :78 Tier A `後続: O-6` with reasons; O-6 range |
| H-003 | High | resolved | :139-142 Tier A `後続: O-6`; O-6 range names Task* |
| M-001 | Medium | resolved | O-5 range adds `init` model / tools / slash_commands |
| M-002 | Medium | resolved | :47 Tier A; O-4 range lists `status` details |
| M-003 | Medium | resolved | :127 / :157 / :158 reasons |
| M-004 | Medium | resolved | per-reason label test in O-4's range |
| L-001 | Low | resolved | :53-61 past-log notes; V-4 follow-up in O-6 |
| L-002 | Low | resolved | :229 `C ExitPlanModeInput` |
| L-003 | Low | resolved | :125 note + O-5 range |

## Findings

### [Low] Tool calls nested inside a Subagent show 失敗 but not 切り詰め (L-101) (scope: feature)

- **観察**: `SubagentPart` (`subagent.aui.tsx:76-94`) renders only `part.isError` (:83), ignoring `part.truncated` (DTO `transcript-dto.ts:33`). Nested children come only from past logs
- **同種事象探索**: every top-level display reads truncation; `SubagentPart` 0
- **推奨アクション**: show `TOOL_RESULT_LABELS.truncated` / reuse `ToolResultMarks` in `SubagentPart`, or narrow the :104 note
- **根拠**: AD-044 Decision 1, Principle XII

### [Low] (H) No test pins the marks on TodoList and AgentPlan (L-102) (scope: feature)

- **観察**: `SessionScreen.o2.test.tsx:212-282` covers CodeDiff, ToolFallback, Subagent, TerminalBlock; no failed / truncated `TodoWrite` or `ExitPlanMode`
- **推奨アクション**: add a failed `ExitPlanMode` (失敗 + error body in `aui_agent-plan`) and a truncated `TodoWrite` (切り詰め in `aui_todo-list`)
- **根拠**: reviewer-base H, AD-044 Decision 1

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| L-101 | `truncated` in elements (non-test) | 6 top-level / 0 in SubagentPart | code-diff.aui.tsx:116, agent-plan.aui.tsx:39, subagent.aui.tsx:176, terminal-block.aui.tsx:34, todo-list.aui.tsx:46, tool-fallback.aui.tsx:721 |
| L-102 | `tool-result-error\|tool-result-truncated` (tests) | 3 | SessionScreen.o2.test.tsx:228, :241, :263 |

## Verdict

- Critical: 0
- High: 0
- Medium: 0
- Low: 2
- Round inheritance: resolved 10 / unresolved 0 / new 2
