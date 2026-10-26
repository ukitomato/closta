# Quickstart: 知らせの類・Checkpoints・中身のブロックの表示 (O-12)

**Spec**: [spec.md](./spec.md) | **Data model**: [data-model.md](./data-model.md)

実機の確認 (SC-009) と、境界が広がらないことの確認 (SC-007) の手順。結果は `quickstart-results.md` に V-n ごとに「確認済み / 届かない / 残らない / 未実施」と日付で書く。行えなかったときは「未実施」と書いてマージし、roadmap の O-12 の行に未確認の項目として残す (spec「合否の扱い」)。実機で「届かない」「残らない」と記録した行は、経路を直さずそのまま書く (data-model §4.4)。

コマンドは `docs/discovery.md` の "Build / Test / Lint" 表の agent 用の列 (`node` の直接形) を使う。

## V-0 前提

- verify が緑 (SC-008)。`node scripts/constitution/check.mjs` の項目 21 が ok で、出力の B 節が照合済み (33 行) になり、割当先が O-12 の行が 0 (SC-006)
- `node_modules/@anthropic-ai/sdk/package.json` の版が対応表の冒頭の `SDK: \`@anthropic-ai/sdk\`` の行と同じ
- 開発ビルドで Closta を起動し、WSL か Win32 のランタイムで新しいセッションを始められる

## V-1 知らせの類が実行中に届くか (US-1)

1. セッションで slash command (例: `/cost` や `/context` など出力を返すもの) を実行する → 「コマンドの出力」の行が出るか。出たら本文が 1 行で切り詰めの印つきか
2. 通知が出る操作 (長い処理の完了・承認待ちの通知など) を行う → 「通知」の行が出るか。同じ種類の通知が続いたとき 1 行にまとまるか。`high` / `immediate` なら注意の見た目で、スクリーンリーダー (ナレーター) が読み上げるか
3. CLAUDE.md などのメモリがある作業フォルダで始める → 「メモリを読み込みました」の行が出るか。件数・scope の数・ファイル名の末尾だけで、本文と絶対パス (ユーザー名を含む部分) が DOM に無いか (開発者ツールの要素の検索で確かめる)
4. tool を続けて使わせる → 「tool の要約」の行が出るか
5. 目標の設定と解除ができる操作があれば行う → 「目標」と「目標を解除しました」の行が出るか。`active_goal` は `SDKMessage` の型の外で、`query()` の反復が返すかは未確認 (plan RK-11)。出なければ「届かない」と書き、対応表の A' `active_goal` の備考に書く
6. `mirror_error` は今の構成 (SessionStore を使わない) では届かない見込み。届かなければ「届かない」と書く

記録: 種類ごとに「届いた / 届かない」と、届いたものの見え方。届かない種類も割当は `実装済み` のまま (spec Assumptions)

## V-2 Checkpoints が届くか (US-2)

1. ファイルを書かせる操作 (Write / Edit) を行う → 「ファイルを保存しました」の行が出るか。保存の件数・失敗の件数・ファイル名が出て、巻き戻し・開く操作が無いか
2. 失敗が起きたら、失敗の理由が伏せ字つきの 1 行か

記録: `files_persisted` が届く条件 (届かなければ「届かない」)

## V-3 サーバー側の tool のブロックが届くか (US-3)

1. 検索をさせる (「最新の〜を調べて」など) → Claude Code の WebSearch (クライアントの tool。C 節) で出るか、`server_tool_use` (サーバー側の `web_search`) で出るかを見る
2. `server_tool_use` で出たら: 検索語の見出しと、結果のタイトルと host の一覧が 1 つの tool の表示に出るか。項目を押すと既定のブラウザで開くか (Closta の窓の中で開かないか)
3. 「表示に対応していないブロック」の行が出たら、種類の名前を記録する

記録: `server_tool_use` が主ループに現れるか (spec Assumptions)。subagent の中に現れたら、結果が子の中の孤児として出たか (data-model §2.3)

## V-4 過去ログに行が残るか (US-4。O-6 / O-10 の V-3 を兼ねる)

1. V-1〜V-3 のセッションと、拒否・会話の作り直し (`/clear`)・`informational` (UserPromptSubmit の Hook で止めるなど)・MCP の URL の手続きの完了 (`elicitation_complete`) を起こしたセッションを終わらせる
2. サイドバーの過去のセッションから開く → 実行中と同じ category と見出しの行が出るか、伏せ字つきの本文 (今の形) が出るか
3. 開発者ツールで、過去ログの system の記録の形 (`message.type` / `message.subtype` があるか) を確かめられるなら記録する

記録: 種類ごとに「行で残る / 本文で残る / 残らない」。「行で残る」の種類だけ対応表の経路を「両方」にする (data-model §4.4)

## V-5 文書 (US-2 AC3)

1. Claude Code の CLI で PDF か text の文書を添付した会話を作り、Closta の過去のセッションから開く (Closta の composer は添付を受け付けない)
2. File element に名前と種類 (PDF / テキスト) が出て、中身・ダウンロードのリンクが出ないか。英語の文言 ("Unnamed file" / "Download") が出ないか

記録: 文書が過去ログに `document` のブロックで残るか

## V-6 境界 (SC-007)

`git diff <base>...HEAD --stat` で次が 0 行であることを確かめる (`<base>` は main):

- `src/main/`・`src/preload/`
- `src/agents/session-core.ts` の `QUERY_OPTION_KEYS` (pin テスト `session-core.test.ts` が変わらない)
- `scripts/constitution/allowlists.mjs` の `AGENT_SDK_ALLOWED_CALLS`
- `src/domain/session/meter.ts` の `METER_UPDATE_TYPES`、`SESSION_EVENT_KINDS` の定義
