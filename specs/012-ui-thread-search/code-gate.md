# Code Gate: Thread 検索と探す操作 (O-3)

**Run**: 2026-10-07T00:00:00+09:00
**Spec**: specs/012-ui-thread-search/
**Entry status**: reviewing (pr-gate round 1 の修正の後の再実行。status は動かさない)
**Final iteration**: 2 (詳細は `code-gate.md.iter2`。前回の本ファイルは `code-gate.md.20261007T100842` に退避)
**Diff scope**: 96 files, +10348/-437 (base 7bdb271 = merge-base main..HEAD ddc052e)

## Verdict

**Status**: FIX_REQUIRED — MUST_FIX (halt: 人間の判断が要る)

| Severity | Count | Where |
|---|---|---|
| MUST_FIX | 1 | src/renderer/src/features/chat/virtualization.test.tsx:104 |
| SHOULD_FIX | 0 | - |
| CONSIDER | 26 | Medium 6 / Low 20 (`<reviewer>.code-gate.md` を参照) |

- lint track: 6 detectors すべて exit 0、violations 0
- test track (scope: full): exit 1。2265 passed / 1 failed / 0 errors (132 files すべて起動)
- reviewer: convention / database / platform-boundary いずれも Critical 0 / High 0
- 起動しなかった reviewer: a11y-reviewer, ux-reviewer (gates=['pr-gate'] に code-gate が無い)

## MUST_FIX (max_iter 未到達で halt)

### MF-001 — 仮想化のテストが全件実行の中で 5000ms の timeout を超える [origin: test]

- 全件実行で 6063ms、`Test timed out in 5000ms`。assertion の失敗ではない
- implementer (fix, iter 2) は **skipped** (`code-gate.md.iter2.implementer.json`):
  - base (7bdb271) と HEAD (ddc052e) の A/B 計測 (単独・交互に 7 回ずつ) で、本 feature による描画コストの後退は否定された (平均 約1543ms 対 約1586ms、差はノイズの範囲)
  - 原因は、テスト自体の重さ (3000 件の描画で単独 約1.5-2s) が全件実行の負荷で約 3 倍に伸びること
- 直し方の選択に人間の判断が要るため、auto-fix loop を止めた。コードは何も変えていないので、もう 1 周しても同じ結果になる (偶然通ることはありうるが、それは信号を消すだけで原因の修正にならない)
- 選択肢:
  - (a) このテストにだけ timeout を明示する — 閾値を緩める案。検出しなくなるだけ
  - (b) テストの件数 (200/3000) を減らす — spec 003 の SC-003 のテスト設計を変える
  - (c) `vitest.config` の `testTimeout` か `maxWorkers` を見直す — LivePane.test.tsx:119 と SessionListScreen.test.tsx:735 (単独 3354ms) にも効く全体の判断。012 の範囲の外

## Iteration history

| iter | must_fix | skipped | error |
|---|---|---|---|
| 1 | 0 | 0 | 0 |
| 2 | 1 | 1 | 0 |
