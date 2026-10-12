# Data Model: MCP・プラグイン・コマンドの表示 (O-5)

各規則の正本は本ファイルの節。SDK の型は `@anthropic-ai/claude-agent-sdk` 0.3.270 (`SDKSystemMessage` (init) `sdk.d.ts:5482-5543`、`SDKCommandsChangedMessage` :3449、`SlashCommand` :8696、`SDKAuthStatusMessage` :3413 (最上位の型)、`SDKPluginInstallMessage` :5216-5224、`McpServerStatus.status` :1135、MCP のサーバー名の正規化 :4322、`AskUserQuestionInput` `sdk-tools.d.ts:1058-2620`)。

## §1 MCP の tool の名前と表示 (`features/chat/mcp-tool-name.ts`。renderer の純関数)

### 名前の解き方 (`parseMcpToolName(name, knownServers)`)

`knownServers` は表示中のセッションの `init-report` の `mcpServers` の名前 (過去ログ・構成が無いときは空)。
transcript の element は session を import しないので、O-4 の購読元 `LiveProgressSource` (`features/chat/transcript-context.ts`) に
`mcpServerNames(): readonly string[]` を足し、`useLiveMcpServerNames()` で読む (実行中のペイン `LivePane` の `LiveSessionPane` が
`meters[sessionId].initReport` から作る。過去ログ (`ChatScreen`) は購読元が null で空)。snapshot は `initReport` が替わるまで同じ参照を返す
(plan research R-05)。承認カードは `LivePane` から同じ名前の一覧を props で受ける。

| 入力 (`toolName`) | 結果 |
|---|---|
| `ListMcpResourcesTool` / `ReadMcpResourceTool` / `ReadMcpResourceDir` / `RefreshMcpTools` | `{ kind: 'mcp-builtin', server: 入力の `server` (§2 の名前の形に通れば), tool: 名前 }`。表 (完全一致) で振り分ける |
| `mcp__` + `rest`、`knownServers` のうち `rest` が `<s>__` で始まり残りが 1 文字以上の `s` が**ちょうど 1 つ** | `{ kind: 'mcp', server: s, tool: 残り, inferred: false }` |
| `mcp__` + `rest`、そのような `s` が **2 つ以上** (長さに関わらず) | `{ kind: 'mcp', server: 最長の s, tool: 残り, inferred: true }` (「サーバー名は推定」の印。どちらのサーバーの tool かを名前から決められない。CWE-451) |
| `mcp__` + `rest`、上に当たらず (`knownServers` が空・どれにも一致しない) `rest` が `<s>__<t>` (`s` は `__` を含まない 1 文字以上、`t` は 1 文字以上) | `{ kind: 'mcp', server: s, tool: t, inferred: true }` (「サーバー名は推定」の印) |
| `mcp__` で始まるが上の形に合わない | `{ kind: 'mcp', server: null, tool: 全体, inferred: false }` |
| それ以外 (`mcp_x`・`MCP__a__b`・`xmcp__a__b` を含む) | `null` (MCP ではない) |

- **過去ログ**: `knownServers` は常に空なので、`mcp__<s>__<t>` の形の名前はすべて 3 行目 (最初の `__` で分け、推定の印つき) になる。印は外さない (過去ログでは分け方を確かめる手段が無い)。過去ログと実行中で違ってよいのはこの印の有無だけで、部品・見出しの構造・中身・状態の印は同じ (spec US-1 AC5)

