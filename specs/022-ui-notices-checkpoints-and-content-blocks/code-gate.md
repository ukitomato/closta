# Code Gate Iteration 1: 知らせの類・Checkpoints・中身のブロックの表示 (O-12)

**Run**: 2026-10-23
**Spec**: specs/022-ui-notices-checkpoints-and-content-blocks/
**Diff scope**: 53 files (base e79a694..HEAD; diff 全体は 69 files, +5680/-238。scope 外は spec_dir の設計文書と ADR-0060)
**Tracks**: lint-agent, test-agent, convention-reviewer, platform-boundary-reviewer

## Verdict

| Severity | Count | Where |
|---|---|---|
| MUST_FIX | 0 | - |
| SHOULD_FIX | 0 | - |
| CONSIDER | 6 | convention-reviewer M-001, L-001〜L-005 (`convention-reviewer.code-gate.md`) |

**Status**: PASS

## Tracks

- **lint-agent**: exit 0。detectors = eslint, typecheck-node, typecheck-web, depcruise, check:constitution (項目 21 を含め ok 20 / violations 0 / 検査対象なし 1)。scope 内の violations 0 件 (21 warnings はすべて scope 外)。test:rules は実行していない
- **test-agent**: scope full、exit 0、passed 3953 / failed 0 / errors 0
- **convention-reviewer**: Critical 0 / High 0 / Medium 1 / Low 5。Medium / Low は AD-050 に従って直さずに残す
- **platform-boundary-reviewer**: Critical 0 / High 0 / Medium 0 / Low 0 (起動理由: eslint.config.mjs)

## 起動しなかった reviewer

- a11y-reviewer: gates=['pr-gate'] に code-gate が無い
- ux-reviewer: gates=['pr-gate'] に code-gate が無い
- database-reviewer: auto_invoke_patterns に一致する変更ファイルが無い

## MUST_FIX findings (0)

なし。auto-fix loop は実行していない。
