# Data Model: 会話の境界と tool の専用表示の第 2 弾 (O-6)

各規則の正本は本ファイルの節。SDK の型は `@anthropic-ai/claude-agent-sdk` 0.3.270 (`SDKCompactBoundaryMessage` `sdk.d.ts:3457`、assistant の `supersedes` :3370、`SDKConversationResetMessage` :4749、`SDKInformationalMessage` :4855、`SDKModelRefusalFallbackMessage` :5022、`SDKModelRefusalNoFallbackMessage` :5059、`sdk-tools.d.ts` の `FileReadInput` :812・`GlobInput` :840・`GrepInput` :850・`WebFetchInput` :1034・`WebSearchInput` :1044・`TaskCreateInput` :2724・`TaskGetInput` :2744・`TaskUpdateInput` :2750・`TaskListInput` :2790)。

design-gate R2 の後に H-01〜H-03 と Medium を手当てした (再レビューを受けていない)。

## §1 会話の境界と知らせの行 (O-2 の `system-event` の category。O-4 data-model §3 の作り方)

category と status の列挙の正本は `transcript-dto.ts` (`SYSTEM_EVENT_CATEGORIES` / `SYSTEM_EVENT_STATUSES`)、終わりの判定は `system-event.ts` (`isTerminalSystemEventStatus`)。本 feature の status はすべて 1 回の出来事で、終わりを表す。`SystemEventStatus` の説明は「行の状態の理由キー (Hook / task の状態と、本 feature の行の見た目の段階)」に直す。

| category | 行の id | opens | 読むフィールド | 読まないフィールド | `name` | `detail` | `status` |
|---|---|---|---|---|---|---|---|
| `compact-boundary` | `compact-boundary:<uuid>` | true | `compact_metadata.trigger`・`pre_tokens`・`post_tokens` | `preserved_segment`・`preserved_messages`・`duration_ms` | '' | `<trigger> <pre> <post>` | `marked` |
| `conversation-reset` | `reset:<uuid>` | true | (なし) | `new_conversation_id` | '' | '' | `marked` |
| `refusal` (fallback) | `refusal:<uuid>` | true | `direction`・`scope`・`fallback_model`・`api_refusal_category` | `content`・`api_refusal_explanation`・`request_id`・`refused_user_message_uuid`・`original_model` (`retracted_message_uuids` は行に入れず取り消しに使う) | fallback のモデル (O-4 の `modelId` の形の検査。外れたら '') | `<direction> <scope> <category>` | `fallback` |
| `refusal` (no fallback) | `refusal:<uuid>` | true | `content`・`api_refusal_category` | `api_refusal_explanation`・`original_model`・`request_id`・`refused_user_message_uuid` | category (形の検査を通ったときだけ。外れたら '') | `content` を下の本文の規則で | `no-fallback` |
| `informational` | `info:<tool_use_id>` (形の検査を通れば) / `info:<uuid>` | true | `content`・`level`・`prevent_continuation`・`tool_use_id` | — | '' | `content` を下の本文の規則で | `prevented` (`prevent_continuation`) / `warning` (`level` が `warning` / `suggestion`) / `notice` (`info` / `notice` / 照合に外れた値) |

