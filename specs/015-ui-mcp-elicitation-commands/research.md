# Research: MCP・プラグイン・コマンドの表示 (O-5)

調べた日: 2026-10-04 (夜間の自走。R-01〜R-04) / 2026-10-09 (main (faafe91) への載せ直しの /cl-plan。R-05〜R-08 と、R-01〜R-04 の今のコードとの突き合わせ)

SDK は `@anthropic-ai/claude-agent-sdk` ^0.3.270 (`package.json:30`)。行番号は `node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts`。

## R-01 応答の仕組み (SDK 0.3.270) と範囲の分割 (U-1)

- `AskUserQuestion`: 入力型 `AskUserQuestionInput` の `answers` は「User answers collected by the permission component」(`sdk-tools.d.ts:2605-2609`)。ホストは `canUseTool` で `{ behavior: 'allow', updatedInput: { ...input, answers } }` を返して回答する。今のアプリの `toPermissionResult` は `{behavior}` / `{behavior, message}` だけを返し、`updatedInput` を型として持たない (`agent-session.ts`、AD-036 Decision 4)。許可しても回答は届かない
- Elicitation: `Options.onElicitation` (`sdk.d.ts:1626`)。無ければ自動で断られる。form (JSON Schema) と URL (ブラウザで認証) の 2 つの形。`elicitation_complete` は URL の形の完了の通知
- `request_user_dialog`: `Options.onUserDialog` と `supportedDialogKinds` (:1628-1662)。宣言しない種類は既定の振る舞いに倒れる (fail closed)
- **Decision**: O-10 に分ける (spec U-1 / AD-048 Decision 1)
- **Rationale**: 3 つとも承認済みの ADR の境界 (承認の応答の形・options のキーの集合) の読み替えが要り、入力の検証と秘密の入力 (Elicitation の form) の設計が要る。表示の feature と分けると、それぞれの gate のレビューの範囲が絞れる
- **Alternatives**: O-5 に入れる (FR が 20 を超える。AD-048 Alternatives)

## R-02 構成の出所

- `init` は「Session metadata the CLI emits at the start of each turn」(`sdk.d.ts:5479-5481`)。`mcp_servers` は `{ name, status: string }` (:5495-5498)。`status` の値域は `McpServerStatus.status` (`connected` / `failed` / `needs-auth` / `pending` / `disabled`。:1135)
- `plugins` の `version` は「plugin-author-controlled — validate before trusting」(:5516)。`path` はパス (:5513)
- `commands_changed` は「Clients should REPLACE their cached command list」(:3447)。`SlashCommand` は `name` / `description` / `argumentHint` / `aliases?` (:8696-8713)
- 今の main: `live-signals.ts:366-370` の `init` の分岐は `permissionMode` だけを読む (O-4)。`commands_changed` / `plugin_install` の分岐は無い
- **Decision**: O-4 の `meter` に `init-report` / `commands` を足す (AD-048 Decision 3)。構成のフィールドは同じ `init` の分岐で読み足す。`mcp_status` は呼ばない (Decision 2)
- **Alternatives**: 新しい `SessionEvent` の種類 (AD-048 Alternatives)

## R-03 MCP の tool の表示

- 今は `tool-registry.aui.tsx:22-33` の表に無い名前はすべて ToolFallback。表の照合は `TOOL_DISPLAY[props.toolName] ?? ToolFallback` (:36) で、`constructor` などの名前で `Object.prototype` の関数が返る (O-4 design-gate security M-001)
- 実行中の tool 名は `live-message.ts:61` で `sanitizeBody` を通る。過去ログは `transcript.ts:233` で通らない
- **Decision**: 名前の純関数 (data-model §1) で MCP を判定し、専用の `McpToolCall` に回す。表の照合を `Object.hasOwn` に直す。過去ログの tool 名を `sanitizeBody` に揃える
- 結果: MCP の tool の結果は text と画像・resource のブロック。表やグラフへの写しは推測になるので行わない (U-5)
- element: registry に MCP の tool の専用 element があるかを実装の最初に確かめる (Principle XIII。F 節の MCP server panel / MCP config dialog は構成と操作の element で、tool の呼び出しの element ではない)

## R-04 認証とプラグインの出来事

