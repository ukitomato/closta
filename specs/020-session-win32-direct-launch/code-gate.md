# Code Gate Iteration 1: Win32Runtime の直接起動 (X-8)

**Run**: 2026-10-21
**Spec**: specs/020-session-win32-direct-launch/
**Diff scope**: 82 files (base: 0ba52bdf = merge-base with main; working tree diff。101 files changed, +6544/-161 のうち touched-files.txt との交差)
**Tracks**: lint-agent (eslint, tsc-node, tsc-web, tsc-e2e, depcruise, constitution), test-agent (full), convention-reviewer, database-reviewer, platform-boundary-reviewer
**起動しなかった reviewer**: a11y-reviewer (gates=['pr-gate'] に code-gate が無い), ux-reviewer (gates=['pr-gate'] に code-gate が無い)

## Verdict

| Severity | Count | Where |
|---|---|---|
| MUST_FIX | 0 | - |
| SHOULD_FIX | 26 | lint warning 24 (prettier/prettier, 6 files) / database-reviewer High 2 |
| CONSIDER | 12 | reviewer Medium 7 / Low 5 |

**Status**: PASS

## Track 結果

- lint-agent: exit 0。eslint error 0 / warning 24 (すべて prettier/prettier)。tsc x3 exit 0。depcruise 0 violations (516 modules)。check:constitution 21 項目 ok 20 / violations 0 / 検査対象なし 1。test:rules は実行していない。
- test-agent: scope full、exit 0。passed 3660 / failed 0 / skipped 0、Errors / Unhandled Errors 0。838 suites。
- convention-reviewer: Critical 0 / High 0 / Medium 2 / Low 2 (`convention-reviewer.code-gate.md`)
- database-reviewer: Critical 0 / High 2 / Medium 2 / Low 1 (`database-reviewer.code-gate.md`)
- platform-boundary-reviewer: Critical 0 / High 0 / Medium 3 / Low 2 (`platform-boundary-reviewer.code-gate.md`)

## MUST_FIX findings (0)

なし。

## SHOULD_FIX (pr-gate に引き継ぐ High)

- database-reviewer H-001: 設定ファイルの読み込みが失敗 (read-failed / newer-version / parse-failed) すると指定が「指定なし」に倒れ、自動探索の別の claude.exe を `claudeOverridden: false` で採る (`src/main/app/composition-root.ts:121-133`)。data-model §3 の表どおりだが FR-006 との整合に仕様判断が要る。
- database-reviewer H-002: `newer-version` のファイルを書き込まない契約 (data-model §3) に対し、`saveWin32ClaudePath` (`src/main/infra/settings/runtime-settings-store.ts:147-163`) にガードがない。
- lint warning 24 件 (prettier/prettier): `launch-preparation.test.ts`, `provider-service.test.ts`, `win32-claude-path-service.ts`, `win32-claude.ts`, `runtime-settings-store.ts`, `LaunchDialog.test.tsx`。

## 備考

- Phase 1 の diff 起点: working tree に未コミット変更 (spec 文書 3 件) があるが実装は d3962a8 でコミット済み。SKILL の `diff_range=HEAD` では実装を見落とすため、merge-base (0ba52bdf) から working tree までの diff を使った。
- touched-files.txt にあり diff に無い行: 0 件。diff にあり touched に無い行: spec 文書と ADR 0058 (design 成果物) のみ。
