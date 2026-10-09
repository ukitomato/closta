# Tasks: MCP・プラグイン・コマンドの表示 (O-5)

**Input**: [spec.md](./spec.md) / [plan.md](./plan.md) / [data-model.md](./data-model.md) / [research.md](./research.md) / [quickstart.md](./quickstart.md)

**記法**: `[BE]` domain / agents / scripts、`[FE]` renderer、`[SH]` 横断 (docs・規則・通しのテスト・検証)。main と preload は変えない (SC-005)。行末の `[P]` は、同じ節 (`##`) の中で、それより前の `[P]` の無いタスクが済んでいれば他の `[P]` と並行に進めてよいもの (主に別のファイルで、互いに依らない。implementer は `[P]` でも直列に進める)。targets=both の Backend / Frontend / Shared の区分はタグと末尾の索引 (`Backend Tasks (index)` ほか) で示す (User Story ごとの節を保つため)。

**規則の正本**: 振る舞いの正本は spec の FR / SC。名前の解き方・URI の要約・承認カード・構成の許可リストと形の検査と送るかの判定・renderer の保持・タブ・行・注記・対応表の書き換え先・文言の正本は data-model (§1〜§6)、方式の理由は research (R-01〜R-08)、申し送りの処理は plan の「上流からの申し送り」表 (#1〜#21)。本書は作業単位とテストの観点だけを書く。テストは spec の SC が計測経路として名指すので各タスクに含める。行番号は 2026-10-09 の main (faafe91) のもので、前のタスクでずれていたら Grep で引き直す。

**着手の条件**: 次の 2 つがそろうまで `/cl-implement` を始めない。
1. design-gate の PASS (status `implementing`)
2. spec の「未承認」の 3 点 (`.needs-input.md` Q1〜Q3) を利用者が承認していること。O-5 は design-gate で止める (plan RK-01)。本書は推奨案 A を仮採用して書いてある。A で承認されたら spec.md の「未承認」の印を外して始める。A 以外の回答なら、`[Q1]` / `[Q2]` / `[Q3]` の印の付いたタスクと spec・data-model の該当箇所を先に直し、design-gate を通し直してから始める

O-7 (PR #13)・O-3 (PR #14)・O-4 (PR #15) はマージ済み。U-1〜U-7 と AD-048 の accepted は 2026-10-05 に承認済み。実機の確認 (quickstart V-3) は利用者の作業で、実装を止めない。

**順序の制約**: SH-001 (glossary) → コード。SH-002 (element の照合) → FE-012 / FE-013 / FE-021。土台 (BE-001 → BE-002 → FE-001) → US-1〜US-3。US-3 の BE-030 (category の追加) と FE-030 (`Record<…>` の表) は同じ節の中で続けて行い、節の終わりで型検査が通る。境界の検査 (BE-040) は US-1〜US-3 と独立。Polish の SH-010〜SH-013 は US-1〜US-3 の後、SH-014 (検証) が最後。

## 先行

- [ ] **SH-001** [SH] **glossary を追随させる** (Principle XIV。spec FR-015。plan Domain Context の「新しく足す」): `docs/glossary.md` に MCP の tool の表示 (`mcp__<server>__<tool>` と組み込みの 4 tool、サーバー名の推定の印)・セッションの構成 (`SessionInitReport`。Claude Code が報告した構成。Counterexample「`SessionLaunchConfig` (起動の設定で選んだ構成) とは別物」)・O-10 の範囲 (問いに答える UI と composer のコマンドの候補) を足す。Meter の定義の「種類は 6 つ」を 8 つに、「運ぶのは数・真偽・列挙・モデルの id・形を検証した tool の id だけ」に「形の検査を通った未信頼の名前と、無害化して切り詰めた説明 (AD-048 Decision 3)」を足す。System event row の category に `auth` / `plugin` を足し、Ref に data-model §4。大きいファイルなので足す位置を Grep で決めてから Read する [P]
- [ ] **SH-002** [SH] **element を照合する** (Principle XIII。research R-03 / plan Constitution Check XIII): registry の MCP の tool の呼び出しの element (あれば)・MCP server panel・Question flow を `npx assistant-ui@latest add …` で取り込み (O-4 の SH-002 と同じ方法)、実名で照合する。不採用の条件: 本番の CSP (`style-src 'self'`) の下で動かない・生の HTML / iframe / `frame-src` が要る・遠隔の取得・操作のボタンの配線が要る・文言を日本語の props にできない・新しい npm の依存が要る。MCP config dialog と Elicitation form は取り込まず、使わない理由 (操作しない (AD-048) / O-10) だけを記録する [P]
  - 採るなら `components/assistant-ui/elements/` に置く (手を入れたら SH-011 で eslint と reviewers.yml の一覧に足す)。採らないなら取り込んだファイルを消し、表示は既存の部品で作る。FE-012 / FE-013 / FE-021 はこの結論で作り方を決める
  - 照合の結果 (候補名と採る・採らないの理由) の正本は PR の説明。対応表の F 節の使い道 (data-model §5 の MCP server panel の行。SH-010) は写し

## 土台 — 構成の契約と renderer の受け口 (domain・renderer)

**Goal**: `meter` の種類 `init-report` / `commands` の型・形の検査・変換・decoder と、稼働中のストアの保持 (spec FR-007 / FR-008。data-model §2)。この節の終わりで振る舞いは今のまま (agents はまだ送らない)。

**Independent Test**: domain の単体 (変換と decoder) と、decoder とストアの単体。既存の `meter.test.ts` / `agent-session.kinds.test.ts` / `running-session-store.test.ts` が書き換えずに通る (`METER_UPDATE_TYPES` の新しい pin テストを除く)。

- [ ] **BE-001** [BE] `src/domain/session/session-init-report.ts` (+ `session-init-report.test.ts`。新設) — data-model §2: `init-report` / `commands` の型 (`McpStatusKey` は 5 値 + `unknown`)、読むフィールドだけの入力型 (`SessionInitReportInput` / `CommandsChangedInput` / `AuthStatusInput` / `PluginInstallInput`)、形の検査の定数 (名前の 2 つの allowlist・`version`・件数の上限 (64 / 256 / 128 / 64 / 256 / 256)・64KB) と検査の純関数 (agents と decoder で共有)、変換 (`toInitReport(input)` / `toCommands(input)`。許可リストのフィールドだけで新しい object を組む)、decoder (`decodeInitReport(unknown)` / `decodeCommands(unknown)`)、送るかの判定に使う決まった順の直列化。`model` は O-4 の `modelId` の検査 (`meter.ts` の `toModelMeters` と同じ関数) を通す。`status` は `Object.create(null)` + `Object.hasOwn` の表 (`transcript-guard.ts` の方式)。説明は `sanitizeBody` を通し Cc / Cf / Zl / Zp を除いて 1 行に正規化し 200 / 64 コードポイントで切り詰める。SDK を import しない [P]
  - テスト (SC-002): 通さないフィールド (`cwd`・`plugins[].path`・`apiKeySource`・`betas`・`capabilities`・`claude_code_version`・`agents`・`output_style`・`terminal_slash_commands`・`aliases`) に目印の値を入れて出力の直列化に 0 件、名前の allowlist の外 (制御文字・tag 文字 U+E0000〜・U+2028・空白入り・`//`・129 文字) が落ちて `omitted` に数える、`version` の形 (外れたら null)、件数の上限 (MCP サーバー 65 件で 64 件と `omitted` 1)、バイト数の上限 (後ろの要素から落とす)、`status: '__proto__'` / `constructor` / `toString` / 知らない値で `unknown`、説明の Cc / Cf / Zl / Zp と長さ、`model` が形に通らないと null、知らない形・型の違いで decoder が null。どれも例外を出さない。直列化はキーの順に依らず同じ値で同じ文字列
- [ ] **BE-002** [BE] `src/domain/session/meter.ts` (+ `meter.test.ts`) — `MeterUpdate` に `init-report` / `commands` の 2 種類を足し、`METER_UPDATE_TYPES` を 6 → 8 に。`decodeMeterUpdate` の switch から BE-001 の decoder を呼ぶ。`SESSION_EVENT_KINDS` (`agent-session.ts`) は変えない
  - テスト: `METER_UPDATE_TYPES` の集合の pin テストを足す (今は無い。spec FR-014 の「直す」は「足す」と読む。plan 申し送り #14)。値の集合で 8 つを固定し「集合を変えるには ADR が要る (AD-047 / AD-048)」と注記する。`decodeMeterUpdate` が 2 種類を通し、余分なキーを運ばない。`agent-session.kinds.test.ts` が書き換えずに通る
- [ ] **FE-001** [FE] **構成の受け口** — `features/session/running-session-types.ts` / `running-session-store.ts` (+ `running-session-store.test.ts`) / `session-event-decoder.ts` (+ test) — data-model §2「renderer の保持」: `SessionMeters` に `initReport` (最新)・`commands` (最新)・スラッシュコマンドの名前の集合の出所を足し、`applyMeter` に 2 つの枝 (data-model §2 の合流の規則。`slashCommands` が前回の `initReport` と同じ `init-report` は出所を変えない)。一覧を組む純関数 (名前の集合 + 最新の `commands` から名前で引いた説明と `argumentHint`) を同じファイルに置き、FE-021 が使う。`session-event-decoder.ts` の本体は変えない (`decodeMeterUpdate` が新しい種類を通す)。保持は O-4 の規則のまま (永続化しない・閉じたら捨てる・`receivedMessages` に数えない・`sessions[id]` が無い `meter` は捨てる)
  - テスト: decoder (2 種類の正例、負例: 形の外れ・257 件・`status: '__proto__'`・型の違い・余分なキー)、ストア (`init-report` の後の `commands` で一覧が置き換わる、`commands` の後に MCP の状態だけが違う (`slashCommands` が同じ) `init-report` が来ても一覧と説明・`argumentHint` が変わらない、`commands` の後に `slashCommands` が変わった `init-report` で名前の集合が置き換わり、`commands` にある名前は説明と hint を保ち、無い名前は名前だけ、`commands` が無いまま `init-report` だけなら名前だけ、`commands` の名前 `__proto__` / `constructor` で例外が出ない、`initReport` の更新で `sessions` の参照が変わらない、2 つのセッションの値が混ざらない、閉じた後の `meters[id]` が undefined、`meter` が `receivedMessages` を増やさない)

## US-1 — MCP の tool の呼び出しと Claude からの問いが読める (P1)

**Goal**: MCP の tool と `AskUserQuestion` の専用の表示、承認カードの生の名前と注記、過去ログの tool 名の無害化 (spec FR-001〜FR-006)。

**Independent Test**: 名前の純関数の単体と、tool の表示と承認カードの component テスト (過去ログと実行中の fixture。SC-001)。

- [ ] **BE-010** [BE] `src/domain/session/transcript.ts` (+ `transcript.test.ts`) — `:233` の過去ログの tool 名を実行中 (`src/agents/live-message.ts:61`) と同じ `sanitizeBody` に通す (spec FR-001。plan 申し送り #13)。`sanitizeBody` の集合は変えない (spec「義務の扱い」)。テスト: U+202E とゼロ幅を含む `mcp__a__b` の過去ログの fixture で、tool 名から落ちる。空の名前は今のまま `(unknown tool)` [P]
- [ ] **FE-010** [FE] `features/chat/mcp-tool-name.ts` (+ `mcp-tool-name.test.ts`。新設) — data-model §1「名前の解き方」と「URI の要約」[Q3]: `parseMcpToolName(name, knownServers)` (表の各行。最長一致の比較は `Set` / 配列で、prototype のキーに依らない)・2 層目の無害化 (制御文字・双方向制御・ゼロ幅)・`summarizeResourceUri(uri)` (WHATWG URL・256 文字・最後のパスの要素はファイル名らしい形のときだけ。`mayCarrySecret` は domain の `system-event.ts` から import)・見出しの組み立て (`{server} › {tool}`・64 文字の切り詰め) [P]
  - テスト (SC-001): 表の各行 (`a` と `a__b` の両方があるとき `mcp__a__b__c` → `a__b` › `c`、`a` だけなら `a` › `b__c`、同じ長さで複数・構成が無い・どれにも一致しない → 推定、`mcp__x` → server null)、非 MCP の名前 (`mcp_x`・`MCP__a__b`・`xmcp__a__b`・`constructor`) で null、組み込みの 4 tool の `server` の形の検査。URI: `https://u:p@h/x`・`postgres://user:pw@db/t`・`?access_token=`・`#frag` で userinfo / query / hash が出ない、`https://hooks.slack.com/services/T000/B000/XXXXXXXXXXXXXXXXXXXXXXXX`・`https://api.telegram.org/bot123:ABC/x`・`%` を含む末尾・英数字 20 文字以上の末尾で末尾を出さない、`file:///a/b/readme.md` で `readme.md`、読めない URI と 257 文字で出さない
- [ ] **FE-011** [FE] **表示中のセッションの MCP サーバー名の購読** — `features/chat/transcript-context.ts` / `features/session/LivePane.tsx` (research R-05 / data-model §1): `LiveProgressSource` に `mcpServerNames(): readonly string[]` を足し、`useLiveMcpServerNames()` を同じファイルに置く (新しい context を作らない)。`LiveSessionPane` が `meters[sessionId].initReport` の `mcpServers` の名前から作り、snapshot は `initReport` が替わるまで同じ参照を返す。過去ログ (`ChatScreen`) は購読元が null で空の配列 (同じ参照)。テスト: `initReport` の無関係な `meter` (`context` など) の更新で snapshot の参照が変わらない、`initReport` の更新で変わる、購読元が null で空
- [ ] **FE-012** [FE] **MCP の tool の表示と振り分け** — `components/assistant-ui/elements/mcp-tool-call.aui.tsx` (+ test。新設) / `tool-registry.aui.tsx` (+ `tool-registry.aui.test.tsx`。新設) / `features/chat/labels.ts` — data-model §1「振り分け」「transcript の見出し」「中身」/ §6 の chat の MCP の行: 振り分けを 2 段に (`:22-36`。完全一致の表を `Object.hasOwn` で照合し、組み込みの 4 tool を `McpToolCall` に登録 → `parseMcpToolName` が `mcp` なら `McpToolCall` → ToolFallback。AD-048 Decision 5)。`McpToolCall` は見出し (サーバー名 › tool 名、推定の印、resource の tool は URI の要約。入力の値を見出しに出さない)・閉じた入力の JSON (`argsText`)・`<pre>` の平文の結果 (MarkdownText に通さない)・エラーと切り詰めの印 (既存の `ToolResultMarks`)・状態の印 (data-model §1「状態の印」。状態のアイコン・中断の印・経過時間を ToolFallback と同じ関数・部品で出す。切り出すときは ToolFallback の DOM を変えない)。サーバー名は FE-011 の `useLiveMcpServerNames()`。画像・resource の印は出さない (U-7)。Data table / Chart などに写さない (U-5)。SH-002 で採った element があればその部品で描く
  - テスト (component。vitest-axe。US-1 AC1〜AC5 / AC9・Edge Cases の分けられない名前): 過去ログと実行中の fixture で同じ DOM、状態の 3 つの fixture (結果待ちで経過時間あり・`requires-action`・`incomplete` の cancelled とエラー) で ToolFallback と同じ状態のアイコン・中断の印・経過時間が出る、見出しにサーバー名と tool 名が分かれる、入力が閉じている、結果が平文 (`**x**` が強調にならない)、エラーの印、切り詰めの印、resource の tool の見出しに URI の要約、`mcp__a__b__c` の最長一致と推定の印。振り分けの回帰: 既存の 8 つの名前が同じ部品に行く、`mcp_x`・`MCP__a__b`・`xmcp__a__b`・`constructor`・`__proto__`・`toString` で ToolFallback (SC-001)
- [ ] **FE-013** [FE] **`AskUserQuestion` の読み取り専用の表示** — `components/assistant-ui/elements/ask-user-question.aui.tsx` (+ test。新設) / `tool-registry.aui.tsx` (完全一致の表に 1 行) / `features/chat/labels.ts` — data-model §1「`AskUserQuestion` の読み取り専用の表示」/ §6 の chat の問いの行: 問いごとに `header` のチップ・`question`・選択肢の `label` と `description` (`preview` は出さない)・`multiSelect` の印。入力に `answers` があれば問いの文をキーに `Map` で引いて選ばれた選択肢を強調する。形が合わなければ ToolFallback と同じ JSON の表示に倒す。状態の印は FE-012 と同じ (data-model §1「状態の印」)。回答の入力は出さない (O-10)。FE-012 の後 (同じ `tool-registry.aui.tsx` を触る)
  - テスト (component。vitest-axe。US-1 AC7 / AC9): 問い・見出し・選択肢と説明が出る、状態の 3 つの fixture (結果待ちで経過時間あり・`requires-action`・`incomplete` の cancelled とエラー) で ToolFallback と同じ状態の印が出る、`answers` のある過去ログで選ばれた選択肢が分かる、`answers` のキーが問いに無い・`__proto__` のキーで例外が出ない、形の外れた入力で JSON の表示、ボタンや入力欄が DOM に無い
- [ ] **FE-014** [FE] **承認カード** — `features/session/ApprovalCard.tsx` (+ `ApprovalCard.test.tsx`) / `LivePane.tsx` / `features/session/labels.ts` — data-model §1「承認カード」/ §4「承認カードの `AskUserQuestion` の注記」/ §6 の session の行: `mcpServerNames` の props (`LivePane` が FE-011 と同じ一覧を渡す)。MCP の tool なら 1 行目に生の `toolName` を切り詰めずに等幅・`break-all`、2 行目に補助の見出し (推定の印つき)。`toolName === 'AskUserQuestion'` なら `askUserQuestionNotice` (`session/labels.ts` から取る。`ApprovalCard.tsx` に直書きの文言を増やさない)。それ以外の tool は今のまま。承認の応答 (`toPermissionResult`) は変えない
  - テスト (component。vitest-axe。US-1 AC6 / AC8): 200 文字の MCP の tool 名が DOM に全文で出る (SC-001)、サーバー `a` と `a__b` の曖昧なケースで補助の見出しが最長一致・名前が無いと推定の印、`AskUserQuestion` で注記が出る、MCP でない tool (`Bash` など) のカードの DOM が今のまま、「許可」「拒否」の応答の値が今のまま

## US-2 — セッションの構成が分かる (P1)

**Goal**: `init` / `commands_changed` を `meter` で送り、右のペインの「構成」のタブと畳んだ帯の注意の印に出す (spec FR-007〜FR-009)。

**Independent Test**: 変換の単体 (`init` / `commands_changed` → `meter`)、構成のタブ・帯の印の component テスト、経路の通しのテスト (SC-002 / SC-003)。

- [ ] **BE-020** [BE] `src/agents/live-signals.ts` (+ `live-signals.test.ts`) / `sdk-agent-session.ts` (+ `sdk-agent-session.test.ts`) — data-model §2「送るかの判定」と research R-02: `onSystem` の `init` の分岐 (`:366`) で、O-4 の権限モードの比較はそのままに、BE-001 の `toInitReport` で構成を読み足して `meter` の `init-report` を送る。`commands_changed` の分岐を足して `commands` を送る。送るかは変換後の値の直列化の全体で前回と比べ、基準は実際に送ったときだけ更新する (`createLiveSignals` の closure。種類ごとに 1 つ)。O-4 の間引き (`meter-throttle.ts`) に掛けない。分岐の「読むのは権限モードだけ」の注記を直す。`sdk-agent-session.ts` の `:91-103` の並びに、入力型 (BE-001) と SDK の型の一方向の代入可能性と `Equal<Exclude<McpStatusKey, 'unknown'>, McpServerStatus['status']>` を足す。SDK の import 文は 1 つに保つ (`:4-13`)。`AGENT_SDK_ALLOWED_CALLS`・`QUERY_OPTION_KEYS` の差分 0 [P]
  - テスト (SC-002): 名前は同じで状態だけが変わった 2 回目の `init` が送られる、同じ長さの別のモデルが送られる、同じ内容の `init` / `commands_changed` は送られない、送らなかった回の後で基準が変わらない、1 秒に 21 回以上の `init` でも間引かれない、O-4 の権限モードの比較のテスト (BE-040 の `init` の観点) が書き換えずに通る、`init` の通さないフィールドに目印の値を入れて emit した `SessionEvent` の文字列に 0 件、`commands` の `aliases` も 0 件。状態通知 (`SessionStatusUpdate`) に載らない
- [ ] **FE-020** [FE] **タブの表と畳んだ帯の印** — `features/shell/panel-tabs.ts` (+ `panel-tabs.test.ts`) / `src/renderer/src/stores/ui.ts` / `RightPanel.tsx` (+ `RightPanel.tabs.test.tsx`) / `features/shell/labels.ts` — data-model §3「O-7 のタブの表の拡張」: `PanelTabId` に `config`、タブの表の「使用量」の後に `config` を 1 行 (`availableFor: ['none', 'running', 'past']`・lucide のアイコン・`attention` は表示中の稼働中のセッションの `initReport` に `failed` / `needs-auth` があるか)、`PanelTab` に `attention?: (sessionId: string) => boolean`。畳んだ帯 (40px) は `attention` が true のタブのアイコンに注意の印 (`data-attention="true"`・警告のアイコン・`aria-label` に「注意」)。`panel-tabs.ts:11` と `stores/ui.ts:26` の「O-5 の Server panel」の注記を済んだ形に直す (plan 申し送り #9)。tablist のキー操作は O-4 のもの (014 FR-017) を変えない [P]
  - テスト: `RightPanel.tabs.test.tsx` に足す (`AppShell.test.tsx` に足さない)。3 つの本物のタブ (概要・使用量・構成) で ←/→・Home / End・`tabIndex`、`failed` / `needs-auth` で畳んだ帯の印が出る・`unknown` / `pending` で出ない・別のセッションの状態で出ない (US-2 AC5)、vitest-axe
- [ ] **FE-021** [FE] **構成のタブ** — `features/shell/ConfigTab.tsx` (+ `ConfigTab.test.tsx`。新設) / `features/shell/labels.ts` / `OverviewTab.tsx` — data-model §3 の表と §6 の shell の行: 状態の時点・Claude Code が報告したモデル・MCP サーバー (名前・状態・注意の印・案内)・tool (件数と一覧。MCP の tool はサーバーごとに `Map` でまとめる。FE-010 の関数)・スラッシュコマンド (名前・`argumentHint`・説明。平文。markdown・自動リンクにしない。一覧は FE-001 の合流の純関数で組む)・スキル・プラグイン (名前と版)・省いた数。過去・未選択・`initReport` がまだ無いときの出し分け。値は `useSessionMeters` で表示中のセッションだけを読む。`OverviewTab.tsx:86` と `labels.ts:85` の「実行中のモデルの変化は O-5」の注記を「構成のタブ」に直す (plan 申し送り #10。「概要」の「起動時のモデル」は変えない)。SH-002 で MCP server panel を採ったならその部品で描く
  - テスト (component。vitest-axe。US-2 AC1〜AC4 / AC6 / AC7): 各節が出て「ターンの開始時点の状態です」が出る、`failed` / `needs-auth` の注意の印と案内の文言、状態だけが変わった更新で印が変わる、`commands` で一覧が置き換わり説明と `argumentHint` が出る、その後に MCP の状態だけが違う `init-report` が届いても説明と `argumentHint` が消えない、`slashCommands` の変わった `init-report` で名前の集合が置き換わる (data-model §2 の例)、0 件の節で「ありません」・モデルが null で「不明」・`unknown` で「不明」かつ印なし、過去で `configLiveOnly`・未選択で O-7 の空の状態・`initReport` が無いと `configAwaitFirst`、サーバー名 `constructor` / `toString` / `hasOwnProperty` / `__proto__` の集計で例外が出ず表示される、`omitted` の合計で `configOmitted`、説明の `https://…` が `<a>` にならない、2 つのセッションを切り替えて値が混ざらない
- [ ] **SH-020** [SH] **経路を 1 本通すテスト** (SC-002) — `tests/meter/meter-through.test.tsx` に足す (O-4 の形): `init` / `commands_changed` の fixture → `live-signals` → `JSON.stringify` → 偽の port → decoder → 稼働中のストア → DOM (構成のタブ・畳んだ帯の印・MCP の tool の見出しのサーバー名)。観点: 通さないフィールドに入れた目印の値が `SessionEvent` の文字列と DOM に 0 件、名前が同じで状態だけが変わった 2 回目の `init` が DOM まで届く、同じ長さの別のモデルが DOM まで届く、2 つのセッションで構成が混ざらない、形の検査の外れ (制御文字・tag 文字・U+2028・長い名前・件数の超過・`__proto__` / `constructor`) で例外が出ない、状態通知のフィールドの差分 0

## US-3 — 認証とプラグインの出来事が分かる (P2)

**Goal**: `auth_status` と `plugin_install` をシステムイベントの行で出す (spec FR-010。data-model §4)。

**Independent Test**: 変換の単体と行の component テスト (SC-003)。

- [ ] **BE-030** [BE] `src/domain/session/transcript-dto.ts` / `system-event.ts` (+ `system-event.test.ts`) — data-model §4: `SYSTEM_EVENT_CATEGORIES` に `auth` / `plugin` (5 → 7)、`SYSTEM_EVENT_STATUSES` に `authenticating` (14 → 15)、`detail` の注記に `auth` (常に '') と `plugin`。`system-event.ts:118` の `HOOK_OUTCOMES[m.outcome] ?? 'unknown'` を `Object.hasOwn` に直す (plan 申し送り #13)。`TRANSCRIPT_PART_FIELDS` と `toSystemEventMessage` は変えない。テスト: 集合の固定テスト (`system-event.test.ts:297-309`) を 7 / 15 と値で直す、`outcome: '__proto__'` / `constructor` で `unknown`。renderer の `Record<…>` の足りないキーは同じ節の FE-030 で埋める
- [ ] **BE-031** [BE] `src/agents/live-signals.ts` (+ `live-signals.test.ts`) / `sdk-agent-session.ts` (+ `sdk-agent-session.test.ts`) — data-model §4 の行の表: `onAuthStatus` を足し (`auth:<連番>`。`isAuthenticating: true` で開き `authenticating`、`false` で `succeeded`、`error` があれば `failed`)、`onSystem` に `plugin_install` (`plugin:<連番>`。`started` で開き、`installed` / `failed` を数え、`completed` で `completed`、失敗が 1 つでもあれば `failed`。`detail` は数と最後のマーケットプレイスの名前 (BE-001 の名前の形の検査))。連番と開いた行は `createLiveSignals` の closure。行の組み立ては O-4 の `rowEvent` (`:70`)。`sdk-agent-session.ts` の `switch (message.type)` (`:551`) に `case 'auth_status'` を足す。`output` / `error` は読まない (U-4)
  - テスト (SC-002 / SC-003): `auth_status` の `output` / `error` と `plugin_install` の `error` に目印の値を入れて emit の文字列に 0 件、認証の開閉の順・次の認証が別の id、開いた行が無いまま `isAuthenticating: false` が来ても例外が出ない、プラグインの進み具合の合成と失敗の数、形の外れたマーケットプレイスの名前が `detail` に出ない。回帰: 過去ログの変換 (`transcript.ts`) が `auth_status` / `plugin_install` から行を作らない
- [ ] **FE-030** [FE] **認証とプラグインの行** — `features/chat/labels.ts` (`SYSTEM_EVENT_CATEGORY_LABELS` / `SYSTEM_EVENT_STATUS_LABELS` と行の文言) / `components/assistant-ui/elements/thread.aui.tsx` (`:1074` の `SYSTEM_EVENT_ICONS` の 2 行だけ。composer の部分は変えない [Q2]) — data-model §4 / §6 の chat のシステムイベントの行: `auth` の 3 状態の文言、`plugin` の進み具合 (`detail` の数とマーケットプレイスの名前)。`subagent.aui.tsx` の同じ表の参照は変えずに通ること
  - テスト (`LivePane.o2.test.tsx`。vitest-axe。US-3 AC1〜AC5): 認証中 → 成功 / 失敗に同じ行が書き換わる、`output` / `error` の目印が DOM に 0 件、行が「認証中」のまま終わると「結果不明」(O-2 の規則)、プラグインの行が 1 つで進み具合が書き換わる

## 境界の検査 — 項目 16 の P3 を広げる

**Goal**: アプリが MCP・プラグイン・スキルを操作しないことを機械で固定する (spec FR-011 / SC-005。AD-048 Decision 2 / research R-06)。

**Independent Test**: `node scripts/constitution/check.mjs` の項目 16 と rule fixture の照合、pin テスト。

- [ ] **BE-040** [BE] `scripts/constitution/allowlists.mjs` / `tests/docs/query-mutation-methods.test.ts` (新設) / `src/agents/sdk-agent-session.ts` / `tests/rule-fixtures/` — research R-06 の (1)〜(4): `QUERY_MUTATION_METHODS` (`:420-427`) に AD-048 Decision 2 の 11 個 (`mcpServerStatus` / `reconnectMcpServer` / `toggleMcpServer` / `setMcpServers` / `reloadPlugins` / `reloadSkills` / `rewindFiles` / `stopTask` / `seedReadState` / `streamInput` / `reinitialize`) と、AD-036 §4 P3 を根拠に `reloadOutputStyles` / `backgroundTasks` を足し (6 → 19。後の 2 つは ADR 不要)、`:419` の注記に AD-048 と AD-036 §4 P3 を足す。pin テストは集合を並びを問わず 19 個で固定し「**外す**には ADR が要る (足すのは AD-036 §4 P3 の範囲内で ADR 不要)」と注記する (置き場は `tests/docs/wsl-free-coverage.test.ts` と同じ読み方)。`sdk-agent-session.ts` の型の一致の並び (`:91-108`) に `keyof Query` の網羅を足す: 自前のメソッド (`Exclude<keyof Query, keyof AsyncGenerator<SDKMessage, void>>`) を `'interrupt'`・変更系 (19 個の union。pin テストと同じ名前)・呼ばない読み取り (`initializationResult` / `supportedCommands` / `supportedModels` / `supportedAgents` / `getContextUsage` / `usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET` / `readFile` / `accountInfo` / `close` の 9 個) に分け、`Equal<Exclude<自前のメソッド, 3 つの union>, never>` と、3 つの union が `keyof Query` に含まれることを固定する (SDK の import 文は 1 つに保つ。`SDKMessage` は既存の import に足す)。違反の fixture `b-equivalent/sdk-query-mcp-control.ts.fixture` (`.reconnectMcpServer(` だけを呼び、昇格値・昇格キーの綴りを含めない) と `expected.mjs` の行 (`target: 'src/agents/__rulecheck__/…'`・`rules` は `#16`)。既存の `b-equivalent/sdk-query-mutation-method.ts.fixture:13` の引数を `'default'` に替える (P3 だけで発火する形に) [P]
  - 確かめ: rule fixture の照合 (`docs/discovery.md` の agent 用の列) で 2 本の fixture が項目 16 で発火する、型検査 (`tsconfig.node.json`) で `keyof Query` の網羅が通り、3 つの union から 1 つ名前を外すと落ちる (手で確かめて戻す)、`src/agents/sdk-agent-session.ts` の `Query` のメソッドの呼び出しが `interrupt` だけ、`AGENT_SDK_ALLOWED_CALLS` (`:379`) と `QUERY_OPTION_KEYS` の差分 0。正の形 (`interrupt` 以外を違反・`queryHandle` の型を絞る) は行わない (SH-012 で roadmap の system scope に送る)

## Polish / 記録

- [ ] **SH-010** [SH] **対応表を書き換える** (spec FR-012 / SC-004。Principle XII) — `docs/ui-coverage.md` を data-model §5 のとおりに (割当と経路の列。plan 申し送り #2 の 21 行と F 節) [P]
  - A 節の `init` の行は経路 `実行中`、備考に今の `permissionMode` の O-4 の記述を残す (申し送り #3)。`plugin_install` / `auth_status` / `commands_changed` は `実装済み`、`elicitation_complete` は `後続: O-10`
  - C 節の MCP の 5 行は `実装済み: McpToolCall (両方)`、`AskUserQuestion` は `後続: O-10` と備考
  - E 節の `mcp_status` と操作の 7 行は `表示不要` と理由 (AD-048)、`elicitation` / `request_user_dialog` は `後続: O-10`
  - F 節は §5 の表のとおり。MCP server panel の使い道は SH-002 の結論で書く
  - `node scripts/constitution/check.mjs` の項目 21 が ok で、出力に割当先が O-5 の行が 0、O-10 の行が 4 (SC-004)。SH-012 の roadmap の O-10 の行と同じ PR に置く (AD-044: `後続` は roadmap に実在する ID)
- [ ] **SH-011** [SH] **実名リストの規則を追随させる** (plan 申し送り #17 / #18 / research R-08): `eslint.config.mjs:588-594` の手書きの element の一覧に `mcp-tool-call.aui.tsx` / `ask-user-question.aui.tsx` を足す。`.specify/spec-gate/reviewers.yml` の a11y / ux の手書きの element の一覧 (`:54-62` / `:107-115`) に同じ 2 つを、ui-coverage reviewer の SDK 変換の domain のモジュール (`:188` の `meter*.ts` の隣) に `src/domain/session/session-init-report*.ts` を足す。SH-002 で取り込んで手を入れた registry の element は同じ一覧に、入れなければ `exclude_patterns` に実名で足す。`.dependency-cruiser.js` と `allowlists.mjs` の他の集合は変えない [P]
- [ ] **SH-012** [SH] **roadmap・`_overview.md`・prompts を追随させる** (spec FR-013 / FR-015。plan 申し送り #1 / #5 / #8 / #15 / #19 / #20) [P]
  - `docs/roadmap.md`: O-10 の行を登録 (題・M3・依存 O-5・domain `session` (U-1)・範囲と義務は spec FR-013 の箇条のとおり・design の前に AD-036 Decision 4 と AD-041 (g) の読み替えの 2 つの ADR を起こす)。O-5 の行 (依存に O-4 を足す・題から Elicitation を外す・結論)。O-8 の行の (c) の観測点の注記 (`auth` / `plugin` の行は `message` なので数え、`init-report` / `commands` は `meter` なので数えない)
  - roadmap の system scope: composer の 2 項目 (英語の名前の残り・ターンの開始のフォーカスの奪取) の持ち主を「composer を次に触る feature (O-10 と X-6 の早いほう)」に付け替える [Q2]。「項目 16 の P3 を正の形 (`interrupt` 以外を違反) にし、`queryHandle` の型を絞る」と「項目 14 がすべての import 文・再 export・動的 import を読む」を持ち主に送る記録を足す
  - `docs/domains/_overview.md`: Feature 帰属の表 (O-5 の題・O-10 の行 (domain `session`))、帰属の判断根拠 (「O-5 は `ui` のまま session の契約 (`meter` の種類) を広げる (AD-048)」と O-10 の domain の理由)、Milestone の M3 の列に O-10
  - `docs/prompts.md`: O-10 のプロンプト
- [ ] **SH-013** [SH] **charter と AD-047 を追随させる** (spec FR-014 / FR-015。plan 申し送り #4 / #11 / #12 と ADR 節) [P]
  - `docs/domains/ui/charter.md`: Related Specs に O-5、Open Questions の Tier C の答えを「転用しない (AD-048 Decision 4)」に、In scope の composer の slash commands の持ち主を O-10 に
  - `docs/domains/session/charter.md`: `meter` の種類の追加 (`init-report` / `commands`) と未信頼の文字列の区分 (形の検査の正本は data-model §2)、Related Specs に O-5 (ui) と O-10 (session)
  - `docs/decisions/0047-session-meter-and-failure-reasons.md` [Q1]: 日付つきの訂正節を 1 つ足す (AD-031 Decision 1)。見出し「訂正: AD-048 への参照 (2026-10-xx / O-5)」、中身は plan の ADR 節のとおり (Decision 2 の運ぶ値は AD-048 Decision 3 が読み替える。AD-048 の「読み替える箇所」が proposed のうちに足すとしていた参照を、accepted の後に訂正として足す)。Decision・Consequences の本文は書き換えない。AD-048 の本文は変えない
- [ ] **SH-014** [SH] **検証** — `docs/discovery.md` の "Build / Test / Lint" 表の agent 用の列で、lint・型検査 2 本 (`node node_modules/typescript/bin/tsc --noEmit -p tsconfig.node.json --composite false` / `… -p tsconfig.web.json …`)・E2E の型検査 (`-p e2e/tsconfig.json`)・依存グラフ・Constitution 検証 (項目 14 / 16 / 21 を含む)・rule fixture の照合・Vitest の全件を通す。E2E (要ビルド) と基準画像は CI の e2e job で通す (composer と既存の画面は変えないので基準画像を取り直さない [Q2])。quickstart V-1 (境界の差分。`git diff` で `toPermissionResult`・`TRANSCRIPT_PART_FIELDS`・`SESSION_EVENT_KINDS`・`QUERY_OPTION_KEYS`・`AGENT_SDK_ALLOWED_CALLS`・IPC・preload・main の差分 0) と V-2 (対応表) を確かめて `quickstart-results.md` に記録する。V-3 (実機の目視。本番ビルド) は利用者に残し、確かめられなかった項目 (最初のターンの `pending`・`needs-auth` の案内と `CLAUDE_CONFIG_DIR` (plan RK-05)・`AskUserQuestion` を許可したときの tool_result の中身 (O-10 の材料)) は roadmap の O-5 の行に残す (SH-012)

## Backend Tasks (index)

domain / agents / scripts に属するタスク: BE-001〜BE-002 (構成の型・形の検査・変換・decoder と `METER_UPDATE_TYPES`) / BE-010 (過去ログの tool 名の無害化) / BE-020 (`init` / `commands_changed` → `meter` と SDK の型の固定) / BE-030〜BE-031 (行の category と `auth_status` / `plugin_install`) / BE-040 (項目 16 の P3)。main と preload は変えない (SC-005)。DB migration は無い (構成は永続化しない)。

## Frontend Tasks (index)

renderer に属するタスク: FE-001 (構成の受け口) / FE-010〜FE-014 (名前の純関数・サーバー名の購読・MCP の表示と振り分け・`AskUserQuestion`・承認カード) / FE-020〜FE-021 (タブの表と帯の印・構成のタブ) / FE-030 (認証とプラグインの行)。composer とその E2E・基準画像は変えない [Q2]。

## Shared Tasks (index)

docs・規則・通しのテスト・検証: SH-001〜SH-002 (先行) / SH-020 (経路を 1 本通すテスト。API contract に相当するのは `meter` の 2 つの種類で、形の正本は data-model §2。contracts/ は作らない) / SH-010〜SH-014 (対応表・規則・記録・検証)。E2E は足さない (構成を流す偽の supervisor を作らない。O-4 と同じ)。

## 依存と順序

1. **先行** (SH-001 / SH-002) → **土台** (BE-001 → BE-002 → FE-001)
2. **US-1〜US-3** は土台の後ならどの順でもよいが、本書の順 (P1 → P2) に進める
   - US-1: BE-010 / FE-010 は互いに依らない。FE-011 (FE-001 の `initReport` を読む) → FE-012 → FE-013 (同じ `tool-registry.aui.tsx`)。FE-014 は FE-010 と FE-011 の後
   - US-2: BE-020 / FE-020 は互いに依らない。FE-021 は FE-020 (タブの表) と SH-002 の後。SH-020 は BE-020 / FE-021 の後
   - US-3: BE-030 → BE-031 / FE-030 (BE-030 の型の拡張で落ちる renderer の `Record<…>` は FE-030 が埋める。節の終わりで型検査が通る)
3. **境界の検査** (BE-040) は他と独立。いつでもよい
4. **Polish**: SH-010 は SH-002 の結論と US-1〜US-3 を使う。SH-010 と SH-012 (O-10 の行) は同じ PR に置く。SH-011 は SH-002 の結論を使う。SH-014 が最後
5. 節の中の並行の例 (`[P]`): 先行 = SH-001 / SH-002、土台 = BE-001 (他は直列)、US-1 = BE-010 / FE-010、US-2 = BE-020 / FE-020、境界の検査 = BE-040、Polish = SH-010〜SH-013

## 実装の進め方

- 本 feature は 1 つの PR で出す (FR-012 の対応表・FR-013 の O-10 の登録・FR-015 の記録が同じ PR を求める)。節ごとに止めて、節の Independent Test が緑であることを確かめてから次へ進む
- 最初の区切りは 先行 + 土台 + US-1 (MCP の tool と問いが読め、承認カードで許可する tool を取り違えない。今いちばん大きい誤解 (`AskUserQuestion` を許可しても回答が届かない) を注記で手当てする)。次に US-2・US-3、境界の検査、Polish の順に積む
