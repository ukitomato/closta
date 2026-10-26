# Code Gate Iteration 2: 知らせの類・Checkpoints・中身のブロックの表示 (O-12)

**Run**: 2026-10-27
**Spec**: specs/022-ui-notices-checkpoints-and-content-blocks/
**Entry status**: reviewing (re-run after pr-gate round 1 fixes; status is not changed)
**Diff range**: HEAD (uncommitted fixes) — base of the feature: e79a694
**Diff scope**: 9 files (diff ∩ touched-files.txt), 11 files changed / +37 / -7 in the diff. Not in touched-files.txt: spec.md and touched-files.txt (spec artifacts)
**Tracks**: lint-agent, test-agent, convention-reviewer, platform-boundary-reviewer

## Verdict

| Severity | Count | Where |
|---|---|---|
| MUST_FIX | 0 | - |
| SHOULD_FIX | 0 | - |
| CONSIDER | 1 | `.vitest/` (untracked, not gitignored) — convention L-001 |

**Status**: PASS

## Tracks

- lint: eslint on 6 touched ts/tsx files, exit 0, 0 violations (lint-agent). The invoker ran the whole project through tsc (node and web), dependency-cruise and constitution/check.mjs, and all exited 0. test:rules was not run.
- test: full suite `vitest run`, exit 0, 3954 passed / 0 failed, Errors 0 / Unhandled 0 (scope: full)
- convention-reviewer: Critical 0 / High 0 / Medium 0 / Low 1 (`convention-reviewer.code-gate.md`)
- platform-boundary-reviewer: Critical 0 / High 0 / Medium 0 / Low 0 (`platform-boundary-reviewer.code-gate.md`)

## Skipped reviewers

- a11y-reviewer: gates=['pr-gate'] does not include code-gate
- ux-reviewer: gates=['pr-gate'] does not include code-gate
- database-reviewer: none of the changed files match auto_invoke_patterns

## MUST_FIX findings (0)

None. No auto-fix loop was run (implementer applied 0 / skipped 0 / error 0).

## Low (not fixed per AD-050)

- L-001: `.vitest/` test output is untracked and not gitignored. Do not stage it.
