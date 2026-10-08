# Code Gate Iteration 2: 計量と制限の表示 (O-4)

**Run**: 2026-10-09 (status `reviewing` からの再実行。pr-gate round 1 の修正コミット 8aed1db の後)
**Spec**: specs/014-ui-metering-and-limits/
**Diff scope**: 88 files (diff ∩ touched-files.txt), +10842/-895 (base 44ce810 = `git merge-base main HEAD`、前 feature O-3 の最後のコミット。HEAD 8aed1db)
**Tracks**: lint-agent, test-agent, convention-reviewer, platform-boundary-reviewer

base の注記: `origin/HEAD` は `origin/001-runtime-folder-registration-runtime-detection` を指しており古い。iter 1 と同じく `main` との merge-base を起点にした。diff にあって touched に無い 37 件 (dc9ef2e の codegraph / serena / `.claude` の設定と、本 spec dir の設計文書・gate の成果物) は scope から落とした。touched にあって diff に無いものは 0 件。touched-files.txt の重複 4 行は normalize で畳んだ。

## Verdict

| Severity | Count | Where |
|---|---|---|
| MUST_FIX | 0 | — |
| SHOULD_FIX | 0 | — |
| CONSIDER | 15 | Medium 3 / Low 12 (下表) |

**Status**: PASS

## Tracks

| Track | 結果 |
|---|---|
| lint-agent | exit 0。違反 0 件 (error 0 / warning 0 / info 0)。detectors: lint (401 files linted, touched で絞り込み) / typecheck (node, web) / depcruise / check:constitution (ok 20 / pending 1) |
| test-agent | scope: full。exit 0。144 files / 2605 tests passed、failed 0、skipped 0、error 0 (iter 1 から +1 は 8aed1db の class のテスト) |
| convention-reviewer | Critical 0 / High 0 / Medium 2 / Low 8 (iter 1 から持ち越し 9、新規 1) |
| platform-boundary-reviewer | Critical 0 / High 0 / Medium 1 / Low 4 (すべて iter 1 から持ち越し、新規 0)。起動理由: `eslint.config.mjs` が `**/eslint.config.*` に一致 |

起動しなかった reviewer (`reviewers_filter` の理由):

- a11y-reviewer / ux-reviewer / ui-coverage-reviewer: gates=['pr-gate'] に code-gate が無い
- database-reviewer: auto_invoke_patterns に一致する変更ファイルが無い (変更 88 件 / pattern 5 件)

## MUST_FIX findings (0)

なし。

## CONSIDER findings (15、auto-fix の対象外)

| ID | Severity | origin | 概要 | 詳細 |
|---|---|---|---|---|
| CONV M-001 | Medium | convention | `tests/meter/meter-through.test.tsx` がどの型検査にも入っていない。tests/ の置き場の規則 (vitest.config.ts:13-14 / discovery.md:372) も古い (持ち越し) | convention-reviewer.code-gate.md |
| CONV M-002 | Medium | convention | `running-session-store.ts` 670 行 (切り出し前 650 を超えた)、`session/labels.ts` 535 行で 500 行超 (持ち越し) | 同上 |
| CONV L-001 | Low | convention | 外から参照されない export (meter.ts の 6 つ、`SESSION_ROW_STATUSES`)。テストが境界値を数で直書き (持ち越し) | 同上 |
| CONV L-002 | Low | convention | 計量の型の import 元が 3 つあり混在 (持ち越し) | 同上 |
| CONV L-003 | Low | convention | `Intl.NumberFormat('ja-JP', …)` の重複 (持ち越し) | 同上 |
| CONV L-004 | Low | convention | glossary「Unsafe permission mode banner」と `UnsafeModeBanner` の不一致。「プロバイダ」の書き残し 2 件 (持ち越し) | 同上 |
| CONV L-005 | Low | convention | `tool-fallback.aui.tsx` が eslint の厳しさを戻す一覧に無い (持ち越し) | 同上 |
| CONV L-006 | Low | convention | Principle XIII: `useToolCallElapsed` / `ToolFallbackDuration` が research R-09 に無い (持ち越し) | 同上 |
| CONV L-007 | Low | convention | FR-018 の切り出しを別コミットにする plan RK-11 が履歴に無い (持ち越し) | 同上 |
| CONV L-008 | Low | convention | **新規**。警告の帯の class が 3 か所に複製され、8aed1db が `CenterBanners.tsx:91,158` だけ文字色を変えたため `LivePane.tsx:323` (`FailureBanner`) と食い違った | 同上 |
| PB M-001 | Medium | platform-boundary | quickstart「形の控え方」(:43-44) が `CLAUDE_CONFIG_DIR` の RuntimePath・`--permission-mode`・`wsl.exe --exec` を欠く (持ち越し。V-4 の前に直す) | platform-boundary-reviewer.code-gate.md |
| PB L-001 | Low | platform-boundary | O-4 の暫定の隔離の文言ルールが isolation charter に未記録 (持ち越し) | 同上 |
| PB L-002 | Low | platform-boundary | 項目 16 の denylist (`allowlists.mjs:435`) と `PERMISSION_MODE_KEYS` をつなぐテストが無い (持ち越し) | 同上 |
| PB L-003 | Low | platform-boundary | 昇格の観測を記録しないことが roadmap:388 の I-3 申し送りに無い (持ち越し) | 同上 |
| PB L-004 | Low | platform-boundary | ランタイムが一覧から消えた場合の `undetermined` fallback のテストが無い (持ち越し) | 同上 |

## Auto-fix loop

MUST_FIX 0 件のため実行していない。本 run で implementer は起動していない (applied 0 / skipped 0 / error 0)。iter_history: `[{iter: 1, must_fix: 0, skipped: 0, error: 0}, {iter: 2, must_fix: 0, skipped: 0, error: 0}]`。

## Status

entry_status が `reviewing` のため据置 (遷移コマンドは実行していない)。

## 機械検査

- `viewpoint_coverage_check`: convention-reviewer.code-gate.md / platform-boundary-reviewer.code-gate.md とも A-H すべて present
- `cascade_enforce`: 両ファイルとも降格 0 件 (Critical 申告なし)
- `verdict_validate`: OK (warning なし)。`verdict_require_pass`: OK
- verdict JSON: `.gate-verdict-code.json` (前回分は `.gate-verdict-code.json.bak`、前回の本ファイルは `code-gate.md.20261008T222856`)
