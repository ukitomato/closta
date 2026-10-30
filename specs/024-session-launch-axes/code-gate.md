# Code Gate Iteration 1: 起動設定の残りの軸 — 追加ディレクトリ・上限・セッション名 (024)

**Run**: 2026-10-30
**Spec**: specs/024-session-launch-axes/
**Diff scope**: 76 files (base 2bba8f8..HEAD; 79 files changed, +3271/-214。spec dir の 3 ファイルは touched-files.txt 外のため除外)
**Tracks**: lint-agent, test-agent, convention-reviewer, database-reviewer, platform-boundary-reviewer

## Verdict

| Severity | Count | Where |
|---|---|---|
| MUST_FIX | 0 | - |
| SHOULD_FIX | 333 | prettier/prettier warning (launch-config.ts 244 のうち 243 は作業ツリーの CRLF、LaunchDialog.tsx 48、LaunchExtraAxes.tsx 28、ほか 9 ファイル 13) |
| CONSIDER | 11 | reviewer の Medium 3 / Low 8 (下記) |

**Status**: PASS

## Tracks

- lint-agent: exit 0。detectors = eslint / typecheck (node + web) / depcruise / check:constitution。error 0 / warning 333 / info 0。test:rules は code-gate の規則で実行していない
- test-agent: scope full、exit 0。passed 4485 / failed 0 / error 0 / unhandled 0
- convention-reviewer: Critical 0 / High 0 / Medium 2 / Low 5 (`convention-reviewer.code-gate.md`)
- database-reviewer: Critical 0 / High 0 / Medium 0 / Low 2 (`database-reviewer.code-gate.md`)
- platform-boundary-reviewer: Critical 0 / High 0 / Medium 1 / Low 1 (`platform-boundary-reviewer.code-gate.md`)

## 起動しなかった reviewer

- a11y-reviewer: gates=['pr-gate'] に code-gate が無い
- ux-reviewer: gates=['pr-gate'] に code-gate が無い
- security-reviewer / architecture-reviewer / po-reviewer: pr-gate 専任 (候補に入れていない)

## MUST_FIX findings (0)

なし。

## SHOULD_FIX / CONSIDER (AD-050 により本 gate では直さない)

- convention M-001: prettier の整形違反 (約 90 件、CRLF 分を除く)
- convention M-002: 500 行超のファイルが膨らんだ (LaunchDialog.tsx +206 行ほか)
- platform-boundary M-001: 追加ディレクトリの POSIX 検査が `makeRuntimePath` の規則を重複定義
- Low 8 件は各 reviewer のファイルを参照

## Notes

- 作業ツリーには untracked の `.vitest/` しか無いため、diff は `.implement-base` (2bba8f8) から HEAD までのコミット差分を使った
- auto-fix loop は MUST_FIX 0 のため起動していない
