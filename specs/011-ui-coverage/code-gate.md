# Code Gate Iteration 1: ui-coverage 対応表の確立 (O-2)

**Run**: 2026-10-03
**Spec**: specs/011-ui-coverage/
**Diff scope**: 73 files (base 2dcc694 / HEAD a50aea6), +5852 / -231
**Tracks**: lint-agent, test-agent, convention-reviewer, platform-boundary-reviewer (reviewers_filter: `scripts/constitution/**` に一致)
**起動しなかった reviewer**: a11y-reviewer / ux-reviewer (gates=['pr-gate'] に code-gate が無い)、database-reviewer (auto_invoke_patterns に一致する変更ファイルが無い)

## Verdict

| Severity | Count | Where |
|---|---|---|
| MUST_FIX | 0 | — |
| SHOULD_FIX | 0 | — |
| CONSIDER (Medium / Low) | 2 / 8 | 下記 |

- lint-agent: exit 0、eslint / tsc (node・web・e2e・perf) / depcruise / check:constitution の違反 0
- test-agent: scope **full**、113 files / 1878 passed、exit 0
- convention-reviewer: Critical 0 / High 0 / Medium 2 / Low 6
- platform-boundary-reviewer: Critical 0 / High 0 / Medium 0 / Low 2

**Status**: PASS (auto-fix loop は不要。MUST_FIX 0)

## 本 iteration 内で直した CONSIDER (invoker が直接)

| ID | 内容 | 対応 |
|---|---|---|
| PB L-001 | 項目 21 の入力の読み取りが try の外 | `check.mjs` で読めない入力を「検査の入力を読めない」の違反にした |
| PB L-002 | 入力の欠けのテストが対応表だけ | `item21.test.ts` の同じ起動で `sdk.d.ts` の欠けも確かめる |
| CONV M-002 | plan / data-model / tasks の名前が実装と違う | `system-event` / `SystemEventStatus` / `withToolResults` に直し、plan の Project Structure に新設の 4 モジュールを足した |
| CONV L-002 | `coverage.mjs` の内部だけの export 12 個 | `export` を外した |
| CONV L-005 | `thread.aui.tsx` の手書き部分の lint の番人 | `react-hooks/refs` / `no-empty` を戻した (`eslint.config.mjs`) |

修正後に eslint / tsc node・web / check:constitution / vitest 全件 (1878 passed) を再実行して緑。

## 残した CONSIDER (pr-gate に申し送る)

| ID | 内容 | 理由 |
|---|---|---|
| CONV M-001 | `tests/ui-coverage/*.ts` が型検査の外 | `coverage.mjs` に型宣言が要り、同種の既存 5 件 (tests/docs・tests/spec-artifacts) と一緒に扱うのが筋。system scope として記録する |
| CONV L-001 | `coverage.mjs` 692 行 | 任意の分割 |
| CONV L-003 | `.o2` のテストファイル名 | 改名のみ。後続で観点が増えたときに分ける |
| CONV L-004 | discovery の構成図に `scripts/ui-coverage/` / `tests/ui-coverage/` が無い | 文書の追随 |
| CONV L-006 | lint-agent の JSON に `commands[]` が無い | gate 基盤 (system) |

raw output: [convention-reviewer.code-gate.md](convention-reviewer.code-gate.md) / [platform-boundary-reviewer.code-gate.md](platform-boundary-reviewer.code-gate.md)
