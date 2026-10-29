# PR Gate Round 1: 起動中のセッションの UI の手直し (O-13)

**Run**: 2026-10-30
**Base**: main (merge-base 7f6ef94 / head 8c9f442)
**Diff stat**: +6464 -305 over 100 files
**Reviewers**: security-reviewer, architecture-reviewer, po-reviewer, ux-reviewer, a11y-reviewer, platform-boundary-reviewer, ui-coverage-reviewer (7 並列)
**Skipped reviewers**: database-reviewer (auto_invoke_patterns に一致する変更ファイルが無い — 変更 100 件 / pattern 5 件)
**Round inheritance**: Round 1 のため引継ぎなし
**Rule verification**: `node scripts/rules/run.mjs` を単独で実行。期待表と一致 79 件、exit 0 (Round 1。`tests/rule-fixtures/expected.mjs` も変更されている)

## Verdict

| Severity | This round | Resolved from N-1 | New in N | Net | Suppressed by code-gate |
|---|---|---|---|---|---|
| Critical | 0 | 0 | 0 | 0 | 0 |
| High     | 3 | 0 | 3 | 3 | 0 |
| Medium   | 7 | 0 | 7 | 7 | 0 |
| Low      | 14 | 0 | 14 | 14 | 0 |

(dedup 後の件数。reviewer 生値の合計は High 6 / Medium 10 / Low 16。code-gate の `must_fix_findings` は 0 件なので suppress 対象なし。platform-boundary L-001 は code-gate L-001 の持ち越しだが Low で MUST_FIX ではないため suppress しない)

**Status**: PASS (Critical=0)
**Next**:
  PASS → High 3 件を AD-050 に従いこの round の中で直す (High を確かめるためだけの round は回さない) → /cl-done specs/025-ui-live-session-fixes
  **注意 (H-003)**: 本 PR は Constitution の改定 (v1.5.0) を含む。改定手順 2 (人間のレビュー) が済むまで、夜間の自動マージの対象にしない

## Critical (Round 1)

なし。

## High (Round 1)

### H-001 — 停止ボタンの className の typo (`aui-composer-cancelsize-7`) で `size-7` が落ち、送信ボタン (28px) より大きい 36px で描かれる [origin: ux H-001 | a11y H-001 | po H-001]
- **Where**: src/renderer/src/components/assistant-ui/elements/thread.aui.tsx:861
- **Issue**: `aui-composer-cancel size-7 rounded-full` の空白が抜け、`size="icon"` の既定 `size-9` が残る。`aui-composer-cancel` の hook も消えている
- **Why high**: FR-011 / US-3 AC1「場所は今と同じ・送信ボタンより目立たない」と tasks FE-030「大きさは変えない」に反する。生成の開始と終了のたびに composer の行の高さが変わる
- **Suggested fix**: `className="aui-composer-cancel size-7 rounded-full"` に戻す。`composer-escape.test.tsx` に停止ボタンが `size-7` を持つ確認を足す
- **Status in this round**: new

### H-002 — `/resume` の選ぶ画面は、検索で 0 件になっても「このフォルダに過去のセッションはありません」と出す [origin: ux H-002]
- **Where**: src/renderer/src/features/session/ResumePickerDialog.tsx:111, :147
- **Issue**: 空の文言は `all.length === 0` の場合だけを想定しており、検索で絞って 0 件のときにも全件 0 件の文言が出る
- **Why high**: 再開できるセッションが消えたと誤解させる誤情報 (UX-1)。`features/shell/CommandPalette.tsx:185-188` は区別している
- **Suggested fix**: `all.length > 0 && rows.length === 0` のときは「『{query}』に合うセッションがありません」のような別文言にする。`ResumePickerDialog.test.tsx` に検索 0 件のテストを足す
- **Status in this round**: new

### H-003 — Constitution・roadmap・tasks は改定手順 2 (人間のレビュー) を「別の PR」で受けると書くが、実際は本 PR が Constitution の差分と名前の表の両方を持つ [origin: architecture H-001]
- **Where**: .specify/memory/constitution.md:15-16, :1107; docs/roadmap.md:388; specs/025-ui-live-session-fixes/tasks.md:126, :154
- **Issue**: accepted の AD-065 Decision 4 は「O-13 の PR の中で人間のレビュー」と定める。Constitution / roadmap / tasks の記述はそれとも実態とも食い違う (正しく書けているのは quickstart-results.md:26 だけ)
- **Why high**: 夜間の規則 (pr-gate Critical 0 でマージ可) のままでは、改定手順 2 を満たさないまま v1.5.0 が main に入りうる。しかも記録からは未レビューだと読み取れない
- **Suggested fix**: 3 か所の記述を AD-065 Decision 4 に合わせて「本 PR の中で人間のレビューを受ける・マージは承認の後」に直す。PR 本文 (または quickstart-results) にマージ条件として「利用者が Constitution の差分を承認したこと」を書く
- **Status in this round**: new

