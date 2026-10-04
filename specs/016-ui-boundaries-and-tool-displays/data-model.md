# Data Model: 会話の境界と tool の専用表示の第 2 弾 (O-6)

各規則の正本は本ファイルの節。SDK の型は `@anthropic-ai/claude-agent-sdk` 0.3.270 (`SDKCompactBoundaryMessage` `sdk.d.ts:3457`、assistant の `supersedes` :3370、`SDKConversationResetMessage` :4749、`SDKInformationalMessage` :4855、`SDKModelRefusalFallbackMessage` :5022、`SDKModelRefusalNoFallbackMessage` :5059、`sdk-tools.d.ts` の `FileReadInput` :812・`GlobInput` :840・`GrepInput` :850・`WebFetchInput` :1034・`WebSearchInput` :1044・`TaskCreateInput` :2724・`TaskGetInput` :2744・`TaskUpdateInput` :2750・`TaskListInput` :2790)。

## §1 会話の境界と知らせの行 (O-2 の `system-event` の category。O-4 data-model §3 の作り方)

category と status の列挙の正本は `transcript-dto.ts` (`SYSTEM_EVENT_CATEGORIES` / `SYSTEM_EVENT_STATUSES`)、終わりの判定は `system-event.ts` (`isTerminalSystemEventStatus`)。本 feature の status はすべて 1 回の出来事で、終わりを表す。

| category | 行の id | opens | 読むフィールド | 読まないフィールド | `name` | `detail` | `status` |
|---|---|---|---|---|---|---|---|
| `compact-boundary` | `compact-boundary:<uuid>` | true | `compact_metadata.trigger`・`pre_tokens`・`post_tokens` | `preserved_segment`・`preserved_messages`・`duration_ms` | '' | `<trigger> <pre> <post>` | `marked` |
| `conversation-reset` | `reset:<uuid>` | true | (なし) | `new_conversation_id` | '' | '' | `marked` |
| `refusal` (fallback) | `refusal:<uuid>` | true | `direction`・`scope`・`fallback_model`・`api_refusal_category` | `api_refusal_explanation`・`request_id`・`refused_user_message_uuid`・`original_model` (`retracted_message_uuids` は行に入れず取り消しに使う) | fallback のモデル (O-4 の `modelId` の形の検査。外れたら '') | `<direction> <scope> <category>` | `fallback` |
| `refusal` (no fallback) | `refusal:<uuid>` | true | `content`・`api_refusal_category` | `api_refusal_explanation`・`original_model`・`request_id`・`refused_user_message_uuid` | category (形の検査を通ったときだけ。外れたら '') | `content` を下の本文の規則で | `no-fallback` |
| `informational` | `info:<tool_use_id>` (形の検査を通れば) / `info:<uuid>` | true | `content`・`level`・`prevent_continuation`・`tool_use_id` | — | '' | `content` を下の本文の規則で | `prevented` (`prevent_continuation`) / `warning` (`level` が `warning` / `suggestion`) / `notice` (`info` / `notice`) |

- **値の照合** (agents。`Object.hasOwn` の表で引き、外れたら `-` にする): `trigger` ∈ {`manual`, `auto`}、`direction` ∈ {`retry`, `revert`, `sticky`}、`scope` ∈ {`session`, `local`} (無ければ `session`。SDK の定義どおり)、`level` ∈ {`info`, `notice`, `suggestion`, `warning`}、category は `^[a-z_-]{1,32}$`、トークン数は 0 以上の安全な整数。`detail` の各トークンはこの照合を通った値か `-` だけなので、renderer は空白で区切って読み戻してよい
- **行の id の素材**: `uuid` と `tool_use_id` は `^[A-Za-z0-9_-]{1,128}$` (O-4 data-model §2 の `toolUseId` と同じ)。`uuid` が外れたら行を作らない
- **同じ `tool_use_id` の `informational`** は O-2 の合成で後の値に書き換える (空の本文は前の本文を残す。本文の規則は部分を伏せるだけで本文を丸ごと消さないので、残るのは前の正当な本文)
- **`detail` の上限**は O-2 data-model §2 の 120 コードポイントのまま (O-2 の契約を変えない)。行の見た目は `detail` を折り返して全文を出す (今の `truncate` を本 feature の category では外す)
- **過去ログの圧縮**: `transcript.ts:207` の `{ type: 'divider', label: 'コンテキストを圧縮' }` はそのまま (DTO を変えない)。renderer が divider を Compaction boundary の表示に写す (数は出さない)。**divider を作るのは圧縮だけ** (domain の生成箇所が 1 つであることをテストで固定する)。subagent の入れ子の中の divider は今のまま (O-11)

