# Code Gate Iteration 1: セッションの再開 (resume) (X-9)

**Run**: 2026-10-21
**Spec**: specs/021-session-resume/
**Diff scope**: 63 files (base 7e13d60..HEAD ∩ touched-files.txt), 5446+/209-
**Tracks**: lint-agent (+ invoker 実行の typecheck / depcruise / check:constitution), test-agent (scope: full), convention-reviewer, platform-boundary-reviewer

## Verdict

| Severity | Count | Where |
|---|---|---|
| MUST_FIX | 0 | — |
| SHOULD_FIX | 4399 | lint warning: prettier/prettier `Delete ␍` 4,398 件 (作業ツリーの CRLF。HEAD は LF、.gitattributes は eol=lf) + e2e の ignore 警告 1 件。convention M-001 に集約 |
| CONSIDER | 13 | convention Medium 3 / Low 3、platform-boundary Low 4、(lint info 0) |

**Status**: PASS

## Tracks

- lint (ESLint, touched 58 files): exit 0 / error 0 / warning 4,399
- typecheck (tsconfig.node.json / tsconfig.web.json): exit 0 / exit 0
- depcruise src: exit 0 / 違反 0 (530 modules, 2854 dependencies)
- check:constitution: exit 0 / 21 項目 ok 20 / 違反 0 / 検査対象なし 1
- test (vitest 全件): exit 0 / passed 3856 / failed 0 / errors 0 / unhandled 0
- convention-reviewer: Critical 0 / High 0 / Medium 3 / Low 3
- platform-boundary-reviewer: Critical 0 / High 0 / Medium 0 / Low 4

## 起動しなかった reviewer

- a11y-reviewer: gates=['pr-gate'] に code-gate が無い
- ux-reviewer: gates=['pr-gate'] に code-gate が無い
- database-reviewer: auto_invoke_patterns に一致する変更ファイルが無い

## MUST_FIX findings (0)

なし。Medium / Low は AD-050 に従い本 gate では直さない (各 reviewer の `*.code-gate.md` に残す)。