- `auth_status` は最上位の型 (`type: 'auth_status'`。:3413-3420) で `isAuthenticating`・`output: string[]`・`error?`。今の `sdk-agent-session.ts:551-614` の `switch (message.type)` に分岐が無く、`default` で捨てている
- `plugin_install` は `system` の subtype (:5216-5224)。`CLAUDE_CODE_SYNC_PLUGIN_INSTALL` のときの進み具合 (`started` / `installed` / `failed` / `completed`、`name?` はマーケットプレイスの名前)
- **Decision**: O-2 のシステムイベントの行に `auth` / `plugin` を足す。組み立ては O-4 の `live-signals.ts` の `rowEvent` (:70-86) と同じ場所。`output` / `error` は出さない (U-4)

## R-05 transcript の element に表示中のセッションの MCP サーバー名を渡す経路

- 背景: `parseMcpToolName` の `knownServers` は表示中のセッションの構成から引く (data-model §1)。transcript の element (`components/assistant-ui/elements/`) は過去ログと実行中で共有され、session のストアを import しない
- 既存の形: O-4 が tool の経過時間を `LiveProgressContext` (`features/chat/transcript-context.ts:40-79`) で渡している。購読元は実行中のペイン (`LivePane.tsx:224`) が作り、過去ログは null。読む側は `useSyncExternalStore` で自分の値だけを購読する
- **Decision**: `LiveProgressSource` に `mcpServerNames()` を足し、`useLiveMcpServerNames()` を同じファイルに置く。新しい context を作らない
- **Rationale**: 購読元・null の意味 (過去ログ)・購読の粒度が経過時間と同じ。context を増やすと `LivePane` の Provider が増え、テストの setup も増える
- **Alternatives**: 新しい `McpServerNamesContext` (値を直接渡す。`initReport` が替わるたびに MCP の表示がすべて描き直される) / element が稼働中のストアを直接読む (chat が session を import する。今の向きに反する)

## R-06 項目 16 の P3 を広げたことの固定のしかた

- 照合は項目の単位である (`[VIOLATE] #16`。`tests/rule-fixtures/expected.mjs` の `rules`)。fixture がどのメソッドで発火したかを見ない
- 既存の `b-equivalent/sdk-query-mutation-method.ts.fixture:13` は `q.setPermissionMode('bypassPermissions')` で、昇格値のリテラルでも項目 16 が発火する。メソッドの列挙から `setPermissionMode` を消しても緑のまま
- `QUERY_MUTATION_METHODS` (`allowlists.mjs:420-427`) の集合の pin テストは無い。`QUERY_OPTION_KEYS` には pin テストがある (`session-core.test.ts:198`)
- 出所: spec 016 (O-6。stale な branch の設計) の design-gate R2 platform-boundary M-102 が、O-5 の旧 tasks (fixture 1 本に 2 つの呼び出し) を同種事象として名指した
- SDK 0.3.270 の `Query` (`sdk.d.ts:2611-2972`) の自前のメソッドは 29 個。`interrupt`・今の 6 個・AD-048 Decision 2 の 11 個のどれにも入らないうち、`reloadOutputStyles` (:2856。agents・skills・routines のディレクトリを読み直させる = スキルの操作) と `backgroundTasks` (:2962。実行中のタスクの状態を変える) は変更系である。残りの 9 個 (`initializationResult`・`supportedCommands`・`supportedModels`・`supportedAgents`・`getContextUsage`・`usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET`・`readFile`・`accountInfo`・`close`) は読み取りか後始末で、アプリは呼ばない (design-gate R2 H-03 / platform-boundary H-101)
- `package.json` は `^0.3.270` なので、名前の列挙だけでは SDK の版上げで増えたメソッドが黙って通る
- **Decision**: (1) `QUERY_MUTATION_METHODS` に AD-048 Decision 2 の 11 個と、AD-036 §4 P3 (`interrupt` だけ) そのものを根拠に `reloadOutputStyles` / `backgroundTasks` を足す (6 → 19)。後の 2 つは P3 の範囲内の締め付けなので ADR は要らず、AD-048 の本文も変えない。集合の pin テスト (19 個。並びを問わない。置き場は `allowlists.mjs` を読む既存のテスト `tests/docs/wsl-free-coverage.test.ts` と同じ `tests/docs/`) を足し、「**外す**には ADR が要る (足すのは AD-036 §4 P3 の範囲内で ADR 不要)」と注記する (2) `sdk-agent-session.ts` の型の一致の並び (`:91-108`) に `keyof Query` の網羅を置く。`Query` の自前のメソッド (`Exclude<keyof Query, keyof AsyncGenerator<SDKMessage, void>>`) を `'interrupt'`・変更系 (`QUERY_MUTATION_METHODS` と同じ 19 個の union)・呼ばない読み取り (上の 9 個の union) の 3 つに分け、`Equal<Exclude<自前のメソッド, 3 つの union>, never>` と、3 つの union が `keyof Query` の部分集合であることを固定する。SDK の版上げでメソッドが増減すると tsc が落ち、分類を決め直す (変更系なら (1) の集合と pin テストも同じ PR で足す) (3) 違反の fixture は `b-equivalent/` に 1 本、新しく足すメソッドの 1 つ (`.reconnectMcpServer(`) だけを呼び、他の項目 16 の綴り (昇格値・昇格キー) を含めない (4) 既存の fixture の引数を `'default'` に替える (P3 だけで発火することを確かめる形にする)
- **Rationale**: 集合の退行は pin テストが、検出器が新しい名前に効くことは fixture が、SDK の `Query` の増減は型の網羅が示す。13 本の fixture は検出器の同じ正規表現を 13 回確かめるだけになる
- **Alternatives**: メソッドごとに 11 本の fixture (費用に対して得るものが pin テストと重なる) / `queryHandle` の型を `Pick<Query, 'interrupt'> & AsyncIterable<SDKMessage>` に絞る正の形 (016 R2 M-101 の推奨 3。項目 16 の正の形への置き換えと一緒に持ち主へ送る。spec FR-011)

