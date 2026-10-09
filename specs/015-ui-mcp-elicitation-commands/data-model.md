# Data Model: MCP・プラグイン・コマンドの表示 (O-5)

各規則の正本は本ファイルの節。SDK の型は `@anthropic-ai/claude-agent-sdk` 0.3.270 (`SDKSystemMessage` (init) `sdk.d.ts:5482-5543`、`SDKCommandsChangedMessage` :3449、`SlashCommand` :8696、`SDKAuthStatusMessage` :3413 (最上位の型)、`SDKPluginInstallMessage` :5213-5224、`McpServerStatus.status` :1135、MCP のサーバー名の正規化 :4322、`AskUserQuestionInput` `sdk-tools.d.ts:1058-2620`)。

## §1 MCP の tool の名前と表示 (`features/chat/mcp-tool-name.ts`。renderer の純関数)

### 名前の解き方 (`parseMcpToolName(name, knownServers)`)

`knownServers` は表示中のセッションの `init-report` の `mcpServers` の名前 (過去ログ・構成が無いときは空)。

| 入力 (`toolName`) | 結果 |
|---|---|
| `ListMcpResourcesTool` / `ReadMcpResourceTool` / `ReadMcpResourceDir` / `RefreshMcpTools` | `{ kind: 'mcp-builtin', server: 入力の `server` (§2 の名前の形に通れば), tool: 名前 }`。表 (完全一致) で振り分ける |
| `mcp__` + `rest`、`knownServers` のうち `rest` が `<s>__` で始まる `s` がちょうど 1 つ最長 | `{ kind: 'mcp', server: s, tool: 残り, inferred: false }` |
| `mcp__` + `rest`、上に当たらず `rest` が `<s>__<t>` (`s` は `__` を含まない 1 文字以上、`t` は 1 文字以上) | `{ kind: 'mcp', server: s, tool: t, inferred: true }` (「サーバー名は推定」の印) |
| `mcp__` で始まるが上の形に合わない | `{ kind: 'mcp', server: null, tool: 全体, inferred: false }` |
| それ以外 (`mcp_x`・`MCP__a__b`・`xmcp__a__b` を含む) | `null` (MCP ではない) |

- 名前は、実行中は `sanitizeBody` を通った値 (`live-message.ts:61`)、過去ログは本 feature で同じ無害化に揃える (`transcript.ts:233`)。`mcp-tool-name.ts` 自身も制御文字・双方向制御・ゼロ幅を落とす (2 層目)
- **振り分け (`tool-registry.aui.tsx`)**: (1) 完全一致の表 (`Object.hasOwn`。組み込みの 4 tool と `AskUserQuestion` を含む) → (2) `parseMcpToolName` が `mcp` なら `McpToolCall` → (3) ToolFallback。AD-035 Decision 1 の「未登録は ToolFallback」は (1)(2) のどちらにも当たらない名前に対して保つ (AD-048 Decision 5)
- **transcript の見出し**: `{server} › {tool}` (`inferred` なら「サーバー名は推定」の印)、server が null なら tool だけ。1 行・64 文字で切り詰める (transcript だけ)。resource の tool は URI の要約を添える
- **URI の要約**: 入力の `uri` を WHATWG URL で読み、`protocol` と `host` と最後のパスの要素だけを出す (`username` / `password` / `search` / `hash` を捨てる)。読めない・`file:` で host が無い・256 文字を超える → 出さない
- **中身**: 入力は閉じた JSON (O-2 の本文の上限と無害化を通った `argsText`)。結果は `<pre>` の平文 (MarkdownText に通さない)。画像・resource の印は出さない (U-7)

### 承認カード (`ApprovalCard.tsx`)

- MCP の tool: 1 行目に生の `toolName` を**切り詰めずに**等幅・`break-all` で出す (承認の判断の正本の識別子)。2 行目に補助の見出し (`{server} › {tool}`、`inferred` なら「サーバー名は推定」)
- `AskUserQuestion`: §4 の暫定の注記を出す
- それ以外の tool: 今のまま

### `AskUserQuestion` の読み取り専用の表示 (`ask-user-question.aui.tsx`)

