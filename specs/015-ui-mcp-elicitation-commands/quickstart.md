# Quickstart: MCP・プラグイン・コマンドの表示 (O-5)

自動の検証は `docs/discovery.md` の "Build / Test / Lint" 表の agent 用の列で流す。以下は自動で見ない確認。

## V-1 境界の差分 (SC-005)

- `AGENT_SDK_ALLOWED_CALLS` (`scripts/constitution/allowlists.mjs`) と `QUERY_OPTION_KEYS` (`src/agents/session-core.ts`) の差分が 0
- `toPermissionResult` (`src/domain/session/agent-session.ts`) の差分が 0
- `SESSION_EVENT_KINDS` の差分が 0 (O-4 の後の値から増えない)。IPC・preload・main の差分が 0

## V-2 対応表 (SC-004)

`node scripts/constitution/check.mjs` の項目 21 が ok で、出力の後続の件数に O-5 が無く、O-10 が 4 件。

## V-3 実機の目視 (利用者。自動の合否に含めない。本番ビルドで)

- MCP サーバー (例: GitHub・filesystem) を設定した WSL の claude でセッションを起動し、構成のタブにサーバーと状態が出ること。わざと失敗するサーバー (存在しないコマンド) で `failed` の注意と帯の印が出ること
- MCP の tool を呼ばせ、transcript にサーバー名と tool 名が分かれて出て、結果が読めること。過去ログで同じセッションを開いて同じに出ること
- スキルやコマンドを足したフォルダで、スラッシュコマンドの一覧が変わること (`commands_changed`)
- `AskUserQuestion` を出させ、今は承認カードで許可 / 拒否だけであることを確かめる (回答は O-10)