- 名前は、実行中は `sanitizeBody` を通った値 (`live-message.ts:61`)、過去ログは本 feature で同じ無害化に揃える (`transcript.ts:233`)。`mcp-tool-name.ts` 自身も制御文字・双方向制御・ゼロ幅を落とす (2 層目)
- **振り分け (`tool-registry.aui.tsx`)**: (1) 完全一致の表 (`Object.hasOwn`。組み込みの 4 tool と `AskUserQuestion` を含む) → (2) `parseMcpToolName` が `mcp` なら `McpToolCall` → (3) ToolFallback。AD-035 Decision 1 の「未登録は ToolFallback」は (1)(2) のどちらにも当たらない名前に対して保つ (AD-048 Decision 5)
- **transcript の見出し**: `{server} › {tool}` (`inferred` なら「サーバー名は推定」の印)、server が null なら tool だけ。1 行・64 文字で切り詰める (transcript だけ)。resource の tool は URI の要約を添える
- **URI の要約** [Q3。承認済み (2026-10-10)]: 入力の `uri` を WHATWG URL で読み、`protocol` と `host` と最後のパスの要素だけを出す (`username` / `password` / `search` / `hash` を捨てる)。読めない・256 文字を超える → 出さない
  - `host` は、英数字が 20 文字以上続かず、`mayCarrySecret` が false のときだけ出す。外れたら `protocol` だけを出す (最後のパスの要素も出さない)。トンネルの使い捨ての host (`<乱数>.ngrok.io` など) や、host の位置に置いた token を見出しに出さない (CWE-200)
  - 最後のパスの要素は、ファイル名らしい形のときだけ出す: URL の `pathname` の最後の要素 (decode しない。`%` を含めば外れる) が `^[A-Za-z0-9._-]{1,64}$`、英数字が 20 文字以上続かない、`mayCarrySecret` が false。外れたら `protocol` と `host` だけ (host も無ければ `protocol` だけ)。webhook (`/services/T…/B…/<secret>`)・`/bot<token>/` のように末尾が秘密の URI を見出しに出さない (spec 016 design-gate R2 security M-001 の申し送り。research R-07)
- **中身**: 入力は閉じた JSON (O-2 の本文の上限と無害化を通った `argsText`)。結果は `<pre>` の平文 (MarkdownText に通さない)。画像・resource の印は出さない (U-7)
- **状態の印** (`McpToolCall` と `AskUserQuestion` の表示の両方。spec US-1 AC9): ToolFallback と同じにする — part の `status` による状態のアイコン (結果待ち・`requires-action`・`incomplete`。`tool-fallback.aui.tsx:97-98` の表)、`incomplete` の中断の印 (`reason === 'cancelled'` とエラーの出し分け。`:142` / `:294-302`)、経過時間 (`useToolCallElapsed`。`:113`) と O-4 の `ToolResultMarks` (エラー・切り詰め・実行中の経過時間。`tool-result-marks.tsx:49`)。印の判定と文言は ToolFallback の側の関数・部品を使い、専用の表示に写し直さない (共通にするために ToolFallback から切り出すのはよい。そのときは ToolFallback の DOM を変えない)

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
| `system` / `init` | `model`・`mcp_servers` の `name` と `status`・`tools`・`skills`・`plugins` の `name` と `version`・`slash_commands` | `cwd`・`plugins` の `path`・`apiKeySource`・`betas`・`claude_code_version`・`agents`・`output_style`・`capabilities`・`terminal_slash_commands`・`fast_mode_*`・`effort` |
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
| 件数 | MCP サーバー 64、tool 256、スキル 128、プラグイン 64、スラッシュコマンド 256、コマンド 256 | 超えた分を落とし `omitted` に数える |
| `meter` 1 件の直列化後のバイト数 | 64KB 以下 (`BODY_MAX_BYTES` (200,000) の内) | 後ろの要素から落として `omitted` に数える |

- `sdk-agent-session.ts` で、domain に手書きした入力型 (`SessionInitReportInput` / `CommandsChangedInput` / `AuthStatusInput` / `PluginInstallInput`。読むフィールドだけ) と SDK の型の一方向の代入可能性と、`McpStatusKey` (`unknown` を除く) の値域の `Equal<…>` (既存の `sdk-agent-session.ts:91-103` の形) を固定する。SDK の import 文は 1 つに保つ
- **送るかの判定と合流**: 変換後の値を決まった順に直列化した文字列の全体で前回送った値と比べる。同じなら送らない。**基準は実際に送ったときだけ更新する** (`createLiveSignals` の closure。種類ごとに 1 つ)。`init-report` / `commands` は O-4 の `meter` の上限 (1 秒に 20 件。`meter-throttle.ts`) に掛けない。代わりに種類ごとの合流を `live-signals.ts` の closure に置く (`meter-throttle.ts` は使わない。AD-048 Decision 3 の「AD-047 の `meter` の上限に掛けない」に反しない)
  - 窓は 1 秒 (`INIT_REPORT_COALESCE_MS = 1000`。種類ごとに独立)。前に送ってから 1 秒以上たっていれば、届いた値をすぐ送る (leading)
  - 窓の中で届いた値は最新の 1 つだけを保留し、窓の終わりに送る (trailing。最新の値は落とさない)。送る直前に上の判定を掛け、前回送った値と同じなら送らない
  - timer は `deps.clock` (O-4 の `LiveSignalsClock`) で張る。`dispose()` で保留と timer を取り消す (閉じたセッションの `meter` は renderer が捨てるので、保留を最後に送らない)