## R-07 URI の要約の最後のパスの要素

- spec 016 の design-gate R2 security M-001: 「host と最後のパスの要素を出す」規則は、Slack / Discord の webhook や `/bot<token>/` のように末尾が秘密の URL を見出しに出す。O-5 の同じ規則 (旧 data-model §1) を名指して申し送った
- MCP の resource の URI は `file://` / `github://` / 独自の scheme が多いが、サーバーの作者が決めるので形は保証されない
- **Decision**: 最後の要素はファイル名らしい形 (data-model §1) のときだけ出す。外れたら scheme と host だけ。spec の「scheme・host・最後のパスの要素だけ」(Q3 (a)) を狭める向きで、出す要素を増やさない
- **Rationale**: Q3 (a) の推奨案の理由 (「秘密を出さない安全側の形」) に合わせる。見出しから要素を落とすだけで、spec の FR・AC の字面は変わらない
- **Alternatives**: URI を全く出さない (Q3 の選択肢 B。利用者が B を選んだらこちら) / 末尾をそのまま出す (秘密が出る)

## R-08 新しいモジュールに追加の義務を課す実名リスト

- `eslint.config.mjs:588-594` — 手書きの Tier A の element の一覧 (`GENERATED_FILES` (:73-77) は `components/**` の lint を緩めるので、手書きの element はここに足して番人を戻す)。`mcp-tool-call.aui.tsx` / `ask-user-question.aui.tsx` を足す
- `.specify/spec-gate/reviewers.yml:54-64` / `:107-117` — a11y / ux reviewer の elements/ の手書きの表示の一覧 (「新しい手書きの element を足したらここにも足す」:53)。同じ 2 つを足す
- `.specify/spec-gate/reviewers.yml:183-188` — ui-coverage reviewer の domain の SDK 変換のモジュール (`meter*.ts` など)。`src/domain/session/session-init-report*.ts` を足す (`meter*` の glob に当たらない)
- `.dependency-cruiser.js` — renderer の elements / features の実名の規則は無い (0 件)。`scripts/constitution/allowlists.mjs` — 足す義務は `QUERY_MUTATION_METHODS` (R-06) だけ。`AGENT_SDK_ALLOWED_CALLS` (:379) と `QUERY_OPTION_KEYS` (`session-core.ts`) は変えない
- **Decision**: 上の 3 か所を同じ PR で直す (plan の申し送り #16〜#18)
