# Research: MCP・プラグイン・コマンドの表示 (O-5)

調べた日: 2026-10-04 (夜間の自走)

## R-01 応答の仕組み (SDK 0.3.270) と範囲の分割 (U-1)

- `AskUserQuestion`: 入力型 `AskUserQuestionInput` の `answers` は「User answers collected by the permission component」(`sdk-tools.d.ts:2605-2609`)。ホストは `canUseTool` で `{ behavior: 'allow', updatedInput: { ...input, answers } }` を返して回答する。今のアプリの `toPermissionResult` は `{behavior}` / `{behavior, message}` だけを返し、`updatedInput` を型として持たない (`agent-session.ts:231`、AD-036 Decision 4)。許可しても回答は届かない
- Elicitation: `Options.onElicitation` (`sdk.d.ts:1606-1626`)。無ければ自動で断られる。form (JSON Schema) と URL (ブラウザで認証) の 2 つの形。`elicitation_complete` は URL の形の完了の通知
- `request_user_dialog`: `Options.onUserDialog` と `supportedDialogKinds` (:1628-1655)。宣言しない種類は既定の振る舞いに倒れる (fail closed)
- **Decision**: O-10 に分ける (spec U-1 / AD-048 Decision 1)
- **Rationale**: 3 つとも承認済みの ADR の境界 (承認の応答の形・options のキーの集合) の読み替えが要り、入力の検証と秘密の入力 (Elicitation の form) の設計が要る。表示の feature と分けると、それぞれの gate のレビューの範囲が絞れる

## R-02 構成の出所

- `init` は「Session metadata the CLI emits at the start of each turn」(`sdk.d.ts:5479-5481`)。`mcp_servers` は `{ name, status: string }`。`status` の値域は `McpServerStatus.status` (`connected` / `failed` / `needs-auth` / `pending` / `disabled`。:1135)
- `plugins` の `version` は「plugin-author-controlled — validate before trusting」(:5516)
- `commands_changed` は「Clients should REPLACE their cached command list」(:3447)
- **Decision**: O-4 の `meter` に `config` / `commands` を足す (AD-048 Decision 3)。`mcp_status` は呼ばない (Decision 2)

## R-03 MCP の tool の表示

- 今は `tool-registry.aui.tsx:22-38` の表に無い名前はすべて ToolFallback。表の照合は `TOOL_DISPLAY[name] ?? ToolFallback` で、`constructor` などの名前で関数が返る (O-4 design-gate security M-001)
- **Decision**: 名前の純関数 (data-model §1) で MCP を判定し、専用の `McpToolCall` に回す。表の照合を `Object.hasOwn` に直す
- 結果: MCP の tool の結果は text と画像・resource のブロック。表やグラフへの写しは推測になるので行わない (U-5)
- element: registry に MCP の tool の専用 element があるかを実装の最初に確かめる (Principle XIII。F 節の MCP server panel / MCP config dialog は構成と操作の element で、tool の呼び出しの element ではない)

## R-04 認証とプラグインの出来事

- `auth_status` は `isAuthenticating`・`output: string[]`・`error`。アプリが起こすセッションでは、ログインは WSL の端末で済ませる運用なので、届く場面は少ない (Provider の認証切れは O-4 の失敗の理由で出る)
- `plugin_install` は `CLAUDE_CODE_SYNC_PLUGIN_INSTALL` のときの進み具合 (`started` / `installed` / `failed` / `completed`)
- **Decision**: O-2 のシステムイベントの行に `auth` / `plugin` を足す。`output` / `error` は出さない (U-4)
