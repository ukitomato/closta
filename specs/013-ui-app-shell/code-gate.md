# Code Gate: アプリのシェルを目標レイアウトにする (O-7)

**Run**: 2026-10-05
**Spec**: specs/013-ui-app-shell/
**Diff scope**: `.code-gate-scope.txt` (iteration 1: 70 files。base 0818409 = origin/main との merge-base)。iteration 2 は f82c8dc 以降の SHOULD_FIX の対応の差分
**Tracks**: lint-agent, test-agent, convention-reviewer (stack 別の追加 reviewer は無し)

## Verdict

| Severity | iteration 1 | iteration 2 (最終) |
|---|---|---|
| MUST_FIX | 0 | 0 |
| SHOULD_FIX (High) | 0 | 0 |
| CONSIDER (Medium / Low) | Medium 9 / Low 10 | Medium 0 / Low 10 |

**Status**: **PASS** (must_fix 0。iteration 1 で PASS の条件を満たし、SHOULD_FIX を直した差分を iteration 2 で再検証した)

## Tracks

| Track | iteration 1 | iteration 2 |
|---|---|---|
| lint (eslint / tsc ×4 (node・web・e2e・perf) / depcruise / check:constitution) | lint-agent: 全 exit 0、violations 0 (350 modules) | invoker が agent 用の列のコマンドを直接実行: 全 exit 0、violations 0 (356 modules) |
| test (`vitest run` 全件) | test-agent (scope: full): 115 files / 1926 passed、exit 0 | invoker が直接実行 (scope: full): 119 files / 1943 passed、exit 0 |
| convention | convention-reviewer: Critical 0 / High 0 / Medium 9 / Low 10 ([raw](convention-reviewer.code-gate.md)) | convention-reviewer (差分のみ): Critical 0 / High 0 / Medium 0 / Low 10 ([raw](convention-reviewer.code-gate.iter2.md)) |

両 iteration の raw output に `viewpoint_coverage_check` (A〜H すべてあり) と `cascade_enforce` (降格 0) を実行した。

**起動しなかった reviewer** (`gate_common::reviewers_filter` の理由):

- a11y-reviewer / ux-reviewer / ui-coverage-reviewer — `gates=['pr-gate']` に code-gate が無い
- database-reviewer / platform-boundary-reviewer — `auto_invoke_patterns` に一致する変更ファイルが無い (変更 70 件)

## iteration 1 の SHOULD_FIX / CONSIDER の対応

MUST_FIX が 0 なので auto-fix loop (implementer) は起動していない。指摘は invoker が直した。

| ID | 対応 |
|---|---|
| M-001 | `LivePane.tsx` の export を `LiveCenter` → `LivePane`、`LaunchPanel` → `LaunchDialogContent` (iteration 2 の L-101 で `LaunchEntry` から再改名) |
| M-002 | glossary の Monitoring view に `RunningSessionsView` は監視ビューではない旨の Counterexample |
| M-003 | 中央のヘッダを `features/shell/CenterHeader.tsx` にまとめ、`CenterPane.tsx` が稼働中 (`RunningCenter`) と過去の両方で描く。`LivePane.tsx` の `SessionHeader` を外した |
| M-004 | `rows.ts` の `formatSessionTime`、`session-list/labels.ts` の `GROUP_KIND_LABELS`。一覧の見出しの所在は `locationLabelOf` |
| M-005 | `features/shell/shell-layout.ts` に幅の px と class を対で置き、`Sidebar` / `RightPanel` / `useAutoCollapse` がそこから取る |
| M-006 | `AppShell.test.tsx` に中央のヘッダの密度の切り替えのテスト (過去・稼働中) |
| M-007 | roadmap / plan / session charter の記述を事実に直した。切り出しの持ち主には当たらないと**利用者が決めた (2026-10-05)** |
| M-008 | 純関数の単体テスト 4 本 (`panel-tabs` / `shell-layout` / `group-label` / `rows`)。`AppShell.test.tsx` の分割は見送り、O-4 の行に「タブのテストは分けて足す」と記録した |
| M-009 | `docs/ui-coverage.md` の F 節の制御文字 (PowerShell の backtick で化けた ESC / TAB) を直した |
| L-001〜L-009 | 古い注記・テスト名、`ThreadListNew` と `SESSION_ACTION_LABELS.newSession` の削除、起動ダイアログと組み合わせの画面の文言 (「設定の「作業フォルダ」で」)、data-model §6 / plan の Project Structure、`running-sessions-harness.tsx`、import の並び、perf の `openLaunchDialog`、`openSettings('folders')` の例外の明記、`SETTINGS_SECTION_CONTENT`、quickstart V-1 の grep の単語の境界、glossary の `focus` |
| L-010 | system-scope。roadmap の「lint と reviewer の発火条件の死角」に (1) 使われない export (2) import の並び (3) a11y / ux の `labels.ts` (4) docs の制御文字 として記録 |

## iteration 2 の Low の対応

| ID | 対応 |
|---|---|
| L-101 | `LaunchEntry` (X-1 で消えた部品と同名) → `LaunchDialogContent` |
| L-102 | `eslint.config.mjs` の注記を `RowOptionsContext` に |
| L-103 | 規則の正本を ui charter の「面の状態」に置き、glossary / data-model / `useShellFocus.ts` から参照する。AD-046 :38 (accepted) の扱いは pr-gate の architecture-reviewer に申し送る |
| L-104 | describe を `RunningCenter (シェル) — 中央のヘッダの表示名` にし、テスト用の面にシェルの部品を通す理由を書いた |
| L-105 | `CenterHeader` の `statusTestId` と `session-status` を外した |
| L-106 | `GROUP_KIND_LABELS` を `Record<Exclude<SessionGroupDTO['kind'], 'pending'>, string>` に |
| L-107 | glossary の Shell の Definition にコードの名前 (`CenterHeader` / `CenterPane` / `LivePane` / `ChatScreen`) を移し、"Pane" の注意を Counterexample に |
| L-108 | data-model §5 の中央のヘッダの表を 3 列 (題・補足・状態) と `CenterHeader` に。plan :93 に「design の時点の判断」と明記 |
| L-109 | `ChatScreen` の `densityToggle` の注記を本番の置き場所 (`CenterHeader`) に合わせた |
| L-110 | quickstart-results を最終の値に更新し、E2E を流し直した (下記) |

L-101〜L-110 の対応の後に lint (全 exit 0) と全件の `vitest run` (119 files / 1943 passed) を流し直した。

## E2E と基準画像 (code-gate の track ではない。quickstart-results が正本)

- 最終のビルドで E2E 全件: 11 passed / 1 failed (`composer-screenshot`)
- `composer-screenshot` の基準画像は、実装の時点で本機で撮り直していたが、**原因の見立てが誤っていた** (本機の描画の揺れ) ので main のものに戻した。本機ではこのテストは本機と CI の高さ 1px の差で落ちる (main でも同じ)。合否は PR の CI で見る。詳細は [quickstart-results](quickstart-results.md)

## 次のアクション

`/cl-pr-gate`。申し送り: L-103 (AD-046 :38 と例外 2 件の関係)、L-003 で直した文言の最終判断 (ux-reviewer)、M-009 で直した F 節の中身 (ui-coverage-reviewer)
