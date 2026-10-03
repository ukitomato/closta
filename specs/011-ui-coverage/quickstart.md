# Quickstart: ui-coverage 対応表の確立 (O-2)

合否の定義は spec の SC が正本。コマンドは [docs/discovery.md](../../docs/discovery.md) の "Build / Test / Lint" 表の agent 用の列。

## V-1 対応表の検査 (SC-001 / SC-002)

1. `node scripts/constitution/check.mjs` — 項目 21 が ok。出力に節ごとの行の数、割当の種類 × Tier、後続 feature の ID ごとの件数が出る。対応表の SDK の版が入っている SDK と同じ
2. `node node_modules/vitest/vitest.mjs run tests/ui-coverage` — 失敗の条件のそれぞれが該当する行を示して落ち、崩した対応表で項目 21 が `[VIOLATE] #21` と非 0 の終了コードになる
3. 対応表の A・C・E 節の行の数が、SDK の型定義の数 (メッセージ型 39 / tool の入力型 45 / control_request の subtype) と一致する

### SDK を上げたとき (開発者の手順)

1. `node scripts/constitution/check.mjs` の項目 21 の失敗の出力を読む (足りない行・消えた行・版の違い)
2. 足りない行を足して割当を書き、消えた行を消し、対応表の冒頭の版を書き換える
3. 項目 21 が ok になることを確かめる

## V-2 単体と component (SC-003 / SC-005 / SC-006)

- 全件 `node node_modules/vitest/vitest.mjs run`
- 見るもの: domain の `system-event` / `tool-result` / `transcript` / `live-message` の単体、agents の分岐の単体、decoder と過去ログの受け口の単体 (`event` の part)、transcript の component (tool の結果・システムイベントの行・密度)、`session-view` の要点と読み飛ばしの単体

## V-3 境界 (SC-004)

- `git diff --name-only main...HEAD -- src/preload src/main src/agents/supervisor.ts src/agents/supervisor-core.ts src/agents/supervisor-protocol.ts src/agents/transport.ts` が 0 件
- `session-core.test.ts` の query の options のキーの pin が変わっていない
- X-5 の状態通知の全フィールド走査のテストが緑
- X-5 の負荷 E2E: `node node_modules/@playwright/test/cli.js test -c playwright.config.ts e2e/multi-session.spec.ts` (要ビルド)。**既存の経路の回帰の確認であり、tool の結果の送り直しは通らない** (偽 supervisor は text だけ。RK-02)

## V-4 実機の目視 (利用者が行う)

1. 実 `claude` で `Bash` を使わせる → 実行中の transcript で Terminal block に出力が出る。エラーになるコマンドではエラーが出る。tool を多く呼ばせても transcript がもたつかない (RK-02)。**並列の tool の結果が user メッセージ 1 つで来るか、1 つずつ来るかを記録する** (research R-03 の前提)
2. SessionStart の Hook を設定した作業フォルダで起動する → Hook の名前と結果が 1 行で出る。出力本文は出ない。**`hook_name` の実際の値を記録し、コマンドの文字列を含まないことを確かめる** (含むなら `hook_event` だけを出すよう直す)
3. subagent を使わせる → Subagent の専用表示になる (tool 名が `Agent` / `Task` のどちらかを記録する。RK-04)
4. Background task を使わせる → task の説明と状態が 1 行で、状態が変わると同じ行が書き換わる。セッションを強制終了すると、終わっていない行は「結果不明」になる
5. 同じセッションを過去ログで開く → Hook / task の行が出るか記録する (RK-01)。出れば対応表の経路を「両方」に直す
6. transcript の密度を切り替える → comfortable で Tool group が開き、compact で閉じる。ストリーミング中に切り替えてもスクロール位置が奪われない。監視ビューの密度の切り替えと区別できる

## V-5 reviewer の組み込み (SC-007)

- `bash -c 'source .specify/scripts/gate-common.sh; for p in docs/ui-coverage.md src/renderer/src/components/assistant-ui/elements/thread.aui.tsx package.json; do printf "%s\n" "$p" > /tmp/s.txt; gate_common::reviewers_filter pr-gate /tmp/s.txt ui-coverage-reviewer; done'` が 3 回とも `ui-coverage-reviewer` を返す
- cl-pr-gate の候補の一覧に名前がある。registry の `invoked_by` が `pr-gate`
