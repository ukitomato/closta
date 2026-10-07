# Code Gate: Thread 検索と探す操作 (O-3)

**Run**: 2026-10-07T12:14:23+09:00
**Spec**: specs/012-ui-thread-search/
**Entry status**: reviewing (pr-gate round 1 の修正と iter 2 の MUST_FIX の修正の後の再実行。status は動かさない)
**Final iteration**: 3 (詳細は `code-gate.md.iter3`。前回の本ファイルは `code-gate.md.20261007T121405` に退避)
**Diff scope**: 97 files (base 7bdb271 = merge-base main..HEAD 397d5f1。diff 全体は 127 files, +17798/-437 で、scope 外の 30 件は spec_dir の gate 出力・設計文書と基準画像 png)
**Tracks**: lint-agent, test-agent, convention-reviewer, database-reviewer, platform-boundary-reviewer

## Verdict

**Status**: PASS

| Severity | Count | Where |
|---|---|---|
| MUST_FIX | 0 | - |
| SHOULD_FIX | 0 | - |
| CONSIDER | 27 | Medium 6 / Low 21 (`<reviewer>.code-gate.md` を参照) |

- lint track: 6 detectors (lint / typecheck / depcruise / check:constitution / typecheck:e2e / typecheck:perf) すべて exit 0、violations 0。`test:rules` は code-gate では実行しない
- test track (scope: full): exit 0。132/132 files、2266 passed / 0 failed / 0 errors / 0 unhandled errors
  - この iteration の 1 回目の起動は親プロセスの終了で結果を返さずに止まった (vitest のプロセスは残っていない)。他の agent を止めた状態で単独で取り直した
  - iter 2 の MF-001 の対象 (`virtualization.test.tsx` の SC-003) は 5814ms で pass。旧既定の 5000ms は超えるが、testTimeout 20000ms の内側
- reviewer: convention (Medium 3 / Low 8)、database (Medium 2 / Low 8)、platform-boundary (Medium 1 / Low 5)。いずれも Critical 0 / High 0。iter 2 から解消 0 / 新規 0 (convention の L-008 は箇所が `vitest.config.ts:21` に移った)
- cascade_enforce: 降格 0 件 (3 本とも)。viewpoint_coverage_check: A-H の欠落 0 件 (3 本とも)
- 起動しなかった reviewer: a11y-reviewer, ux-reviewer (gates=['pr-gate'] に code-gate が無い)

## Iteration history

| iter | must_fix | skipped | error | 内容 |
|---|---|---|---|---|
| 1 | 0 | 0 | 0 | pr-gate round 1 より前の実行。PASS |
| 2 | 1 | 1 | 0 | MF-001: 全件実行の負荷の下で `virtualization.test.tsx` の SC-003 が既定 5000ms の timeout を超えた。implementer (fix) は A/B 計測で本 feature による描画コストの後退を否定し、直し方の選択に人間の判断が要るとして skipped |
| 3 | 0 | 0 | 0 | iter 2 の MF-001 は人間の判断で選択肢 (c) を選び、397d5f1 で `vitest.config.ts` の node / renderer 両 project に testTimeout 20s (`TEST_TIMEOUT_MS`) を置いた (implementer の applied 1。737e118 の per-test の 20s は差し戻し)。inline の project は `extends: true` が無いとルートの `test` を継がないので、ルートではなく project ごとに置いている。全件実行で PASS |
