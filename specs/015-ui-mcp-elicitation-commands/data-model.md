# Data Model: MCP・プラグイン・コマンドの表示 (O-5)

各規則の正本は本ファイルの節。SDK の型は `@anthropic-ai/claude-agent-sdk` 0.3.270 (`SDKSystemMessage` (init) `sdk.d.ts:5482-5543`、`SDKCommandsChangedMessage` :3449、`SlashCommand` :8696、`SDKAuthStatusMessage` :3413、`SDKPluginInstallMessage` :5216、`McpServerStatus.status` :1135)。

## §1 MCP の tool の名前 (`features/chat/mcp-tool-name.ts`。renderer の純関数)

| 入力 (`toolName`) | 結果 |
|---|---|
| `mcp__<s>__<t>` (`<s>` は `__` を含まない 1 文字以上、`<t>` は 1 文字以上) | `{ kind: 'mcp', server: s, tool: t }` |
| `ListMcpResourcesTool` / `ReadMcpResourceTool` / `ReadMcpResourceDir` / `RefreshMcpTools` | `{ kind: 'mcp-builtin', server: 入力の server (あれば), tool: 名前 }` |
| `mcp__` で始まるが上の形に合わない | `{ kind: 'mcp', server: null, tool: 全体 }` |
| それ以外 | `null` (MCP ではない) |

- 名前は既存の `sanitizeToolName` を通ったもの (agents)。表示では 1 行・64 文字で切り詰める
- `tool-registry.aui.tsx` の振り分けは、表の登録の照合を `Object.hasOwn` にし (今は `TOOL_DISPLAY[name] ?? ToolFallback`。`constructor` などで関数が返る。O-4 design-gate security M-001)、表に無い名前で `mcp-tool-name` が MCP と判定したら MCP の表示に回す
- MCP の表示の見出し: `{server} › {tool}` (server が null なら tool だけ)。resource の tool は入力の `uri` (文字列で 256 文字まで。`mayCarrySecret` が true なら出さない) を添える。入力の値はそれ以外は見出しに出さない
- 中身: 入力は既存の tool の表示と同じく閉じた JSON (O-2 の本文の上限と無害化を通った `argsText`)。結果は text として描く。結果の content のうち画像は「画像」、resource のリンクは「resource」の印だけ

## §2 構成 (`meter` の種類 `config` / `commands`。AD-048)

```ts
| { readonly type: 'config'; readonly model: string | null;
    readonly mcpServers: readonly { name: string; status: McpStatusKey }[];
    readonly tools: readonly string[]; readonly skills: readonly string[];
    readonly plugins: readonly { name: string; version: string | null }[];
    readonly slashCommands: readonly string[]; readonly omitted: OmittedCounts }
| { readonly type: 'commands';
    readonly commands: readonly { name: string; description: string; argumentHint: string }[];
    readonly omitted: number }
```

### 変換の入力 (SDK のフィールドの許可リスト。**これが正本**)

| SDK のメッセージ | 読むフィールド | 読まないフィールド |
|---|---|---|
| `system` / `init` | `model`・`mcp_servers` の `name` と `status`・`tools`・`skills`・`plugins` の `name` と `version`・`slash_commands` | `cwd`・`plugins` の `path`・`apiKeySource`・`betas`・`claude_code_version`・`agents`・`output_style`・`permissionMode` (O-4 の `status` で運ぶ)・`capabilities`・`terminal_slash_commands`・`fast_mode_*`・`effort` |
| `system` / `commands_changed` | `commands` の `name`・`description`・`argumentHint` | `aliases` |

### 形の検査 (agents と decoder で同じ定数。domain の `session-config.ts`)

| 値 | 規則 | 外れたとき |
|---|---|---|
| 名前 (tool・サーバー・スキル・プラグイン・コマンド) | 1〜128 文字、制御文字・双方向制御・ゼロ幅を含まない、`mayCarrySecret` が false | その要素を落とし `omitted` を 1 増やす |
| `model` | O-4 data-model §2 の `modelId` と同じ | null |
| `version` | `^[0-9A-Za-z.+-]{1,32}$` | null |
| コマンドの `description` / `argumentHint` | O-2 の `sanitizeBody` を通し 1 行に正規化、200 / 64 コードポイントで切り詰め | '' |
| `status` (MCP) | `connected` / `failed` / `needs-auth` / `pending` / `disabled` (`McpServerStatus.status` の値域。`init` の型は `string`) を `Object.hasOwn` の表で照合 | `unknown` |
| 件数 | MCP サーバー 64、tool 256、スキル 128、プラグイン 64、コマンド 256 | 超えた分を落とし `omitted` に数える |

- `sdk-agent-session.ts` で `Equal<…>` (既存の :80-84 の型) により `McpStatusKey` (`unknown` を除く) と SDK の `McpServerStatus['status']` を固定する
- 同じ内容の `config` / `commands` は送らない (セッションスレッドが前回の値の要約 (件数と名前の連結の長さ) と比べる。`run()` の closure)

### renderer の保持

O-4 data-model §2 の `meters` に `config` (最新) と `commands` (最新) を足す。`commands_changed` は `commands` を置き換える。`config.slashCommands` (名前だけ) は `commands` が届くまでの一覧に使う。

## §3 構成のタブ (右のペイン。O-7 のタブの表に `config` を 1 行。`availableFor: ['running', 'past', 'none']`)

