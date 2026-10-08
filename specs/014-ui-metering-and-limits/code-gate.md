# Code Gate Iteration 1: 計量と制限の表示 (O-4)

**Run**: 2026-10-09
**Spec**: specs/014-ui-metering-and-limits/
**Diff scope**: 88 files (diff ∩ touched-files.txt), +10825/-895 (base 44ce810 = `git merge-base main HEAD`、前 feature O-3 の最後のコミット)
**Tracks**: lint-agent, test-agent, convention-reviewer, platform-boundary-reviewer

base の注記: `origin/HEAD` は `origin/001-runtime-folder-registration-runtime-detection` を指しており古い。SKILL の既定の解決 (origin/HEAD の merge-base) では前の feature の差分まで入るため、`main` との merge-base を起点にした。diff にあって touched に無い 21 件 (codegraph / serena の設定と本 spec dir の設計文書) は scope から落とした。touched にあって diff に無いものは 0 件。

## Verdict

| Severity | Count | Where |
|---|---|---|
| MUST_FIX | 0 | — |
| SHOULD_FIX | 0 | — |
| CONSIDER | 14 | Medium 3 / Low 11 (下表) |

**Status**: PASS

## Tracks

| Track | 結果 |
|---|---|
| lint-agent | exit 0。違反 0 件 (error 0 / warning 0 / info 0)。detectors: lint (77 files) / typecheck (node, web) / depcruise / check:constitution (ok 20 / pending 1) |
| test-agent | scope: full。exit 0。144 files / 2604 tests passed、failed 0、skipped 0、error 0 |
| convention-reviewer | Critical 0 / High 0 / Medium 2 / Low 7 |
| platform-boundary-reviewer | Critical 0 / High 0 / Medium 1 / Low 4 (起動理由: `eslint.config.mjs` が `**/eslint.config.*` に一致) |

起動しなかった reviewer (`reviewers_filter` の理由):

- a11y-reviewer / ux-reviewer / ui-coverage-reviewer: gates=['pr-gate'] に code-gate が無い
- database-reviewer: auto_invoke_patterns に一致する変更ファイルが無い (変更 88 件 / pattern 5 件)

## MUST_FIX findings (0)

なし。

## CONSIDER findings (14、auto-fix の対象外)

| ID | Severity | origin | 概要 | 詳細 |
|---|---|---|---|---|
| CONV M-001 | Medium | convention | `tests/meter/meter-through.test.tsx` がどの型検査 (tsconfig.node / tsconfig.web / CI) にも入っていない。tests/ の置き場の規則 (vitest.config.ts:13-14 / discovery.md:372) も古い | convention-reviewer.code-gate.md |
| CONV M-002 | Medium | convention | `running-session-store.ts` が切り出し後 588 → 670 行 (切り出し前 650 を超えた)。`session/labels.ts` が 486 → 535 行で 500 行超 | 同上 |
| CONV L-001 | Low | convention | 外から参照されない export (meter.ts の 6 つ、`SESSION_ROW_STATUSES`)。テストが境界値を数で直書き | 同上 |
| CONV L-002 | Low | convention | 計量の型の import 元が 3 つあり混在。`quota-banner.ts` が hook モジュールから型を取る | 同上 |
| CONV L-003 | Low | convention | `Intl.NumberFormat('ja-JP', …)` が chat/labels.ts と shell/labels.ts に重複 | 同上 |
| CONV L-004 | Low | convention | glossary「Unsafe permission mode banner」と識別子 `UnsafeModeBanner` の不一致。「プロバイダ」の書き残し 2 件 (touched 外) | 同上 |
| CONV L-005 | Low | convention | 手を入れた `tool-fallback.aui.tsx` が eslint の厳しさを戻す一覧に無い | 同上 |
| CONV L-006 | Low | convention | Principle XIII: 経過時間の自作前の候補 `useToolCallElapsed` / `ToolFallbackDuration` が research R-09 に無い | 同上 |
| CONV L-007 | Low | convention | FR-018 の切り出しを別コミットにする plan RK-11 が履歴に無い (diff 上は既存テストの変更が追加のみ) | 同上 |
| PB M-001 | Medium | platform-boundary | quickstart「形の控え方」(:43-44) が `CLAUDE_CONFIG_DIR` の RuntimePath・`--permission-mode`・`wsl.exe --exec` を欠く (design-gate MG-14 から持ち越し。V-4 の前に直す) | platform-boundary-reviewer.code-gate.md |
| PB L-001 | Low | platform-boundary | O-4 の暫定の隔離の文言ルールが isolation charter に記録されていない (arch MG-12 と同事象) | 同上 |
| PB L-002 | Low | platform-boundary | 項目 16 の denylist (`allowlists.mjs:435`) が `PERMISSION_MODE_KEYS` とテストでつながっていない | 同上 |
| PB L-003 | Low | platform-boundary | 昇格の観測を記録しないことが roadmap:388 の I-3 申し送りに無い (design-gate R3 から残る) | 同上 |
| PB L-004 | Low | platform-boundary | ランタイムが一覧から消えた場合の `undetermined` fallback のテストが無い | 同上 |

## Auto-fix loop

MUST_FIX 0 件のため実行していない。iter_history: `[{iter: 1, must_fix: 0, skipped: 0, error: 0}]`。

## 機械検査

- `cascade_enforce` / `viewpoint_coverage_check` を convention-reviewer.code-gate.md と platform-boundary-reviewer.code-gate.md に対して実行 (結果は .gate-verdict-code.json の tracks)
- verdict JSON: `.gate-verdict-code.json`