- 入力の `questions` の各問い: `header` (チップ)・`question`・選択肢の `label` と `description` (`preview` は出さない)・`multiSelect` の印
- 入力に `answers` があれば (過去ログ)、問いの文をキーに引いて選ばれた選択肢を強調する (キーの照合は `Map`)
- 入力の文字列は O-2 の無害化を通った `argsText` を JSON として読んだもの。形が合わなければ ToolFallback と同じ JSON の表示に倒す
- 結果は平文

## §2 構成 (`meter` の種類 `init-report` / `commands`。AD-048)

```ts
| { readonly type: 'init-report'; readonly model: string | null;
    readonly permissionMode: PermissionModeKey;           // O-4 の比較に渡す (表示は O-4 の規則)
    readonly mcpServers: readonly { name: string; status: McpStatusKey }[];
    readonly tools: readonly string[]; readonly skills: readonly string[];
    readonly plugins: readonly { name: string; version: string | null }[];
    readonly slashCommands: readonly string[]; readonly omitted: number }
| { readonly type: 'commands';
    readonly commands: readonly { name: string; description: string; argumentHint: string }[];
    readonly omitted: number }
```

### 変換の入力 (SDK のフィールドの許可リスト。**これが正本**)

| SDK のメッセージ | 読むフィールド | 読まないフィールド |
|---|---|---|
| `system` / `init` | `model`・`permissionMode`・`mcp_servers` の `name` と `status`・`tools`・`skills`・`plugins` の `name` と `version`・`slash_commands` | `cwd`・`plugins` の `path`・`apiKeySource`・`betas`・`claude_code_version`・`agents`・`output_style`・`capabilities`・`terminal_slash_commands`・`fast_mode_*`・`effort` |
| `system` / `commands_changed` | `commands` の `name`・`description`・`argumentHint` | `aliases` |

### 形の検査 (agents と decoder で同じ定数。domain の `session-init-report.ts`)

運ぶ文字列は会話本文ではないが、利用者の設定・作業フォルダ (`.claude/`)・MCP サーバー・プラグインの作者に由来する**未信頼の文字列**である。

| 値 | 規則 (allowlist) | 外れたとき |
|---|---|---|
| MCP のサーバー名・tool 名 (`mcp__` の部分) | `^[A-Za-z0-9_-]{1,128}$` (SDK の正規化と同じ文字集合) | 落として `omitted` を 1 増やす |
| その他の tool 名・コマンド名・スキル名・プラグイン名 | `^[A-Za-z0-9_.:@/-]{1,128}$`、`//` を含まない | 同上 |
| `model` | O-4 data-model §2 の `modelId` と同じ | null |
| `version` | `^[0-9A-Za-z.+-]{1,32}$` | null |
| コマンドの `description` / `argumentHint` | O-2 の `sanitizeBody` を通し、Unicode の一般カテゴリ Cc / Cf / Zl / Zp を除き、1 行に正規化、200 / 64 コードポイントで切り詰め。平文で描く (markdown・自動リンクにしない) | '' |
| `status` (MCP) | `connected` / `failed` / `needs-auth` / `pending` / `disabled` を `Object.hasOwn` の表で照合 (`init` の型は `string`) | `unknown` |
| `permissionMode` | O-4 の `PermissionModeKey` | `unknown` |
| 件数 | MCP サーバー 64、tool 256、スキル 128、プラグイン 64、スラッシュコマンド 256、コマンド 256 | 超えた分を落とし `omitted` に数える |
| `meter` 1 件の直列化後のバイト数 | 64KB 以下 (`BODY_MAX_BYTES` (200,000) の内) | 後ろの要素から落として `omitted` に数える |

- `sdk-agent-session.ts` で、domain に手書きした入力型 (`SessionInitReportInput` / `CommandsChangedInput` / `AuthStatusInput` / `PluginInstallInput`。読むフィールドだけ) と SDK の型の一方向の代入可能性 (既存の :82 の形) と、`McpStatusKey` (`unknown` を除く) の値域の `Equal<…>` (:80-81 の形) を固定する。SDK の import 文は 1 つに保つ
- **送るかの判定**: 変換後の値を決まった順に直列化した文字列の全体で前回と比べる。同じなら送らない。**基準は実際に送ったときだけ更新する** (`run()` の closure)。`init-report` / `commands` は O-4 の `meter` の上限 (1 秒に 20 件) に掛けない
- `init` の `permissionMode` は O-4 の権限モードの比較 (`meter.ts` の関数。基準は closure) にも渡す。変わったときは O-4 の `meter` `permission-mode` と行を出す (O-4 data-model §2 / §3。agents は値を渡すだけで、昇格値のリテラルは domain)