| 節 | 中身 |
|---|---|
| モデル | `config.model` |
| MCP サーバー | 名前と状態 (接続済み / 失敗 / 認証が必要 / 接続中 / 無効 / 不明)。`failed` / `needs-auth` は注意の見た目。`needs-auth` に「Claude Code で認証してください (例: WSL の端末で claude を開き /mcp)」 |
| tool | 件数と一覧 (MCP の tool は サーバーごとにまとめる。§1 の関数) |
| スラッシュコマンド | 名前・`argumentHint`・説明 (あれば) |
| スキル / プラグイン | 名前 (と版) |
| 省いた数 | `omitted` が 1 以上なら「形の合わない名前・多すぎる分を N 件省きました」 |

- 過去 → 「実行中のセッションだけ出ます」、未選択 → O-7 の空の状態、`config` がまだ無い → 「最初のターンの後に出ます」
- 右のペインの畳んだ帯の「構成」のアイコン: MCP サーバーのどれかが `failed` / `needs-auth` なら注意の印 (`aria-label` に「MCP サーバーに注意」)

## §4 システムイベントの行の追加 (O-2 の `system-event` の category。O-4 data-model §3 と同じ規則)

行の組み立ては agents (O-4 の `live-system-rows.ts`) に置き、過去ログと共有の `toSystemEventMessage` には足さない。part の形は変えない。

| category | 行の id | 作る (opens) | `name` | `detail` | `status` |
|---|---|---|---|---|---|
| `auth` | `auth:<連番>` (認証の 1 回の流れ) | `auth_status` の `isAuthenticating: true` | '' | '' | `authenticating` → `isAuthenticating: false` で `succeeded`、`error` があれば `failed` |
| `plugin` | `plugin:<連番>` (`started` から `completed` まで) | `plugin_install` の `started` | '' | 導入できた数 / できなかった数と、最後に導入したプラグインの名前 (§2 の形の検査) | `started` → `completed` (失敗が 1 つでもあれば `failed`) |

- `output` / `error` の文字列は通さない
- `SystemEventStatus` に `authenticating` / `started` を足す。終わりの値は既存の `succeeded` / `failed` / `completed`。`auth` の `failed` の行は再ログインを案内する文言

## §5 対応表の書き換え先 (正本。完了の PR で)

| 節 | 行 | 書き換え先 |
|---|---|---|
| A | `init` | `実装済み: 構成のタブ (実行中)`。備考: `cwd`・`path`・`apiKeySource` などは出さない (data-model §2) |
| A | `plugin_install` | `実装済み: SystemEventRow (実行中)` |
| A | `auth_status` (Tier A) | `実装済み: SystemEventRow (実行中)`。備考: `output` / `error` は出さない (U-4) |
| A | `commands_changed` | `実装済み: 構成のタブ (実行中)` |
| A | `elicitation_complete` (Tier A) | `後続: O-10` |
| C | `ListMcpResourcesTool` / `RefreshMcpTools` / `ReadMcpResourceDir` / `ReadMcpResourceTool` | `実装済み: McpToolCall (両方)` |
| C | `mcp__<server>__<tool>` (Tier A) | `実装済み: McpToolCall (両方)` |
| C | `AskUserQuestion` (Tier A) | `後続: O-10`。備考: 今は承認カードで許可 / 拒否だけ |
| E | `mcp_status` | `表示不要: init の mcp_servers で足りる (O-5 U-2)` |
| E | `mcp_call` / `mcp_message` / `mcp_set_servers` / `mcp_reconnect` / `mcp_toggle` / `reload_plugins` / `reload_skills` | `表示不要: アプリから MCP サーバー・プラグイン・スキルを操作しない (O-5 U-2)` |
| E | `elicitation` (Tier A) / `request_user_dialog` | `後続: O-10` |
| F | Chart / Data table / Diagram / Timeline | 使い道 `未使用`、備考 `MCP の結果に転用しない (O-5 U-5)` |
| F | Composer slash commands | `未使用`、備考 `composer の候補は出さない (O-5)。一覧は構成のタブ` |
| F | Elicitation form / Question flow | 備考を `O-10` に |
| F | MCP server panel | `A SDKSystemMessage` (構成のタブ) |
| F | MCP config dialog | `未使用`、備考 `MCP の設定の操作はしない (O-5 U-2)` |

## §6 新しい文言 (正本。`labels.ts`)

| 置き場 | キー | 文言 |
|---|---|---|
| shell | `configTab` | 構成 |
| shell | `configLiveOnly` / `configAwaitFirst` | 実行中のセッションだけ出ます。 / 最初のターンの後に出ます。 |
| shell | MCP の状態 | 接続済み / 失敗 / 認証が必要 / 接続中 / 無効 / 不明 |
| shell | `mcpNeedsAuth` | Claude Code で認証してください (例: WSL の端末で claude を開き /mcp)。 |
| shell | `configOmitted` | 形の合わない名前・多すぎる分を {n} 件省きました。 |
| shell | `mcpAttention` | MCP サーバーに注意 |
| chat | MCP の表示 | 入力 / 結果 / 画像 / resource |
| chat | システムイベントの行 | Claude Code が認証中 / 認証しました / 認証に失敗しました (再ログインしてください) / プラグインを導入中 / プラグインを導入しました ({n} 件) / プラグインの導入に失敗しました ({n} 件) |