## Medium (Round 1) — 直さない (棚卸しで扱う)

- M-001 [ux M-001] 最初の応答の前、権限モードとモデルの両方が同じ理由の行を composer 内に 2 本出す — LiveSettingsControls.tsx:192-196, :282-286
- M-002 [ux M-002] 一覧の取得失敗から回復する手段 (フォーカスで再取得) が画面から見えない — LivePane.tsx (LiveComposerSettings の onFocus)
- M-003 [ux M-003 | po M-001 | a11y H 観点] H-001 / H-002 を検出するテストが無い (SC-004 は variant だけを見る) — composer-escape.test.tsx:102-106, ResumePickerDialog.test.tsx
- M-004 [a11y M-001] 権限モードの英語名に `lang="en"` が無い (WCAG 3.1.2) — features/chat/labels.ts:379-387 を描く各所
- M-005 [a11y M-002] 右のパネルを開き直すと、選択中のタブが tablist の見える範囲の外に残りうる — RightPanel.tsx:69-77
- M-006 [architecture M-001] AD-046 Decision 6 の語彙に無い「composer の周り」「右のパネル」を ui-coverage と charter が使う — docs/ui-coverage.md:220 ほか, docs/domains/ui/charter.md:276
- M-007 [po M-002] SC-002 の実機確認と RK-03 が未実施 (V-1〜V-9 未実施。夜間の規則には沿う) — quickstart-results.md:28-30

## Low (Round 1) — 直さない

- L-001 [ux L-001] 省略された select の値に title が無い — LiveSettingsControls.tsx:164, :173
- L-002 [ux L-002 | a11y L-001] 読み込み中・判定待ちの状態が見た目にも支援技術にも出ない — ResumePickerDialog.tsx:113-149, LiveSettingsControls.tsx:140-147
- L-003 [ux L-003] 起動ダイアログから権限モードの説明が消え `Don't Ask` の意味が分からない (scope: out-of-scope、U-4 / AD-065 の決定)
- L-004 [ux L-004] モデル一覧の取得失敗に観測点が無い
- L-005 [platform-boundary L-001] expected.mjs の mitigatedBy が `QueryLiveReadMethod` は項目 16 の対象外と書いていない — tests/rule-fixtures/expected.mjs:950 (code-gate L-001 の持ち越し)
- L-006 [ui-coverage L-001] F 節 Empty state の使い道に ResumePickerDialog が無い — docs/ui-coverage.md:305
- L-007 [ui-coverage L-002] E 節の割当の書式と経路の列が実態と合わない — docs/ui-coverage.md:220, 221, 228
- L-008 [ui-coverage L-003] F 節 Model selector (Tier A) の `未使用` の理由が参照だけ — docs/ui-coverage.md:339
- L-009 [security L-001] `list-models` デコーダのコメントが実装より弱い検査を書いている — src/agents/session-core.ts:497
- L-010 [a11y L-002] キーボードで開いてマウスで選ぶと確定が遅れる — LiveSettingsControls.tsx:74-126
- L-011 [architecture L-001] glossary の `total_terms` が実数と合わない — docs/glossary.md:5
- L-012 [po L-001] `RESUME_PICKER_LABELS.close` が未使用 — features/session/labels.ts:488
- L-013 [po L-002] SC-005 の E2E がパネル幅 320px を assert していない — e2e/right-panel.spec.ts:583-653
- L-014 [po L-003] `/resume` の一覧に今のセッション自身が出る (RK-09) が spec の Edge Cases に無い — spec.md:168-177

## Track raw outputs

- [security-reviewer.pr-gate.md](./security-reviewer.pr-gate.md) — Critical 0 / High 0 / Medium 0 / Low 1
- [architecture-reviewer.pr-gate.md](./architecture-reviewer.pr-gate.md) — Critical 0 / High 1 / Medium 1 / Low 1
- [po-reviewer.pr-gate.md](./po-reviewer.pr-gate.md) — Critical 0 / High 1 / Medium 2 / Low 3
- [ux-reviewer.pr-gate.md](./ux-reviewer.pr-gate.md) — Critical 0 / High 2 / Medium 3 / Low 4
- [a11y-reviewer.pr-gate.md](./a11y-reviewer.pr-gate.md) — Critical 0 / High 1 / Medium 2 / Low 2
- [platform-boundary-reviewer.pr-gate.md](./platform-boundary-reviewer.pr-gate.md) — Critical 0 / High 0 / Medium 0 / Low 1
- [ui-coverage-reviewer.pr-gate.md](./ui-coverage-reviewer.pr-gate.md) — Critical 0 / High 0 / Medium 0 / Low 3

viewpoint_coverage_check: 7 track とも A-H 欠落なし。cascade_enforce: 降格 0 件 (Critical 0 のため)。
