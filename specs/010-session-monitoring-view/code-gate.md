# Code Gate Iteration 1: セッション監視ビュー (O-1)

**Run**: 2026-10-02T21:00:00+09:00
**Spec**: specs/010-session-monitoring-view/
**Diff scope**: 32 files (未コミット。tracked の変更 20 files +1201 / -189 と、未追跡の新規ファイル) / base: 949ad1b
**Tracks**: lint-agent, test-agent, convention-reviewer, platform-boundary-reviewer (`.dependency-cruiser.js` の変更で起動条件に一致)

起動しなかった reviewer:
- a11y-reviewer: gates=['pr-gate'] に code-gate が無い
- ux-reviewer: gates=['pr-gate'] に code-gate が無い
- database-reviewer: auto_invoke_patterns に一致する変更ファイルが無い

**範囲の決め方の注記**: SKILL の手順 (`git diff --name-only HEAD`) は未追跡の新規ファイルを含まないため、`git ls-files --others --exclude-standard` を足して touched-files.txt と突き合わせた (新規の 12 ファイルが範囲から落ちないようにするため)。

## Verdict

| Severity | Count | Where |
|---|---|---|
| MUST_FIX | 0 | — |
| SHOULD_FIX | 0 | — |
| CONSIDER | 13 (Medium 3 / Low 10。dedup 後) | 下表 |

**Status**: PASS

- lint-agent: 7 検出器 (eslint / tsc ×4 [node・web・e2e・perf] / dependency-cruiser / constitution-check) すべて exit 0、違反 0 件
- test-agent: scope full、101 files / 1719 tests passed、exit 0、Errors / Unhandled Errors 0
- convention-reviewer: Critical 0 / High 0 / Medium 3 / Low 7
- platform-boundary-reviewer: Critical 0 / High 0 / Medium 1 / Low 3

## MUST_FIX findings (0)

なし。

## CONSIDER (Medium / Low。auto-fix の対象外)

| ID | origin | 要旨 |
|---|---|---|
| CM-01 | convention M-001 | `*.monitor.test.*` の命名に前例が無く、tasks.md のテストファイル名と一致しない (最小案: tasks.md に実装時の変更を記録) |
| CM-02 | convention M-002 | `running-session-store.ts` が 587 行で 500 行を超えた (派生値の追跡と間引きを別モジュールに切り出す案) |
| CM-03 | convention M-003 / platform-boundary M-001 | `e2e/` と `perf/` は ESLint の対象外で、perf が子プロセスを起こさないことを機械的に守る検査が無い。eslint.config.mjs のコメントが古い (system scope。最小案: コメントを直し roadmap に追記) |
| CL-01 | convention L-001 | `Elapsed` 型の二重定義 |
| CL-02 | convention L-002 | 使われていない export (`ACTIVITY_SCAN_BUDGET` / `ANNOUNCE_FOLDER_FALLBACK` / `Elapsed` / `ThreadListRowDensity`) |
| CL-03 | convention L-003 | `RowStatus` と `rowStatus` の名前の近さ、props 型に `SessionRowStatus` を使っていない |
| CL-04 | convention L-004 | 直近の活動の前置きの `:` が JSX に直書き (Principle XV) |
| CL-05 | convention L-005 | `perf/real-sessions.spec.ts` の import 順 |
| CL-06 | convention L-006 | data-model の `SessionRowStatus` の定義場所の記述が誤り |
| CL-07 | convention L-007 | `announcements` / `formatElapsed` の名前と返り値 |
| CL-08 | platform-boundary L-001 | perf のランタイム / 作業フォルダの選択が部分一致の最初の候補 (停止中・複数一致を弾かない) |
| CL-09 | platform-boundary L-002 | perf が起動時の権限モードが既定であることを確かめない |
| CL-10 | platform-boundary L-003 | `not-to-test` の発火を確かめる違反サンプルが無い (system scope。e2e からの既存の穴) |

## Iteration 2 — CONSIDER の対応と再検査 (2026-10-03。利用者の指示「推奨で進めて」)

iteration 1 の MUST_FIX は 0 件。利用者の指示で、CONSIDER のうち小さい整理と記述の修正を pr-gate の前に入れ、検査を全件で流し直した (implementer は使っていない)。

| ID | 対応 |
|---|---|
| CM-01 | tasks.md (SH-003) に「`*.monitor.test.*` に分けた理由と、Announcer / ナビのバッジのテストの置き場」を実装時の変更として記録 |
| CM-02 | 見送り。tasks.md (SH-004) に 500 行超えの理由と、O-2 の前に切り出す宿題を記録 |
| CM-03 | `eslint.config.mjs` の古いコメントを現状に合わせ、roadmap の system-scope の項目に「ESLint も e2e/ と perf/ を見ていない」とつなぎの案を追記 |
| CL-01 | `Elapsed` 型を `labels.ts` に一本化し、`session-view.ts` は `import type` |
| CL-02 | `ACTIVITY_SCAN_BUDGET` / `ANNOUNCE_FOLDER_FALLBACK` の export を外した。`ThreadListRowDensity` は element の公開 API として注記を足して残した |
| CL-03 | `RowStatus` を `RowStatusBadge` に改名し、props の型を `SessionRowStatus` にした |
| CL-04 | 前置きの区切りを `labels.ts` の `activityPrefixLabel` で組む (JSX の直書きを除いた) |
| CL-05 | `perf/real-sessions.spec.ts` の import 順を std → 3rd party に |
| CL-06 | data-model の `SessionRowStatus` の定義場所の記述を `labels.ts` に直した |
| CL-07 | 見送り (data-model の命名どおり。Low) |
| CL-08 | perf の選択肢は完全一致を優先し、部分一致が 2 件以上なら `*-ambiguous`、停止中のランタイムは `runtime-stopped` で止める |
| CL-09 | perf は起動の直前に権限モードが `default` であることを確かめ、違えば `permission-mode-not-default` で止める |
| CL-10 | roadmap の system-scope の項目に追記 (e2e からの既存の穴) |

再検査 (全件): ESLint exit 0 / tsc node・web・e2e・perf exit 0 / dependency-cruiser 違反 0 / Constitution 検証 違反 0 (検査対象なし 1 は #5 で R-1 からの設計どおり) / vitest 101 files・1719 tests passed (scope full)。

**Status (iteration 2)**: PASS

## Track raw outputs

- [lint-agent.code-gate.json](./lint-agent.code-gate.json)
- [test-agent.code-gate.json](./test-agent.code-gate.json)
- [convention-reviewer.code-gate.md](./convention-reviewer.code-gate.md)
- [platform-boundary-reviewer.code-gate.md](./platform-boundary-reviewer.code-gate.md)
