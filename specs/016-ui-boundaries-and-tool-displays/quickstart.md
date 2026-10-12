# Quickstart: 会話の境界と tool の専用表示の第 2 弾 (O-6)

自動の検証は `docs/discovery.md` の "Build / Test / Lint" 表の agent 用の列で流す。以下は自動で見ない確認。

## V-1 境界の差分 (SC-005)

- `SESSION_EVENT_KINDS`・`TRANSCRIPT_PART_FIELDS`・`PermissionRequest` のフィールド・`toPermissionResult` の出力の差分が 0 (O-5 の後の値から増えない)
- `MeterUpdate` の種類は O-5 の後の値から `retraction` の 1 つだけ増えている
- `AGENT_SDK_ALLOWED_CALLS` と `QUERY_OPTION_KEYS` の差分が 0。IPC・preload・main の差分が 0
- `sdk-agent-session.ts` の `Query` のメソッドの呼び出しが `interrupt` だけで、`queryHandle` の型が `interrupt` と非同期の反復だけに絞られている。`QUERY_MUTATION_METHODS` が `readFile` の 1 つだけ増え (21 → 22。`backgroundTasks` / `reloadOutputStyles` は O-5 で入っている)、集合の固定テスト (`tests/docs/query-mutation-methods.test.ts`) が通り、3 つのメソッドごとの違反の fixture で項目 16 が発火する

## V-2 対応表 (SC-004)

`node scripts/constitution/check.mjs` の項目 21 が ok で、出力の後続の件数に O-6 が無く、M3 の完了の条件の残りから O-6 の 14 行が消え、D 節の O-11 の 3 行が数えられている。

## V-3 実機の目視 (利用者。自動の合否に含めない。本番ビルドで)

- `/compact` を実行し、圧縮の行 (O-4) の後に圧縮の境界が出ること (`.needs-input.md` Q1 の回答に従う)。**`compact_result` と `compact_boundary` の届く順を記録する** (014 quickstart-results の V-4 の 7 も同じ操作で確かめられる)。過去ログで同じセッションを開き、数を省いた境界が出ること
- `/clear` で会話の作り直しの境界が出ること。**/clear の後に過去ログの一覧で会話が分かれるか (別のセッションとして出るか) を記録する** (X-6 への申し送り)。**plan モードを抜けたときにも境界が出るかを記録する**
- コードを読ませる依頼で `Read` / `Glob` / `Grep` が専用の表示で出て、WSL のパスがそのまま読めること。**`Glob` / `Grep` (`files_with_matches`) の結果の text をそのまま記録する** (絶対か相対か、見出しや打ち切りの行。FE-020 の fixture の元)
- `WebFetch` / `WebSearch` が出ること (見出しが host だけで、クエリ付きの URL でパスとクエリが出ないこと)
- `TaskCreate` などが TodoList の形で出て、`TaskCreate` の結果にタスクの id が見えること
- 長い Bash の間に動く「結果待ち」、中断の後と強制終了の後に「結果不明」が出ること
- スクリーンリーダー (ナレーター) で、tool のエラーと圧縮と Background task の終わりが読み上げられること。並列の 10 件の tool のエラーで、読み上げが 1 秒に 1 文以下であること。セッションを切り替えたときに過去の出来事を読まないこと。**承認カードで拒否した後・中断した後に tool の結果がエラー (`is_error`) で届くかを記録する**
- UserPromptSubmit の Hook で prompt を止める設定を作り、「知らせ」の行に理由が出ること。**`level` が `info` の知らせと、`tool_use_id` 付きの知らせがどれくらいの頻度で出るかを記録する**
- **モデルの拒否が起きたら**、置き換えられた応答が消えてから拒否の行が出るまでの間と、承認待ちのカードが残るかを記録する (起こせなければ「未確認」と書く)
- **過去ログに `informational`・拒否・会話の作り直しが残るか、取り消された応答が残るか、残った本文に伏せ字が当たっているかを記録する** (O-11 の過去ログの変換の材料)
- **O-2 の V-4 の未記録の 2 項目 (並列の tool の結果が 1 つずつ来るか・subagent の tool 名) を記録する** (O-11 の判断の材料)