### renderer の保持

O-4 data-model §2 の `meters` に `initReport` (最新) と `commands` (最新) と、スラッシュコマンドの一覧の出所の受信の連番を足す。スラッシュコマンドの一覧は、`init-report` の `slashCommands` と `commands` のうち後に届いた方を使う。保持は `Map` / `Object.hasOwn` (名前をキーにする集計を含む)。

## §3 構成のタブ (右のペイン。O-7 のタブの表に `config` を 1 行。`availableFor: ['running', 'past', 'none']`)

| 節 | 中身 | 0 件 / 外れ |
|---|---|---|
| 状態の時点 | 「ターンの開始時点の状態です」 | — |
| Claude Code が報告したモデル | `initReport.model` (「概要」の「選んだモデル」と見出しを分ける) | null → 「不明」 |
| MCP サーバー | 名前と状態 (§6)。`failed` / `needs-auth` は注意の印。案内は下 | 「MCP サーバーはありません」 |
| tool | 件数と一覧。MCP の tool はサーバーごとにまとめる (`Map`。§1 の関数) | 「ありません」 |
| スラッシュコマンド | 名前・`argumentHint`・説明 (平文) | 「ありません」 |
| スキル / プラグイン | 名前 (と版) | 「ありません」 |
| 省いた数 | `omitted` の合計が 1 以上なら「形の合わない名前・多すぎる分を {n} 件省きました」 | — |

- **注意の印**: `data-attention="true"`・警告のアイコン・`aria-label` に「注意」。`failed` / `needs-auth` だけ (`unknown` は印を付けない)
- **案内**: `needs-auth` → 「このセッションを起動した環境で claude を開き、/mcp で認証してください (Provider が設定ディレクトリを指定している場合は、同じ `CLAUDE_CONFIG_DIR` で開いてください)」。`failed` → 「このセッションを起動した環境で claude を開き、/mcp で詳細を確かめてください」
- 過去 → 「実行中のセッションだけ出ます」、未選択 → O-7 の空の状態、`initReport` がまだ無い → スラッシュコマンドの節 (`commands` があれば) だけを出し、他は「最初のターンの後に出ます」
- **O-7 のタブの表の拡張**: `PanelTab` に `attention?: (sessionId: string) => boolean` を足す (O-7 data-model §4 の影響。AD-046 Decision 4 の「1 か所の表に登録」の形を保つ)。畳んだ帯は `attention` が true のタブのアイコンに印を出す

## §4 システムイベントの行と承認カードの注記

### 行 (O-2 の `system-event` の category。O-4 data-model §3 と同じ規則。行の組み立ては agents の `live-system-rows.ts`、過去ログの変換に足さない)

| category | 判定 | 行の id | 作る (opens) | `name` | `detail` | `status` |
|---|---|---|---|---|---|---|
| `auth` | `type === 'auth_status'` (最上位の型) | `auth:<連番>` (認証の 1 回の流れ。closure) | `isAuthenticating: true` | '' | '' | `authenticating` → `isAuthenticating: false` で `succeeded`、`error` があれば `failed` |
| `plugin` | `type === 'system' && subtype === 'plugin_install'` | `plugin:<連番>` (`started` から `completed` まで。closure) | `status: 'started'` | '' | 導入できた数 / できなかった数と、最後のマーケットプレイスの名前 (§2 の名前の形の検査) | `started` (既存) → `completed` (失敗が 1 つでもあれば `failed`) |

- `output` / `error` の文字列は通さない
- `SystemEventStatus` に足すのは `authenticating` だけ (`started` / `succeeded` / `failed` / `completed` は既存。`transcript-dto.ts:66-67`)。category の正本は `transcript-dto.ts:62`
- `system-event.ts:117` の `HOOK_OUTCOMES[m.outcome] ?? 'unknown'` は同じファイルを触るので `Object.hasOwn` に直す

### 承認カードの `AskUserQuestion` の注記 (正本の文言は §6)

`toolName === 'AskUserQuestion'` (承認の要求の SDK の tool 名) のときだけ出す。表示だけの変更で、承認の応答は変えない。

