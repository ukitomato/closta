# Quickstart: MCP・プラグイン・コマンドの表示 (O-5)

自動の検証は `docs/discovery.md` の "Build / Test / Lint" 表の agent 用の列で流す。以下は自動で見ない確認。

## V-1 境界の差分 (SC-005)

- `AGENT_SDK_ALLOWED_CALLS` (`scripts/constitution/allowlists.mjs`) と `QUERY_OPTION_KEYS` (`src/agents/session-core.ts`) の差分が 0。`QUERY_MUTATION_METHODS` は 13 増えて 19 (AD-048 Decision 2 の 11 と AD-036 §4 P3 の `reloadOutputStyles` / `backgroundTasks`) で、`tests/docs/` の pin テストが同じ集合を固定し、`sdk-agent-session.ts` の変更系の union (`QueryMutationMethod`) のリテラルとの集合一致も確かめている (片方にだけ足すと落ちる)。`sdk-agent-session.ts` の `keyof Query` の網羅 (`Equal<Exclude<…>, never>`) が型検査で通る (research R-06)
- `toPermissionResult` (`src/domain/session/agent-session.ts`) と `TRANSCRIPT_PART_FIELDS` の差分が 0
- `sdk-agent-session.ts` の `Query` のメソッドの呼び出しが `interrupt` だけ。項目 16 の違反の fixture 2 本 (ドット呼び出し・計算キー) が発火する。分割代入と `.call` / `.apply` は `UNDETECTED_NOTES` に記録されている。`Query` の自前のメソッドが `interrupt`・変更系 19・呼ばない読み取り 9 のどれかに分類されている (型の網羅)
- `SESSION_EVENT_KINDS` の差分が 0 (O-4 の後の値から増えない。増えるのは `METER_UPDATE_TYPES` の 2 つだけ)。IPC・preload・main の差分が 0

## V-2 対応表 (SC-004)

`node scripts/constitution/check.mjs` の項目 21 が ok で、出力の後続の件数に O-5 が無く、O-10 が 4 件。M3 の完了の条件の残りが O-5 の前より 2 減っている。

## V-3 実機の目視 (利用者。自動の合否に含めない。本番ビルドで)

- MCP サーバー (例: GitHub・filesystem) を設定した claude でセッションを起動し、構成のタブにサーバーと状態と「ターンの開始時点」が出ること。最初のターンで `pending` が出るか、次のターンで変わるかを記録する
- わざと失敗するサーバー (存在しないコマンド) で `failed` の注意・案内・帯の印が出ること
- `needs-auth` のサーバーで、案内どおりに認証して直るか (config-dir の Provider では `CLAUDE_CONFIG_DIR` を合わせる必要があるか) を記録する
- MCP の tool を呼ばせ、transcript にサーバー名と tool 名が分かれて出て、結果が読めること。承認カードに生の tool 名が全文で出ること。過去ログで同じセッションを開いて同じに出ること
- スキルやコマンドを足したフォルダで、スラッシュコマンドの一覧が変わること (`commands_changed`)。`init` の `slash_commands` が先頭の `/` を持つかを記録し、どちらの書式でも説明と引数の形が付くこと (data-model §2「スラッシュコマンドの名前の書式」)
- `AskUserQuestion` を出させ、問いと選択肢が読めて、承認カードに注記が出ること。許可したときに Claude が受け取る tool_result の中身を記録する (O-10 の材料)
- 2 つのセッションで構成が混ざらないこと
- `auth_status` / `plugin_install` は通常は届かない (`plugin_install` は `CLAUDE_CODE_SYNC_PLUGIN_INSTALL` が要る)。届いた場合だけ記録する
