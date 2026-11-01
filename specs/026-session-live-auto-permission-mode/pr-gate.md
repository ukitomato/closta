# PR Gate Round 1: 権限モードの Auto (起動と実行中)

**Run**: 2026-11-01
**Base**: main (merge-base 4f23de4; diff は merge-base から作業ツリーまで。実装は未コミットのため untracked の新規 5 ファイルを含む)
**Diff stat**: +4178 -337 over 87 tracked files + 5 untracked new files (scope 92 files)
**Reviewers**: security-reviewer, architecture-reviewer, po-reviewer, database-reviewer, ux-reviewer, a11y-reviewer, platform-boundary-reviewer, ui-coverage-reviewer (8 並列)
**Round inheritance**: Round 1 (引継ぎ無し)
**Rule verification**: `node scripts/rules/run.mjs` を単独で実行し、期待表と 80 件一致 (exit 0)。展開物の後始末も確認した

## Verdict

| Severity | This round | Resolved from N-1 | New in N | Net | Suppressed by code-gate |
|---|---|---|---|---|---|
| Critical | 0 | 0 | 0 | 0 | 0 |
| High     | 4 | 0 | 4 | 4 | 0 |
| Medium   | 10 | 0 | 10 | 10 | 0 |
| Low      | 18 | 0 | 18 | 18 | 0 |

(複数 reviewer の重複は 1 件に統合した後の件数。統合元は各 finding の origin に記載)

**Status**: PASS (Critical=0)
**Next**:
  PASS → High はこの round で直す (AD-050)。H-002 / H-004 はマージ前に人が判断・実行する事項。その後 /cl-done
  Medium / Low → 直さない。マイルストーンの棚卸しで扱う

## Critical (Round 1)

なし。

## High (Round 1)

### H-001 — AD-066 が proposed のまま、Constitution 改定のレビューが未了 (マージ前提条件) [origin: architecture]
- **Where**: docs/decisions/0066-auto-permission-mode-with-confirmation.md (frontmatter), .specify/memory/constitution.md:15, :1137
- **Issue**: accepted の AD-062 D1 / AD-041 (a) / AD-059 D1・D3 / AD-065 D3 / AD-047 D5 / AD-036 §5 を変える根拠が proposed の AD-066 だけ。マージ前提条件 (RK-01 / SH-012 / H-007) は文章だけで、機械的に止めるものが無い
- **Suggested fix**: マージ前に人が AD-066 を accepted にし、Sync Impact Report step 2 のレビュー日を埋める。コードでは直せない
- **Status in this round**: new

### H-002 — 項目 16 のリテラル検査がテンプレートリテラルの `auto` を見ず、`auto` の backstop に穴 [origin: platform-boundary]
- **Where**: scripts/constitution/check.mjs:919, tests/rule-fixtures/expected.mjs:938-942
- **Issue**: `assertSelectablePermissionMode` が `auto` を通すため、agents が `auto` を作らない担保は項目 16 だけ。`` `auto` `` (バッククォート) は包みの検査・リテラル検査・実行時 assert をすべて素通りする。`UNDETECTED_NOTES` の `mitigatedBy` も `auto` については事実と違う。現時点の実害は 0 件
- **Suggested fix**: check.mjs:919 にバッククォートの形を足し、b-equivalent に fixture を 1 本足して `#16` で登録。`mitigatedBy` を書き直し、データフローで `auto` を組む形を UNDETECTED_NOTES に `nextFeature: 'I-3'` で記録
- **Status in this round**: new

### H-003 — FR-012 / Edge Case 4・6 (プリセットの `auto`・判定中ランタイム) の renderer テストが無いのに FE-013 が [x] [origin: po (+ platform-boundary code-gate M-002 と同旨)]
- **Where**: src/renderer/src/features/session/LaunchDialog.test.tsx:2179-2319, LaunchDialog.resume.test.tsx:293-313, tasks.md:63-64
- **Issue**: プリセット適用 → 起動で確認が出る / 承諾後に default → auto プリセットで再確認 / default に戻すと ack false / Provider 確認と同時に描かれない / 判定中ランタイムで確認が出る / 再開の取り消しで resumeSession 0 回 / 安全 3 値の再開で印 false、のテストが無い。renderer が印を「要るか」から作る (下の M-001) ので、確認の回帰を捕まえるのはこのテストだけ
- **Suggested fix**: 上記ケースを LaunchDialog.test.tsx / LaunchDialog.resume.test.tsx に足す
- **Status in this round**: new