### 本文の規則 (U-3。`informational` と no fallback の拒否の `content`)

1. O-2 の無害化 (`sanitizeBody`)
2. **伏せ字** (`redactSecrets`。`src/domain/session/secret-redaction.ts` に新設する純関数。import を持たない): 次に当たる部分を `•••` に置き換える。行全体は消さない
   - URL の userinfo: `<scheme>://<userinfo>@` の `<userinfo>`
   - `Bearer` / `Basic` の後のトークン、`Authorization:` の値
   - 名前が秘密を表す代入の値: `token`・`secret`・`password`・`passwd`・`pwd`・`api_key` / `api-key` / `apikey`・`access_key`・`client_secret` の後の `:` / `=` の値 (大文字小文字を区別しない)
   - クエリの秘密: `access_token=`・`token=`・`key=`・`sig=`・`signature=`・`password=` の値
   - 既知の形: JWT (`eyJ…​.…`)、`AKIA` / `ASIA` + 16 文字、`sk-`・`ghp_`・`gho_`・`ghu_`・`ghs_`・`github_pat_`・`glpat-`・`xoxa-` / `xoxb-` / `xoxp-` / `xoxr-` / `xoxs-`・`AIza` で始まるトークン
   - 空白の後の `-p<値>` (コマンドのパスワードの引数)
3. 1 行に正規化 (連続する空白・改行を 1 つの空白に)
4. O-2 の切り詰め (120 コードポイント)。伏せ字は切り詰めの前に当てる (切り詰めでトークンが割れて伏せ字を逃れないため)

- `mayCarrySecret` (コマンドの文字列向けの判定) は本文に使わない
- 伏せ字の前の本文を agents のログに書かない (Principle V)

### 取り消し (U-2)

- **合図は 2 つ**: (a) 実行中の assistant メッセージの `supersedes` (届いた時点。代わりのメッセージを送る前に送る)、(b) `model_refusal_fallback` の `retracted_message_uuids` (ターンの終わり。SDK の監査の記録)。どちらも冪等
- **運び方**: O-4 の `meter` に種類 `retraction` (`{ type: 'retraction'; messageIds: readonly string[] }`) を足す。`messageIds` は `^[A-Za-z0-9_-]{1,128}$` のものだけ、1 件の `meter` に 1〜128 件。128 件を超えたら分けて全部送る
- **O-4 の上限と間引きに掛けない** (1 回限りの指示で、最新の値で置き換えられないため。O-5 の `init-report` / `commands` と同じ)。保留しないので `finish()` で捨てられない。renderer は `meters` に最新の値として持たず、届いた順に全部当てる
- **戻らない仕組み**:
  - agents: tool の結果の追跡 (`live-tool-results.ts`) に `retract(messageIds)` を足す。該当のメッセージを忘れ、その結果待ちの `toolUseId` を上限つき (512) で覚え、後から届いた結果を送り直しにも結果だけのメッセージにもせず捨てる。取り消した id の `message` を後から送らない (上限つき 512)
  - renderer: 稼働中のストアは同じセッションの `messages` から外し、外した id をセッションごとに上限つき (512) で覚えて、後から同じ id の `message` が届いても足さない。閉じたセッションには書かない。隠れた古いメッセージの件数を直す。表示位置は既存のアンカリングで保つ
  - decoder: `messageIds` が配列でない・0 件・129 件以上なら `meter` ごと捨てる。形の合わない id は 1 件ずつ捨てる
