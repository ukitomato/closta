# Code Gate Iteration 2: supervisor 分離とマルチセッション (X-5)

**Run**: 2026-10-02
**Spec**: specs/009-session-supervisor-and-multi-session/
**Entry status**: reviewing (iteration 1 で PASS → implementing → reviewing。利用者の判断で SHOULD_FIX / CONSIDER を直してから再実行。status は据置)
**Diff scope**: 97 files (`diff_files ∩ touched-files.txt`。未コミット作業ツリー)。iteration 2 の中で invoker が直した L-006 / L-007 / L-101 の 2 ファイルを足して touched-files は 99 件
**Tracks**: lint-agent, test-agent, convention-reviewer, platform-boundary-reviewer
**起動しなかった reviewer**: a11y-reviewer / ux-reviewer (gates=['pr-gate'])、database-reviewer (auto_invoke_patterns に一致する変更なし)。security / architecture / po は pr-gate 専任
**iteration 1**: [code-gate.md.iter1](code-gate.md.iter1) (PASS。MUST_FIX 0 / SHOULD_FIX 1 / CONSIDER 16)

## Verdict

| Severity | Count | Where |
|---|---|---|
| MUST_FIX | 0 | — |
| SHOULD_FIX | 0 | — |
| CONSIDER | 4 | convention L-006 (修正済み) / L-007 (修正済み) / L-008 (見送り: 500 行超のファイル 3 件。分割は後続)、platform-boundary L-101 (修正済み) |

**Status**: PASS

## iteration 1 の指摘の解消

- convention: 12 件すべて resolved (H-001 / M-001〜M-006 / L-001〜L-005)
- platform-boundary: 5 件すべて resolved (M-001〜M-003 / L-001〜L-002)

## Tracks

| Track | 結果 |
|---|---|
| lint-agent | exit 0。lint / typecheck:node / typecheck:web / typecheck:e2e / depcruise / check:constitution の 6 detector すべて違反 0 |
| test-agent | exit 0、scope: full。94 files / 1637 tests passed、Errors 0。iteration 2 内の修正後に invoker が全件を再実行し同じ結果 |
| convention-reviewer | Critical 0 / High 0 / Medium 0 / Low 3 ([raw](convention-reviewer.code-gate.md)) |
| platform-boundary-reviewer | Critical 0 / High 0 / Medium 0 / Low 1 ([raw](platform-boundary-reviewer.code-gate.md)) |

## iteration 2 の中で invoker が直したもの

- **L-006**: `SessionScreen.tsx` のコメント (`useRunningThreadList.ts`)、`running-session-store.test.ts` の describe 見出し、`eslint.config.mjs` の (3) のコメントに `worker_threads`
- **L-007**: `transport.test.ts` の `OpaqueBody` を `./transport` から import
- **L-101**: `.dependency-cruiser.js` に `worker-threads-only-from-entry`、fixture `app-worker-threads-via-get-builtin-module` (depcruise)、`expected.mjs` の mitigatedBy と `eslint.config.mjs` のコメント
- 検証: depcruise 違反 0 / test:rules 64 件すべて期待表と一致 / lint 0 / unit 1637 passed / typecheck node 0

## 見送り

- **L-008** (500 行超: `SessionScreen.tsx` 567 / `LaunchDialog.tsx` 733 / `sdk-agent-session.ts` 566): reviewer が「本 PR での分割は求めない」とした。後続で一覧と画面の結線の分離を検討する