## §5 対応表の書き換え先 (正本。完了の PR で。経路の列も書き換える)

| 節 | 行 | 割当 | 経路 |
|---|---|---|---|
| A | `init` | `実装済み: 構成のタブ (実行中)`。備考: `cwd`・`path`・`apiKeySource` などは出さない | 実行中 |
| A | `plugin_install` | `実装済み: SystemEventRow (実行中)`。備考: アプリの起動では `CLAUDE_CODE_SYNC_PLUGIN_INSTALL` を渡さない (AD-041 (e)) ので通常は届かない | 実行中 |
| A | `auth_status` (Tier A) | `実装済み: SystemEventRow (実行中)`。備考: `output` / `error` は出さない (U-4) | 実行中 |
| A | `commands_changed` | `実装済み: 構成のタブ (実行中)` | 実行中 |
| A | `elicitation_complete` (Tier A) | `後続: O-10` | なし |
| C | `ListMcpResourcesTool` / `RefreshMcpTools` / `ReadMcpResourceDir` / `ReadMcpResourceTool` | `実装済み: McpToolCall (両方)` | 両方 |
| C | `mcp__<server>__<tool>` (Tier A) | `実装済み: McpToolCall (両方)` | 両方 |
| C | `AskUserQuestion` (Tier A) | `後続: O-10`。備考: 問いの読み取り専用の表示と承認カードの注記は O-5 で実装 (回答は O-10) | 両方 |
| E | `mcp_status` | `表示不要: init の mcp_servers で足りる (AD-048)` | なし |
| E | `mcp_call` / `mcp_message` / `mcp_set_servers` / `mcp_reconnect` / `mcp_toggle` / `reload_plugins` / `reload_skills` | `表示不要: アプリは MCP・プラグイン・スキルを操作しない (AD-048)` | なし |
| E | `elicitation` (Tier A) / `request_user_dialog` | `後続: O-10` | なし |
| F | Chart / Data table / Diagram / Timeline | 使い道 `未使用`、備考 `MCP の結果に転用しない (AD-048 Decision 4)` | — |
| F | Composer slash commands | 使い道 `未使用`、備考 `O-10 (composer の候補)` | — |
| F | Elicitation form / Question flow | 備考を `O-10` に | — |
| F | MCP server panel | 使い道は SH-002 の照合の結果で決める (採れば `A SDKSystemMessage`、自作なら `未使用` と理由) | — |
| F | MCP config dialog | `未使用`、備考 `MCP の設定を操作しない (AD-048)` | — |

## §6 新しい文言 (正本。`labels.ts`)

| 置き場 | キー | 文言 |
|---|---|---|
| shell | `configTab` | 構成 |
| shell | `configTimepoint` | ターンの開始時点の状態です |
| shell | `configLiveOnly` / `configAwaitFirst` | 実行中のセッションだけ出ます。 / 最初のターンの後に出ます。 |
| shell | `reportedModel` / `unknownValue` | Claude Code が報告したモデル / 不明 |
| shell | MCP の状態 | 接続済み / 失敗 / 認証が必要 / 接続中 / 無効 / 不明 |
| shell | `mcpNeedsAuth` | このセッションを起動した環境で claude を開き、/mcp で認証してください (Provider が設定ディレクトリを指定している場合は、同じ CLAUDE_CONFIG_DIR で開いてください)。 |
| shell | `mcpFailed` | このセッションを起動した環境で claude を開き、/mcp で詳細を確かめてください。 |
| shell | 節の 0 件 | MCP サーバーはありません / ありません |
| shell | `configOmitted` | 形の合わない名前・多すぎる分を {n} 件省きました。 |
| shell | `attention` | 注意 |
| chat | MCP の表示 | 入力 / 結果 / サーバー名は推定 |
| chat | `AskUserQuestion` の表示 | 複数選択 / 選ばれた回答 |
| session | `askUserQuestionNotice` (承認カード) | このアプリからは回答を送れません。許可しても選択は Claude に届きません。拒否して、本文で答えてください。 |
| chat | システムイベントの行 | Claude Code が認証中です。セッションを起動した環境の端末で claude にログインしてください / 認証しました / 認証に失敗しました (再ログインしてください) / プラグインのマーケットプレイスを導入中 / 導入しました ({n} 件) / 導入に失敗しました ({n} 件) |