- **固定テスト**: `METER_UPDATE_TYPES` の集合の pin テストは今は無い (`meter.test.ts`)。本 feature で 8 つ (O-4 の 6 + `init-report` / `commands`) を固定するテストを足す (spec FR-014 の「直す」は「足す」と読む。plan の申し送り #14)。`SESSION_EVENT_KINDS` は変えない
- `init` の `permissionMode` は O-4 がすでに読み、権限モードの比較に使っている (`src/agents/live-signals.ts` の `onSystem` の `init`。014 data-model §2)。`init-report` には載せず、O-4 の扱いを変えない。構成のフィールドは同じ `init` の分岐で読み足す (読むフィールドを足すので、その分岐の「読むのは権限モードだけ」の注記を直す)

### renderer の保持

O-4 data-model §2 の `meters` (`SessionMeters`。`features/session/running-session-types.ts`。書き手は `running-session-store.ts`) に `initReport` (最新) と `commands` (最新) と、スラッシュコマンドの名前の集合の出所 (`'init-report' | 'commands'`) を足す。保持は `Map` / `Object.hasOwn` (名前をキーにする集計を含む)。

**スラッシュコマンドの名前の書式**: SDK の `SlashCommand.name` は先頭の `/` を持たない (`sdk.d.ts:8698`「without the leading slash」)。`init.slash_commands` は `string[]` で書式の記述が無い (`sdk.d.ts:5504`)。両方を同じ形にそろえるため、**先頭の `/` を 1 つ外した形を正規の名前**とする。

- 外す関数 (`normalizeSlashCommandName`) は domain の `session-init-report.ts` に置く。変換 (`toInitReport` の `slashCommands`・`toCommands` の `name`) は名前の形の検査 (§2 の表。`//` を含むものは落ちる) を通した後でこの関数を通す
- renderer の合流の純関数 (FE-001) も、名前の比較と `Map` のキーを同じ関数で作る (decoder を通った値に `/` 付きが残っても引き当てが外れない)
- 表示は `/` + 正規の名前。実機の `init` の書式は quickstart V-3 で確かめる

**スラッシュコマンドの一覧の合流の規則** (正本。spec US-2 AC4 / FR-008。名前は正規の形で比べる):

1. **名前の集合**は、出所の後勝ち。`commands` が届いたら出所を `commands` にする。`init-report` が届いたら、その `slashCommands` が直前に保持していた `initReport.slashCommands` と (並びを含めて) 違うとき、または直前の `initReport` が無いときだけ出所を `init-report` にする。`slashCommands` が同じ `init-report` (MCP の状態・tool・モデルだけが変わった再送) は `initReport` を置き換えるが、出所を変えない
2. **説明と `argumentHint`** は、出所に依らず最新の `commands` から名前で引く (`Map`)。名前が `commands` に無い (または `commands` がまだ無い) コマンドは名前だけを出す
3. 出所が `init-report` のときの名前は `initReport.slashCommands`、`commands` のときは `commands.commands` の `name` の並び

例 (名前は正規の形。表示は `/` を付ける): `init-report` (`a`) → `commands` (`a` 説明つき・`b`) → MCP の状態だけが違う `init-report` (`a`) の後も、一覧は `/a` (説明つき)・`/b` のまま。その後の `init-report` の `slashCommands` が `a`・`c` に変われば、一覧は `/a` (説明つき)・`/c` (名前だけ)。`init` の `slash_commands` が `/a`、`commands_changed` の `name` が `a` でも、同じ `a` として説明を引く。

## §3 構成のタブ (右のペイン。タブの表 `features/shell/panel-tabs.ts` の「概要」「使用量」の後に `init-report` を 1 行。`availableFor: ['none', 'running', 'past']`。`PanelTabId` (`stores/ui.ts`) に `init-report` を足す。部品は `features/shell/InitReportTab.tsx`)

識別子は `init-report` / `InitReportTab` / `initReport*` とし、`config` を使わない (`RunningSession.config` は起動の設定 `SessionLaunchConfig` (`running-session-types.ts:58`) で、Claude Code の報告とは別物。Constitution XIV)。画面の文言は「構成」のまま。

| 節 | 中身 | 0 件 / 外れ |
|---|---|---|
| 状態の時点 | 「ターンの開始時点の状態です」 | — |
| Claude Code が報告したモデル | `initReport.model` (「概要」の「起動時のモデル」(`OVERVIEW_LABELS.model`) と見出しを分ける) | null → 「不明」 |
| MCP サーバー | 名前と状態 (§6)。`failed` / `needs-auth` は注意の印。案内は下 | 「MCP サーバーはありません」 |
| tool | 件数と一覧。MCP の tool はサーバーごとにまとめる (`Map`。§1 の関数) | 「ありません」 |
| スラッシュコマンド | 名前・`argumentHint`・説明 (平文)。一覧は §2「renderer の保持」の合流の規則で作る (説明と hint が無いコマンドは名前だけ) | 「ありません」 |
| スキル / プラグイン | 名前 (と版) | 「ありません」 |
| 省いた数 | `omitted` の合計が 1 以上なら「形の合わない名前・多すぎる分を {n} 件省きました」 | — |

- **注意の印**: `data-attention="true"`・警告のアイコン・`aria-label` に「注意」。`failed` / `needs-auth` だけ (`unknown` は印を付けない)
- **案内**: `needs-auth` → 「このセッションを起動した環境で claude を開き、/mcp で認証してください (Provider が設定ディレクトリを指定している場合は、同じ `CLAUDE_CONFIG_DIR` で開いてください)」。`failed` → 「このセッションを起動した環境で claude を開き、/mcp で詳細を確かめてください」
- 過去 → 「実行中のセッションだけ出ます」、未選択 → O-7 の空の状態、`initReport` がまだ無い → スラッシュコマンドの節 (`commands` があれば) だけを出し、他は「最初のターンの後に出ます」
- **O-7 のタブの表の拡張**: `PanelTab` に `attention?: (sessionId: string) => boolean` を足す (O-7 data-model §4 の影響。AD-046 Decision 4 の「1 か所の表に登録」の形を保つ)。畳んだ帯 (`RightPanel.tsx` の 40px の帯) は `attention` が true のタブのアイコンに印を出す。タブのテストは `RightPanel.tabs.test.tsx` の側に足す (O-4 の分割。`AppShell.test.tsx` に足さない)

## §4 システムイベントの行と承認カードの注記

### 行 (O-2 の `system-event` の category。O-4 data-model §3 と同じ規則。行の組み立ては agents の `live-signals.ts` (O-4 の行の `rowEvent` と同じ場所)、過去ログの変換に足さない。最上位の `auth_status` は今 `sdk-agent-session.ts` の分岐に無いので足す)

| category | 判定 | 行の id | 作る (opens) | `name` | `detail` | `status` |
|---|---|---|---|---|---|---|
| `auth` | `type === 'auth_status'` (最上位の型) | `auth:<連番>` (認証の 1 回の流れ。closure) | `isAuthenticating: true` | '' | '' | `authenticating` → `isAuthenticating: false` で `succeeded`、`error` があれば `failed` |
| `plugin` | `type === 'system' && subtype === 'plugin_install'` | `plugin:<連番>` (`started` から `completed` まで。closure) | `status: 'started'` | '' | 導入できた数 / できなかった数と、最後のマーケットプレイスの名前 (§2 の名前の形の検査) | `started` (既存) → `completed` (失敗が 1 つでもあれば `failed`) |

- **開いた行が無いまま結果が届いたとき** (2026-10-10 承認。pr-gate MD-01。014 data-model §3 の圧縮の行と同じ「結果の状態で行を作る」形):
  - `auth` — `isAuthenticating: false` に `error` があれば、`auth:<連番>` を `opens: true`・`failed` で作り、開いた行は持たない (作って閉じる)。`error` が無い (`succeeded`) なら作らない。始まりの見えない成功は、利用者が手を打つことが無い
  - `plugin` — `installed` / `failed` なら `plugin:<連番>` を `opens: true`・`started` で開き、その 1 件を数える。以後は開いた行と同じ規則で合成し、`completed` で閉じる。`completed` だけなら数 0 / 0 の行を `opens: true`・`completed` で作る。どちらも 1 回の流れで行は 1 つ
- `output` / `error` の文字列は通さない
- `SystemEventStatus` に足すのは `authenticating` だけ (`started` / `succeeded` / `failed` / `completed` は既存。`SYSTEM_EVENT_STATUSES`、`transcript-dto.ts:77`)。category の正本は `SYSTEM_EVENT_CATEGORIES` (`transcript-dto.ts:67`。O-4 の後は `hook` / `task` / `api-retry` / `compaction` / `permission-mode`)
- `system-event.ts:118` の `HOOK_OUTCOMES[m.outcome] ?? 'unknown'` は同じファイルを触るので `Object.hasOwn` に直す
- category と status の集合の固定テスト (`system-event.test.ts:297-309`) を 5 → 7・14 → 15 に直す。`Record<SystemEventCategory, …>` の 2 つの表 (`features/chat/labels.ts` の `SYSTEM_EVENT_CATEGORY_LABELS`・`thread.aui.tsx:1074` の `SYSTEM_EVENT_ICONS`) と `SYSTEM_EVENT_STATUS_LABELS` に行を足す (tsc が漏れを落とす)。`thread.aui.tsx` で触るのはこの表だけで、composer の部分は変えない ([Q2])
- `transcript-dto.ts` の `detail` の注記 (category ごとの中身) に `auth` (常に '') と `plugin` を足す

### 承認カードの `AskUserQuestion` の注記 (正本の文言は §6)

`toolName === 'AskUserQuestion'` (承認の要求の SDK の tool 名) のときだけ出す。表示だけの変更で、承認の応答は変えない。

## §5 対応表の書き換え先 (正本。完了の PR で。経路の列も書き換える)

| 節 | 行 | 割当 | 経路 |
|---|---|---|---|
| A | `init` | `実装済み: 構成のタブ (実行中)`。備考: `cwd`・`path`・`apiKeySource` などは出さない。`permissionMode` は O-4 が権限モードの比較に使う (014 data-model §2。今の備考を残す) | 実行中 |
| A | `plugin_install` | `実装済み: SystemEventRow (実行中)`。備考: アプリの起動では `CLAUDE_CODE_SYNC_PLUGIN_INSTALL` を渡さない (AD-041 (e)) ので通常は届かない。`started` を経ない結果でも行を 1 つ作る (§4) | 実行中 |
| A | `auth_status` (Tier A) | `実装済み: SystemEventRow (実行中)`。備考: `output` / `error` は出さない (U-4)。「認証中」を経ない失敗でも失敗の行を作る。始まりの見えない成功は行にしない (§4) | 実行中 |
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
| shell | `initReportTab` | 構成 |
| shell | `initReportTimepoint` | ターンの開始時点の状態です |
| shell | `initReportLiveOnly` / `initReportAwaitFirst` | 実行中のセッションだけ出ます。 / 最初のターンの後に出ます。 |
| shell | `reportedModel` / `unknownValue` | Claude Code が報告したモデル / 不明 |
| shell | MCP の状態 | 接続済み / 失敗 / 認証が必要 / 接続中 / 無効 / 不明 |
| shell | `mcpNeedsAuth` | このセッションを起動した環境で claude を開き、/mcp で認証してください (Provider が設定ディレクトリを指定している場合は、同じ CLAUDE_CONFIG_DIR で開いてください)。 |
| shell | `mcpFailed` | このセッションを起動した環境で claude を開き、/mcp で詳細を確かめてください。 |
| shell | 節の 0 件 | MCP サーバーはありません / ありません |
| shell | `initReportOmitted` | 形の合わない名前・多すぎる分を {n} 件省きました。 |
| shell | `attention` | 注意 |
| chat | MCP の表示 | 入力 / 結果 / サーバー名は推定 |
| chat | `AskUserQuestion` の表示 | 複数選択 / 選ばれた回答 |
| session | `askUserQuestionNotice` (承認カード) | このアプリからは回答を送れません。許可しても選択は Claude に届きません。拒否して、本文で答えてください。 |
| chat | システムイベントの行 | Claude Code が認証中です。セッションを起動した環境の端末で claude にログインしてください / 認証しました / 認証に失敗しました (再ログインしてください) / プラグインのマーケットプレイスを導入中 / 導入しました ({n} 件) / 導入に失敗しました ({n} 件) |
