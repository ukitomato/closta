---
status: proposed
date: 2026-10-04
id: AD-048
deciders: ukitomato
tags: [session, ui, sdk, mcp, scope]
supersedes: []
superseded-by: []
---

# AD-048: セッションの構成を `meter` で運び、MCP を操作せず、問いに答える UI を O-10 に分ける

## Context

O-5 ([spec 015](../../specs/015-ui-mcp-elicitation-commands/spec.md)) は、`docs/ui-coverage.md` で `後続: O-5` の行 (Tier A 5 行) を受け持つ。範囲は roadmap の O-5 の行で、「操作画面 (MCP サーバーの追加・削除など) は含めない」とされている。

調べた事実 (SDK 0.3.270):

- `AskUserQuestion` の回答は、承認の応答 (`canUseTool`) の `updatedInput` に `answers` を入れて返す (`sdk-tools.d.ts:2605-2609`「User answers collected by the permission component」)。[AD-036](0036-single-session-launch-process-and-live-stream.md) Decision 4 は承認の応答から `updatedInput` を構造的に除いた (正の構成 P2)
- Elicitation は query の options の `onElicitation` (`sdk.d.ts:1606-1626`。無ければ自動で断られる)、`request_user_dialog` は `onUserDialog` と `supportedDialogKinds` (:1628-1655) を要る。[AD-041](0041-x4-launch-config-on-x1-launch-gate.md) (g) は options のキーの集合を固定した
- `init` (`sdk.d.ts:5482-5543`) は毎ターンの最初に届き、`mcp_servers` の状態を運ぶ。`commands_changed` はスラッシュコマンドの一覧の置き換え

本 ADR は O-5 が夜間の自走で起こした。**未承認である (spec 015 の U-1〜U-5)。** [AD-047](0047-session-meter-and-failure-reasons.md) (proposed。O-4) を前提にする。

## Decision

1. **問いに答える UI を O-10 に分ける。** `AskUserQuestion` の回答・Elicitation の form / URL・`request_user_dialog`・`elicitation_complete` の表示を、新しい feature O-10 (M3・`ui`・依存 O-5) にする。O-10 は design の前に、AD-036 Decision 4 (承認の応答の `updatedInput` を `AskUserQuestion` の `answers` に限る制約付き射影。[AD-040](0040-provider-settings-constrained-projection.md) の `settings` の射影が先例) と AD-041 (g) (`onElicitation` / `onUserDialog` / `supportedDialogKinds`) の読み替えの ADR を起こす
2. **MCP・プラグイン・スキルを操作しない。** 制御要求 `mcp_status` / `mcp_call` / `mcp_message` / `mcp_set_servers` / `mcp_reconnect` / `mcp_toggle` / `reload_plugins` / `reload_skills` を呼ばない。MCP サーバーの状態は `init` の `mcp_servers` で出す。Agent SDK の呼び出しの許可リスト (Constitution 検証の項目 14) と query の options のキーは変えない
3. **構成を `meter` で運ぶ。** AD-047 の `meter` に種類 `config` (`init` から) と `commands` (`commands_changed` から) を足す。運ぶ文字列は会話由来ではないが利用者の設定由来 (tool・コマンド・サーバー・スキル・プラグインの名前、コマンドの説明) なので、形の検査・切り詰め・件数の上限を通す (正本は spec 015 data-model §2)。`cwd`・プラグインの `path`・MCP サーバーの `error`・`apiKeySource` は通さない。これは AD-047 Decision 2 (「数・真偽・列挙・モデルの id だけ」) の範囲を、設定由来の名前に広げる読み替えである
4. **MCP の結果を表やグラフに写さない。** Tier C の Data table / Chart / Timeline / Diagram を MCP の結果に転用しない

## Consequences

- `SessionEvent` の種類は増えない (`meter` の中の種類が増える)
- O-10 が M3 に加わる。Tier A の `AskUserQuestion` / `elicitation` / `elicitation_complete` は M3 の完了の条件の残りとして O-10 に移る
- アプリは MCP サーバーの再接続や認証を助けない。`needs-auth` は Claude Code 側で認証するよう案内する

## Alternatives

- **応答の UI も O-5 に入れる** — 表示と権限ゲートの例外の設計が 1 つの spec に混ざり、FR が 20 を超える
- **`mcp_status` を呼ぶ** — 許可リストの追加と呼び出しの時期の設計が要る。`init` は毎ターン届くので鮮度は足りる
- **新しい `SessionEvent` の種類を足す** — O-4 と O-5 で種類が 2 つ増える

## Confirmation

- spec 015 の SC-002 / SC-005 (変換の単体・固定テスト・`git diff`)
- O-10 の design の前に、Decision 1 の 2 つの ADR が起きていること