- **値の照合** (agents。`Object.hasOwn` の表で引き、外れたら `-` にする): `trigger` ∈ {`manual`, `auto`}、`direction` ∈ {`retry`, `revert`, `sticky`}、`scope` ∈ {`session`, `local`} (無ければ `session`。SDK の定義どおり)、`level` ∈ {`info`, `notice`, `suggestion`, `warning`}、category は `^[a-z_-]{1,32}$`、トークン数は 0 以上の安全な整数。`detail` の各トークンはこの照合を通った値か `-` だけなので、renderer は空白で区切って読み戻してよい
- **行の id の素材**: `uuid` と `tool_use_id` は `^[A-Za-z0-9_-]{1,128}$` (O-4 data-model §2 の `toolUseId` と同じ)。`uuid` が外れたら行を作らない
- **同じ `tool_use_id` の `informational`** は O-2 の合成で 1 行にまとめ、後の値に書き換える (空の本文は前の本文を残す。本文の規則は部分を伏せるだけで本文を丸ごと消さないので、残るのは前の正当な本文)
- **`detail` の上限**は O-2 data-model §2 の 120 コードポイントのまま (O-2 の契約を変えない)。超えた本文は `…` で切れ、続きは出さない (U-3)。行の見た目は `detail` を折り返す (今の `truncate` を本 feature の category では外す)
- **過去ログの圧縮**: `transcript.ts:207` の `{ type: 'divider', label: 'コンテキストを圧縮' }` はそのまま (DTO を変えない)。renderer が divider を境界の表示 (TranscriptBoundary) に写す (数は出さない)。**divider を作るのは圧縮だけ** (domain の生成箇所が 1 つであることをテストで固定する)。subagent の入れ子の中の divider は今のまま (O-11)
- **過去ログの `system` の本文** (design-gate R2 H-02): 今の変換は、Hook / task でない `system` の記録の文字列の `content` を text の part にしている (`transcript.ts:73`, `:214-216`)。`informational`・`local_command_output`・拒否の本文が記録に残れば、伏せ字なしで出る。**`system` の記録の text の part に `redactSecrets` を当てる** (`sanitizeBody` の後。行は足さず、DTO を変えない。行への変換は O-11)。AD-047 D3 の「過去ログの変換には足さない」は行を足すことの禁止で、伏せ字はその外

### 本文の規則 (U-3。`informational` と no fallback の拒否の `content`)

1. O-2 の無害化 (`sanitizeBody(raw, 4_096)`。byte の上限を先に当てる)
2. **伏せ字** (`redactSecrets`。下の表)
3. 1 行に正規化 (連続する空白・改行を 1 つの空白に)
4. O-2 の切り詰め (120 コードポイント)。伏せ字は切り詰めの前に当てる (切り詰めでトークンが割れて伏せ字を逃れないため)

- `mayCarrySecret` (コマンドの文字列向けの判定) は本文に使わない
- 伏せ字の前の本文を agents のログに書かない (Principle V)

### 伏せ字 (`redactSecrets`。`src/domain/session/secret-redaction.ts` に新設する純関数。import を持たない。秘密の綴りの正本)

当たった部分を `•••` に置き換える (行全体は消さない)。境界 `B` は `(^|[^A-Za-z0-9])` (`system-event.ts:50` と同じ)。名前は大文字小文字を区別しない (`Basic` を除く)。

| 種類 | 形 (正本) | 伏せる部分 |
|---|---|---|
| URL の userinfo | `[a-z][a-z0-9+.-]*://[^/\s@]+@` | `://` と `@` の間 |
| URL のクエリの秘密 | `[?&](access_token\|token\|key\|sig\|signature\|password\|secret)=[^&\s#]+` | `=` の後 |
| webhook のパスの秘密 | `hooks\.slack\.com/services/[^\s?#]+`・`/api/webhooks/[^/\s]+/[^/\s?#]+`・`/bot\d+:[A-Za-z0-9_-]+` | `services/`・`webhooks/`・`/bot` の後 |
| 認証のヘッダ | `Authorization\s*:\s*\S+(\s+\S+)?`・`(Set-)?Cookie\s*:\s*[^\n]+` | `:` の後 |
| `Bearer` / `Basic` | `B Bearer\s+[A-Za-z0-9._~+/=-]{8,}`・`B Basic\s+[A-Za-z0-9+/]{8,}={0,2}` (`Basic` は大文字小文字を区別し、数字か `+` / `/` / `=` を含むものだけ) | トークン |
| 秘密の名前への代入 | `[A-Za-z0-9_-]*(token\|secret\|password\|passwd\|pwd\|api[_-]?key\|access[_-]?key\|client[_-]?secret\|private[_-]?key)["']?\s*[:=]\s*["']?[^\s"',;}]+` (名前の前の英数字と `_` / `-` を許し `GITHUB_TOKEN` に当てる。JSON の引用符を許す) | 値 |
| 空白で区切ったフラグ | `--(password\|token\|api-key\|secret)[ =]\S+`、`(mysql\|mysqldump\|mysqladmin\|mariadb)\b[^\n]*?\s-p\S+` | 値 |
| 既知のトークン | `B` の後の `sk-[A-Za-z0-9_-]{16,}`・`(sk\|rk)_(live\|test)_[A-Za-z0-9]{16,}`・`gh[pousr]_[A-Za-z0-9]{16,}`・`github_pat_[A-Za-z0-9_]{20,}`・`glpat-[A-Za-z0-9_-]{16,}`・`xox[abeprs]-[A-Za-z0-9-]{10,}`・`xapp-[A-Za-z0-9-]{10,}`・`AIza[A-Za-z0-9_-]{16,}`・`ya29\.[A-Za-z0-9_-]{16,}`・`npm_[A-Za-z0-9]{16,}`・`hf_[A-Za-z0-9]{16,}`・`(AKIA\|ASIA)[0-9A-Z]{16}`・JWT `eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}(\.[A-Za-z0-9_-]+)?` | トークン全体 |
| PEM | `-----BEGIN [A-Z ]*PRIVATE KEY-----` から `-----END [A-Z ]*PRIVATE KEY-----` か本文の終わりまで | 全体 |