- **行の件数**: 拒否の行は取り消しの件数を出さない (SDK の列は tool_result の id も含み、外したメッセージの数と一致しないため)
- **観測**: agents の開発用ログに、指示の件数と形の検査で落とした件数を数だけ残す。roadmap の O-3 (O-8) の義務 (c) の `receivedMessages` は、本 feature の行を数え、`retraction` を数えない
- O-4 data-model §2 の値の検証の表に `messageIds` の行を足す (AD-047 D2 の読み替え。AD-049)

### 見た目

| category | 見た目 |
|---|---|
| `compact-boundary` / `conversation-reset` | 横いっぱいの区切り (Compaction boundary の element)。文言は §4 |
| `refusal` | 注意の行 |
| `informational` | `prevented` / `warning` は注意の行、`notice` は控えめの行 |

- O-4 の `compaction` の行 (進み具合: 圧縮中 → 完了 / 失敗) と圧縮の境界は並べて描く。行が先、境界が後 (research R-07)

## §2 tool の専用表示

| tool | 見出し (1 行・80 コードポイントで切り詰め) | 中身 (既定で畳む) |
|---|---|---|
| `Read` | パスの末尾と範囲 (`offset`〜`offset+limit` の行、`pages`) | 全体のパス (本文)、結果 (行番号つきの text をそのままコードとして) |
| `Glob` | `pattern` と `path` の末尾 (あれば) | 結果を File tree (下の作り方) |
| `Grep` | `pattern`・`glob`・`path` の末尾・`output_mode` | `files_with_matches` (既定) は File tree、それ以外は text |
| `WebFetch` | URL の要約 (O-5 data-model §1 の URI の要約の関数を共有: http(s) のときだけ host と最後のパスの要素。読めない・http(s) でない・256 コードポイント超は「URL」)。リンクにしない | 全体の URL (伏せ字を通す)、`prompt`、結果の text |
| `WebSearch` | `query` と `allowed_domains` / `blocked_domains` の件数 | 結果の text |
| `TaskCreate` | 「タスクを追加」と `subject` | TodoList の 1 項目 (`subject`・`activeForm`・「追加した時点: 未着手」) |
| `TaskUpdate` | 「タスクを更新」と `subject` (無ければ「タスク #{taskId}」) | TodoList の 1 項目 (状態は下の対応) |
| `TaskGet` / `TaskList` | 「タスクを確認 #{taskId}」/「タスクの一覧」 | 結果の text |

- **パス**: tool の入力と結果のパスは会話由来の本文 (AD-034) で、アプリのパスの値ではない (R-2 FR-042・AD-029・AD-032 の対象外)。UNC を判定も除去もしない。`path-api` を import しない。renderer に UNC の綴りを書かない (項目 12)
- **パスの末尾**: O-2 data-model §4 のファイル名の規則 (`session-view.ts` の `pathTail`。`/` と `\` の両方で切る) を共通の純関数にして使う。表示だけで、ホスト OS やランタイムで切り方を変えない。切った値を IPC・port に戻さない
- **File tree の作り方** (結果の text から):
  1. 改行で分け、前後の空白を除き、空の行を捨てる
  2. `/` か `\` を含み `(` で始まらない行を項目、それ以外 (件数の見出し・打ち切りの注記・「一致なし」の文など) を注記にする
  3. 項目が 0 件なら、結果の text をそのまま text で出す (File tree を出さない)
  4. 項目は平らな配列 (depth 0。階層を組まない。パスの要素をキーにしたオブジェクトを作らない)。React の key は添字。1 行は 1,024 コードポイントで切り詰め、200 件まで出して「ほか {n} 件」
  5. 注記は File tree の上に、届いた順の text で出す
- `pattern` / `glob` は文字列として出すだけで、正規表現に組まない
- **結果の負のケース**: エラーは既存のエラーの印と本文 (O-2 FR-007)。結果が空 (text でないブロックだけの `Read` を含む) は「text でない結果か、空の結果です」
- **状態の対応** (`Object.hasOwn` の表で引く): `pending` → 未着手、`in_progress` → 進行中、`completed` → 完了、`deleted` → 削除、知らない値 → 不明
- 入力の文字列は既存の tool の表示と同じく O-2 の無害化を通った値
- 振り分けは `tool-registry.aui.tsx` の表 (`Object.hasOwn` の照合。O-5 data-model §1) に足す
- **Agent plan** (U-4): `agent-plan.aui.tsx` で plan の文字列を `TextMessagePartProvider` (`@assistant-ui/react`。`text` / `isRunning={false}`) で包み、既存の `MarkdownText` をそのまま描く。新しい markdown の描画口を作らない (`@assistant-ui/react-markdown` の import は `markdown-text.tsx` だけ。固定テスト)。「原文」の切り替えで今の plain text (`whitespace-pre-wrap`) を出す (markdown で描かれない生 HTML・コメントも原文では見える)。入力が読めないときは今どおり ToolFallback

## §3 tool の結果の状態 (renderer の純関数 `toolResultState(part, ctx)`)

`ctx` は `{ live: 実行中のセッションか, runState: SessionRunState, latestTurn: part が最新のターン (セッションの最後の利用者のメッセージより後) のメッセージにあるか }`。thread の context で O-2 の `TranscriptSettledContext` と並べて渡す。

| 条件 (上から) | 状態 | 印 |
|---|---|---|
| `result` がある | 結果あり | なし (エラー・切り詰めの印は既存) |
| `live` かつ `latestTurn` かつ `runState` が `running` | 結果待ち | 「結果待ち」(動く印。`aria-busy`) |
| `live` かつ `latestTurn` かつ `runState` が `awaiting_permission` | 結果待ち | 「結果待ち」(動かない。どの tool の承認かは承認カードが示す) |
| それ以外 (応答が終わった・中断した・終了・失敗・過去ログ・前のターン) | 結果不明 | 「結果不明」 |

- 承認の要求を tool ごとに見分けない (`PermissionRequest` に `toolUseId` が無く、足すと session の契約が変わるため。U-6)
- 並列の tool の結果が 1 つずつ届くか、まとめて届くか (V-4 未記録) に依らない (tool の part ごとに判定する)
- **印を出す表示** (すべて): TerminalBlock (`Bash`)・CodeDiff (`Edit` / `Write` / `MultiEdit`)・TodoList (`TodoWrite`)・Subagent (`Agent` / `Task`)・AgentPlan (`ExitPlanMode`) (R-4)、McpToolCall・AskUserQuestion (O-5)、FileTool・WebTool・TaskTool (本 feature)、ToolFallback

## §4 読み上げと文言 (正本。`labels.ts`)

### 読み上げ (`TranscriptAnnouncer`。見ているセッション (O-7 の `watchedId`) の thread の中に 1 つ)

- **きっかけ**: 描画した後に新しく届いた出来事だけ。最初の描画・セッションの切り替え・過去ログ・「さらに表示」で現れたものは読まない (その時点の id の集合を基準にし、差分だけを読む)
- **読むもの**: tool の結果のエラー、圧縮・会話の作り直し・拒否の行、`prevented` の知らせ
- **読まないもの**: セッションの終わりで一斉に結果不明になった tool (失敗は `SessionScreen` の `role="alert"` が伝える)、承認 (`ApprovalCard` の `alertdialog`)、見ていないセッション (`SessionAttentionAnnouncer`)
- **中身**: 固定の文言・既知の列挙・件数だけ。tool 名は登録済みの名前か `^[A-Za-z0-9_-]{1,64}$` に合うときだけ出し、それ以外は「tool」。`content`・説明・`prompt`・パスを入れない
- `aria-live="polite"`、1 秒に 1 回までにまとめる

| きっかけ | 文言 (1 件) | 同じ 1 秒に複数 |
|---|---|---|
| tool の結果がエラー | 「{tool 名} がエラーになりました」 | 「{n} 件の tool がエラーになりました」 |
| 圧縮・会話の作り直し・拒否・止まった知らせ | 下の文言の表の見出し | 種類が混ざれば「{n} 件の知らせがあります」 |

### 文言

| キー | 文言 |
|---|---|
| 圧縮の境界 | ここでコンテキストを圧縮しました ({手動 / 自動}、{pre} → {post} トークン) / 過去ログと数の無いときは括弧を省く |
| 会話の作り直し | ここから新しい会話です。これより上の内容は Claude のコンテキストにありません |
| 拒否 (fallback) | モデルが応答を拒否したため {model} に切り替えました ({scope が local なら「この応答だけ」}) / 分類: {category} |
| 拒否 (no fallback) | モデルが応答を拒否しました。言い直して送り直せます / 分類: {category} |
| 知らせ | Hook・コマンドからの知らせ / ここで止まりました |
| 結果の状態 | 結果待ち / 結果不明 / text でない結果か、空の結果です |
| ToolFallback の見出し | {tool 名} を実行 |
| tool の見出し | タスクを追加 / タスクを更新 / タスクを確認 / タスクの一覧 / タスク #{id} / 追加した時点: 未着手 / 未着手 / 進行中 / 完了 / 削除 / 不明 / ほか {n} 件 / URL / 原文 |

## §5 対応表の書き換え先 (正本。完了の PR で)

| 節 | 行 | 書き換え先 |
|---|---|---|
| A | `compact_boundary` (Tier A) | `実装済み: CompactionBoundary (両方)` |
| A | `model_refusal_fallback` / `model_refusal_no_fallback` (Tier A) | `実装済み: SystemEventRow (実行中)` |
| A | `informational` (Tier A) | `実装済み: SystemEventRow (実行中)`。備考に「過去ログに残るかは O-6 V-3 で記録し、O-11 で変換する」 |
| A | `conversation_reset` (Tier A) | `実装済み: CompactionBoundary (実行中)` |
| A | `local_command_output` / `notification` / `files_persisted` / `tool_use_summary` / `memory_recall` / `prompt_suggestion` / `mirror_error` / `background_tasks_changed` | `後続: O-11` (`background_tasks_changed` の備考の「O-6」も O-11 に) |
| A' | `active_goal` | `後続: O-11` |
| A | `hook_started` / `task_started` の備考の「O-6」 | 「O-11 (D 節)」に |
| B | 節の冒頭の「照合は O-6」 | 「照合は O-11」に |
| B | `server_tool_use` / `web_search_tool_result` / `user/document` | `後続: O-11` |
| B | `user/tool_result` の備考の「結果待ち・結果不明の印と読み上げは O-6」 | 「実装済み (O-6)」に |
| C | `Read` / `Glob` / `Grep` (Tier A) | `実装済み: FileTool (両方)` |
| C | `WebFetch` / `WebSearch` (Tier A) | `実装済み: WebTool (両方)` |
| C | `TaskCreate` / `TaskGet` / `TaskUpdate` / `TaskList` (Tier A) | `実装済み: TaskTool (両方)` |
| C | `Agent` の備考の「実行中の入れ子と getSubagentMessages は O-6」 | 「O-11 (D 節)」に。`ExitPlanMode` の備考の「markdown は O-6」は「実装済み (O-6)」に |
| D | (新しい行) `general-hooks` (`includeHookEvents` の Hook の行) / `late-backgrounded-task` (後から背景に移った task の行) / `subagent-nesting-live` (実行中の subagent の入れ子) | Tier A・`後続: O-11`・経路 `なし`。備考に「O-2 pr-gate M-201。O-6 で D 節に立てた」 |
| E | `rewind_files` / `stop_task` / `background_tasks` | `表示不要: アプリは task・チェックポイントを操作しない (AD-036 §4 P3 / AD-048 / AD-049)` |
| E | `get_hooks_listing` | `後続: O-11` (備考に「呼ぶなら AD-036 §4 P3 の読み替えの ADR」) |
| F | Checkpoints / Document reference / File / Background runs / Task card / Agent handoff | 備考の「O-6」を「O-11」に (Checkpoints は表示だけで巻き戻しはしない) |
| F | File tree / Tool call / Web search | 使い道を本 feature の表示に |
| F | Todo list | 使い道に `TaskCreate` / `TaskUpdate` を足す |
| F | Inline citation | Tier B・`未使用`。備考 `WebSearch の結果からリンクを推測しない (O-6 U-5)` |
| F | Sources | `未使用`。備考 同上 |

- M3 の完了の条件の残り: O-6 の Tier A 14 行が消え、D 節の O-11 の 3 行が加わる (U-1)
