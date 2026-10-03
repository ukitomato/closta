# Quickstart results: ui-coverage 対応表の確立 (O-2)

実施日: 2026-10-03 (agent。Windows 11 / node 直接。コマンドは docs/discovery.md の agent 用の列)

## V-1 対応表の検査 (SC-001 / SC-002) — ok

- `node scripts/constitution/check.mjs`: 項目 21 が ok (ok 20 / 違反 0 / 検査対象なし 1 = 項目 5、既存)
  - 行: A 39 / A' 4 / B 10 / C 45 / D 8 / E 38 / F 127
  - 割当 × Tier: 実装済み A27 B26 C0 / 後続 A25 B42 C0 / 表示不要 A0 B24 C0
  - 後続: I-3 (M4) 2 [Tier A 1] / O-4 (M3) 10 [Tier A 5] / O-5 (M3) 21 [Tier A 5] / O-6 (M3) 30 [Tier A 14] / X-6 (M2) 4
  - M3 の完了の条件の残り (Tier A の後続で割当先が M3): 24 (pr-gate R1 の ui-coverage-reviewer の指摘で 7 行の Tier を A に直した後。直す前は 17)
- `tests/ui-coverage` (coverage 48 件 / item21 2 件): 全件緑 (下の全件の単体に含む)。崩した対応表で `[VIOLATE] #21` と非 0 の終了コード
- A・C・E 節の行の数は SDK 0.3.270 の型定義 (39 / 45 / 38) と一致。正解は TypeScript のコンパイラ API での列挙 (coverage.test.ts)

## V-2 単体と component (SC-003 / SC-005 / SC-006) — ok

- 全件 `node node_modules/vitest/vitest.mjs run`: 113 files / **1878 passed**
- lint (`eslint --cache .`) 0 / 型検査 node・web・e2e・perf の 4 本 0 / depcruise 違反 0 (331 modules / 1529 dependencies)

## V-3 境界 (SC-004) — ok

- `git diff --name-only main...HEAD -- src/preload src/main src/agents/supervisor.ts src/agents/supervisor-core.ts src/agents/supervisor-protocol.ts src/agents/transport.ts` が 0 件 (未コミットの差分も 0 件)
- `session-core.test.ts` の query の options のキーの pin は変更なし。X-5 の状態通知の全フィールド走査のテストは緑
- ビルド (`electron-vite build`) の後、X-5 の負荷 E2E `e2e/multi-session.spec.ts` が **4 passed (1.4m)**。既存の経路の回帰の確認であり、偽 supervisor は text だけなので tool の結果の送り直しは通らない (RK-02)

## V-4 実機の目視 — 利用者が実施 (2026-10-03、O-2 のマージ後に main の dev ビルドで)

- **結果**: 利用者の判定は「いい感じ」(表示の崩れ・誤りの報告なし)
- **見つかった不具合**: transcript が最下部に追従しない。原因は O-2 ではなく R-3 からのもの — 40 件以下の非仮想パスの `ThreadPrimitive.Viewport` に registry のテンプレートの `turnAnchor="top"` が残っており、`autoScroll` の既定が false になっていた (41 件以上の仮想パスは追従する)。`turnAnchor` を既定 ("bottom") に戻して直した (PR「fix(ui): follow transcript bottom with default turn anchor」)
- **未記録**: 下の 📝 の観測値 (並列の結果の届き方・`hook_name` の実際の値・`Agent` / `Task`・過去ログの Hook / task の行) は記録していない。O-6 はこれらを未確認として扱う (roadmap の O-6 の行)

agent は実 `claude` を起動しない。quickstart V-4 の 1〜6 を利用者が行い、次を記録する:

1. Bash の結果が実行中の Terminal block に出るか / エラー / もたつき。**並列の tool の結果が user メッセージ 1 つで来るか、1 つずつか** (research R-03)
2. SessionStart の Hook の行。**`hook_name` の実際の値とコマンドの文字列を含まないこと**
3. subagent の tool 名が `Agent` / `Task` のどちらか (RK-04)
4. Background task の行の書き換えと、強制終了後の「結果不明」
5. 過去ログに Hook / task の行が出るか (RK-01。出れば対応表の経路を「両方」に直す)
6. 密度の切り替え (Tool group の開閉・スクロール位置・監視ビューの密度との区別)

## V-5 reviewer の組み込み (SC-007) — 設定で確認

- reviewers.yml の `ui-coverage-reviewer` (gates: pr-gate、auto_invoke_patterns に `docs/ui-coverage.md` / `package.json` / `src/renderer/src/components/assistant-ui/elements/**` を含む)、registry の `invoked_by: [pr-gate]`、cl-pr-gate の候補の一覧に名前がある
- `gate_common::reviewers_filter` の実行での確認は pr-gate の Phase 3 で行う (本 PR の diff は 3 つのパターンのすべてに当たる)