- **正本は 1 か所**: 既存の `secret-scan.ts` (`SECRET_PREFIX_PATTERNS`) の接頭辞の集合が本表に含まれることを固定テストにする (寄せるのは別 feature)
- **計算量**: 入れ子の量指定子と重なる選択を使わない。4 KB の敵対的な入力 (`a://` + `a`×4,000、`token` の繰り返し) が 50 ms 以内に終わることをテストで固定する
- **fixture の正本** (BE-001):
  - 伏せる: `{"api_key":"abc123def"}`・`'password': 'hunter2'`・`GITHUB_TOKEN=abc`・`AWS_SECRET_ACCESS_KEY=abc`・`--password hunter2`・`mysql -u root -phunter2`・`sk_live_…`・`npm_…`・PEM・`Cookie: sid=…`・`https://u:p@h/x`・`?access_token=…`・`https://hooks.slack.com/services/T0/B0/XXXX`・`/api/webhooks/1/abc`
  - 変えない: `task-runner`・`disk-usage`・`risk-free`・`Basic usage`・`find . -path ./x -prune`・`gcc -pthread`・`max_tokens: 4096` (名前が `token` で終わらないので当たらない)・`monkey=1`・括弧と引用符を含む普通の文
  - 伏せすぎを受け入れる (U-3): `password: is required` の「is」、`PWD=/home/u` のパス

### 取り消し (U-2)

- **合図は 2 つ**: (a) 実行中の assistant メッセージの `supersedes` (届いた時点。代わりのメッセージを送る前に送る)、(b) `model_refusal_fallback` の `retracted_message_uuids` (ターンの終わり。SDK の監査の記録)。どちらも冪等。(a) で外してから (b) の拒否の行が届くまで、理由の行は無い (U-2。V-3 で確かめる)
- **運び方**: O-4 の `meter` に種類 `retraction` (`{ type: 'retraction'; messageIds: readonly string[] }`) を足す。`messageIds` は `^[A-Za-z0-9_-]{1,128}$` のものだけ、1 件の `meter` に 1〜128 件。128 件を超えたら分けて全部送る
- **O-4 の上限と間引きに掛けない** (1 回限りの指示で、最新の値で置き換えられないため。O-5 の `init-report` / `commands` と同じ)。保留しないので `finish()` で捨てられない。renderer は `meters` に最新の値として持たず、届いた順に全部当てる
- **戻らない仕組み**:
  - agents: tool の結果の追跡 (`live-tool-results.ts`) に `retract(messageIds)` を足す。該当のメッセージを忘れ、その結果待ちの `toolUseId` を上限つき (512) で覚え、後から届いた結果を送り直しにも結果だけのメッセージにもせず捨てる。取り消した id の `message` を後から送らない (上限つき 512)
  - renderer: 稼働中のストアは同じセッションの `messages` から外し、外した id をセッションごとに上限つき (512) で覚えて、後から同じ id の `message` が届いても足さない。閉じたセッションには書かない。`close()` で外した id の記憶を消す。隠れた古いメッセージの件数を直す。表示位置は既存のアンカリングで保つ
  - 外した後に監視ビューの派生値 (`trackDerived`) を通す (直近の活動に取り消した tool が残らない)。O-4 の `toolElapsed` から取り消した `toolUseId` を消す。承認の要求 (`pending`) は消さない (承認カードは利用者の応答を待つ。何を許可するかは承認カードの入力で分かる)
  - 結果だけの行 (`result:<toolUseId>`) は取り消しの対象外 (SDK の uuid と一致しない)。取り消した後の結果は agents が捨てるので新たにはできない
  - decoder: `messageIds` が配列でない・0 件・129 件以上なら `meter` ごと捨てる。形の合わない id は 1 件ずつ捨てる
