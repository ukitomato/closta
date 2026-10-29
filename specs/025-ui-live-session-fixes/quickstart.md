# Quickstart: 起動中のセッションの UI の手直し (O-13)

**Spec**: [spec.md](spec.md) / **Plan**: [plan.md](plan.md)

## 0. 自動の検証 (agent も人も同じ)

コマンドは [`docs/discovery.md`](../../docs/discovery.md) の "Build / Test / Lint" 表の「agent 用」列が正本である (`node` で直接呼ぶ)。

| 検証 | 見るもの |
|---|---|
| 型検査 (node / web の 2 本) | `ComposerExtensions.settings`・`LiveModelsResult`・`SessionControl` の 9 種類・`Query` の分類の網羅 (`queryMethodsAreClassified`) |
| ユニットテスト | contracts の「テストの観点」と plan の「実装の順」の各段の単体 |
| lint / 依存グラフ | `features/chat/app-commands.ts` と `features/session/past-resume.ts` が許可された層だけを読む |
| Constitution 検証 | 項目 16 (`QUERY_MUTATION_METHODS` は 20 のまま)・項目 21 (`docs/ui-coverage.md` の E 節 `list_models` と F 節の 3 行) |
| ルール検証 | `tests/rule-fixtures/expected.mjs` の `sdk-query-method-indirect` の記述を直した後も全件が通る |
| E2E | `e2e/live-session-settings.spec.ts` (composer の周りの選択)・`e2e/ime.spec.ts` (変換中の Esc)・`e2e/composer-screenshot.spec.ts`・新しい `/resume` と右のパネルの spec |

## 1. 実機の確認 (利用者の作業。夜間の規則では「未実施」と書いてマージしてよい)

前提: Windows の作業フォルダか WSL のフォルダを 1 つ登録してある。Provider を 1 つ (モデルのカタログあり) 登録してある。同じフォルダに過去のセッションが 1 つ以上ある。

| # | 手順 | 期待 | 対応 |
|---|---|---|---|
| V-1 | Provider を選ばずにセッションを起動し、最初の応答の後に composer の下のモデルの選択を開く | Claude Code が答えたモデルが並ぶ (起動の effort を選んだなら、それが効くものだけ) | US-2 AC1 / SC-002 |
| V-2 | V-1 の一覧から今と別のモデルを選び、「今のモデルを答えて」と送る | 次の応答がそのモデルで返る (応答の `model` か「使用量」のタブのモデル別の内訳で確かめる) | US-2 AC2 / SC-002 |
| V-3 | Provider のあるセッションで、composer の下の権限モードを `Plan` に変え、ファイルを書く依頼を送る | 書き込みの tool が実行されない。選択と「概要」のタブの名前が `Plan` | US-1 AC2 / SC-003 |
| V-4 | 長い応答を生成させ、composer に日本語を入力して変換中に Esc を押す。次に変換を確定させてから Esc を押す | 1 回目は変換だけが取り消される。2 回目で生成が止まる | US-3 AC2〜AC3 / SC-004 |
| V-5 | 生成中の composer を見る | 停止ボタンが枠だけの見た目で、送信ボタン (待機中) より目立たない | US-3 AC1 |
| V-6 | 右のパネルを開き、タブを ←/→ で端から端まで移る。「使用量」のタブを開く | タブの名前は 1 行で、隠れたタブも選ぶと見える。トークンの値は折り返さない | US-4 / SC-005 |
| V-7 | composer で `/` を打ち、`/resume` を選んで Enter | 選ぶ画面が開き、同じフォルダの過去のセッションが新しい順に並ぶ。Claude Code にプロンプトとして送られていない (transcript に行が増えない) | US-5 AC1〜AC2 / SC-006 |
| V-8 | V-7 の画面で 1 つを選ぶ | 再開の形の起動ダイアログが開く (サイドバーの過去の行の「再開」と同じ) | US-5 AC3 |
| V-9 | V-7 の画面を Esc で閉じる | composer にフォーカスが戻り、入力は空 | US-5 AC5 |

## 2. 記録

結果は `quickstart-results.md` に書く (021 / 022 と同じ形)。次の場合は利用者に返す。
- V-1 で一覧が空か失敗する: Claude Code の版と、ログの `[session] live-models count=… dropped=…` を添える
- V-2 でモデルが変わらない
- V-4 で変換中に生成が止まる