### H-004 — SC-001 / SC-004 の計測経路の E2E が未実行なのに SH-012 が [x] [origin: po H-002 + architecture M-004]
- **Where**: tasks.md:80, quickstart-results.md:18-19, e2e/launch-dialog.spec.ts:540-577, e2e/live-session-settings.spec.ts:591-634, src/main/app/e2e-capability.ts
- **Issue**: 新設の E2E 2 本は実行記録が無い。e2e-capability の meter 追加が既存 E2E の期待を壊さないかも未確認。**rule fixture の照合 (SC-002 の経路) は本 gate の Phase 0 で実行し 80 件一致を確認した**ので、残るのは E2E
- **Suggested fix**: ビルド後に E2E 2 spec を実行して quickstart-results.md に記録する。できないなら SH-012 に未実行と明記し、PR 本文で SC-001 / SC-004 の E2E 側を「未計測」と書く
- **Status in this round**: new

## Medium (Round 1) — 直さない (棚卸し)

- M-001 renderer の確認の印が「承諾した事実」ではなく「確認が要るか」から作られる (LaunchDialog.tsx:590) [security]
- M-002 起動ダイアログで Auto の確認を閉じた後の焦点が戻らない (LaunchDialog.tsx:1184-1190) [a11y M-001 + ux M-003]
- M-003 確認の Escape が window capture で非モーダルの LivePane では他の Escape を奪う (AutoModeConfirmation.tsx:38-48) [po M-001 + ux L-004 + a11y L-002]
- M-004 起動時の承諾ボタンが「Auto にする」で実際の動作 (起動) と食い違う (AutoModeConfirmation.tsx:63-65) [ux]
- M-005 実行中の Auto 失敗時に理由が出ず、`auto-mode-unconfirmed` の文言が未使用 (labels.ts:465, :507) [ux]
- M-006 確認の UX / a11y 分岐 (焦点・文言・Escape) のテストの欠け [a11y H-001 + ux H-M01]
- M-007 main の印の検査が単体テストだけで守られ、UNDETECTED_NOTES に記録が無い [platform-boundary]
- M-008 session charter :191 が判定の置き場所について自己矛盾 [architecture]
- M-009 store の launch / resume の印が optional で data-model §6.4 と乖離 (running-session-store.ts) [architecture]
- M-010 renderer が `'auto'` リテラルを直書き (LaunchDialog.tsx:621) [architecture]

## Low (Round 1) — 直さない (棚卸し)

- setPermissionMode の印の検査が runtimeId undefined で fail-open (session-launch-service.ts:654-657) [security L-001 + architecture L-001。code-gate platform-boundary L-001 と同所 — suppressed 扱いではなく別 origin のため記録のみ]
- security L-002 (AD-066 Alternatives の言い過ぎ)、L-003 (fail-open 分岐のテスト無し)
- a11y L-001 (帯の文字色 amber-700)
- ux L-001 (composer)、L-002 (分類器)、L-003 (取り消し語)、L-005 (Auto の手がかり)、H-L01 (観測点)
- po L-001 (外部変更の帯の文言)、L-002 (テスト名)、L-003 (拒否文の回復手順)
- architecture L-002 (isolation charter の文)、L-003 (glossary)
- database L-101 (ダウングレードの扱い)
- ui-coverage L-001、L-002、L-003

## Skipped reviewers

なし (reviewers_filter が候補 8 件すべてを返した)

## Track raw outputs

- [security-reviewer.pr-gate.md](./security-reviewer.pr-gate.md)
- [architecture-reviewer.pr-gate.md](./architecture-reviewer.pr-gate.md)
- [po-reviewer.pr-gate.md](./po-reviewer.pr-gate.md)
- [database-reviewer.pr-gate.md](./database-reviewer.pr-gate.md)
- [ux-reviewer.pr-gate.md](./ux-reviewer.pr-gate.md)
- [a11y-reviewer.pr-gate.md](./a11y-reviewer.pr-gate.md)
- [platform-boundary-reviewer.pr-gate.md](./platform-boundary-reviewer.pr-gate.md)
- [ui-coverage-reviewer.pr-gate.md](./ui-coverage-reviewer.pr-gate.md)