- **行の件数**: 拒否の行は取り消しの件数を出さない (SDK の列は tool_result の id も含み、外したメッセージの数と一致しないため)
- **観測**: agents の開発用ログに、指示の件数・形の検査で落とした件数・送った assistant の id (上限つき 512) に当たらなかった件数を数だけ残す。roadmap の O-3 (O-8) の義務 (c) の `receivedMessages` は、本 feature の行を数え、`retraction` を数えない
- O-4 data-model §2 の値の検証の表に `messageIds` の行を足す (AD-047 D2 の読み替え。AD-049)

### 見た目

| category | 見た目 |
|---|---|
| `compact-boundary` / `conversation-reset` | 横いっぱいの区切り (TranscriptBoundary。本 feature の element)。文言は §4 |
| `refusal` | 注意の行 |
| `informational` | `prevented` / `warning` は注意の行、`notice` は控えめの行 |

- O-4 の `compaction` の行 (進み具合: 圧縮中 → 完了 / 失敗) と圧縮の境界は並べて描く。行が先、境界が後 (research R-07)

## §2 tool の専用表示

| tool | 見出し (1 行・80 コードポイントで切り詰め) | 中身 (既定で畳む) |
|---|---|---|
| `Read` | パスの末尾と範囲 (`offset`〜`offset+limit` の行、`pages`) | 全体のパス (本文)、結果 (行番号つきの text を `<pre>` で) |
| `Glob` | `pattern` と `path` の末尾 (あれば) | 結果を File tree (下の作り方) |
| `Grep` | `pattern`・`glob`・`path` の末尾・`output_mode` の訳 (§4) | `files_with_matches` (既定) は File tree、それ以外は text |
| `WebFetch` | **URL の host だけ** (WHATWG URL で読み、http(s) のときだけ。読めない・http(s) でない・host が 256 コードポイント超は「URL」)。リンクにしない | 全体の URL (伏せ字を通す)、`prompt`、結果の text |
| `WebSearch` | `query` と、ドメインの制限があればその件数 (`allowed_domains` / `blocked_domains`) | 結果の text |
| `TaskCreate` | 「タスクを追加」と `subject` | TodoList の 1 項目 (`subject`・`activeForm`・「追加した時点: 未着手」) と結果の text (タスクの id が出る) |
| `TaskUpdate` | 「タスクを更新」と `subject` (無ければ「タスク #{taskId}」) | `status` があれば TodoList の 1 項目 (状態は下の対応)。無ければ項目を出さず見出しだけ |
| `TaskGet` / `TaskList` | 「タスクを確認 #{taskId}」/「タスクの一覧」 | 結果の text |

- **見出しの自由文** (`pattern`・`glob`・`query`・`subject`) にも `redactSecrets` を通す (§1)
- **WebFetch の見出しを host だけにする理由**: パスの末尾が秘密の webhook (`/services/T…/B…/<secret>`・`/api/webhooks/<id>/<token>`) があり、見出しは畳んでも見えるため (design-gate R2 H-01)。URL の読み取り (WHATWG URL) は O-5 data-model §1 の関数と共有し、見出しの組み立ては本 feature の規則にする。**O-5 の MCP resource の URI の要約も最後のパスの要素を出すので、O-5 の実装で同じ見直しをする** (roadmap の O-5 の行に書く。SH-010)
- **パス**: tool の入力と結果のパスは会話由来の本文 (AD-034) で、アプリのパスの値ではない (R-2 FR-042・AD-025:181・AD-028 §3 規則 4・AD-029・AD-032 の対象外。範囲の確認で、読み替えではない)。UNC を判定も除去もしない。`path-api` を import しない。renderer に UNC の綴りを書かない (項目 12)。**本文のパスはすべて表示だけ**で、File tree の項目にも中身のパスにも操作 (選ぶ・開く・表示する) を付けない。ファイルを開く導線は Files (AD-025) の PathDTO の経路でだけ作る
- **パスの末尾**: `features/chat/path-tail.ts` (renderer。新設) に表示用の純関数 `pathTail` を置き、`session-view.ts` からも使う。docstring に「表示用の文字列の切り出し。パス API ではない。名前空間を持たない本文に使う」と書く。末尾の `/` と `\` を除いてから、`/` と `\` の両方で切った最後の要素を返す (残りが空なら元の文字列)。ホスト OS やランタイムで切り方を変えない。切った値を IPC・port に戻さない
- **File tree の作り方** (結果の text から):
  1. 改行で分け、前後の空白を除き、空の行を捨てる
  2. 次の形の行を注記、それ以外を項目にする: `(` で始まる行、`^Found \d+ (files?|matches)`、`^No (files|matches) found`。[ASSUMED: CLI の出力の形。V-3 で実際の結果の text を記録し、fixture をその記録から作る]
  3. 項目が 0 件なら、結果の text をそのまま text で出す (File tree を出さない)
  4. 項目は平らな配列 (階層を組まない。パスの要素をキーにしたオブジェクトを作らない)。1 行は 1,024 コードポイントで切り詰め、200 件まで出して「ほか {n} 件」
  5. 注記は File tree の上に、届いた順の text で出す
- **File tree の element**: registry の File tree (`file-tree.tsx`) は差分の要約 (英語の「{files} files changed」・増減の数・`key={node.path}`) で、意味が違う。**写して変える**: 見出しは「{n} 件のファイル」、増減の数を出さない、`name` に行の text、`path` に添字の文字列を入れ、key は添字。項目に操作を付けない
- `pattern` / `glob` は文字列として出すだけで、正規表現に組まない
- **結果の負のケース**: エラーは既存のエラーの印と本文 (O-2 FR-007)。結果が空 (text でないブロックだけの `Read` を含む) は「text でない結果か、空の結果です」
- **状態の対応** (`Object.hasOwn` の表で引く): `pending` → 未着手、`in_progress` → 進行中、`completed` → 完了、`deleted` → 削除、知らない値 → 不明
- 入力の文字列は既存の tool の表示と同じく O-2 の無害化を通った値
- 振り分けは `tool-registry.aui.tsx` の表 (`Object.hasOwn` の照合。O-5 data-model §1) に足す
- **Agent plan** (U-4): `agent-plan.aui.tsx` で plan の文字列を `TextMessagePartProvider` (`@assistant-ui/react`。`text` / `isRunning={false}`) で包み、既存の `MarkdownText` をそのまま描く。新しい markdown の描画口を作らない (`@assistant-ui/react-markdown` の import は `markdown-text.tsx` だけ、`TextMessagePartProvider` の import は `agent-plan.aui.tsx` だけ。固定テスト)。「原文」の切り替えで今の plain text (`whitespace-pre-wrap`) を出す。plan に生 HTML・コメント (`<` の後に英字・`!`・`/`) があるときは「表示されない部分があります。原文で確かめてください」の印を出す。入力が読めないときは今どおり ToolFallback。**他の tool の結果は plain text** (`whitespace-pre-wrap` / `<pre>`) で、markdown の fence に包まない

## §3 tool の結果の状態 (renderer の純関数 `toolResultState(part, ctx)`)

`ctx` は `{ live: 実行中のセッションか, runState: SessionRunState, latestTurn: part が最新のターン (セッションの最後の利用者のメッセージより後) のメッセージにあるか, orphanResult: 同じ toolUseId の結果だけのメッセージがあるか }`。thread の context で O-2 の `TranscriptSettledContext` と並べて渡す。

| 条件 (上から) | 状態 | 印 |
|---|---|---|
| `result` がある | 結果あり | なし (エラー・切り詰めの印は既存) |
| `orphanResult` | 結果あり (別に表示) | 「結果は別に表示」 |
| `live` かつ `latestTurn` かつ `runState` が `running` | 結果待ち | 「結果待ち」(動く印。`aria-busy`) |
| `live` かつ `latestTurn` かつ `runState` が `awaiting_permission` | 結果待ち | 「結果待ち」(動かない。どの tool の承認かは承認カードが示す) |
| それ以外 (応答が終わった・中断した・終了・失敗・過去ログ・前のターン) | 結果不明 | 「結果不明」 |

- **状態の正本は `toolResultState`**: 結果の無い tool-call の part に assistant-ui が当てる状態 (`running` / `requires-action` / `incomplete`) は使わない。ToolFallback を含むすべての表示の状態のアイコン (spinner / ✓ / ✗ / ⚠) と文言を `toolResultState` と part の `isError` から決める (design-gate R2 M-12)
- 承認の要求を tool ごとに見分けない (`PermissionRequest` に `toolUseId` が無く、足すと session の契約が変わるため。U-6)
- 並列の tool の結果が 1 つずつ届くか、まとめて届くか (V-4 未記録) に依らない (tool の part ごとに判定する)
- **印を出す表示** (すべて): TerminalBlock (`Bash`)・CodeDiff (`Edit` / `Write` / `MultiEdit`)・TodoList (`TodoWrite`)・Subagent (`Agent` / `Task`)・AgentPlan (`ExitPlanMode`) (R-4)、McpToolCall・AskUserQuestion (O-5)、FileTool・WebTool・TaskTool (本 feature)、ToolFallback

## §4 読み上げと文言 (正本。`labels.ts`)

### 読み上げ (`TranscriptAnnouncer`。見ているセッション (O-7 の `watchedId`) の thread の中に 1 つ)

- **きっかけ**: 描画した後に新しく届いた出来事だけ。最初の描画・セッションの切り替え・過去ログ・「さらに表示」で現れたものは読まない (その時点の id の集合を基準にし、差分だけを読む)
- **読むもの**: tool の結果のエラー、圧縮・会話の作り直し・拒否の行、`prevented` の知らせ、**O-2 の Hook / task の行が新しく終わりの状態 (`failed` / `killed` / `stopped` / `completed` / `succeeded` / `cancelled`) になったこと** (O-2 pr-gate a11y M-003)
- **読まないもの**: セッションの終わりで一斉に結果不明になった tool と行 (失敗は `SessionScreen` の `role="alert"` が伝える)、承認 (`ApprovalCard` の `alertdialog`)、見ていないセッション (`SessionAttentionAnnouncer`)
- **中身**: 固定の文言・既知の列挙・件数だけ。tool 名は登録済みの名前か `^[A-Za-z0-9_-]{1,64}$` に合うときだけ出し、それ以外は「tool」。Hook 名・task の説明・`content`・`prompt`・パスを入れない
- `aria-live="polite"`、1 秒に 1 回までにまとめる
- 利用者が承認カードで拒否した・中断した直後の tool のエラーも読む (区別できないため)。拒否と中断の後の `is_error` を V-3 で記録し、エラーとして届くなら見直す

| きっかけ | 文言 (1 件) | 同じ 1 秒に複数 |
|---|---|---|
| tool の結果がエラー | 「{tool 名} がエラーになりました」 | 「{n} 件の tool がエラーになりました」 |
| Hook / task の行が終わり | 「Hook が{状態の文言}」/「Background task が{状態の文言}」(状態の文言は O-2 の `labels.ts`) | 種類が混ざれば「{n} 件の知らせがあります」 |
| 圧縮・会話の作り直し・拒否・止まった知らせ | 下の文言の表の見出し | 同上 |

### 文言

| キー | 文言 |
|---|---|
| 圧縮の境界 | ここでコンテキストを圧縮しました ({手動 / 自動}、{pre} → {post} トークン) / 過去ログと数の無いときは括弧を省く |
| 会話の作り直し | ここから新しい会話です (SDK は /clear・plan モードの終了・新しいセッションで出す。「これより上がコンテキストに無い」とは断定しない) |
| 拒否 (fallback) | モデルが応答を拒否したため {model} に切り替えました ({scope が local なら「この応答だけ」}) / 分類: {category の訳} |
| 拒否 (no fallback) | モデルが応答を拒否しました。言い直して送り直せます / 分類: {category の訳} |
| 拒否の分類の訳 | `cyber` → サイバーセキュリティ、`bio` → 生物・化学。知らない値は出さない |
| 知らせ | 知らせ (Claude Code の状態の行・Hook・コマンドの出力を見分けない) / ここで止まりました |
| 結果の状態 | 結果待ち / 結果不明 / 結果は別に表示 / text でない結果か、空の結果です / エラー / 取り消されました |
| ToolFallback の見出し | {tool 名} を実行 |
| `output_mode` の訳 | `files_with_matches` → ファイル名、`content` → 一致した行、`count` → 件数。知らない値は出さない |
| tool の見出し | タスクを追加 / タスクを更新 / タスクを確認 / タスクの一覧 / タスク #{id} / 追加した時点: 未着手 / 未着手 / 進行中 / 完了 / 削除 / 不明 / ほか {n} 件 / {n} 件のファイル / URL / 原文 / 表示されない部分があります。原文で確かめてください |

## §5 対応表の書き換え先 (正本。完了の PR で)

| 節 | 行 | 書き換え先 |
|---|---|---|
| A | `compact_boundary` (Tier A) | `実装済み: TranscriptBoundary (両方)`。経路 `両方` |
| A | `model_refusal_fallback` / `model_refusal_no_fallback` (Tier A) | `実装済み: SystemEventRow (実行中)`。経路 `実行中`。備考に「過去ログは記録に残れば伏せ字つきの system の本文 (行は O-11)」 |
| A | `informational` (Tier A) | `実装済み: SystemEventRow (実行中)`。経路 `実行中`。備考に同上 |
| A | `conversation_reset` (Tier A) | `実装済み: TranscriptBoundary (実行中)`。経路 `実行中` |
| A | `local_command_output` / `notification` / `files_persisted` / `tool_use_summary` / `memory_recall` / `prompt_suggestion` / `mirror_error` / `background_tasks_changed` | `後続: O-11` (`background_tasks_changed` の備考の「O-6」も O-11 に。`local_command_output` の備考に「過去ログは伏せ字つきの system の本文」) |
| A' | `active_goal` | `後続: O-11` |
| A | `hook_started` / `task_started` の備考の「O-6」 | 「O-11 (D 節)」に |
| B | 節の冒頭の「照合は O-6」 | 「照合は O-11」に |
| B | `server_tool_use` / `web_search_tool_result` / `user/document` | `後続: O-11` |
| B | `user/tool_result` の備考の「結果待ち・結果不明の印と読み上げは O-6」 | 「実装済み (O-6)」に |
| C | `Read` / `Glob` / `Grep` (Tier A) | `実装済み: FileTool (両方)` |
| C | `WebFetch` / `WebSearch` (Tier A) | `実装済み: WebTool (両方)` |
| C | `TaskCreate` / `TaskGet` / `TaskUpdate` / `TaskList` (Tier A) | `実装済み: TaskTool (両方)` |
| C | `Agent` の備考の「実行中の入れ子と getSubagentMessages は O-6」 | 「O-11 (D 節)」に。`ExitPlanMode` の備考の「markdown は O-6」は「実装済み (O-6)」に |
| D | 節の説明 | 「SDK のメッセージではなく、アプリが…作る表示」に「と、A 節の行の一部の機能の表示の経路 (Tier A の残りを M3 の件数に数えるための行)」を足す (AD-044 D4 の読み替え。AD-049) |
| D | (新しい行) `general-hooks` (判別子 `includeHookEvents` の Hook の行) / `late-backgrounded-task` (判別子 `task_started` の後から背景に移った task) / `subagent-nesting-live` (判別子 `parent_tool_use_id` の実行中の入れ子) | Tier A・`後続: O-11`・経路 `なし`。備考に「O-2 pr-gate M-201。O-6 で D 節に立てた」 |
| E | `rewind_files` / `stop_task` / `background_tasks` | `表示不要: アプリは task・チェックポイントを操作しない (AD-036 §4 P3 / AD-048 / AD-049)` |
| E | `get_hooks_listing` | `後続: O-11` (備考に「呼ぶなら AD-036 §4 P3 の読み替えの ADR」) |
| F | Checkpoints / Document reference / File / Background runs / Task card / Agent handoff / Follow-up suggestions / Memory | 備考の「O-6」を「O-11」に (Checkpoints は表示だけで巻き戻しはしない) |
| F | File tree / Tool call / Web search | 使い道を本 feature の表示に (File tree は写して変えた) |
| F | Todo list | 使い道に `TaskCreate` / `TaskUpdate` を足す |
| F | Inline citation | **Tier A のまま** `未使用`。備考 `WebSearch の結果の文からリンクを推測しない (O-6 U-5)。結果のブロック (web_search_tool_result) を扱う O-11 で判断し直す` (AD-019 D1・D2 を変えない。design-gate R2 H-03) |
| F | Sources | `未使用`。備考 同上 |

- M3 の完了の条件の残り: O-6 の Tier A 14 行が消え、D 節の O-11 の 3 行が加わる (U-1)
