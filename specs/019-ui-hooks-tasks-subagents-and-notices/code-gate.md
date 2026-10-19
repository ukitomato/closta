# Code Gate Iteration 2: Hook・背景の task・実行中の subagent の表示 (O-11)

**Run**: 2026-10-19
**Spec**: specs/019-ui-hooks-tasks-subagents-and-notices/
**Entry status**: reviewing (re-run after the pr-gate R1 fixes; status not changed)
**Diff scope**: 4 files (uncommitted diff vs HEAD 243b3e6), 11+/9- (touched-files.txt itself is outside the scope)
**Tracks**: lint-agent, test-agent (full), convention-reviewer
**Skipped reviewers**: a11y-reviewer (gates=['pr-gate']), ux-reviewer (gates=['pr-gate']), database-reviewer (no file matches auto_invoke_patterns), platform-boundary-reviewer (no file matches auto_invoke_patterns)

## Verdict

| Severity | Count | Where |
|---|---|---|
| MUST_FIX | 0 | - |
| SHOULD_FIX | 0 | - |
| CONSIDER | 2 | convention M-001 (BackgroundTasksTab.tsx:70-75, labels.ts:262-263: dead `null`/awaiting branch); convention L-001 (research.md:53 stale) |

**Status**: PASS

## Tracks

- lint-agent: exit 0. Detectors: eslint, tsc (node), tsc (web), depcruise, check:constitution. 0 violations in scope; 22 prettier warnings outside the scope.
- test-agent: exit 0, scope full, 3449/3449 passed, 0 errors, 0 unhandled errors.
- convention-reviewer: Critical 0 / High 0 / Medium 1 / Low 1. Under AD-050, Medium and Low are not fixed in this gate.

## MUST_FIX findings (0)

None.
