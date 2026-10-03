# Quickstart: ui-coverage 対応表の確立 (O-2)

合否の定義は spec の SC が正本。コマンドは [docs/discovery.md](../../docs/discovery.md) の "Build / Test / Lint" 表の agent 用の列。

## V-1 対応表の検査 (SC-001 / SC-002)

1. `node scripts/constitution/check.mjs` — 項目 21 が ok。対応表の SDK の版が入っている SDK と同じ
2. `node node_modules/vitest/vitest.mjs run tests/ui-coverage` — 失敗の条件 5 つと、ToolFallback だけの Tier A の行が、それぞれ該当する行を示して落ちる
3. 対応表の A・C・E 節の行の数が、SDK の型定義の数 (メッセージ型 39 / tool の入力型 45 / control_request の subtype) と一致する (項目 21 の出力に数を出す)

## V-2 単体と component (SC-003 / SC-005 / SC-006)

- 全件 `node node_modules/vitest/vitest.mjs run`
- 見るもの: domain の `system-event` / `tool-result` / `transcript` / `live-message` の単体、agents の分岐の単体、decoder の単体 (`event` の part)、transcript の component (tool の結果・システムイベントの行・密度)、`session-view` の要点の単体

## V-3 境界 (SC-004)

- `git diff --name-only main...HEAD -- src/preload src/main` が 0 件 (IPC のチャネル・preload・main を変えない)
- X-5 の状態通知の全フィールド走査のテストが緑
- X-5 の負荷 E2E: `node node_modules/@playwright/test/cli.js test -c playwright.config.ts e2e/multi-session.spec.ts` が閾値を満たす (要ビルド。RK-02)

## V-4 実機の目視 (利用者が行う。夜間の自走では行わない)

1. 実 `claude` で `Bash` を使わせる → 実行中の transcript で Terminal block に出力が出る。エラーになるコマンドではエラーが出る
2. Hook を設定した作業フォルダで起動する → Hook の名前と結果が 1 行で出る。出力本文は出ない
3. subagent を使わせる → Subagent の専用表示になる (tool 名が `Agent` / `Task` のどちらか記録する。RK-04)
4. Background task を使わせる → task の説明と状態が 1 行で、状態が変わると同じ行が書き換わる
5. 同じセッションを過去ログで開く → Hook / task の行が出るか記録する (RK-01)
6. transcript の密度を切り替える → comfortable で Tool group が開き、compact で閉じる。ストリーミング中に切り替えてもスクロール位置が奪われない

## V-5 reviewer の組み込み (SC-007)

- `bash -c 'source .specify/scripts/gate-common.sh; printf "docs/ui-coverage.md\n" > /tmp/s.txt; gate_common::reviewers_filter pr-gate /tmp/s.txt ui-coverage-reviewer'` が `ui-coverage-reviewer` を返す
- cl-pr-gate / cl-code-gate の候補の一覧に名前がある
